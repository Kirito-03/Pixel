import {getCurrentBaseURL} from '../services/db/networkClient';
export function episodeThumbnailURL(value?:string){
 if(!value)return undefined;
 const match=value.match(/^https:\/\/pixelnosekai\.com\/api\/stream\/Anime\/(\d+)\/(\d+)\/thumb\.jpg$/);
 return match?`${getCurrentBaseURL().replace(/\/$/,'')}/api/episode-thumbnails/${match[1]}/${match[2]}`:value;
}
