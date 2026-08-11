-- CreateEnum
CREATE TYPE "ConceptDifficulty" AS ENUM ('FOUNDATIONAL', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "ConceptRelationshipType" AS ENUM ('PREREQUISITE', 'BUILDS_ON', 'RELATED_TO');

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "studyPackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "difficulty" "ConceptDifficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptSource" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptRelationship" (
    "id" TEXT NOT NULL,
    "sourceConceptId" TEXT NOT NULL,
    "targetConceptId" TEXT NOT NULL,
    "type" "ConceptRelationshipType" NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Concept_studyPackId_idx" ON "Concept"("studyPackId");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_studyPackId_normalizedName_key" ON "Concept"("studyPackId", "normalizedName");

-- CreateIndex
CREATE INDEX "ConceptSource_conceptId_idx" ON "ConceptSource"("conceptId");

-- CreateIndex
CREATE INDEX "ConceptSource_chunkId_idx" ON "ConceptSource"("chunkId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptSource_conceptId_chunkId_key" ON "ConceptSource"("conceptId", "chunkId");

-- CreateIndex
CREATE INDEX "ConceptRelationship_sourceConceptId_idx" ON "ConceptRelationship"("sourceConceptId");

-- CreateIndex
CREATE INDEX "ConceptRelationship_targetConceptId_idx" ON "ConceptRelationship"("targetConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptRelationship_sourceConceptId_targetConceptId_type_key" ON "ConceptRelationship"("sourceConceptId", "targetConceptId", "type");

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptSource" ADD CONSTRAINT "ConceptSource_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptSource" ADD CONSTRAINT "ConceptSource_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRelationship" ADD CONSTRAINT "ConceptRelationship_sourceConceptId_fkey" FOREIGN KEY ("sourceConceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRelationship" ADD CONSTRAINT "ConceptRelationship_targetConceptId_fkey" FOREIGN KEY ("targetConceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
