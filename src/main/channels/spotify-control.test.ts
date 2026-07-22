import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));
vi.mock("./inbound-server", () => ({ registerLocalGetRoute: vi.fn() }));
vi.mock("./settings-store", () => ({
  loadChannelsSettings: () => ({
    spotify: { enabled: true, clientId: "client", clientSecret: "secret", refreshToken: "refresh" },
  }),
  saveChannelsSettings: vi.fn(),
}));

import { controlSpotify, spotifyUriFromInput } from "./spotify-control";

describe("Spotify playback control", () => {
  beforeEach(() => fetchMock.mockReset());

  it("converts official track, album and playlist links to Spotify URIs", () => {
    expect(spotifyUriFromInput("https://open.spotify.com/track/abc123?si=test")).toBe("spotify:track:abc123");
    expect(spotifyUriFromInput("https://open.spotify.com/album/album123")).toBe("spotify:album:album123");
    expect(spotifyUriFromInput("spotify:playlist:list123")).toBe("spotify:playlist:list123");
    expect(spotifyUriFromInput("https://example.com/track/abc123")).toBeNull();
  });

  it("searches a song name and starts the matched track on the selected device", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { items: [{ uri: "spotify:track:found" }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await controlSpotify({ command: "play", query: "Cry For Me", deviceId: "computer" });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/search?"), expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.spotify.com/v1/me/player/play?device_id=computer", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ uris: ["spotify:track:found"] }),
    }));
  });
});
