import { describe, expect, it } from "vitest";
import {
  findDiscordMusicUrl,
  formatMusicDuration,
  cleanDiscordMusicTrackTitle,
  cleanDiscordMusicPlaylistTitle,
  normalizeYtDlpResult,
  parseDiscordMusicRequest,
} from "./music-source";

describe("Discord music request parsing", () => {
  it.each([
    "https://youtu.be/abcdefghijk",
    "https://www.youtube.com/watch?v=abcdefghijk&list=PL123",
    "https://www.bilibili.com/video/BV1234567890?p=5",
    "https://b23.tv/abc123",
  ])("accepts a supported music URL: %s", (url) => {
    expect(findDiscordMusicUrl(`幫我播放 ${url}`)).toBe(url);
  });

  it("does not intercept unrelated links", () => {
    expect(findDiscordMusicUrl("看看 https://example.com/video")).toBeUndefined();
  });

  it.each([
    ["暫停播放", "pause"],
    ["繼續播放！", "resume"],
    ["下一首", "skip"],
    ["停止音樂", "stop"],
    ["播放清單", "queue"],
    ["單曲循環", "repeat-track"],
    ["列表循環", "repeat-queue"],
    ["隨機播放", "shuffle"],
    ["順序播放", "ordered"],
    ["清空歌單", "clear"],
  ] as const)("parses %s", (text, command) => {
    expect(parseDiscordMusicRequest(text)).toEqual({ command });
  });

  it("parses queue editing and volume values", () => {
    expect(parseDiscordMusicRequest("移除第3首")).toEqual({ command: "remove", value: 3 });
    expect(parseDiscordMusicRequest("音量75")).toEqual({ command: "volume", value: 75 });
  });
});

describe("yt-dlp playlist normalization", () => {
  it("removes source and quality metadata from a playlist title", () => {
    expect(cleanDiscordMusicPlaylistTitle("【音乐集】 葬送的芙莉莲 歌曲全收录 【Hi-Res/完整版/中日歌词】"))
      .toBe("葬送的芙莉莲 歌曲全收录");
  });

  it("separates a repeated Bilibili playlist prefix from each song title", () => {
    const playlist = "【音乐集】葬送的芙莉莲 歌曲全收录【Hi-Res/完整版/中日歌词】";
    expect(cleanDiscordMusicTrackTitle(`${playlist} p02 【第一季 ED】 Anytime Anywhere`, playlist))
      .toBe("【第一季 ED】 Anytime Anywhere");
  });

  it("continues a Bilibili multi-part video from the requested part", () => {
    const tracks = normalizeYtDlpResult({
      playlist_count: 6,
      entries: Array.from({ length: 6 }, (_, index) => ({
        id: `part-${index + 1}`,
        title: `第 ${index + 1} 首`,
        webpage_url: `https://www.bilibili.com/video/BVTEST?p=${index + 1}`,
        duration: 60 + index,
      })),
    }, "https://www.bilibili.com/video/BVTEST?p=5");

    expect(tracks.map((track) => track.title)).toEqual(["第 5 首", "第 6 首"]);
    expect(tracks[0]).toMatchObject({ index: 5, total: 6, duration: 64 });
  });

  it("formats durations for queue messages", () => {
    expect(formatMusicDuration(125)).toBe("2:05");
    expect(formatMusicDuration(undefined)).toBe("");
  });

  it("uses the playlist title when a flat entry has no title", () => {
    const tracks = normalizeYtDlpResult({
      title: "超時空輝夜姬歌曲全收錄",
      playlist_count: 2,
      entries: [
        { url: "https://www.bilibili.com/video/BVTEST?p=1" },
        { url: "https://www.bilibili.com/video/BVTEST?p=2" },
      ],
    }, "https://www.bilibili.com/video/BVTEST");
    expect(tracks.map((track) => track.title)).toEqual(["第 1 首", "第 2 首"]);
    expect(tracks[0].playlistTitle).toBe("超時空輝夜姬歌曲全收錄");
  });

  it("keeps the best available video thumbnail for the desktop player", () => {
    const [track] = normalizeYtDlpResult({
      title: "封面測試",
      thumbnails: [{ url: "https://img.example/small.jpg" }, { url: "https://img.example/large.jpg" }],
    }, "https://youtu.be/abcdefghijk");
    expect(track.thumbnail).toBe("https://img.example/large.jpg");
  });
});
