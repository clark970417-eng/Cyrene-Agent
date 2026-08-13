CREATE TABLE `city_events` (
	`id` text PRIMARY KEY NOT NULL,
	`city_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `city_state` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_simulated_at` integer NOT NULL,
	`day` integer NOT NULL,
	`petals` integer NOT NULL,
	`warmth` integer NOT NULL,
	`resonance` integer NOT NULL,
	`visits` integer NOT NULL,
	`weather` text NOT NULL,
	`phase` text NOT NULL
);
