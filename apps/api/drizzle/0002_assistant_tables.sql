CREATE TABLE "assistant_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inbound_message_ids" uuid[] NOT NULL,
	"sent_message_id" uuid,
	"outcome" text NOT NULL,
	"reason" text,
	"error_detail" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_runs_outcome_check" CHECK ("assistant_runs"."outcome" IN ('answered', 'handoff', 'error'))
);
--> statement-breakpoint
CREATE TABLE "assistant_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"per_contact_daily_limit" integer DEFAULT 20 NOT NULL,
	"debounce_seconds" integer DEFAULT 8 NOT NULL,
	"max_wait_seconds" integer DEFAULT 30 NOT NULL,
	"daily_reply_limit" integer DEFAULT 300 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_settings_single_row" CHECK ("assistant_settings"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "assistant_runs_conversation_created_idx" ON "assistant_runs" USING btree ("conversation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "assistant_runs_created_idx" ON "assistant_runs" USING btree ("created_at");--> statement-breakpoint
-- The single settings row, with the assistant off.
INSERT INTO "assistant_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;