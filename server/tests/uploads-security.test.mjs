import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import uploads from '../routes/uploads.js';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const token = jwt.sign({ id: 991 }, process.env.JWT_SECRET, { expiresIn: '1m' });
const app = express();app.use('/upload', uploads);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise(resolve => server.close(resolve)));
function form(bytes) {const body=new FormData();body.append('avatar',new Blob([bytes],{type:'image/png'}),'image.png');return body;}
test('anonymous avatar upload is denied before writing a file',async()=>{
 const res=await fetch(`${base}/upload/avatar`,{method:'POST',body:form('fake')});assert.equal(res.status,401);
});
test('declared PNG containing HTML is rejected',async()=>{
 const res=await fetch(`${base}/upload/avatar`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form('<script>bad</script>')});assert.equal(res.status,400);
});
test('upload result cannot reflect a hostile client base URL',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GAAAAABJRU5ErkJggg==','base64');
 const res=await fetch(`${base}/upload/avatar`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Client-BaseURL':'https://evil.example'},body:form(png)});
 assert.equal(res.status,200);const data=await res.json();
 try {assert.ok(data.url.startsWith('https://pixelnosekai.com/uploads/avatars/'));} finally {await unlink(new URL(`../uploads/avatars/${data.filename}`,import.meta.url));}
});
