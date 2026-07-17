// The orb: a CSS/Canvas-2D "presence" that stands in for a chat window. No WebGL, no GPU
// particle engine - just layered radial gradients and a small rotating particle ring, chosen
// to stay light enough for smooth 60fps on a phone.

const PARTICLE_COUNT = 26;
const HUE_BLUE = 250;
const HUE_PURPLE = 285;
const HUE_THINKING = 308;

// Raw mic RMS (see watchStreamLevel) sits in roughly the same small range as
// BARGE_IN_THRESHOLD in config.js (~0.05-0.2 for normal speech). This gain punches that up
// into a visually satisfying 0..1 swing for the orb without changing the underlying math.
const LEVEL_GAIN = 2.4;
const LEVEL_SMOOTHING = 8; // per-second lerp rate toward the target level
const MAX_DPR = 2; // cap backing-store resolution; higher gains nothing visible, only cost

const VALID_STATES = new Set(['idle', 'listening', 'thinking', 'speaking']);

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;

let state = 'idle';
let targetLevel = 0;
let displayedLevel = 0;
let ringAngle = 0;
let simPhase = 0;
let lastTs = null;
let rafId = null;
let particles = [];

function buildParticles() {
  particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    angleOffset: (i / PARTICLE_COUNT) * Math.PI * 2,
    radiusJitter: Math.random() * 2 - 1,
    sizeBase: 1.3 + Math.random() * 1.7,
    speedMul: 0.85 + Math.random() * 0.3,
  }));
}

function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawGlowHalo(cx, cy, r, hueEnd) {
  const glowR = r * 2.4;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, glowR);
  grad.addColorStop(0, `hsla(${HUE_BLUE}, 85%, 60%, 0.35)`);
  grad.addColorStop(0.5, `hsla(${(HUE_BLUE + hueEnd) / 2}, 80%, 55%, 0.12)`);
  grad.addColorStop(1, `hsla(${hueEnd}, 80%, 50%, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoreSphere(cx, cy, r, hueEnd) {
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r);
  grad.addColorStop(0, `hsla(${HUE_BLUE}, 95%, 78%, 0.95)`);
  grad.addColorStop(0.45, `hsla(${(HUE_BLUE + hueEnd) / 2}, 88%, 62%, 0.9)`);
  grad.addColorStop(1, `hsla(${hueEnd}, 80%, 42%, 0.85)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticleRing(cx, cy, coreR, angle, amplitude, hueEnd) {
  const ringR = coreR * (1.5 + amplitude * 0.4);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const a = angle * p.speedMul + p.angleOffset;
    const rr = ringR * (1 + p.radiusJitter * 0.15);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    const size = p.sizeBase * (1 + amplitude * 0.5);
    const hue = hueEnd - ((i % 5) * 4);
    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${0.5 + 0.3 * Math.sin(a * 2)})`;
    ctx.shadowColor = `hsla(${hue}, 90%, 65%, 0.9)`;
    ctx.shadowBlur = 6;
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function amplitudeForState(t, dt) {
  if (state === 'listening') {
    return {
      amplitude: 0.15 + displayedLevel * 0.9,
      rotSpeed: 0.15 + displayedLevel * 0.6,
      hueEnd: HUE_PURPLE,
    };
  }
  if (state === 'speaking') {
    simPhase += dt;
    const sim = 0.3 + 0.22 * Math.sin(simPhase * 5.3) + 0.13 * Math.sin((simPhase * 11.1) + 1.7);
    const clamped = Math.max(0, Math.min(1, sim));
    return {
      amplitude: 0.2 + clamped * 0.7,
      rotSpeed: 0.3,
      hueEnd: HUE_PURPLE,
    };
  }
  if (state === 'thinking') {
    return {
      amplitude: 0.18 + (0.06 * Math.sin(t * 4)),
      rotSpeed: -0.55,
      hueEnd: HUE_THINKING,
    };
  }
  return {
    amplitude: 0.06 + (0.05 * Math.sin(t * 0.8)),
    rotSpeed: 0.08,
    hueEnd: HUE_PURPLE,
  };
}

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!ctx) return;

  if (lastTs === null) lastTs = now;
  const dt = Math.min((now - lastTs) / 1000, 0.05);
  lastTs = now;
  const t = now / 1000;

  displayedLevel += (targetLevel - displayedLevel) * Math.min(1, dt * LEVEL_SMOOTHING);

  const { amplitude, rotSpeed, hueEnd } = amplitudeForState(t, dt);
  ringAngle += rotSpeed * dt;

  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height * 0.42;
  const baseRadius = Math.min(width, height) * 0.16;
  const coreRadius = baseRadius * (1 + amplitude * 0.5);

  drawGlowHalo(cx, cy, coreRadius, hueEnd);
  drawCoreSphere(cx, cy, coreRadius, hueEnd);
  drawParticleRing(cx, cy, coreRadius, ringAngle, amplitude, hueEnd);
}

function onVisibilityChange() {
  if (document.hidden) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  } else if (rafId === null) {
    lastTs = null;
    rafId = requestAnimationFrame(frame);
  }
}

export function init(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  buildParticles();
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibilityChange);
  lastTs = null;
  rafId = requestAnimationFrame(frame);
}

export function setState(next) {
  if (!VALID_STATES.has(next) || next === state) {
    return;
  }
  state = next;
  if (state !== 'listening') {
    targetLevel = 0;
  }
}

export function setLevel(value) {
  targetLevel = Math.max(0, Math.min(1, value));
}

// Real amplitude reactivity for SPEAKING becomes possible if/when TTS moves from
// SpeechSynthesis (no audio stream exposed) to a cloud provider that returns actual audio -
// at that point this simulated waveform in amplitudeForState() can be replaced with a real
// AnalyserNode on that stream, the same way watchStreamLevel() below already works for LISTENING.
export function watchStreamLevel(stream) {
  if (!stream) {
    return () => {};
  }
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let raf = null;
  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const norm = (data[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    setLevel(Math.sqrt(sumSquares / data.length) * LEVEL_GAIN);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return function stop() {
    stopped = true;
    if (raf !== null) cancelAnimationFrame(raf);
    source.disconnect();
    audioCtx.close().catch(() => {});
    setLevel(0);
  };
}
