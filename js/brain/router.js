import * as gemini from './providers/gemini.js';
import * as groq from './providers/groq.js';
import { MAX_RETRIES } from '../config.js';

const CACHE_LIMIT = 20;
const recentCache = new Map();

function cacheKeyFor(messages) {
  return JSON.stringify(messages);
}

function rememberReply(key, reply) {
  recentCache.set(key, reply);
  if (recentCache.size > CACHE_LIMIT) {
    const oldestKey = recentCache.keys().next().value;
    recentCache.delete(oldestKey);
  }
}

export async function chat(messages, apiKey) {
  const cacheKey = cacheKeyFor(messages);
  if (recentCache.has(cacheKey)) {
    return recentCache.get(cacheKey);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const reply = await gemini.generate(messages, apiKey);
      rememberReply(cacheKey, reply);
      return reply;
    } catch (err) {
      lastError = err;
      if (err.status === 429) {
        break;
      }
    }
  }

  if (lastError && lastError.status === 429) {
    const reply = await groq.generate(messages, apiKey);
    rememberReply(cacheKey, reply);
    return reply;
  }

  throw lastError;
}
