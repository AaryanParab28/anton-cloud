let voicesReadyPromise = null;
let unlocked = false;
let muted = false;

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

export function primeSpeech() {
  if (unlocked || typeof speechSynthesis === 'undefined') {
    return;
  }
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  unlocked = true;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (muted && typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

export function stopSpeaking() {
  if (typeof speechSynthesis === 'undefined') {
    return;
  }
  speechSynthesis.cancel();
}

export async function speak(text, { onEnd } = {}) {
  if (muted || typeof speechSynthesis === 'undefined') {
    onEnd?.();
    return;
  }
  const clean = sanitizeForSpeech(text);
  if (!clean) {
    onEnd?.();
    return;
  }
  await waitForVoices();
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(clean);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };
  utterance.addEventListener('end', finish);
  utterance.addEventListener('error', finish);
  speechSynthesis.speak(utterance);
}
