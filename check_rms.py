#!/usr/bin/env python3
import struct

raw = open("/tmp/test_capture.pcm","rb").read()
if len(raw) < 4:
    print("No data captured!")
else:
    samples = struct.unpack(str(len(raw)//2)+"h", raw)
    rms = (sum(s*s for s in samples)/len(samples))**0.5
    print(f"Capture RMS: {rms:.0f} ({len(samples)} samples, {len(raw)} bytes)")
