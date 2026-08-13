import { StudySessionAnswerResult } from './study-sessions.service';

export function composeStudySessionVoiceResponse(
  result: StudySessionAnswerResult,
): string {
  const nextQuestion = clean(result.session.currentQuestion?.prompt ?? '');

  const shortFeedback = feedbackForCorrectness(result.evaluation.correctness);

  /*
   * REVIEW sessions deliberately bypass the
   * normal LearningLoop.
   */
  if (result.reviewStep) {
    if (result.reviewStep.correctness === 'CORRECT') {
      return joinParts(
        "That's right.",
        'Nice work. We will revisit this concept later.',
      );
    }

    if (result.reviewStep.correctness === 'PARTIAL') {
      return joinParts(
        "You're close.",
        'We will revisit this concept again soon.',
      );
    }

    return joinParts('Not quite.', 'We will revisit this concept again soon.');
  }

  if (!result.learningStep) {
    return joinParts(shortFeedback, nextQuestion);
  }

  /*
   * Session completion takes precedence over
   * presenting another question.
   */
  if (result.session.status === 'COMPLETED') {
    return joinParts(shortFeedback, 'You have completed this study session.');
  }

  if (result.learningStep.action === 'REMEDIATE_AND_ASK') {
    const coreRemediation = extractCoreRemediation(
      result.learningStep.remediation,
    );

    return joinParts(
      shortFeedback,
      coreRemediation,
      nextQuestion ? `Let's try that again. ${nextQuestion}` : '',
    );
  }

  if (result.learningStep.action === 'ADVANCE_WITH_REVIEW') {
    return joinParts(
      shortFeedback,
      'We will review this concept again later.',
      nextQuestion ? `Let's move on. ${nextQuestion}` : '',
    );
  }

  if (result.learningStep.action === 'ADVANCE_CONCEPT') {
    return joinParts(
      shortFeedback,
      nextQuestion ? `Let's move on. ${nextQuestion}` : '',
    );
  }

  /*
   * ASK_QUESTION
   */
  return joinParts(
    shortFeedback,
    nextQuestion ? `Next question. ${nextQuestion}` : '',
  );
}

function feedbackForCorrectness(
  correctness: 'CORRECT' | 'PARTIAL' | 'INCORRECT',
): string {
  if (correctness === 'CORRECT') {
    return "That's right.";
  }

  if (correctness === 'PARTIAL') {
    return "You're close.";
  }

  return 'Not quite.';
}

function extractCoreRemediation(
  remediation: {
    focusPoints: string[];

    explanation: string;

    keyTakeaways: string[];
  } | null,
): string {
  if (!remediation) {
    return '';
  }

  const focusPoint = clean(remediation.focusPoints[0] ?? '');

  if (focusPoint) {
    return (
      'The key idea is ' +
      normalizeLeadingArticle(stripEndingPunctuation(focusPoint)) +
      '.'
    );
  }

  const takeaway = clean(remediation.keyTakeaways[0] ?? '');

  if (takeaway) {
    return ensureSentence(truncate(takeaway, 180));
  }

  const explanation = clean(remediation.explanation);

  if (!explanation) {
    return '';
  }

  return ensureSentence(truncate(firstSentence(explanation), 180));
}

function firstSentence(value: string): string {
  const match = value.match(/^.*?[.!?](?:\s|$)/);

  if (match) {
    return match[0].trim();
  }

  return value;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const shortened = value.slice(0, maxLength - 1);

  const finalSpace = shortened.lastIndexOf(' ');

  const safe = finalSpace > 0 ? shortened.slice(0, finalSpace) : shortened;

  return `${safe}…`;
}

function normalizeLeadingArticle(value: string): string {
  return value.replace(/^(The|A|An)\b/, (article) => article.toLowerCase());
}

function stripEndingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, '');
}

function ensureSentence(value: string): string {
  const cleaned = clean(value);

  if (!cleaned) {
    return '';
  }

  if (/[.!?…]$/.test(cleaned)) {
    return cleaned;
  }

  return `${cleaned}.`;
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function joinParts(...parts: string[]): string {
  return parts.map(clean).filter(Boolean).join(' ');
}
