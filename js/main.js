import { run as runAgent } from './agent/loop.js';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getHistory,
  addMessage,
  clearHistory,
} from './memory/store.js';

const form           = document.getElementById('form');
const input          = document.getElementById('input');
const messages       = document.getElementById('messages');
const statusDot      = document.getElementById('status-dot');
const statusTxt      = document.getElementById('status-text');
const sendBtn        = document.querySelector('.composer-send');
const resetKeyBtn    = document.getElementById('reset-key');
const clearMemoryBtn = document.getElementById('clear-memory');
const keyGate        = document.getElementById('key-gate');
const keyGateForm    = document.getElementById('key-gate-form');
const keyGateInput   = document.getElementById('key-gate-input');

let welcomeEl = document.getElementById('welcome');
let history = [];

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

async function sendMessage(text) {
  appendMessage('user', text);
  await addMessage('user', text);
  const priorHistory = history.slice();
  history.push({ role: 'user', content: text });

  const thinkingEl = appendThinking();
  setStatus('thinking');
  sendBtn.disabled = true;

  try {
    const reply = await runAgent({
      history: priorHistory,
      userMessage: text,
      onStep: (toolName) => setStatus(`using ${toolName}…`),
    });
    thinkingEl.remove();
    appendMessage('anton', reply);
    await addMessage('assistant', reply);
    history.push({ role: 'assistant', content: reply });
  } catch (err) {
    thinkingEl.remove();
    appendMessage('anton', `Error: ${err.message}`);
  } finally {
    setStatus('online');
    sendBtn.disabled = false;
    input.focus();
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
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;
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
  await loadHistory();
  const existingKey = await getApiKey();
  if (!existingKey) {
    showKeyGate();
  } else {
    input.focus();
  }
}

boot();
