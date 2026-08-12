// init-channels —— channels 模块的主入口。由 index.ts 在 app.whenReady() 调一次。
//
// 当前阶段：
//   - Phase 0: 骨架 + dispatcher + inbound-server
//   - Phase 2: 接入 FeishuAdapter（自建飞书应用 + 事件订阅）
//
// 注意：initChannels 必须晚于 initRAG / initMcpManager / loadModelSettings。
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile, stat } from "node:fs/promises";
import { IPC } from "../../shared/ipc-channels";
import { loadChannelsSettings, saveChannelsSettings } from "./settings-store";
import { channelManager } from "./manager";
import { channelDispatcher } from "./dispatcher";
import { startInboundServer, stopInboundServer } from "./inbound-server";
import { FeishuAdapter } from "./adapters/feishu";
import {
  ILinkBotAdapter,
  loadCredentials,
} from "./adapters/wechat/ilink-bot-adapter";
import { DiscordAdapter } from "./adapters/discord";
import { loadDiscordMusicHistory } from "./adapters/discord/music-history";
import { loadDiscordMusicFavorites } from "./adapters/discord/music-favorites";
import {
  controlSpotify,
  disconnectSpotify,
  getSpotifyStatus,
  startSpotifyAuthorization,
} from "./spotify-control";
import {
  configureBilibiliBrowserCookies,
  getOperaGxProfilePath,
  testBilibiliBrowserCookies,
} from "./adapters/discord/music-source";
import { getRecentLog, clearLog } from "./message-log";
import { logger, LogTag } from "../logger";
import { xNotificationService } from "../services/x-notification-service";
import {
  loadXNotificationConfig,
  saveXNotificationConfig,
  type XNotificationConfig,
} from "../services/x-notification-store";
import { aniListNotificationService } from "../services/anilist-notification-service";
import {
  loadAniListNotificationConfig,
  saveAniListNotificationConfig,
  type AniListNotificationConfig,
} from "../services/anilist-notification-store";

const LOG = "[ChannelsInit]";

let initialized = false;
let conversationLifecycle: {
  onUserMessage(): void;
  onConversationStarted(): void;
  onConversationEnded(): void;
} | null = null;

export function setChannelsConversationLifecycle(
  lifecycle: typeof conversationLifecycle,
): void {
  conversationLifecycle = lifecycle;
}
/** 微信 adapter 全局引用（UI 登录按钮需要） */
let wxAdapter: ILinkBotAdapter | null = null;

/** app.whenReady() 调一次。idempotent。 */
export async function initChannels(): Promise<void> {
  if (initialized) return;
  initialized = true;
  channelDispatcher.reloadSettings();
  configureBilibiliBrowserCookies(loadChannelsSettings().bilibili.enabled);

  // 注入 dispatcher 到 manager
  channelManager.setDispatcher(async (msg) => {
    conversationLifecycle?.onUserMessage();
    conversationLifecycle?.onConversationStarted();
    try {
      return await channelDispatcher.handleIncoming(msg);
    } finally {
      conversationLifecycle?.onConversationEnded();
    }
  });

  // 注册全局 IPC
  registerChannelsIpc();

  // 启动 inbound-server
  try {
    const handle = await startInboundServer();
    logger.info(
      LogTag.InboundServer,
      `listening on http://127.0.0.1:${handle.port}`,
    );
  } catch (err) {
    console.error(LOG, "入站 server 启动失败:", err);
  }

  // 注册 adapter
  const feishuAdapter = new FeishuAdapter();
  channelManager.register(feishuAdapter);

  const discordAdapter = new DiscordAdapter(
    async (msg) => await channelManager.dispatchOnly(msg),
    () => broadcastChannelsStatus(),
  );
  channelManager.register(discordAdapter);

  // 注册微信 adapter（iLink 直连微信，不依赖 OpenClaw Gateway）
  // 改为 module-level handle，UI 登录按钮也能拿到
  wxAdapter = new ILinkBotAdapter();
  channelManager.register(wxAdapter);

  // 启动所有已注册 adapter
  await channelManager.startAll();
  xNotificationService.start();
  aniListNotificationService.start();

  logger.info(LogTag.Channels, "channels module ready");
  broadcastChannelsStatus();
}

