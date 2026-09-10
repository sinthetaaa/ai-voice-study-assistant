-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "coreConceptId" TEXT,
ADD COLUMN     "positionInCore" INTEGER;

-- CreateTable
CREATE TABLE "StudyTopic" (
    "id" TEXT NOT NULL,
    "studyPackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoreConcept" (
    "id" TEXT NOT NULL,
    "studyPackId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoreConcept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyTopic_studyPackId_idx" ON "StudyTopic"("studyPackId");

-- CreateIndex
CREATE INDEX "StudyTopic_position_idx" ON "StudyTopic"("position");

-- CreateIndex
CREATE UNIQUE INDEX "StudyTopic_studyPackId_normalizedName_key" ON "StudyTopic"("studyPackId", "normalizedName");

-- CreateIndex
CREATE INDEX "CoreConcept_studyPackId_idx" ON "CoreConcept"("studyPackId");

-- CreateIndex
CREATE INDEX "CoreConcept_topicId_idx" ON "CoreConcept"("topicId");

-- CreateIndex
CREATE INDEX "CoreConcept_position_idx" ON "CoreConcept"("position");

-- CreateIndex
CREATE UNIQUE INDEX "CoreConcept_studyPackId_normalizedName_key" ON "CoreConcept"("studyPackId", "normalizedName");

-- CreateIndex
CREATE INDEX "Concept_coreConceptId_positionInCore_idx" ON "Concept"("coreConceptId", "positionInCore");

-- AddForeignKey
ALTER TABLE "StudyTopic" ADD CONSTRAINT "StudyTopic_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreConcept" ADD CONSTRAINT "CoreConcept_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreConcept" ADD CONSTRAINT "CoreConcept_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "StudyTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_coreConceptId_fkey" FOREIGN KEY ("coreConceptId") REFERENCES "CoreConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
