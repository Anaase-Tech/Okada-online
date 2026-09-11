# Okada Voice & African Language Layer V1

**Status:** Architecture / implementation foundation  
**Date:** 2026-09-11

## Goal

Make Okada Online usable by speaking, especially for customers who are more comfortable speaking than typing.

## Current language-provider strategy

Use Khaya as the initial external language service layer for speech recognition, translation and text-to-speech where its supported Ghanaian-language coverage fits the use case.

African AI remains a strategic future language/intelligence layer. The application must therefore use a provider abstraction rather than hard-coding the UI to one vendor.

## Architecture

```text
User voice
   |
   v
Voice capture
   |
   v
Language Provider Adapter
   |
   +--> Khaya ASR / translation / TTS
   |
   v
Transcript
   |
   v
Okada Intelligence
   |
   v
Structured intent
   |
   v
Validated backend action
   |
   +--> journey search
   +--> ride search
   +--> delivery search
   +--> status query
   |
   v
Natural-language response
   |
   v
Optional TTS
```

## Voice-first use cases

- ride search and booking
- transit search
- pickup landmark input
- delivery requests
- family rides
- journey status
- fare explanation
- safety/support requests

## Safety rule

Speech recognition and AI output are untrusted input. A voice request must never directly authorize a sensitive action such as payment, cancellation with financial consequences, account changes or irreversible operations.

Required flow:

`voice → transcript → intent → backend validation → real availability/data → user confirmation → execution`

## Provider abstraction

Recommended interface:

```text
speechToText(audio, language)
translate(text, sourceLanguage, targetLanguage)
textToSpeech(text, language, voice)
```

The implementation can start with Khaya and later add African AI or another provider without redesigning the customer-facing experience.

## Language metadata

Store the user's preferred language and voice settings separately from their account identity:

- `preferredLanguage`
- `preferredInputLanguage`
- `preferredOutputLanguage`
- `voiceEnabled`
- `ttsEnabled`

Do not infer a user's identity, ethnicity or nationality from language choice.

## Failure handling

If speech recognition is uncertain or unavailable:

1. show the recognized transcript for correction;
2. allow typing;
3. allow landmark selection/search;
4. never silently book based on uncertain speech.

## Future

As African AI matures, it can become an additional provider or a deeper Okada language/intelligence component. The interface should remain provider-neutral.