/** app.on('before-quit') 调 */
export async function shutdownChannels(): Promise<void> {
  xNotificationService.stop();
  aniListNotificationService.stop();
  await channelManager.stopAll();
  await stopInboundServer();
  initialized = false;
}

/** IPC 注册 */
function registerChannelsIpc(): void {
  ipcMain.handle(IPC.CHANNELS_GET_CONFIG, () => loadChannelsSettings());

  ipcMain.handle(IPC.CHANNELS_SAVE_CONFIG, (_e, patch: unknown) => {
    const saved = saveChannelsSettings(
      patch as Parameters<typeof saveChannelsSettings>[0],
    );
    channelDispatcher.reloadSettings();
    configureBilibiliBrowserCookies(saved.bilibili.enabled);
    return saved;
  });

  ipcMain.handle(IPC.CHANNELS_LIST, () => channelManager.listChannels());

  ipcMain.handle(IPC.CHANNELS_GET_STATUS, () => channelManager.getAllStatus());

  ipcMain.handle(IPC.CHANNELS_RESTART, async () => {
    await channelManager.stopAll();
    await channelManager.startAll();
    broadcastChannelsStatus();
    return { ok: true };
  });

  // ── 微信 IPC (iLink 直连版) ───────────────────────────────────────────────────────

  ipcMain.handle(IPC.CHANNELS_WECHAT_RUNTIME_DETECT, () => {
    // iLink Bot API 是腾讯的远程协议，不需本地安装
    return { installed: true, version: "ilink/1.0.0" };
  });

  // 扫码登录：Main Process 生成 PNG dataURL，推给 Renderer 显示 <img>
  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGIN_START, async () => {
    if (!wxAdapter) return { ok: false, error: "adapter 未初始化" };
    try {
      const { fetchQrCode } =
        await import("./adapters/wechat/ilink-protocol-client");
      const { createQrDataUrl } = await import("./adapters/wechat/qr");

      // 1. 拿原始 qrcode 字符串 + liteapp 二维码 URL
      //    - qrcode: 32 hex ticket（轮询 get_qrcode_status 用）
      //    - qrcode_img_content: liteapp.weixin.qq.com/q/... URL（扫了会拉起 iLink 灰度插件）
      const { qrcode, qrcode_img_content } = await fetchQrCode();

      // 2. Main Process 生成 PNG dataURL（用 liteapp URL 而不是裸 ticket，
      //    否则微信只识别为纯文本、不会触发 iLink 确认流程）
      const dataUrl = await createQrDataUrl(qrcode_img_content, 256);

      // 3. 推给 Renderer
      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      win?.webContents.send(IPC.CHANNELS_WECHAT_QRCODE, dataUrl);

      // 4. 后台轮询扫码状态
      void (async () => {
        try {
          const creds = await wxAdapter!.login(qrcode);
          await wxAdapter!.stop();
          await wxAdapter!.start();
          win?.webContents.send(IPC.CHANNELS_WECHAT_LOGIN_DONE, {
            ok: true,
            botId: creds.ilinkBotId,
          });
        } catch (err) {
          win?.webContents.send(IPC.CHANNELS_WECHAT_LOGIN_DONE, {
            ok: false,
            error: String(err),
          });
        }
      })();

      return { ok: true, hint: "请扫描二维码" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGIN_CANCEL, () => {
    return { ok: true };
  });

  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGIN_RESULT, async () => {
    if (!wxAdapter) return { connected: false };
    const status = wxAdapter.getStatus();
    return {
      running: status.phase === "starting",
      connected: status.phase === "running",
      loggedIn: wxAdapter.isLoggedIn,
    };
  });

  ipcMain.handle(IPC.CHANNELS_WECHAT_PAIRING_LIST, () => {
    // iLink 模式没有 pairing 概念
    return [];
  });

  ipcMain.handle(IPC.CHANNELS_WECHAT_PAIRING_APPROVE, () => ({
    ok: false,
    error: "iLink 模式不支持 pairing",
  }));

  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGOUT, async () => {
    if (!wxAdapter) return { ok: false };
    await wxAdapter.logout();
    return { ok: true };
  });

  ipcMain.handle(IPC.CHANNELS_WECHAT_RUNTIME_INSTALL, () => ({
    ok: true,
    hint: "iLink Bot API 是云端协议，无需本地安装",
  }));

  ipcMain.handle(IPC.CHANNELS_WECHAT_RUNTIME_UPDATE, () => ({ ok: true }));

  ipcMain.handle(IPC.CHANNELS_WECHAT_INSTALL, async () => {
    if (!wxAdapter) return { ok: false };
    await wxAdapter.stop();
    await wxAdapter.start();
    return { ok: true, phase: "ready" };
  });

  // Phase 2 长连接：测试连接 = 重建 LarkChannel（SDK 内部会自动跑 WSS handshake）
  ipcMain.handle(IPC.CHANNELS_FEISHU_TEST_CONNECTION, async () => {
    const adapter = channelManager.getAdapter("feishu") as
      FeishuAdapter | undefined;
    if (!adapter) return { ok: false, error: "飞书 adapter 未注册" };
    const status = adapter.getStatus();
    if (!status.enabled) return { ok: false, error: "飞书渠道未启用" };
    if (
      !loadChannelsSettings().feishu.appId ||
      !loadChannelsSettings().feishu.appSecret
    ) {
      return { ok: false, error: "App ID / App Secret 未配置" };
    }
    try {
      await adapter.rebuild();
      const s = adapter.getStatus();
      if (s.phase === "running") {
        return { ok: true, message: "WSS 长连接已建立" };
      }
      return { ok: false, error: s.message ?? "握手未完成" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // 长连接模式不需要 webhook URL —— 这个 IPC 保留但返回 ok 提示用户用长连接
  ipcMain.handle(IPC.CHANNELS_FEISHU_TEST_WEBHOOK_REACHABLE, async () => {
    return {
      ok: true,
      message: "长连接模式不需要公网 URL — SDK 已自动建立 WSS 连接",
    };
  });

  ipcMain.handle(IPC.CHANNELS_DISCORD_TEST_CONNECTION, async () => {
    const adapter = channelManager.getAdapter("discord") as
      DiscordAdapter | undefined;
    if (!adapter) return { ok: false, error: "Discord adapter 未註冊" };
    try {
      await adapter.rebuild();
      let status = adapter.getStatus();
      if (status.enabled && status.phase === "starting") {
        for (let i = 0; i < 10 && status.phase === "starting"; i++) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          status = adapter.getStatus();
        }
      }
      broadcastChannelsStatus();
      return status.phase === "running" ||
        status.phase === "starting" ||
        (!status.enabled && status.phase === "offline")
        ? { ok: true, message: status.message ?? "Discord Gateway 已連接" }
        : { ok: false, error: status.message ?? "連接失敗" };
    } catch (error) {
      broadcastChannelsStatus();
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(IPC.CHANNELS_DISCORD_GET_PROFILE, () => {
    const adapter = channelManager.getAdapter("discord") as
      DiscordAdapter | undefined;
    return (
      adapter?.getProfile() ?? {
        connected: false,
        guildCount: 0,
        guilds: [],
        voiceActive: false,
      }
    );
  });
  ipcMain.handle(IPC.CHANNELS_DISCORD_GET_MUSIC_STATE, () => {
    const adapter = channelManager.getAdapter("discord") as
      DiscordAdapter | undefined;
    return (
      adapter?.getMusicState() ?? {
        active: false,
        paused: false,
        current: null,
        queue: [],
        volume: 100,
        repeat: "off",
        shuffle: false,
        autoplay: false,
        elapsed: 0,
      }
    );
  });
  ipcMain.handle(IPC.CHANNELS_DISCORD_GET_MUSIC_HISTORY, () =>
    loadDiscordMusicHistory(50),
  );
  ipcMain.handle(IPC.CHANNELS_DISCORD_GET_MUSIC_FAVORITES, () =>
    loadDiscordMusicFavorites(500),
  );
  ipcMain.handle(
    IPC.CHANNELS_DISCORD_CONTROL_MUSIC,
    async (_event, raw: unknown) => {
      const adapter = channelManager.getAdapter("discord") as
        DiscordAdapter | undefined;
      if (!adapter) return { ok: false, message: "Discord adapter 未註冊" };
      const input = (raw && typeof raw === "object" ? raw : {}) as Record<
        string,
        unknown
      >;
      return adapter.controlMusic({
        command: input.command as Parameters<
          DiscordAdapter["controlMusic"]
        >[0]["command"],
        value: typeof input.value === "number" ? input.value : undefined,
      });
    },
  );
  ipcMain.handle(IPC.CHANNELS_DISCORD_CLOUD_STATUS, async () => {
    const adapter = channelManager.getAdapter("discord") as
      DiscordAdapter | undefined;
    return adapter?.getCloudControlStatus();
  });
  ipcMain.handle(
    IPC.CHANNELS_DISCORD_CLOUD_CONTROL,
    async (_event, action: "local" | "cloud" | "restart-cloud") => {
      const adapter = channelManager.getAdapter("discord") as
        DiscordAdapter | undefined;
      if (!adapter) throw new Error("Discord adapter 未初始化");
      return adapter.controlCloud(action);
    },
  );
  ipcMain.handle(IPC.CHANNELS_DISCORD_PICK_AVATAR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "圖片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      ],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(IPC.CHANNELS_DISCORD_PICK_BANNER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "圖片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      ],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(IPC.CHANNELS_DISCORD_PICK_CLOUD_KEY, async () => {
    const result = await dialog.showOpenDialog({
      title: "選擇 Google Cloud SSH 私鑰",
      buttonLabel: "使用這個私鑰",
      properties: ["openFile", "showHiddenFiles"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(
    IPC.CHANNELS_DISCORD_UPDATE_PROFILE,
    async (_event, raw: unknown) => {
      const adapter = channelManager.getAdapter("discord") as
        DiscordAdapter | undefined;
      if (!adapter) return { ok: false, error: "Discord adapter 未註冊" };
      const input = (raw && typeof raw === "object" ? raw : {}) as Record<
        string,
        unknown
      >;
      try {
        let avatar: Buffer | undefined;
        let banner: Buffer | undefined;
        if (typeof input.avatarPath === "string" && input.avatarPath) {
          if ((await stat(input.avatarPath)).size > 8 * 1024 * 1024)
            throw new Error("頭像檔案不可超過 8 MB");
          avatar = await readFile(input.avatarPath);
        }
        if (typeof input.bannerPath === "string" && input.bannerPath) {
          if ((await stat(input.bannerPath)).size > 10 * 1024 * 1024)
            throw new Error("Banner 檔案不可超過 10 MB");
          banner = await readFile(input.bannerPath);
        }
        const profile = await adapter.updateProfile({
          username:
            typeof input.username === "string" ? input.username : undefined,
          activityText:
            typeof input.activityText === "string"
              ? input.activityText
              : undefined,
          status:
            typeof input.status === "string"
              ? (input.status as "online" | "idle" | "dnd" | "invisible")
              : undefined,
          avatar,
          banner,
        });
        return { ok: true, profile };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    IPC.CHANNELS_SPOTIFY_AUTHORIZE,
    (_event, input: { clientId?: string; clientSecret?: string }) =>
      startSpotifyAuthorization(input ?? {}),
  );
  ipcMain.handle(IPC.CHANNELS_SPOTIFY_GET_STATUS, () => getSpotifyStatus());
  ipcMain.handle(
    IPC.CHANNELS_SPOTIFY_CONTROL,
    (
      _event,
      input: {
        command?: string;
        value?: number;
        deviceId?: string;
        query?: string;
      },
    ) => controlSpotify(input ?? {}),
  );
  ipcMain.handle(IPC.CHANNELS_SPOTIFY_DISCONNECT, () => {
    disconnectSpotify();
    return { ok: true };
  });

  ipcMain.handle(IPC.CHANNELS_BILIBILI_GET_STATUS, () => {
    const config = loadChannelsSettings().bilibili;
    return {
      connected: config.enabled,
      browser: "Opera GX",
      profilePath: getOperaGxProfilePath(),
    };
  });
  ipcMain.handle(IPC.CHANNELS_BILIBILI_CONNECT, async () => {
    try {
      const verified = await testBilibiliBrowserCookies();
      saveChannelsSettings({
        bilibili: { enabled: true, browser: "opera-gx" },
      });
      configureBilibiliBrowserCookies(true);
      return {
        ok: true,
        message: "已連接 Opera GX 的 Bilibili 登入狀態",
        ...verified,
      };
    } catch (error) {
      configureBilibiliBrowserCookies(false);
      saveChannelsSettings({
        bilibili: { enabled: false, browser: "opera-gx" },
      });
      return {
        ok: false,
        error: `無法讀取 Opera GX 的 Bilibili 登入狀態：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
  ipcMain.handle(IPC.CHANNELS_BILIBILI_DISCONNECT, () => {
    configureBilibiliBrowserCookies(false);
    saveChannelsSettings({ bilibili: { enabled: false, browser: "opera-gx" } });
    return { ok: true, message: "Bilibili 已解除連接；Opera GX 登入不受影響" };
  });

  // Phase 3.4：消息日志
  ipcMain.handle(IPC.CHANNELS_LOG_GET, (_e, limit: unknown) => {
    const n = typeof limit === "number" && limit > 0 ? limit : 100;
    return getRecentLog(n);
  });
  ipcMain.handle(IPC.CHANNELS_LOG_CLEAR, () => {
    clearLog();
    return { ok: true };
  });

  // X (Twitter) Notifications
  ipcMain.handle(IPC.X_NOTIFICATIONS_GET_CONFIG, () => loadXNotificationConfig());
  ipcMain.handle(IPC.X_NOTIFICATIONS_SAVE_CONFIG, (_e, patch: unknown) => {
    const current = loadXNotificationConfig();
    const input = (patch && typeof patch === "object" ? patch : {}) as Partial<XNotificationConfig>;
    const updated: XNotificationConfig = {
      ...current,
      ...input,
    };
    saveXNotificationConfig(updated);
    xNotificationService.start();
    return { ok: true, config: updated };
  });
  ipcMain.handle(IPC.X_NOTIFICATIONS_CHECK_NOW, async () => {
    const res = await xNotificationService.checkAllAccounts();
    return { ok: true, ...res };
  });
  ipcMain.handle(IPC.X_NOTIFICATIONS_TEST_POST, async (_e, input: unknown) => {
    const data = (input && typeof input === "object" ? input : {}) as { username?: string; category?: string };
    const username = (data.username || "Wuthering_Waves").replace(/^@/, "");
    const category = (data.category || "game") as "news" | "anime" | "game" | "leak" | "general";
    const sampleTweet = {
      id: String(Date.now()),
      url: `https://x.com/${username}`,
      text: `這是一條來自 @${username} 的 X (Twitter) 測試通知！昔漣已成功連結 Discord 頻道。`,
      authorName: username,
      authorUsername: username,
      mediaUrls: [],
      pubDate: new Date().toISOString(),
    };
    const posted = await xNotificationService.broadcastTweetToDiscord(
      { id: "test", username, category, enabled: true },
      sampleTweet
    );
    return posted
      ? { ok: true, message: `測試通知已發送至 Discord ${category} 頻道！` }
      : { ok: false, error: "發送測試通知失敗，請確認昔漣 Discord Bot 已連線且具備發文權限。" };
  });
  ipcMain.handle(IPC.X_NOTIFICATIONS_TEST_ALL, async () => {
    const config = loadXNotificationConfig();
    const accounts = config.accounts || [];
    let successCount = 0;

    for (const acc of accounts) {
      if (!acc.enabled) continue;
      let tweets: Array<any> = [];
      try {
        tweets = await xNotificationService.fetchLatestTweets(acc.username);
      } catch {}

      const tweetToPost = tweets[0] || {
        id: String(Date.now()),
        url: `https://x.com/${acc.username}`,
        text: `這是來自 @${acc.username} 的即時動態測試卡片！昔漣已成功綁定此帳號至 Discord ${acc.category} 頻道。`,
        authorName: acc.displayName || acc.username,
        authorUsername: acc.username,
        mediaUrls: [],
        pubDate: new Date().toISOString(),
      };

      const posted = await xNotificationService.broadcastTweetToDiscord(acc, tweetToPost);
      if (posted) successCount++;
      await new Promise((r) => setTimeout(r, 500));
    }

    return {
      ok: true,
      postedCount: successCount,
      total: accounts.filter((a) => a.enabled).length,
      message: `已成功發送 ${successCount} 個帳號的最新動態測試卡片至 Discord 頻道！`,
    };
  });

  // AniList Airing Notifications
  ipcMain.handle(IPC.ANILIST_NOTIFICATIONS_GET_CONFIG, () => loadAniListNotificationConfig());
  ipcMain.handle(IPC.ANILIST_NOTIFICATIONS_SAVE_CONFIG, (_e, patch: unknown) => {
    const current = loadAniListNotificationConfig();
    const input = (patch && typeof patch === "object" ? patch : {}) as Partial<AniListNotificationConfig>;
    const updated: AniListNotificationConfig = {
      ...current,
      ...input,
    };
    saveAniListNotificationConfig(updated);
    aniListNotificationService.start();
    return { ok: true, config: updated };
  });
  ipcMain.handle(IPC.ANILIST_NOTIFICATIONS_VERIFY_ACCOUNT, async (_e, input: unknown) => {
    const data = (input && typeof input === "object" ? input : {}) as { username?: string; token?: string };
    const res = await aniListNotificationService.verifyUserAccount(data.username, data.token);
    return res;
  });
  ipcMain.handle(IPC.ANILIST_NOTIFICATIONS_CHECK_NOW, async () => {
    const res = await aniListNotificationService.checkNotifications();
    return { ok: true, ...res };
  });
  ipcMain.handle(IPC.ANILIST_NOTIFICATIONS_TEST_POST, async (_e, input: unknown) => {
    const data = (input && typeof input === "object" ? input : {}) as { category?: string };
    const category = (data.category || "anime") as "anime" | "news" | "general";
    const sampleNotif = {
      id: 999999,
      type: "AIRING" as const,
      episode: 7,
      contexts: ["Episode ", " of ", " aired."],
      createdAt: Math.floor(Date.now() / 1000),
      media: {
        id: 21,
        title: {
          userPreferred: "Mushoku Tensei: Jobless Reincarnation Season 3",
          english: "Mushoku Tensei: Jobless Reincarnation Season 3",
          native: "無職転生Ⅲ ～異世界行ったら本気だす～",
        },
        coverImage: {
          extraLarge: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg",
        },
        siteUrl: "https://anilist.co/anime/21",
        episodes: 13,
        genres: ["Fantasy", "Drama", "Adventure"],
      },
    };
    const posted = await aniListNotificationService.broadcastNotificationToDiscord(sampleNotif, category);
    return posted
      ? { ok: true, message: `AniList 測試通知已發送至 Discord ${category} 頻道！` }
      : { ok: false, error: "發送測試通知失敗，請確認昔漣 Discord Bot 已連線且具備發文權限。" };
  });
}

/** 工具：把所有 BrowserWindow 广播 channels 状态变更（UI 轮询用）。 */
export function broadcastChannelsStatus(): void {
  const status = channelManager.getAllStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IPC.CHANNELS_STATUS_CHANGED, status);
    } catch (err) {
      console.warn(LOG, "广播失败:", err);
    }
  }
}

/** 工具：把所有 BrowserWindow 广播安装进度。 */
export function broadcastChannelsInstallProgress(progress: {
  channel: string;
  phase: string;
  pct: number;
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IPC.CHANNELS_INSTALL_PROGRESS, progress);
    } catch (err) {
      console.warn(LOG, "广播安装进度失败:", err);
    }
  }
}
