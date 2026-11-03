import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWakeCommand, parseVoiceCommand } from './voiceCommands.ts';

test('natural English and Hindi navigation resolve to the same screen', () => {
  for (const text of ['Please take me to my documents.', 'Show me my documents please', 'मुझे मेरे दस्तावेज़ दिखाओ']) {
    assert.deepEqual(parseVoiceCommand(text), {type:'navigate', screen:'documents'});
  }
  assert.deepEqual(parseVoiceCommand('मुझे सेवाएँ दिखाओ'), {type:'navigate', screen:'services'});
  assert.deepEqual(parseVoiceCommand('Open help'), {type:'navigate', screen:'help'});
  assert.deepEqual(parseVoiceCommand('help'), {type:'help'});
});
test('wake phrases work with both scripts and preserve command gating', () => {
  assert.equal(extractWakeCommand('हे सहायक, वापस जाओ।'), 'वापस जाओ');
  assert.equal(extractWakeCommand('Hey Sahayak, open services'), 'open services');
  assert.equal(extractWakeCommand('हे सहायक'), '');
  assert.equal(extractWakeCommand('open services'), null);
  for (const phrase of ['Hey, Sahayak!', 'hey saha yak', 'hey सहायक', 'हे sahayak']) assert.equal(extractWakeCommand(phrase), '');
  assert.equal(extractWakeCommand('hey sahayakish open services'), null);
  assert.equal(extractWakeCommand('okay hello sahayak open services'), 'open services');
  assert.equal(extractWakeCommand('someone said hey sahayak open documents'), null);
});

test('common natural and Hinglish commands work without an AI round trip', () => {
  for (const phrase of ['Could you show my uploaded papers?', 'Please open my documents for me', 'mere documents dikhao', 'कृपया मेरे कागज़ दिखाओ']) {
    assert.deepEqual(parseVoiceCommand(phrase), {type:'navigate', screen:'documents'});
  }
  assert.deepEqual(parseVoiceCommand('How is my application going?'), {type:'navigate', screen:'status'});
  assert.deepEqual(parseVoiceCommand('scholarship dhundo'), {type:'search', query:'scholarship'});
  assert.deepEqual(parseVoiceCommand('sunna band karo'), {type:'stop'});
  assert.deepEqual(parseVoiceCommand('Could you delete my uploaded papers?'), {type:'unknown'});
  assert.deepEqual(parseVoiceCommand('open documents and settings'), {type:'unknown'});
});
test('search retains specific queries and translates common Hindi service names', () => {
  assert.deepEqual(parseVoiceCommand('Find scholarship'), {type:'search', query:'scholarship'});
  assert.deepEqual(parseVoiceCommand('पेंशन खोजो'), {type:'search', query:'pension'});
  assert.deepEqual(parseVoiceCommand('खोजो राशन कार्ड'), {type:'search', query:'ration'});
});
test('reading, orientation, repetition and stop work in Hindi', () => {
  for (const [text, type] of [['यह पेज पढ़ो','read'], ['मैं कहाँ हूँ','location'], ['फिर से बोलो','repeat'], ['सुनना बंद करो','stop'], ['वापस जाओ','back']]) {
    assert.deepEqual(parseVoiceCommand(text), {type});
  }
  assert.deepEqual(parseVoiceCommand('delete my documents'), {type:'unknown'});
  assert.deepEqual(parseVoiceCommand('submit my application'), {type:'unknown'});
});
