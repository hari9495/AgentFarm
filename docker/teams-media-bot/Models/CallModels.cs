namespace TeamsMediaBot.Models;

// ── REST request / response DTOs ──────────────────────────────────────────────

public record JoinCallRequest(
    string MeetingUrl,
    string TenantId,
    string ClientId,
    string ClientSecret,
    string BotId,
    /// <summary>
    /// Public base URL Teams will POST callbacks to, e.g. https://my-bot.example.com.
    /// Set via TEAMS_CALLBACK_BASE_URL. If empty, Teams callbacks are silently accepted
    /// but not acted on (useful for control-plane-only testing).
    /// </summary>
    string CallbackBaseUrl,
    string BotDisplayName = "AgentFarm Bot"
);

public record CallJoinResult(
    bool Ok,
    string? CallId = null,
    string? Error = null
);

public record StartInjectionRequest(
    /// <summary>HLS playlist URL served by the desktop-agent, e.g. http://desktop-agent:5003/v1/screen-share/stream.m3u8</summary>
    string HlsUrl
);

public record InjectionResult(bool Ok, string? Error = null);

/// <summary>Body for POST /v1/calls/:callId/media-endpoint (manual ICE override).</summary>
public record MediaEndpointOverrideRequest(string Ip, int Port);

// ── Internal state ────────────────────────────────────────────────────────────

/// <summary>
/// Teams media endpoint received via the ICE/DTLS negotiation callback.
/// Populated by TeamsCallService once Teams sends its ICE candidates; updated
/// again by DtlsSrtpService once the handshake completes.
/// </summary>
public record MediaEndpoint(
    string Ip,
    int Port,
    /// <summary>
    /// Our bot's DTLS certificate fingerprint (SHA-256, colon-separated).
    /// Included in the createCall payload so Teams can verify our certificate.
    /// </summary>
    string? DtlsFingerprint = null,
    /// <summary>SRTP crypto suite negotiated during DTLS (used for logging/diagnostics).</summary>
    string SrtpCryptoSuite = "AES_128_CM_HMAC_SHA1_80",
    /// <summary>
    /// Base64-encoded SRTP server-write key+salt (30 bytes) derived from the DTLS
    /// keying-material exporter (RFC 5705).  Populated after the DTLS handshake.
    /// When set, VideoInjectorService uses -f srtp instead of -f rtp.
    /// </summary>
    string? SrtpKeyMaterial = null,
    /// <summary>Local UDP port this bot is listening on for the DTLS connection from Teams.</summary>
    int LocalDtlsPort = 0
);

public enum CallState { Joining, Established, Terminated }

public record CallStatus(
    string CallId,
    CallState State,
    MediaEndpoint? MediaEndpoint,
    bool InjectionActive,
    int? FfmpegPid
);
