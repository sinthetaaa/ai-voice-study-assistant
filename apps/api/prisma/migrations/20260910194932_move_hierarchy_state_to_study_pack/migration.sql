/*
  Warnings:

  - You are about to drop the column `hierarchyErrorMessage` on the `StudyTopic` table. All the data in the column will be lost.
  - You are about to drop the column `hierarchyGeneratedRevision` on the `StudyTopic` table. All the data in the column will be lost.
  - You are about to drop the column `hierarchyRevision` on the `StudyTopic` table. All the data in the column will be lost.
  - You are about to drop the column `hierarchyStatus` on the `StudyTopic` table. All the data in the column will be lost.
  - You are about to drop the column `hierarchyUpdatedAt` on the `StudyTopic` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StudyPack" ADD COLUMN     "hierarchyErrorMessage" TEXT,
ADD COLUMN     "hierarchyGeneratedRevision" INTEGER,
ADD COLUMN     "hierarchyRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hierarchyStatus" "StudyPackHierarchyStatus" NOT NULL DEFAULT 'DIRTY',
ADD COLUMN     "hierarchyUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudyTopic" DROP COLUMN "hierarchyErrorMessage",
DROP COLUMN "hierarchyGeneratedRevision",
DROP COLUMN "hierarchyRevision",
DROP COLUMN "hierarchyStatus",
DROP COLUMN "hierarchyUpdatedAt";
