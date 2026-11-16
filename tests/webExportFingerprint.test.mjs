import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finalizeWebExport } from '../tools/finalize-web-export.mjs';
test('a lazy chunk map update gets a new entry URL even if Expo reuses its name', () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-export-'));
 try {
  const relative='_expo/static/js/web/index-abcdef.js';
  fs.mkdirSync(path.dirname(path.join(directory,relative)),{recursive:true});
  const run=content=>{
   fs.writeFileSync(path.join(directory,relative),content);
   fs.writeFileSync(path.join(directory,'index.html'),`<script src="/${relative}"></script>`);
   finalizeWebExport(directory);
   return fs.readFileSync(path.join(directory,'index.html'),'utf8');
  };
  const first=run('chunk:one'); const second=run('chunk:two'); assert.notEqual(first,second);
  finalizeWebExport(directory); assert.equal(fs.readFileSync(path.join(directory,'index.html'),'utf8'),second);
  const entry=second.match(/src="\/(.*?)"/)[1]; assert.equal(fs.readFileSync(path.join(directory,entry),'utf8'),'chunk:two');
 } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
