-- Persist newly uploaded report photos independently of a host's local disk.
-- Existing local-file photos keep working when their original file is present.
ALTER TABLE "Photo" ADD COLUMN "data" BYTEA;
