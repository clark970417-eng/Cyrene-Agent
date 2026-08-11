# Cyrene Agent

**An Electron and TypeScript desktop AI companion system with long-term memory, voice interaction, Discord integration, mobile access, cloud services, and automation tools.**

> This repository is an extended version of the MIT-licensed [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent). The upstream project provided the original desktop companion foundation. This version expands it into a broader AI agent system with additional workspace, memory, Discord, mobile, voice, automation, and reliability features.

## Overview

Cyrene Agent is a local-first desktop AI companion project. It combines character-based conversation, persistent memory, voice interaction, tool calling, study workflows, Discord connectivity, mobile controls, and game automation experiments inside one desktop application.

The goal of this project is not only to build a companion app, but also to explore how a practical AI agent can coordinate many subsystems:

- conversation and long-term memory
- desktop UI and Live2D interaction
- voice input and speech output
- external platforms such as Discord
- local files, documents, and tools
- mobile access and cloud fallback
- automation, games, and task workflows

## My Main Contributions

This version adds and refactors several major systems on top of the upstream foundation:

- Built a unified workspace for chat, tools, settings, notebook, games, study mode, and agent status.
- Expanded long-term memory and RAG utilities, including memory layers, retrieval, conflict handling, and inspection workflows.
- Added Discord bot features, slash commands, voice support, music helpers, shared activities, and cloud runtime experiments.
- Added a mobile dashboard and local server bridge for controlling selected agent features from a phone browser.
- Added game room features, Wuthering Waves helper tools, OCR-assisted workflows, and desktop automation utilities.
- Improved voice and call behavior with multiple TTS providers, ASR configuration, early playback, and usage tracking.
- Added safety-oriented behavior for credentials, tool permissions, backups, and sensitive-file handling.
- Added tests across memory, channels, voice, settings, game logic, automation, and agent behavior.
- Separated several subsystems into standalone public repositories for easier portfolio review.

## Features

### Desktop companion

- Electron desktop application with TypeScript
- Live2D companion panel with expressions, motions, speech bubbles, and mood/status behavior
- Multi-session chat and configurable response style
- Dark/light theme support and configurable interface settings
- Localized interface support for non-English workflows

### Agent runtime

- Multiple modes for chat, work, coding, learning, and daily tasks
- Tool calling with permission controls and visible progress
- Model provider profiles for OpenAI-compatible, Anthropic-compatible, and custom endpoints
- Runtime context building from conversation, memory, files, tasks, and selected tools
- MCP and reusable skill-style tool instructions

### Memory and retrieval

- Multi-layer memory system for user facts, relationships, events, and working context
- Retrieval-augmented generation with vector search and keyword search
- Optional reranking and worldbook-style long-term context
- Memory inspection, deletion, and synchronization workflows
- Obsidian-oriented study and note organization support

### Voice

- Text-to-speech provider support
- Optional speech recognition and call mode
- Streaming playback and natural response segmentation
- Voice configuration for speed, volume, voice ID, and reference audio

### Discord and cloud

- Discord bot adapter and slash-command utilities
- Voice channel and music-related helpers
- Shared notebook and activity-style interaction experiments
- Optional cloud bot runtime and failover tooling
- Spotify and other media-control integrations where configured

### Study, productivity, and games

- Shared notebook with categories and editable entries
- Exam mode with generated questions, scoring, explanations, and review
- Document, spreadsheet, presentation, and PDF-oriented agent workflows
- Game room and relationship-style interactions
- Wuthering Waves helper tools
- Screenshot/OCR-assisted game automation experiments

## Standalone Module Repositories

To make the engineering work easier to review, several subsystems were also separated into smaller public repositories:

