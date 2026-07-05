import { GROQ_ENDPOINT, GROQ_MODEL } from '../../config.js';

export async function generate(messages, apiKey) {
  if (!apiKey) {
    throw new Error('No Groq API key configured.');
  }

  const body = {
    model: GROQ_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Network error reaching Groq. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      const err = new Error('Groq rate limit hit (429).');
      err.status = 429;
      throw err;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Groq rejected the API key. Reset the key and try again.');
    }

    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message;
    throw new Error(`Groq error ${response.status}: ${message || 'unknown error'}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) {
    throw new Error('Groq returned an empty response.');
  }
  return text;
}
