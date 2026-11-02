export interface GroundingSource {
 documentId:number; documentTitle:string; sourceUrl?:string|null; pageNumber:number;
 content:string; languageCode:string; similarity:number;
}
export function selectGroundingSources<T extends GroundingSource>(sources:T[]):T[] {
 const seen=new Set<string>();
 return [...sources].filter(s=>Number.isFinite(s.similarity)&&s.similarity>=0.38&&s.content.trim())
 .sort((a,b)=>b.similarity-a.similarity).filter(s=>{const key=`${s.documentId}:${s.pageNumber}:${s.content}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,5);
}
export function referencedCitations(text:string,sources:GroundingSource[]) {
 const references=[...text.matchAll(/\[SOURCE\s+(\d+)\]/g)].map(m=>Number(m[1]));
 if(references.some(n=>n<1||n>sources.length)) throw new Error('Answer referenced an unknown source. Please retry.');
 if(sources.length && !references.length) throw new Error('Answer did not cite its supporting sources. Please retry.');
 return sources.flatMap((s,i)=>references.includes(i+1)?[{
 sourceNumber:i+1,documentId:s.documentId,documentTitle:s.documentTitle,
 sourceUrl:safeSourceUrl(s.sourceUrl),pageNumber:s.pageNumber,snippet:s.content.slice(0,400),languageCode:s.languageCode,
 }]:[]);
}
export function safeSourceUrl(value?:string|null):string|undefined {
 if(!value)return undefined;
 try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}
}
