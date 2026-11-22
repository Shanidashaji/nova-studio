-- NOVA multilingual assistant (ADR-0013): remember the language of each message.
-- IF NOT EXISTS: an early dev build applied this under another timestamp.
ALTER TABLE "AssistantInteraction" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "AssistantInteraction" ADD COLUMN IF NOT EXISTS "languageSource" TEXT;
