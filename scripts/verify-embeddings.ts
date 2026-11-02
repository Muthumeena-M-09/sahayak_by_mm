import 'dotenv/config';
import assert from 'node:assert/strict';
import { GoogleGenAI } from '@google/genai';
import { eq, sql } from 'drizzle-orm';
import { db, createPool } from '../src/db/index.ts';
import { documents } from '../src/db/schema.ts';
import { getKnowledgeDocumentById, getDocumentChunkStats, retrieveTopPublishedChunks, updateChunkEmbedding, stageDocumentChunks } from '../src/db/repositories.ts';
import { processDocumentIngestion } from '../src/lib/ingestionWorker.ts';
import { embedText, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, assertEmbedding } from '../src/lib/embeddings.ts';
const pool = createPool();
const rollback = new Error('Rollback publication test');
try {
  const ai = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{retryOptions:{attempts:1}}});
  const model = await ai.models.get({model:EMBEDDING_MODEL});
  assert.ok(model.supportedActions?.includes('embedContent'));
  const column = await pool.query("SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='document_chunks'::regclass AND attname='embedding'");
  assert.equal(column.rows[0]?.type, `vector(${EMBEDDING_DIMENSIONS})`);
  const query = await embedText('How can students apply for scholarships through the National Scholarship Portal?');
  assertEmbedding(query);
  const original = await getKnowledgeDocumentById(1);
  assert.ok(original);
  assert.equal(original.sourceUrl,'https://scholarships.gov.in');
  const before = await pool.query('SELECT id,document_id,chunk_index,page_number,content FROM document_chunks WHERE document_id=1 ORDER BY chunk_index');
  assert.equal(before.rows.length,7);
  console.log('PASS: model availability, embedContent, query dimension, live vector(768), seven staged chunks');
  await processDocumentIngestion(1,{resumeOnly:true,targetStatus:'stored'});
  assert.deepEqual(await getDocumentChunkStats(1),{total:7,embedded:7,failed:0});
  const after = await getKnowledgeDocumentById(1);
  for (const key of ['title','rawText','sourceUrl','languageCode','domain','fileDataBase64','docType'] as const) assert.deepEqual(after![key],original[key]);
  assert.equal(after!.status,'stored');
  assert.deepEqual((await pool.query('SELECT id,document_id,chunk_index,page_number,content FROM document_chunks WHERE document_id=1 ORDER BY chunk_index')).rows,before.rows);
  console.log('PASS: NSP 7/7 saved, document metadata and chunk IDs/order/content preserved');
  const vectorsBeforeRetry = (await pool.query('SELECT id,embedding::text FROM document_chunks WHERE document_id=1 ORDER BY id')).rows;
  await assert.rejects(updateChunkEmbedding(before.rows[0].id, Array(767).fill(1)));
  await assert.rejects(stageDocumentChunks(1,[{chunkIndex:0,pageNumber:1,content:'duplicate attempt'}]));
  await processDocumentIngestion(1,{resumeOnly:true,targetStatus:'stored'});
  assert.deepEqual(await getDocumentChunkStats(1),{total:7,embedded:7,failed:0});
  assert.deepEqual((await pool.query('SELECT id,embedding::text FROM document_chunks WHERE document_id=1 ORDER BY id')).rows,vectorsBeforeRetry);
  console.log('PASS: incorrect dimension rejected; duplicate staging prevented; existing vectors unchanged by retry');
  assert.equal((await retrieveTopPublishedChunks(query)).some(r=>r.documentId===1),false);
  try {
    await db.transaction(async tx => {
      await tx.update(documents).set({status:'published'}).where(eq(documents.id,1));
      const hits = await retrieveTopPublishedChunks(query,7,tx);
      assert.equal(hits.length,7);
      assert.ok(hits.every(h=>h.documentId===1 && h.sourceUrl===original.sourceUrl && h.documentTitle===original.title && h.pageNumber>0 && h.languageCode===original.languageCode && Number.isFinite(h.similarity)));
      console.log('PASS: citizen query similarity search returns seven NSP passages with source URL/title/page/language; top similarity:',hits[0].similarity);
      throw rollback;
    });
  } catch(e) {if(e!==rollback) throw e;}
  assert.equal((await getKnowledgeDocumentById(1))!.status,'stored');
  console.log('PASS: idempotent retry; unpublished document excluded; test publication rolled back; document awaits review/approval');
} catch (e:any) { console.error('FAIL:',e instanceof Error ? e.message : e); process.exitCode=1; }
finally { await pool.end(); }
