import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateGroundedAnswerStream} from './gemini.ts';
const source={documentId:1,documentTitle:'Scholarship rules',sourceUrl:'https://example.org/rules',pageNumber:2,content:'Enrollment is required.',languageCode:'en',similarity:0.8};
const params={userMessage:'How do I apply?',replyLanguageCode:'ta',replyLanguageName:'Tamil',replyScript:'Tamil',retrievedChunks:[source],glossaryTerms:[],availableServices:[],conversationHistory:[] as Array<{role:'user'|'model';text:string}>,onToken:(_text:string)=>{}};
test('streams selected-language answer with matching source references',async()=>{
 const original=globalThis.fetch;const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test';let streamed='';
 globalThis.fetch=async(_input,init)=>{
  const body=JSON.parse(String(init?.body));assert.match(body.systemInstruction.parts[0].text,/Respond ENTIRELY in Tamil/);assert.match(body.systemInstruction.parts[0].text,/SOURCE 1/);
  return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'பள்ளிச் சேர்க்கை தேவை [SOURCE 1].'}],role:'model'},finishReason:'STOP'}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 };
 try {const result=await generateGroundedAnswerStream({...params,onToken:text=>{streamed+=text;}});assert.equal(streamed,result.fullText);assert.equal(result.citations[0].sourceNumber,1);assert.equal(result.citations[0].sourceUrl,source.sourceUrl);assert.ok(!result.suggestedActions.some(a=>a.type==='start_application'));}
 finally {globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});
test('provider errors fail instead of returning English source excerpts',async()=>{
 const original=globalThis.fetch;const key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test';
 globalThis.fetch=async()=>Response.json({error:{code:503,message:'High demand',status:'UNAVAILABLE'}},{status:503});
 try {await assert.rejects(generateGroundedAnswerStream(params),/temporarily unavailable/);}
 finally {globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});
