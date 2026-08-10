-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "parsedMetadata" JSONB,
ADD COLUMN     "parser" TEXT;

-- CreateTable
CREATE TABLE "DocumentUnit" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentUnit_documentId_idx" ON "DocumentUnit"("documentId");

-- CreateIndex
CREATE INDEX "DocumentUnit_kind_idx" ON "DocumentUnit"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUnit_documentId_unitIndex_key" ON "DocumentUnit"("documentId", "unitIndex");

-- AddForeignKey
ALTER TABLE "DocumentUnit" ADD CONSTRAINT "DocumentUnit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
