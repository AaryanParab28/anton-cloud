import { GEMINI_ENDPOINT } from '../../config.js';

function toGeminiContents(messages) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

function systemInstructionFrom(messages) {
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  return systemText ? { parts: [{ text: systemText }] } : undefined;
}

export async function generate(messages, apiKey) {
  if (!apiKey) {
    throw new Error('No Gemini API key configured.');
  }

  const body = { contents: toGeminiContents(messages) };
  const systemInstruction = systemInstructionFrom(messages);
  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Network error reaching Gemini. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      const err = new Error('Gemini rate limit hit (429).');
      err.status = 429;
      throw err;
    }

    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message;
    const isInvalidKey = (errorBody?.error?.details ?? []).some(
      (d) => d.reason === 'API_KEY_INVALID',
    );

    if (response.status === 401 || response.status === 403 || isInvalidKey) {
      throw new Error('Gemini rejected the API key. Reset the key and try again.');
    }
    throw new Error(`Gemini error ${response.status}: ${message || 'unknown error'}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }
  return text;
}
