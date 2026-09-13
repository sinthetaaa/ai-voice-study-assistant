/* eslint-disable @typescript-eslint/no-require-imports */

import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type DocumentsServiceLike = {
  getDocumentFile(studyPackId: string, documentId: string): Promise<unknown>;
};

type QuestionsServiceLike = {
  previewConceptQuestions(
    studyPackId: string,
    conceptId: string,
  ): Promise<unknown>;
};

type EvaluationsServiceLike = {
  evaluateQuestion(
    studyPackId: string,
    conceptId: string,
    questionId: string,
    answerText: unknown,
  ): Promise<unknown>;
};

type RemediationServiceLike = {
  generateForEvaluation(
    studyPackId: string,
    conceptId: string,
    evaluationId: string,
  ): Promise<unknown>;
};

type LearningLoopServiceLike = {
  getNextStep(
    studyPackId: string,
    conceptId: string,
    evaluationId: string,
  ): Promise<unknown>;
};

type DocumentsServiceConstructor = new (
  prisma: PrismaService,
  storage: unknown,
  ingestionQueue: unknown,
) => DocumentsServiceLike;

type QuestionsServiceConstructor = new (
  prisma: PrismaService,
  questionAiClient: unknown,
) => QuestionsServiceLike;

type EvaluationsServiceConstructor = new (
  prisma: PrismaService,
  evaluationAiClient: unknown,
  masteryService: unknown,
) => EvaluationsServiceLike;

type RemediationServiceConstructor = new (
  prisma: PrismaService,
  adaptiveService: unknown,
  remediationAiClient: unknown,
) => RemediationServiceLike;

type LearningLoopServiceConstructor = new (
  prisma: PrismaService,
  adaptiveService: unknown,
  remediationService: unknown,
  questionsService: unknown,
) => LearningLoopServiceLike;

const { DocumentsService } = require('../documents/documents.service') as {
  DocumentsService: DocumentsServiceConstructor;
};

const { QuestionsService } = require('../questions/questions.service') as {
  QuestionsService: QuestionsServiceConstructor;
};

const { EvaluationsService } =
  require('../evaluations/evaluations.service') as {
    EvaluationsService: EvaluationsServiceConstructor;
  };

const { RemediationService } =
  require('../remediation/remediation.service') as {
    RemediationService: RemediationServiceConstructor;
  };

const { LearningLoopService } =
  require('../learning-loop/learning-loop.service') as {
    LearningLoopService: LearningLoopServiceConstructor;
  };

describe('nested resource ownership boundaries', () => {
  it('rejects a document that does not belong to the owned Study Pack', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    const readDocument = jest.fn();

    const service = new DocumentsService(
      {
        document: {
          findFirst,
        },
      } as unknown as PrismaService,
      {
        readDocument,
      },
      {},
    );

    await expect(
      service.getDocumentFile('owned-pack', 'foreign-document'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-document',
          studyPackId: 'owned-pack',
        },
      }),
    );

    expect(readDocument).not.toHaveBeenCalled();
  });

  it('rejects a concept that does not belong to the owned Study Pack', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'owned-pack',
    });

    const findFirst = jest.fn().mockResolvedValue(null);

    const generateQuestions = jest.fn();

    const service = new QuestionsService(
      {
        studyPack: {
          findUnique,
        },
        concept: {
          findFirst,
        },
      } as unknown as PrismaService,
      {
        generateQuestions,
      },
    );

    await expect(
      service.previewConceptQuestions('owned-pack', 'foreign-concept'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-concept',
          studyPackId: 'owned-pack',
        },
      }),
    );

    expect(generateQuestions).not.toHaveBeenCalled();
  });

  it('rejects a question outside the supplied concept and Study Pack', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    const evaluateAnswer = jest.fn();
    const applyEvaluation = jest.fn();

    const service = new EvaluationsService(
      {
        question: {
          findFirst,
        },
      } as unknown as PrismaService,
      {
        evaluateAnswer,
      },
      {
        applyEvaluation,
      },
    );

    await expect(
      service.evaluateQuestion(
        'owned-pack',
        'owned-concept',
        'foreign-question',
        'learner answer',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-question',
          conceptId: 'owned-concept',
          concept: {
            studyPackId: 'owned-pack',
          },
        },
      }),
    );

    expect(evaluateAnswer).not.toHaveBeenCalled();
    expect(applyEvaluation).not.toHaveBeenCalled();
  });

  it('rejects a remediation evaluation outside the supplied concept and Study Pack', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    const decideForEvaluation = jest.fn();
    const generateRemediation = jest.fn();

    const service = new RemediationService(
      {
        answerEvaluation: {
          findFirst,
        },
      } as unknown as PrismaService,
      {
        decideForEvaluation,
      },
      {
        generateRemediation,
      },
    );

    await expect(
      service.generateForEvaluation(
        'owned-pack',
        'owned-concept',
        'foreign-evaluation',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-evaluation',
          attempt: {
            question: {
              conceptId: 'owned-concept',
              concept: {
                studyPackId: 'owned-pack',
              },
            },
          },
        },
      }),
    );

    expect(decideForEvaluation).not.toHaveBeenCalled();

    expect(generateRemediation).not.toHaveBeenCalled();
  });

  it('rejects a learning-loop evaluation outside the supplied concept and Study Pack', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    const decideForEvaluation = jest.fn();
    const generateForEvaluation = jest.fn();
    const generateAdaptiveQuestion = jest.fn();

    const service = new LearningLoopService(
      {
        answerEvaluation: {
          findFirst,
        },
      } as unknown as PrismaService,
      {
        decideForEvaluation,
      },
      {
        generateForEvaluation,
      },
      {
        generateAdaptiveQuestion,
      },
    );

    await expect(
      service.getNextStep('owned-pack', 'owned-concept', 'foreign-evaluation'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign-evaluation',
          attempt: {
            question: {
              conceptId: 'owned-concept',
              concept: {
                studyPackId: 'owned-pack',
              },
            },
          },
        },
      }),
    );

    expect(decideForEvaluation).not.toHaveBeenCalled();

    expect(generateForEvaluation).not.toHaveBeenCalled();

    expect(generateAdaptiveQuestion).not.toHaveBeenCalled();
  });
});
