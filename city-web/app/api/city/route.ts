import { env } from "cloudflare:workers";
import {
  CITY_ID,
  advanceCity,
  applyCityAction,
  createCity,
  isCityAction,
  type CityEvent,
  type CitySnapshot,
  type CityState,
} from "../../../lib/city";

export const runtime = "edge";

const cityTableSql = `CREATE TABLE IF NOT EXISTS city_state (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_simulated_at INTEGER NOT NULL,
  day INTEGER NOT NULL,
  petals INTEGER NOT NULL,
  warmth INTEGER NOT NULL,
  resonance INTEGER NOT NULL,
  visits INTEGER NOT NULL,
  weather TEXT NOT NULL,
  phase TEXT NOT NULL
)`;

const eventTableSql = `CREATE TABLE IF NOT EXISTS city_events (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(cityTableSql),
    db.prepare(eventTableSql),
    db.prepare("CREATE INDEX IF NOT EXISTS city_events_city_time_idx ON city_events (city_id, created_at DESC)"),
  ]);
}

function rowToCity(row: Record<string, unknown>): CityState {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: Number(row.created_at),
    lastSimulatedAt: Number(row.last_simulated_at),
    day: Number(row.day),
    petals: Number(row.petals),
    warmth: Number(row.warmth),
    resonance: Number(row.resonance),
    visits: Number(row.visits),
    weather: String(row.weather),
    phase: String(row.phase),
  };
}

async function saveCity(db: D1Database, city: CityState) {
  await db.prepare(`INSERT INTO city_state (
    id, name, created_at, last_simulated_at, day, petals, warmth, resonance, visits, weather, phase
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    last_simulated_at = excluded.last_simulated_at,
    day = excluded.day,
    petals = excluded.petals,
    warmth = excluded.warmth,
    resonance = excluded.resonance,
    visits = excluded.visits,
    weather = excluded.weather,
    phase = excluded.phase`).bind(
      city.id, city.name, city.createdAt, city.lastSimulatedAt, city.day,
      city.petals, city.warmth, city.resonance, city.visits, city.weather, city.phase,
    ).run();
}

async function addEvent(db: D1Database, kind: string, message: string, now: number) {
  await db.prepare("INSERT INTO city_events (id, city_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), CITY_ID, kind, message, now)
    .run();
}

async function getEvents(db: D1Database): Promise<CityEvent[]> {
  const result = await db.prepare(
    "SELECT id, kind, message, created_at FROM city_events WHERE city_id = ? ORDER BY created_at DESC LIMIT 8",
  ).bind(CITY_ID).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    message: String(row.message),
    createdAt: Number(row.created_at),
  }));
}

async function readAndSettle(db: D1Database, countVisit = false) {
  const now = Date.now();
  const row = await db.prepare("SELECT * FROM city_state WHERE id = ?").bind(CITY_ID).first<Record<string, unknown>>();
  let base = row ? rowToCity(row) : createCity(now);
  const previousDay = base.day;
  const advanced = advanceCity(base, now);
  base = { ...advanced.city, visits: advanced.city.visits + (countVisit && row ? 1 : 0) };
  await saveCity(db, base);

  if (!row) {
    await addEvent(db, "birth", "花庭在雲端醒來了。從這一刻起，時間會一直向前。", now);
  } else if (base.day > previousDay) {
    await addEvent(db, "day", `城市走進第 ${base.day} 天，今天天穹落下的是${base.weather}。`, now);
  }

  return { city: base, ticks: advanced.ticks, now };
}

function json(snapshot: CitySnapshot) {
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const db = env.DB;
  await ensureSchema(db);
  const { city, ticks, now } = await readAndSettle(db, true);
  return json({ ...city, events: await getEvents(db), settledTicks: ticks, serverNow: now });
}

export async function POST(request: Request) {
  const db = env.DB;
  await ensureSchema(db);
  const payload = await request.json().catch(() => ({})) as { action?: unknown };
  if (!isCityAction(payload.action)) {
    return Response.json({ error: "未知的城市動作" }, { status: 400 });
  }

  const { city, ticks, now } = await readAndSettle(db);
  const changed = applyCityAction(city, payload.action);
  await saveCity(db, changed.city);
  await addEvent(db, payload.action, changed.message, now);
  return json({ ...changed.city, events: await getEvents(db), settledTicks: ticks, serverNow: now });
}
