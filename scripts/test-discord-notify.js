const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

  const cfgPath = path.join(process.env.HOME, "Library", "Application Support", "live2d-cyrene", "channels-settings.json");
  const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  const stored = raw.discord?.botToken || "";

  let token = "";
  if (stored.startsWith("enc:")) {
    token = safeStorage.decryptString(Buffer.from(stored.slice(4), "base64"));
  } else if (stored.startsWith("plain:")) {
    token = stored.slice(6);
  }

  if (!token) {
    process.stdout.write("ERROR: Failed to decrypt token\n");
    app.quit();
    return;
  }
  process.stdout.write("Token OK, length: " + token.length + "\n");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async () => {
    process.stdout.write("Bot ready: " + client.user.tag + "\n");
    const guild = client.guilds.cache.first();
    if (!guild) { process.stdout.write("No guild!\n"); client.destroy(); app.quit(); return; }
    process.stdout.write("Guild: " + guild.name + "\n");

    guild.channels.cache.forEach(c => {
      const parent = c.parentId ? guild.channels.cache.get(c.parentId) : null;
      process.stdout.write("[type=" + c.type + "] #" + c.name + " parent=" + (parent ? parent.name : "none") + " id=" + c.id + "\n");
    });

    const annCat = guild.channels.cache.find(c => c.type === 4 && c.name.toLowerCase().includes("announcements"));
    process.stdout.write("ANNOUNCEMENTS category: " + (annCat ? annCat.name + " id=" + annCat.id : "NOT FOUND") + "\n");

    const gameChannel = annCat
      ? guild.channels.cache.find(c => c.isTextBased() && c.parentId === annCat.id && c.name.toLowerCase().includes("game"))
      : guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes("game"));

    process.stdout.write("Target game channel: " + (gameChannel ? "#" + gameChannel.name : "NOT FOUND") + "\n");

    if (gameChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x1da1f2)
        .setAuthor({
          name: "鳴潮 Wuthering Waves (@WW_JP_Official)",
          url: "https://x.com/WW_JP_Official",
          iconURL: "https://abs.twimg.com/favicons/twitter.3.ico",
        })
        .setDescription("這是昔漣的 X (Twitter) 自動通知測試卡片！✨\n\n昔漣已成功連結此頻道，之後每 5 分鐘會自動偵測新推文並發到對應頻道。")
        .setURL("https://x.com/WW_JP_Official")
        .setTimestamp(new Date())
        .setFooter({ text: "X Notification • 昔漣" });

      try {
        await gameChannel.send({ embeds: [embed] });
        process.stdout.write("SUCCESS: Embed sent to #" + gameChannel.name + "\n");
      } catch (e) {
        process.stdout.write("FAILED: " + e.message + "\n");
      }
    }

    client.destroy();
    app.quit();
  });

  client.on("error", (e) => {
    process.stdout.write("Client error: " + e.message + "\n");
    app.quit();
  });

  client.login(token).catch(e => {
    process.stdout.write("Login failed: " + e.message + "\n");
    app.quit();
  });
});
