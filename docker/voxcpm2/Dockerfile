FROM python:3.11-slim

WORKDIR /app

RUN pip install flask soundfile voxcpm

# TODO: replace stub with real VoxCPM2 model load

COPY app.py /app/app.py

EXPOSE 8765

CMD ["python", "app.py"]
