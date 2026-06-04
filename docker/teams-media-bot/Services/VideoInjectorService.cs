using System.Diagnostics;
using TeamsMediaBot.Models;

namespace TeamsMediaBot.Services;

/// <summary>
/// Manages FFmpeg subprocesses that relay the desktop-agent HLS stream to the
/// Teams media endpoint.
///
/// ── Injection pipeline ───────────────────────────────────────────────────────
///
///   desktop-agent HLS
///     (http://desktop-agent:5003/v1/screen-share/stream.m3u8)
///           │
///           ▼  FFmpeg: HLS → libx264 → RTP/SRTP
///           │
///   Teams media endpoint (IP:port from ICE negotiation)
///
/// ── SRTP vs plain RTP ────────────────────────────────────────────────────────
///
/// Teams requires SRTP (RFC 3711). When a MediaEndpoint with a valid
/// DtlsFingerprint is available, FFmpeg is invoked with:
///
///   -f srtp
///   -srtp_out_suite AES_128_CM_HMAC_SHA1_80
///   -srtp_out_params <base64-key-material-from-DTLS>
///   srtp://{ip}:{port}?pkt_size=1316
///
/// Until the DTLS handshake is implemented in TeamsCallService (see the TODO
/// there), injection runs in plain-RTP mode against a local test sink and
/// Teams will not accept the stream. The architecture is correct end-to-end;
/// only the DTLS crypto layer is missing.
///
/// To complete on Linux: bind libsrtp2 (available as a .NET NuGet package) or
/// use the Windows-only Microsoft.Graph.Communications.Calls.Media SDK in an
/// Azure Container Instance.
/// ─────────────────────────────────────────────────────────────────────────────
/// </summary>
public sealed class VideoInjectorService
{
    private readonly Dictionary<string, InjectionSession> _sessions = new(StringComparer.Ordinal);
    private readonly Lock _lock = new();
    private readonly ILogger<VideoInjectorService> _log;
    private readonly TeamsCallService _callSvc;

    public VideoInjectorService(ILogger<VideoInjectorService> log, TeamsCallService callSvc)
    {
        _log = log;
        _callSvc = callSvc;
    }

    public Task<InjectionResult> StartInjectionAsync(string callId, string hlsUrl, MediaEndpoint? endpoint)
    {
        lock (_lock)
        {
            if (_sessions.TryGetValue(callId, out var existing) && !existing.Process.HasExited)
                return Task.FromResult(new InjectionResult(Ok: false, Error: "injection already active for this call"));
        }

        var (outputFormat, outputTarget, srtpKeyMaterial) = ResolveOutput(callId, endpoint);

        var args = BuildFfmpegArgs(hlsUrl, outputFormat, outputTarget, srtpKeyMaterial);
        _log.LogInformation("Starting FFmpeg injection: call={CallId} target={Target}", callId, outputTarget);

        var psi = new ProcessStartInfo("ffmpeg")
        {
            Arguments = args,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        Process proc;
        try
        {
            proc = Process.Start(psi) ?? throw new InvalidOperationException("Process.Start returned null");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Failed to start FFmpeg for call {CallId}", callId);
            return Task.FromResult(new InjectionResult(Ok: false, Error: $"ffmpeg start failed: {ex.Message}"));
        }

        proc.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) _log.LogDebug("[ffmpeg:{CallId}] {Line}", callId, e.Data);
        };
        proc.BeginErrorReadLine();

        lock (_lock) { _sessions[callId] = new InjectionSession(callId, proc); }
        _callSvc.SetInjectionState(callId, active: true, pid: proc.Id);

        _log.LogInformation("FFmpeg injection started: call={CallId} pid={Pid}", callId, proc.Id);
        return Task.FromResult(new InjectionResult(Ok: true));
    }

    public async Task StopInjectionAsync(string callId)
    {
        InjectionSession? session;
        lock (_lock)
        {
            _sessions.TryGetValue(callId, out session);
            _sessions.Remove(callId);
        }

        if (session is { } s && !s.Process.HasExited)
        {
            try
            {
                s.Process.Kill();
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(4));
                await s.Process.WaitForExitAsync(cts.Token);
                _log.LogInformation("FFmpeg injection stopped: call={CallId} pid={Pid}", callId, s.Process.Id);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "StopInjectionAsync: error killing FFmpeg for {CallId}", callId);
            }
        }

        _callSvc.SetInjectionState(callId, active: false, pid: null);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private (string format, string target, string? srtpKeyMaterial) ResolveOutput(
        string callId, MediaEndpoint? endpoint)
    {
        if (endpoint is null || string.IsNullOrWhiteSpace(endpoint.Ip))
        {
            _log.LogWarning("[{CallId}] No media endpoint yet (DTLS pending) — discarding output", callId);
            return ("null", "/dev/null", null);
        }

        if (!string.IsNullOrWhiteSpace(endpoint.SrtpKeyMaterial))
        {
            // ── SRTP mode — DTLS handshake complete ──────────────────────────
            _log.LogInformation(
                "[{CallId}] SRTP active: sending encrypted video to {Ip}:{Port}",
                callId, endpoint.Ip, endpoint.Port);
            return ("srtp", $"srtp://{endpoint.Ip}:{endpoint.Port}?pkt_size=1316", endpoint.SrtpKeyMaterial);
        }

        // ── Plain RTP fallback — DTLS handshake in progress ──────────────────
        // Teams will reject plain RTP, but this keeps the pipeline alive while
        // the background DTLS task (NegotiateMediaAsync) completes.  Once DTLS
        // finishes, VideoInjectorService.StartInjectionAsync is called again by
        // TeamsCallService which will then switch to SRTP.
        _log.LogWarning(
            "[{CallId}] DTLS not yet complete — plain RTP to {Ip}:{Port} (Teams will reject until SRTP is ready)",
            callId, endpoint.Ip, endpoint.Port);
        return ("rtp", $"rtp://{endpoint.Ip}:{endpoint.Port}?pkt_size=1316", null);
    }

    private static string BuildFfmpegArgs(
        string hlsUrl,
        string outputFormat,
        string outputTarget,
        string? srtpKeyMaterial)
    {
        var parts = new List<string>
        {
            "-re",
            "-i", $"\"{hlsUrl}\"",
            // Video: H.264 baseline for broadest Teams compatibility
            "-vcodec", "libx264",
            "-preset", "ultrafast",
            "-tune",   "zerolatency",
            "-profile:v", "baseline",
            "-level",  "3.1",
            "-pix_fmt", "yuv420p",
            "-b:v", "500k",
            // Audio is handled by Teams' own audio pipeline — omit from this stream
            "-an",
        };

        if (outputFormat == "srtp" && srtpKeyMaterial is not null)
        {
            // RFC 3711 / ffmpeg srtp muxer:
            //   -srtp_out_suite  — negotiated crypto suite
            //   -srtp_out_params — base64(server_write_master_key + server_write_master_salt)
            parts.AddRange([
                "-srtp_out_suite", "AES_128_CM_HMAC_SHA1_80",
                "-srtp_out_params", srtpKeyMaterial,
            ]);
        }

        parts.AddRange(["-f", outputFormat, outputTarget]);
        return string.Join(" ", parts);
    }
}

internal sealed record InjectionSession(string CallId, Process Process);
