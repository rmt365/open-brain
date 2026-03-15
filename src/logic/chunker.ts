// Open Brain - Text Chunker
// Splits long text into overlapping chunks for embedding.
// Uses a sliding window with ~15-20% overlap to reduce meaning loss at boundaries.

export interface ChunkOptions {
  /** Target chunk size in characters (default: 1000) */
  chunkSize?: number;
  /** Overlap between chunks as a fraction 0-1 (default: 0.15 = 15%) */
  overlapFraction?: number;
}

export interface TextChunk {
  /** Zero-based chunk index */
  index: number;
  /** The chunk text */
  text: string;
  /** Character offset in the original text */
  startOffset: number;
  /** Character end offset in the original text */
  endOffset: number;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP_FRACTION = 0.15;

/**
 * Split text into overlapping chunks using a sliding window.
 *
 * Strategy:
 * 1. If text fits in a single chunk, return it as-is
 * 2. Otherwise, slide a window with overlap, breaking at sentence/paragraph boundaries
 * 3. Each chunk overlaps with the previous by ~15-20% to preserve cross-boundary meaning
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlapFraction = options.overlapFraction || DEFAULT_OVERLAP_FRACTION;

  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  // Short text — single chunk
  if (trimmed.length <= chunkSize) {
    return [{
      index: 0,
      text: trimmed,
      startOffset: 0,
      endOffset: trimmed.length,
    }];
  }

  const overlapSize = Math.floor(chunkSize * overlapFraction);
  const stepSize = chunkSize - overlapSize;
  const chunks: TextChunk[] = [];
  let position = 0;
  let index = 0;

  while (position < trimmed.length) {
    let end = Math.min(position + chunkSize, trimmed.length);

    // If not at the end, try to break at a natural boundary
    if (end < trimmed.length) {
      end = findBreakPoint(trimmed, position, end);
    }

    const chunkText = trimmed.slice(position, end).trim();
    if (chunkText.length > 0) {
      chunks.push({
        index,
        text: chunkText,
        startOffset: position,
        endOffset: end,
      });
      index++;
    }

    // Advance by step size, but use actual end position minus overlap
    const nextPosition = end - overlapSize;

    // Prevent infinite loop if we can't advance
    if (nextPosition <= position) {
      position = end;
    } else {
      position = nextPosition;
    }
  }

  return chunks;
}

/**
 * Find a natural break point near the target end position.
 * Prefers paragraph breaks > sentence endings > clause boundaries > word boundaries.
 * Searches backwards from the target position within a reasonable window.
 */
function findBreakPoint(text: string, start: number, targetEnd: number): number {
  // Search window: look back up to 20% of chunk size for a good break
  const searchStart = Math.max(start + Math.floor((targetEnd - start) * 0.8), start);
  const searchRegion = text.slice(searchStart, targetEnd);

  // Priority 1: Paragraph break (double newline)
  const paraBreak = searchRegion.lastIndexOf("\n\n");
  if (paraBreak !== -1) {
    return searchStart + paraBreak + 2;
  }

  // Priority 2: Single newline
  const newlineBreak = searchRegion.lastIndexOf("\n");
  if (newlineBreak !== -1) {
    return searchStart + newlineBreak + 1;
  }

  // Priority 3: Sentence ending (. ! ?)
  const sentenceMatch = searchRegion.match(/.*[.!?]\s/s);
  if (sentenceMatch) {
    return searchStart + sentenceMatch[0].length;
  }

  // Priority 4: Clause boundary (, ; :)
  const clauseMatch = searchRegion.match(/.*[,;:]\s/s);
  if (clauseMatch) {
    return searchStart + clauseMatch[0].length;
  }

  // Priority 5: Word boundary (space)
  const spaceBreak = searchRegion.lastIndexOf(" ");
  if (spaceBreak !== -1) {
    return searchStart + spaceBreak + 1;
  }

  // Fallback: break at target position
  return targetEnd;
}

/**
 * Determine if a text needs chunking (is longer than the chunk size threshold).
 */
export function needsChunking(text: string, chunkSize: number = DEFAULT_CHUNK_SIZE): boolean {
  return text.trim().length > chunkSize;
}
