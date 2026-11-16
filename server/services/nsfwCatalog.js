import { statusAliases } from './catalogStatus.js';
export async function getNSFWCatalog(pool, {search='',status='',category='',page=1,limit=50}={}) {
 const p=Math.max(1,Math.min(100000,Math.floor(Number(page)||1))), size=Math.min(50,Math.max(1,Math.floor(Number(limit)||50)));
 const params=[], where=['is_active = true'];
 if(status && !['Todos','Nuevos caps'].includes(status)){params.push(statusAliases(status));where.push(`lower(trim(status)) = ANY($${params.length}::text[])`);}
 if(String(search).trim()){params.push('%'+String(search).trim().slice(0,200)+'%');where.push(`title ILIKE $${params.length}`);}
 if(String(category).trim()){params.push(String(category).trim());where.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(genres::jsonb, '[]'::jsonb)) g WHERE lower(trim(g))=lower($${params.length}))`);}
 const predicate=where.join(' AND ');
 const count=await pool.query(`SELECT COUNT(*)::int AS total FROM hentai_content WHERE ${predicate}`,params);
 const total=Number(count.rows[0]?.total)||0;
 const rows=await pool.query(`SELECT id::TEXT, slug, title, poster_url as poster_path, status, synopsis, genres, is_active FROM hentai_content WHERE ${predicate} ORDER BY updated_at DESC, id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,size,(p-1)*size]);
 const categories=await pool.query(`SELECT DISTINCT trim(g) AS category FROM hentai_content CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(genres::jsonb,'[]'::jsonb)) g WHERE is_active=true AND trim(g)<>'' ORDER BY category`);
 return {items:rows.rows.map(row=>({...row,type:'hentai',is_nsfw:true})),pagination:{page:p,limit:size,total,totalPages:Math.max(1,Math.ceil(total/size))},categories:categories.rows.map(row=>row.category)};
}
