-- The assistant's messages were really sent to the customer: they are kept
-- instead of deleted, as `history` and not `system`, so they never read as a
-- person having attended the chat.
UPDATE "whatsapp_messages" SET "source" = 'history' WHERE "source" = 'assistant';--> statement-breakpoint
ALTER TABLE "whatsapp_messages" DROP CONSTRAINT "whatsapp_messages_source_check";--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_source_check" CHECK ("whatsapp_messages"."source" IN ('customer', 'system', 'phone', 'history'));
