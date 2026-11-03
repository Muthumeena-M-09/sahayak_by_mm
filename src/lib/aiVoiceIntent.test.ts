import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeVoiceIntent } from './aiVoiceIntent.ts';
import { validateAiVoiceResult } from './voiceCommands.ts';

test('model output accepts only supported, confident actions', () => {
  assert.deepEqual(validateAiVoiceResult({type:'navigate', screen:'status', confidence:0.95}), {intent:{type:'navigate', screen:'status'}});
  for (const result of [
    {type:'navigate', screen:'admin', confidence:1},
    {type:'navigate', screen:'https://example.com', confidence:1},
    {type:'delete', confidence:1},
    {type:'search', query:'', confidence:1},
    {type:'search', query:'x'.repeat(121), confidence:1},
    {type:'navigate', screen:'documents', confidence:0.5},
    {type:'navigate', screen:'documents'},
    null,
  ]) assert.deepEqual(validateAiVoiceResult(result), {intent:{type:'unknown'}});
  assert.deepEqual(validateAiVoiceResult({type:'navigate', screen:'documents', confidence:0.4, clarification:'Documents or services?'}),
    {intent:{type:'unknown'}, clarification:'Documents or services?'});
});

test('Gemini request constrains English/Hindi interpretation and passes clarification context', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    const system = JSON.stringify(body.systemInstruction);
    assert.match(system, /untrusted user data/);
    assert.match(system, /Never interpret requests to submit, delete/);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.ok(body.generationConfig.responseSchema.properties.screen.enum.every((value:string) => value.length > 0));
    const input = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(input.text, 'the uploaded papers');
    assert.equal(input.previousText, 'Where are my things?');
    return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({type:'navigate', screen:'documents', confidence:0.96, query:'', clarification:''})}]},finishReason:'STOP'}]});
  };
  try {
    assert.deepEqual(await recognizeVoiceIntent({text:'the uploaded papers', language:'en-IN', pageLabel:'Home', previousText:'Where are my things?', clarification:'Documents or services?'}),
      {intent:{type:'navigate', screen:'documents'}});
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('provider failures and malformed JSON fail without an action', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  try {
    globalThis.fetch = async () => Response.json({error:{code:503, message:'Unavailable', status:'UNAVAILABLE'}}, {status:503});
    await assert.rejects(recognizeVoiceIntent({text:'Where are my papers?', language:'en-IN', pageLabel:'Home'}));
    globalThis.fetch = async () => Response.json({candidates:[{content:{role:'model',parts:[{text:'not JSON'}]},finishReason:'STOP'}]});
    await assert.rejects(recognizeVoiceIntent({text:'मेरे कागज़ कहाँ हैं?', language:'hi-IN', pageLabel:'Home'}));
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(recognizeVoiceIntent({text:'Where are my papers?', language:'en-IN', pageLabel:'Home'}), /not configured/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