| Repository | Purpose |
| --- | --- |
| [ai-companion-desktop-system](https://github.com/clark970417-eng/ai-companion-desktop-system) | Full desktop AI companion system and integration overview |
| [long-term-memory-engine](https://github.com/clark970417-eng/long-term-memory-engine) | Memory, retrieval, conflict resolution, and RAG utilities |
| [realtime-discord-activity](https://github.com/clark970417-eng/realtime-discord-activity) | Discord activity layer with voice, music, notebook, and shared interaction features |
| [discord-cloud-agent](https://github.com/clark970417-eng/discord-cloud-agent) | Cloud Discord agent runtime with deployment examples |
| [game-automation-tools](https://github.com/clark970417-eng/game-automation-tools) | Scriptable automation toolkit for screenshots, coordinates, and recipes |
| [mobile-agent-dashboard](https://github.com/clark970417-eng/mobile-agent-dashboard) | Mobile web dashboard and local server bridge |
| [wuthering-waves-agent-tools](https://github.com/clark970417-eng/wuthering-waves-agent-tools) | Focused Wuthering Waves helper tools for agent workflows |

These repositories are focused examples, while this repository shows the full integrated application.

## Architecture

```text
Electron Main Process
├── Agent orchestration, tools, model providers, and MCP integration
├── Long-term memory, RAG, relationship logs, and context construction
├── Voice, TTS, ASR, screenshots, notifications, and media services
├── Discord, mobile, Feishu/Lark, WeChat, Spotify, and cloud adapters
├── Game automation, OCR helpers, recipes, and desktop input tools
└── Secure preload bridges
    └── Renderer workspace
        ├── Chat, work, code, learn, and daily modes
        ├── Settings, notebook, exam mode, and study tools
        ├── Game room, mobile views, and Wuthering Waves utilities
        └── Live2D companion UI and shared theme system
```

## Project Structure

| Path | Description |
| --- | --- |
| `src/main/` | Electron main process, agent runtime, memory, tools, voice, and integrations |
| `src/main/orchestrator/` | Agent loop, context building, tools, model adapters, and execution policy |
| `src/main/memory/` | Memory stores, views, scheduling, conflict handling, and audits |
| `src/main/rag/` | Retrieval, embeddings, chunking, vector store, reranking, and worldbook utilities |
| `src/main/channels/` | Discord, Feishu/Lark, WeChat, inbound server, and message routing |
| `src/main/game-bot/` | Screenshot, coordinates, input, recipes, and automation engine |
| `src/preload/` | Context-isolated bridge APIs |
| `src/renderer/` | Workspace UI, companion UI, notebook, games, settings, and embedded tools |
| `src/shared/` | Shared TypeScript types and IPC channels |
| `mobile/` | Static mobile dashboard assets |
| `cloud-bot/` | Optional cloud Discord agent runtime |
| `prompts/` | System, mode, worldbook, and character prompts |

## Quick Start

### Requirements

- Node.js 24 LTS
- npm 10 or newer
- Git
- macOS 13+ or Windows 10/11
- A supported LLM API key

### Install and run

```bash
git clone https://github.com/clark970417-eng/Cyrene-Agent.git
cd Cyrene-Agent
npm ci
npm run build
npm start
```

For development:

```bash
npm run dev
```

## Configuration

Open the app settings and configure:

1. Model provider, base URL, model name, and API key
2. Appearance and companion behavior
3. Memory and RAG settings
4. Voice provider, speech recognition, and playback settings
5. Optional Discord, mobile, cloud, music, and automation features
6. Tool permissions and trusted directories

Do not commit API keys, bot tokens, cookies, local memory files, private conversations, exported backups, or Electron `userData`.

## Development and Testing

Common commands:

```bash
npm test
npm run build:main
npm run build:preload
npm run build:renderer
npm run build
```

The project includes tests across memory, RAG, Discord channels, settings, voice, game logic, automation, and agent behavior. Some integrations require platform-specific permissions or external service credentials.

## Portfolio Notes

For academic review, the most important parts of this project are:

- integrating a large Electron and TypeScript codebase
- extending an open-source companion framework while preserving attribution
- building long-term memory and retrieval systems
- connecting Discord, mobile, voice, cloud, and automation workflows
- separating reusable subsystems into smaller public repositories
- adding safety checks, local-first storage decisions, and tests
- documenting what came from upstream and what was added in this version

## Status

Core desktop chat, memory, workspace navigation, voice configuration, notebook, games, Discord integration, and primary tools are implemented. Some advanced integrations, local model features, cloud failover behavior, and automation workflows remain experimental and may require additional setup.

## License and Credits

- Original project: [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent)
- Original author: Playa-0v0
- Extended version maintained by: [Clark](https://github.com/clark970417-eng)
- License: [MIT License](./LICENSE)
- Model and character asset notes: [MODEL_LICENSE.md](./MODEL_LICENSE.md)

Characters, names, models, and related game assets belong to their respective owners. This is an unofficial, non-commercial fan and engineering project and is not affiliated with or endorsed by HoYoverse, Kuro Games, Discord, Spotify, OpenAI, Anthropic, or other third-party services mentioned in the repository.
