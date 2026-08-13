# Cyrene Ropebound Activity

An interactive Discord Activity designed and developed by **Clark**. It adapts a rope-based cooperative mini-game into a shared Discord experience where friends can join from the same voice channel or play solo with Cyrene as an AI companion.

[Launch the web preview](https://clark970417-eng.github.io/cyrene-ropebound-activity/)

## My work

I designed and implemented the Discord Activity integration, including:

- a multiplayer lobby for people in the same Discord Activity instance;
- automatic host and Player 2 assignment;
- real-time player input and game-state synchronization;
- a solo mode with Cyrene as the Player 2 companion;
- graceful fallback to a standalone browser preview;
- responsive presentation and GitHub Pages deployment.

This repository contains the production build used by the Discord Activity. The broader application and integration source are maintained in [Cyrene Agent](https://github.com/clark970417-eng/Cyrene-Agent).

## How it works

1. Open the Activity from a Discord voice channel.
2. The first participant becomes the host.
3. Another participant can take control of Player 2.
4. If nobody joins, the host can continue with Cyrene as an AI companion.
5. Anyone can choose solo mode without affecting the shared session.

## Controls

| Action | Key |
| --- | --- |
| Move | `A` / `D` |
| Jump | `W` or `Space` |
| Character skill | `F` |
| Grab / Throw | `E` |

## Technology

- TypeScript, React, and Vite
- Discord Embedded App SDK
- Supabase Realtime for presence, input relay, and state sync
- GitHub Pages for the standalone deployment

## Project structure

- `index.html` and `assets/` — Discord Activity shell and multiplayer integration
- `ropebound-original/` — embedded game build and media assets
- `gh-pages` — production deployment branch

## Credits and disclaimer

This is an independent, non-commercial fan project. Cyrene and related *Honkai: Star Rail* characters and assets belong to HoYoverse and their respective rights holders. This project is not affiliated with or endorsed by HoYoverse or Discord.

Project design, Discord integration, multiplayer implementation, and deployment by [Clark](https://github.com/clark970417-eng).
