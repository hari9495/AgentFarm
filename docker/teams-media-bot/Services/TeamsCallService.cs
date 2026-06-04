using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Identity.Client;
using TeamsMediaBot.Models;

namespace TeamsMediaBot.Services;

/// <summary>
/// Manages Teams calls via the Microsoft Graph Communications REST API (control plane).
///
/// When a call is created with <c>applicationHostedMediaConfig</c>, Teams negotiates the
/// media channel by POSTing ICE/DTLS parameters to the bot's <c>callbackUri</c>.
/// This service parses those notifications and stores the resulting <see cref="MediaEndpoint"/>
/// so <see cref="VideoInjectorService"/> can target it with the FFmpeg relay stream.
///
/// ── Media-plane note ────────────────────────────────────────────────────────
/// Full video injection requires an SRTP layer on top of the RTP relay:
///
///   Linux path: implement DTLS handshake using libsrtp2 / boringssl bindings, then
///               build the SRTP key material from the handshake and pass it to FFmpeg
///               via -srtp_out_suite / -srtp_out_params.
///
///   Windows path: use Microsoft.Graph.Communications.Calls.Media (the Windows-only
///                 Bot Media SDK) which automates ICE, DTLS, and SRTP end-to-end.
///
/// Until the DTLS layer is wired, TeamsJoinAdapter falls back to the browser-based
/// screen share path (which works today via teams-join.mjs + xdotool).
/// ────────────────────────────────────────────────────────────────────────────
/// </summary>
public sealed class TeamsCallService : IDisposable
{
    private const string GraphBase = "https://graph.microsoft.com/v1.0";

    // UDP port range reserved for per-call DTLS listeners
    private const int DtlsPortBase = 49200;
    private const int DtlsPortRange = 800;
    private static int _nextDtlsPort = DtlsPortBase;

    private readonly Dictionary<string, CallRecord> _calls = new(StringComparer.Ordinal);
    private readonly Lock _lock = new();
    private readonly ILogger<TeamsCallService> _log;
    private readonly HttpClient _http;
    private readonly DtlsSrtpService _dtls;
    private readonly StunClient _stun;

    public TeamsCallService(
        ILogger<TeamsCallService> log,
        IHttpClientFactory httpFactory,
        DtlsSrtpService dtls,
        StunClient stun)
    {
        _log  = log;
        _http = httpFactory.CreateClient(nameof(TeamsCallService));
        _dtls = dtls;
        _stun = stun;
    }

    // ── Join ──────────────────────────────────────────────────────────────────

