/* =============================================================
   WITAUDIOTEXTCONVERT — TEXT TO SPEECH PAGE
   Stage 14: Read Only + Read & Record (cloud Edge TTS) + offline fallback
   ============================================================= */

import { showToast, saveBlob } from '../saver.js';
import {
  speak,
  stop,
  isSpeaking,
  waitForVoices,
} from '../tts-engine.js';
import { fetchCloudAudio, isCloudAvailable } from '../tts-cloud.js';

//const MAX_CHARS = 5000;
const MAX_CHARS = 10000;

const state = {
  text: '',
  voice: 'female',
  outputBlob: null,
  outputUrl: null,
  speaking: false,
  recording: false,
};

const VOICE_LABELS = {
  male: 'English Male',
  female: 'English Female',
};

export function renderTTSPage() {
  state.text = '';
  state.outputBlob = null;
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = null;
  }
  state.speaking = false;
  state.recording = false;
  stop();

  return {
    html: `
      <section class="app-page tts-page">

        <header class="page-hero">
          <h1 class="page-hero__title">Text to Speech</h1>
          <p class="page-hero__subtitle">
            Type or paste text, choose a voice, then listen instantly
            or save the audio as an MP3 file.
          </p>
        </header>

        <div class="card">
          <h2 class="card__title">1. Enter your text</h2>

          <label for="tts-text" class="field">
            <textarea
              id="tts-text"
              class="field__textarea"
              placeholder="Type or paste the text you want to hear…"
              rows="6"
              spellcheck="false"
              maxlength="${MAX_CHARS}"
            ></textarea>
            <span class="field__counter">
              <span id="tts-char-count">0</span> / ${MAX_CHARS}
            </span>
          </label>
        </div>

        <div class="card">
          <h2 class="card__title">2. Choose a voice</h2>

          <div class="voice-picker" role="radiogroup" aria-label="Voice">
            <label class="voice-option" data-voice="female">
              <input type="radio" name="tts-voice" value="female" checked />
              <span class="voice-option__body">
                <span class="voice-option__icon" aria-hidden="true">👩</span>
                <span class="voice-option__label">English Female</span>
                <span class="voice-option__hint">Clear, friendly, natural</span>
              </span>
            </label>

            <label class="voice-option" data-voice="male">
              <input type="radio" name="tts-voice" value="male" />
              <span class="voice-option__body">
                <span class="voice-option__icon" aria-hidden="true">👨</span>
                <span class="voice-option__label">English Male</span>
                <span class="voice-option__hint">Warm, steady, clear</span>
              </span>
            </label>
          </div>

          <p class="card__hint" id="voice-status"></p>
        </div>

        <div class="card">
          <h2 class="card__title">3. Speak</h2>

          <div class="tts-actions">
            <button type="button" class="btn btn--secondary btn--block" id="btn-read-only">
              <span class="btn__icon" aria-hidden="true">🔊</span>
              <span id="btn-read-only-label">Read Only</span>
            </button>

            <button type="button" class="btn btn--primary btn--block" id="btn-read-record">
              <span class="btn__icon" aria-hidden="true">🎙️</span>
              Read &amp; Record (MP3)
            </button>
          </div>

          <p class="card__hint" id="tts-hint">
            <strong>Read Only</strong> plays the text aloud.
            <strong>Read &amp; Record</strong> saves it as an MP3 file.
          </p>

          <div class="progress" id="tts-progress-wrap" hidden>
            <div class="progress__bar" id="tts-progress-bar"></div>
            <p class="progress__label" id="tts-progress-label">Working…</p>
          </div>
        </div>

        <div class="card" id="tts-save-card" hidden>
          <h2 class="card__title">4. Save your MP3</h2>

          <label for="tts-output-filename" class="field">
            <span class="field__label">Filename</span>
            <input
              type="text"
              id="tts-output-filename"
              class="field__input"
              value="speech.mp3"
              spellcheck="false"
              autocomplete="off"
            />
            <span class="field__help">
              You can change the name. The .mp3 extension is added automatically.
            </span>
          </label>

          <audio
            id="tts-audio-preview"
            class="audio-preview"
            controls
            preload="metadata"
          ></audio>

          <button type="button" class="btn btn--primary btn--block" id="btn-tts-download">
            Download MP3
          </button>
        </div>

        <div class="page-actions">
          <button type="button" class="btn btn--ghost" id="btn-tts-clear">
            Clear / Start over
          </button>
        </div>

      </section>
    `,

    mount(root) {
      mountTTS(root);
    },
  };
}

