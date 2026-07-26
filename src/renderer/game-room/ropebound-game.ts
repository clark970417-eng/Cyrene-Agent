import {
  createMemoryRope,
  resetMemoryRope,
  seededRandom,
  stepMemoryRope,
  type MemoryRope,
  type RopeBody,
  type RopePlatform,
} from "./ropebound-logic";

type GameMode = "solo" | "duo";
type JourneyMode = "endless" | "story";
type CharacterId = 0 | 1 | 2;
type Phase = "ready" | "playing" | "paused" | "won";
type EffectKind = "tailwind" | "headwind" | "heavy" | "feather" | "reverse" | "gravity";

interface Player extends RopeBody {
  id: 0 | 1;
  character: CharacterId;
  color: string;
  accent: string;
  facing: -1 | 1;
  coyote: number;
  jumpQueued: number;
  stepClock: number;
  ability: number;
  abilityActive: boolean;
}

interface Pickup {
  x: number;
  y: number;
  collected: boolean;
}

interface EffectOrb {
  x: number;
  y: number;
  used: boolean;
}

interface ActiveEffect {
  kind: EffectKind;
  title: string;
  remaining: number;
}

interface World {
  width: number;
  platforms: RopePlatform[];
  pickupPositions: ReadonlyArray<readonly [number, number]>;
  orbPositions: ReadonlyArray<readonly [number, number]>;
}

