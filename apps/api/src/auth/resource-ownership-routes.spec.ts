import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ClassGuardedController = {
  file: string;
  routeCount: number;
};

type MethodGuardedRoute = {
  file: string;
  ownership: string;
  route: string;
};

function source(relativePath: string): string {
  return readFileSync(join(__dirname, '..', relativePath), 'utf8');
}

function countHttpRoutes(text: string): number {
  return text.match(/^\s+@(Get|Post|Put|Patch|Delete)\(/gm)?.length ?? 0;
}

describe('derived resource ownership route contract', () => {
  const classGuarded: ClassGuardedController[] = [
    {
      file: 'documents/documents.controller.ts',
      routeCount: 4,
    },
    {
      file: 'concepts/concepts.controller.ts',
      routeCount: 4,
    },
    {
      file: 'questions/questions.controller.ts',
      routeCount: 2,
    },
    {
      file: 'retrieval/retrieval.controller.ts',
      routeCount: 1,
    },
    {
      file: 'evaluations/evaluations.controller.ts',
      routeCount: 1,
    },
    {
      file: 'remediation/remediation.controller.ts',
      routeCount: 1,
    },
    {
      file: 'learning-loop/learning-loop.controller.ts',
      routeCount: 1,
    },
  ];

  const methodGuarded: MethodGuardedRoute[] = [
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_PACK', 'studyPackId')",
      route: "@Post('study-packs/:studyPackId/sessions')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_PACK', 'studyPackId')",
      route: "@Get('study-packs/:studyPackId/coverage')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_PACK', 'studyPackId')",
      route: "@Post('study-packs/:studyPackId/review-sessions')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_PACK', 'studyPackId')",
      route: "@Get('study-packs/:studyPackId/readiness')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_SESSION', 'sessionId')",
      route: "@Post('study-sessions/:sessionId/answer')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_SESSION', 'sessionId')",
      route: "@Post('study-sessions/:sessionId/question-speech')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_SESSION', 'sessionId')",
      route: "@Post('study-sessions/:sessionId/voice-answer')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_SESSION', 'sessionId')",
      route: "@Get('study-sessions/:sessionId/attempts/:attemptId/sources')",
    },
    {
      file: 'study-sessions/study-sessions.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_SESSION', 'sessionId')",
      route: "@Get('study-sessions/:sessionId')",
    },
    {
      file: 'mastery/mastery.controller.ts',
      ownership: "@RequireResourceOwnership('EVALUATION', 'evaluationId')",
      route: "@Post('mastery/evaluations/:evaluationId/apply')",
    },
    {
      file: 'mastery/mastery.controller.ts',
      ownership: "@RequireResourceOwnership('STUDY_PACK', 'studyPackId')",
      route: "@Get('study-packs/:studyPackId/concepts/:conceptId/mastery')",
    },
    {
      file: 'adaptive/adaptive.controller.ts',
      ownership: "@RequireResourceOwnership('EVALUATION', 'evaluationId')",
      route: "@Post('evaluations/:evaluationId/decide')",
    },
  ];

  it('protects all class-scoped Study Pack routes', () => {
    let routeCount = 0;

    for (const item of classGuarded) {
      const text = source(item.file);

      expect(text).toContain(
        "@RequireResourceOwnership('STUDY_PACK', 'studyPackId')",
      );

      const count = countHttpRoutes(text);

      expect(count).toBe(item.routeCount);

      routeCount += count;
    }

    expect(routeCount).toBe(14);
  });

  it('protects every mixed controller route with the correct ownership root', () => {
    for (const item of methodGuarded) {
      const text = source(item.file);

      expect(text).toContain(`  ${item.ownership}\n  ${item.route}`);
    }

    expect(methodGuarded).toHaveLength(12);
  });

  it('covers exactly twenty-six derived resource routes', () => {
    const classRouteCount = classGuarded.reduce(
      (sum, item) => sum + item.routeCount,
      0,
    );

    expect(classRouteCount + methodGuarded.length).toBe(26);
  });
});
