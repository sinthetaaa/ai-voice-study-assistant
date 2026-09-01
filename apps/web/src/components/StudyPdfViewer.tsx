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
}: StudyPdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(initialPage || 1);

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

        if (!cancelled) {
          setPdf(loadedPdf);

          setCurrentPage(
            Math.min(Math.max(initialPage || 1, 1), loadedPdf.numPages),
          );
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
  }, [fileUrl, initialPage]);

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

    const target = Math.min(Math.max(initialPage || 1, 1), pdf.numPages);

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
  }, [pdf, initialPage, zoom]);

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
          const pageEvidence = evidenceSources.filter(
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

  if (studyPoints.length === 0 || textItems.length === 0) {
    return;
  }

  const lines = buildLines(textItems, viewport);

  if (lines.length === 0) {
    return;
  }

  /*
   * Prefer actual body material.
   * If an Abstract exists, title/authors are discarded.
   */
  const abstractIndex = lines.findIndex((line) =>
    normalizeText(line.text).startsWith("abstract"),
  );

  const bodyLines =
    abstractIndex >= 0
      ? lines.slice(abstractIndex)
      : lines.filter((line) => !looksLikeFrontMatter(line.text));

  if (bodyLines.length === 0) {
    return;
  }

  const pageContext = evidenceSources
    .map((source) => stripFrontMatter(source.excerpt))
    .join(" ");

  const contextTokens = significantTokens(pageContext);

  /*
   * IMPORTANT:
   *
   * One line is assigned primarily to one study point.
   *
   * Previously the first point could claim every strong
   * line, meaning yellow appeared everywhere while violet
   * and cyan never received their own passages.
   */
  const usedPrimaryLines = new Set<number>();

  let highlightCount = 0;

  for (const point of studyPoints) {
    const queryTokens = significantTokens(
      [point.title, point.explanation, point.searchText].join(" "),
    );

    if (queryTokens.size === 0) {
      continue;
    }

    const candidates = bodyLines
      .map((line, index) => {
        const lineTokens = significantTokens(line.text);

        const pointOverlap = tokenOverlap(queryTokens, lineTokens);

        const sourceOverlap = tokenOverlap(contextTokens, lineTokens);

        const phraseBoost = containsUsefulPhrase(
          line.normalizedText,
          point.searchText,
        )
          ? 1.4
          : 0;

        return {
          index,

          line,

          pointOverlap,

          sourceOverlap,

          score: pointOverlap * 4 + sourceOverlap * 1.15 + phraseBoost,
        };
      })
      /*
       * It still has to belong to the historical
       * evidence context. We do not color arbitrary text
       * just to force all three colors to appear.
       */
      .filter(
        (candidate) =>
          candidate.pointOverlap >= 0.08 || candidate.sourceOverlap >= 0.1,
      )
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      continue;
    }

    /*
     * Prefer a line that no earlier study point owns.
     */
    let selected = candidates.find(
      (candidate) =>
        !usedPrimaryLines.has(candidate.index) && candidate.score >= 0.45,
    );

    /*
     * If two analysis points are semantically very close,
     * use another historically-supported line on the same
     * evidence page rather than painting the first line twice.
     */
    if (!selected) {
      selected = candidates.find(
        (candidate) =>
          !usedPrimaryLines.has(candidate.index) &&
          candidate.sourceOverlap >= 0.08,
      );
    }

    /*
     * Last resort: use the strongest genuine match.
     * Better to show a valid repeated concept than an
     * unrelated colored sentence.
     */
    if (!selected) {
      selected = candidates[0];
    }

    if (!selected) {
      continue;
    }

    usedPrimaryLines.add(selected.index);

    highlightLine(overlay, viewport, selected.line, point.colorIndex);

    highlightCount += 1;

    /*
     * Also include one continuation line when it belongs
     * to the same source context. This gives the learner
     * enough text to actually study.
     */
    const nextIndex = selected.index + 1;

    if (nextIndex < bodyLines.length) {
      const nextLine = bodyLines[nextIndex];

      const nextContextOverlap = tokenOverlap(
        contextTokens,
        significantTokens(nextLine.text),
      );

      if (nextContextOverlap >= 0.08) {
        highlightLine(overlay, viewport, nextLine, point.colorIndex);
      }
    }
  }

  /*
   * If the Answer Analysis wording differs heavily from
   * the PDF text, fall back to historical evidence lines.
   */
  if (highlightCount === 0) {
    const fallback = bodyLines
      .map((line, index) => ({
        index,

        line,

        score: tokenOverlap(contextTokens, significantTokens(line.text)),
      }))
      .filter((candidate) => candidate.score >= 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(3, studyPoints.length));

    fallback.forEach((candidate, index) => {
      highlightLine(
        overlay,
        viewport,
        candidate.line,
        studyPoints[index]?.colorIndex ?? index % 3,
      );
    });
  }
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
