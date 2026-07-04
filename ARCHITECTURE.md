# ANTON Web — Architecture (v2, browser-native)

A personal AI assistant that runs entirely in a phone's browser. No server, no Termux,
no app install, no OS requirements beyond a modern-enough browser. Free to run: the brain
is the Gemini free tier (Groq as a possible fallback), storage is the browser itself, and
the whole thing is a static web page.

Phase 1 host: **iPhone**, opened in Safari, locked with Guided Access — a single-operator
setup (only Aaryan uses it, so manual lock/unlock is fine and the iPhone handles rich
animation well). Phase 2 host, later: **a modern Android device** for a true boots-into-ANTON
kiosk. Same web app on both — the device is just another way to open the same URL.

> This replaces the v1 architecture (Python / Flask / Termux daemon), which was abandoned
> because the target phone (OnePlus X, Android 6) is below Termux's Android 7 floor. The
> **concepts** below are carried over unchanged from v1; only the implementation moved from
> Python-on-a-server to JavaScript-in-a-browser.

---

## The one organizing idea (unchanged from v1)

```
  a DOOR  ->  the BRAIN  ->  the HANDS
 (input)      (reasoning)     (actions)
```

- **Doors** are ways to talk to ANTON. The dashboard (this web page) is the door. Voice is a
  later door. A door is dumb - it carries text in and results out.
- **The brain** is provider-agnostic reasoning. It never knows which door a message came from,
  and never calls Gemini/Groq directly - it goes through a router.
- **The hands** are tools the brain can choose: web search, camera, etc. Each hand is one file.

Cross-cutting, because everyone needs them:

- **Identity** - ANTON's constitution: its name, which account it owns, its hard rules
  (never request or store Aaryan's passwords; only touch what's shared with it). Top of every prompt.
- **Memory** - persisted in the browser via IndexedDB. Survives reloads and reboots.

That this whole thing swapped languages and runtimes but kept this exact shape is the point:
the architecture was designed around concepts, so the concepts survived the tech change.

---

## Why static-web-with-no-server is the whole trick

Everything that walled v1 - F-Droid certs, Termux's Android floor, flashing ROMs - was an
OS/package-manager fight. A static web page routes around all of it. The phone already has a
browser; a modern browser natively provides everything ANTON needs:

- **Brain** - fetch() straight to the Gemini REST endpoint. Direct browser calls work; no proxy.
- **Memory** - IndexedDB (built into the browser).
- **Ears / Voice** - the Web Speech API (speech-to-text and text-to-speech), built in. *(iOS
  behavior to be verified when we build voice - see Open Questions.)*
- **Eyes** - the camera API grabs a frame -> sent to Gemini's multimodal endpoint.
- **The UI** - it *is* a web page, so the dashboard and the app are the same artifact.
  "Add to Home Screen" gives it an icon and fullscreen.

No server means nothing to host that can idle-out, nothing to keep alive, nothing to install.

---

## Hosting and the API key

**Hosting:** the app is pure static files (HTML/CSS/JS), so it goes on free static hosting -
GitHub Pages or Cloudflare Pages. These serve files from a CDN, so they're free *and*
always-available (no idle-spin-down problem that afflicts server hosting). This also gives the
dev loop: **edit on laptop -> git push -> auto-deploys -> refresh on phone.**

**The API key never lives in the code or the repo.** On first launch, ANTON asks for the Gemini
key and stores it in the browser (IndexedDB) on that device only. The committed code and the
served page contain no key - anyone who finds the URL sees only code. The key exists solely on
the phone it was typed into.

**Blast radius is near-zero by design:** the key belongs to ANTON's *own* Google account, which
has no payment method attached. Worst case, an exposed key is a revocable, rate-limited free
key - never money. (Same isolation principle as giving ANTON its own accounts in v1.)

---

## File structure (target state - do NOT create it all on day one)

