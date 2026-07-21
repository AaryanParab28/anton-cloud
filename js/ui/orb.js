// The orb: a WebGL particle-sphere "presence" rendered with Three.js (the one deliberate CDN
// dependency in this repo - loaded via the import map in index.html, no npm/build step). A
// single THREE.Points draw call carries thousands of particles arranged on a fibonacci-sphere
// shell; all motion (breathing, turbulence, rotation) happens in the vertex shader driven by a
// handful of uniforms, so there is no per-particle JS work per frame.

import * as THREE from 'three';

// Tune density here. Cost scales with vertex count (cheap on mobile GPUs at this scale) and
// with overdraw from additive blending, not with JS work - the render loop never loops over
// particles in JS. Raise for a denser shell, lower if a specific device struggles.
const PARTICLE_COUNT = 9000;

const MAX_DPR = 2; // cap backing-store resolution; higher gains nothing visible, only cost

// Raw mic RMS (see watchStreamLevel) sits roughly in the 0.05-0.2 range for normal speech
// (same range BARGE_IN_THRESHOLD in config.js tunes against). This gain punches that up into
// a visually satisfying 0..1 swing without changing the underlying math.
const LEVEL_GAIN = 2.4;
const LEVEL_SMOOTHING = 8; // per-second lerp rate toward the target level

const BASE_RADIUS = 2.1;
const CAMERA_Z = 6.2; // calibrated framing for aspect >= 1 (landscape/square)
const FOV_DEG = 45;
const HALF_FOV_TAN = Math.tan(((FOV_DEG * Math.PI) / 180) / 2);
// A fixed-distance perspective camera makes the sphere look BIGGER, not smaller, as the
// viewport narrows (vertical FOV is constant, so a narrower width eats into the same margin
// faster) - exactly wrong for a portrait phone, the primary target. FIT_FACTOR derives from the
// desktop-calibrated CAMERA_Z above so aspect >= 1 is unchanged, while resize() pulls the camera
// back proportionally for aspect < 1 so the sphere no longer overflows a narrow width.
const FIT_FACTOR = BASE_RADIUS / (CAMERA_Z * HALF_FOV_TAN);

const VALID_STATES = new Set(['idle', 'listening', 'thinking', 'speaking']);

// Ashima Arts' public-domain 3D simplex noise (the standard compact GLSL implementation used
// throughout WebGL shader work) - drives the per-particle radial displacement so the shell
// flows and shimmers instead of sitting static.
const SIMPLEX_NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const VERTEX_SHADER = `
${SIMPLEX_NOISE_GLSL}

uniform float uTime;
uniform float uBaseRadius;
uniform float uTurbulence;
uniform float uBreath;
uniform float uRotation;
uniform float uPointSize;
uniform float uDPR;

attribute vec3 aBaseDir;
attribute float aRadius0;
attribute float aSeed;
attribute float aColorT;

varying float vColorT;
varying float vSparkle;

vec3 rotateY(vec3 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  float n = snoise(aBaseDir * 1.6 + vec3(0.0, 0.0, uTime * 0.18) + aSeed * 12.0);
  float radius = uBaseRadius * aRadius0 * (1.0 + uBreath) * (1.0 + n * uTurbulence);

  vec3 pos = rotateY(aBaseDir * radius, uRotation);

  vColorT = aColorT;
  vSparkle = 0.65 + 0.35 * sin(uTime * 2.2 + aSeed * 30.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uPointSize * uDPR * (120.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
uniform float uBlueBias;

varying float vColorT;
varying float vSparkle;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float alpha = smoothstep(1.0, 0.0, d);
  alpha *= alpha;

  vec3 colorBlue = vec3(0.42, 0.55, 1.0);
  vec3 colorPurple = vec3(0.68, 0.35, 1.0);
  vec3 color = mix(colorBlue, colorPurple, vColorT);
  color = mix(color, colorBlue, uBlueBias);

  float intensity = alpha * vSparkle * 0.85;
  gl_FragColor = vec4(color * intensity, intensity);
}
`;

let renderer = null;
let scene = null;
let camera = null;
let points = null;
let uniforms = null;

let state = 'idle';
let targetLevel = 0;
let displayedLevel = 0;
let rotation = 0;
let simPhase = 0;
let lastTs = null;
let rafId = null;

// True while a real audio analyser (Groq TTS playback) is driving the 'speaking' state via
// watchAnalyserLevel below. False falls back to the simulated waveform in paramsForState -
// the browser SpeechSynthesis path exposes no amplitude to read.
let speakingRealLevelActive = false;

function buildAttributes(count) {
  const positions = new Float32Array(count * 3);
  const baseDir = new Float32Array(count * 3);
  const radius0 = new Float32Array(count);
  const seed = new Float32Array(count);
  const colorT = new Float32Array(count);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - (y * y)));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    baseDir[i * 3] = x;
    baseDir[(i * 3) + 1] = y;
    baseDir[(i * 3) + 2] = z;

    positions[i * 3] = x;
    positions[(i * 3) + 1] = y;
    positions[(i * 3) + 2] = z;

    radius0[i] = 0.86 + (Math.random() * 0.28); // shell thickness jitter, for depth
    seed[i] = Math.random();
    colorT[i] = (y * 0.5) + 0.5;
  }

  return {
    positions, baseDir, radius0, seed, colorT,
  };
}

