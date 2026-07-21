import { run as runAgent } from './agent/loop.js';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getHistory,
  addMessage,
  clearHistory,
} from './memory/store.js';
import * as stt from './voice/stt.js';
import * as tts from './voice/tts.js';
import * as bargeIn from './voice/barge_in.js';
import * as orb from './ui/orb.js';

const form           = document.getElementById('form');
const input          = document.getElementById('input');
const messages       = document.getElementById('messages');
const statusDot      = document.getElementById('status-dot');
const statusTxt      = document.getElementById('status-text');
const sendBtn        = document.querySelector('.composer-send');
const micBtn         = document.getElementById('mic-button');
const voiceToggleBtn  = document.getElementById('voice-toggle');
const resetKeyBtn    = document.getElementById('reset-key');
const clearMemoryBtn = document.getElementById('clear-memory');
const keyGate        = document.getElementById('key-gate');
const keyGateForm    = document.getElementById('key-gate-form');
const keyGateInput   = document.getElementById('key-gate-input');
const orbCanvas       = document.getElementById('orb-canvas');
const transcriptPanel = document.getElementById('transcript-panel');
const transcriptToggle = document.getElementById('transcript-toggle');

const VoiceState = {
  IDLE: 'idle',
  LISTENING: 'listening',
  TRANSCRIBING: 'transcribing',
  RESPONDING: 'responding',
  SPEAKING: 'speaking',
};

let welcomeEl = document.getElementById('welcome');
let history = [];
let voiceState = VoiceState.IDLE;
let speechGeneration = 0;

function setStatus(state) {
  if (state === 'online') {
    statusDot.classList.remove('thinking');
    statusTxt.textContent = 'online';
  } else {
    statusDot.classList.add('thinking');
    statusTxt.textContent = state;
  }
}

function removeWelcome() {
  if (welcomeEl) {
    welcomeEl.remove();
    welcomeEl = null;
  }
}

function resetMessagesView() {
  messages.innerHTML = '';

  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.id = 'welcome';
  welcome.setAttribute('aria-hidden', 'true');

  const prompt = document.createElement('p');
  prompt.className = 'welcome-prompt';
  prompt.textContent = 'ask me anything';

  welcome.appendChild(prompt);
  messages.appendChild(welcome);
  welcomeEl = welcome;
}

function appendMessage(role, text) {
  removeWelcome();

  const el = document.createElement('div');
  el.className = `message message--${role}`;

  const label = document.createElement('div');
  label.className   = 'message-label';
  label.textContent = role === 'user' ? 'you' : 'ANTON';

  const body = document.createElement('div');
  body.className   = 'message-body';
  body.textContent = text;

  el.appendChild(label);
  el.appendChild(body);
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;

  return el;
}

function appendThinking() {
  removeWelcome();

  const el = document.createElement('div');
  el.className = 'message message--anton message--thinking';

  const label = document.createElement('div');
  label.className   = 'message-label';
  label.textContent = 'ANTON';

  const body = document.createElement('div');
  body.className = 'message-body';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className   = 'dot';
    dot.textContent = '.';
    body.appendChild(dot);
  }

  el.appendChild(label);
  el.appendChild(body);
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;

  return el;
}

function showKeyGate() {
  keyGate.hidden = false;
  keyGateInput.value = '';
  keyGateInput.focus();
}

function hideKeyGate() {
  keyGate.hidden = true;
}

keyGateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = keyGateInput.value.trim();
  if (!key) return;
  await setApiKey(key);
  hideKeyGate();
  input.focus();
});

resetKeyBtn.addEventListener('click', async () => {
  await clearApiKey();
  showKeyGate();
});

clearMemoryBtn.addEventListener('click', async () => {
  await clearHistory();
  history = [];
  resetMessagesView();
});

voiceToggleBtn.addEventListener('click', () => {
  const muted = tts.toggleMuted();
  voiceToggleBtn.textContent = muted ? 'voice: off' : 'voice: on';
});

transcriptToggle.addEventListener('click', () => {
  const isOpen = transcriptPanel.classList.toggle('open');
  transcriptToggle.setAttribute('aria-expanded', String(isOpen));
});

let stopLevelWatch = null;

function stopLevelWatchIfActive() {
  if (stopLevelWatch) {
    stopLevelWatch();
    stopLevelWatch = null;
  }
}

function enterIdle() {
  voiceState = VoiceState.IDLE;
  micBtn.classList.remove('recording', 'speaking');
  micBtn.disabled = false;
  stopLevelWatchIfActive();
  orb.setState('idle');
  setStatus('online');
}

function stopBargeInIfActive() {
  if (bargeIn.isMonitoring()) {
    bargeIn.stopMonitoring();
  }
}

function interruptSpeakingIfAny() {
  if (voiceState === VoiceState.SPEAKING) {
    speechGeneration++; // invalidate the in-flight speak()'s onEnd callback
    stopBargeInIfActive();
    stopLevelWatchIfActive(); // tear down a Groq-audio analyser watch if one was active
    tts.stopSpeaking();
  }
}

