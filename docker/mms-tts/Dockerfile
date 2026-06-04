FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# PyTorch CPU wheel in its own layer — large download, benefits from caching.
RUN pip install --no-cache-dir \
    torch==2.3.1+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    "uvicorn[standard]==0.30.6" \
    transformers==4.44.2 \
    scipy==1.13.1 \
    numpy==1.26.4

COPY server.py /app/server.py

EXPOSE 5002

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5002"]
