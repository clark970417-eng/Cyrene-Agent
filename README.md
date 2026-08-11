# Cyrene Agent

> An Electron and TypeScript desktop AI companion system with long-term memory, voice interaction, Discord integration, mobile access, cloud services, and game automation tools.

## Overview

Cyrene Agent is my independently developed extension of the MIT-licensed [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent) desktop companion framework. The upstream project provided the original Live2D desktop character, AI chat, memory, voice, and tool foundation. I redesigned and expanded the system with a new workspace experience, Discord automation, mobile access, cloud services, game features, safety tooling, reliability tests, and several custom interaction flows.

This repository is not presented as a project built entirely from scratch. It is a substantial personal extension of an open-source codebase, with the original source, license, and asset credits preserved in the sections below.

## My Main Contributions

### 1. Integrated Workspace

- Built a new Workspace interface that centralizes chat, model state, connection status, sessions, and feature navigation.
- Added session lists, model/reasoning mode controls, usage indicators, and live status synchronization.
- Integrated the notebook, game room, memory page, Discord settings, drawing tools, and other subsystems into one desktop workflow.

### 2. Interactive Game and Activity Systems

- Added a game room with persistent play statistics and Live2D character reactions.
- Implemented multiple interaction modes, including resonance matching, tic-tac-toe, rock-paper-scissors, memory cards, Connect Four, twenty questions, truth cards, story continuation, Cyrene quiz content, and Ropebound cooperative puzzles.
- Built a Ropebound Discord Activity version with Supabase Realtime room synchronization and Player 2 controls.
- Added persistent win/loss/draw tracking for continued interaction history.
- Added a game strategy mode that can respond in English or Chinese and organize team, stage, and source-based advice.

### 3. Notebook, Creative, and Study Tools

- Added a two-page Markdown notebook with page turning, section navigation, and structured entries.
- Added Shared Notebook collection logic for Discord music sessions and completed actions, with live refresh after content changes.
- Built drawing and image-generation UI flows with prompt organization, free image-source helpers, and configurable generation services.
- Added a study mode that supports Markdown, LaTeX, source checking, and bilingual academic problem solving.
- Added an AI exam interface with subject selection, question count, reasoning strength, timers, explanations, scores, and missed-question review.
- Expanded document, PDF, spreadsheet, and presentation tools for more practical agent workflows.
- Added a persistent cloud-city entry point with offline time settlement and durable state.
- Added mobile access and a local mobile server so selected companion and control features can run from a phone browser.
- Added a WutheringWavesUID integration path for Wuthering Waves account data, check-ins, and local OCR helper workflows.

### 4. Agent, Memory, and Companion Behavior

- Added agent activity logging and summaries for tool success, failure, refusal, timing, and sensitive-field redaction.
- Added memory graph visualization for people, places, events, and long-term memories.
- Added morning, afternoon, and bedtime rituals that can use recent memory, todos, and weather context.
- Added quiet hours and proactive opening strategies to reduce poorly timed interruptions.
- Added short-response shaping and length protection for desktop pet bubbles.

### 5. Voice, Calls, and Visual Context

- Added offline speech recognition based on `Xenova/whisper-base`, with local model caching after first download.
- Improved voice segmentation, audio processing, early playback, and call usage tracking.
- Added context-aware screen and inbound-image handling so visual descriptions are attached only when the user's question is actually about images or the screen.
- Expanded configuration and test coverage for multiple TTS and voice-service providers.

### 6. Messaging Platforms and External Integrations

- Added a Discord bot adapter with channel allowlists, mention detection, message chunking, attachments, and embed messages.
- Expanded Discord slash commands, voice calls, and status queries so users can chat, join voice channels, leave voice channels, and inspect system status.
- Added Discord music playback with search, YouTube/Bilibili/SoundCloud/Spotify links, playlists, Bilibili collections, and multi-part media handling.
- Built live-updating player cards, private queues, playback history, favorites, prefetching, perceptual volume, category resume, repeat, shuffle, auto-recommendation, and Spotify playlist command support.
- Added Discord achievements and a cleaner help-card structure for chat, game automation, music, daily companion features, and entertainment tools.
- Added X/Twitter and Anilist notification services that can forward selected account or anime updates into Discord.
- Added Spotify Premium connection and playback control with OAuth, search, links, playlists, artist top tracks, device switching, previous/next, play/pause, and volume control.
- Added a headless cloud Discord bot service for Linux containers, including text chat, basic music controls, image understanding, health checks, and local/cloud failover.
- Added Traditional Chinese normalization for external messages while preserving original user input.
- Continued integrating Lark, WeChat, and local inbound server pathways so one agent core can serve multiple messaging entry points.
- Added routing safeguards so platform-specific unsupported message formats or tools are not called incorrectly.
- Added a Wuthering Waves task tool for daily tasks, 4C-related routines, and game automation workflows.

### 7. Local Safety and Backup

