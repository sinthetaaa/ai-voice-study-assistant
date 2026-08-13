const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ApiDocument = {
  id: string;

  studyPackId: string;

  originalName: string;

  mimeType: string;

  sizeBytes: number;

  status?: string;

  createdAt?: string;
};

export type StudyPack = {
  id: string;

  name: string;

  description?: string | null;

  goal?: string | null;

  documents: ApiDocument[];
};

export type UploadDocumentsResult = {
  studyPackId: string;

  uploaded: number;

  documents: ApiDocument[];
};

export type ReadinessResult = {
  studyPackId: string;

  overallState:
    | "NO_ACTIVE_CONCEPTS"
    | "PREPARATION_INCOMPLETE"
    | "NORMAL_STUDY_AVAILABLE"
    | "NORMAL_STUDY_COMPLETE";

  counts: {
    activeConceptCount: number;

    questionReadyConceptCount: number;

    conceptsNeedingQuestionPreparation: number;

    unseenConceptCount: number;

    learningConceptCount: number;

    masteredConceptCount: number;

    normalStudyConceptCount: number;

    masteredQuestionReadyConceptCount: number;

    scheduledReviewCount: number;

    dueReviewCount: number;
  };

  questionPreparationCoverage: {
    ready: number;

    total: number;

    ratio: number;
  };
};

export type SessionMastery = {
  score: number;

  evidenceWeight: number;

  attemptCount: number;
};

export type SessionConcept = {
  id: string;

  name: string;

  difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";

  importance: number;

  position: number;

  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REVIEW_REQUIRED";

  reviewRequired: boolean;

  mastery: SessionMastery;
};

export type SessionQuestion = {
  id: string;

  type: "RECALL" | "UNDERSTANDING" | "APPLICATION";

  difficulty: "EASY" | "MEDIUM" | "HARD";

  prompt: string;
};

export type StudySession = {
  sessionId: string;

  studyPackId: string;

  kind: "NORMAL" | "REVIEW";

  status: "ACTIVE" | "COMPLETED" | "ABANDONED";

  startedAt: string;

  completedAt: string | null;

  conceptCount: number;

  progress: {
    completedConceptCount: number;

    reviewRequiredCount: number;

    remainingConceptCount: number;
  };

  currentConcept: SessionConcept | null;

  currentQuestion: SessionQuestion | null;

  conceptFlow: SessionConcept[];
};

export class StudyLoopApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.name = "StudyLoopApiError";

    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,

      cache: "no-store",
    });
  } catch {
    throw new StudyLoopApiError(
      "Could not reach the StudyLoop API. Make sure the API is running on port 4000.",
      0,
    );
  }

  if (!response.ok) {
    let message = `StudyLoop API request failed (${response.status}).`;

    try {
      const body = await response.json();

      if (typeof body?.message === "string") {
        message = body.message;
      } else if (Array.isArray(body?.message)) {
        message = body.message.join(" ");
      }
    } catch {
      // Keep the fallback error.
    }

    throw new StudyLoopApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const studyLoopApi = {
  createStudyPack(name: string) {
    return request<StudyPack>("/study-packs", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        name,
      }),
    });
  },

  getStudyPack(studyPackId: string) {
    return request<StudyPack>(
      `/study-packs/${encodeURIComponent(studyPackId)}`,
    );
  },

  uploadDocuments(studyPackId: string, files: File[]) {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    /*
     * Do not set Content-Type manually.
     * The browser must create the multipart
     * boundary itself.
     */
    return request<UploadDocumentsResult>(
      `/study-packs/${encodeURIComponent(studyPackId)}/documents`,
      {
        method: "POST",

        body: formData,
      },
    );
  },

  getReadiness(studyPackId: string) {
    return request<ReadinessResult>(
      `/study-packs/${encodeURIComponent(studyPackId)}/readiness`,
    );
  },

  startStudySession(studyPackId: string) {
    return request<StudySession>(
      `/study-packs/${encodeURIComponent(studyPackId)}/sessions`,
      {
        method: "POST",
      },
    );
  },

  getStudySession(sessionId: string) {
    return request<StudySession>(
      `/study-sessions/${encodeURIComponent(sessionId)}`,
    );
  },
};
