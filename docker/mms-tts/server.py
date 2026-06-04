"""
Meta MMS-TTS server — POST /api/tts → WAV audio bytes.

Accepts ISO-639-1 (2-letter) or ISO-639-3 (3-letter) language codes and
loads facebook/mms-tts-{lang3} models on demand. Models are cached in
memory after first load; they persist on disk via the HuggingFace cache
volume (/root/.cache/huggingface).

First request for a new language downloads ~30-100 MB from HuggingFace.
"""

from __future__ import annotations

import io
import logging
from typing import Any

import numpy as np
import scipy.io.wavfile
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from transformers import AutoTokenizer, VitsModel

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s %(message)s')
logger = logging.getLogger('mms-tts')

app = FastAPI(title='MMS-TTS Server')

# ISO 639-1 → ISO 639-3 for languages NOT covered by XTTS v2.
# XTTS handles: en es fr de it pt pl tr ru nl cs ar zh ja hu ko hi
# Everything else falls through to MMS — include the most common ones here.
_LANG_MAP: dict[str, str] = {
    'af': 'afr', 'am': 'amh', 'az': 'azj', 'be': 'bel', 'bg': 'bul',
    'bn': 'ben', 'bs': 'bos', 'cy': 'cym', 'et': 'est', 'eu': 'eus',
    'fi': 'fin', 'ga': 'gle', 'gl': 'glg', 'gu': 'guj', 'ha': 'hau',
    'hr': 'hrv', 'hy': 'hye', 'id': 'ind', 'ig': 'ibo', 'is': 'isl',
    'jv': 'jav', 'ka': 'kat', 'kk': 'kaz', 'km': 'khm', 'kn': 'kan',
    'ln': 'lin', 'lo': 'lao', 'lt': 'lit', 'lv': 'lvs', 'mg': 'plt',
    'mk': 'mkd', 'ml': 'mal', 'mn': 'khk', 'mr': 'mar', 'ms': 'zsm',
    'mt': 'mlt', 'my': 'mya', 'ne': 'npi', 'ny': 'nya', 'om': 'gaz',
    'pa': 'pan', 'rw': 'kin', 'si': 'sin', 'sk': 'slk', 'sl': 'slv',
    'sn': 'sna', 'so': 'som', 'sq': 'als', 'sr': 'srp', 'su': 'sun',
    'sw': 'swh', 'ta': 'tam', 'te': 'tel', 'tg': 'tgk', 'th': 'tha',
    'tl': 'tgl', 'uk': 'ukr', 'ur': 'urd', 'uz': 'uzn', 'vi': 'vie',
    'xh': 'xho', 'yo': 'yor', 'zu': 'zul',
}

# In-memory model cache keyed by 3-letter lang code.
_cache: dict[str, tuple[Any, Any]] = {}


def _resolve(code: str) -> str:
    """Map a BCP-47 or ISO-639-1 code to the ISO-639-3 suffix used by MMS model IDs."""
    code = code.lower().split('-')[0]
    if len(code) == 2:
        return _LANG_MAP.get(code, code)
    return code  # already 3-letter; pass through


def _load(lang3: str) -> tuple[Any, Any]:
    if lang3 not in _cache:
        model_id = f'facebook/mms-tts-{lang3}'
        logger.info('Loading %s', model_id)
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = VitsModel.from_pretrained(model_id)
        model.eval()
        _cache[lang3] = (model, tokenizer)
        logger.info('Loaded %s (sample_rate=%d)', model_id, model.config.sampling_rate)
    return _cache[lang3]


class TtsRequest(BaseModel):
    text: str
    language: str = 'eng'


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/api/tts')
def tts(req: TtsRequest) -> Response:
    lang3 = _resolve(req.language)
    try:
        model, tokenizer = _load(lang3)
    except OSError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"No MMS-TTS model for language '{req.language}' (tried 'facebook/mms-tts-{lang3}'): {exc}",
        ) from exc

    inputs = tokenizer(req.text, return_tensors='pt')
    with torch.no_grad():
        waveform = model(**inputs).waveform.squeeze().cpu().numpy()

    buf = io.BytesIO()
    scipy.io.wavfile.write(buf, model.config.sampling_rate, (waveform * 32767).astype(np.int16))
    return Response(content=buf.getvalue(), media_type='audio/wav')
