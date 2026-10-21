ALTER TABLE "whatsapp_conversations" ADD COLUMN "opened_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "assistant_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "assistant_paused_by" uuid;--> statement-breakpoint
-- Existing chats count as opened when they were created, so a person's past
-- reply keeps the assistant silent in them (the safe side).
UPDATE "whatsapp_conversations" SET "opened_at" = "created_at";