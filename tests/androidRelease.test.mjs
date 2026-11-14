import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import express from '../server/node_modules/express/index.js';
import { createAppReleaseRouter } from '../server/routes/appRelease.js';
const valid={version:'1.0.1',versionCode:2,filename:'pixel-1.0.1-2.apk',size:6,sha256:'a'.repeat(64),notes:'Prueba'};
function parser(){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/androidRelease.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});return exports.parseAndroidRelease;}
test('client rejects unsafe release metadata and arbitrary download hosts',()=>{
 const parse=parser(),release={...valid,downloadUrl:'https://pixelnosekai.com/api/app-release/android/download?build=2'};
 assert.equal(parse(release).versionCode,2);
 for(const change of [{downloadUrl:'https://example.test/malicious.apk'},{downloadUrl:'http://pixelnosekai.com/api/app-release/android/download?build=2'},{versionCode:0},{sha256:'bad'},{size:-1},{version:'latest'}])assert.throws(()=>parse({...release,...change}));
});
test('release endpoint serves manifest and APK, blocks stale builds and invalid filenames',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-release-'));
 const app=express();app.use('/api/app-release',createAppReleaseRouter(directory));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(directory,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${server.address().port}/api/app-release/android`;
 assert.equal((await fetch(url)).status,404);
 fs.writeFileSync(path.join(directory,valid.filename),'PKtest');fs.writeFileSync(path.join(directory,'latest.json'),JSON.stringify(valid));
 const manifest=await fetch(url);assert.equal(manifest.status,200);assert.equal(manifest.headers.get('cache-control'),'no-store');assert.equal((await manifest.json()).downloadUrl,'https://pixelnosekai.com/api/app-release/android/download?build=2');
 const artifact=await fetch(url+'/download?build=2');assert.equal(artifact.status,200);assert.match(artifact.headers.get('content-disposition'),/pixel-1.0.1-2.apk/);assert.equal(await artifact.text(),'PKtest');
 assert.equal((await fetch(url+'/download?build=1')).status,409);
 fs.writeFileSync(path.join(directory,'latest.json'),JSON.stringify({...valid,filename:'../private.apk'}));assert.equal((await fetch(url)).status,503);assert.equal((await fetch(url+'/download')).status,404);
 fs.writeFileSync(path.join(directory,'latest.json'),JSON.stringify({...valid,size:100}));assert.equal((await fetch(url)).status,503);
});