async function beginListening() {
  speechGeneration++; // invalidate any in-flight speak() onEnd callback
  stopBargeInIfActive();
  tts.stopSpeaking();

  try {
    await stt.startRecording();
    voiceState = VoiceState.LISTENING;
    micBtn.classList.remove('speaking');
    micBtn.classList.add('recording');
    micBtn.disabled = false;
    orb.setState('listening');
    stopLevelWatchIfActive();
    stopLevelWatch = orb.watchStreamLevel(stt.getActiveStream());
    setStatus('listening…');
  } catch (err) {
    appendMessage('anton', `Error: ${err.message}`);
    enterIdle();
  }
}

async function stopListeningAndSend() {
  voiceState = VoiceState.TRANSCRIBING;
  micBtn.classList.remove('recording');
  micBtn.disabled = true;
  stopLevelWatchIfActive();
  orb.setState('thinking');
  setStatus('transcribing…');

  try {
    const blob = await stt.stopRecording();
    const apiKey = await getApiKey();
    const text = await stt.transcribe(blob, apiKey);
    micBtn.disabled = false;
    sendMessage(text, { voice: true });
  } catch (err) {
    appendMessage('anton', `Error: ${err.message}`);
    enterIdle();
  }
}

micBtn.addEventListener('click', () => {
  tts.primeSpeech();

  if (voiceState === VoiceState.SPEAKING) {
    // Manual STOP control: tapping the mic while ANTON is speaking cancels speech and
    // immediately opens the mic for a new question — the guaranteed fallback for barge-in.
    beginListening();
    return;
  }
  if (voiceState === VoiceState.LISTENING) {
    stopListeningAndSend();
    return;
  }
  if (voiceState === VoiceState.IDLE) {
    beginListening();
  }
  // Ignore taps during TRANSCRIBING/RESPONDING; micBtn is disabled during those states.
});

async function sendMessage(text, { voice = false } = {}) {
  appendMessage('user', text);
  await addMessage('user', text);
  const priorHistory = history.slice();
  history.push({ role: 'user', content: text });

  const thinkingEl = appendThinking();
  voiceState = VoiceState.RESPONDING;
  micBtn.disabled = true;
  orb.setState('thinking');
  setStatus('thinking');
  sendBtn.disabled = true;

  try {
    const reply = await runAgent({
      history: priorHistory,
      userMessage: text,
      voiceMode: voice,
      onStep: (toolName) => setStatus(`using ${toolName}…`),
    });
    thinkingEl.remove();
    appendMessage('anton', reply);
    await addMessage('assistant', reply);
    history.push({ role: 'assistant', content: reply });
    sendBtn.disabled = false;
    input.focus();

    if (tts.isMuted()) {
      enterIdle();
      return;
    }

    const myGeneration = ++speechGeneration;
    voiceState = VoiceState.SPEAKING;
    micBtn.disabled = false;
    micBtn.classList.add('speaking');
    orb.setState('speaking');
    setStatus('speaking…');
    bargeIn.startMonitoring(() => beginListening());
    const ttsApiKey = await getApiKey();
    tts.speak(reply, ttsApiKey, {
      onGroqAudioStart: () => {
        if (speechGeneration !== myGeneration) return;
        // Real Groq TTS audio is playing - drive the orb from its actual amplitude instead
        // of the simulated waveform.
        stopLevelWatchIfActive();
        stopLevelWatch = orb.watchAnalyserLevel(tts.getAnalyser());
      },
      onFallbackStart: () => {
        if (speechGeneration !== myGeneration) return;
        // Browser SpeechSynthesis exposes no amplitude - fall back to the orb's simulated pulse.
        stopLevelWatchIfActive();
      },
      onEnd: () => {
        if (speechGeneration !== myGeneration) {
          return; // superseded by a manual stop or a barge-in trigger
        }
        stopBargeInIfActive();
        enterIdle();
      },
    });
  } catch (err) {
    thinkingEl.remove();
    appendMessage('anton', `Error: ${err.message}`);
    sendBtn.disabled = false;
    enterIdle();
  }
}

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

input.addEventListener('input', resizeInput);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  tts.primeSpeech();
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;
  interruptSpeakingIfAny();
  input.value = '';
  resizeInput();
  sendMessage(text);
});

async function loadHistory() {
  const stored = await getHistory();
  history = stored.map((m) => ({ role: m.role, content: m.content }));
  for (const m of history) {
    appendMessage(m.role === 'assistant' ? 'anton' : 'user', m.content);
  }
}

async function boot() {
  orb.init(orbCanvas);
  await loadHistory();
  const existingKey = await getApiKey();
  if (!existingKey) {
    showKeyGate();
  } else {
    input.focus();
  }
}

boot();
