import { chat } from '../brain/llm.js';
import { buildMessages } from './prompt.js';
import { MAX_AGENT_STEPS } from '../config.js';
import webSearchTool from '../tools/web_search.js';

const TOOLS = [webSearchTool];

function findTool(name) {
  return TOOLS.find((t) => t.name === name);
}

function parseToolCall(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.tool === 'string') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export async function run({ history, userMessage, onStep, voiceMode = false }) {
  const messages = buildMessages({ history, tools: TOOLS, userMessage, voiceMode });

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    const reply = await chat(messages);
    const toolCall = parseToolCall(reply);

    if (!toolCall) {
      return reply;
    }

    messages.push({ role: 'assistant', content: reply });

    const tool = findTool(toolCall.tool);
    if (!tool) {
      messages.push({
        role: 'user',
        content: `Tool result for ${toolCall.tool}: error - unknown tool. Please answer directly instead.`,
      });
      continue;
    }

    onStep?.(tool.name);

    let result;
    try {
      result = await tool.run(toolCall.args || {});
    } catch (err) {
      result = `error running tool: ${err.message}`;
    }

    messages.push({ role: 'user', content: `Tool result for ${tool.name}: ${result}` });
  }

  return "I couldn't finish reasoning within the step limit — here's what I have so far, but I may be missing information.";
}
