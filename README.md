# ANTON

A personal AI assistant that runs entirely in a phone's browser — no server, no app install.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and build plan.

## Status

**Weekend 2** — ANTON now remembers and reasons. Conversation history persists in IndexedDB
across reloads, and messages flow through a ReAct loop (think → act → observe → repeat) that
can call one tool — `web_search`, which searches Wikipedia (not the general web; see notes in
`js/tools/web_search.js`) — before giving a final answer. A hard step cap keeps the loop from
spamming the free tier. The visual/design pass is still Weekend 4.

Gemini is implemented (`js/brain/providers/gemini.js`) but currently unused — its free tier
returned a hard `limit: 0` on every quota metric for this account's region, so the router
calls Groq directly instead. Groq's CORS support was verified live (`access-control-allow-origin: *`),
resolving the open question in ARCHITECTURE.md.

## Running locally

No build step. Serve the directory with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. On first load, paste a Groq API key when prompted
(get one free at [console.groq.com/keys](https://console.groq.com/keys)). Use "reset key" in
the header to clear and re-enter it, and "clear memory" to wipe the persisted conversation.

## Structure

- `index.html` — the shell: door + dashboard UI + the on-device key-entry gate
- `css/anton.css` — styles
- `js/main.js` — boot: wires the door to the agent, restores history, handles the key gate
- `js/config.js` — model names, endpoints, retry/step/history caps (never the key)
- `js/identity.js` — ANTON's system prompt/constitution
- `js/memory/store.js` — IndexedDB read/write: the on-device API key and persisted conversation history
- `js/brain/llm.js` — the one entry point for model access: `chat(messages)`
- `js/brain/router.js` — retry cap, response cache, calls the active provider (Groq)
- `js/brain/providers/groq.js` — real Groq chat-completions calls (active provider)
- `js/brain/providers/gemini.js` — real Gemini calls (implemented, currently unused — see Status)
- `js/agent/loop.js` — the ReAct loop: calls `llm.js`, parses tool-call requests, runs tools, enforces the step cap
- `js/agent/prompt.js` — assembles identity + capped history + tool instructions + the user's message
- `js/tools/base.js` — the tool contract: `{ name, description, run(args) }`
- `js/tools/web_search.js` — the first hand: real Wikipedia search (CORS-verified, keyless)