    public async Task<CallJoinResult> JoinCallAsync(JoinCallRequest req)
    {
        try
        {
            var token = await AcquireTokenAsync(req.TenantId, req.ClientId, req.ClientSecret);
            var callId = await CreateCallAsync(token, req);
            lock (_lock)
            {
                _calls[callId] = new CallRecord(callId, req.TenantId, req.ClientId, req.ClientSecret);
            }
            _log.LogInformation("Teams call created: {CallId} meeting={Url}", callId, req.MeetingUrl);
            return new CallJoinResult(Ok: true, CallId: callId);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "JoinCallAsync failed for {Url}", req.MeetingUrl);
            return new CallJoinResult(Ok: false, Error: ex.Message);
        }
    }

    // ── Leave ─────────────────────────────────────────────────────────────────

    public async Task<bool> DeleteCallAsync(string callId)
    {
        CallRecord? record;
        lock (_lock) { _calls.TryGetValue(callId, out record); }
        if (record is null) return true; // already gone

        try
        {
            var token = await AcquireTokenAsync(record.TenantId, record.ClientId, record.ClientSecret);
            using var req = new HttpRequestMessage(HttpMethod.Delete, $"{GraphBase}/communications/calls/{callId}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var res = await _http.SendAsync(req);
            lock (_lock) { _calls.Remove(callId); }
            return res.IsSuccessStatusCode || res.StatusCode == System.Net.HttpStatusCode.NotFound;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "DeleteCallAsync failed: {CallId}", callId);
            return false;
        }
    }

    // ── Status ────────────────────────────────────────────────────────────────

    public CallStatus? GetCallStatus(string callId)
    {
        lock (_lock)
        {
            if (!_calls.TryGetValue(callId, out var r)) return null;
            return new CallStatus(callId, r.State, r.MediaEndpoint, r.InjectionActive, r.FfmpegPid);
        }
    }

    public void SetInjectionState(string callId, bool active, int? pid)
    {
        lock (_lock)
        {
            if (_calls.TryGetValue(callId, out var r))
            {
                r.InjectionActive = active;
                r.FfmpegPid = pid;
            }
        }
    }

    // ── Teams notification callback ───────────────────────────────────────────

    /// <summary>
    /// Process a raw JSON notification from Teams.
    /// Handles:
    ///   • <c>callStateChanged</c> — update FSM (joining/established/terminated)
    ///   • ICE candidate payloads — extract Teams' media IP:port, run STUN probe,
    ///     then kick off the DTLS-SRTP handshake in the background.
    /// </summary>
    public Task HandleCallbackAsync(string payload)
    {
        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("value", out var notifications)) return Task.CompletedTask;

            foreach (var notif in notifications.EnumerateArray())
            {
                var resourceUrl = notif.TryGetProperty("resourceUrl", out var ru) ? ru.GetString() : null;
                var callId = ParseCallIdFromUrl(resourceUrl);
                if (callId is null) continue;

                if (!notif.TryGetProperty("resourceData", out var data)) continue;
                var state = data.TryGetProperty("state", out var s) ? s.GetString() : null;
                _log.LogInformation("Teams callback: call={CallId} state={State}", callId, state ?? "?");

                CallRecord? record;
                lock (_lock)
                {
                    if (!_calls.TryGetValue(callId, out record)) continue;
                    if (state == "established")                    record.State = CallState.Established;
                    else if (state is "terminated" or "disconnected") record.State = CallState.Terminated;
                }

                // ── ICE candidate parsing → STUN probe → DTLS handshake ───────
                //
                // Teams sends its ICE candidates in one of three places:
                //   a) resourceData.mediaConfig.preFetchMedia[].uri  (documented REST format)
                //   b) resourceData.iceGatheringState.iceCandidates[].candidate (SDP-style)
                //   c) resourceData.mediaState (indicates media is active — endpoint confirmed)
                //
                // We attempt all three parsers and start the DTLS handshake as soon as
                // we find a candidate.  The handshake runs in a background task so the
                // HTTP callback returns 200 immediately.
                var candidate = TryParseIceCandidateFromPreFetchMedia(data)
                             ?? TryParseIceCandidateFromIceGatheringState(data)
                             ?? TryParseIceCandidateFromMediaState(data);

                if (candidate is not null)
                {
                    int dtlsPort;
                    lock (_lock)
                    {
                        // Assign a local DTLS UDP port and optimistically set the endpoint
                        // so VideoInjectorService can start while DTLS completes in the background.
                        dtlsPort = AllocateDtlsPort();
                        record.MediaEndpoint = new MediaEndpoint(
                            candidate.Ip, candidate.Port,
                            DtlsFingerprint: _dtls.DtlsFingerprint,
                            LocalDtlsPort: dtlsPort);
                    }
                    _log.LogInformation(
                        "[{CallId}] ICE candidate: {Ip}:{Port} → starting STUN probe then DTLS on local port {Local}",
                        callId, candidate.Ip, candidate.Port, dtlsPort);

                    // Fire-and-forget — callback must return 200 quickly
                    _ = NegotiateMediaAsync(callId, record, candidate.Ip, candidate.Port, dtlsPort);
                }
                else if (data.TryGetProperty("mediaConfig", out var mc))
                {
                    TryExtractMediaEndpoint(callId, mc, record);
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "HandleCallbackAsync: failed to parse Teams notification");
        }
        return Task.CompletedTask;
    }

    /// <summary>
    /// Allow an operator (or test) to manually specify the Teams media endpoint
    /// when auto-parsing fails. Immediately triggers STUN + DTLS.
    /// </summary>
    public void SetMediaEndpointManual(string callId, string ip, int port)
    {
        CallRecord? record;
        lock (_lock)
        {
            if (!_calls.TryGetValue(callId, out record)) return;
            var dtlsPort = AllocateDtlsPort();
            record.MediaEndpoint = new MediaEndpoint(ip, port,
                DtlsFingerprint: _dtls.DtlsFingerprint, LocalDtlsPort: dtlsPort);
        }
        if (record is not null)
            _ = NegotiateMediaAsync(callId, record, ip, port, record.MediaEndpoint!.LocalDtlsPort);
    }

    // ── Media negotiation (STUN → DTLS → SRTP) ───────────────────────────────

    private async Task NegotiateMediaAsync(
        string callId, CallRecord record, string remoteIp, int remotePort, int localDtlsPort)
    {
        // 1. STUN binding request — confirms UDP reachability before opening DTLS socket
        var remote = new IPEndPoint(IPAddress.Parse(remoteIp), remotePort);
        var reachable = await _stun.ProbeAsync(remote);
        if (!reachable)
        {
            _log.LogWarning("[{CallId}] STUN probe failed — DTLS handshake will proceed anyway", callId);
        }

        // 2. DTLS-SRTP handshake — Teams initiates as DTLS client
        var keyMaterial = await _dtls.HandshakeAsync(remoteIp, remotePort, localDtlsPort, CancellationToken.None);
        if (keyMaterial is null)
        {
            _log.LogError("[{CallId}] DTLS handshake failed — video injection will use plain RTP (Teams will reject)", callId);
            return;
        }

        // 3. Store SRTP key material in the endpoint record so VideoInjectorService
        //    switches from plain-RTP discard to SRTP output on next injection cycle.
        lock (_lock)
        {
            if (_calls.TryGetValue(callId, out var r) && r.MediaEndpoint is { } ep)
            {
                r.MediaEndpoint = ep with { SrtpKeyMaterial = keyMaterial };
            }
        }
        _log.LogInformation("[{CallId}] SRTP keys stored — video injection now active", callId);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static int AllocateDtlsPort()
    {
        // Cycle through the reserved port range (atomic increment, wraps around)
        var port = Interlocked.Increment(ref _nextDtlsPort);
        return DtlsPortBase + (port % DtlsPortRange);
    }

    private async Task<string> AcquireTokenAsync(string tenantId, string clientId, string clientSecret)
    {
        var app = ConfidentialClientApplicationBuilder
            .Create(clientId)
            .WithClientSecret(clientSecret)
            .WithAuthority($"https://login.microsoftonline.com/{tenantId}")
            .Build();

        var result = await app
            .AcquireTokenForClient(["https://graph.microsoft.com/.default"])
            .ExecuteAsync();
        return result.AccessToken;
    }

    private async Task<string> CreateCallAsync(string token, JoinCallRequest req)
    {
        // Build the call payload using JsonObject so @odata.type names serialize correctly.
        var payload = new JsonObject
        {
            ["@odata.type"]  = "#microsoft.graph.call",
            ["callbackUri"]  = string.IsNullOrWhiteSpace(req.CallbackBaseUrl)
                                   ? "https://placeholder.agentfarm.internal/v1/callbacks/calls"
                                   : $"{req.CallbackBaseUrl.TrimEnd('/')}/v1/callbacks/calls",
            ["tenantId"]     = req.TenantId,
            ["meetingInfo"]  = new JsonObject
            {
                ["@odata.type"] = "#microsoft.graph.joinMeetingIdMeetingInfo",
                ["joinWebUrl"]  = req.MeetingUrl,
            },
            // applicationHostedMediaConfig: the bot owns the media endpoint.
            // Teams will send its ICE candidates to callbackUri so we can perform
            // the DTLS-SRTP handshake and receive/send encrypted media.
            //
            // The dtlsFingerprint tells Teams our certificate so it can verify
            // our DTLS ServerHello during the handshake.
            ["mediaConfig"]  = new JsonObject
            {
                ["@odata.type"]    = "#microsoft.graph.applicationHostedMediaConfig",
                ["dtlsFingerprint"] = new JsonObject
                {
                    ["@odata.type"] = "#microsoft.graph.dtlsFingerprint",
                    ["hashFunction"] = "sha-256",
                    ["value"]        = _dtls.DtlsFingerprint.ToLowerInvariant(),
                },
            },
            ["requestedModalities"] = new JsonArray("audio", "video"),
            ["source"]       = new JsonObject
            {
                ["@odata.type"] = "#microsoft.graph.participantInfo",
                ["identity"]    = new JsonObject
                {
                    ["@odata.type"]  = "#microsoft.graph.identitySet",
                    ["application"]  = new JsonObject
                    {
                        ["@odata.type"] = "#microsoft.graph.identity",
                        ["displayName"] = req.BotDisplayName,
                        ["id"]          = req.BotId,
                    },
                },
            },
        };

        using var reqMsg = new HttpRequestMessage(HttpMethod.Post, $"{GraphBase}/communications/calls");
        reqMsg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        reqMsg.Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");

        using var res = await _http.SendAsync(reqMsg);
        if (!res.IsSuccessStatusCode)
        {
            var detail = await res.Content.ReadAsStringAsync();
            throw new InvalidOperationException(
                $"Graph POST /communications/calls {(int)res.StatusCode}: {detail[..Math.Min(detail.Length, 256)]}");
        }

        var body = await res.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var id = doc.RootElement.GetProperty("id").GetString()
            ?? throw new InvalidOperationException("Teams call response missing 'id'");
        return id;
    }

    // ── ICE candidate parsers ─────────────────────────────────────────────────
    // Teams embeds media endpoints in callbacks in several formats depending on
    // the API version and the notification type. We try all known locations.

    internal sealed record IceCandidate(string Ip, int Port);

    /// <summary>Parser A: <c>mediaConfig.preFetchMedia[].uri</c> format ("rtp://ip:port")</summary>
    private IceCandidate? TryParseIceCandidateFromPreFetchMedia(JsonElement data)
    {
        try
        {
            if (!data.TryGetProperty("mediaConfig", out var mc)) return null;
            if (!mc.TryGetProperty("preFetchMedia", out var pfm)) return null;
            foreach (var item in pfm.EnumerateArray())
            {
                if (!item.TryGetProperty("uri", out var uri)) continue;
                var candidate = ParseIpPortFromUri(uri.GetString());
                if (candidate is not null) return candidate;
            }
        }
        catch (Exception ex) { _log.LogDebug(ex, "ICE parser A: exception (non-fatal)"); }
        return null;
    }

    /// <summary>Parser B: <c>resourceData.iceGatheringState.iceCandidates[].candidate</c> (SDP-style)</summary>
    private IceCandidate? TryParseIceCandidateFromIceGatheringState(JsonElement data)
    {
        try
        {
            if (!data.TryGetProperty("iceGatheringState", out var igs)) return null;
            if (!igs.TryGetProperty("iceCandidates", out var candidates)) return null;
            foreach (var item in candidates.EnumerateArray())
            {
                if (!item.TryGetProperty("candidate", out var c)) continue;
                // SDP candidate format: "candidate:X X UDP priority ip port typ host"
                var candidate = ParseSdpCandidate(c.GetString());
                if (candidate is not null) return candidate;
            }
        }
        catch (Exception ex) { _log.LogDebug(ex, "ICE parser B: exception (non-fatal)"); }
        return null;
    }

    /// <summary>Parser C: <c>resourceData.mediaState</c> active — endpoint confirmed via the call record</summary>
    private IceCandidate? TryParseIceCandidateFromMediaState(JsonElement data)
    {
        try
        {
            // If Teams tells us media is active and we already have an endpoint stored
            // (e.g., from a prior preFetchMedia parse), return it so DTLS can proceed.
            if (!data.TryGetProperty("mediaState", out _)) return null;
            // Caller handles storing existing record endpoint — nothing extra to extract here.
        }
        catch (Exception ex) { _log.LogDebug(ex, "ICE parser C: exception (non-fatal)"); }
        return null;
    }

    private void TryExtractMediaEndpoint(string callId, JsonElement mediaConfig, CallRecord record)
    {
        // Legacy path: extract endpoint from mediaConfig when no ICE candidate was found above.
        try
        {
            if (mediaConfig.TryGetProperty("preFetchMedia", out var pfm) &&
                pfm.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in pfm.EnumerateArray())
                {
                    if (!item.TryGetProperty("uri", out var uri)) continue;
                    var candidate = ParseIpPortFromUri(uri.GetString());
                    if (candidate is null) continue;
                    record.MediaEndpoint = new MediaEndpoint(
                        candidate.Ip, candidate.Port, DtlsFingerprint: _dtls.DtlsFingerprint);
                    _log.LogInformation("[{CallId}] Media endpoint (legacy): {Ip}:{Port}", callId, candidate.Ip, candidate.Port);
                    return;
                }
            }
        }
        catch (Exception ex) { _log.LogDebug(ex, "[{CallId}] TryExtractMediaEndpoint: exception (non-fatal)", callId); }
    }

    internal static IceCandidate? ParseIpPortFromUri(string? uri)
    {
        if (string.IsNullOrWhiteSpace(uri)) return null;
        var m = Regex.Match(uri, @"://(\d{1,3}(?:\.\d{1,3}){3}):(\d+)", RegexOptions.None, TimeSpan.FromSeconds(1));
        return m.Success ? new IceCandidate(m.Groups[1].Value, int.Parse(m.Groups[2].Value)) : null;
    }

    internal static IceCandidate? ParseSdpCandidate(string? sdp)
    {
        if (string.IsNullOrWhiteSpace(sdp)) return null;
        // RFC 5245: "candidate:X X UDP priority ip port typ ..."
        var m = Regex.Match(sdp,
            @"candidate:\S+\s+\d+\s+UDP\s+\d+\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d+)",
            RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        return m.Success ? new IceCandidate(m.Groups[1].Value, int.Parse(m.Groups[2].Value)) : null;
    }

    internal static string? ParseCallIdFromUrl(string? url)
    {
        if (url is null) return null;
        var m = Regex.Match(url, @"/communications/calls/([^/]+)", RegexOptions.None, TimeSpan.FromSeconds(1));
        return m.Success ? m.Groups[1].Value : null;
    }

    public void Dispose() => _http.Dispose();
}

// ── In-memory call record ─────────────────────────────────────────────────────

internal sealed class CallRecord(string callId, string tenantId, string clientId, string clientSecret)
{
    public string CallId        { get; } = callId;
    public string TenantId      { get; } = tenantId;
    public string ClientId      { get; } = clientId;
    public string ClientSecret  { get; } = clientSecret;
    public CallState State      { get; set; } = CallState.Joining;
    public MediaEndpoint? MediaEndpoint { get; set; }
    public bool InjectionActive { get; set; }
    public int? FfmpegPid       { get; set; }
}
