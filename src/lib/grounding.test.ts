import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectGroundingSources,referencedCitations,safeSourceUrl} from './grounding.ts';
const source={documentId:1,documentTitle:'Scholarship rules',sourceUrl:'https://example.org/rules',pageNumber:2,content:'Applications require school enrollment.',languageCode:'en',similarity:0.8};
test('retrieval filters weak matches, sorts and removes duplicates',()=>{assert.deepEqual(selectGroundingSources([{...source,similarity:0.1},source,source,{...source,content:'Other',similarity:0.9}]).map(s=>s.content),['Other',source.content]);});
test('only referenced passages become citations with stable numbers',()=>{const citations=referencedCitations('Enroll at school [SOURCE 2].',[{...source,content:'Unused'},source]);assert.equal(citations.length,1);assert.equal(citations[0].sourceNumber,2);assert.equal(citations[0].snippet,source.content);});
test('invented and missing source references fail closed',()=>{assert.throws(()=>referencedCitations('Unsupported [SOURCE 7]',[source]));assert.throws(()=>referencedCitations('Unsupported',[source]));assert.throws(()=>referencedCitations('[SOURCE 1]',[]));assert.deepEqual(referencedCitations('No supporting source found',[]),[]);});
test('citation URLs reject scripts, credentials and invalid addresses',()=>{for(const url of ['javascript:alert(1)','data:text/html,test','https://user:secret@example.org','invalid'])assert.equal(safeSourceUrl(url),undefined);assert.equal(safeSourceUrl(source.sourceUrl),source.sourceUrl);});
