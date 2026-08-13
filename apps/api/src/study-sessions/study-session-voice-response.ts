import { StudySessionAnswerResult } from './study-sessions.service';

export function composeStudySessionVoiceResponse(
  result: StudySessionAnswerResult,
): string {
  const evaluation = result.evaluation;

  const opening = feedbackForCorrectness(evaluation.correctness);

  /*
   * REVIEW sessions have their own completion
   * semantics and deliberately bypass LearningLoop.
   */
  if (result.reviewStep) {
    return composeReviewResponse(result);
  }

  const conciseFeedback = extractConciseFeedback(evaluation.feedback ?? '');

  const missingPoint = clean(evaluation.missingPoints?.[0] ?? '');

  const misconception = clean(evaluation.misconceptions?.[0] ?? '');

  const remediation = extractCoreRemediation(
    result.learningStep?.remediation ?? null,
  );

  /*
   * IMPORTANT PRODUCT RULE:
   *
   * Ryan explains only the answer that the learner
   * just gave.
   *
   * Ryan MUST NOT append the next question here.
   *
   * The next question is spoken separately only
   * after the learner presses "Next Question".
   */
  if (result.session.status === 'COMPLETED') {
    return joinParts(
      opening,
      conciseFeedback,
      missingPoint ? composeMissingPoint(missingPoint) : '',
      misconception ? composeMisconception(misconception) : '',
      remediation,
      'You have completed this study session.',
    );
  }

  if (result.learningStep?.action === 'ADVANCE_WITH_REVIEW') {
    return joinParts(
      opening,
      conciseFeedback,
      missingPoint ? composeMissingPoint(missingPoint) : '',
      misconception ? composeMisconception(misconception) : '',
      remediation,
      'We will revisit this concept again later.',
    );
  }

  return joinParts(
    opening,
    conciseFeedback,
    missingPoint ? composeMissingPoint(missingPoint) : '',
    misconception ? composeMisconception(misconception) : '',
    remediation,
  );
}

function composeReviewResponse(result: StudySessionAnswerResult): string {
  if (!result.reviewStep) {
    return '';
  }

  if (result.reviewStep.correctness === 'CORRECT') {
    return joinParts(
      "That's right.",
      'Nice work. We will revisit this concept later.',
    );
  }

  if (result.reviewStep.correctness === 'PARTIAL') {
    return joinParts(
      "You're close.",
      extractConciseFeedback(result.evaluation.feedback ?? ''),
      'We will revisit this concept again soon.',
    );
  }

  return joinParts(
    'Not quite.',
    extractConciseFeedback(result.evaluation.feedback ?? ''),
    'We will revisit this concept again soon.',
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

function extractConciseFeedback(feedback: string): string {
  const cleaned = clean(feedback);

  if (!cleaned) {
    return '';
  }

  /*
   * Ryan should sound like a tutor, not read an
   * evaluation report word-for-word.
   *
   * Keep only the first useful sentence and cap it.
   */
  return ensureSentence(truncate(firstSentence(cleaned), 180));
}

function composeMissingPoint(value: string): string {
  const normalized = normalizeForSpeech(value);

  if (!normalized) {
    return '';
  }

  return ensureSentence(`One important point to add is ${normalized}`);
}

function composeMisconception(value: string): string {
  const normalized = normalizeForSpeech(value);

  if (!normalized) {
    return '';
  }

  return ensureSentence(`One thing to correct is ${normalized}`);
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

  /*
   * Prefer a compact pedagogical focus point.
   *
   * This keeps Ryan conversational even if the
   * generated remediation explanation is long.
   */
  const focusPoint = clean(remediation.focusPoints?.[0] ?? '');

  if (focusPoint) {
    return ensureSentence(`The key idea is ${normalizeForSpeech(focusPoint)}`);
  }

  const takeaway = clean(remediation.keyTakeaways?.[0] ?? '');

  if (takeaway) {
    return ensureSentence(truncate(takeaway, 180));
  }

  const explanation = clean(remediation.explanation ?? '');

  if (!explanation) {
    return '';
  }

  return ensureSentence(truncate(firstSentence(explanation), 180));
}

function normalizeForSpeech(value: string): string {
  return normalizeLeadingArticle(stripEndingPunctuation(clean(value)));
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
