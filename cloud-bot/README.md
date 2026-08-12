# Cyrene Cloud Discord Bot

Cyrene Cloud is the headless failover service for Cyrene Agent. It keeps the Discord Gateway connected on a Linux VM while the macOS desktop companion is offline, without replacing the desktop application's local settings, memories, or GPT-SoVITS voice profile.

## Features

- Discord direct messages and mention-based server conversations
- Traditional Chinese (Taiwan) output normalization at the final delivery boundary
- Natural-language voice request detection, including requests such as “你能說句笑話嗎”
- Discord WAV voice attachments generated with Gemini TTS when the desktop GPT-SoVITS service is unavailable
- Image understanding for Discord attachments
- Append-only permanent conversation and image-description memory
- Relevant-memory recall across sessions; `/forget` clears only short-term channel context
- `/chat`, `/status`, `/forget`, WutheringWavesUID, check-in, and cloud music commands
- OpenRouter chat with automatic Gemini fallback
- Health checks and user, guild, and channel allowlists

Desktop-only capabilities remain disabled whenever they require access to the user's Mac. Cloud voice attachments are not Discord voice calls: `/join` still requires the desktop application.

## Voice fallback

The desktop application remains the preferred voice path and continues to use the user's existing GPT-SoVITS configuration. When the Mac is offline, the cloud bot can convert a requested reply into a Discord audio attachment using the existing `GEMINI_API_KEY`.

```dotenv
CLOUD_TTS_ENABLED=true
CLOUD_TTS_MODEL=gemini-3.1-flash-tts-preview
CLOUD_TTS_VOICE=Leda
CLOUD_TTS_MAX_CHARS=900
```

No second API key is required. If synthesis fails, the bot preserves the response as Traditional Chinese text and reports that the audio fallback was unavailable.

## Local verification

```bash
npm install
npm test
```

Copy `.env.example` to `.env`, then add the required Discord and model credentials before running `npm run dev`. Never commit tokens or API keys.

## Required configuration

- `DISCORD_BOT_TOKEN`
- `DISCORD_ALLOWED_USER_IDS`
- `OPENROUTER_API_KEY` or `LLM_API_KEY`
- `GEMINI_API_KEY` for image, chat fallback, and cloud TTS
- Optional Spotify credentials for Spotify Connect commands

OpenRouter is used for ordinary text chat. Image requests can be sent directly to the configured Gemini model, and explicit quota failures from OpenRouter automatically fall back to Gemini.

## Persistent data

Conversation history, image descriptions, favorites, check-in state, and usage records must live on persistent storage. Set `DATA_DIR` to a persistent disk path such as `/data`; do not rely on an ephemeral container filesystem.

The production service exposes `/health`. Keep secrets in the platform environment or the protected VM `.env` file, and restrict Discord access with the provided allowlists.
