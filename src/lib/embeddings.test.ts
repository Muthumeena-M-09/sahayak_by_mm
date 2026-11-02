import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertEmbedding, classifyEmbeddingError, EmbeddingError, embedSingleTextWithRetry } from './embeddings.ts';
for (const status of [400,401,403,404]) test(`${status} is permanent`,()=>{
 const error=classifyEmbeddingError({status,message:JSON.stringify({error:{code:status,status:'NOT_FOUND',message:'Unavailable model'}})});
 assert.equal(error.retryable,false);assert.equal(error.httpStatus,status);assert.equal(error.geminiCode,'NOT_FOUND');assert.equal(error.category,'MODEL_CONFIGURATION_ERROR');
});
for (const status of [429,500,502,503,504]) test(`${status} is retryable`,()=>assert.equal(classifyEmbeddingError({status,message:'service error'}).retryable,true));
test('timeouts and network failures are classified',()=>{
 assert.equal(classifyEmbeddingError(new Error('fetch failed')).category,'NETWORK_ERROR');
 assert.equal(classifyEmbeddingError(new Error('ETIMEDOUT')).category,'AI_REQUEST_TIMEOUT');
 assert.equal(classifyEmbeddingError({status:404,message:'UNAVAILABLE timeout'}).retryable,false);
});
test('invalid dimensions, NaN and empty vectors are rejected',()=>{
 for(const v of [[],[1],Array(769).fill(1),Array(768).fill(NaN),Array(768).fill(0)]) assert.throws(()=>assertEmbedding(v),EmbeddingError);
 assert.doesNotThrow(()=>assertEmbedding(Array(768).fill(1)));
});
test('missing key throws structured error rather than lexical vector',async()=>{
 const key=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
 try {await assert.rejects(embedSingleTextWithRetry('test'),(e:EmbeddingError)=>e.httpStatus===401 && !e.retryable);}finally{if(key!==undefined) process.env.GEMINI_API_KEY=key;}
});
test('404 makes one SDK request despite four allowed attempts',async()=>{
 const originalFetch=globalThis.fetch;const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:404,status:'NOT_FOUND',message:'Model unavailable'}}),{status:404,headers:{'content-type':'application/json'}});};
 try {await assert.rejects(embedSingleTextWithRetry('test',4),(e:EmbeddingError)=>e.httpStatus===404 && !e.retryable);assert.equal(calls,1);}
 finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});
test('429 retries and returns a normalized 768-dimensional vector',async()=>{
 const originalFetch=globalThis.fetch;const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';let calls=0;
 globalThis.fetch=async()=>{calls++;return calls===1
  ? new Response(JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Quota'}}),{status:429,headers:{'content-type':'application/json'}})
  : new Response(JSON.stringify({embeddings:[{values:Array(768).fill(1)}]}),{status:200,headers:{'content-type':'application/json'}});};
 try {const vector=await embedSingleTextWithRetry('test',2);assert.equal(calls,2);assert.equal(vector.length,768);assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-10);}
 finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});

