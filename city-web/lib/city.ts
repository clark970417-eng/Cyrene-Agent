export const CITY_ID = "eternal-day-garden";
export const TICK_MS = 15 * 60 * 1000;

export type CityAction = "tend" | "listen" | "wish";

export type CityState = {
  id: string;
  name: string;
  createdAt: number;
  lastSimulatedAt: number;
  day: number;
  petals: number;
  warmth: number;
  resonance: number;
  visits: number;
  weather: string;
  phase: string;
};

export type CityEvent = {
  id: string;
  kind: string;
  message: string;
  createdAt: number;
};

export type CitySnapshot = CityState & {
  events: CityEvent[];
  settledTicks: number;
  serverNow: number;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

export function createCity(now: number): CityState {
  return {
    id: CITY_ID,
    name: "永晝花庭",
    createdAt: now,
    lastSimulatedAt: now,
    day: 1,
    petals: 120,
    warmth: 76,
    resonance: 58,
    visits: 1,
    weather: weatherForDay(1),
    phase: phaseForTime(now),
  };
}

export function advanceCity(city: CityState, now: number) {
  const elapsed = Math.max(0, now - city.lastSimulatedAt);
  const ticks = Math.floor(elapsed / TICK_MS);
  const day = Math.max(1, Math.floor((now - city.createdAt) / 86_400_000) + 1);

  if (ticks === 0) {
    return {
      city: { ...city, day, phase: phaseForTime(now), weather: weatherForDay(day) },
      ticks,
    };
  }

  const cycles = Math.floor(ticks / 8);
  const bloomPulse = Math.floor(ticks / 16);
  return {
    city: {
      ...city,
      day,
      lastSimulatedAt: city.lastSimulatedAt + ticks * TICK_MS,
      petals: city.petals + ticks * 2 + bloomPulse * 3,
      warmth: clamp(city.warmth - cycles + bloomPulse),
      resonance: clamp(city.resonance + Math.min(4, Math.floor(ticks / 24))),
      weather: weatherForDay(day),
      phase: phaseForTime(now),
    },
    ticks,
  };
}

export function applyCityAction(city: CityState, action: CityAction) {
  if (action === "tend") {
    return {
      city: { ...city, petals: city.petals + 18, warmth: clamp(city.warmth + 9) },
      message: "你整理了星花徑。幾盞窗燈跟著亮了起來。",
    };
  }
  if (action === "listen") {
    return {
      city: { ...city, resonance: clamp(city.resonance + 11), warmth: clamp(city.warmth + 3) },
      message: "你停下來聽城市的聲音，一段遙遠的回音回到了花庭。",
    };
  }
  return {
    city: { ...city, petals: city.petals + 7, resonance: clamp(city.resonance + 5) },
    message: "一個願望被放進天穹。它會在往後的日子裡慢慢發光。",
  };
}

export function phaseForTime(now: number) {
  const hour = new Date(now + 8 * 60 * 60 * 1000).getUTCHours();
  if (hour >= 5 && hour < 11) return "晨霧甦醒";
  if (hour >= 11 && hour < 17) return "永晝盛放";
  if (hour >= 17 && hour < 22) return "薄暮點燈";
  return "星夜守望";
}

export function weatherForDay(day: number) {
  return ["花雨", "晴空", "星霧", "微光風"][day % 4];
}

export function isCityAction(value: unknown): value is CityAction {
  return value === "tend" || value === "listen" || value === "wish";
}
