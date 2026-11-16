const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function load(name,extra={}) {
 const routes={};
 const router={get:(p,...h)=>routes['GET '+p]=h,post:(p,...h)=>routes['POST '+p]=h};
 const code=fs.readFileSync(path.join(__dirname,'../routes/',name),'utf8').replace(/^import .*;?\r?\n/gm,'').replace('export default router;','');
 vm.runInNewContext(code,{express:{Router:()=>router},URL,Buffer,console,process, ...extra});
 return routes;
}
function response(){return {statusCode:200,status(n){this.statusCode=n;return this},json(data){this.data=data;return this}}}
function imageResponse(){return {...response(),headers:{},set(k,v){this.headers[k]=v;return this},send(data){this.data=data;return this}}}
test('manga cover rejects unsafe hosts, credentials, ports and paths before fetching',async()=>{
 let calls=0;
 const routes=load('proxy.js',{axios:{get:async()=>{calls++;throw Error('must not fetch')}},crypto:{},cache:{}});
 for(const url of ['http://uploads.mangadex.org/covers/a.jpg','https://uploads.mangadex.org.evil.test/covers/a.jpg','https://user@uploads.mangadex.org/covers/a.jpg','https://uploads.mangadex.org:444/covers/a.jpg','https://uploads.mangadex.org/private']){
  const res=imageResponse();await routes['GET /manga-cover'][0]({query:{url}},res);assert.equal(res.statusCode,400);
 }
 assert.equal(calls,0);
});
test('manga cover refuses upstream HTML and a falsely labelled image without caching',async()=>{
 for(const mime of ['text/html','image/jpeg']){
  const routes=load('proxy.js',{axios:{get:async()=>({headers:{'content-type':mime},data:Buffer.from('<html>challenge</html>')})},crypto:{},cache:{}});
  const res=imageResponse();await routes['GET /manga-cover'][0]({query:{url:'https://uploads.mangadex.org/covers/a.jpg'}},res);
  assert.equal(res.statusCode,502);assert.equal(res.headers['Cache-Control'],'no-store');
 }
});
test('manga cover returns valid JPEG with bounded download and no redirects',async()=>{
 let options;const bytes=Buffer.from([255,216,255,224,0,16]);
 const routes=load('proxy.js',{axios:{get:async(u,o)=>{options=o;return {headers:{'content-type':'image/jpeg'},data:bytes}}},crypto:{},cache:{}});
 const res=imageResponse();await routes['GET /manga-cover'][0]({query:{url:'https://uploads.mangadex.org/covers/a.jpg'}},res);
 assert.equal(res.statusCode,200);assert.deepEqual(res.data,bytes);assert.equal(options.maxRedirects,0);
 assert.equal(options.maxContentLength,5*1024*1024);assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
});
test('proxy rejects lookalike domains, credentials, HTTP and custom ports without outbound requests',async()=>{
 let calls=0;
 const routes=load('proxy.js',{axios:{get:async()=>{calls++;return {data:{ok:true}}}},crypto:{},cache:{}});
 for(const url of ['https://api.jikan.moe.attacker.test','http://api.jikan.moe','https://user:pass@api.jikan.moe','https://api.jikan.moe:8443']){
 const res=response();await routes['GET /cors-proxy'][0]({query:{url}},res);assert.equal(res.statusCode,403);
 }
 assert.equal(calls,0);
});
test('proxy permits exact HTTPS host and disables redirects',async()=>{
 let options;
 const routes=load('proxy.js',{axios:{get:async(u,o)=>{options=o;return {data:{ok:true}}}},crypto:{},cache:{}});
 const res=response();await routes['GET /cors-proxy'][0]({query:{url:'https://api.jikan.moe/v4/anime'}},res);
 assert.equal(res.statusCode,200);assert.equal(options.maxRedirects,0);assert.ok(options.maxContentLength>0);
});
test('forgot password never returns a token or accesses database',async()=>{
 const routes=load('userAuth.js',{bcrypt:{},pool:{query(){throw Error('unexpected database access')}}});
 const res=response();await routes['POST /forgot-password'][0]({body:{email:'person@example.com'}},res);
 assert.equal(res.statusCode,503);assert.equal(res.data.token,undefined);
});
test('transcoding requires the existing admin middleware before executing handler and blocks internal SSRF URLs',async()=>{
 const authenticateAdmin=()=>{};
 let executed=0;
 const routes=load('transcode.js',{authenticateAdmin,crypto:{createHash:()=>({update:()=>({digest:()=>'id'})})},transcodeHls:async()=>{executed++;return {id:'id',stream_url:'https://r2.example/index.m3u8'}}});
 assert.equal(routes['POST /hls'][0],authenticateAdmin);assert.equal(routes['POST /hls'].length,2);
 for (const src of ['http://127.0.0.1:8086/Anime/5/trailer.mp4','http://localhost:3001/health','http://169.254.169.254/latest/meta-data','http://192.168.1.1/video.mp4']) {
  const res=response();await routes['POST /hls'][1]({body:{src}},res);assert.equal(res.statusCode,400);
 }
 assert.equal(executed,0);
});
test('reset password hashes before writing to database',async()=>{
 const calls=[];let hashArgs;
 const routes=load('userAuth.js',{bcrypt:{hash:async(...a)=>{hashArgs=a;return '$2b$test-hash'}},pool:{query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{id:1}]}}}});
 const res=response();await routes['POST /reset-password'][0]({body:{email:'person@example.com',token:'existing-token',new_password:'long-enough-password'}},res);
 assert.equal(res.statusCode,200);assert.deepEqual(hashArgs,['long-enough-password',12]);
 assert.equal(calls.find(([sql])=>sql.startsWith('UPDATE usuarios'))[1][0],'$2b$test-hash');
});

test('OAuth placeholder and plaintext passwords cannot authenticate',async()=>{
 for(const password_hash of ['google_auth','plaintext-password']) {
  const routes=load('userAuth.js',{bcrypt:{compare:()=>{throw Error('must not compare')}},jwt:{sign:()=>{throw Error('must not issue token')}},pool:{query:async()=>({rows:[{id:1,password_hash}]})}});
  const res=response();await routes['POST /login'][0]({body:{email:'person@example.com',password:password_hash}},res);
  assert.equal(res.statusCode,401);assert.equal(res.data.token,undefined);
 }
});

function ownership(pool) {
 const code=fs.readFileSync(path.join(__dirname,'../middleware/ownership.js'),'utf8').replace(/^import .*;?\r?\n/gm,'').replace(/export const /g,'var ');
 const ctx={pool,Number};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;
}
test('profile ownership denies another user and does not invoke protected handler',async()=>{
 let args;const guard=ownership({query:async(sql,a)=>{args=a;return {rows:[]}}}).requireProfileOwner(r=>r.params.id);
 const res=response();let next=false;await guard({params:{id:7},user:{id:9}},res,()=>next=true);
 assert.equal(res.statusCode,403);assert.equal(next,false);assert.deepEqual(Array.from(args),[7,9]);
});
test('profile ownership permits owner and rejects invalid identifiers before database access',async()=>{
 let calls=0;const guard=ownership({query:async()=>{calls++;return {rows:[{id:7}]}}}).requireProfileOwner(r=>r.params.id);
 let next=false;await guard({params:{id:7},user:{id:9}},response(),()=>next=true);assert.equal(next,true);
 const res=response();await guard({params:{id:'no'},user:{id:9}},res,()=>{});assert.equal(res.statusCode,400);assert.equal(calls,1);
});
