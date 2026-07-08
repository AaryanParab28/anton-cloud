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
