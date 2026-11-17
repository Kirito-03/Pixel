type Store={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<unknown>;removeItem:(key:string)=>Promise<unknown>};
type Entry<T>={at:number;data:T};
const utf8Bytes=(value:string)=>{let bytes=0;for(const character of value){const code=character.codePointAt(0)!;bytes+=code<128?1:code<2048?2:code<65536?3:4;}return bytes;};
export function createPublicCatalogCache(storage:Store,{now=()=>Date.now(),freshMs=300000,maxAgeMs=86400000,maxEntries=40,maxBytes=4*1024*1024,prefix='pixel:public-catalog:v1:'}={}) {
 const memory=new Map<string,Entry<any>>(),reads=new Map<string,Promise<any>>(),network=new Map<string,Promise<any>>();let writes=Promise.resolve();const listeners=new Set<(key:string)=>void>();
 const put=(key:string,value:Entry<any>)=>{memory.delete(key);memory.set(key,value);while(memory.size>maxEntries)memory.delete(memory.keys().next().value!);};
 const save=(key:string,entry:Entry<any>)=>{
  const value=JSON.stringify(entry),bytes=utf8Bytes(value);if(bytes>Math.min(maxBytes/2,1024*1024))return;
  writes=writes.then(async()=>{
   const indexKey=prefix+'index';let index:Array<{key:string;bytes:number;at:number}>=[];
   try{index=JSON.parse(await storage.getItem(indexKey)||'[]');if(!Array.isArray(index))index=[];}catch{}
   index=index.filter(row=>row&&typeof row.key==='string'&&Number.isFinite(row.bytes)&&row.bytes>=0&&Number.isFinite(row.at));
   const expired=index.filter(row=>now()-row.at>maxAgeMs);for(const row of expired)await storage.removeItem(prefix+row.key);
   index=index.filter(row=>row.key!==key&&now()-row.at<=maxAgeMs);
   index.push({key,bytes,at:entry.at});
   while(index.length>maxEntries||index.reduce((sum,row)=>sum+row.bytes,0)>maxBytes){const old=index.shift()!;await storage.removeItem(prefix+old.key);}
   await storage.setItem(prefix+key,value);await storage.setItem(indexKey,JSON.stringify(index));
  }).catch(()=>{});
 };
 const refresh=<T>(key:string,load:()=>Promise<T>,persist:boolean,notify=false,accept:(data:T)=>boolean=()=>true):Promise<T>=>{
  if(network.has(key))return network.get(key)!;
  const request=Promise.resolve().then(load).then(data=>{const accepted=accept(data),entry={at:now(),data};if(persist&&accepted){put(key,entry);save(key,entry);}if(notify&&accepted)for(const listener of listeners){try{listener(key);}catch{}}return data;}).finally(()=>network.delete(key));
  network.set(key,request);return request;
 };
 return {
  read<T>(key:string,load:()=>Promise<T>,{force=false,persist=true,ttl=freshMs,accept=(_data:T):boolean=>true}={}):Promise<T>{
   if(force)return refresh(key,load,persist,false,accept);
   if(!persist)return refresh(key,load,false,false,accept);
   const readKey=key+'|'+ttl;
   if(reads.has(readKey))return reads.get(readKey)!;
   const request=(async()=>{
    let entry=memory.get(key);
    if(!entry&&persist){try{const parsed=JSON.parse(await storage.getItem(prefix+key)||'null');if(parsed&&typeof parsed.at==='number'&&'data'in parsed)entry=parsed;}catch{}}
    const age=entry?now()-entry.at:Infinity;
    if(entry&&age>=0&&age<=maxAgeMs){put(key,entry);if(age>ttl)void refresh(key,load,persist,true,accept).catch(()=>{});return entry.data as T;}
    return refresh(key,load,persist,false,accept);
   })().finally(()=>reads.delete(readKey));
   reads.set(readKey,request);return request;
  },
  subscribe:(listener:(key:string)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  flush:()=>writes,
 };
}
