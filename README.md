# ANTON

A personal AI assistant that runs entirely in a phone's browser — no server, no app install.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and build plan.

## Status

**Weekend 1** — the echo is gone. ANTON now talks to a real brain via Groq: paste an API key
once (stored on-device in IndexedDB, never in the repo), and every message is answered by
the model, prefixed with ANTON's identity/constitution. No conversation memory across
reloads yet — that's Weekend 2.

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
(get one free at [console.groq.com/keys](https://console.groq.com/keys)). Use the
"reset key" control in the header to clear and re-enter it.

## Structure

- `index.html` — the shell: door + dashboard UI + the on-device key-entry gate
- `css/anton.css` — styles
- `js/main.js` — boot: wires the door to the brain, handles the key gate
- `js/config.js` — model names, endpoints, retry cap (never the key)
- `js/identity.js` — ANTON's system prompt/constitution
- `js/memory/store.js` — IndexedDB read/write, including the on-device API key
- `js/brain/llm.js` — the one entry point the app calls: `chat(messages)`
- `js/brain/router.js` — retry cap, response cache, calls the active provider (Groq)
- `js/brain/providers/groq.js` — real Groq chat-completions calls (active provider)
- `js/brain/providers/gemini.js` — real Gemini calls (implemented, currently unused — see Status)
