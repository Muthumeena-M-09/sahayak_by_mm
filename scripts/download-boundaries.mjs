const source='https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/admin/districts/LGD_Districts.geojson';
const res=await fetch(source,{signal:AbortSignal.timeout(120000)});if(!res.ok)throw new Error(`Boundary HTTP ${res.status}`);const geo=await res.json();
console.log('Features',geo.features.length,'properties',geo.features[0].properties);
const fs=await import('node:fs/promises');await fs.writeFile('data/location/boundaries-download.tmp.json',JSON.stringify(geo));
