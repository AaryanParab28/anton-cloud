import { SYSTEM_PROMPT } from '../identity.js';
import { MAX_CONTEXT_MESSAGES } from '../config.js';

function toolsBlock(tools) {
  const lines = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  return (
    `You have access to the following tools:\n${lines}\n\n` +
    'To use a tool, respond with ONLY a single JSON object in this exact shape, and nothing ' +
    'else in the response:\n{"tool": "<tool name>", "args": { ... }}\n\n' +
    "If you don't need a tool, just answer normally in plain text. After a tool result comes " +
    'back, either call another tool if you truly need to, or give your final answer in plain text.'
  );
}

export function buildMessages({ history, tools, userMessage }) {
  const recentHistory = history.slice(-MAX_CONTEXT_MESSAGES);
  const systemContent = tools.length ? `${SYSTEM_PROMPT}\n\n${toolsBlock(tools)}` : SYSTEM_PROMPT;

  return [
    { role: 'system', content: systemContent },
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];
}
