FROM python:3.11-slim

WORKDIR /app

# espeak-ng provides the speech synthesis backend for pyttsx3 on Linux
# ffmpeg is required by faster-whisper for audio decoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    libespeak-ng1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask pyttsx3 faster-whisper

COPY app.py /app/app.py

EXPOSE 8765

CMD ["python", "app.py"]
