import { GoogleGenAI } from '@google/genai';
export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;
export type ErrorCategory = 'MODEL_CONFIGURATION_ERROR' | 'AI_RATE_LIMIT' | 'AI_SERVICE_UNAVAILABLE' | 'AI_REQUEST_TIMEOUT' | 'NETWORK_ERROR' | 'DATABASE_ERROR';
export class EmbeddingError extends Error {
  constructor(message: string, public httpStatus: number | null, public geminiCode: string,
    public category: ErrorCategory, public retryable: boolean, public model = EMBEDDING_MODEL) { super(message); }
  toJSON() { return { message: this.message, httpStatus: this.httpStatus, geminiCode: this.geminiCode,
    category: this.category, retryable: this.retryable, classification: this.retryable ? 'retryable' : 'permanent', model: this.model }; }
}
export function classifyEmbeddingError(error: any): EmbeddingError {
  if (error instanceof EmbeddingError) return error;
  let body = error?.error;
  try { body = JSON.parse(error.message)?.error || body; } catch {}
  const status = Number(error?.status || body?.code || error?.code) || null;
  const code = String(body?.status || error?.code || 'UNKNOWN');
  const message = String(body?.message || error?.message || error).replaceAll(process.env.GEMINI_API_KEY || '\0', '[REDACTED]');
  const timeout = /timeout|timed out|ETIMEDOUT|DEADLINE_EXCEEDED/i.test(message + code) || error?.name === 'AbortError';
  const network = /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|network|socket/i.test(message + code);
  const permanent = status !== null && status >= 400 && status < 500 && status !== 429;
  const category: ErrorCategory = permanent ? 'MODEL_CONFIGURATION_ERROR' : status === 429 ? 'AI_RATE_LIMIT'
    : [500,502,503,504].includes(status!) ? 'AI_SERVICE_UNAVAILABLE' : timeout ? 'AI_REQUEST_TIMEOUT'
    : network ? 'NETWORK_ERROR' : 'MODEL_CONFIGURATION_ERROR';
  return new EmbeddingError(message, status, code, category, !permanent && (status === 429 || [500,502,503,504].includes(status!) || timeout || network));
}
export function assertEmbedding(vector: number[]): void {
  if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite) || !vector.some(v => v !== 0))
    throw new EmbeddingError('Expected a finite, nonzero 768-dimensional embedding.', null, 'INVALID_VECTOR', 'MODEL_CONFIGURATION_ERROR', false);
}
let client: GoogleGenAI | undefined;
export async function embedSingleTextWithRetry(text: string, maxAttempts = 3, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY')
    throw new EmbeddingError('Gemini API key is missing.', 401, 'UNAUTHENTICATED', 'MODEL_CONFIGURATION_ERROR', false);
  client ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1beta', timeout: 30000, retryOptions: { attempts: 1 } } });
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await client.models.embedContent({ model: EMBEDDING_MODEL, contents: text.slice(0,8000),
        config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType } });
      const values = result.embeddings?.[0]?.values || [];
      assertEmbedding(values);
      const norm = Math.hypot(...values);
      return values.map(v => v / norm);
    } catch (raw: any) {
      const error = classifyEmbeddingError(raw);
      if (!error.retryable || attempt >= maxAttempts) throw error;
      const header = raw?.response?.headers?.get?.('retry-after') || raw?.headers?.['retry-after'];
      const retryAfter = Number(header) * 1000 || (Date.parse(header) - Date.now());
      await new Promise(r => setTimeout(r, Math.min(60000, Math.max(0, retryAfter || (1000 * 2 ** (attempt-1) + Math.random()*500)))));
    }
  }
}
export async function embedText(text: string): Promise<number[]> { return embedSingleTextWithRetry(text, 3, 'RETRIEVAL_QUERY'); }
export async function embedChunksInBatches(chunks: Array<{chunkIndex:number;content:string}>, concurrency=4, onProgress?: (completed:number,total:number)=>void) {
  const results: Array<{chunkIndex:number;embedding:number[]}> = [];
  for (let i=0;i<chunks.length;i+=Math.max(1,concurrency)) {
    results.push(...await Promise.all(chunks.slice(i,i+Math.max(1,concurrency)).map(async c => ({chunkIndex:c.chunkIndex, embedding:await embedSingleTextWithRetry(c.content)}))));
    onProgress?.(results.length,chunks.length);
  }
  return results;
}
