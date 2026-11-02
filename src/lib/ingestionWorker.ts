import {
  getDocumentChunkStats,
  getKnowledgeDocumentById,
  getUnembeddedChunks,
  stageDocumentChunks,
  updateChunkEmbedding,
  updateDocumentIngestionProgress,
} from '../db/repositories.ts';
import { db } from '../db/index.ts';
import { documents } from '../db/schema.ts';
import { and, eq, inArray } from 'drizzle-orm';
import { fetchWebDocument, extractStructuredWebContent } from './webScraper.ts';
import { chunkDocumentText } from './chunker.ts';
import { parseDocumentText } from './gemini.ts';
import { embedSingleTextWithRetry, classifyEmbeddingError, EmbeddingError, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './embeddings.ts';

// Track currently active ingestion jobs to prevent duplicate processing
const activeJobs = new Set<number>();

export interface IngestionOptions {
  targetStatus?: 'published' | 'stored' | 'in_review';
  resumeOnly?: boolean;
}

/**
 * Queue or dispatch an ingestion job asynchronously.
 * Does not block the HTTP response.
 */
export function queueIngestionJob(documentId: number, options?: IngestionOptions): void {
  // Use setImmediate to detach execution from current microtask/call-stack
  setImmediate(() => {
    processDocumentIngestion(documentId, options).catch((err) => {
      console.error(`[IngestionWorker] Unhandled error processing doc ${documentId}:`, err);
    });
  });
}

/**
 * Processes document ingestion step-by-step through a resumable state machine:
 * 1. FETCHING & EXTRACTING: Fetch URL / extract text, persist raw text.
 * 2. CHUNKING: Split text with overlap & boundary awareness, stage chunks in DB with embedding=null.
 * 3. EMBEDDING: Fetch unembedded chunks, generate embeddings in batches, update DB incrementally.
 * 4. STORED / PUBLISHED: Final verification. If all chunks succeed, mark stored/published.
 *
 * Failures preserve content and use permanent or retryable status according to their cause.
 */
export async function processDocumentIngestion(
  documentId: number,
  options?: IngestionOptions
): Promise<void> {
  if (activeJobs.has(documentId)) {
    console.log(`[IngestionWorker] Doc ${documentId} is already actively being processed.`);
    return;
  }

  activeJobs.add(documentId);
  console.log(`[IngestionWorker] Starting ingestion for document ID ${documentId}...`);

  try {
    const doc = await getKnowledgeDocumentById(documentId);
    if (!doc) {
      console.warn(`[IngestionWorker] Document ${documentId} not found in database.`);
      return;
    }

    let rawText = doc.rawText || '';
    let metadata: Record<string, any> = (doc.extractedMetadata as Record<string, any>) || {};

    // -------------------------------------------------------------------------
    // STAGE 1: Fetching & Text Extraction
    // -------------------------------------------------------------------------
    const stagedStats = await getDocumentChunkStats(documentId);
    if ((!rawText || rawText.trim().length === 0) && stagedStats.total === 0) {
      if (doc.docType === 'web_link') {
        if (!doc.sourceUrl) {
          throw new Error('Web link document is missing source URL.');
        }

        console.log(`[IngestionWorker] Fetching web content from ${doc.sourceUrl}...`);
        await updateDocumentIngestionProgress(documentId, {
          status: 'fetching',
          extractedMetadata: {
            ...metadata,
            stage: 'fetching',
            stageStartedAt: new Date().toISOString(),
          },
        });

        const fetchResult = await fetchWebDocument(doc.sourceUrl, { timeoutMs: 15000 });

        await updateDocumentIngestionProgress(documentId, {
          status: 'extracting',
          extractedMetadata: {
            ...metadata,
            stage: 'extracting',
            contentLength: fetchResult.html.length,
          },
        });

        const extracted = extractStructuredWebContent(
          fetchResult.html,
          doc.sourceUrl,
          fetchResult.finalUrl
        );

        rawText = extracted.extractedText;
        metadata = {
          ...metadata,
          stage: 'extracted',
          extractedTitle: extracted.title,
          finalUrl: extracted.finalUrl,
          characterCount: extracted.charCount,
          headings: (extracted.metadata?.headings || []).slice(0, 15),
          extractedAt: new Date().toISOString(),
        };

        await updateDocumentIngestionProgress(documentId, {
          rawText,
          extractedMetadata: metadata,
        });

        console.log(
          `[IngestionWorker] Extracted ${extracted.charCount} chars from ${doc.sourceUrl}`
        );
      } else if (doc.docType === 'pdf' || doc.fileDataBase64) {
        console.log(`[IngestionWorker] Extracting text from document base64/pdf...`);
        await updateDocumentIngestionProgress(documentId, {
          status: 'extracting',
          extractedMetadata: { ...metadata, stage: 'extracting' },
        });

        const parsed = await parseDocumentText({
          base64Data: doc.fileDataBase64 || undefined,
          mimeType: doc.mimeType || undefined,
        });

        rawText = parsed.extractedText;
        metadata = {
          ...metadata,
          stage: 'extracted',
          characterCount: rawText.length,
          extractedAt: new Date().toISOString(),
        };

        await updateDocumentIngestionProgress(documentId, {
          rawText,
          extractedMetadata: metadata,
        });
      }
    }

    if ((!rawText || rawText.trim().length === 0) && stagedStats.total === 0) {
      throw new Error('No readable text content could be extracted from this source.');
    }

    // -------------------------------------------------------------------------
    // STAGE 2: Chunking
    // -------------------------------------------------------------------------
    const existingStats = await getDocumentChunkStats(documentId);
    if (existingStats.total === 0) {
      console.log(`[IngestionWorker] Chunking document ${documentId}...`);
      await updateDocumentIngestionProgress(documentId, {
        status: 'chunking',
        extractedMetadata: { ...metadata, stage: 'chunking' },
      });

      const chunks = chunkDocumentText(rawText, {
        documentTitle: doc.title,
        sourceUrl: doc.sourceUrl || undefined,
        domain: doc.domain,
        chunkSize: 800,
        chunkOverlap: 150,
      });

      if (chunks.length === 0) {
        // Fallback: single chunk if text is brief
        chunks.push({
          chunkIndex: 0,
          pageNumber: 1,
          content: rawText.slice(0, 1500),
          charCount: Math.min(rawText.length, 1500),
          metadata: {
            documentTitle: doc.title,
            sourceUrl: doc.sourceUrl || undefined,
            domain: doc.domain,
          },
        });
      }

      await stageDocumentChunks(documentId, chunks);
      metadata = {
        ...metadata,
        stage: 'chunked',
        totalChunks: chunks.length,
        chunkedAt: new Date().toISOString(),
      };
      await updateDocumentIngestionProgress(documentId, { extractedMetadata: metadata });
      console.log(`[IngestionWorker] Staged ${chunks.length} chunks for document ${documentId}`);
    }

    // -------------------------------------------------------------------------
    // STAGE 3: Embedding (Incremental & Resumable)
    // -------------------------------------------------------------------------
    const unembedded = await getUnembeddedChunks(documentId);
    const chunkStats = await getDocumentChunkStats(documentId);
    if (chunkStats.embedded > 0 && (metadata.embeddingModel !== EMBEDDING_MODEL || metadata.embeddingDimensions !== EMBEDDING_DIMENSIONS)) {
      throw new EmbeddingError('Existing vectors have unknown or incompatible provenance. Re-embedding migration is required before resuming.', null, 'MODEL_MISMATCH', 'MODEL_CONFIGURATION_ERROR', false);
    }
    metadata = { ...metadata, embeddingModel: EMBEDDING_MODEL, embeddingDimensions: EMBEDDING_DIMENSIONS, lastError: null, embeddingError: null };


    if (unembedded.length > 0) {
      console.log(
        `[IngestionWorker] Generating embeddings for ${unembedded.length} unembedded chunks (out of ${chunkStats.total})...`
      );

      await updateDocumentIngestionProgress(documentId, {
        status: 'embedding',
        extractedMetadata: {
          ...metadata,
          stage: 'embedding',
          totalChunks: chunkStats.total,
          embeddedChunks: chunkStats.embedded,
        },
      });

      // Embed with controlled concurrency (3 parallel requests) to avoid rate limits
      const concurrency = 3;
      let completedInRun = chunkStats.embedded;

      for (let i = 0; i < unembedded.length; i += concurrency) {
        const batch = unembedded.slice(i, i + concurrency);
        const outcomes = await Promise.allSettled(batch.map(async (chunk) => {
          const vector = await embedSingleTextWithRetry(chunk.content, 4);
          await updateChunkEmbedding(chunk.id, vector);
          completedInRun++;
        }));
        const failure = outcomes.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;

        // Update progress in database after each batch
        await updateDocumentIngestionProgress(documentId, {
          extractedMetadata: {
            ...metadata,
            stage: 'embedding',
            totalChunks: chunkStats.total,
            embeddedChunks: completedInRun,
          },
        });
      }
    }

    // -------------------------------------------------------------------------
    // STAGE 4: Final Verification & Status Update
    // -------------------------------------------------------------------------
    const finalStats = await getDocumentChunkStats(documentId);
    console.log(
      `[IngestionWorker] Ingestion status check for doc ${documentId}: ${finalStats.embedded}/${finalStats.total} embedded`
    );

    if (finalStats.total > 0 && finalStats.failed === 0) {
      // 100% complete!
      const target =
        options?.targetStatus ||
        'stored';
      const finalStatus = target === 'in_review' ? 'in_review' : 'stored';

      await updateDocumentIngestionProgress(documentId, {
        status: finalStatus,
        publishedAt: null,
        extractedMetadata: {
          ...metadata,
          stage: 'completed',
          totalChunks: finalStats.total,
          embeddedChunks: finalStats.embedded,
          failedChunks: 0,
          lastError: null,
          completedAt: new Date().toISOString(),
        },
      });
      console.log(
        `[IngestionWorker] Document ${documentId} successfully fully embedded and marked as ${finalStatus}!`
      );
    } else {
      // Some chunks failed to embed
      const errMsg = `${finalStats.failed} of ${finalStats.total} chunks remain unembedded. Stored content and staged chunks have been preserved.`;
      console.warn(`[IngestionWorker] Document ${documentId} partially completed: ${errMsg}`);

      await updateDocumentIngestionProgress(documentId, {
        status: 'failed_retryable',
        extractedMetadata: {
          ...metadata,
          stage: 'embedding_incomplete',
          totalChunks: finalStats.total,
          embeddedChunks: finalStats.embedded,
          failedChunks: finalStats.failed,
          lastError: errMsg,
          failedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`[IngestionWorker] Ingestion failed for doc ${documentId}:`, errorMsg);

    const isSsrfOrSecurity =
      /SSRF|Invalid protocol|Private IP|Loopback|blocked|not allowed/i.test(errorMsg);
    const structured = classifyEmbeddingError(error);

    const failureStatus = isSsrfOrSecurity || !structured.retryable ? 'failed_permanent' : 'failed_retryable';
    const publicMessage = structured.category === 'MODEL_CONFIGURATION_ERROR'
      ? 'Embedding model unavailable or misconfigured. Please verify your Gemini model configuration. Your extracted document and staged chunks have been preserved.'
      : `${structured.category}: ${structured.message}. Stored content and staged chunks have been preserved.`;


    const currentDoc = await getKnowledgeDocumentById(documentId).catch(() => null);
    const currentMeta = (currentDoc?.extractedMetadata as Record<string, any>) || {};
    const failureStats = await getDocumentChunkStats(documentId).catch(() => null);

    await updateDocumentIngestionProgress(documentId, {
      status: failureStatus,
      extractedMetadata: {
        ...currentMeta,
        lastError: publicMessage,
        embeddingError: structured.toJSON(),
        ...(failureStats ? { totalChunks: failureStats.total, embeddedChunks: failureStats.embedded, failedChunks: failureStats.failed } : {}),
        failedAt: new Date().toISOString(),
      },
    });
  } finally {
    activeJobs.delete(documentId);
  }
}

/**
 * Recovers pending or interrupted ingestion jobs on server startup.
 * Looks for documents in intermediate statuses ('fetching', 'extracting', 'chunking', 'embedding').
 */
export async function resumePendingIngestionJobs(): Promise<void> {
  try {
    const interruptedDocs = await db
      .select({ id: documents.id, status: documents.status, title: documents.title })
      .from(documents)
      .where(
        and(
          eq(documents.scope, 'knowledge_base'),
          inArray(documents.status, ['fetching', 'extracting', 'chunking', 'embedding'])
        )
      );

    if (interruptedDocs.length > 0) {
      console.log(
        `[IngestionWorker] Found ${interruptedDocs.length} interrupted KB documents from previous run. Resuming in background...`
      );
      for (const d of interruptedDocs) {
        queueIngestionJob(d.id, { resumeOnly: true });
      }
    }
  } catch (error) {
    console.warn('[IngestionWorker] Failed to check for interrupted ingestion jobs:', error);
  }
}
