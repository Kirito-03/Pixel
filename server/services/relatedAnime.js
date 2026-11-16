import {withSpanishSynopses} from './spanishSynopsisService.js';
// Rank the full active catalog rather than repeatedly returning the newest genre rows.
export async function getRelatedAnime(pool,id) {
 if(!Number.isSafeInteger(id)||id<=0)return [];
 const current=await pool.query('SELECT genres,release_date FROM anime_content WHERE id=$1 AND is_active=true',[id]);
 if(!current.rows[0])return [];
 const genres=Array.isArray(current.rows[0].genres)?current.rows[0].genres.map(g=>String(g).toLowerCase()):[];
 if(!genres.length)return [];
 const year=current.rows[0].release_date?new Date(current.rows[0].release_date).getUTCFullYear():null;
 const result=await pool.query(`WITH candidates AS (
  SELECT id,tmdb_id,title,title_english,title_japanese,franchise_key,poster_url,banner_url,genres,status,total_episodes,rating,release_date,
   description,
   (SELECT COUNT(*) FROM unnest(COALESCE(genres,ARRAY[]::text[])) g WHERE lower(g)=ANY($2::text[]))::float AS overlap,
   cardinality(COALESCE(genres,ARRAY[]::text[])) AS genre_count
  FROM anime_content WHERE is_active=true AND id<>$1::bigint AND NULLIF(trim(poster_url),'') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(genres,ARRAY[]::text[])) g WHERE lower(g) IN ('hentai','adult','18+','erotica','nsfw','r18','r-18','h_anime','pornographic'))
 ) SELECT id,tmdb_id,title,title_english,title_japanese,franchise_key,poster_url,banner_url,genres,status,total_episodes,rating,release_date,description
 FROM candidates WHERE overlap>0
 ORDER BY overlap/GREATEST(genre_count+cardinality($2::text[])-overlap,1) DESC,
 ABS(EXTRACT(YEAR FROM release_date)-$3::int) ASC NULLS LAST, rating DESC NULLS LAST, md5(id::text||':'||$1::text)
 LIMIT 40`,[id,genres,Number.isFinite(year)?year:null]);
 const localized=await withSpanishSynopses(pool,result.rows);
 return localized.map(({description_original,description_es,...row})=>({...row,description:String(row.description||'').slice(0,240)}));
}
