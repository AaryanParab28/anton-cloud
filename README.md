# ANTON

A personal AI assistant that runs entirely in a phone's browser — no server, no app install.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and build plan.

## Status

**Weekend 4 (visual pass)** — ANTON is now a full-screen presence, not a chat window. A
glowing blue-to-purple orb (CSS + Canvas 2D — no WebGL, no GPU particle engine) fills the
screen: it breathes slowly when idle, expands and ripples with real mic amplitude while
listening, swirls faster with a distinct hue while thinking, and pulses on a simulated
waveform while speaking (SpeechSynthesis exposes no real amplitude to drive this from — see
the TODO in `js/ui/orb.js` for what changes if TTS ever moves to a streaming cloud voice).
The mic button floats above the orb as the primary control. Typed text and the full
conversation are still there, just tucked into a bottom-sheet transcript panel that slides up
on a tap of the handle — nothing about text mode, memory, or voice is removed, only reskinned.

Underneath, the voice/brain/memory pipeline is unchanged from Weekend 3 + voice polish: ANTON
has ears and a voice, tuned for actual conversation. Tap the mic to push-to-talk; recorded
audio is transcribed via Groq's Whisper endpoint (not the Web Speech API — iOS Safari's
built-in speech recognition doesn't work in standalone/home-screen mode) and fed through the
exact same pipeline a typed message uses. Replies are spoken aloud via SpeechSynthesis,
sanitized so ANTON never reads leaked tool-call JSON/code aloud. When the input came in by
voice, ANTON is told to answer short and conversational instead of full-length (typed replies
are unaffected). While ANTON is speaking, starting to talk (barge-in, detected via a mic-level
monitor) or tapping the mic both stop him instantly and open the mic for your next question. A
"voice: on/off" toggle (now inside the transcript panel) mutes/unmutes spoken replies.

Conversation history persists in IndexedDB across reloads (Weekend 2), and messages flow
through a ReAct loop (think → act → observe → repeat) that can call one tool — `web_search`,
which searches Wikipedia (not the general web; see notes in `js/tools/web_search.js`) — before
giving a final answer. A hard step cap keeps the loop from spamming the free tier.

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
the header to clear and re-enter it, "clear memory" to wipe the persisted conversation, and
"voice: on/off" to mute/unmute spoken replies. Voice input requires mic permission. While
ANTON is speaking, tap the mic to interrupt him — no need to wait for him to finish.

## Structure

- `index.html` — the shell: full-screen orb stage + floating mic + key-gate + bottom-sheet transcript panel (controls, messages, composer)
- `css/anton.css` — styles: dark blue/purple palette, stage/orb layout, bottom-sheet transcript panel, message/composer styling
- `js/main.js` — boot: wires the door to the agent, restores history, handles the key gate, drives the voice state machine (idle/listening/transcribing/responding/speaking), and mirrors that state machine into the orb + transcript-panel toggle
- `js/config.js` — model names, endpoints, retry/step/history/barge-in caps (never the key)
- `js/identity.js` — ANTON's system prompt/constitution
- `js/memory/store.js` — IndexedDB read/write: the on-device API key and persisted conversation history
- `js/brain/llm.js` — the one entry point for model access: `chat(messages)`
- `js/brain/router.js` — retry cap, response cache, calls the active provider (Groq)
- `js/brain/providers/groq.js` — real Groq chat-completions calls (active provider)
- `js/brain/providers/gemini.js` — real Gemini calls (implemented, currently unused — see Status)
- `js/agent/loop.js` — the ReAct loop: calls `llm.js`, parses tool-call requests, runs tools, enforces the step cap
- `js/agent/prompt.js` — assembles identity + capped history + tool instructions + the user's message + a spoken-style instruction when the turn came in by voice
- `js/tools/base.js` — the tool contract: `{ name, description, run(args) }`
- `js/tools/web_search.js` — the first hand: real Wikipedia search (CORS-verified, keyless)
- `js/voice/stt.js` — push-to-talk recording (MediaRecorder, echo-cancelling constraints) + Groq Whisper transcription; exposes the live recording stream so the orb can read mic level off it
- `js/voice/tts.js` — SpeechSynthesis output, sanitized, with iOS first-gesture unlock, mute toggle, and a `stopSpeaking()`/`onEnd` seam for barge-in
- `js/voice/barge_in.js` — mic-level monitor (Web Audio AnalyserNode) that detects the user talking over ANTON and interrupts him
- `js/ui/orb.js` — the CSS/Canvas-2D orb: layered radial gradients + a rotating particle ring, driven by `setState('idle'|'listening'|'thinking'|'speaking')` and `setLevel(0..1)`; `watchStreamLevel()` wires a MediaStream to live amplitude
