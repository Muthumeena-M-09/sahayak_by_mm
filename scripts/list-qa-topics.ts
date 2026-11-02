import 'dotenv/config';
import {createPool} from '../src/db/index.ts';
const pool=createPool();
try {const result=await pool.query(`SELECT d.title,d.source_url, count(c.embedding)::int AS embedded_passages, left(min(c.content),1000) AS sample FROM documents d LEFT JOIN document_chunks c ON c.document_id=d.id WHERE d.scope='knowledge_base' AND d.status='published' GROUP BY d.id,d.title,d.source_url ORDER BY d.id`);console.log(JSON.stringify(result.rows,null,2));}finally{await pool.end();}
