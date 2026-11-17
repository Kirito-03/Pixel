import { contentProgressSync, currentProgressScope } from '../services/contentProgressSync';
export interface MangaReadingProgress { chapterId:string; chapterNumber:string; updatedAt:number; }
export async function saveMangaProgress(mangaId:string,chapterId:string,chapterNumber?:string|null,profileId?:number):Promise<void> {
  if(!mangaId||!chapterId||!profileId)return;
  await contentProgressSync.save(currentProgressScope(profileId),'manga',mangaId,{chapterId,chapterNumber:String(chapterNumber??'').trim()});
}
export async function getAllMangaProgress(profileId?:number):Promise<Record<string,MangaReadingProgress>> {
  if(!profileId)return{};
  const state=await contentProgressSync.read(currentProgressScope(profileId));
  return Object.fromEntries(Object.values(state.records).filter(row=>row.kind==='manga').map(row=>[row.id,{chapterId:row.chapterId!,chapterNumber:row.chapterNumber!,updatedAt:row.updatedAt}]));
}
export async function getMangaProgress(mangaId:string,profileId?:number):Promise<MangaReadingProgress|null> {
  return (await getAllMangaProgress(profileId))[mangaId]||null;
}