interface HatState {
  phase: "ready" | "outbound" | "returning";
  owner: 0 | 1 | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GrabState {
  holder: 0 | 1 | null;
  charge: number;
}

interface RopeboundDeps {
  activate: (title: string, kicker: string, pill: string) => void;
  setLine: (text: string, reaction?: string) => void;
  record: (outcome: "user" | "cyrene" | "draw") => Promise<unknown>;
}

const WORLD_HEIGHT = 720;
const VIEW_WIDTH = 1180;
const VIEW_HEIGHT = 664;
const FIXED_STEP = 1 / 120;
const PLAYER_WIDTH = 38;
const PLAYER_HEIGHT = 60;
const BEST_KEY = "cyrene-memory-thread-leaderboard-v1";
const SAVE_KEY = "cyrene-memory-thread-story-v1";
const ROSTER_KEY = "cyrene-memory-thread-roster-v1";
const MUTED_KEY = "cyrene-memory-thread-muted-v1";

const CHARACTER_NAMES: Record<CharacterId, string> = {
  0: "菲比啾比",
  1: "弗糯糯",
  2: "昔漣",
};

const CHARACTER_SKILLS: Record<CharacterId, string> = {
  0: "飛帽",
  1: "鼓氣",
  2: "憶流",
};

const CHARACTER_STATS: Record<CharacterId, { mass: number; acceleration: number; airAcceleration: number; speed: number; gravity: number; jump: number; color: string; accent: string }> = {
  0: { mass: 0.9, acceleration: 1540, airAcceleration: 1020, speed: 330, gravity: 1620, jump: 680, color: "#91dcff", accent: "#fff1b7" },
  1: { mass: 1.06, acceleration: 1400, airAcceleration: 940, speed: 306, gravity: 1710, jump: 655, color: "#ffadc7", accent: "#e5f0f2" },
  2: { mass: 0.98, acceleration: 1480, airAcceleration: 980, speed: 320, gravity: 1660, jump: 668, color: "#ff9fcf", accent: "#ffdda6" },
};

const STORY_PLATFORMS: RopePlatform[] = [
  { x: -80, y: 570, width: 720, height: 190 },
  { x: 730, y: 505, width: 250, height: 255 },
  { x: 1060, y: 425, width: 230, height: 335 },
  { x: 1370, y: 540, width: 420, height: 220 },
  { x: 1870, y: 450, width: 230, height: 310 },
  { x: 2185, y: 350, width: 210, height: 410 },
  { x: 2480, y: 515, width: 390, height: 245 },
  { x: 2980, y: 440, width: 260, height: 320 },
  { x: 3340, y: 535, width: 330, height: 225 },
  { x: 3740, y: 455, width: 330, height: 305 },
  { x: 4160, y: 365, width: 260, height: 395 },
  { x: 4520, y: 515, width: 350, height: 245 },
  { x: 4970, y: 455, width: 830, height: 305 },
];

const STORY_PICKUPS = [
  [1115, 358], [1480, 472], [2245, 282], [2815, 448], [4225, 298], [5205, 388],
] as const;

const STORY_ORBS = [[1260, 360], [3220, 375], [4300, 300]] as const;
const STORY_WORLD: World = { width: 5800, platforms: STORY_PLATFORMS, pickupPositions: STORY_PICKUPS, orbPositions: STORY_ORBS };

const EFFECTS: Record<EffectKind, { title: string; line: string }> = {
  tailwind: { title: "順流的回憶", line: "風把我們往同一個方向推。趁現在，再走快一點。" },
  headwind: { title: "逆風慢行", line: "逆風來了。步子小一點，我們還是會一起抵達。" },
  heavy: { title: "沉甸甸的心事", line: "腳步變重了……別急，我會把線握穩。" },
  feather: { title: "輕盈祝福", line: "身體像花瓣一樣輕。這次可以跳得更高。" },
  reverse: { title: "倒映的方向", line: "左右顛倒了。看著我，慢慢走就好。" },
  gravity: { title: "星河翻面", line: "天空和地面交換了位置——抓緊我！" },
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ropebound element: ${id}`);
  return element as T;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function createPlayer(id: 0 | 1, x: number, character: CharacterId): Player {
  const stats = CHARACTER_STATS[character];
  return {
    id,
    character,
    x,
    y: 450,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    vx: 0,
    vy: 0,
    grounded: false,
    mass: stats.mass,
    color: stats.color,
    accent: stats.accent,
    facing: 1,
    coyote: 0,
    jumpQueued: 0,
    stepClock: 0,
    ability: 1,
    abilityActive: false,
  };
}

export function createEndlessWorld(seed: number, stage: number): World {
  const random = seededRandom(seed ^ (stage * 0x9e3779b9));
  const platforms: RopePlatform[] = [{ x: -80, y: 570, width: 720, height: 190 }];
  let cursor = 720;
  for (let index = 0; index < 11; index += 1) {
    const width = 175 + Math.round(random() * 185);
    const gap = 72 + Math.round(random() * Math.min(135, 82 + stage * 6));
    const y = 330 + Math.round(random() * 215);
    platforms.push({ x: cursor + gap, y, width, height: WORLD_HEIGHT - y + 60 });
    cursor += gap + width;
  }
  platforms.push({ x: cursor + 95, y: 500, width: 680, height: 250 });
  const candidates = platforms.slice(1, -1);
  const pickupPositions = [0, 2, 4, 6, 8, 10].map((candidateIndex, index) => {
    const platform = candidates[Math.min(candidateIndex, candidates.length - 1)];
    return [
    Math.round(platform.x + platform.width * (0.28 + (index % 3) * 0.18)),
    Math.round(platform.y - 62 - random() * 22),
    ] as const;
  });
  const orbPositions = [1, Math.floor(candidates.length / 2), candidates.length - 2].map((index) => {
    const platform = candidates[index];
    return [Math.round(platform.x + platform.width * 0.65), Math.round(platform.y - 58)] as const;
  });
  return { width: cursor + 775, platforms, pickupPositions, orbPositions };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function setupRopeboundGame(deps: RopeboundDeps): () => void {
  const root = byId("ropebound-game");
  const canvas = byId<HTMLCanvasElement>("ropebound-canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");

  const intro = byId("ropebound-intro");
  const hud = byId("ropebound-hud");
  const pauseButton = byId<HTMLButtonElement>("ropebound-pause");
  const soundButton = byId<HTMLButtonElement>("ropebound-sound");
  const restartButton = byId<HTMLButtonElement>("ropebound-restart");
  const collectedLabel = byId("ropebound-collected");
  const timeLabel = byId("ropebound-time");
  const tensionBar = byId("ropebound-tension-bar");
  const effectLabel = byId("ropebound-effect");
  const scoreLabel = byId("ropebound-score-label");
  const abilityLabel = byId("ropebound-ability-label");
  const abilityBar = byId("ropebound-ability-bar");
  const modeButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-rope-mode]")];
  const journeyButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-rope-journey]")];
  const rosterButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-rope-slot]")];
  const touchButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-rope-input]")];

  let mode: GameMode = "solo";
  let journeyMode: JourneyMode = "endless";
  let phase: Phase = "ready";
  let roster: [CharacterId, CharacterId] = [0, 1];
  let players: [Player, Player] = [createPlayer(0, 170, roster[0]), createPlayer(1, 238, roster[1])];
  let rope: MemoryRope = createMemoryRope(players[0], players[1]);
  let world: World = STORY_WORLD;
  let pickups: Pickup[] = [];
  let orbs: EffectOrb[] = [];
  let activeEffect: ActiveEffect | null = null;
  let activePlayer: 0 | 1 = 0;
  let stage = 1;
  let mapSeed = Date.now() >>> 0;
  let score = 0;
  let bestScore = 0;
  let hat: HatState = { phase: "ready", owner: null, x: 0, y: 0, vx: 0, vy: 0 };
  let grab: GrabState = { holder: null, charge: 0 };
  let elapsed = 0;
  let falls = 0;
  let checkpoint = 0;
  let cameraX = 0;
  let accumulator = 0;
  let lastFrame = performance.now();
  let animationFrame = 0;
  let audioContext: AudioContext | null = null;
  let musicTimer = 0;
  let muted = localStorage.getItem(MUTED_KEY) === "1";
  const keys = new Set<string>();
  const touch = new Set<string>();

  try {
    const savedRoster = JSON.parse(localStorage.getItem(ROSTER_KEY) || "null") as unknown;
    if (Array.isArray(savedRoster) && savedRoster.length === 2 && savedRoster.every((value) => value === 0 || value === 1 || value === 2) && savedRoster[0] !== savedRoster[1]) {
      roster = savedRoster as [CharacterId, CharacterId];
    }
    const leaderboard = JSON.parse(localStorage.getItem(BEST_KEY) || "[]") as Array<{ score?: number }>;
    bestScore = Math.max(0, ...leaderboard.map((entry) => Number(entry.score) || 0));
  } catch {
    // Invalid local saves are ignored.
  }

  function updateCanvasSize(): void {
    const ratio = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = VIEW_WIDTH * ratio;
    canvas.height = VIEW_HEIGHT * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function tone(frequency: number, duration = 0.1, volume = 0.035, type: OscillatorType = "sine"): void {
    if (muted) return;
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function startAmbient(): void {
    window.clearInterval(musicTimer);
    if (muted) return;
    tone(220, 1.1, 0.012);
    musicTimer = window.setInterval(() => {
      if (phase !== "playing" || root.hidden) return;
      const note = [220, 277, 330, 415][Math.floor(elapsed / 2.4) % 4];
      tone(note, 1.2, 0.012);
      window.setTimeout(() => tone(note * 1.5, 0.8, 0.008), 260);
    }, 2400);
  }

  function loadStorySave(): { checkpoint: number; elapsed: number; collected: number[]; falls: number } | null {
    if (journeyMode !== "story") return null;
    try {
      const value = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as { version?: number; checkpoint?: number; elapsed?: number; collected?: number[]; falls?: number } | null;
      if (!value || value.version !== 1) return null;
      return {
        checkpoint: clamp(Math.floor(Number(value.checkpoint) || 0), 0, 3),
        elapsed: Math.max(0, Number(value.elapsed) || 0),
        collected: Array.isArray(value.collected) ? value.collected.filter(Number.isInteger) : [],
        falls: Math.max(0, Math.floor(Number(value.falls) || 0)),
      };
    } catch { return null; }
  }

  function saveStory(): void {
    if (journeyMode !== "story") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      checkpoint,
      elapsed,
      falls,
      collected: pickups.map((pickup, index) => pickup.collected ? index : -1).filter((index) => index >= 0),
    }));
  }

  function resetWorld(continueStory = true): void {
    const save = continueStory ? loadStorySave() : null;
    checkpoint = save?.checkpoint ?? 0;
    const spawnX = checkpoint === 0 ? 170 : checkpoint === 1 ? 1605 : checkpoint === 2 ? 3050 : 4595;
    stage = journeyMode === "endless" ? Math.max(1, stage) : 1;
    world = journeyMode === "endless" ? createEndlessWorld(mapSeed, stage) : STORY_WORLD;
    players = [createPlayer(0, spawnX, roster[0]), createPlayer(1, spawnX + 68, roster[1])];
    rope = createMemoryRope(players[0], players[1]);
    pickups = world.pickupPositions.map(([x, y], index) => ({ x, y, collected: save?.collected.includes(index) ?? false }));
    orbs = world.orbPositions.map(([x, y]) => ({ x, y, used: false }));
    activeEffect = null;
    hat = { phase: "ready", owner: null, x: 0, y: 0, vx: 0, vy: 0 };
    grab = { holder: null, charge: 0 };
    activePlayer = 0;
    elapsed = save?.elapsed ?? 0;
    falls = save?.falls ?? 0;
    score = 0;
    cameraX = clamp(spawnX - 180, 0, Math.max(0, world.width - VIEW_WIDTH));
    accumulator = 0;
    lastFrame = performance.now();
    updateHud();
  }

  function selectedEffectValues(): { speed: number; weight: number; direction: number; gravity: number } {
    switch (activeEffect?.kind) {
      case "tailwind": return { speed: 1.3, weight: 1, direction: 1, gravity: 1 };
      case "headwind": return { speed: 0.72, weight: 1, direction: 1, gravity: 1 };
      case "heavy": return { speed: 0.9, weight: 1.45, direction: 1, gravity: 1 };
      case "feather": return { speed: 1.08, weight: 0.62, direction: 1, gravity: 1 };
      case "reverse": return { speed: 1, weight: 1, direction: -1, gravity: 1 };
      case "gravity": return { speed: 1, weight: 1, direction: 1, gravity: -1 };
      default: return { speed: 1, weight: 1, direction: 1, gravity: 1 };
    }
  }

  function isPressed(...values: string[]): boolean {
    return values.some((value) => keys.has(value) || touch.has(value));
  }

  function inputFor(playerIndex: 0 | 1): number {
    if (mode === "solo") {
      if (playerIndex !== activePlayer) return 0;
      return Number(isPressed("ArrowRight", "KeyD", "solo-right")) - Number(isPressed("ArrowLeft", "KeyA", "solo-left"));
    }
    if (playerIndex === 0) return Number(isPressed("KeyD", "p1-right")) - Number(isPressed("KeyA", "p1-left"));
    return Number(isPressed("ArrowRight", "p2-right")) - Number(isPressed("ArrowLeft", "p2-left"));
  }

  function queueJump(index: 0 | 1): void {
    players[index].jumpQueued = 0.12;
  }

  function respawn(): void {
    const spawnX = checkpoint === 0 ? 170 : checkpoint === 1 ? 1605 : checkpoint === 2 ? 3050 : 4595;
    players[0] = createPlayer(0, spawnX, roster[0]);
    players[1] = createPlayer(1, spawnX + 68, roster[1]);
    resetMemoryRope(rope, players[0], players[1]);
    cameraX = clamp(spawnX - 180, 0, Math.max(0, world.width - VIEW_WIDTH));
    falls += 1;
    deps.setLine("沒關係，線還連著。這次我們一起看清下一個落腳點。", "鼓勵");
  }

  function applyPlayerPhysics(player: Player, input: number, dt: number, gravityDirection: number, speed: number): void {
    const stats = CHARACTER_STATS[player.character];
    const wasGrounded = player.grounded;
    player.coyote = player.grounded ? 0.11 : Math.max(0, player.coyote - dt);
    player.jumpQueued = Math.max(0, player.jumpQueued - dt);
    const skillSpeed = player.character === 2 && player.abilityActive ? 1.62 : 1;
    const acceleration = (player.grounded ? stats.acceleration : stats.airAcceleration) * skillSpeed;
    const maximumSpeed = stats.speed * speed * skillSpeed;
    if (input !== 0) {
      player.vx = clamp(player.vx + input * acceleration * dt, -maximumSpeed, maximumSpeed);
      player.facing = input > 0 ? 1 : -1;
    } else {
      player.vx *= Math.pow(player.grounded ? 0.035 : 0.3, dt);
    }

    if (player.jumpQueued > 0 && player.coyote > 0) {
      player.vy = -stats.jump * gravityDirection;
      player.grounded = false;
      player.coyote = 0;
      player.jumpQueued = 0;
      tone(player.character === 0 ? 520 : player.character === 1 ? 460 : 590, 0.08, 0.018, "triangle");
    }

    const previousBottom = player.y + player.height;
    const previousTop = player.y;
    const floatMultiplier = player.character === 1 && player.abilityActive ? 0.26 : 1;
    player.vy = clamp(player.vy + stats.gravity * gravityDirection * dt * floatMultiplier, -1080, 1080);
    if (player.character === 1 && player.abilityActive) player.vy -= 390 * gravityDirection * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, -20, world.width - player.width + 20);
    player.grounded = false;

    for (const platform of world.platforms) {
      const horizontal = player.x + player.width > platform.x && player.x < platform.x + platform.width;
      if (!horizontal) continue;
      if (gravityDirection > 0 && player.vy >= 0 && previousBottom <= platform.y + 9 && player.y + player.height >= platform.y) {
        player.y = platform.y - player.height;
        player.vy = 0;
        player.grounded = true;
      } else if (gravityDirection < 0 && player.vy <= 0 && previousTop >= platform.y + platform.height - 9 && player.y <= platform.y + platform.height) {
        player.y = platform.y + platform.height;
        player.vy = 0;
        player.grounded = true;
      }
    }

    if (!wasGrounded && player.grounded) player.stepClock += 0.4;
    player.stepClock += Math.abs(player.vx) * dt / 75;
  }

  function companionAi(dt: number, gravityDirection: number, speed: number): void {
    const leader = players[activePlayer];
    const companionIndex = (activePlayer === 0 ? 1 : 0) as 0 | 1;
    const companion = players[companionIndex];
    const distance = leader.x - companion.x;
    const input = Math.abs(distance) > 78 ? Math.sign(distance) : 0;
    const probeX = companion.x + companion.width * 0.5 + Math.sign(distance || 1) * 54;
    const footY = companion.y + companion.height;
    const floorAhead = world.platforms.some((platform) => (
      probeX >= platform.x && probeX <= platform.x + platform.width && platform.y >= footY - 14 && platform.y <= footY + 95
    ));
    if (companion.grounded && Math.abs(distance) > 96 && (!floorAhead || leader.y < companion.y - 42)) queueJump(companionIndex);
    applyPlayerPhysics(companion, input, dt, gravityDirection, speed * 0.94);
  }

  function abilityPressed(index: 0 | 1): boolean {
    if (mode === "solo") return index === activePlayer && isPressed("KeyF", "ability");
    return index === 0 ? isPressed("KeyF", "p1-ability") : isPressed("Slash", "p2-ability");
  }

  function launchHat(owner: 0 | 1): void {
    const player = players[owner];
    if (player.character !== 0 || hat.phase !== "ready" || player.ability < 0.98) return;
    player.ability = 0;
    hat = {
      phase: "outbound",
      owner,
      x: player.x + player.width / 2,
      y: player.y + 20,
      vx: player.facing * 620,
      vy: -75,
    };
  }

  function updateAbilities(dt: number): void {
    for (const player of players) {
      const pressed = abilityPressed(player.id);
      player.abilityActive = false;
      if (player.character === 0) {
        player.ability = Math.min(1, player.ability + dt * 0.55);
      } else if (pressed && player.ability > 0.01) {
        player.abilityActive = true;
        player.ability = Math.max(0, player.ability - dt * (player.character === 1 ? 0.42 : 0.31));
      } else {
        player.ability = Math.min(1, player.ability + dt * (player.character === 1 ? 0.34 : 0.25));
      }
    }

    if (hat.phase === "ready" || hat.owner === null) return;
    const owner = players[hat.owner];
    if (hat.phase === "outbound") {
      hat.x += hat.vx * dt;
      hat.y += hat.vy * dt;
      hat.vy += 170 * dt;
      if (Math.abs(hat.x - (owner.x + owner.width / 2)) > 370) hat.phase = "returning";
    } else {
      const dx = owner.x + owner.width / 2 - hat.x;
      const dy = owner.y + 24 - hat.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      hat.vx += dx / distance * 1800 * dt;
      hat.vy += dy / distance * 1800 * dt;
      hat.vx *= Math.pow(0.08, dt);
      hat.vy *= Math.pow(0.08, dt);
      hat.x += hat.vx * dt;
      hat.y += hat.vy * dt;
      if (distance < 32) hat = { phase: "ready", owner: null, x: 0, y: 0, vx: 0, vy: 0 };
    }

    for (const pickup of pickups) {
      if (!pickup.collected && Math.hypot(pickup.x - hat.x, pickup.y - hat.y) < 45) {
        pickup.collected = true;
        score += 650;
        hat.phase = "returning";
        tone(760, 0.16, 0.03, "triangle");
        deps.setLine("飛帽把遠處的記憶花帶回來了。漂亮的一圈。", "星星眼");
      }
    }
  }

  function startGrab(holder: 0 | 1): void {
    if (phase !== "playing" || grab.holder !== null) return;
    const held = players[holder === 0 ? 1 : 0];
    const player = players[holder];
    if (Math.hypot(player.x - held.x, player.y - held.y) > 105) return;
    grab = { holder, charge: 0 };
  }

  function releaseGrab(holder: 0 | 1): void {
    if (grab.holder !== holder) return;
    const player = players[holder];
    const held = players[holder === 0 ? 1 : 0];
    const power = 430 + grab.charge * 480;
    held.vx = player.facing * power;
    held.vy = -(420 + grab.charge * 220);
    player.vx -= player.facing * power * 0.22;
    grab = { holder: null, charge: 0 };
    tone(power > 700 ? 190 : 260, 0.14, 0.026, "sawtooth");
    deps.setLine(power > 700 ? "甩出去的同時，絲線也會把我們拉向彼此。" : "接住慣性——我會沿著絲線跟上。", "驚訝");
  }

  function updateGrab(dt: number): void {
    if (grab.holder === null) return;
    const holder = players[grab.holder];
    const held = players[grab.holder === 0 ? 1 : 0];
    const spinning = isPressed("KeyQ", "reel");
    grab.charge = Math.min(1, grab.charge + dt * (spinning ? 0.82 : 0.3));
    const angle = spinning ? elapsed * (5 + grab.charge * 4) : -Math.PI / 2;
    held.x = holder.x + holder.width / 2 + Math.cos(angle) * 54 - held.width / 2;
    held.y = holder.y + 16 + Math.sin(angle) * 54;
    held.vx = holder.vx;
    held.vy = holder.vy;
    held.grounded = false;
  }

  function collectThings(): void {
    for (const pickup of pickups) {
      if (pickup.collected) continue;
      if (players.some((player) => Math.hypot(player.x + player.width / 2 - pickup.x, player.y + player.height / 2 - pickup.y) < 48)) {
        pickup.collected = true;
        score += 650;
        const count = pickups.filter((item) => item.collected).length;
        tone(660 + count * 38, 0.16, 0.03, "triangle");
        deps.setLine(count === pickups.length ? "所有記憶花都亮了。出口就在前面，我們一起回家。" : `第 ${count} 朵記憶花。你看，它記得我們走過的路。`, "星星眼");
      }
    }

    for (const orb of orbs) {
      if (orb.used) continue;
      if (players.some((player) => Math.hypot(player.x + player.width / 2 - orb.x, player.y + player.height / 2 - orb.y) < 50)) {
        orb.used = true;
        const kinds: EffectKind[] = ["tailwind", "headwind", "heavy", "feather", "reverse", "gravity"];
        const random = seededRandom(Math.floor(elapsed * 1000) ^ Math.floor(orb.x));
        const kind = kinds[Math.floor(random() * kinds.length)];
        activeEffect = { kind, title: EFFECTS[kind].title, remaining: 6.5 };
        tone(kind === "gravity" ? 210 : 440, 0.2, 0.026, "sawtooth");
        deps.setLine(EFFECTS[kind].line, kind === "gravity" ? "驚訝" : "眨眨眼");
      }
    }
  }

  function update(dt: number): void {
    if (root.hidden || phase !== "playing") return;
    elapsed += dt;
    if (activeEffect) {
      activeEffect.remaining -= dt;
      if (activeEffect.remaining <= 0) activeEffect = null;
    }
    const effect = selectedEffectValues();
    players[0].mass = CHARACTER_STATS[players[0].character].mass * effect.weight;
    players[1].mass = CHARACTER_STATS[players[1].character].mass * effect.weight;
    updateAbilities(dt);

    if (mode === "solo") {
      applyPlayerPhysics(players[activePlayer], inputFor(activePlayer) * effect.direction, dt, effect.gravity, effect.speed);
      if (grab.holder !== activePlayer) companionAi(dt, effect.gravity, effect.speed);
    } else {
      applyPlayerPhysics(players[0], inputFor(0) * effect.direction, dt, effect.gravity, effect.speed);
      applyPlayerPhysics(players[1], inputFor(1) * effect.direction, dt, effect.gravity, effect.speed);
    }
    updateGrab(dt);

    const reeling = isPressed("KeyQ", "reel");
    stepMemoryRope(rope, players[0], players[1], world.platforms, dt, elapsed, reeling, effect.gravity);
    collectThings();

    const averageX = (players[0].x + players[1].x) / 2;
    cameraX += (clamp(averageX - VIEW_WIDTH * 0.42, 0, Math.max(0, world.width - VIEW_WIDTH)) - cameraX) * Math.min(1, dt * 4.6);
    const previousCheckpoint = checkpoint;
    if (journeyMode === "story" && averageX > 1650) checkpoint = Math.max(checkpoint, 1);
    if (journeyMode === "story" && averageX > 3150) checkpoint = Math.max(checkpoint, 2);
    if (journeyMode === "story" && averageX > 4660) checkpoint = Math.max(checkpoint, 3);
    if (checkpoint !== previousCheckpoint) {
      saveStory();
      deps.setLine(`第 ${checkpoint} 個燈塔存檔點亮了。下次會從這裡繼續。`, "星星眼");
    }
    if (players.some((player) => player.y > WORLD_HEIGHT + 130 || player.y < -270)) respawn();

    score = Math.max(score, (stage - 1) * 12000 + Math.floor(averageX * 1.8) + pickups.filter((pickup) => pickup.collected).length * 650 - falls * 350);
    if (averageX > world.width - 260 && pickups.every((pickup) => pickup.collected)) {
      if (journeyMode === "endless") advanceEndless();
      else void finishGame();
    }
  }

  function advanceEndless(): void {
    recordLeaderboard();
    stage += 1;
    mapSeed = (mapSeed * 1664525 + 1013904223) >>> 0;
    world = createEndlessWorld(mapSeed, stage);
    players = [createPlayer(0, 170, roster[0]), createPlayer(1, 238, roster[1])];
    resetMemoryRope(rope, players[0], players[1]);
    pickups = world.pickupPositions.map(([x, y]) => ({ x, y, collected: false }));
    orbs = world.orbPositions.map(([x, y]) => ({ x, y, used: false }));
    activeEffect = null;
    hat = { phase: "ready", owner: null, x: 0, y: 0, vx: 0, vy: 0 };
    grab = { holder: null, charge: 0 };
    cameraX = 0;
    deps.setLine(`無盡星河第 ${stage} 程。地圖變了，但絲線還認得我們。`, "笑一笑");
  }

  function recordLeaderboard(): void {
    if (journeyMode !== "endless") return;
    try {
      const existing = JSON.parse(localStorage.getItem(BEST_KEY) || "[]") as Array<{ score: number; stage: number; elapsed: number; recordedAt: number }>;
      existing.push({ score, stage, elapsed, recordedAt: Date.now() });
      existing.sort((left, right) => right.score - left.score);
      localStorage.setItem(BEST_KEY, JSON.stringify(existing.slice(0, 8)));
      bestScore = Math.max(bestScore, score);
    } catch {
      // Leaderboard persistence is best-effort.
    }
  }

  function updateHud(): void {
    const collected = pickups.filter((pickup) => pickup.collected).length;
    scoreLabel.textContent = journeyMode === "endless" ? `第 ${stage} 程 · 最高 ${bestScore.toLocaleString()}` : `記憶花 · 存檔 ${checkpoint}/3`;
    collectedLabel.textContent = journeyMode === "endless" ? score.toLocaleString() : `${collected} / ${pickups.length || STORY_PICKUPS.length}`;
    const minutes = Math.floor(elapsed / 60);
    timeLabel.textContent = `${minutes}:${Math.floor(elapsed % 60).toString().padStart(2, "0")}`;
    tensionBar.style.width = `${Math.round(Math.max(rope.tension, rope.pull) * 100)}%`;
    tensionBar.parentElement?.classList.toggle("is-danger", rope.pull > 0.45);
    const activeCharacter = players[activePlayer]?.character ?? roster[0];
    effectLabel.textContent = activeEffect ? `${activeEffect.title} · ${activeEffect.remaining.toFixed(1)}s` : mode === "solo" ? `牽引：${CHARACTER_NAMES[activeCharacter]}` : `${CHARACTER_NAMES[roster[0]]} × ${CHARACTER_NAMES[roster[1]]}`;
    abilityLabel.textContent = CHARACTER_SKILLS[activeCharacter];
    abilityBar.style.width = `${Math.round((players[activePlayer]?.ability ?? 1) * 100)}%`;
    soundButton.textContent = muted ? "♪×" : "♪";
    soundButton.setAttribute("aria-label", muted ? "開啟遊戲音樂" : "關閉遊戲音樂");
    root.dataset.phase = phase;
    root.dataset.playerOneX = players[0].x.toFixed(1);
    root.dataset.playerTwoX = players[1].x.toFixed(1);
    root.dataset.tension = rope.tension.toFixed(2);
    root.dataset.stage = String(stage);
    root.dataset.score = String(score);
    root.dataset.roster = roster.join(",");
    root.dataset.journey = journeyMode;
    root.dataset.mode = mode;
    root.dataset.hatPhase = hat.phase;
    root.dataset.grabHolder = grab.holder === null ? "" : String(grab.holder);
  }

  function drawBackground(): void {
    const gradient = context.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    gradient.addColorStop(0, "#171027");
    gradient.addColorStop(0.58, "#221934");
    gradient.addColorStop(1, "#0b0913");
    context.fillStyle = gradient;
    context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    const parallax = cameraX * 0.12;
    context.save();
    context.globalAlpha = 0.42;
    for (let index = -1; index < 8; index += 1) {
      const x = index * 210 - (parallax % 210);
      const height = 80 + ((index * 47 + 120) % 130);
      const tower = context.createLinearGradient(x, VIEW_HEIGHT - 340, x, VIEW_HEIGHT - 80);
      tower.addColorStop(0, "rgba(132, 105, 171, .12)");
      tower.addColorStop(1, "rgba(38, 25, 57, .05)");
      context.fillStyle = tower;
      roundedRect(context, x, VIEW_HEIGHT - 80 - height, 110, height + 120, 55);
      context.fill();
    }
    context.restore();

    for (let index = 0; index < 48; index += 1) {
      const x = ((index * 173 - cameraX * (0.04 + (index % 3) * 0.015)) % (VIEW_WIDTH + 80) + VIEW_WIDTH + 80) % (VIEW_WIDTH + 80) - 40;
      const y = 44 + (index * 83) % 360;
      const alpha = 0.18 + (index % 5) * 0.08;
      context.fillStyle = `rgba(255, 223, 237, ${alpha})`;
      context.fillRect(x, y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
    }

    const haze = context.createRadialGradient(VIEW_WIDTH * 0.55, 320, 30, VIEW_WIDTH * 0.55, 320, 620);
    haze.addColorStop(0, "rgba(255, 156, 208, .07)");
    haze.addColorStop(1, "rgba(255, 156, 208, 0)");
    context.fillStyle = haze;
    context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  }

  function drawPlatforms(): void {
    for (const platform of world.platforms) {
      const x = platform.x - cameraX;
      if (x > VIEW_WIDTH + 40 || x + platform.width < -40) continue;
      const platformGradient = context.createLinearGradient(0, platform.y, 0, platform.y + platform.height);
      platformGradient.addColorStop(0, "#352747");
      platformGradient.addColorStop(0.08, "#21182f");
      platformGradient.addColorStop(1, "#0d0a15");
      context.fillStyle = platformGradient;
      roundedRect(context, x, platform.y, platform.width, platform.height + 30, 16);
      context.fill();
      context.fillStyle = "rgba(255, 183, 220, .28)";
      roundedRect(context, x + 5, platform.y + 4, platform.width - 10, 3, 2);
      context.fill();
      context.fillStyle = "rgba(255, 255, 255, .12)";
      for (let marker = 24; marker < platform.width - 16; marker += 54) {
        context.fillRect(x + marker, platform.y + 15, 17, 2);
      }
    }
  }

  function drawPickups(): void {
    for (const pickup of pickups) {
      if (pickup.collected) continue;
      const x = pickup.x - cameraX;
      if (x < -40 || x > VIEW_WIDTH + 40) continue;
      const bob = Math.sin(elapsed * 3.2 + pickup.x * 0.01) * 7;
      context.save();
      context.translate(x, pickup.y + bob);
      context.shadowBlur = 18;
      context.shadowColor = "#ff9fcf";
      for (let petal = 0; petal < 5; petal += 1) {
        context.save();
        context.rotate((Math.PI * 2 * petal) / 5);
        context.fillStyle = petal % 2 ? "#ffd7eb" : "#ff9fcf";
        context.beginPath();
        context.ellipse(0, -10, 5, 10, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      context.fillStyle = "#fff0af";
      context.beginPath();
      context.arc(0, 0, 4, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    for (const orb of orbs) {
      if (orb.used) continue;
      const x = orb.x - cameraX;
      if (x < -50 || x > VIEW_WIDTH + 50) continue;
      const bob = Math.sin(elapsed * 2.7 + orb.x) * 6;
      context.save();
      context.translate(x, orb.y + bob);
      context.shadowBlur = 24;
      context.shadowColor = "#a98bff";
      context.fillStyle = "rgba(169, 139, 255, .18)";
      context.strokeStyle = "#c8b8ff";
      context.lineWidth = 2;
      roundedRect(context, -24, -24, 48, 48, 16);
      context.fill();
      context.stroke();
      context.fillStyle = "#fff4d9";
      context.font = "600 25px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("?", 0, 1);
      context.restore();
    }
  }

  function drawRope(): void {
    if (rope.points.length < 2) return;
    const trace = (): void => {
      context.beginPath();
      context.moveTo(rope.points[0].x - cameraX, rope.points[0].y);
      for (let index = 1; index < rope.points.length - 1; index += 1) {
        const point = rope.points[index];
        const next = rope.points[index + 1];
        context.quadraticCurveTo(point.x - cameraX, point.y, (point.x + next.x) / 2 - cameraX, (point.y + next.y) / 2);
      }
      const end = rope.points.at(-1)!;
      context.lineTo(end.x - cameraX, end.y);
    };

    context.save();
    context.lineCap = "round";
    context.strokeStyle = "rgba(4, 3, 10, .6)";
    context.lineWidth = 10;
    trace();
    context.stroke();
    const glow = Math.max(rope.tension, rope.pull);
    context.shadowBlur = 12 + glow * 22;
    context.shadowColor = glow > 0.45 ? "#ffd36b" : "#ff9fcf";
    context.strokeStyle = glow > 0.45 ? "#ffd98c" : "#dca8d4";
    context.lineWidth = 4;
    trace();
    context.stroke();
    context.strokeStyle = `rgba(255, 247, 252, ${0.22 + glow * 0.4})`;
    context.lineWidth = 1;
    trace();
    context.stroke();
    context.restore();
  }

  function drawPlayer(player: Player): void {
    const x = player.x + player.width / 2 - cameraX;
    const y = player.y + player.height;
    if (x < -80 || x > VIEW_WIDTH + 80) return;
    const bounce = player.grounded ? Math.sin(player.stepClock * Math.PI) * Math.min(2.5, Math.abs(player.vx) / 110) : 0;
    context.save();
    context.translate(x, y - bounce);
    context.scale(player.facing, 1);

    context.globalAlpha = 0.28;
    context.fillStyle = player.color;
    context.beginPath();
    context.ellipse(-player.vx * 0.015, 2, 20, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    const outfit = player.character === 0 ? "#294a69" : player.character === 1 ? "#8f3347" : "#6b315f";
    const hair = player.character === 0 ? "#f5e4a8" : player.character === 1 ? "#d8dce1" : "#efb7d6";
    context.fillStyle = outfit;
    context.beginPath();
    context.moveTo(-18, -34);
    context.quadraticCurveTo(-24, -4, -16, 0);
    context.lineTo(16, 0);
    context.quadraticCurveTo(24, -6, 17, -34);
    context.closePath();
    context.fill();

    context.fillStyle = "#fff2ee";
    context.strokeStyle = player.color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, -43, 17, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = hair;
    context.beginPath();
    context.arc(-2, -48, 18, Math.PI, Math.PI * 2);
    context.lineTo(18, -34);
    context.quadraticCurveTo(7, -29, -4, -34);
    context.quadraticCurveTo(-17, -31, -19, -40);
    context.closePath();
    context.fill();
    if (player.character === 1 || player.character === 2) {
      context.strokeStyle = hair;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(-14, -43);
      context.quadraticCurveTo(-24, -24, -18, -5);
      context.moveTo(12, -43);
      context.quadraticCurveTo(23, -22, 16, -4);
      context.stroke();
    }

    if (player.character === 0) {
      context.fillStyle = "#315c80";
      context.beginPath();
      context.ellipse(-5, -65, 15, 5, -.12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#fff0aa";
      context.fillRect(6, -72, 3, 10);
    } else if (player.character === 2) {
      context.fillStyle = "#fff1bd";
      context.shadowBlur = 7;
      context.shadowColor = "#ffdda6";
      context.beginPath();
      context.arc(-12, -59, 3, 0, Math.PI * 2);
      context.arc(13, -54, 2.5, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }

    context.fillStyle = "#4b315c";
    context.beginPath();
    context.arc(6, -43, 2.2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = player.accent;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-7, -24);
    context.lineTo(8, -15);
    context.stroke();

    if (mode === "duo" || activePlayer === player.id) {
      context.fillStyle = player.color;
      context.shadowBlur = 9;
      context.shadowColor = player.color;
      context.beginPath();
      context.moveTo(0, -75);
      context.lineTo(-6, -65);
      context.lineTo(6, -65);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawHat(): void {
    if (hat.phase === "ready") return;
    const x = hat.x - cameraX;
    if (x < -60 || x > VIEW_WIDTH + 60) return;
    context.save();
    context.translate(x, hat.y);
    context.rotate(elapsed * 10);
    context.shadowBlur = 14;
    context.shadowColor = "#91dcff";
    context.fillStyle = "#315c80";
    context.beginPath();
    context.ellipse(0, 0, 18, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f7e8a7";
    context.fillRect(-2, -13, 4, 10);
    context.restore();
  }

  function drawExit(): void {
    const x = world.width - 160 - cameraX;
    if (x < -100 || x > VIEW_WIDTH + 100) return;
    const unlocked = pickups.every((pickup) => pickup.collected);
    context.save();
    context.translate(x, 385);
    context.strokeStyle = unlocked ? "#ffdda6" : "rgba(185, 172, 205, .32)";
    context.lineWidth = 5;
    context.shadowBlur = unlocked ? 28 : 0;
    context.shadowColor = "#ffdda6";
    context.beginPath();
    context.ellipse(0, 70, 42, 82, 0, Math.PI, Math.PI * 2);
    context.stroke();
    context.fillStyle = unlocked ? "rgba(255, 221, 166, .13)" : "rgba(255,255,255,.03)";
    context.fill();
    context.fillStyle = unlocked ? "#fff1c9" : "#8e829e";
    context.font = "500 13px sans-serif";
    context.textAlign = "center";
    context.fillText(unlocked ? "記憶出口" : "還缺記憶花", 0, 175);
    context.restore();
  }

  function draw(): void {
    drawBackground();
    drawPlatforms();
    drawPickups();
    drawExit();
    drawRope();
    drawHat();
    drawPlayer(players[0]);
    drawPlayer(players[1]);

    if (phase === "paused" || phase === "won") {
      context.fillStyle = "rgba(9, 6, 16, .62)";
      context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      context.fillStyle = "#fff8ff";
      context.textAlign = "center";
      context.font = "600 36px sans-serif";
      context.fillText(phase === "won" ? "這段記憶，被我們一起帶回來了" : "絲線仍在等待", VIEW_WIDTH / 2, 294);
      context.fillStyle = "#cfc0db";
      context.font = "400 15px sans-serif";
      context.fillText(phase === "won" ? `用時 ${timeLabel.textContent} · 失足 ${falls} 次` : "按下繼續，或按 P 回到旅途", VIEW_WIDTH / 2, 328);
    }
  }

  function frame(now: number): void {
    const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    accumulator = Math.min(0.12, accumulator + delta);
    let iterations = 0;
    while (accumulator >= FIXED_STEP && iterations < 14) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
      iterations += 1;
    }
    updateHud();
    draw();
    animationFrame = window.requestAnimationFrame(frame);
  }

  async function finishGame(): Promise<void> {
    if (phase !== "playing") return;
    phase = "won";
    pauseButton.textContent = "完成";
    pauseButton.disabled = true;
    if (journeyMode === "story") localStorage.removeItem(SAVE_KEY);
    tone(587, 0.18, 0.035, "triangle");
    window.setTimeout(() => tone(880, 0.3, 0.03, "triangle"), 150);
    deps.setLine("抵達了。不是因為誰走得比較快，是因為我們一直沒有鬆開彼此。", "星星眼");
    await deps.record("user");
  }

  function begin(): void {
    if (journeyMode === "endless") {
      stage = 1;
      mapSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    }
    resetWorld(true);
    phase = "playing";
    intro.hidden = true;
    hud.hidden = false;
    pauseButton.disabled = false;
    pauseButton.textContent = "暫停";
    restartButton.hidden = false;
    canvas.focus({ preventScroll: true });
    startAmbient();
    deps.setLine(mode === "solo" ? "先選一個人牽引。按 Tab，就能把前方交給另一位夥伴。" : "這次我們各自握住一端。數到三，一起出發。", "笑一笑");
  }

  function showReady(): void {
    resetWorld();
    phase = "ready";
    window.clearInterval(musicTimer);
    intro.hidden = false;
    hud.hidden = true;
    restartButton.hidden = true;
    pauseButton.disabled = true;
    deps.setLine("這條絲線會記住我們的重量。準備好，就一起把六朵記憶花帶回來。", "眨眨眼");
  }

  function togglePause(): void {
    if (phase === "playing") {
      phase = "paused";
      pauseButton.textContent = "繼續";
    } else if (phase === "paused") {
      phase = "playing";
      pauseButton.textContent = "暫停";
      lastFrame = performance.now();
      canvas.focus({ preventScroll: true });
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (root.hidden || phase === "ready") return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "KeyP" || event.code === "Escape") togglePause();
    if (event.code === "KeyR") begin();
    if (mode === "solo" && event.code === "Tab") {
      event.preventDefault();
      activePlayer = activePlayer === 0 ? 1 : 0;
      deps.setLine(`換成${CHARACTER_NAMES[players[activePlayer].character]}牽引。另一個人會沿著絲線跟上。`, "眨眨眼");
    }
    if (mode === "solo" && ["KeyW", "ArrowUp", "Space"].includes(event.code)) queueJump(activePlayer);
    if (mode === "duo" && ["KeyW", "Space"].includes(event.code)) queueJump(0);
    if (mode === "duo" && event.code === "ArrowUp") queueJump(1);
    if (mode === "solo" && event.code === "KeyF") launchHat(activePlayer);
    if (mode === "duo" && event.code === "KeyF") launchHat(0);
    if (mode === "duo" && event.code === "Slash") launchHat(1);
    if (mode === "solo" && event.code === "KeyE") startGrab(activePlayer);
    if (mode === "duo" && event.code === "KeyE") startGrab(0);
    if (mode === "duo" && event.code === "Enter") startGrab(1);
  }

  function handleKeyUp(event: KeyboardEvent): void {
    keys.delete(event.code);
    if (mode === "solo" && event.code === "KeyE") releaseGrab(activePlayer);
    if (mode === "duo" && event.code === "KeyE") releaseGrab(0);
    if (mode === "duo" && event.code === "Enter") releaseGrab(1);
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.ropeMode === "duo" ? "duo" : "solo";
      modeButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
      byId("ropebound-mode-copy").textContent = mode === "solo"
        ? "你控制其中一人，同行夥伴會跟隨；Tab 可交換牽引。"
        : "P1 使用 W/A/D，P2 使用方向鍵；Q 共同收緊絲線。";
    });
  });

  journeyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      journeyMode = button.dataset.ropeJourney === "story" ? "story" : "endless";
      journeyButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    });
  });

  rosterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const slot = Number(button.dataset.ropeSlot) as 0 | 1;
      const character = Number(button.dataset.ropeCharacter) as CharacterId;
      const other = (slot === 0 ? 1 : 0) as 0 | 1;
      if (roster[other] === character) roster[other] = roster[slot];
      roster[slot] = character;
      try { localStorage.setItem(ROSTER_KEY, JSON.stringify(roster)); } catch { /* ignore */ }
      rosterButtons.forEach((item) => {
        const itemSlot = Number(item.dataset.ropeSlot) as 0 | 1;
        item.classList.toggle("is-selected", Number(item.dataset.ropeCharacter) === roster[itemSlot]);
      });
    });
  });

  byId<HTMLButtonElement>("ropebound-start").addEventListener("click", begin);
  pauseButton.addEventListener("click", togglePause);
  soundButton.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    if (muted) window.clearInterval(musicTimer);
    else startAmbient();
    updateHud();
  });
  restartButton.addEventListener("click", begin);
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("resize", updateCanvasSize);

  touchButtons.forEach((button) => {
    const input = button.dataset.ropeInput!;
    const press = (event: PointerEvent): void => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touch.add(input);
      if (input === "jump") queueJump(mode === "solo" ? activePlayer : 0);
      if (input === "p1-jump") queueJump(0);
      if (input === "p2-jump") queueJump(1);
      if (input === "switch" && mode === "solo") activePlayer = activePlayer === 0 ? 1 : 0;
      if (input === "grab") startGrab(mode === "solo" ? activePlayer : 0);
      if (input === "ability") launchHat(mode === "solo" ? activePlayer : 0);
    };
    const release = (): void => {
      touch.delete(input);
      if (input === "grab") releaseGrab(mode === "solo" ? activePlayer : 0);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  });

  updateCanvasSize();
  resetWorld();
  animationFrame = window.requestAnimationFrame(frame);

  return () => {
    deps.activate("記憶絲線", "雙人協作冒險", "六朵記憶花");
    root.closest(".play-stage")?.classList.add("play-stage--wide");
    modeButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.ropeMode === mode));
    journeyButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.ropeJourney === journeyMode));
    rosterButtons.forEach((button) => {
      const slot = Number(button.dataset.ropeSlot) as 0 | 1;
      button.classList.toggle("is-selected", Number(button.dataset.ropeCharacter) === roster[slot]);
    });
    showReady();
    void animationFrame;
  };
}
