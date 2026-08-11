# Cyrene Agent

<div align="center">

**A local-first, memory-aware AI desktop companion inspired by Cyrene.**

Built with Electron, TypeScript, React, Live2D, and an extensible agent runtime.

[Features](#features) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Configuration](#configuration) · [Development](#development) · [Safety](#security-and-privacy)

</div>

> [!NOTE]
> This repository is a community-maintained fork of [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent). It is an unofficial fan project and is not affiliated with HoYoverse.

> [!IMPORTANT]
> This README intentionally does not include screenshots. If images are not available in the repository, leaving broken image links makes the project look unfinished on GitHub. The documentation below focuses on the engineering design, setup process, and feature scope instead.

## Overview

Cyrene Agent combines character-driven conversation, persistent memory, voice interaction, tool execution, learning support, coding assistance, games, and optional messaging integrations in one desktop application.

The desktop experience uses a unified workspace: chat, tasks, settings, the notebook, study tools, games, Wuthering Waves utilities, and image creation stay inside one window, while the companion panel keeps Cyrene visible. A synchronized **Cyrene Night** and **Pearl Light** theme system applies across the workspace and embedded tools.

The agent supports five focused modes:

| Mode | Purpose |
| --- | --- |
| **Chat** | Character-focused conversation using recent context, user preferences, and long-term memory |
| **Work** | Tool-enabled planning and execution with visible progress, approval gates, and result verification |
| **Code** | Scoped coding assistance for trusted directories, including file edits, commands, and tests |
| **Learn** | Obsidian-assisted study, note organization, exercise generation, and learning progress |
| **Daily** | General questions, information organization, reminders, and lightweight everyday tasks |

## What Makes This Version Different

This repository is not presented as a project written entirely from scratch. The upstream project provided an important foundation: the original desktop companion concept, Live2D integration, memory architecture, voice support, and agent tooling. This version focuses on extending that foundation into a broader personal AI agent system.

Major additions and refactors in this version include:

- A unified desktop workspace that brings chat, tools, notebook, study mode, games, and settings into one main interface
- Expanded Discord support, including bot commands, voice interactions, music utilities, shared activities, and cloud deployment experiments
- A mobile dashboard and local server bridge for controlling selected agent features from a phone browser
- A more visible memory and retrieval system, including structured memory layers, RAG utilities, audit behavior, and user-facing memory controls
- Game automation tools, Wuthering Waves helper workflows, OCR support, and recipe-based automation experiments
- A broader voice pipeline with multiple TTS providers, ASR configuration, early playback, and call-mode behavior
- Local safety improvements around tool permissions, credential handling, backup boundaries, and sensitive-file caution
- Additional tests across memory, channels, games, voice, tool execution, settings, and renderer behavior

For academic or portfolio review, the important engineering work is the integration: connecting multiple subsystems, keeping local privacy in mind, separating reusable modules, and documenting the boundary between upstream work and my own extensions.

## Standalone Module Repositories

To make the engineering work easier to review, several subsystems were separated into smaller public repositories. These repositories are focused examples of individual parts of the larger desktop system:

| Repository | Purpose |
| --- | --- |
| [ai-companion-desktop-system](https://github.com/clark970417-eng/ai-companion-desktop-system) | Full Electron and TypeScript desktop AI companion system showing how the modules fit together |
| [long-term-memory-engine](https://github.com/clark970417-eng/long-term-memory-engine) | Reusable memory, retrieval, conflict resolution, scheduled compression, and RAG utilities |
| [realtime-discord-activity](https://github.com/clark970417-eng/realtime-discord-activity) | Discord activity layer with slash commands, voice, music, notebook, image queue, and shared activity features |
| [discord-cloud-agent](https://github.com/clark970417-eng/discord-cloud-agent) | Cloud Discord agent runtime with chat, music, Spotify control, check-ins, health checks, and deployment examples |
| [game-automation-tools](https://github.com/clark970417-eng/game-automation-tools) | Scriptable TypeScript toolkit for screenshots, coordinate handling, and recipe-based automation workflows |
| [mobile-agent-dashboard](https://github.com/clark970417-eng/mobile-agent-dashboard) | Mobile web dashboard and local server bridge for controlling an agent from a phone |
| [wuthering-waves-agent-tools](https://github.com/clark970417-eng/wuthering-waves-agent-tools) | Focused Wuthering Waves helper tools for agent workflows, including UID parsing and lightweight UI code |

The smaller repositories are not meant to hide the upstream history. They are meant to make the engineering pieces easier to inspect independently.

## Features

### Companion and conversation

- Live2D desktop companion with expressions, motion, mood, status, speech bubbles, and stickers
- Multi-session chat with conversation history, pinned sessions, and configurable response styling
- Traditional Chinese (Taiwan) localization throughout the desktop interface
- Taiwan-first locale context for local time, weather, holidays, services, and regional information
- Proactive messages with quiet-hour and delivery-target controls
- Unified dark and light themes, custom fonts, corner radius, chat spacing, and companion sizing

### DMAE memory system

- L0, L1, and L2 memory layers for identity, relationships, events, and working context
- DMAE Worldbook for long-term character and relationship continuity
- LLM-assisted entity and event extraction
- Hybrid RAG retrieval with vector search, BM25, optional reranking, and source traceability
- Obsidian Vault binding, manual synchronization, and structured notebook workflows
- User-controlled memory inspection and deletion

### Agent and tool runtime

- Direct and plan-based execution modes
- Structured tool calls with execution policy, permission levels, and repair budgets
- Streaming reasoning, tool state, task plans, and confirmation cards
- Web search, webpage reading, local files, documents, email, maps, weather, music, screenshots, and MCP tools
- Provider profiles for OpenAI-compatible, Anthropic-compatible, and custom model endpoints
- Configurable timeout, iteration, retry, context-window, and multimodal settings

### Voice

- Text-to-speech through MiniMax, MiMo, GPT-SoVITS, Mossland, or a custom cloud endpoint
- Streaming playback and automatic reading
- Natural vocal enhancement for pauses, breathing, laughter, and conversational cadence
- Real-time speech recognition, voice calls, and VAD silence detection
- Local reference-audio selection for supported voice engines

### Built-in workspaces

- Shared notebook with categories, search, page navigation, and editable entries
- Exam mode for generated quizzes, explanations, scoring, and review
- Game room with relationship quizzes, board games, memory games, story choices, and Ropebound
- Wuthering Waves tools with local macOS Vision OCR support
- Image studio with prompt building, reference images, character consistency, and multiple providers
- Discord Activity lobby for the Ropebound cooperative experience

### Optional integrations

- Discord bot and Activity support
- Feishu / Lark and WeChat iLink messaging
- Spotify and NetEase Cloud Music controls
- Optional cloud-bot runtime and failover tooling
- MCP servers over stdio, SSE, and HTTP
- User-defined Skills and reusable tool instructions

## Detailed Feature List

### Workspace and interface

- Unified workspace navigation for chat, work tools, code assistance, learning, daily tasks, notebook, games, and settings
- Theme synchronization across embedded pages and agent views
- Localized Traditional Chinese runtime for the desktop interface
- User-adjustable chat density, companion sizing, font choices, and window styling
- Separate interaction modes so the agent can behave differently when chatting, working, coding, studying, or handling daily questions

### Agent execution

- Direct response mode for normal conversation
- Tool-enabled work mode for planning and executing multi-step tasks
- Runtime status reporting for tool calls, streaming text, and task progress
- Policy controls for read-only, scoped, approval-based, and broader execution modes
- Context building across memory, recent conversation, selected files, and current task state
- Repair and retry behavior for failed tool calls where safe

### Memory and RAG

- Multi-layer memory design for short-term facts, long-term user knowledge, relationships, and working context
- Entity and event extraction from conversation
- Retrieval-augmented generation with vector search and keyword search
- Optional reranking for more precise context selection
- Worldbook-style knowledge for persistent companion behavior
- Memory inspection, deletion, and synchronization workflows
- Obsidian-oriented study and note organization support

### Voice and audio

- Multiple TTS provider integrations
- Optional ASR and voice call mode
- Streaming playback for faster response feel
- Audio segmentation for more natural spoken responses
- Provider-specific settings for speed, volume, voice ID, and reference audio
- Call usage tracking and voice behavior configuration

### Discord and messaging

- Discord bot adapter for server-based conversation
- Slash command utilities
- Voice channel support
- Music playback helpers and queue concepts
- Shared notebook / activity features
- Cloud bot runtime experiments for keeping selected features online
- Feishu, Lark, WeChat iLink, and local inbound server pathways for multi-platform communication

### Study, notes, and productivity

- Shared notebook with categories and editable entries
- Exam mode with generated questions, scoring, and review
- Study-oriented prompts with structured reasoning
- Document, spreadsheet, presentation, and PDF-oriented agent tools
- Task planning and visible execution progress
- Search and organization workflows for user-provided information

### Games and automation

- Game room and companion activity experiments
- Board games, memory games, story choices, and relationship-style quizzes
- Ropebound cooperative activity prototype
- Wuthering Waves UID and task helper workflows
- Screenshot and OCR-assisted automation experiments
- YAML-style game recipe ideas for repeatable routines

### Safety and privacy

- Local-first storage emphasis
- Credential caution and secure-storage support where implemented
- Avoids committing local secrets, tokens, cookies, private backups, or model keys
- Tool permission modes to reduce accidental broad access
- Backup and restore boundaries designed to avoid unsafe file extraction
- Documentation that preserves upstream credit and model asset attribution

## Architecture

```text
Electron Main Process
├── DMAE memory, RAG, relationship, and locale services
├── Agent orchestration, execution policy, tools, and Skills
├── TTS, ASR, media, screenshot, and notification services
├── Optional Discord, Feishu, WeChat, music, and cloud adapters
└── Secure preload bridges
    └── Unified React / HTML workspace
        ├── Chat, Work, Code, Learn, and Daily
        ├── Tasks, settings, notebook, and exam mode
        ├── Game room, Wuthering Waves tools, and image studio
        └── Shared theme, typography, and Traditional Chinese runtime
```

Important directories:

| Path | Description |
| --- | --- |
| `src/main/` | Electron main process, agent runtime, memory, tools, voice, and integrations |
| `src/preload/` | Context-isolated APIs exposed to renderer windows |
| `src/renderer/` | Unified workspace, React chat, settings, companion UI, and embedded tools |
| `src/shared/` | Shared types, IPC channels, normalization, and cross-process contracts |
| `prompts/` | Character, phone, Work, and system prompt layers |
| `skills/` | Built-in agent Skills and reference resources |

## Project Structure

This repository is organized around Electron's process model and the separation between the agent runtime, renderer UI, shared contracts, and optional integrations.

```text
.
├── src/
│   ├── main/
│   │   ├── orchestrator/        # agent loop, tools, providers, context, and execution policy
│   │   ├── memory/              # long-term memory, stores, views, conflict handling, and scheduling
│   │   ├── rag/                 # retrieval, embeddings, chunking, vector store, and worldbook utilities
│   │   ├── channels/            # Discord, Feishu/Lark, WeChat, inbound server, and message routing
│   │   ├── tts/                 # text-to-speech engines and playback behavior
│   │   ├── asr/                 # speech recognition engines
│   │   ├── game-bot/            # desktop automation, screenshots, coordinates, recipes, and input tools
│   │   ├── game-room/           # local game room state and IPC
│   │   ├── mobile-server/       # phone dashboard bridge
│   │   ├── services/            # notification and external service helpers
│   │   └── index.ts             # Electron main entry point
│   ├── preload/                 # context-isolated bridge APIs
│   ├── renderer/                # workspace UI, companion UI, notebook, games, settings, and tools
│   └── shared/                  # shared TypeScript types and IPC channel names
├── mobile/                      # static mobile dashboard assets
├── prompts/                     # system, character, worldbook, and mode prompts
├── scripts/                     # helper scripts for testing, packaging, and integrations
├── game-recipes/                # sample automation recipes
├── cloud-bot/                   # optional cloud Discord runtime
└── docs/                        # documentation and reference files where available
```

The project is intentionally modular. Many features can be studied independently, which is why several major subsystems also have separate standalone repositories.

## Platform Support

| Platform | Status | Notes |
| --- | :---: | --- |
| **macOS** | ✅ Source build tested | Native screenshot capture uses `/usr/sbin/screencapture`; local Vision OCR is available for supported tools |
| **Windows 10 / 11** | ✅ Supported | Primary upstream platform; includes the Rust screenshot helper and Windows-specific automation |
| **Linux** | 🧪 Experimental | Desktop environment, keyring, transparent-window, and native automation behavior may vary |

Some channel connectors and native automation features remain platform-specific. The core Electron application, memory system, chat, workspace, and most tools are cross-platform.

## Quick Start

### Requirements

- Node.js 24 LTS
- npm 10 or newer
- A supported LLM API key
- macOS 13+ or Windows 10 / 11
- Git
- Optional: Rust stable for Windows screenshot helper builds
- Optional: additional local model files for embedding, reranking, or offline speech recognition

Clone this fork and install the locked dependencies:

```bash
git clone https://github.com/clark970417-eng/Cyrene-Agent.git
cd Cyrene-Agent
npm ci
```

Build and start the desktop application:

```bash
npm run build
npm start
```

For active development:

```bash
npm run dev
```

### First-run checklist

After cloning the project, a typical first setup looks like this:

```text
1. Install Node.js 24 LTS.
2. Run npm ci.
3. Configure at least one model provider in Settings.
4. Add a local API key through the app instead of hard-coding it.
5. Run npm run build.
6. Start the desktop app.
7. Enable optional voice, memory, Discord, mobile, or automation features only after the base app works.
```

The application can be used with fewer optional services. Discord, Spotify, local OCR, cloud bot deployment, and game automation are separate capabilities and may require additional setup.

### Windows screenshot helper

Windows source builds require Rust stable and Visual Studio 2022 Build Tools with the C++ desktop workload:

```powershell
npm run build:screenshot-helper
npm run build
npm start
```

The packaged Windows directory build is available through:

```bash
npm run package:win:dir
```

macOS uses the system screenshot utility and does not require the Windows Rust helper.

## API Key and Model Setup

Cyrene Agent does not include model credentials. You must provide your own model endpoint and API key for the providers you choose to use.

General configuration steps:

1. Open the desktop app.
2. Go to **Settings**.
3. Choose a model provider profile.
4. Enter the base URL, model name, and API key.
5. Test the connection.
6. Save the configuration locally.

Recommended safety rules:

- Do not paste API keys directly into source files.
- Do not commit `.env`, local settings, Electron `userData`, backups, cookies, or exported memories.
- Rotate any key that was accidentally exposed.
- Use separate development keys for experiments.
- Keep high-permission integrations disabled until you understand what data they can access.

## Local Models and Optional Downloads

Some features can use local models or downloaded model assets. These may improve privacy or reduce cloud dependency, but they can increase disk usage and setup time.

Optional local components may include:

- Embedding model for semantic retrieval
- Reranker model for improving retrieval quality
- Offline speech recognition model
- Local OCR / Vision helper behavior on supported platforms
- Voice reference audio for supported TTS engines

These downloads are not required for every workflow. The base desktop app can be configured with cloud model providers first, then local model features can be enabled later.

## Configuration

Open **Settings** in the application and configure:

1. **Model provider** — API key, endpoint, model, transport, and optional vision model.
2. **Appearance** — Cyrene Night or Pearl Light, font, spacing, window radius, and companion behavior.
3. **Memory and RAG** — embedding model, reranker, document imports, and optional Obsidian Vault.
4. **Voice** — TTS engine, voice ID or reference audio, streaming, speed, volume, and optional ASR.
5. **Permissions** — read-only, scoped, per-action, or full tool execution.
6. **Optional channels** — Discord, Feishu, WeChat, Spotify, music, and cloud services.

Most settings are stored under Electron's platform-specific `userData` directory and are applied without restarting the app.

### Discord configuration

Discord support is optional. A typical Discord setup requires:

- A Discord application and bot token
- Bot permissions for the target server
- Allowed channels or mention behavior
- Slash command registration where needed
- Voice permissions if using voice channel features
- Music or media provider settings if enabling playback utilities

The cloud Discord runtime is separated from the desktop app so it can be deployed independently, tested independently, or disabled completely.

### Mobile dashboard configuration

The mobile dashboard is intended for local control from a phone browser. The host desktop app exposes selected actions through a local bridge, while the phone UI provides a simpler touch-first interface.

When using this feature:

- Keep the local network trusted.
- Avoid exposing the local server directly to the public internet.
- Add authentication or network restrictions before using it outside a private environment.
- Treat phone control as a convenience layer, not a replacement for the desktop permission model.

### Game automation configuration

Game automation and screenshot-assisted workflows are experimental. They may require:

- Platform-specific screenshot permissions
- Accessibility permissions on macOS
- Keyboard and mouse automation permissions
- Coordinate calibration
- Game-specific recipes or reference images

Use these features responsibly and follow the rules of the software or game being automated.

## Development

Common commands:

```bash
npm test                    # Run the Vitest suite
npm run build:main          # Compile the Electron main process
npm run build:preload       # Compile context-isolated preload bridges
npm run build:renderer      # Build all renderer entry points
npm run build               # Build Skills, main, preload, CLI, and renderer
npm run dev                 # Start Vite and Electron in development mode
```

The current unified macOS integration was verified with:

- 282 passing test files
- 2,580 passing tests
- Successful main, preload, and renderer builds
- Browser checks for dark/light switching and embedded workspace synchronization

> [!TIP]
> The active unified macOS implementation is published on the `codex/unified-upstream-integration` branch. The existing `main` history is retained to protect earlier cloud, Discord, WavesUID, and documentation work while the two histories are consolidated safely.

## Testing and Verification

This project uses automated tests to protect behavior across the memory system, channel integrations, games, voice utilities, settings, and agent runtime.

Useful verification steps:

```bash
npm test
npm run build:main
npm run build:preload
npm run build:renderer
npm run build
```

For feature-specific work, run the smallest relevant test first, then run the broader suite before publishing.

Examples:

- Memory changes: run memory and RAG tests.
- Discord changes: run channel adapter and command tests.
- UI changes: run renderer build and browser checks where possible.
- Voice changes: run TTS, ASR, and call-related tests.
- Automation changes: run parser, coordinate, engine, and platform tests.

## Troubleshooting

### The app does not start

Check that Node.js 24 LTS and npm 10+ are installed, then reinstall dependencies:

```bash
rm -rf node_modules
npm ci
npm run build
npm start
```

If native packages fail, check your platform-specific build tools.

### The model does not respond

Verify:

- The API key is valid.
- The model name matches the provider.
- The base URL is correct.
- The provider supports the selected transport.
- The app has network access.

If the provider works in another client but not here, create a smaller provider profile and test only text chat first.

### Voice output is silent

Check:

- TTS provider configuration
- Voice ID or reference audio settings
- System audio output device
- Playback volume and speed
- Provider quota or API errors

Start with one TTS provider before enabling multiple fallback paths.

### Discord does not connect

Check:

- Bot token
- Server permissions
- Channel allowlist
- Intent settings in the Discord developer portal
- Whether slash commands need to be re-registered

For voice features, verify that the bot can join and speak in the selected voice channel.

### Memory retrieval feels incorrect

Memory behavior depends on extraction, storage, retrieval, and prompt injection. Check:

- Whether memory features are enabled
- Whether the relevant conversation was saved
- Whether embedding or retrieval settings are configured
- Whether a conflicting older memory is being preferred
- Whether the prompt is too short to include retrieved context

For important private data, inspect and delete memories manually instead of relying on automatic cleanup.

## FAQ

### Is this project built from scratch?

No. It is an extended version of the MIT-licensed upstream [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent). The upstream project provided the original companion foundation. This repository documents and develops additional systems around workspace integration, memory workflows, Discord features, mobile control, automation, voice, safety, tests, and portfolio packaging.

### Why keep the upstream credit?

Because it is the correct and professional thing to do. Open-source work can be extended, but the original author, license, and model asset credits should remain visible. For academic review, clear attribution is better than pretending an extension started from nothing.

### Is this project safe to publish publicly?

The source code can be public, but private user data should not be. Do not publish tokens, API keys, local memory files, user conversations, exported backups, cookies, or provider credentials.

### Can it run fully offline?

Some parts can run locally, but the full experience may depend on model providers, TTS providers, Discord, Spotify, or other external services. Offline speech recognition and local retrieval components may require separate downloads.

### Does it support macOS?

The current source build is tested on macOS. Some native automation features differ by platform, and Windows-specific helpers may not apply to macOS.

### Does it support Windows?

The upstream project primarily targeted Windows, and this version keeps Windows support in scope. Some builds may require Rust, Visual Studio Build Tools, and Windows-specific permissions.

### Why split the project into smaller repositories?

The full desktop app is large. Smaller repositories make individual technical areas easier to review, such as memory, Discord activity, mobile control, cloud agent runtime, and game automation.

### Why are there no screenshots?

Broken images make a GitHub project look unfinished. Screenshots can be added later when stable image files are committed to the repository. Until then, the README intentionally uses text-only documentation.

## Security and Privacy

Cyrene Agent is local-first, but external model providers and optional integrations receive the data required to perform their configured tasks.

- Never commit or share the Electron `userData` directory, local settings, tokens, cookies, logs, or private memory files.
- API keys for some services may be stored as local configuration files.
- Supported credentials use Electron `safeStorage` where implemented: DPAPI on Windows, Keychain on macOS, and libsecret on Linux.
- Review the selected tool permission level before enabling command execution or external services.
- Use only trusted MCP servers, Skills, model endpoints, and code directories.

This is experimental companion and agent software. Keep backups of important notes and review tool actions before granting broad permissions.

## Academic and Portfolio Review

This repository is intended to show more than a finished app. It shows the process of turning a complex open-source desktop companion into a broader agent system:

- Reading and extending a large TypeScript/Electron codebase
- Designing a unified workspace around many separate tools
- Connecting local UI, model providers, memory systems, Discord, mobile control, voice, and automation
- Separating reusable engineering modules into their own repositories
- Adding tests and safety boundaries around complex agent behavior
- Writing clear documentation that distinguishes original upstream work from new extensions

For reviewers, the most relevant parts are:

- `src/main/orchestrator/` for agent runtime design
- `src/main/memory/` and `src/main/rag/` for memory and retrieval
- `src/main/channels/adapters/discord/` for Discord integration
- `src/main/game-bot/` for automation tools
- `src/renderer/` for workspace UI and embedded tools
- The standalone module repositories for focused subsystem review

## Project Status

Core desktop conversation, memory, agent execution, voice configuration, themes, notebook, exam mode, games, and primary tools are implemented. RAG, third-party MCP compatibility, proactive delivery, cloud failover, and some messaging integrations remain experimental and may require additional setup.

Contributions, reproducible bug reports, and platform-specific verification are welcome.

## License and Credits

See [LICENSE](./LICENSE) and [MODEL_LICENSE.md](./MODEL_LICENSE.md) for code and model asset terms.

- Original project: [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent)
- Original author: Playa-0v0
- Extended version maintained by: [Clark](https://github.com/clark970417-eng)
- Wuthering Waves ecosystem integration: [WutheringWavesUID](https://github.com/tyql688/WutheringWavesUID)
- Music integration: [cloud-music-mcp](https://github.com/Code-MonkeyZhang/cloud-music-mcp)

Characters, names, and related game assets belong to their respective owners.

## Disclaimer

This is an unofficial, non-commercial fan and research-oriented project. It is not affiliated with, sponsored by, or endorsed by HoYoverse, Kuro Games, Discord, Spotify, OpenAI, Anthropic, or any other third-party service mentioned in the repository.

Use third-party integrations according to their terms of service. Use automation features responsibly. Keep private credentials and user data out of public commits.
