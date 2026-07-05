# ANTON

A personal AI assistant that runs entirely in a phone's browser — no server, no app install.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and build plan.

## Status

**Weekend 1** — the echo is gone. ANTON now talks to a real Gemini brain: paste an API key
once (stored on-device in IndexedDB, never in the repo), and every message is answered by
the model, prefixed with ANTON's identity/constitution. No conversation memory across
reloads yet — that's Weekend 2.

## Running locally

No build step. Serve the directory with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. On first load, paste a Gemini API key when prompted
(get one free at [aistudio.google.com](https://aistudio.google.com/apikey)). Use the
"reset key" control in the header to clear and re-enter it.

## Structure

- `index.html` — the shell: door + dashboard UI + the on-device key-entry gate
- `css/anton.css` — styles
- `js/main.js` — boot: wires the door to the brain, handles the key gate
- `js/config.js` — model name, endpoint, retry cap (never the key)
- `js/identity.js` — ANTON's system prompt/constitution
- `js/memory/store.js` — IndexedDB read/write, including the on-device API key
- `js/brain/llm.js` — the one entry point the app calls: `chat(messages)`
- `js/brain/router.js` — provider choice, 429 fallback, retry cap, response cache
- `js/brain/providers/gemini.js` — real Gemini `generateContent` calls
- `js/brain/providers/groq.js` — fallback stub (not implemented yet)
