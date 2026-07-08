# ANTON Web — Architecture (v2, browser-native)

A personal AI assistant that runs entirely in a phone's browser. No server, no Termux,
no app install, no OS requirements beyond a modern-enough browser. Free to run: the brain
is the **Groq free tier (primary)**, storage is the browser itself, and the whole thing is
a static web page.

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
  and never calls Groq/Gemini directly - it goes through a router.
- **The hands** are tools the brain can choose: web search, camera, etc. Each hand is one file.

Cross-cutting, because everyone needs them:

- **Identity** - ANTON's constitution: its name, which account it owns, its hard rules
  (never request or store Aaryan's passwords; only touch what's shared with it). Top of every prompt.
- **Memory** - persisted in the browser via IndexedDB. Survives reloads and reboots.

That this whole thing swapped languages and runtimes but kept this exact shape is the point:
the architecture was designed around concepts, so the concepts survived the tech change.

---

## Provider choice: Groq is primary

**Groq is the primary brain.** Two reasons:

1. **Privacy.** Groq does not train on prompts. Gemini's free tier does. For a project whose
   whole identity is "ANTON has its own boundaries and doesn't leak," the non-training provider
   is the right default. Sending every command to a training set contradicted the point.
2. **Reliability in practice.** The Gemini free tier gave real trouble in use; Groq's free tier
   (fast, open-source models, no card) has been the dependable one.

Gemini is currently NOT wired as the live fallback. The router keeps the fallback *seam* so a
second provider can drop in later, but given Gemini's free-tier trains-on-you problem, it is not
the automatic fallback. If/when a second provider is added, it goes in `providers/` and the
router's order updates — one file plus one line, because the seam already exists.

---

## Why static-web-with-no-server is the whole trick

Everything that walled v1 - F-Droid certs, Termux's Android floor, flashing ROMs - was an
OS/package-manager fight. A static web page routes around all of it. The phone already has a
browser; a modern browser natively provides everything ANTON needs:

- **Brain** - fetch() straight to the Groq REST endpoint. Direct browser calls work; no proxy.
- **Memory** - IndexedDB (built into the browser).
- **Ears / Voice** - the Web Speech API (speech-to-text and text-to-speech), built in. *(iOS
  behavior to be verified when we build voice - see Open Questions.)*
- **Eyes** - the camera API grabs a frame -> sent to a multimodal endpoint.
- **The UI** - it *is* a web page, so the dashboard and the app are the same artifact.
  "Add to Home Screen" gives it an icon and fullscreen.

No server means nothing to host that can idle-out, nothing to keep alive, nothing to install.

---

## Hosting and the API key

**Hosting:** the app is pure static files (HTML/CSS/JS), so it goes on free static hosting -
GitHub Pages (repo must be PUBLIC for free Pages). Served from a CDN, so it's free *and*
always-available (no idle-spin-down). Dev loop: **edit on laptop -> git push -> auto-deploys
-> refresh on phone.**

**The API key never lives in the code or the repo.** On first launch, ANTON asks for the Groq
key and stores it in the browser (IndexedDB) on that device only. The committed code and the
served page contain no key - anyone who finds the URL sees only code. The key exists solely on
the phone it was typed into. A "reset key" control lets you re-enter it.

**Blast radius is near-zero by design:** the key belongs to ANTON's *own* account, no payment
method attached. Worst case, an exposed key is a revocable, rate-limited free key - never money.

---

## File structure (target state - do NOT create it all on day one)

```
anton-cloud/
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
    |   |- router.js        # provider choice (Groq primary), 429 handling, step caps, caching
    |   \- providers/
    |       |- groq.js      # fetch() to Groq (PRIMARY)
    |       \- gemini.js    # optional secondary; not the live fallback (trains on prompts)
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
4. brain/router.js picks Groq -> calls providers/groq.js. The fallback seam exists for a future
   secondary provider.
5. If the model requests a tool, loop.js runs the matching tools/ file, feeds the result back,
   and loops - up to the router's step cap.
6. The answer returns to the door. memory/store.js saves what matters.

Swap the door for a different one later and nothing else moves.

---

## Build order - which files exist when (weekends-only; each ends in a demo)

| Weekend | What gets built | State |
|---|---|---|
| 0 (redo) | Static page that echoes, hosted, opened on iPhone | DONE |
| 1 | Groq brain + on-device key + identity + router seam | DONE |
| 2 | Memory (IndexedDB) + ReAct loop + first tool (web search) | NEXT |
| 3 | Voice: mic -> Web Speech API -> brain -> speech out | later |
| 4 | Home-screen icon, fullscreen, the animated/"real app" UI pass | later |
| 5 | Lock it: Guided Access on iPhone (manual, single-operator) | later |
| later | New Android device -> kiosk-browser lockdown = boots into ANTON | later |

---

## Rules for Claude Code working in this repo

- **Vanilla JS, no build step, no framework** unless a real need appears. Plain files a browser
  opens. Keep dependencies near zero. Must deploy to GitHub Pages with zero build.
- **main.js wires everything; index.html is the entry.**
- **The brain never touches the DOM; a door never calls Groq/Gemini directly.** All model access
  goes through brain/llm.js -> brain/router.js so provider logic lives in one place.
- **A tool is one file in tools/ implementing base.js's contract.** Adding a hand never touches
  the loop.
- **The API key is entered on-device and stored in IndexedDB. Never commit it, never bake it into
  served files, never put it in config.js.**
- **Identity rules are enforced, not decorative:** never request/store Aaryan's passwords; only
  access what's explicitly shared with ANTON's own account.
- **Design for "active while the screen is on."** Browser tabs don't run reliably in the
  background, especially on iOS - ANTON is a screen-on, foreground assistant.
- **Port, don't import, from the old Python ANTON.** Read how it solved memory/ReAct, rewrite
  clean in JS.

---

## Open questions (verify when we reach the relevant layer - do not assume)

- **Web Speech API on iOS Safari:** speech-in and voice-out have known iOS quirks (autoplay/tap-to-start,
  pausing when the tab loses focus). Verify at Weekend 3 and design voice around what it actually does.
- **Multimodal on Groq:** confirm the camera/vision path when we build the eyes hand - Groq's vision
  support and model availability need checking; may need a secondary provider for images.
- **Direct Groq fetch longevity:** direct browser calls work now; if CORS ever tightens, the fallback
  is a tiny free serverless proxy (Cloudflare Worker) - NOT a phone server, so it wouldn't reopen
  the Termux problem.
