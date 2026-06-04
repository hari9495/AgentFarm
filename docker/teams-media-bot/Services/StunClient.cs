using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;

namespace TeamsMediaBot.Services;

/// <summary>
/// Minimal STUN client that sends a Binding Request to Teams' ICE candidate
/// to confirm UDP reachability before starting the DTLS handshake.
///
/// Per RFC 5389: STUN message header is 20 bytes:
///   [0..1]  message type  (0x0001 = Binding Request)
///   [2..3]  message length (body length beyond header, 0 for plain request)
///   [4..7]  magic cookie  (0x2112A442)
///   [8..19] transaction ID (12 random bytes)
///
/// The server echoes the transaction ID in its 0x0101 Success Response so we can
/// match the reply to our request.
/// </summary>
public sealed class StunClient
{
    private const int    StunBindingRequest = 0x0001;
    private const uint   MagicCookie        = 0x2112A442u;
    private const int    ReceiveTimeoutMs   = 3_000;
    private const int    TxIdOffset         = 8;
    private const int    TxIdLength         = 12;

    private readonly ILogger<StunClient> _log;

    public StunClient(ILogger<StunClient> log) => _log = log;

    /// <summary>
    /// Send a STUN Binding Request to <paramref name="remote"/> and wait for a Success Response.
    /// Returns <c>true</c> when Teams' media endpoint is reachable on UDP.
    /// </summary>
    public async Task<bool> ProbeAsync(IPEndPoint remote, CancellationToken ct = default)
    {
        var txId = RandomNumberGenerator.GetBytes(TxIdLength);
        var request = BuildBindingRequest(txId);

        using var udp = new UdpClient();
        udp.Client.ReceiveTimeout = ReceiveTimeoutMs;

        try
        {
            await udp.SendAsync(request, request.Length, remote).WaitAsync(ct);

            // Wait for the matching 0x0101 Success Response
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(ReceiveTimeoutMs);

            while (!cts.Token.IsCancellationRequested)
            {
                UdpReceiveResult reply;
                try { reply = await udp.ReceiveAsync(cts.Token); }
                catch (OperationCanceledException) { break; }

                if (IsSuccessResponse(reply.Buffer, txId))
                {
                    _log.LogInformation("STUN probe OK — Teams endpoint {Remote} is reachable", remote);
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "STUN probe to {Remote} failed", remote);
        }

        _log.LogWarning("STUN probe: no response from Teams endpoint {Remote} within {Ms} ms", remote, ReceiveTimeoutMs);
        return false;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static byte[] BuildBindingRequest(byte[] txId)
    {
        // 20-byte STUN header, no attributes
        var msg = new byte[20];

        // Message type: 0x0001
        msg[0] = 0x00;
        msg[1] = 0x01;

        // Message length: 0 (no attributes)
        msg[2] = 0x00;
        msg[3] = 0x00;

        // Magic cookie: 0x2112A442 (big-endian)
        var cookie = BitConverter.GetBytes(MagicCookie);
        if (BitConverter.IsLittleEndian) Array.Reverse(cookie);
        cookie.CopyTo(msg, 4);

        // Transaction ID (12 bytes)
        txId.CopyTo(msg, TxIdOffset);
        return msg;
    }

    private static bool IsSuccessResponse(byte[] data, byte[] expectedTxId)
    {
        // Minimum STUN header length is 20 bytes
        if (data.Length < 20) return false;

        // Check message type = 0x0101 (Binding Success Response)
        if (data[0] != 0x01 || data[1] != 0x01) return false;

        // Verify magic cookie
        var cookie = BitConverter.GetBytes(MagicCookie);
        if (BitConverter.IsLittleEndian) Array.Reverse(cookie);
        if (data[4] != cookie[0] || data[5] != cookie[1] ||
            data[6] != cookie[2] || data[7] != cookie[3]) return false;

        // Check transaction ID matches
        for (var i = 0; i < TxIdLength; i++)
        {
            if (data[TxIdOffset + i] != expectedTxId[i]) return false;
        }
        return true;
    }
}