function paramsForState(t, dt) {
  if (state === 'listening') {
    return {
      turbulence: 0.05 + (displayedLevel * 0.55),
      breath: 0.05 + (displayedLevel * 0.35),
      rotSpeed: 0.12 + (displayedLevel * 0.4),
      blueBias: 0,
    };
  }
  if (state === 'speaking') {
    if (speakingRealLevelActive) {
      // Real Groq TTS playback amplitude - same shape of response as 'listening', just tuned
      // for the speaking context (always at least gently active, never fully still).
      return {
        turbulence: 0.08 + (displayedLevel * 0.5),
        breath: 0.05 + (displayedLevel * 0.3),
        rotSpeed: 0.22 + (displayedLevel * 0.2),
        blueBias: 0,
      };
    }
    // Browser SpeechSynthesis fallback: no amplitude is exposed, so simulate a waveform.
    simPhase += dt;
    const sim = 0.3 + (0.22 * Math.sin(simPhase * 5.3)) + (0.13 * Math.sin((simPhase * 11.1) + 1.7));
    const clamped = Math.max(0, Math.min(1, sim));
    return {
      turbulence: 0.08 + (clamped * 0.4),
      breath: 0.05 + (clamped * 0.25),
      rotSpeed: 0.22,
      blueBias: 0,
    };
  }
  if (state === 'thinking') {
    return {
      turbulence: 0.14 + (0.05 * Math.sin(t * 4)),
      breath: 0.06,
      rotSpeed: -0.5, // reversed + faster: reads as "processing", not idle
      blueBias: 0.55, // pushes further toward blue, distinct from the resting blue-purple mix
    };
  }
  return {
    turbulence: 0.04 + (0.02 * Math.sin(t * 0.7)),
    breath: 0.03 * Math.sin(t * 0.6),
    rotSpeed: 0.06,
    blueBias: 0,
  };
}

function resize() {
  if (!renderer) return;
  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  const minAspectFactor = Math.min(1, aspect);
  camera.position.z = BASE_RADIUS / (FIT_FACTOR * minAspectFactor * HALF_FOV_TAN);
  camera.updateProjectionMatrix();
}

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!renderer) return;

  if (lastTs === null) lastTs = now;
  const dt = Math.min((now - lastTs) / 1000, 0.05);
  lastTs = now;
  const t = now / 1000;

  displayedLevel += (targetLevel - displayedLevel) * Math.min(1, dt * LEVEL_SMOOTHING);

  const {
    turbulence, breath, rotSpeed, blueBias,
  } = paramsForState(t, dt);
  rotation += rotSpeed * dt;

  uniforms.uTime.value = t;
  uniforms.uTurbulence.value = turbulence;
  uniforms.uBreath.value = breath;
  uniforms.uRotation.value = rotation;
  uniforms.uBlueBias.value = blueBias;

  renderer.render(scene, camera);
}

function onVisibilityChange() {
  if (document.hidden) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  } else if (rafId === null && renderer) {
    lastTs = null;
    rafId = requestAnimationFrame(frame);
  }
}

function onContextLost(event) {
  event.preventDefault();
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function init(canvasEl) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  } catch (err) {
    // No WebGL available (very old device/browser) - fail closed rather than crash the app.
    // setState/setLevel below stay harmless no-ops since `renderer` never gets set.
    console.error('ANTON orb: WebGL unavailable, orb will not render.', err);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const {
    positions, baseDir, radius0, seed, colorT,
  } = buildAttributes(PARTICLE_COUNT);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aBaseDir', new THREE.BufferAttribute(baseDir, 3));
  geometry.setAttribute('aRadius0', new THREE.BufferAttribute(radius0, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('aColorT', new THREE.BufferAttribute(colorT, 1));

  uniforms = {
    uTime: { value: 0 },
    uBaseRadius: { value: BASE_RADIUS },
    uTurbulence: { value: 0.04 },
    uBreath: { value: 0 },
    uRotation: { value: 0 },
    uBlueBias: { value: 0 },
    uPointSize: { value: 1.5 },
    uDPR: { value: renderer.getPixelRatio() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  canvasEl.addEventListener('webglcontextlost', onContextLost);

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

// Shared RMS-level tick loop. `markSpeaking: true` flags the 'speaking' state as
// analyser-driven (see paramsForState) for the duration of this watch.
function watchAnalyser(analyser, { markSpeaking = false } = {}) {
  const data = new Uint8Array(analyser.fftSize);
  let raf = null;
  let stopped = false;
  if (markSpeaking) speakingRealLevelActive = true;

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
    if (markSpeaking) speakingRealLevelActive = false;
    setLevel(0);
  };
}

// Builds its own AudioContext/AnalyserNode from a live MediaStream (used for LISTENING, fed by
// the mic recording stream in stt.js).
export function watchStreamLevel(stream) {
  if (!stream) {
    return () => {};
  }
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const stopWatch = watchAnalyser(analyser);

  return function stop() {
    stopWatch();
    source.disconnect();
    audioCtx.close().catch(() => {});
  };
}

// Takes an already-built AnalyserNode (used for SPEAKING, fed by tts.js's Groq TTS <audio>
// playback graph) and marks the 'speaking' state as real-amplitude-driven for the duration.
export function watchAnalyserLevel(analyser) {
  if (!analyser) {
    return () => {};
  }
  return watchAnalyser(analyser, { markSpeaking: true });
}
