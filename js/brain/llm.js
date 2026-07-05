import { chat as routeChat } from './router.js';
import { getApiKey } from '../memory/store.js';

export async function chat(messages) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('No Gemini API key configured.');
  }
  return routeChat(messages, apiKey);
}
