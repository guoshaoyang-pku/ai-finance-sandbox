'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
let html=read('src/index.template.html');
for(const [token,f]of Object.entries({'/*STYLE*/':'src/style.css','/*DATA*/':'data/baseline.json','/*ENGINE*/':'src/engine.js','/*APP*/':'src/app.js'}))html=html.replace(token,()=>token==='/*STYLE*/'?read(f):safeScript(read(f)));
fs.writeFileSync(path.join(root,'index.html'),html);
console.log('Built index.html: '+Buffer.byteLength(html)+' bytes');
