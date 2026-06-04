using System.Security.Cryptography;
using TeamsMediaBot.Services;
using Xunit;

namespace TeamsMediaBot.Tests;

/// <summary>
/// Tests for StunClient's pure byte-formatting helpers.
/// RFC 5389 §6: STUN message header is 20 bytes —
///   [0..1]  message type
///   [2..3]  message length (body beyond header)
///   [4..7]  magic cookie  (0x2112A442, big-endian)
///   [8..19] transaction ID (12 bytes)
/// </summary>
public class StunClientTests
{
    // ── BuildBindingRequest ────────────────────────────────────────────────────

    [Fact]
    public void BuildBindingRequest_IsExactlyTwentyBytes()
    {
        var msg = StunClient.BuildBindingRequest(new byte[12]);
        Assert.Equal(20, msg.Length);
    }

    [Fact]
    public void BuildBindingRequest_MessageTypeIsBindingRequest()
    {
        // RFC 5389: Binding Request = 0x0001
        var msg = StunClient.BuildBindingRequest(new byte[12]);
        Assert.Equal(0x00, msg[0]);
        Assert.Equal(0x01, msg[1]);
    }

    [Fact]
    public void BuildBindingRequest_MessageLengthFieldIsZero()
    {
        // No attributes → body length = 0
        var msg = StunClient.BuildBindingRequest(new byte[12]);
        Assert.Equal(0x00, msg[2]);
        Assert.Equal(0x00, msg[3]);
    }

    [Fact]
    public void BuildBindingRequest_MagicCookieIsRfc5389Value()
    {
        // RFC 5389 §6: magic cookie = 0x2112A442 in network byte order (big-endian)
        var msg = StunClient.BuildBindingRequest(new byte[12]);
        Assert.Equal(0x21, msg[4]);
        Assert.Equal(0x12, msg[5]);
        Assert.Equal(0xA4, msg[6]);
        Assert.Equal(0x42, msg[7]);
    }

    [Fact]
    public void BuildBindingRequest_TxIdEmbeddedAtOffset8()
    {
        var txId = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
        var msg = StunClient.BuildBindingRequest(txId);
        Assert.Equal(txId, msg[8..20]);
    }

    [Fact]
    public void BuildBindingRequest_DifferentTxIds_ProduceDifferentMessages()
    {
        var a = StunClient.BuildBindingRequest(new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 });
        var b = StunClient.BuildBindingRequest(new byte[] { 99, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 });
        Assert.NotEqual(a, b);
    }

    // ── IsSuccessResponse ─────────────────────────────────────────────────────

    [Fact]
    public void IsSuccessResponse_ReturnsFalse_WhenDataIsTooShort()
    {
        Assert.False(StunClient.IsSuccessResponse(new byte[19], new byte[12]));
        Assert.False(StunClient.IsSuccessResponse([], new byte[12]));
    }

    [Fact]
    public void IsSuccessResponse_ReturnsFalse_WhenMessageTypeIsNotSuccessResponse()
    {
        var txId = new byte[12];
        var response = BuildWellFormedSuccessResponse(txId);
        response[1] = 0x00; // 0x0100 = not a Binding Success Response
        Assert.False(StunClient.IsSuccessResponse(response, txId));
    }

    [Fact]
    public void IsSuccessResponse_ReturnsFalse_WhenMessageTypeIsBindingRequest()
    {
        var txId = new byte[12];
        var response = BuildWellFormedSuccessResponse(txId);
        response[0] = 0x00;
        response[1] = 0x01; // 0x0001 = Binding Request, not Success Response
        Assert.False(StunClient.IsSuccessResponse(response, txId));
    }

    [Fact]
    public void IsSuccessResponse_ReturnsFalse_WhenMagicCookieIsCorrupt()
    {
        var txId = new byte[12];
        var response = BuildWellFormedSuccessResponse(txId);
        response[4] = 0xFF; // flip first byte of magic cookie
        Assert.False(StunClient.IsSuccessResponse(response, txId));
    }

    [Fact]
    public void IsSuccessResponse_ReturnsFalse_WhenTxIdMismatch()
    {
        var txId     = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
        var wrongId  = new byte[] { 99, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
        var response = BuildWellFormedSuccessResponse(txId);
        Assert.False(StunClient.IsSuccessResponse(response, wrongId));
    }

    [Fact]
    public void IsSuccessResponse_ReturnsTrue_WhenWellFormed()
    {
        var txId     = RandomNumberGenerator.GetBytes(12);
        var response = BuildWellFormedSuccessResponse(txId);
        Assert.True(StunClient.IsSuccessResponse(response, txId));
    }

    [Fact]
    public void IsSuccessResponse_ReturnsTrue_WhenResponseHasExtraAttributeBytes()
    {
        // A real STUN response carries XOR-MAPPED-ADDRESS etc. after the 20-byte header.
        var txId     = RandomNumberGenerator.GetBytes(12);
        var response = new byte[32];
        BuildWellFormedSuccessResponse(txId).CopyTo(response, 0);
        // Extra bytes at [20..31] should not affect the decision
        Assert.True(StunClient.IsSuccessResponse(response, txId));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// Builds a minimal well-formed STUN Binding Success Response (20-byte header only).
    private static byte[] BuildWellFormedSuccessResponse(byte[] txId)
    {
        var msg = new byte[20];
        msg[0] = 0x01; msg[1] = 0x01;                          // type: 0x0101
        msg[2] = 0x00; msg[3] = 0x00;                          // length: 0
        msg[4] = 0x21; msg[5] = 0x12; msg[6] = 0xA4; msg[7] = 0x42; // magic cookie
        txId.CopyTo(msg, 8);
        return msg;
    }
}
