import express from 'express';
import pool from '../db.js';
import {createThumbnailCache} from '../services/episodeThumbnailCache.js';
const router=express.Router();
const getThumbnail=createThumbnailCache({load:async key=>{
 const [anime,episode]=key.split('/');
 const row=await pool.query('SELECT thumbnail_url FROM anime_episodes WHERE anime_id=$1 AND episode_number=$2 AND is_active=true LIMIT 1',[anime,episode]);
 const expected=`/api/stream/Anime/${anime}/${episode}/thumb.jpg`;
 if(!row.rows[0]?.thumbnail_url?.endsWith(expected))throw Error('Thumbnail unavailable');
 // Numeric paths only, fetched from the local Drive bridge; never proxy a supplied URL.
 const response=await fetch(`http://127.0.0.1:8086/Anime/${key}/thumb.jpg`,{signal:AbortSignal.timeout(12000)});
 if(!response.ok||Number(response.headers.get('content-length'))>512*1024)throw Error('Thumbnail unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512*1024)throw Error('Thumbnail too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}});
router.get('/:anime/:episode',async(req,res)=>{
 if(!/^\d{1,10}$/.test(req.params.anime)||!/^\d{1,6}$/.test(req.params.episode))return res.sendStatus(400);
 try{const data=await getThumbnail(`${Number(req.params.anime)}/${Number(req.params.episode)}`);res.set({'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}).send(data);}catch{res.set('Cache-Control','no-store').sendStatus(404);}
});
export default router;
