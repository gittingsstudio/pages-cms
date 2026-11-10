CREATE TABLE "entry_presence" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"image" text,
	"is_dirty" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_entry_presence_entry_user" ON "entry_presence" USING btree ("owner","repo","branch","path","user_id");--> statement-breakpoint
CREATE INDEX "idx_entry_presence_lastSeenAt" ON "entry_presence" USING btree ("last_seen_at");