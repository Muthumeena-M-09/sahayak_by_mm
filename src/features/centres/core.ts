export interface District { code:string; nameEn:string; nameTa:string; latitude:number|null; longitude:number|null; sourceUrl:string }
export type CentreType='welfare'|'esevai'|'csc'|'college'|'other';
export interface Centre {
 id:string; districtCode:string; name:string; address:string; type:CentreType; phone?:string;
 latitude:number|null; longitude:number|null; services:string[]; requiredDocuments:string[];
 hours:Record<string,Array<[string,string]>>|null; sourceUrl:string; verifiedAt:string;
 openStatus:'open'|'closed'|'unknown'; closesAt?:string; stale:boolean;
 reports:{busy:number;quiet:number;closed:number};
}
export function distanceKm(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
 const rad=(n:number)=>n*Math.PI/180; const dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);
 const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function centreStatus(hours:Centre['hours'],holidays:string[],now=new Date()):{openStatus:Centre['openStatus'];closesAt?:string} {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`;
 if(holidays.includes(date))return {openStatus:'closed'};
 if(!hours)return {openStatus:'unknown'};
 const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
 const minute=Number(parts.hour)*60+Number(parts.minute); const minutes=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
 for(const [start,end] of hours[String(weekday)]||[]) {const a=minutes(start),b=minutes(end);if(minute>=a&&(b>a?minute<b:true))return {openStatus:'open',closesAt:end};}
 const previous=new Date(now.getTime()-86400000);const previousDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(previous);
 if(!holidays.includes(previousDate))for(const [start,end] of hours[String((weekday+6)%7)]||[]){if(minutes(end)<minutes(start)&&minute<minutes(end))return {openStatus:'open',closesAt:end};}
 return {openStatus:'closed'};
}
type Position=[number,number];
export interface BoundaryFeature {properties:{districtCode:string};geometry:{type:'Polygon'|'MultiPolygon';coordinates:Position[][]|Position[][][]}}
function insideRing(point:Position,ring:Position[]) {let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function detectDistrict(latitude:number,longitude:number,features:BoundaryFeature[]) {
 const point:Position=[longitude,latitude];
 for(const feature of features){const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Position[][]]:feature.geometry.coordinates as Position[][][];
 if(polygons.some(rings=>rings.length&&insideRing(point,rings[0])&&!rings.slice(1).some(r=>insideRing(point,r))))return feature.properties.districtCode;}
 return null;
}
export function directions(centre:Pick<Centre,'name'|'address'|'latitude'|'longitude'>){
 const destination=centre.latitude!==null&&centre.longitude!==null?`${centre.latitude},${centre.longitude}`:`${centre.name}, ${centre.address}`;
 return {google:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,osm:centre.latitude!==null&&centre.longitude!==null?`https://www.openstreetmap.org/?mlat=${centre.latitude}&mlon=${centre.longitude}#map=17/${centre.latitude}/${centre.longitude}`:`https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`};
}
