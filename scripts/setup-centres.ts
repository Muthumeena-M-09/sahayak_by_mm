import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {createPool} from '../src/db/index.ts';
import type {District} from '../src/features/centres/core.ts';
const source='https://www.tabcedco.tn.gov.in/WEB/EN/DIST/DBCMWO';
const districts:District[]=JSON.parse(await readFile(new URL('../data/location/districts.json',import.meta.url),'utf8'));
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
const aliases:Record<string,string>={chengalpat:'chengalpattu',kanniyakumari:'kanyakumari',theNilgiris:'nilgiris',thiruvallur:'tiruvallur',thiruvarur:'tiruvarur',pudukottai:'pudukkottai',tiruppathur:'tirupathur',thirupathur:'tirupathur',villupuram:'viluppuram'};
const response=await fetch(source,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Directory HTTP ${response.status}`);
const html=await response.text();const $=load(html);const records:Record<string,unknown>[]=[];
$('table tr').each((_i,row)=>{const cells=$(row).find('td');if(cells.length<5)return;const districtName=cells.eq(1).text().trim();const raw=normalize(districtName);const code=aliases[raw]||raw;const district=districts.find(d=>d.code===code);if(!district)return;
 const address=cells.eq(2).text().replace(/\s+/g,' ').trim();const phone=cells.eq(4).text().replace(/\s+/g,' ').trim();if(!address||!address.toLowerCase().includes('collectorate'))return;
 records.push({id:`welfare-${district.code}`,districtCode:district.code,name:`District Backward Classes and Minorities Welfare Office — ${district.nameEn}`,address:`${address}, ${district.nameEn}, Tamil Nadu`,type:'welfare',phone:phone==='-'?'':phone,latitude:null,longitude:null,hours:null,services:['scholarship_guidance'],requiredDocuments:[],sourceUrl:source,verifiedAt:new Date().toISOString()});
});
if(records.length<25||new Set(records.map(r=>r.id)).size!==records.length)throw new Error(`Directory structure changed: ${records.length} usable offices. No database changes made.`);
await writeFile(new URL('../data/location/centres.json',import.meta.url),JSON.stringify(records,null,2));
const pool=createPool();const client=await pool.connect();
try{
 await client.query(await readFile(new URL('../src/features/centres/schema.sql',import.meta.url),'utf8'));
 await client.query('BEGIN');
 for(const d of districts)await client.query('INSERT INTO help_location.districts(code,data) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET data=excluded.data',[d.code,JSON.stringify(d)]);
 for(const c of records)await client.query('INSERT INTO help_location.centres(id,district_code,verified_at,data) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET data=excluded.data,verified_at=excluded.verified_at',[c.id,c.districtCode,c.verifiedAt,JSON.stringify(c)]);
 await client.query('COMMIT');
 console.log(JSON.stringify({districts:districts.length,officialDirectoryOffices:records.length,source,hours:'not supplied',coordinates:'not supplied'}));
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
