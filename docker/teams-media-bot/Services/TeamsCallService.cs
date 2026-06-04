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
    private const string TokenTemplate = "https://login.microsoftonline.com/{0}/oauth2/v2.0/token";

    private readonly Dictionary<string, CallRecord> _calls = new(StringComparer.Ordinal);
    private readonly Lock _lock = new();
    private readonly ILogger<TeamsCallService> _log;
    private readonly HttpClient _http;

    public TeamsCallService(ILogger<TeamsCallService> log, IHttpClientFactory httpFactory)
    {
        _log = log;
        _http = httpFactory.CreateClient(nameof(TeamsCallService));
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
    /// Process a raw JSON payload from Teams (IceGatheringStateChanged, callStateChanged, etc.).
    /// Parses media-negotiation data and stores the resulting <see cref="MediaEndpoint"/>.
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

                lock (_lock)
                {
                    if (!_calls.TryGetValue(callId, out var record)) continue;

                    if (state == "established") record.State = CallState.Established;
                    else if (state == "terminated" || state == "disconnected") record.State = CallState.Terminated;

                    // ── Media endpoint extraction ─────────────────────────────
                    // When Teams sends the IceGatheringStateChanged notification it
                    // provides its ICE candidates (IP/port) and the DTLS fingerprint.
                    //
                    // TODO: implement full ICE/DTLS negotiation here:
                    //   1. Parse Teams ICE candidates from the iceGatheringState payload
                    //   2. Generate our own ICE candidates (STUN binding request)
                    //   3. Perform DTLS handshake using System.Net.Security.SslStream or libsrtp2
                    //   4. Derive SRTP master key and salt from the DTLS handshake
                    //   5. Store in record.MediaEndpoint so VideoInjectorService can use them
                    //
                    // The Windows Media SDK (Microsoft.Graph.Communications.Calls.Media)
                    // automates steps 2-4 but is not available on Linux.
                    //
                    if (data.TryGetProperty("mediaConfig", out var mc))
                    {
                        _log.LogDebug("[{CallId}] Media config in callback — parsing ICE/DTLS (TODO: SRTP handshake)", callId);
                        // Placeholder: extract IP/port from preFetchMedia or iceCandidate list
                        // if present, so VideoInjectorService has a target endpoint.
                        TryExtractMediaEndpoint(callId, mc, record);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "HandleCallbackAsync: failed to parse Teams notification");
        }
        return Task.CompletedTask;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
            // Teams will send ICE/DTLS parameters to callbackUri so we can establish SRTP.
            ["mediaConfig"]  = new JsonObject
            {
                ["@odata.type"] = "#microsoft.graph.applicationHostedMediaConfig",
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

    private void TryExtractMediaEndpoint(string callId, JsonElement mediaConfig, CallRecord record)
    {
        // Best-effort extraction of the Teams media IP/port from the preFetchMedia array
        // or iceCandidate data. The exact schema depends on the Teams API version.
        // This is where you'd parse the Teams SDP offer / ICE candidate list.
        try
        {
            if (mediaConfig.TryGetProperty("preFetchMedia", out var pfm) &&
                pfm.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in pfm.EnumerateArray())
                {
                    if (item.TryGetProperty("uri", out var uri))
                    {
                        // URI format: "rtp://x.x.x.x:port" or "srtp://x.x.x.x:port"
                        var parsed = TryParseMediaUri(uri.GetString());
                        if (parsed is not null)
                        {
                            record.MediaEndpoint = parsed;
                            _log.LogInformation("[{CallId}] Media endpoint: {Ip}:{Port}", callId, parsed.Ip, parsed.Port);
                            return;
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "[{CallId}] TryExtractMediaEndpoint: parse error (non-fatal)", callId);
        }
    }

    private static MediaEndpoint? TryParseMediaUri(string? uri)
    {
        if (string.IsNullOrWhiteSpace(uri)) return null;
        var m = Regex.Match(uri, @"://(\d{1,3}(?:\.\d{1,3}){3}):(\d+)", RegexOptions.None, TimeSpan.FromSeconds(1));
        if (!m.Success) return null;
        return new MediaEndpoint(m.Groups[1].Value, int.Parse(m.Groups[2].Value));
    }

    private static string? ParseCallIdFromUrl(string? url)
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
