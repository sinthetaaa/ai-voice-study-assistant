"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";

export type MaterialStudyPoint = {
  id: string;

  category: "MISSED" | "MISCONCEPTION" | "KEY";

  title: string;

  explanation: string;

  searchText: string;

  colorIndex: number;
};

type EvidenceSource = {
  chunkId: string;

  pageNumber: number;

  excerpt: string;
};

type StudyPdfViewerProps = {
  fileUrl: string;

  initialPage: number;

  evidenceSources: EvidenceSource[];

  studyPoints: MaterialStudyPoint[];
  autoLocateEvidence?: boolean;
};

type PdfRenderTask = ReturnType<PDFPageProxy["render"]>;

type LineGroup = {
  items: TextItem[];

  text: string;

  normalizedText: string;

  y: number;
};

const HIGHLIGHT_COLORS = [
  "rgba(255, 214, 64, 0.38)",
  "rgba(145, 125, 255, 0.34)",
  "rgba(73, 196, 220, 0.32)",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "these",
  "this",
  "to",
  "used",
  "using",
  "was",
  "were",
  "which",
  "with",
]);

export default function StudyPdfViewer({
  fileUrl,
  initialPage,
  evidenceSources,
  studyPoints,
  autoLocateEvidence = false,
}: StudyPdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(initialPage || 1);

  const [resolvedInitialPage, setResolvedInitialPage] =
    useState(initialPage || 1);

  const [resolvedEvidenceSources, setResolvedEvidenceSources] =
    useState(evidenceSources);

  const evidenceSignature = useMemo(
    () =>
      evidenceSources
        .map(
          (source) =>
            `${source.chunkId}:${source.pageNumber}:${source.excerpt}`,
        )
        .join("|"),
    [evidenceSources],
  );

  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setError(null);

        setPdf(null);

        const pdfjs = await import("pdfjs-dist");

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loadingTask = pdfjs.getDocument({
          url: fileUrl,
        });

        const loadedPdf = await loadingTask.promise;

        let nextEvidenceSources = evidenceSources;

        let nextInitialPage = Math.min(
          Math.max(initialPage || 1, 1),
          loadedPdf.numPages,
        );

        if (
          autoLocateEvidence &&
          evidenceSources.length > 0
        ) {
          const located = await locateEvidenceSourcesInPdf(
            loadedPdf,
            evidenceSources,
          );

          nextEvidenceSources = located.evidenceSources;

          if (located.initialPage !== null) {
            nextInitialPage = located.initialPage;
          }
        }

        if (!cancelled) {
          setPdf(loadedPdf);
          setResolvedEvidenceSources(nextEvidenceSources);
          setResolvedInitialPage(nextInitialPage);
          setCurrentPage(nextInitialPage);
        }
      } catch (caught) {
        console.error("Could not load StudyLoop PDF:", caught);

        if (!cancelled) {
          setError("StudyLoop could not open this PDF.");
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [
    fileUrl,
    initialPage,
    autoLocateEvidence,
    evidenceSignature,
  ]);

  function goToPage(pageNumber: number) {
    if (!pdf) {
      return;
    }

    const target = Math.min(Math.max(pageNumber, 1), pdf.numPages);

    const container = scrollRef.current;

    const page = pageRefs.current.get(target);

    if (!container || !page) {
      return;
    }

    const containerRect = container.getBoundingClientRect();

    const pageRect = page.getBoundingClientRect();

    const top = container.scrollTop + pageRect.top - containerRect.top - 18;

    container.scrollTo({
      top: Math.max(0, top),

      behavior: "smooth",
    });

    setCurrentPage(target);
  }

  useEffect(() => {
    if (!pdf) {
      return;
    }

    const target = Math.min(
      Math.max(resolvedInitialPage || 1, 1),
      pdf.numPages,
    );

    let cancelled = false;

    let attempts = 0;

    function jump() {
      if (cancelled) {
        return;
      }

      const container = scrollRef.current;

      const page = pageRefs.current.get(target);

      if (container && page) {
        const containerRect = container.getBoundingClientRect();

        const pageRect = page.getBoundingClientRect();

        container.scrollTop = Math.max(
          0,
          container.scrollTop + pageRect.top - containerRect.top - 18,
        );

        setCurrentPage(target);

        return;
      }

      attempts += 1;

      if (attempts < 40) {
        window.setTimeout(jump, 100);
      }
    }

    const timeout = window.setTimeout(jump, 180);

    return () => {
      cancelled = true;

      window.clearTimeout(timeout);
    };
  }, [pdf, resolvedInitialPage, zoom]);

  function handleScroll() {
    const container = scrollRef.current;

    if (!container || !pdf) {
      return;
    }

    const containerRect = container.getBoundingClientRect();

    let bestPage = currentPage;

    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [pageNumber, element] of pageRefs.current) {
      const rect = element.getBoundingClientRect();

      const distance = Math.abs(rect.top - containerRect.top - 20);

      if (distance < bestDistance) {
        bestDistance = distance;

        bestPage = pageNumber;
      }
    }

    if (bestPage !== currentPage) {
      setCurrentPage(bestPage);
    }
  }

  if (error) {
    return <div className="study-pdf-error">{error}</div>;
  }

  if (!pdf) {
    return <div className="study-pdf-loading">Opening source material…</div>;
  }

  return (
    <div className="study-pdf-viewer">
      <div className="study-pdf-toolbar">
        <div className="study-pdf-page-controls">
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>

          <strong>{currentPage}</strong>

          <span>/ {pdf.numPages}</span>

          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pdf.numPages}
            aria-label="Next page"
          >
            ›
          </button>
        </div>

        <div className="study-pdf-zoom-controls">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.75, value - 0.1))}
            aria-label="Zoom out"
          >
            −
          </button>

          <strong>{Math.round(zoom * 100)}%</strong>

          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="study-pdf-scroll" onScroll={handleScroll}>
        {Array.from(
          {
            length: pdf.numPages,
          },

          (_, index) => index + 1,
        ).map((pageNumber) => {
          const pageEvidence = resolvedEvidenceSources.filter(
            (source) => source.pageNumber === pageNumber,
          );

          return (
            <PdfPage
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              scale={1.18 * zoom}
              evidenceSources={pageEvidence}
              studyPoints={pageEvidence.length > 0 ? studyPoints : []}
              registerPage={(element) => {
                if (element) {
                  pageRefs.current.set(pageNumber, element);
                } else {
                  pageRefs.current.delete(pageNumber);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}


async function locateEvidenceSourcesInPdf(
  pdf: PDFDocumentProxy,
  evidenceSources: EvidenceSource[],
): Promise<{
  evidenceSources: EvidenceSource[];
  initialPage: number | null;
}> {
  const pages: {
    pageNumber: number;
    normalizedText: string;
    tokens: Set<string>;
  }[] = [];

  /*
   * DOCX and other converted documents do not necessarily
   * preserve parser-unit numbers as rendered PDF pages.
   * Read every generated PDF page and find the page whose
   * text best matches each stored evidence excerpt.
   */
  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const text = content.items
      .filter(
        (item): item is TextItem =>
          "str" in item,
      )
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    pages.push({
      pageNumber,
      normalizedText: normalizeText(text),
      tokens: significantTokens(text),
    });
  }

  const locatedEvidence = evidenceSources.map((source) => {
    const cleaned = cleanEvidenceText(source.excerpt);
    const queryTokens = significantTokens(cleaned);

    if (queryTokens.size === 0 || pages.length === 0) {
      return {
        ...source,
        pageNumber:
          source.pageNumber > 0
            ? source.pageNumber
            : 1,
      };
    }

    const normalizedQuery = normalizeText(cleaned);

    const usefulWords = normalizedQuery
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= 4 &&
          !STOP_WORDS.has(word),
      );

    const phrase = usefulWords
      .slice(0, Math.min(6, usefulWords.length))
      .join(" ");

    let bestPage = pages[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const page of pages) {
      let matches = 0;

      for (const token of queryTokens) {
        if (page.tokens.has(token)) {
          matches += 1;
        }
      }

      const tokenScore =
        matches /
        Math.max(
          1,
          Math.min(queryTokens.size, 40),
        );

      const phraseBoost =
        phrase.length > 0 &&
        page.normalizedText.includes(phrase)
          ? 0.75
          : 0;

      const score = tokenScore + phraseBoost;

      if (score > bestScore) {
        bestScore = score;
        bestPage = page;
      }
    }

    return {
      ...source,
      pageNumber: bestPage.pageNumber,
    };
  });

  const locatedPages = locatedEvidence
    .map((source) => source.pageNumber)
    .filter((pageNumber) => pageNumber > 0);

  return {
    evidenceSources: locatedEvidence,
    initialPage:
      locatedPages.length > 0
        ? Math.min(...locatedPages)
        : null,
  };
}

function PdfPage({
  pdf,
  pageNumber,
  scale,
  evidenceSources,
  studyPoints,
  registerPage,
}: {
  pdf: PDFDocumentProxy;

  pageNumber: number;

  scale: number;

  evidenceSources: EvidenceSource[];

  studyPoints: MaterialStudyPoint[];

  registerPage: (element: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  const renderTaskRef = useRef<PdfRenderTask | null>(null);

  const renderGenerationRef = useRef(0);

  const [page, setPage] = useState<PDFPageProxy | null>(null);

  const signature = useMemo(
    () =>
      [
        ...studyPoints.map(
          (point) => `${point.id}:${point.searchText}:${point.colorIndex}`,
        ),

        ...evidenceSources.map(
          (source) =>
            `${source.chunkId}:${source.pageNumber}:${source.excerpt}`,
        ),
      ].join("|"),

    [studyPoints, evidenceSources],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const loadedPage = await pdf.getPage(pageNumber);

        if (!cancelled) {
          setPage(loadedPage);
        }
      } catch (caught) {
        console.error(`Could not load PDF page ${pageNumber}:`, caught);
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  useEffect(() => {
    if (!page) {
      return;
    }

    let cancelled = false;

    const generation = ++renderGenerationRef.current;

    async function renderPage() {
      const loadedPage = page;

      const canvas = canvasRef.current;

      const overlay = overlayRef.current;

      if (!loadedPage || !canvas || !overlay) {
        return;
      }

      const previousTask = renderTaskRef.current;

      if (previousTask) {
        try {
          previousTask.cancel();

          await previousTask.promise;
        } catch {
          // Expected cancellation.
        }

        if (renderTaskRef.current === previousTask) {
          renderTaskRef.current = null;
        }
      }

      if (cancelled || generation !== renderGenerationRef.current) {
        return;
      }

      const viewport = loadedPage.getViewport({
        scale,
      });

      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);

      canvas.height = Math.floor(viewport.height * outputScale);

      canvas.style.width = `${viewport.width}px`;

      canvas.style.height = `${viewport.height}px`;

      overlay.style.width = `${viewport.width}px`;

      overlay.style.height = `${viewport.height}px`;

      overlay.innerHTML = "";

      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderTask = loadedPage.render({
        canvas,

        canvasContext: context,

        viewport,

        transform:
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined,
      });

      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message.toLowerCase()
            : String(caught).toLowerCase();

        if (!message.includes("cancel")) {
          console.error(`Could not render PDF page ${pageNumber}:`, caught);
        }

        return;
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      }

      if (cancelled || generation !== renderGenerationRef.current) {
        return;
      }

      const content = await loadedPage.getTextContent();

      if (cancelled || generation !== renderGenerationRef.current) {
        return;
      }

      const textItems = content.items.filter(
        (item): item is TextItem => "str" in item,
      );

      renderStudyHighlights({
        overlay,

        viewport,

        textItems,

        studyPoints,

        evidenceSources,
      });
    }

    void renderPage();

    return () => {
      cancelled = true;

      renderGenerationRef.current += 1;

      const task = renderTaskRef.current;

      if (task) {
        try {
          task.cancel();
        } catch {
          // Already done.
        }
      }
    };
  }, [page, pageNumber, scale, signature]);

  return (
    <div
      ref={registerPage}
      className="study-pdf-page-wrap"
      data-page={pageNumber}
    >
      <div className="study-pdf-page">
        <canvas ref={canvasRef} />

        <div ref={overlayRef} className="study-pdf-highlight-layer" />
      </div>

      <span className="study-pdf-page-number">{pageNumber}</span>
    </div>
  );
}

function renderStudyHighlights({
  overlay,
  viewport,
  textItems,
  studyPoints,
  evidenceSources,
}: {
  overlay: HTMLDivElement;
  viewport: ReturnType<PDFPageProxy["getViewport"]>;
  textItems: TextItem[];
  studyPoints: MaterialStudyPoint[];
  evidenceSources: EvidenceSource[];
}) {
  overlay.innerHTML = "";

  if (
    studyPoints.length === 0 ||
    evidenceSources.length === 0 ||
    textItems.length === 0
  ) {
    return;
  }

  const lines = buildLines(textItems, viewport);

  if (lines.length === 0) {
    return;
  }

  /*
   * ---------------------------------------------------------
   * PRINCIPLE
   * ---------------------------------------------------------
   *
   * Study Points decide WHAT the learner needs to revisit.
   *
   * Stored evidence decides WHERE that information is allowed
   * to be highlighted.
   *
   * This prevents a large evidence chunk from causing unrelated
   * headings such as "Previous Lectures", "Supervised Learning",
   * etc. to be painted simply because they occur in the chunk.
   */

  const studyTargets = studyPoints.map((point) => {
    /*
     * Titles and searchText represent the actual thing the
     * learner needs to know.
     *
     * Explanation is retained separately as weaker context,
     * because explanations can mention comparison concepts
     * (for example supervised learning) that are not themselves
     * the target of the answer.
     */
    const primaryText = expandStudyAliases(
      `${point.title} ${point.searchText}`,
    );

    const supportingText = expandStudyAliases(
      point.explanation,
    );

    return {
      point,
      primaryText,
      primaryTokens: significantTokens(primaryText),
      supportingTokens: significantTokens(supportingText),
    };
  });

  const evidenceText = evidenceSources
    .map((source) => stripFrontMatter(source.excerpt))
    .join(" ");

  const evidenceNormalized = normalizeText(
    expandStudyAliases(evidenceText),
  );

  const evidenceTokens = significantTokens(
    expandStudyAliases(evidenceText),
  );

  /*
   * Score every visual line against the ACTUAL answer targets.
   */
  const scoredLines = lines.map((line, index) => {
    const expandedLine = expandStudyAliases(line.text);

    const lineTokens = significantTokens(expandedLine);

    let bestTargetScore = 0;
    let bestColorIndex = studyPoints[0]?.colorIndex ?? 0;

    for (const target of studyTargets) {
      const primaryShared = sharedTokenCount(
        lineTokens,
        target.primaryTokens,
      );

      const supportingShared = sharedTokenCount(
        lineTokens,
        target.supportingTokens,
      );

      const primaryCoverage =
        primaryShared /
        Math.max(
          1,
          Math.min(lineTokens.size, 12),
        );

      const supportingCoverage =
        supportingShared /
        Math.max(
          1,
          Math.min(lineTokens.size, 12),
        );

      const targetCoverage =
        primaryShared /
        Math.max(
          1,
          Math.min(target.primaryTokens.size, 18),
        );

      const phraseBoost =
        containsUsefulPhrase(
          normalizeText(expandedLine),
          target.primaryText,
        )
          ? 1.1
          : 0;

      /*
       * Primary study-point wording is deliberately much more
       * important than explanatory wording.
       */
      const score =
        primaryCoverage * 2.4 +
        targetCoverage * 0.8 +
        supportingCoverage * 0.3 +
        phraseBoost;

      if (score > bestTargetScore) {
        bestTargetScore = score;
        bestColorIndex = target.point.colorIndex;
      }
    }

    const evidenceShared = sharedTokenCount(
      lineTokens,
      evidenceTokens,
    );

    const evidenceCoverage =
      evidenceShared /
      Math.max(
        1,
        Math.min(lineTokens.size, 14),
      );

    const normalizedLine = normalizeText(
      expandedLine,
    );

    const exactEvidenceLine =
      normalizedLine.length >= 8 &&
      evidenceNormalized.includes(normalizedLine);

    return {
      index,
      line,
      lineTokens,
      targetScore: bestTargetScore,
      evidenceCoverage,
      evidenceShared,
      exactEvidenceLine,
      colorIndex: bestColorIndex,
    };
  });

  /*
   * ---------------------------------------------------------
   * 1. Find answer-target seeds.
   * ---------------------------------------------------------
   *
   * These are the lines that directly correspond to something
   * the learner was expected to say.
   */

  const seedIndices = new Set<number>();

  for (const candidate of scoredLines) {
    if (candidate.lineTokens.size === 0) {
      continue;
    }

    const grounded =
      candidate.exactEvidenceLine ||
      candidate.evidenceShared >= 1;

    const directlyUseful =
      candidate.targetScore >= 0.62;

    if (grounded && directlyUseful) {
      seedIndices.add(candidate.index);
    }
  }

  if (seedIndices.size === 0) {
    /*
     * Conservative fallback:
     * choose only the strongest answer-related lines, rather
     * than reverting to painting the whole evidence chunk.
     */
    scoredLines
      .filter(
        (candidate) =>
          candidate.evidenceShared >= 1 &&
          candidate.targetScore > 0,
      )
      .sort(
        (a, b) =>
          b.targetScore - a.targetScore,
      )
      .slice(0, Math.max(1, studyPoints.length))
      .forEach((candidate) => {
        seedIndices.add(candidate.index);
      });
  }

  if (seedIndices.size === 0) {
    return;
  }

  /*
   * ---------------------------------------------------------
   * 2. Expand each seed into its COMPLETE LOCAL CONCEPT BLOCK.
   * ---------------------------------------------------------
   *
   * A concept in slides frequently looks like:
   *
   * Reinforcement learning
   *   - explanation line
   *   - explanation line
   *
   * We therefore include neighbouring lines when they remain
   * supported by the stored evidence.
   *
   * Expansion STOPS when we hit another short unrelated heading.
   */

  const selectedIndices = new Set<number>(
    seedIndices,
  );

  for (const seedIndex of seedIndices) {
    /*
     * Up to four visual lines in either direction is enough
     * to capture a compact slide concept without swallowing
     * unrelated sections elsewhere on the page.
     */
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance <= 4; distance += 1) {
        const index =
          seedIndex + direction * distance;

        if (
          index < 0 ||
          index >= scoredLines.length
        ) {
          break;
        }

        const candidate = scoredLines[index];

        if (candidate.lineTokens.size === 0) {
          continue;
        }

        /*
         * A short heading with no answer-target relationship
         * marks the start of a different concept.
         *
         * Example:
         *
         *   Unsupervised Learning
         *   Reinforcement Learning
         *
         * We must not cross from one into the other.
         */
        if (
          looksLikeUnrelatedConceptHeading(
            candidate,
          )
        ) {
          break;
        }

        const evidenceSupported =
          candidate.exactEvidenceLine ||
          candidate.evidenceCoverage >= 0.2 ||
          candidate.evidenceShared >= 2;

        const answerSupported =
          candidate.targetScore >= 0.18;

        /*
         * Strong evidence support is enough for a continuation
         * line once we're already inside a relevant concept.
         *
         * This is the key change that lets the complete
         * explanation underneath a heading become highlighted.
         */
        if (
          evidenceSupported ||
          answerSupported
        ) {
          selectedIndices.add(index);
          continue;
        }

        /*
         * Stop when we've left the locally relevant block.
         */
        if (distance >= 2) {
          break;
        }
      }
    }
  }

  /*
   * ---------------------------------------------------------
   * 3. Also capture diagram vocabulary required by the answer.
   * ---------------------------------------------------------
   *
   * Diagram labels such as:
   *
   * agent / environment / action / reward / new state
   *
   * might be physically far from the text paragraph and cannot
   * be reached by neighbour expansion. If they directly match
   * the study targets, include them independently.
   */

  for (const candidate of scoredLines) {
    if (
      candidate.targetScore >= 0.72 &&
      (
        candidate.exactEvidenceLine ||
        candidate.evidenceShared >= 1
      )
    ) {
      selectedIndices.add(candidate.index);
    }
  }

  /*
   * ---------------------------------------------------------
   * 4. Render.
   * ---------------------------------------------------------
   */

  const ordered = Array.from(
    selectedIndices,
  ).sort((a, b) => a - b);

  for (const index of ordered) {
    const candidate = scoredLines[index];

    const colorIndex =
      bestStudyPointColorForLine(
        candidate.line,
        studyPoints,
      );

    highlightLine(
      overlay,
      viewport,
      candidate.line,
      colorIndex,
    );
  }
}

function expandStudyAliases(value: string): string {
  /*
   * Short educational abbreviations such as "RL" are normally
   * removed by significantTokens() because two-letter tokens
   * are deliberately ignored.
   *
   * Expand the ones needed by the source material before
   * tokenization.
   */
  return value
    .replace(
      /\bRL\b/gi,
      "reinforcement learning",
    )
    .replace(
      /\bMDP\b/gi,
      "markov decision process",
    );
}

function looksLikeUnrelatedConceptHeading(
  candidate: {
    line: LineGroup;
    lineTokens: Set<string>;
    targetScore: number;
    evidenceShared: number;
  },
): boolean {
  const text = candidate.line.text.trim();

  const wordCount = text
    .split(/\s+/)
    .filter(Boolean)
    .length;

  /*
   * Slide headings and subsection labels tend to be short.
   *
   * We only treat them as boundaries when they have virtually
   * no relationship to what the learner is expected to answer.
   */
  return (
    wordCount <= 6 &&
    candidate.lineTokens.size <= 6 &&
    candidate.targetScore < 0.12 &&
    candidate.evidenceShared <= 2
  );
}

function sharedTokenCount(
  first: Set<string>,
  second: Set<string>,
): number {
  let count = 0;

  for (const token of first) {
    if (second.has(token)) {
      count += 1;
    }
  }

  return count;
}

function containsSharedEvidencePhrase(
  line: string,
  evidence: string,
): boolean {
  const words = line
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 4 &&
        !STOP_WORDS.has(word),
    );

  /*
   * Long phrases are strongest, but three-word phrases are
   * useful for short PowerPoint bullets.
   */
  for (let size = 6; size >= 3; size -= 1) {
    if (words.length < size) {
      continue;
    }

    for (
      let index = 0;
      index <= words.length - size;
      index += 1
    ) {
      const phrase = words
        .slice(index, index + size)
        .join(" ");

      if (evidence.includes(phrase)) {
        return true;
      }
    }
  }

  return false;
}

function bestStudyPointColorForLine(
  line: LineGroup,
  studyPoints: MaterialStudyPoint[],
): number {
  const lineTokens = significantTokens(line.text);

  let bestColor = studyPoints[0]?.colorIndex ?? 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const point of studyPoints) {
    const pointText = [
      point.title,
      point.explanation,
      point.searchText,
    ].join(" ");

    const pointTokens =
      significantTokens(pointText);

    const shared = sharedTokenCount(
      lineTokens,
      pointTokens,
    );

    const lineCoverage =
      shared /
      Math.max(
        1,
        Math.min(lineTokens.size, 12),
      );

    const pointCoverage =
      shared /
      Math.max(
        1,
        Math.min(pointTokens.size, 20),
      );

    const phraseBoost = containsUsefulPhrase(
      line.normalizedText,
      point.searchText,
    )
      ? 0.8
      : 0;

    const score =
      lineCoverage * 1.4 +
      pointCoverage * 0.4 +
      phraseBoost;

    if (score > bestScore) {
      bestScore = score;
      bestColor = point.colorIndex;
    }
  }

  return bestColor;
}

function buildLines(
  textItems: TextItem[],

  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): LineGroup[] {
  const positioned = textItems
    .filter((item) => item.str.trim().length > 0)
    .map((item) => {
      const transformed = multiplyTransforms(
        viewport.transform,

        item.transform,
      );

      return {
        item,

        x: transformed[4],

        y: transformed[5],
      };
    })
    .sort((a, b) => {
      const yDiff = a.y - b.y;

      if (Math.abs(yDiff) > 4) {
        return yDiff;
      }

      return a.x - b.x;
    });

  const lines: LineGroup[] = [];

  for (const positionedItem of positioned) {
    const existing = lines.find(
      (line) => Math.abs(line.y - positionedItem.y) <= 4,
    );

    if (existing) {
      existing.items.push(positionedItem.item);

      continue;
    }

    lines.push({
      items: [positionedItem.item],

      text: "",

      normalizedText: "",

      y: positionedItem.y,
    });
  }

  for (const line of lines) {
    line.items.sort((a, b) => {
      const at = multiplyTransforms(viewport.transform, a.transform);

      const bt = multiplyTransforms(viewport.transform, b.transform);

      return at[4] - bt[4];
    });

    line.text = line.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    line.normalizedText = normalizeText(line.text);
  }

  return lines;
}

function highlightLine(
  overlay: HTMLDivElement,

  viewport: ReturnType<PDFPageProxy["getViewport"]>,

  line: LineGroup,

  colorIndex: number,
) {
  for (const item of line.items) {
    addHighlightRect(
      overlay,

      viewport,

      item,

      colorIndex,
    );
  }
}

function addHighlightRect(
  overlay: HTMLDivElement,

  viewport: ReturnType<PDFPageProxy["getViewport"]>,

  item: TextItem,

  colorIndex: number,
) {
  const transformed = multiplyTransforms(
    viewport.transform,

    item.transform,
  );

  const x = transformed[4];

  const baselineY = transformed[5];

  const fontHeight = Math.max(Math.hypot(transformed[2], transformed[3]), 5);

  const width = Math.max(Math.abs(item.width * viewport.scale), 3);

  const rectangle = document.createElement("div");

  rectangle.className = "study-pdf-highlight";

  rectangle.style.left = `${x - 2}px`;

  rectangle.style.top = `${baselineY - fontHeight - 1}px`;

  rectangle.style.width = `${width + 4}px`;

  rectangle.style.height = `${fontHeight * 1.08 + 2}px`;

  rectangle.style.background =
    HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length];

  overlay.appendChild(rectangle);
}

function significantTokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function tokenOverlap(
  query: Set<string>,

  candidate: Set<string>,
): number {
  if (query.size === 0 || candidate.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const token of query) {
    if (candidate.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(1, Math.min(query.size, 10));
}

function containsUsefulPhrase(
  line: string,

  query: string,
): boolean {
  const words = normalizeText(query)
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));

  for (let size = 5; size >= 3; size -= 1) {
    if (words.length < size) {
      continue;
    }

    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");

      if (line.includes(phrase)) {
        return true;
      }
    }
  }

  return false;
}

function looksLikeFrontMatter(value: string): boolean {
  const normalized = normalizeText(value);

  if (!normalized) {
    return true;
  }

  if (
    normalized.includes("springerlink") ||
    normalized.includes("polytechnique") ||
    normalized.includes("hopital") ||
    normalized.includes("hospital")
  ) {
    return true;
  }

  const digitCount = (value.match(/\d/g) ?? []).length;

  const letterCount = (value.match(/[A-Za-z]/g) ?? []).length;

  return digitCount >= 5 && digitCount > letterCount * 0.25;
}

function stripFrontMatter(value: string): string {
  const cleaned = cleanEvidenceText(value);

  const abstractMatch = cleaned.match(/\babstract\b[\s:.-]*(.*)$/i);

  if (abstractMatch?.[1]) {
    return abstractMatch[1].trim();
  }

  return cleaned;
}

function cleanEvidenceText(value: string): string {
  return value
    .replace(/<sup>(.*?)<\/sup>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#`~]/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function multiplyTransforms(
  first: number[],

  second: number[],
): [number, number, number, number, number, number] {
  return [
    first[0] * second[0] + first[2] * second[1],

    first[1] * second[0] + first[3] * second[1],

    first[0] * second[2] + first[2] * second[3],

    first[1] * second[2] + first[3] * second[3],

    first[0] * second[4] + first[2] * second[5] + first[4],

    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}
