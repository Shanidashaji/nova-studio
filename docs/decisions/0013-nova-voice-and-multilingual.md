# ADR-0013: NOVA's robotic figure, multilingual replies and voice conversation

**Status:** Accepted (2026-11-22)

## Context

NOVA needs its own visual identity: a robotic companion that shows what it is doing. It also needs to understand people who write or speak in Malayalam, Hindi, Tamil, Arabic, Urdu and other languages, often mixed with English technical words, and to reply in the same language, aloud when asked. The brief rules out faking any of this. NOVA must not claim to be listening when it isn't, must not use canned translations as the multilingual system, and must not present demo mode as real AI.

## Decision

### Multilingual intelligence lives in the language model

- **Claude is the multilingual system.** The system prompt tells it to reply in the language of the user's latest message, to follow code-switching and transliteration ("Manglish", "Hinglish"), to keep names exactly as the tools return them, and to follow language changes mid-conversation. The number of supported languages is whatever the model supports. There is no fixed list.
- **Reply language is declared by the model.** Every final answer starts with a `[lang:xx]` tag, which the API strips (`extractReplyLanguage`). If the tag is missing, the language is detected from the reply text (`source: "detected"`). The reply carries `language: { code, source }`, which the UI uses to choose a voice and set `lang` / `dir` on the message.
- **A deterministic detector is only a hint** (`packages/shared/src/domain/locale.ts`). It identifies the language from Unicode script (Malayalam, Tamil, Devanagari, Arabic vs Urdu vs Persian, CJK…) and, for Latin text, from function words, including common transliterations. Its uses are limited to: recording the user's language, choosing a voice when the model gives no tag, and letting demo mode say what it can't do. It never generates answers.
- **Demo mode is honest.** Without `ANTHROPIC_API_KEY`, NOVA answers in English only. When a message looks like another language, the reply starts with "Demo mode understands English only. Your message looks like Malayalam…", followed by the best English answer the intent rules can give.
- Each message's language is stored (`AssistantInteraction.language`, `languageSource`), so history replays in the right voice.
- **Voice turns are flagged** (`channel: "voice"`, `speechLanguage`). Claude is told the text is a transcript that may contain recognition errors, and that its reply will be spoken, so it should be short and contain no tables.

### Voice runs in the browser behind replaceable interfaces

- `SpeechRecognizer` and `SpeechSynthesizer` interfaces (`apps/web/src/features/assistant/speech/`). The current implementations use the Web Speech API (`SpeechRecognition` in Chrome, Edge and Safari; `speechSynthesis` everywhere). A server-side recogniser (e.g. Whisper) or a neural TTS service can replace either one in `speech/index.ts` without changing the session or the UI.
- **Recognition language:** Web Speech recognition listens in one locale per session and cannot identify the language by itself. "Auto" therefore listens in the conversation's current language (or the browser locale), and the user can choose a language explicitly. The UI says this plainly. Typed messages need no setting.
- **Microphone:** `getUserMedia` triggers the permission prompt and feeds an `AnalyserNode`. The listening animation is driven by the real input level. A denied permission, a missing device and recognition errors each produce a specific message.
- **Speech output:** NOVA picks the best installed voice for the reply language: the user's saved choice, then the exact locale, then a natural/neural voice. If no voice exists for that language, NOVA says so and leaves the reply as text. It never reads Malayalam text with an English voice. Text is cleaned of markdown and split into sentence-sized utterances (Latin, danda, Urdu and CJK terminators) so pause, resume and stop respond quickly. Replies are spoken for spoken turns by default; the user can choose "always" or "off".
- **Hands-free:** after NOVA finishes speaking a reply to a voice turn, it listens again. Silence, Stop, Esc or the microphone button ends the loop. Pressing the microphone or typing interrupts NOVA while it speaks.
- **Confirmation stays manual.** Voice can ask for a change, but only the Confirm button applies it (ADR-0005).

### The robot is an SVG figure driven by real state

- `NovaRobot` is a layered SVG (graphite helmet, glass visor, luminous eyes, ear emitters, floating collar) animated with CSS modules. It has six states: idle, listening, processing, speaking, success and error.
- The state is derived (`deriveRobotState`) from what the session is actually doing: a fresh error > listening > waiting for the API > audio playing > a brief success > idle.
- Live movement comes from real signals written to a CSS variable once per animation frame, without re-rendering React. While listening, that signal is the microphone level. While speaking, it is the synthesiser's word-boundary events. Voices that emit no boundary events (some network voices) get a generic mouth movement, but only while audio is actually playing. True lip-sync is not possible: `speechSynthesis` exposes no audio stream.
- `prefers-reduced-motion` stops ambient motion. The expressions stay.
- One `NovaSessionProvider` owns the conversation, voice and robot state for the whole workspace. Both surfaces read from it: the docked panel, and a floating companion (bottom-right) that mirrors the live state, previews replies, offers a microphone and opens the panel. A conversation therefore continues when the panel is minimised.

## Alternatives

- **Three.js / React Three Fiber robot.** Rejected for now. It adds a large dependency and GPU cost to an always-visible element in an operations dashboard. An SVG figure renders sharply at 16–80 px, themes through CSS tokens, and costs almost nothing when idle.
- **Translate to English, answer, translate back.** Rejected: it loses code-switching and nuance, and the brief forbids it.
- **Hard-coded multilingual demo answers.** Rejected as fake capability.
- **Server-side speech now.** Deferred: it needs credentials and audio upload. The interfaces leave room for it.

## Consequences

- With Claude configured, NOVA converses in any language the model handles. In demo mode it is upfront about English only.
- Voice quality and language coverage depend on the browser and OS. Edge ships natural voices for many Indian languages. Chrome and Edge send recognised audio to Google or Microsoft, as the voice settings note.
- Firefox has no speech recognition. There, the microphone button is disabled and its tooltip explains why.
