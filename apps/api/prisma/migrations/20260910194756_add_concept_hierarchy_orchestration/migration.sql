-- CreateEnum
CREATE TYPE "DocumentConceptStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "StudyPackHierarchyStatus" AS ENUM ('DIRTY', 'GENERATING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "conceptErrorMessage" TEXT,
ADD COLUMN     "conceptStatus" "DocumentConceptStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "StudyTopic" ADD COLUMN     "hierarchyErrorMessage" TEXT,
ADD COLUMN     "hierarchyGeneratedRevision" INTEGER,
ADD COLUMN     "hierarchyRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hierarchyStatus" "StudyPackHierarchyStatus" NOT NULL DEFAULT 'DIRTY',
ADD COLUMN     "hierarchyUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Document_studyPackId_conceptStatus_idx" ON "Document"("studyPackId", "conceptStatus");
