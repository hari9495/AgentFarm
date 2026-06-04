using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using Org.BouncyCastle.Asn1.X509;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Operators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Math;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.Tls;
using Org.BouncyCastle.Tls.Crypto;
using Org.BouncyCastle.Tls.Crypto.Impl.BC;
using Org.BouncyCastle.X509;

namespace TeamsMediaBot.Services;

/// <summary>
/// Performs the DTLS-SRTP handshake (RFC 5764) using BouncyCastle and exports the
/// resulting SRTP master key material for use with FFmpeg's <c>-srtp_out_params</c>.
///
/// Protocol flow:
///   1. Bot listens on a UDP port.
///   2. Teams (DTLS client) connects once ICE connectivity is confirmed.
///   3. DTLS handshake completes; <c>use_srtp</c> extension selects AES_128_CM_HMAC_SHA1_80.
///   4. SRTP key material (60 bytes) is derived via the TLS keying-material exporter
///      (RFC 5705, label "EXTRACTOR-dtls_srtp").
///   5. The server write key+salt (30 bytes) is returned as base64 for FFmpeg.
///
/// The public <see cref="DtlsFingerprint"/> is included in the Graph <c>createCall</c>
/// request so Teams can verify our DTLS certificate during the handshake.
/// </summary>
public sealed class DtlsSrtpService : IDisposable
{
    private readonly BcTlsCrypto _crypto;
    private readonly Org.BouncyCastle.Tls.Certificate _tlsCert;
    private readonly AsymmetricKeyParameter _privateKey;
    private readonly ILogger<DtlsSrtpService> _log;

    public DtlsSrtpService(ILogger<DtlsSrtpService> log)
    {
        _log = log;
        _crypto = new BcTlsCrypto(new SecureRandom());
        (_tlsCert, _privateKey) = GenerateSelfSignedCertificate();
        DtlsFingerprint = ComputeSha256Fingerprint(_tlsCert);
        _log.LogInformation("DTLS certificate ready. Fingerprint: {Fp}", DtlsFingerprint);
    }

    /// <summary>
    /// SHA-256 certificate fingerprint in colon-separated uppercase hex (SDP format).
    /// Include in <c>createCall → applicationHostedMediaConfig → dtlsFingerprint</c>.
    /// </summary>
    public string DtlsFingerprint { get; }

    /// <summary>
    /// Perform the DTLS-SRTP handshake with Teams.
    ///
    /// Teams acts as the DTLS client; this service acts as the DTLS server.
    /// The method blocks until the handshake completes (or times out).
    /// </summary>
    /// <param name="remoteIp">Teams media endpoint IP (from ICE callback)</param>
    /// <param name="remotePort">Teams media endpoint port</param>
    /// <param name="localPort">Local UDP port to listen on</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>
    /// Base64-encoded server write SRTP key+salt (30 bytes) for FFmpeg
    /// <c>-srtp_out_params</c>, or <c>null</c> if the handshake failed/was cancelled.
    /// </returns>
    public async Task<string?> HandshakeAsync(
        string remoteIp, int remotePort, int localPort, CancellationToken ct)
    {
        var remote = new IPEndPoint(IPAddress.Parse(remoteIp), remotePort);
        _log.LogInformation("DTLS: listening on port {Local} for connection from {Remote}", localPort, remote);

        var server   = new SrtpTlsServer(_crypto, _tlsCert, _privateKey);
        var protocol = new DtlsServerProtocol();
        DtlsTransport? dtls = null;

        try
        {
            await using var transport = new UdpDatagramTransport(localPort, remote);

            // DtlsServerProtocol.Accept is synchronous — run on a thread-pool thread
            // so we don't block the ASP.NET Core request thread.
            dtls = await Task.Run(() => protocol.Accept(server, transport), ct);
        }
        catch (OperationCanceledException)
        {
            _log.LogInformation("DTLS handshake cancelled for port {Local}", localPort);
            return null;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "DTLS handshake failed on port {Local}", localPort);
            return null;
        }
        finally
        {
            try { dtls?.Close(); } catch { /* best-effort */ }
        }