- Used Electron `safeStorage` to protect API keys, tokens, and mail passwords.
- Added Secret Vault status checks, migration support, masking, and preservation of existing secrets.
- Added categorized `.cybackup` backups for conversations, memory, plans, personalization, knowledge, and settings.
- Added pre-restore safety backups and limits on file count, paths, and extracted size.

### 8. Reliability and Testing

- The project currently includes 97 test files and 652 tests covering memory, scheduling, tools, channels, games, voice, safety, and UI logic.
- Added boundary checks for IPC payloads, screen context, backup paths, message length, and agent activity logs.
- Provides TypeScript builds, Vitest tests, and GitHub Actions workflow support.

## Foundation from the Upstream Project

The following capabilities originated from the upstream `Cyrene-Agent` project and are continued or adapted in this version:

- Live2D desktop character, expressions, motions, and lip sync
- Multi-model AI chat and provider switching
- Long-term memory, RAG, worldbook, and relationship systems
- MCP, function calling, and built-in tools
- Speech recognition, speech synthesis, and call mode
- Scheduled tasks, todos, and proactive messages
- Lark and WeChat messaging integrations

## Architecture

```text
Electron Main Process
├── Agent Orchestrator        # models, tools, MCP, context, and agent flow
├── Memory & RAG              # memory, graph, retrieval, and conflict handling
├── Channels                  # Discord, Lark, WeChat, and inbound server
├── Voice & Call              # ASR, TTS, calls, and visual context
├── Scheduler & Rituals       # scheduled tasks, todos, and daily rituals
├── Security & Backup         # Secret Vault and categorized backups
└── Game / Document Tools     # game automation and document tools

Electron Renderer
├── Live2D Desktop Pet
├── Chat / Call / Settings
├── Workspace Dashboard
├── Notebook / Paint
├── Study / Exam
├── Game Room
└── WavesUID / Mobile Views
```

## Technology Stack

- Electron 43
- TypeScript
- Vite
- Vitest
- PixiJS + `pixi-live2d-display`
- LanceDB, LlamaIndex, BM25, and Transformers.js
- Discord.js, Lark SDK, WebSocket, and MCP SDK

## Requirements

- Node.js `>=24 <25`
- npm `>=10`
- Git
- Access to a supported AI model API or a supported local model service

Some native packages, voice services, and desktop automation features are operating-system dependent. Running the project on a different platform may require additional build tools, audio components, or model files.

## Installation

```bash
git clone https://github.com/clark970417-eng/Cyrene-Agent.git
cd Cyrene-Agent
npm ci
npm run dev
```

Create a production build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Initial Setup

1. Open the application's Settings page.
2. Select a model provider, base URL, and model name.
3. Enter the required API key locally and run a connection test.
4. Enable voice, Discord, Lark, WeChat, local models, daily rituals, or other integrations as needed.
5. When enabling offline Whisper for the first time, wait for the model download and local cache setup to finish.

Do not commit API keys, bot tokens, passwords, or backups containing private conversations. Even when a repository is private, secrets should never be written directly into source code.

## Data and Privacy

- Model settings, chat history, memory, tasks, and game statistics are mainly stored in Electron's local `userData` directory.
- Supported sensitive settings are encrypted through operating-system secure storage.
- Backups should not export API keys, tokens, or mail passwords by default.
- When using cloud models, TTS, search, Discord, Lark, or WeChat, data is transmitted according to the selected service's behavior. Users should review the relevant privacy policies.

## Limitations

- This is an actively developed personal project and does not guarantee that every model provider or platform combination will work out of the box.
- Some features require third-party APIs, bot permissions, local models, or additional services.
- Offline Whisper still requires a model download on first use.
- GitHub Actions and release workflows may need adjustment depending on the actual branch and deployment strategy.

## Source, License, and Credits

### Upstream Code

- Upstream project: [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent)
- Original author: Playa-0v0
- License: [MIT License](./LICENSE)
- This extended version is maintained by [clark970417-eng](https://github.com/clark970417-eng).

The MIT License allows use, modification, and distribution, but the original copyright notice and license terms must be preserved. This README identifies the upstream source and distinguishes the original foundation from the additional work in this version.

### Live2D Model and Character Assets

- Model author: Bilibili creator `是依七哒`
- Original page: [space.bilibili.com/457683484](https://space.bilibili.com/457683484)
- Full notes: [MODEL_LICENSE.md](./MODEL_LICENSE.md)

The model and character-related assets are not owned by this repository maintainer. Cyrene, her character name, design, and related intellectual property belong to HoYoverse / miHoYo. This project is an unofficial, non-commercial fan development and is not affiliated with or endorsed by HoYoverse / miHoYo.

## Portfolio Note

This project demonstrates my ability to read, understand, extend, refactor, integrate, secure, test, and present a complex open-source system. For academic or portfolio review, the important contribution is not only the final feature list, but also the engineering process: connecting multiple services, improving reliability, designing user workflows, protecting local secrets, and documenting the boundary between upstream work and my own extensions.
