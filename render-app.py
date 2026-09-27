"""
WITAUDIOTEXTCONVERT — EDGE TTS RELAY FOR RENDER
Deploy this file to Render's free tier.
"""

import os
import asyncio
import edge_tts
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

VOICE_MAP = {
    'English Female': 'en-US-JennyNeural',
    'English Male':   'en-US-GuyNeural',
}
MAX_TEXT_LENGTH = 10000

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/', methods=['POST'])
@app.route('/api/tts', methods=['POST'])
def tts():
    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    voice_key = data.get('voice', 'English Female')

    if not isinstance(text, str) or not text.strip():
        return jsonify({'error': 'Missing or empty text'}), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({'error': f'Text too long (max {MAX_TEXT_LENGTH})'}), 413

    voice_id = VOICE_MAP.get(voice_key, VOICE_MAP['English Female'])

    try:
        audio_bytes = asyncio.run(synthesize(text, voice_id))
    except Exception as e:
        return jsonify({'error': f'TTS error: {e}'}), 502

    if not audio_bytes:
        return jsonify({'error': 'No audio produced'}), 502

    return Response(
        audio_bytes,
        mimetype='audio/mpeg',
        headers={'Cache-Control': 'no-store'},
    )

async def synthesize(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    buffer = bytearray()
    async for chunk in communicate.stream():
        if chunk['type'] == 'audio':
            buffer.extend(chunk['data'])
    return bytes(buffer)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)