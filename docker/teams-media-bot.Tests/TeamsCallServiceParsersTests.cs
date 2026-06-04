using TeamsMediaBot.Services;
using Xunit;

namespace TeamsMediaBot.Tests;

/// <summary>
/// Tests for TeamsCallService's three ICE candidate parsers and the call-ID extractor.
/// These are the correctness-critical regex/URI parsers that interpret Teams callback payloads.
/// </summary>
public class TeamsCallServiceParsersTests
{
    // ── ParseIpPortFromUri (Parser A: preFetchMedia[].uri) ────────────────────
    // Teams delivers media endpoints as "rtp://ip:port" or similar URI schemes.

    [Theory]
    [InlineData("rtp://192.168.1.1:5004",   "192.168.1.1",  5004)]
    [InlineData("udp://10.0.0.1:49300",     "10.0.0.1",     49300)]
    [InlineData("srtp://172.16.0.5:50000",  "172.16.0.5",   50000)]
    [InlineData("https://10.1.2.3:8090",    "10.1.2.3",     8090)]
    [InlineData("rtp://255.255.255.0:1",    "255.255.255.0", 1)]
    public void ParseIpPortFromUri_ExtractsCorrectIpAndPort(string uri, string expectedIp, int expectedPort)
    {
        var result = TeamsCallService.ParseIpPortFromUri(uri);
        Assert.NotNull(result);
        Assert.Equal(expectedIp, result.Ip);
        Assert.Equal(expectedPort, result.Port);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("rtp://no-ip-here")]
    [InlineData("not-a-uri")]
    [InlineData("rtp://hostname:5004")]        // hostname, not dotted-decimal IP
    public void ParseIpPortFromUri_ReturnsNull_ForInvalidInput(string? uri)
    {
        Assert.Null(TeamsCallService.ParseIpPortFromUri(uri));
    }

    // ── ParseSdpCandidate (Parser B: iceGatheringState.iceCandidates[].candidate) ─
    // RFC 5245 SDP candidate format: "candidate:<foundation> <component> UDP <priority> <ip> <port> typ <type>"

    [Theory]
    [InlineData("candidate:3 1 UDP 123456 192.168.1.50 54400 typ host",   "192.168.1.50",  54400)]
    [InlineData("candidate:1 1 udp 100    10.0.0.1      3478 typ srflx",  "10.0.0.1",      3478)]
    [InlineData("candidate:X 2 UDP 9999   172.16.0.99   49152 typ relay", "172.16.0.99",   49152)]
    [InlineData("candidate:abc 1 UDP 1 1.2.3.4 65535 typ host",           "1.2.3.4",       65535)]
    public void ParseSdpCandidate_ExtractsCorrectIpAndPort(string sdp, string expectedIp, int expectedPort)
    {
        var result = TeamsCallService.ParseSdpCandidate(sdp);
        Assert.NotNull(result);
        Assert.Equal(expectedIp, result.Ip);
        Assert.Equal(expectedPort, result.Port);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("candidate:1 1 TCP 100 192.168.0.1 3478 typ host")] // TCP — not matched (UDP only)
    [InlineData("not sdp at all")]
    [InlineData("candidate: UDP 100 192.168.0.1 3478")]             // malformed — missing required fields
    public void ParseSdpCandidate_ReturnsNull_ForNonUdpOrMalformedInput(string? sdp)
    {
        Assert.Null(TeamsCallService.ParseSdpCandidate(sdp));
    }

    [Fact]
    public void ParseSdpCandidate_IsCaseInsensitiveForUdpKeyword()
    {
        // RFC 5245 says "UDP" but Teams may send lowercase
        var lower = TeamsCallService.ParseSdpCandidate("candidate:1 1 udp 100 10.0.0.5 9000 typ host");
        var upper = TeamsCallService.ParseSdpCandidate("candidate:1 1 UDP 100 10.0.0.5 9000 typ host");

        Assert.NotNull(lower);
        Assert.NotNull(upper);
        Assert.Equal(lower.Ip,   upper.Ip);
        Assert.Equal(lower.Port, upper.Port);
    }

    // ── ParseCallIdFromUrl ────────────────────────────────────────────────────
    // resourceUrl in Teams callbacks: "/communications/calls/<callId>"

    [Theory]
    [InlineData("/communications/calls/abc123",                                              "abc123")]
    [InlineData("https://graph.microsoft.com/v1.0/communications/calls/xyz789",             "xyz789")]
    [InlineData("/v1.0/communications/calls/call-id-with-dashes",                            "call-id-with-dashes")]
    [InlineData("/communications/calls/00000000-0000-0000-0000-000000000001",               "00000000-0000-0000-0000-000000000001")]
    public void ParseCallIdFromUrl_ExtractsCallId(string url, string expected)
    {
        Assert.Equal(expected, TeamsCallService.ParseCallIdFromUrl(url));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("/communications/not-calls/abc")]
    [InlineData("https://example.com/other/path")]
    [InlineData("/communications/calls")]           // no trailing id segment
    public void ParseCallIdFromUrl_ReturnsNull_WhenNoMatch(string? url)
    {
        Assert.Null(TeamsCallService.ParseCallIdFromUrl(url));
    }

    [Fact]
    public void ParseCallIdFromUrl_DoesNotCaptureBeyondCallId()
    {
        // Trailing path segments (e.g. sub-resources) must not bleed into the captured ID
        var id = TeamsCallService.ParseCallIdFromUrl("/communications/calls/myCallId/participants");
        Assert.Equal("myCallId", id);
    }
}