function mountTTS(root) {
  const textarea         = root.querySelector('#tts-text');
  const charCount        = root.querySelector('#tts-char-count');
  const voiceRadios      = root.querySelectorAll('input[name="tts-voice"]');
  const btnReadOnly      = root.querySelector('#btn-read-only');
  const btnReadOnlyLabel = root.querySelector('#btn-read-only-label');
  const btnReadRec       = root.querySelector('#btn-read-record');
  const hint             = root.querySelector('#tts-hint');
  const voiceStatus      = root.querySelector('#voice-status');
  const progressWrap     = root.querySelector('#tts-progress-wrap');
  const progressBar      = root.querySelector('#tts-progress-bar');
  const progressLbl      = root.querySelector('#tts-progress-label');
  const saveCard         = root.querySelector('#tts-save-card');
  const filenameIn       = root.querySelector('#tts-output-filename');
  const preview          = root.querySelector('#tts-audio-preview');
  const btnDownload      = root.querySelector('#btn-tts-download');
  const btnClear         = root.querySelector('#btn-tts-clear');

  /* -------- Character counter -------- */
  textarea.addEventListener('input', () => {
    state.text = textarea.value;
    charCount.textContent = String(state.text.length);
    charCount.style.color =
      state.text.length >= MAX_CHARS - 200 ? 'var(--danger)' : '';
  });

  /* -------- Voice selection -------- */
  voiceRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) state.voice = radio.value;
    });
  });

  /* -------- Voice availability notice (Read Only) -------- */
  (async () => {
    if (!window.speechSynthesis) {
      voiceStatus.textContent =
        'Read Only is not supported here. Use Read & Record instead.';
      voiceStatus.classList.add('card__hint--error');
      return;
    }
    const voices = await waitForVoices(1500);
    if (voices.length === 0) {
      voiceStatus.textContent =
        'No system voices found for Read Only. Use Read & Record for high-quality audio.';
      voiceStatus.classList.add('card__hint--error');
    } else {
      voiceStatus.textContent =
        `${voices.length} voice${voices.length === 1 ? '' : 's'} available for Read Only.`;
    }
  })();

  /* -------- Read Only -------- */
  btnReadOnly.addEventListener('click', async () => {
    if (!state.text.trim()) {
      showToast('Please type some text first.', 'error');
      textarea.focus();
      return;
    }

    if (state.speaking || isSpeaking()) {
      stop();
      return;
    }

    state.speaking = true;
    btnReadOnly.classList.add('btn--speaking');
    btnReadOnlyLabel.textContent = 'Stop speaking…';

    await speak(state.text, state.voice, (status, detail) => {
      if (status === 'ended' || status === 'cancelled' || status === 'error') {
        state.speaking = false;
        btnReadOnly.classList.remove('btn--speaking');
        btnReadOnlyLabel.textContent = 'Read Only';
      }
      if (status === 'error') {
        showToast(
          detail === 'No browser voices available on this device.'
            ? 'No voices available. Use Read & Record instead.'
            : 'Could not speak: ' + (detail || 'unknown error'),
          'error',
          4200
        );
      }
    });
  });

  /* -------- Read & Record (cloud Edge TTS) -------- */
  btnReadRec.addEventListener('click', async () => {
    if (!state.text.trim()) {
      showToast('Please type some text first.', 'error');
      textarea.focus();
      return;
    }
    if (state.recording) return;

    state.recording = true;
    btnReadRec.disabled = true;
    progressWrap.hidden = false;
    progressBar.style.width = '20%';
    progressLbl.textContent = 'Contacting voice service…';
    saveCard.hidden = true;

    try {
      if (!isCloudAvailable()) {
        throw new Error('You are offline. Connect to the internet to record.');
      }

      progressBar.style.width = '55%';
      progressLbl.textContent = 'Generating audio…';

      const voiceLabel = VOICE_LABELS[state.voice] || 'English Female';
      const blob = await fetchCloudAudio(state.text, voiceLabel);

      if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
      state.outputBlob = blob;
      state.outputUrl = URL.createObjectURL(blob);

      progressBar.style.width = '100%';
      progressLbl.textContent = 'Done.';

      preview.src = state.outputUrl;
      filenameIn.value = 'speech.mp3';
      saveCard.hidden = false;

      showToast('Audio ready — play it or save as MP3.', 'success', 3000);
      console.log('[WitaudioTextConvert] Cloud TTS ready. Size:', blob.size, 'bytes');
    } catch (err) {
      console.error('[WitaudioTextConvert] Read & Record failed:', err);
      progressBar.style.width = '0%';
      progressLbl.textContent = 'Failed.';
      showToast(err.message || 'Recording failed.', 'error', 4200);
    } finally {
      state.recording = false;
      btnReadRec.disabled = false;
      setTimeout(() => {
        progressWrap.hidden = true;
        progressBar.style.width = '0%';
      }, 1500);
    }
  });

  /* -------- Download -------- */
  btnDownload.addEventListener('click', async () => {
    if (!state.outputBlob) {
      showToast('Nothing to download yet.', 'error');
      return;
    }
    btnDownload.disabled = true;
    const original = btnDownload.textContent;
    btnDownload.textContent = 'Saving…';
    try {
      const rawName = (filenameIn.value || 'speech.mp3').trim();
      const result = await saveBlob(state.outputBlob, rawName, 'audio/mpeg', 'mp3');
      if (result.saved) {
        showToast(
          result.method === 'picker'
            ? `Saved: ${result.filename}`
            : `Downloaded: ${result.filename} — check your Downloads folder.`,
          'success',
          4200
        );
      } else if (result.reason !== 'cancelled') {
        showToast('Could not save the file. Please try again.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Save failed. Please try again.', 'error');
    } finally {
      btnDownload.disabled = false;
      btnDownload.textContent = original;
    }
  });

  /* -------- Clear -------- */
  btnClear.addEventListener('click', () => {
    stop();
    state.text = '';
    state.outputBlob = null;
    if (state.outputUrl) {
      URL.revokeObjectURL(state.outputUrl);
      state.outputUrl = null;
    }
    state.speaking = false;
    state.recording = false;

    textarea.value = '';
    charCount.textContent = '0';
    charCount.style.color = '';
    voiceRadios.forEach(r => { r.checked = (r.value === 'female'); });
    state.voice = 'female';

    btnReadOnly.classList.remove('btn--speaking');
    btnReadOnlyLabel.textContent = 'Read Only';
    progressWrap.hidden = true;
    progressBar.style.width = '0%';
    progressLbl.textContent = 'Working…';
    saveCard.hidden = true;
    filenameIn.value = 'speech.mp3';
    preview.removeAttribute('src');
    preview.load();
    hint.innerHTML =
      '<strong>Read Only</strong> plays the text aloud. ' +
      '<strong>Read &amp; Record</strong> saves it as an MP3 file.';
  });
}