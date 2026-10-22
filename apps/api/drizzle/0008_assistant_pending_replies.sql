CREATE TABLE "assistant_pending_replies" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"message_ids" uuid[] DEFAULT '{}' NOT NULL,
	"first_pending_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"claimed_ids" uuid[] DEFAULT '{}' NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "assistant_pending_replies_due_idx" ON "assistant_pending_replies" USING btree ("due_at");