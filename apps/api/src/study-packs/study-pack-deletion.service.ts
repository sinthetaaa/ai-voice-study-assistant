import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';

@Injectable()
export class StudyPackDeletionService {
  private readonly logger = new Logger(StudyPackDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

  async remove(studyPackId: string, ownerId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      /*
       * Ownership must be verified before touching any
       * historical rows belonging to the Study Pack.
       *
       * Foreign and nonexistent Study Packs deliberately
       * have identical 404 behaviour.
       */
      const studyPack = await transaction.studyPack.findFirst({
        where: {
          id: studyPackId,
          ownerId,
        },
        select: {
          id: true,
        },
      });

      if (!studyPack) {
        throw new NotFoundException(`Study pack ${studyPackId} was not found`);
      }

      /*
       * MasteryEvent uses RESTRICT for both Concept and
       * AnswerEvaluation. Remove it before deleting either
       * the questions/attempts or the Concepts themselves.
       */
      await transaction.masteryEvent.deleteMany({
        where: {
          concept: {
            studyPackId,
          },
        },
      });

      /*
       * QuestionAttempt restricts Question deletion.
       *
       * AnswerEvaluation cascades from QuestionAttempt,
       * and its MasteryEvent blocker has already been
       * removed above.
       */
      await transaction.questionAttempt.deleteMany({
        where: {
          question: {
            concept: {
              studyPackId,
            },
          },
        },
      });

      /*
       * SessionConceptProgress restricts Concept deletion.
       *
       * Removing StudySession cascades its progress rows
       * and SessionMasteryEvent history.
       */
      await transaction.studySession.deleteMany({
        where: {
          studyPackId,
        },
      });

      /*
       * The remaining graph is intentionally handled by
       * the StudyPack CASCADE relations:
       *
       * documents / units / chunks
       * concepts / sources / questions
       * topics / core concepts
       * relationships / mastery
       */
      const deleted = await transaction.studyPack.deleteMany({
        where: {
          id: studyPackId,
          ownerId,
        },
      });

      if (deleted.count !== 1) {
        /*
         * Protect against a concurrent deletion between
         * the ownership lookup and final delete.
         *
         * Throwing rolls this transaction back.
         */
        throw new NotFoundException(`Study pack ${studyPackId} was not found`);
      }
    });

    /*
     * PostgreSQL is authoritative.
     *
     * Physical file cleanup happens only after the DB
     * transaction has committed so a database failure can
     * never leave a surviving Study Pack without files.
     *
     * A filesystem cleanup failure must not turn an already
     * committed deletion into a misleading API failure.
     */
    try {
      await this.storage.deleteStudyPackDocuments(studyPackId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Study Pack ${studyPackId} was deleted, but its local storage ` +
          `directory could not be removed: ${message}`,
      );
    }
  }
}
