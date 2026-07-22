import { describe, expect, it } from "vitest";
import {
  buildDiscordMusicControls,
  buildDiscordVolumeControl,
  DISCORD_SLASH_COMMAND_NAMES,
  DISCORD_SLASH_COMMANDS,
  musicRequestFromButton,
} from "./slash-commands";

describe("Discord slash commands", () => {
  it("registers unique command names", () => {
    expect(new Set(DISCORD_SLASH_COMMAND_NAMES).size).toBe(DISCORD_SLASH_COMMAND_NAMES.length);
  });

  it("covers chat, voice, music controls, queue editing and status", () => {
    expect(DISCORD_SLASH_COMMAND_NAMES).toEqual(expect.arrayContaining([
      "chat", "join", "leave", "play", "previous", "pause", "resume", "skip", "stop",
      "queue", "clear", "remove", "volume", "repeat", "mode", "status", "help",
    ]));
  });

  it("uses short lowercase English names", () => {
    for (const name of DISCORD_SLASH_COMMAND_NAMES) expect(name).toMatch(/^[a-z]+$/);
  });

  it("keeps every description within Discord limits", () => {
    for (const command of DISCORD_SLASH_COMMANDS) {
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(100);
    }
  });

  it("builds a five-button private music control row", () => {
    const row = buildDiscordMusicControls().toJSON();
    expect(row.components).toHaveLength(5);
    expect(row.components.map((button) => "custom_id" in button ? button.custom_id : undefined)).toEqual([
      "cyrene:music:previous",
      "cyrene:music:toggle",
      "cyrene:music:skip",
      "cyrene:music:stop",
      "cyrene:music:queue",
    ]);
  });

  it("shows only the action available on the combined play button", () => {
    const playing = buildDiscordMusicControls(false).toJSON().components[1];
    const paused = buildDiscordMusicControls(true).toJSON().components[1];
    expect("label" in playing ? playing.label : undefined).toBe("Pause");
    expect("label" in paused ? paused.label : undefined).toBe("Play");
  });

  it("maps music buttons back to commands", () => {
    expect(musicRequestFromButton("cyrene:music:previous")).toEqual({ command: "previous" });
    expect(musicRequestFromButton("cyrene:music:toggle", false)).toEqual({ command: "pause" });
    expect(musicRequestFromButton("cyrene:music:toggle", true)).toEqual({ command: "resume" });
    expect(musicRequestFromButton("cyrene:music:skip")).toEqual({ command: "skip" });
    expect(musicRequestFromButton("unrelated")).toBeNull();
  });

  it("offers preset volume levels without typing a command", () => {
    const row = buildDiscordVolumeControl().toJSON();
    const menu = row.components[0];
    expect("options" in menu ? menu.options.map((option) => option.value) : []).toEqual([
      "0", "25", "50", "75", "100", "125", "150",
    ]);
  });
});
