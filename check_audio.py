import struct
data = open("/tmp/mic_test.raw","rb").read()
if len(data) < 2:
    print("EMPTY")
else:
    samples = struct.unpack(str(len(data)//2)+"h", data)
    mv = max(abs(s) for s in samples)
    rms = (sum(s*s for s in samples)/len(samples))**0.5
    print("bytes={} max_amplitude={} rms={:.0f}".format(len(data), mv, rms))
    print("AUDIO_FLOWS=YES" if mv > 100 else "AUDIO_FLOWS=NO - SILENT")
