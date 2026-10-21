ALTER TABLE "whatsapp_conversations" ADD COLUMN "handoff_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "handoff_reason" text;