"""
WITAUDIOTEXTCONVERT — EDGE TTS RELAY (Python)
Stage 15: Local TTS server using Microsoft Edge neural voices.

Run from the project root with:
    cd ~/projects/witaudiotextconvert
    source .venv/bin/activate
    python relay/tts-relay.py

The Flask server listens on http://localhost:5000.
The front-end calls it from src/tts-cloud.js.
"""

import asyncio
import edge_tts
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

# -------------------------------------------------------------
# Config
# -------------------------------------------------------------
HOST = '0.0.0.0'      # listen on all interfaces (so phone on LAN can reach it)
PORT = 5000

# Map friendly names to Edge voice IDs
VOICE_MAP = {
    'English Female': 'en-US-JennyNeural',
    'English Male':   'en-US-GuyNeural',
}

#MAX_TEXT_LENGTH = 5000
MAX_TEXT_LENGTH = 10000

# -------------------------------------------------------------
# Flask app
# -------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # allow requests from the browser (localhost:5173)

# -------------------------------------------------------------
# Health check
# -------------------------------------------------------------
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'witaudiotextconvert-tts-relay'})


# -------------------------------------------------------------
# TTS endpoint
# Accepts: { "text": "...", "voice": "English Female" }
# Returns: MP3 audio bytes
# -------------------------------------------------------------
@app.route('/', methods=['POST'])
@app.route('/api/tts', methods=['POST'])
def tts():
    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    voice_key = data.get('voice', 'English Female')

    # Validate
    if not isinstance(text, str) or not text.strip():
        return jsonify({'error': 'Missing or empty text'}), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({'error': f'Text too long (max {MAX_TEXT_LENGTH})'}), 413

    voice_id = VOICE_MAP.get(voice_key, VOICE_MAP['English Female'])

    try:
        audio_bytes = asyncio.run(synthesize(text, voice_id))
    except Exception as e:
        print(f'[relay] TTS error: {e}')
        return jsonify({'error': f'TTS error: {e}'}), 502

    if not audio_bytes:
        return jsonify({'error': 'No audio produced'}), 502

    print(f'[relay] {voice_key} → {len(audio_bytes)} bytes for "{text[:40]}..."')
    return Response(
        audio_bytes,
        mimetype='audio/mpeg',
        headers={
            'Content-Disposition': 'inline; filename="speech.mp3"',
            'Cache-Control': 'no-store',
        },
    )


# -------------------------------------------------------------
# The actual Edge TTS call
# -------------------------------------------------------------
async def synthesize(text: str, voice: str) -> bytes:
    """Call Edge TTS and return MP3 bytes."""
    communicate = edge_tts.Communicate(text, voice)
    buffer = bytearray()
    async for chunk in communicate.stream():
        if chunk['type'] == 'audio':
            buffer.extend(chunk['data'])
    return bytes(buffer)


# -------------------------------------------------------------
# Entry point
# -------------------------------------------------------------
if __name__ == '__main__':
    print(f'[relay] Starting Edge TTS relay on http://{HOST}:{PORT}')
    print(f'[relay] Health: http://localhost:{PORT}/health')
    print(f'[relay] TTS:    POST http://localhost:{PORT}/api/tts')
    app.run(host=HOST, port=PORT, debug=False)