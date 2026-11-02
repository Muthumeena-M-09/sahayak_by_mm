import 'dotenv/config';
import { createPool } from '../src/db/index.ts';
const pool=createPool();
try {
 const column=await pool.query("SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='document_chunks'::regclass AND attname='embedding'");
 console.log('Actual column:',column.rows);
 const docs=await pool.query("SELECT id,status,source_url,length(raw_text) AS text_length,extracted_metadata->>'embeddingModel' AS model FROM documents WHERE scope='knowledge_base'");console.log('Documents:',docs.rows);
 console.log('Chunk stats:',(await pool.query('SELECT document_id,count(*)::int AS total,count(embedding)::int AS embedded FROM document_chunks GROUP BY document_id')).rows);
} catch(e:any) { console.error({code:e.code,message:e.message});process.exitCode=1; } finally {await pool.end();}
