using Microsoft.Extensions.Logging.Abstractions;
using TeamsMediaBot.Services;
using Xunit;

namespace TeamsMediaBot.Tests;

/// <summary>
/// Tests for DtlsSrtpService:
///   • DTLS certificate fingerprint format (used in createCall SDP)
///   • SRTP key material assembly from the 60-byte RFC 5705 export
/// </summary>
public class DtlsSrtpServiceTests : IDisposable
{
    // Certificate generation (2048-bit RSA) happens once per test class.
    private readonly DtlsSrtpService _svc = new(NullLogger<DtlsSrtpService>.Instance);

    public void Dispose() => _svc.Dispose();

    // ── DtlsFingerprint format ────────────────────────────────────────────────

    [Fact]
    public void DtlsFingerprint_IsNotNullOrEmpty()
    {
        Assert.NotNull(_svc.DtlsFingerprint);
        Assert.NotEmpty(_svc.DtlsFingerprint);
    }

    [Fact]
    public void DtlsFingerprint_Has32ColonSeparatedPairs()
    {
        // SHA-256 = 32 bytes → 32 hex pairs separated by 31 colons
        var parts = _svc.DtlsFingerprint.Split(':');
        Assert.Equal(32, parts.Length);
    }

    [Fact]
    public void DtlsFingerprint_EachPairIsUppercaseHex()
    {
        // SDP fingerprint attribute requires uppercase hex (RFC 4572 §5)
        foreach (var part in _svc.DtlsFingerprint.Split(':'))
        {
            Assert.Matches("^[0-9A-F]{2}$", part);
        }
    }

    [Fact]
    public void DtlsFingerprint_TotalLengthIs95Chars()
    {
        // 32 pairs × 2 chars + 31 colons = 95
        Assert.Equal(95, _svc.DtlsFingerprint.Length);
    }

    [Fact]
    public void DtlsFingerprint_IsStable_AcrossMultipleReads()
    {
        Assert.Equal(_svc.DtlsFingerprint, _svc.DtlsFingerprint);
    }

    // ── AssembleSrtpParams — RFC 5764 §4.2 key material layout ───────────────
    //
    // 60-byte RFC 5705 export layout:
    //   [  0.. 15] client_write_SRTP_master_key   (16 B)
    //   [ 16.. 31] server_write_SRTP_master_key   (16 B)  ← bot is the server
    //   [ 32.. 45] client_write_SRTP_master_salt  (14 B)
    //   [ 46.. 59] server_write_SRTP_master_salt  (14 B)  ← bot is the server
    //
    // FFmpeg expects: base64(server_write_key || server_write_salt) = 30 bytes

    [Fact]
    public void AssembleSrtpParams_OutputIs30Bytes()
    {
        var b64 = DtlsSrtpService.AssembleSrtpParams(new byte[60]);
        Assert.Equal(30, Convert.FromBase64String(b64).Length);
    }

    [Fact]
    public void AssembleSrtpParams_ServerWriteKey_OccupiesCombinedOffset0to15()
    {
        // Fill each byte with its index: km[i] == i, making slices identifiable
        var km = Enumerable.Range(0, 60).Select(i => (byte)i).ToArray();
        var combined = Convert.FromBase64String(DtlsSrtpService.AssembleSrtpParams(km));

        Assert.Equal((byte)16, combined[0]);   // km[16] = first byte of server write key
        Assert.Equal((byte)31, combined[15]);  // km[31] = last byte of server write key
    }

    [Fact]
    public void AssembleSrtpParams_ServerWriteSalt_OccupiesCombinedOffset16to29()
    {
        var km = Enumerable.Range(0, 60).Select(i => (byte)i).ToArray();
        var combined = Convert.FromBase64String(DtlsSrtpService.AssembleSrtpParams(km));

        Assert.Equal((byte)46, combined[16]);  // km[46] = first byte of server write salt
        Assert.Equal((byte)59, combined[29]);  // km[59] = last byte of server write salt
    }

    [Fact]
    public void AssembleSrtpParams_ClientKeyNotIncluded()
    {
        // Fill client key region (km[0..15]) with 0xFF, server key region with 0x00
        var km = new byte[60];
        Array.Fill(km, (byte)0xFF, 0, 16);  // client_write_SRTP_master_key — must NOT appear
        var combined = Convert.FromBase64String(DtlsSrtpService.AssembleSrtpParams(km));
        Assert.DoesNotContain((byte)0xFF, combined);
    }

    [Fact]
    public void AssembleSrtpParams_ClientSaltNotIncluded()
    {
        // Fill client salt region (km[32..45]) with 0xAA, server salt region with 0x00
        var km = new byte[60];
        Array.Fill(km, (byte)0xAA, 32, 14); // client_write_SRTP_master_salt — must NOT appear
        var combined = Convert.FromBase64String(DtlsSrtpService.AssembleSrtpParams(km));
        Assert.DoesNotContain((byte)0xAA, combined);
    }

    [Fact]
    public void AssembleSrtpParams_IsValidBase64()
    {
        var b64 = DtlsSrtpService.AssembleSrtpParams(new byte[60]);
        var ex = Record.Exception(() => Convert.FromBase64String(b64));
        Assert.Null(ex);
    }
}
