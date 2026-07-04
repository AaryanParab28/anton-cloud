const ECHO_DELAY_MS = 500;

const form      = document.getElementById('form');
const input     = document.getElementById('input');
const messages  = document.getElementById('messages');
const statusDot = document.getElementById('status-dot');
const statusTxt = document.getElementById('status-text');
const sendBtn   = document.querySelector('.composer-send');

let welcomeEl = document.getElementById('welcome');

function setStatus(state) {
  if (state === 'thinking') {
    statusDot.classList.add('thinking');
    statusTxt.textContent = 'thinking';
  } else {
    statusDot.classList.remove('thinking');
    statusTxt.textContent = 'online';
  }
}

function removeWelcome() {
  if (welcomeEl) {
    welcomeEl.remove();
    welcomeEl = null;
  }
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

function echo(text) {
  return new Promise((resolve) => setTimeout(() => resolve(text), ECHO_DELAY_MS));
}

async function sendMessage(text) {
  appendMessage('user', text);
  const thinkingEl = appendThinking();
  setStatus('thinking');
  sendBtn.disabled = true;

  try {
    const reply = await echo(text);
    thinkingEl.remove();
    appendMessage('anton', reply);
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

input.focus();
