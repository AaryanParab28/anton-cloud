import { openMicStream } from './stt.js';
import { BARGE_IN_THRESHOLD, BARGE_IN_SUSTAIN_MS } from '../config.js';

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let monitorStream = null;
let rafId = null;
let aboveThresholdSince = null;
let active = false;

function currentLevel() {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const norm = (data[i] - 128) / 128;
    sumSquares += norm * norm;
  }
  return Math.sqrt(sumSquares / data.length);
}

export async function startMonitoring(onBargeIn) {
  if (active) {
    return;
  }

  let stream;
  try {
    stream = await openMicStream();
  } catch {
    return;
  }

  if (active) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  monitorStream = stream;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  sourceNode.connect(analyser);
  active = true;
  aboveThresholdSince = null;

  const tick = () => {
    if (!active) {
      return;
    }
    const level = currentLevel();
    const now = performance.now();
    if (level >= BARGE_IN_THRESHOLD) {
      if (aboveThresholdSince === null) {
        aboveThresholdSince = now;
      } else if (now - aboveThresholdSince >= BARGE_IN_SUSTAIN_MS) {
        stopMonitoring();
        onBargeIn();
        return;
      }
    } else {
      aboveThresholdSince = null;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopMonitoring() {
  active = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  if (monitorStream) {
    monitorStream.getTracks().forEach((track) => track.stop());
    monitorStream = null;
  }
  analyser = null;
  aboveThresholdSince = null;
}

export function isMonitoring() {
  return active;
}
