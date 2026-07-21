import {
  TTS_MODEL, TTS_ENDPOINT, TTS_VOICE, TTS_RESPONSE_FORMAT, TTS_MAX_INPUT_CHARS,
} from '../config.js';

let voicesReadyPromise = null;
let unlocked = false;
let muted = false;

let audioEl = null;
let audioCtx = null;
let analyserNode = null;

// Bumped on every speak()/stopSpeaking() call. Any in-flight fetch/playback loop checks this
// before proceeding and bails out silently once it no longer matches - this is how barge-in
// and the manual stop control cut off a Groq TTS chunk sequence or a browser utterance.
let playToken = 0;

function stripBraceBlocks(text) {
  let result = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) {
      result += ch;
    }
  }
  return result;
}

export function sanitizeForSpeech(text) {
  let clean = text;
  clean = clean.replace(/```[\s\S]*?```/g, ' ');
  clean = clean.replace(/`[^`]*`/g, ' ');
  clean = stripBraceBlocks(clean);
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

// Splits text into pieces under TTS_MAX_INPUT_CHARS, preferring sentence boundaries and
// falling back to word boundaries for any single sentence that's still too long.
function splitIntoChunks(text, maxLen) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';

  const flushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > maxLen) {
      flushCurrent();
      let piece = '';
      for (const word of sentence.split(' ')) {
        const candidate = piece ? `${piece} ${word}` : word;
        if (candidate.length > maxLen) {
          if (piece) chunks.push(piece);
          piece = word;
        } else {
          piece = candidate;
        }
      }
      if (piece) chunks.push(piece);
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLen) {
      flushCurrent();
      current = sentence;
    } else {
      current = candidate;
    }
  }
  flushCurrent();
  return chunks;
}

function waitForVoices() {
  if (voicesReadyPromise) {
    return voicesReadyPromise;
  }
  voicesReadyPromise = new Promise((resolve) => {
    const existing = speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    speechSynthesis.addEventListener(
      'voiceschanged',
      () => resolve(speechSynthesis.getVoices()),
      { once: true },
    );
  });
  return voicesReadyPromise;
}

function ensureAudioEl() {
  if (audioEl) return audioEl;
  audioEl = document.getElementById('tts-audio') || new Audio();
  audioEl.playsInline = true;
  return audioEl;
}

// createMediaElementSource may only be called once per <audio> element for its whole lifetime,
// so this is deliberately idempotent and built lazily on first use / primeSpeech().
function ensureAnalyser() {
  if (analyserNode) return;
  try {
    const el = ensureAudioEl();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(el);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 512;
    source.connect(analyserNode);
    source.connect(audioCtx.destination);
  } catch (err) {
    console.error('ANTON voice: Web Audio analyser unavailable for TTS playback.', err);
    analyserNode = null;
  }
}

export function getAnalyser() {
  return analyserNode;
}

export function primeSpeech() {
  if (unlocked) return;
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }
  ensureAnalyser();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  unlocked = true;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (muted) {
    stopSpeaking();
  }
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

export function stopSpeaking() {
  playToken++;
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  }
}

async function fetchGroqSpeech(text, apiKey) {
  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice: TTS_VOICE,
      response_format: TTS_RESPONSE_FORMAT,
    }),
  });
  if (!res.ok) {
    throw new Error(`Groq TTS request failed: ${res.status}`);
  }
  return res.blob();
}

// Sequential prefetch pipeline: fetches chunk N+1 while chunk N is playing, but never fires
// more than one request at a time, and stops issuing new requests entirely after the first
// failure (a rate limit or outage on chunk 2 will not spend chunks 3..N hammering the API).
function startPrefetchPipeline(chunkTexts, apiKey) {
  const results = new Array(chunkTexts.length).fill(null);
  let failed = false;
  let chain = Promise.resolve();

  return chunkTexts.map((text, i) => {
    chain = chain.then(async () => {
      if (failed) {
        results[i] = { error: new Error('skipped after an earlier Groq TTS failure') };
        return;
      }
      try {
        results[i] = { blob: await fetchGroqSpeech(text, apiKey) };
      } catch (err) {
        failed = true;
        results[i] = { error: err };
      }
    });
    return chain.then(() => results[i]);
  });
}

function playBlobOnAudioEl(blob, myToken) {
  return new Promise((resolve) => {
    if (myToken !== playToken) {
      resolve();
      return;
    }
    ensureAnalyser();
    const el = ensureAudioEl();
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('ended', finish);
      el.removeEventListener('error', finish);
      el.removeEventListener('pause', finish);
      URL.revokeObjectURL(url);
      resolve();
    };
    el.addEventListener('ended', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
    el.addEventListener('pause', finish, { once: true }); // fires when stopSpeaking() interrupts
    el.src = url;
    el.play().catch(finish);
  });
}

function speakViaBrowserPromise(text, myToken) {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') {
      resolve();
      return;
    }
    waitForVoices().then(() => {
      if (myToken !== playToken) {
        resolve();
        return;
      }
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      utterance.addEventListener('end', finish);
      utterance.addEventListener('error', finish);
      speechSynthesis.speak(utterance);
    });
  });
}

// Plays chunkTexts in order via Groq TTS. Throws only if the very first chunk fails (nothing
// spoken yet - caller falls back to browser voice for the whole reply). If a later chunk fails
// after some audio has already played, finishes the remaining text via the browser voice instead
// of losing it, and reports that switch through onFallbackStart.
async function speakViaGroq(chunkTexts, apiKey, myToken, { onGroqAudioStart, onFallbackStart }) {
  const pipeline = startPrefetchPipeline(chunkTexts, apiKey);
  let groqStarted = false;

  for (let i = 0; i < pipeline.length; i++) {
    if (myToken !== playToken) return;
    // eslint-disable-next-line no-await-in-loop
    const result = await pipeline[i];
    if (myToken !== playToken) return;

    if (result.error) {
      if (!groqStarted) {
        throw result.error;
      }
      onFallbackStart?.();
      // eslint-disable-next-line no-await-in-loop
      await speakViaBrowserPromise(chunkTexts.slice(i).join(' '), myToken);
      return;
    }

    if (!groqStarted) {
      groqStarted = true;
      onGroqAudioStart?.();
    }
    // eslint-disable-next-line no-await-in-loop
    await playBlobOnAudioEl(result.blob, myToken);
  }
}

export async function speak(text, apiKey, { onGroqAudioStart, onFallbackStart, onEnd } = {}) {
  if (muted) {
    onEnd?.();
    return;
  }
  const clean = sanitizeForSpeech(text);
  if (!clean) {
    onEnd?.();
    return;
  }

  const myToken = ++playToken;
  const chunks = splitIntoChunks(clean, TTS_MAX_INPUT_CHARS);

  if (apiKey) {
    try {
      await speakViaGroq(chunks, apiKey, myToken, { onGroqAudioStart, onFallbackStart });
      if (myToken === playToken) {
        console.info(`[ANTON voice] spoke via Groq TTS (${TTS_MODEL})`);
        onEnd?.();
      }
      return;
    } catch (err) {
      if (myToken !== playToken) return;
      console.warn('[ANTON voice] Groq TTS unavailable, falling back to browser voice:', err);
    }
  }

  onFallbackStart?.();
  console.info('[ANTON voice] spoke via browser SpeechSynthesis (fallback)');
  await speakViaBrowserPromise(clean, myToken);
  if (myToken === playToken) onEnd?.();
}
