# ANTON

A personal AI assistant that runs entirely in a phone's browser — no server, no app install.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and build plan.

## Status

**Weekend 0** — a static page that echoes what you type back to you. This proves the
foundation (hosting, UI shell, no-server model) before the real brain gets wired in.

## Running locally

No build step. Serve the directory with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

- `index.html` — the shell: door + dashboard UI
- `css/anton.css` — styles
- `js/main.js` — boot: wires the door to the (for now, echoing) brain
