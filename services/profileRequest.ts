/** A slow Firestore read must not leave the viewer waiting indefinitely. */
export function withProfileDeadline<T>(operation:Promise<T>,milliseconds=10000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('La conexión está tardando. Vuelve a intentar abrir tu perfil.')),milliseconds);});
  return Promise.race([operation,timeout]).finally(()=>clearTimeout(timer));
}
