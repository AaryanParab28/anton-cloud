import { WHISPER_ENDPOINT, WHISPER_MODEL } from '../config.js';

const MIC_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

let mediaRecorder = null;
let mediaStream = null;
let chunks = [];

function extensionForMimeType(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'dat';
}

export function openMicStream() {
  return navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
}

export async function startRecording() {
  mediaStream = await openMicStream();
  chunks = [];
  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  mediaRecorder.start();
}

export function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('Not recording.'));
      return;
    }
    const recorder = mediaRecorder;
    const stream = mediaStream;
    recorder.addEventListener(
      'stop',
      () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
        stream.getTracks().forEach((track) => track.stop());
        resolve(blob);
      },
      { once: true },
    );
    recorder.stop();
    mediaRecorder = null;
    mediaStream = null;
  });
}

export async function transcribe(blob, apiKey) {
  if (!apiKey) {
    throw new Error('No Groq API key configured.');
  }

  const extension = extensionForMimeType(blob.type || '');
  const form = new FormData();
  form.append('model', WHISPER_MODEL);
  form.append('file', blob, `recording.${extension}`);

  let response;
  try {
    response = await fetch(WHISPER_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    throw new Error('Network error reaching Groq Whisper. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Groq rejected the API key for transcription. Reset the key and try again.');
    }
    if (response.status === 429) {
      throw new Error('Groq transcription rate limit hit (429). Try again in a moment.');
    }
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message;
    throw new Error(`Groq Whisper error ${response.status}: ${message || 'unknown error'}`);
  }

  const data = await response.json();
  const text = (data?.text || '').trim();
  if (!text) {
    throw new Error('Transcription came back empty.');
  }
  return text;
}