```
anton-web/
|- README.md
|- ARCHITECTURE.md          # this file - Claude Code reads it first each session
|- index.html               # the shell: the door + the dashboard UI
|- css/
|   \- anton.css
\- js/
    |- main.js              # boot: wires the door to the agent, handles UI events
    |- config.js            # model names, endpoints, rate-limit numbers (NEVER the key)
    |- identity.js          # ANTON's constitution -> base system prompt
    |
    |- brain/
    |   |- llm.js           # chat(messages) - the ONE function the agent calls
    |   |- router.js        # provider choice, 429 fallback, step caps, caching
    |   \- providers/
    |       |- gemini.js    # fetch() to Gemini (primary)
    |       \- groq.js      # fetch() to Groq (fallback - browser support to verify)
    |
    |- agent/
    |   |- loop.js          # the ReAct loop: think -> act -> observe -> repeat
    |   \- prompt.js        # assembles identity + memory + tool list + input
    |
    |- memory/
    |   \- store.js         # IndexedDB read/write (also holds the API key on-device)
    |
    |- tools/
    |   |- base.js          # the tool contract: name, description, run(args)
    |   \- web_search.js    # first real hand
    |
    \- voice/               # later - Weekend 3
        |- stt.js           # Web Speech API - speech in
        \- tts.js           # Web Speech API - voice out
```

---

## How a message flows (once wired)

1. The door (the input box in index.html, handled by main.js) takes text, hands it to the agent.
2. agent/prompt.js builds the prompt: identity + relevant memory + tool descriptions + the message.
3. agent/loop.js sends it through brain/llm.js.
4. brain/router.js picks Gemini -> calls providers/gemini.js. On a 429, falls back to Groq.
5. If the model requests a tool, loop.js runs the matching tools/ file, feeds the result back,
   and loops - up to the router's step cap.
6. The answer returns to the door. memory/store.js saves what matters.

Swap the door for a different one later and nothing else moves.

---

## Build order - which files exist when (weekends-only; each ends in a demo)

| Weekend | What gets built | Appears |
|---|---|---|
| 0 (redo) | Static page that **echoes**, hosted, opened on iPhone | index.html, main.js, hosting set up |
| 1 | Swap echo for the Gemini brain (key entered on-device, stored in IndexedDB) | brain/, config.js, identity.js, memory/store.js |
| 2 | Port memory + ReAct loop -> reasons across steps, can web-search | agent/, tools/base.js, tools/web_search.js |
| 3 | Voice: mic -> Web Speech API -> brain -> speech out | voice/ |
| 4 | Home-screen icon, fullscreen, the animated/"real app" UI pass | polish in index.html + css/ |
| 5 | Lock it: Guided Access on iPhone (manual, single-operator) | no code - device config |
| later | New Android device -> kiosk-browser lockdown = boots into ANTON | no code - device config |

Weekend 0 is a hosted echo you open on the actual iPhone - proving the new foundation on real
hardware before building on it, the same discipline that (correctly) killed v1 early.

---

## Rules for Claude Code working in this repo

- **Vanilla JS, no build step, no framework** unless a real need appears. It must run as plain
  files a browser opens. Keep dependencies near zero.
- **main.js wires everything; index.html is the entry.**
- **The brain never touches the DOM; a door never calls Gemini/Groq directly.** All model access
  goes through brain/llm.js -> brain/router.js so fallback lives in one place.
- **A tool is one file in tools/ implementing base.js's contract.** Adding a hand never
  touches the loop.
- **The API key is entered on-device and stored in IndexedDB. Never commit it, never bake it into
  served files, never put it in config.js.**
- **Identity rules are enforced, not decorative:** never request/store Aaryan's passwords; only
  access what's explicitly shared with ANTON's own account.
- **Design for "active while the screen is on."** Browser tabs don't run reliably in the
  background, especially on iOS - ANTON is a screen-on, foreground assistant. Don't rely on
  background timers or always-listening.
- **Port, don't import, from the old Python ANTON.** Read how it solved memory/ReAct, rewrite
  clean in JS.

---

## Open questions (verify when we reach the relevant layer - do not assume)

- **Groq from the browser:** does the fallback work client-side, or does CORS block it? If
  blocked, ANTON runs Gemini-only (its free tier is generous enough to solo). Verify at Weekend 1.
- **Web Speech API on iOS Safari:** speech-in and voice-out have known iOS quirks (autoplay/tap-to-start,
  pausing when the tab loses focus). Verify at Weekend 3 and design voice around whatever it actually does.
- **Direct Gemini fetch longevity:** direct browser calls work now; if Google ever tightens CORS,
  the fallback is a tiny free serverless proxy (Cloudflare Worker) - NOT a phone server, so it
  wouldn't reopen the Termux problem.
