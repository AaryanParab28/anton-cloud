export const GEMINI_MODEL = 'gemini-2.0-flash';
export const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const GROQ_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const MAX_RETRIES = 2;

// How many recent conversation turns get sent to the model each request (protects the free tier).
export const MAX_CONTEXT_MESSAGES = 16;

// Hard cap on ReAct loop iterations (model calls) per user turn.
export const MAX_AGENT_STEPS = 5;

// Groq's Whisper transcription endpoint (STT). Separate from the chat model above.
export const WHISPER_MODEL = 'whisper-large-v3-turbo';
export const WHISPER_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Groq's TTS endpoint (Preview status as of writing). Orpheus (Canopy Labs) caps `input` at
// 200 characters per request — tts.js chunks longer replies and plays them back-to-back.
// Change TTS_VOICE to any of: autumn, diana, hannah (female), austin, daniel, troy (male).
export const TTS_MODEL = 'canopylabs/orpheus-v1-english';
export const TTS_ENDPOINT = 'https://api.groq.com/openai/v1/audio/speech';
export const TTS_VOICE = 'austin';
export const TTS_RESPONSE_FORMAT = 'wav'; // the only format Orpheus currently supports
export const TTS_MAX_INPUT_CHARS = 180; // stays under Orpheus's 200-char cap with margin

// Barge-in: mic RMS level (0..1) that counts as "user started talking" while ANTON is speaking.
// Raise if it triggers on background noise/echo; lower if it misses normal speaking volume.
export const BARGE_IN_THRESHOLD = 0.08;

// How long input must stay above BARGE_IN_THRESHOLD before it's trusted as real speech
// (guards against short blips/coughs). Raise for fewer false triggers, lower for faster response.
export const BARGE_IN_SUSTAIN_MS = 250;
