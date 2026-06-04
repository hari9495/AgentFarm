/**
 * Teams Media Bot sidecar — ASP.NET Core 8 minimal API.
 *
 * Provides a REST API that TeamsJoinAdapter calls to:
 *   1. Join a Teams meeting using applicationHostedMediaConfig (bot owns the media endpoint).
 *   2. Start/stop video injection: FFmpeg relays the desktop-agent HLS stream to the
 *      Teams media endpoint via RTP/SRTP.
 *   3. Handle Teams media-negotiation callbacks (IceGatheringStateChanged etc.).
 *
 * Environment variables:
 *   PORT                       HTTP listen port (default 8090)
 *   TEAMS_TENANT_ID            Azure AD tenant (for default creds — callers can override per-request)
 *   TEAMS_CLIENT_ID            Azure AD application (bot) client ID
 *   TEAMS_CLIENT_SECRET        Azure AD application client secret
 *   TEAMS_CALLBACK_BASE_URL    Public URL Teams can reach this service on for callbacks
 *
 * API surface:
 *   GET  /health
 *   POST /v1/calls/join              { meetingUrl, tenantId, clientId, clientSecret, botId, callbackBaseUrl, botDisplayName? }
 *   GET  /v1/calls/:callId           → CallStatus
 *   POST /v1/calls/:callId/leave
 *   POST /v1/calls/:callId/inject/start   { hlsUrl }
 *   POST /v1/calls/:callId/inject/stop
 *   POST /v1/callbacks/calls         (Teams notification webhook — Teams POSTs here)
 */

using TeamsMediaBot.Models;
using TeamsMediaBot.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.AddConsole();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<DtlsSrtpService>();
builder.Services.AddSingleton<StunClient>();
builder.Services.AddSingleton<TeamsCallService>();
builder.Services.AddSingleton<VideoInjectorService>();

var app = builder.Build();

// ── Health ─────────────────────────────────────────────────────────────────────
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "teams-media-bot" }));

// ── Join a Teams call ──────────────────────────────────────────────────────────
app.MapPost("/v1/calls/join", async (
    JoinCallRequest req,
    TeamsCallService callSvc,
    ILogger<Program> log) =>
{
    if (string.IsNullOrWhiteSpace(req.MeetingUrl))
        return Results.BadRequest(new { error = "meetingUrl is required" });
    if (string.IsNullOrWhiteSpace(req.TenantId) || string.IsNullOrWhiteSpace(req.ClientId) || string.IsNullOrWhiteSpace(req.ClientSecret))
        return Results.BadRequest(new { error = "tenantId, clientId, and clientSecret are required" });
    if (string.IsNullOrWhiteSpace(req.BotId))
        return Results.BadRequest(new { error = "botId is required" });

    log.LogInformation("join request: meeting={Url} bot={BotId}", req.MeetingUrl, req.BotId);
    var result = await callSvc.JoinCallAsync(req);
    return result.Ok
        ? Results.Ok(result)
        : Results.UnprocessableEntity(result);
});

// ── Get call status ────────────────────────────────────────────────────────────
app.MapGet("/v1/calls/{callId}", (string callId, TeamsCallService callSvc) =>
{
    var status = callSvc.GetCallStatus(callId);
    return status is null
        ? Results.NotFound(new { error = "call_not_found" })
        : Results.Ok(status);
});

// ── Leave (hang up) ────────────────────────────────────────────────────────────
app.MapPost("/v1/calls/{callId}/leave", async (
    string callId,
    TeamsCallService callSvc,
    VideoInjectorService injectorSvc) =>
{
    // Stop any running video injection before hanging up
    await injectorSvc.StopInjectionAsync(callId);
    var ok = await callSvc.DeleteCallAsync(callId);
    return ok ? Results.Ok(new { ok = true }) : Results.StatusCode(502);
});

// ── Start video injection ──────────────────────────────────────────────────────
app.MapPost("/v1/calls/{callId}/inject/start", async (
    string callId,
    StartInjectionRequest req,
    TeamsCallService callSvc,
    VideoInjectorService injectorSvc,
    ILogger<Program> log) =>
{
    if (string.IsNullOrWhiteSpace(req.HlsUrl))
        return Results.BadRequest(new { error = "hlsUrl is required" });

    var callStatus = callSvc.GetCallStatus(callId);
    if (callStatus is null)
        return Results.NotFound(new { error = "call_not_found" });

    log.LogInformation("inject/start: call={CallId} hls={Url}", callId, req.HlsUrl);
    var result = await injectorSvc.StartInjectionAsync(callId, req.HlsUrl, callStatus.MediaEndpoint);
    return result.Ok
        ? Results.Ok(result)
        : Results.UnprocessableEntity(result);
});

// ── Stop video injection ───────────────────────────────────────────────────────
app.MapPost("/v1/calls/{callId}/inject/stop", async (
    string callId,
    VideoInjectorService injectorSvc,
    ILogger<Program> log) =>
{
    log.LogInformation("inject/stop: call={CallId}", callId);
    await injectorSvc.StopInjectionAsync(callId);
    return Results.Ok(new { ok = true });
});

// ── Manual media-endpoint override ────────────────────────────────────────────
// When ICE auto-parsing from the Teams callback fails, an operator can POST the
// Teams media IP:port directly.  This immediately triggers the STUN probe and
// DTLS handshake so video injection can proceed.
// Body: { ip: string, port: number }
app.MapPost("/v1/calls/{callId}/media-endpoint", (
    string callId,
    MediaEndpointOverrideRequest req,
    TeamsCallService callSvc,
    ILogger<Program> log) =>
{
    if (string.IsNullOrWhiteSpace(req.Ip) || req.Port <= 0)
        return Results.BadRequest(new { error = "ip and port are required" });

    log.LogInformation("manual media-endpoint override: call={CallId} {Ip}:{Port}", callId, req.Ip, req.Port);
    callSvc.SetMediaEndpointManual(callId, req.Ip, req.Port);
    return Results.Ok(new { ok = true, message = "STUN probe + DTLS handshake initiated" });
});

// ── Teams notification callback ────────────────────────────────────────────────
// Teams POSTs call-state-changed and media-state-changed notifications here.
// The callbackUri registered during createCall() must point to this endpoint.
// For local development, expose it via ngrok or Azure Relay.
app.MapPost("/v1/callbacks/calls", async (
    HttpContext ctx,
    TeamsCallService callSvc,
    ILogger<Program> log) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var payload = await reader.ReadToEndAsync();
    log.LogDebug("Teams callback: {Chars} chars", payload.Length);
    await callSvc.HandleCallbackAsync(payload);
    return Results.Ok();
});

var port = Environment.GetEnvironmentVariable("PORT") ?? "8090";
app.Run($"http://0.0.0.0:{port}");
