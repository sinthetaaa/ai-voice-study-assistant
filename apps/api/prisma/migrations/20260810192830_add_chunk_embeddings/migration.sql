CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "DocumentChunk"
ADD COLUMN "embeddedAt" TIMESTAMP(3),
ADD COLUMN "embedding" vector(384),
ADD COLUMN "embeddingModel" TEXT,
ADD COLUMN "embeddingProvider" TEXT;