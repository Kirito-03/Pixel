/** Detach an obsolete screen without cancelling another consumer's shared load. */
export function withReaderAbort<T>(request:Promise<T>,signal?:AbortSignal):Promise<T>{
  if(!signal)return request;
  const aborted=()=>Object.assign(new Error('Lectura cancelada.'),{name:'AbortError'});
  if(signal.aborted){void request.catch(()=>{});return Promise.reject(aborted());}
  return new Promise((resolve,reject)=>{
    const cancel=()=>{signal.removeEventListener('abort',cancel);reject(aborted());};
    signal.addEventListener('abort',cancel,{once:true});
    request.then(value=>{signal.removeEventListener('abort',cancel);if(!signal.aborted)resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});
  });
}
