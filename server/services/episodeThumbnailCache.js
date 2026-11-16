export function createThumbnailCache({load,maxBytes=16*1024*1024,ttl=86400000}={}) {
 const cache=new Map(),pending=new Map();let bytes=0;
 return async function get(key){
  if(!/^\d+\/\d+$/.test(key))throw Error('Invalid thumbnail key');
  const old=cache.get(key);
  if(old&&Date.now()-old.at<ttl){cache.delete(key);cache.set(key,old);return old.data;}
  if(old){bytes-=old.data.length;cache.delete(key);}
  if(pending.has(key))return pending.get(key);
  const request=(async()=>{
   const data=await load(key);
   if(!Buffer.isBuffer(data)||data.length<4||data.length>512*1024||data[0]!==255||data[1]!==216)throw Error('Invalid thumbnail');
   while(bytes+data.length>maxBytes&&cache.size){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).data.length;cache.delete(oldest);}
   if(data.length<=maxBytes){cache.set(key,{data,at:Date.now()});bytes+=data.length;}
   return data;
  })();
  pending.set(key,request);try{return await request;}finally{pending.delete(key);}
 };
}
