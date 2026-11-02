export interface DocumentChunkItem {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  charCount: number;
  headingContext?: string;
  metadata: {
    documentTitle: string;
    sourceUrl?: string;
    domain?: string;
  };
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  documentTitle: string;
  sourceUrl?: string;
  domain?: string;
}

export function chunkDocumentText(text: string, options: ChunkingOptions): DocumentChunkItem[] {
  const chunkSize = options.chunkSize || 800;
  const chunkOverlap = options.chunkOverlap || 150;
  const cleanText = text.trim();

  if (!cleanText) return [];

  // If text is smaller than chunk size, return single chunk
  if (cleanText.length <= chunkSize) {
    return [
      {
        chunkIndex: 0,
        pageNumber: 1,
        content: cleanText,
        charCount: cleanText.length,
        metadata: {
          documentTitle: options.documentTitle,
          sourceUrl: options.sourceUrl,
          domain: options.domain,
        },
      },
    ];
  }

  const chunks: DocumentChunkItem[] = [];
  const paragraphs = cleanText.split(/\n{2,}/);

  let currentChunk = '';
  let currentHeading = '';
  let chunkIndex = 0;
  let pageNumber = 1;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // Track active heading for contextual grounding
    if (trimmed.startsWith('#')) {
      currentHeading = trimmed.replace(/^#+\s*/, '').slice(0, 100);
    }

    // If single paragraph is larger than chunk size, break by sentences
    if (trimmed.length > chunkSize) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmed];

      for (const sentence of sentences) {
        const sTrimmed = sentence.trim();
        if (!sTrimmed) continue;

        if (currentChunk.length + sTrimmed.length + 1 > chunkSize && currentChunk.length > 0) {
          chunks.push({
            chunkIndex: chunkIndex++,
            pageNumber: Math.max(1, Math.floor(chunkIndex / 3) + 1),
            content: currentChunk.trim(),
            charCount: currentChunk.length,
            headingContext: currentHeading || undefined,
            metadata: {
              documentTitle: options.documentTitle,
              sourceUrl: options.sourceUrl,
              domain: options.domain,
            },
          });

          // Retain overlap from end of currentChunk
          const overlapText = currentChunk.slice(-chunkOverlap);
          currentChunk = overlapText + ' ' + sTrimmed;
        } else {
          currentChunk = currentChunk ? `${currentChunk} ${sTrimmed}` : sTrimmed;
        }
      }
    } else {
      if (currentChunk.length + trimmed.length + 2 > chunkSize && currentChunk.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          pageNumber: Math.max(1, Math.floor(chunkIndex / 3) + 1),
          content: currentChunk.trim(),
          charCount: currentChunk.length,
          headingContext: currentHeading || undefined,
          metadata: {
            documentTitle: options.documentTitle,
            sourceUrl: options.sourceUrl,
            domain: options.domain,
          },
        });

        // Retain overlap from end of currentChunk
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + '\n\n' + trimmed;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      chunkIndex: chunkIndex++,
      pageNumber: Math.max(1, Math.floor(chunkIndex / 3) + 1),
      content: currentChunk.trim(),
      charCount: currentChunk.length,
      headingContext: currentHeading || undefined,
      metadata: {
        documentTitle: options.documentTitle,
        sourceUrl: options.sourceUrl,
        domain: options.domain,
      },
    });
  }

  return chunks;
}

