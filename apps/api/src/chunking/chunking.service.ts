import { Injectable } from '@nestjs/common';

export type GeneratedChunk = {
  chunkIndex: number;
  text: string;
  charCount: number;
  wordCount: number;

  metadata: {
    strategy: 'markdown-structure-aware-v1';
    maxOverlapWords: number;
    headings: string[];
  };
};

@Injectable()
export class ChunkingService {
  private readonly targetWords = 220;

  private readonly minWordsBeforeSplit = 120;

  private readonly maxBlockWords = 300;

  private readonly overlapWords = 35;

  chunkText(text: string): GeneratedChunk[] {
    const normalized = this.normalizeText(text);

    if (!normalized) {
      return [];
    }

    const initialBlocks = this.extractBlocks(normalized);

    const blocks = initialBlocks.flatMap((block) =>
      this.splitOversizedBlock(block),
    );

    if (blocks.length === 0) {
      return [];
    }

    const chunkTexts: string[] = [];

    let currentParts: string[] = [];

    let currentWordCount = 0;

    for (const block of blocks) {
      const blockWordCount = this.countWords(block);

      const shouldSplit =
        currentParts.length > 0 &&
        currentWordCount >= this.minWordsBeforeSplit &&
        currentWordCount + blockWordCount > this.targetWords;

      if (shouldSplit) {
        const completedChunk = this.joinParts(currentParts);

        chunkTexts.push(completedChunk);

        const overlap = this.createOverlap(completedChunk, blockWordCount);

        currentParts = overlap ? [overlap, block] : [block];

        currentWordCount = this.countWords(this.joinParts(currentParts));

        continue;
      }

      currentParts.push(block);

      currentWordCount += blockWordCount;
    }

    if (currentParts.length > 0) {
      chunkTexts.push(this.joinParts(currentParts));
    }

    return chunkTexts
      .filter((chunk) => chunk.trim())
      .map((chunk, chunkIndex) => this.createChunk(chunk, chunkIndex));
  }

  private extractBlocks(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);
  }

  private splitOversizedBlock(block: string): string[] {
    const wordCount = this.countWords(block);

    if (wordCount <= this.maxBlockWords) {
      return [block];
    }

    /*
     * Markdown tables and lists usually use
     * line boundaries as meaningful structure.
     */
    if (this.looksLikeTable(block) || this.looksLikeList(block)) {
      return this.splitByLines(block);
    }

    /*
     * Normal prose is split using sentence
     * boundaries first.
     */
    return this.splitBySentences(block);
  }

  private splitBySentences(block: string): string[] {
    const sentences = block
      .split(/(?<=[.!?])\s+(?=[A-Z0-9#*])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      return this.splitByWords(block);
    }

    const segments: string[] = [];

    let current: string[] = [];

    let currentWords = 0;

    for (const sentence of sentences) {
      const sentenceWords = this.countWords(sentence);

      if (sentenceWords > this.maxBlockWords) {
        if (current.length > 0) {
          segments.push(current.join(' '));

          current = [];
          currentWords = 0;
        }

        segments.push(...this.splitByWords(sentence));

        continue;
      }

      if (
        current.length > 0 &&
        currentWords + sentenceWords > this.targetWords
      ) {
        segments.push(current.join(' '));

        current = [];
        currentWords = 0;
      }

      current.push(sentence);

      currentWords += sentenceWords;
    }

    if (current.length > 0) {
      segments.push(current.join(' '));
    }

    return segments;
  }

  private splitByLines(block: string): string[] {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim());

    const segments: string[] = [];

    let current: string[] = [];

    let currentWords = 0;

    for (const line of lines) {
      const lineWords = this.countWords(line);

      if (current.length > 0 && currentWords + lineWords > this.targetWords) {
        segments.push(current.join('\n'));

        current = [];
        currentWords = 0;
      }

      /*
       * Extremely long individual lines still
       * need a safe fallback.
       */
      if (lineWords > this.maxBlockWords) {
        if (current.length > 0) {
          segments.push(current.join('\n'));

          current = [];
          currentWords = 0;
        }

        segments.push(...this.splitByWords(line));

        continue;
      }

      current.push(line);

      currentWords += lineWords;
    }

    if (current.length > 0) {
      segments.push(current.join('\n'));
    }

    return segments;
  }

  private splitByWords(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean);

    const segments: string[] = [];

    for (let start = 0; start < words.length; start += this.targetWords) {
      segments.push(words.slice(start, start + this.targetWords).join(' '));
    }

    return segments;
  }

  private createOverlap(
    previousChunk: string,
    nextBlockWordCount: number,
  ): string {
    /*
     * Avoid creating an unnecessarily large
     * next chunk when the incoming block is
     * already large.
     */
    const availableOverlap = Math.max(
      0,
      Math.min(this.overlapWords, this.maxBlockWords - nextBlockWordCount),
    );

    if (availableOverlap === 0) {
      return '';
    }

    const words = previousChunk.split(/\s+/).filter(Boolean);

    return words.slice(-availableOverlap).join(' ');
  }

  private createChunk(text: string, chunkIndex: number): GeneratedChunk {
    const cleanedText = text.trim();

    return {
      chunkIndex,

      text: cleanedText,

      charCount: cleanedText.length,

      wordCount: this.countWords(cleanedText),

      metadata: {
        strategy: 'markdown-structure-aware-v1',

        maxOverlapWords: chunkIndex === 0 ? 0 : this.overlapWords,

        headings: this.extractHeadings(cleanedText),
      },
    };
  }

  private extractHeadings(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, '').trim());
  }

  private looksLikeTable(block: string): boolean {
    const lines = block.split('\n');

    const tableLines = lines.filter((line) => line.includes('|'));

    return tableLines.length >= 2;
  }

  private looksLikeList(block: string): boolean {
    const lines = block.split('\n');

    const listLines = lines.filter((line) =>
      /^\s*(?:[-*+]|\d+[.)])\s+/.test(line),
    );

    return listLines.length >= 2;
  }

  private joinParts(parts: string[]): string {
    return parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  private countWords(text: string): number {
    const trimmed = text.trim();

    if (!trimmed) {
      return 0;
    }

    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
