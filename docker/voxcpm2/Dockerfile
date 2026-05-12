FROM python:3.11-slim

WORKDIR /app

# espeak-ng provides the speech synthesis backend for pyttsx3 on Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    libespeak-ng1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask pyttsx3

COPY app.py /app/app.py

EXPOSE 8765

CMD ["python", "app.py"]
