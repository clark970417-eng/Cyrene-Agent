import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cityState = sqliteTable("city_state", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSimulatedAt: integer("last_simulated_at").notNull(),
  day: integer("day").notNull(),
  petals: integer("petals").notNull(),
  warmth: integer("warmth").notNull(),
  resonance: integer("resonance").notNull(),
  visits: integer("visits").notNull(),
  weather: text("weather").notNull(),
  phase: text("phase").notNull(),
});

export const cityEvents = sqliteTable(
  "city_events",
  {
    id: text("id").primaryKey(),
    cityId: text("city_id").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("city_events_city_time_idx").on(table.cityId, table.createdAt)],
);