        // ── Export SRTP key material (RFC 5705 + RFC 5764 §4.2) ───────────────
        byte[] km = server.ExportKeyingMaterial();
        var b64 = AssembleSrtpParams(km);
        _log.LogInformation("DTLS handshake complete. SRTP key material derived.");
        return b64;
    }

    // ── Certificate generation ─────────────────────────────────────────────────

    private (Org.BouncyCastle.Tls.Certificate, AsymmetricKeyParameter) GenerateSelfSignedCertificate()
    {
        var rng = new SecureRandom();

        // 2048-bit RSA key pair
        var kpGen = new RsaKeyPairGenerator();
        kpGen.Init(new KeyGenerationParameters(rng, 2048));
        var kp = kpGen.GenerateKeyPair();

        // Self-signed X.509 certificate
        var certGen = new X509V3CertificateGenerator();
        certGen.SetSerialNumber(BigInteger.ProbablePrime(120, rng));
        certGen.SetIssuerDN(new X509Name("CN=AgentFarm-Teams-Bot"));
        certGen.SetSubjectDN(new X509Name("CN=AgentFarm-Teams-Bot"));
        certGen.SetNotBefore(DateTime.UtcNow.AddDays(-1));
        certGen.SetNotAfter(DateTime.UtcNow.AddYears(10));
        certGen.SetPublicKey(kp.Public);
        var bcCert = certGen.Generate(new Asn1SignatureFactory("SHA256withRSA", kp.Private, rng));

        // Wrap in BouncyCastle TLS Certificate chain
        var tlsCertEntry = new BcTlsCertificate(_crypto, bcCert.GetEncoded());
        var tlsCert = new Org.BouncyCastle.Tls.Certificate([tlsCertEntry]);
        return (tlsCert, kp.Private);
    }

    private static string ComputeSha256Fingerprint(Org.BouncyCastle.Tls.Certificate tlsCert)
    {
        // SHA-256 of DER-encoded certificate, formatted as "AA:BB:CC:..."
        var raw = tlsCert.GetCertificateAt(0).GetEncoded();
        var hash = SHA256.HashData(raw);
        return string.Join(":", hash.Select(b => b.ToString("X2")));
    }

    /// <summary>
    /// Assembles the 30-byte FFmpeg SRTP parameter string from the raw 60-byte RFC 5705 export.
    ///
    /// Layout of the 60-byte keying-material export (RFC 5764 §4.2):
    ///   [  0.. 15] client_write_SRTP_master_key   (16 B)
    ///   [ 16.. 31] server_write_SRTP_master_key   (16 B)  ← we are the server
    ///   [ 32.. 45] client_write_SRTP_master_salt  (14 B)
    ///   [ 46.. 59] server_write_SRTP_master_salt  (14 B)  ← we are the server
    ///
    /// FFmpeg expects key then salt concatenated (30 bytes total), base64-encoded,
    /// passed as <c>-srtp_out_params</c>.
    /// </summary>
    internal static string AssembleSrtpParams(byte[] km)
    {
        var combined = new byte[30];
        km[16..32].CopyTo(combined, 0);   // server_write_SRTP_master_key  (16 B)
        km[46..60].CopyTo(combined, 16);  // server_write_SRTP_master_salt (14 B)
        return Convert.ToBase64String(combined);
    }

    public void Dispose() => _crypto.SecureRandom.NextBytes(new byte[1]); // flush entropy

    // ── Inner: DTLS server with use_srtp ──────────────────────────────────────

    private sealed class SrtpTlsServer : DefaultTlsServer
    {
        private readonly Org.BouncyCastle.Tls.Certificate _cert;
        private readonly AsymmetricKeyParameter _key;

        internal SrtpTlsServer(
            TlsCrypto crypto,
            Org.BouncyCastle.Tls.Certificate cert,
            AsymmetricKeyParameter key) : base(crypto)
        {
            _cert = cert;
            _key  = key;
        }

        // Advertise use_srtp with AES_128_CM_HMAC_SHA1_80 (RFC 5764)
        public override IDictionary<int, byte[]> GetServerExtensions()
        {
            var exts = base.GetServerExtensions() ?? new Dictionary<int, byte[]>();
            TlsSrtp.CreateUseSrtpExtension(
                [SrtpProtectionProfile.SRTP_AES128_CM_HMAC_SHA1_80],
                null, // no MKI
                exts);
            return exts;
        }

        // Provide our self-signed certificate for the DTLS handshake
        protected override TlsCredentialedSigner GetRsaSignerCredentials()
        {
            var sigAlg = new SignatureAndHashAlgorithm(HashAlgorithm.sha256, SignatureAlgorithm.rsa);
            return new BcDefaultTlsCredentialedSigner(
                new TlsCryptoParameters(m_context),
                (BcTlsCrypto)m_context.Crypto,
                _key,
                _cert,
                sigAlg);
        }

        // Export 60-byte SRTP key material (RFC 5705 keying-material exporter)
        internal byte[] ExportKeyingMaterial() =>
            m_context.ExportKeyingMaterial("EXTRACTOR-dtls_srtp", false, null, 60);
    }

    // ── Inner: UDP DatagramTransport ──────────────────────────────────────────

    private sealed class UdpDatagramTransport : DatagramTransport, IAsyncDisposable
    {
        private readonly Socket _sock;
        private readonly IPEndPoint _remote;

        internal UdpDatagramTransport(int localPort, IPEndPoint remote)
        {
            _sock = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            _sock.Bind(new IPEndPoint(IPAddress.Any, localPort));
            _remote = remote;
        }

        public int GetReceiveLimit() => 65507;
        public int GetSendLimit()    => 65507;

        public int Receive(byte[] buf, int off, int len, int waitMillis)
        {
            if (!_sock.Poll(waitMillis * 1_000 /* µs */, SelectMode.SelectRead))
                return -1; // BouncyCastle treats -1 as "no data / retry"

            EndPoint ep = new IPEndPoint(IPAddress.Any, 0);
            try
            {
                return _sock.ReceiveFrom(buf, off, len, SocketFlags.None, ref ep);
            }
            catch (SocketException)
            {
                return -1;
            }
        }

        public void Send(byte[] buf, int off, int len) =>
            _sock.SendTo(buf, off, len, SocketFlags.None, _remote);

        public void Close() => _sock.Close();
        public ValueTask DisposeAsync() { Close(); return ValueTask.CompletedTask; }
    }
}
