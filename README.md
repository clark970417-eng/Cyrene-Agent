# Cyrene Agent

<div align="center">

**A local-first, memory-aware AI desktop companion inspired by Cyrene.**

Built with Electron, TypeScript, React, Live2D, and an extensible agent runtime.

[Features](#features) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Configuration](#configuration) · [Development](#development) · [Safety](#security-and-privacy)

</div>

> [!NOTE]
> This repository is a community-maintained fork of [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent). It is an unofficial fan project and is not affiliated with HoYoverse.

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

## Configuration

Open **Settings** in the application and configure:

1. **Model provider** — API key, endpoint, model, transport, and optional vision model.
2. **Appearance** — Cyrene Night or Pearl Light, font, spacing, window radius, and companion behavior.
3. **Memory and RAG** — embedding model, reranker, document imports, and optional Obsidian Vault.
4. **Voice** — TTS engine, voice ID or reference audio, streaming, speed, volume, and optional ASR.
5. **Permissions** — read-only, scoped, per-action, or full tool execution.
6. **Optional channels** — Discord, Feishu, WeChat, Spotify, music, and cloud services.

Most settings are stored under Electron's platform-specific `userData` directory and are applied without restarting the app.

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

## Security and Privacy

Cyrene Agent is local-first, but external model providers and optional integrations receive the data required to perform their configured tasks.

- Never commit or share the Electron `userData` directory, local settings, tokens, cookies, logs, or private memory files.
- API keys for some services may be stored as local configuration files.
- Supported credentials use Electron `safeStorage` where implemented: DPAPI on Windows, Keychain on macOS, and libsecret on Linux.
- Review the selected tool permission level before enabling command execution or external services.
- Use only trusted MCP servers, Skills, model endpoints, and code directories.

This is experimental companion and agent software. Keep backups of important notes and review tool actions before granting broad permissions.

## Project Status

Core desktop conversation, memory, agent execution, voice configuration, themes, notebook, exam mode, games, and primary tools are implemented. RAG, third-party MCP compatibility, proactive delivery, cloud failover, and some messaging integrations remain experimental and may require additional setup.

Contributions, reproducible bug reports, and platform-specific verification are welcome.

## License and Credits

See [LICENSE](./LICENSE) and [MODEL_LICENSE.md](./MODEL_LICENSE.md) for code and model asset terms.

- Original project: [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent)
- Wuthering Waves ecosystem integration: [WutheringWavesUID](https://github.com/tyql688/WutheringWavesUID)
- Music integration: [cloud-music-mcp](https://github.com/Code-MonkeyZhang/cloud-music-mcp)

Characters, names, and related game assets belong to their respective owners.
