# Hey Sahayak

Enable Hey Sahayak once on the citizen screen and allow microphone access. Try:

- “Hey Sahayak, open documents.”
- “Hey Sahayak, how is my application going?”
- “हे सहायक, मेरे कागज़ दिखाओ।”
- “Hey Sahayak, mere documents dikhao.”
- “Hey Sahayak, scholarship dhundo.”

Choose English (India) or Hindi (India) for recognition and spoken responses.
Common commands resolve directly without AI interpretation. Other requests use
the existing `/api/voice/intent` endpoint. This update adds no new voice provider
or backend/database changes.

After a clarification question or a standalone wake phrase, wait for the
Listening for your reply indicator. Reply directly within 15 seconds; no second
wake phrase is required. New commands outside this window still require the
wake phrase. The assistant pauses recognition during its own spoken replies.

While listening, “stop listening” turns off the microphone without a wake phrase.
Stop microphone and audio, or Escape, also stops playback, network retries and
pending interpretation. A hidden tab stops voice assistance until re-enabled.

The Heard display shows the browser transcript. Edit heard command copies it to
an editable field; Run command submits the corrected command explicitly. Typing
also works when microphone access is denied or speech recognition is unavailable.
Spoken replies can be muted or skipped, and speech speed can be adjusted. Voice
preferences apply to the current mounted session; they do not change app settings.

Network recognition errors retry at most three times with increasing delays.
Permission, microphone availability and startup failures show actionable text.

Browser speech recognition may use a remote browser speech service, including
ambient speech before the wake phrase while enabled. It is not an offline wake
detector. AI interpretation receives unmatched command text, page name and any
explicit clarification context. Do not claim that audio recognition is local or
works offline. Device voices and browser recognition support vary.

## Verification

```powershell
npx tsx --test src/lib/voiceCommands.test.ts src/lib/aiVoiceIntent.test.ts
npm run lint
npm run build
```

For browser regressions, run a Vite dev server at port 5176, then:

```powershell
npx playwright test --config playwright.voice.config.ts
```

The fixture mocks speech events and AI responses. Tests exercise state transitions,
wake gating, bounded follow-up windows, direct commands, Stop/cancellation,
network recovery, startup failure, typed correction and mobile width. They do not
measure live microphone accuracy or actual accent recognition.

Manually check on the target device: permission denial/recovery, English/Hindi
commands, a paused wake phrase followed by a command, a clarification reply,
background speech outside the reply window, spoken Stop, Escape during playback,
hidden tab behavior, muted replies, speed changes and loss of connectivity.
