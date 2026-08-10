-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_unitId_idx" ON "DocumentChunk"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_unitId_chunkIndex_key" ON "DocumentChunk"("unitId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DocumentUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
