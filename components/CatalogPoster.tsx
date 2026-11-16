import React from 'react';
import {Image} from 'react-native';
export type PosterProps={uri:string;width:number;height:number;onError:()=>void};
export default function CatalogPoster({uri,width,height,onError}:PosterProps){
 return <Image accessible={false} source={{uri}} style={{width,height}} resizeMode="cover" onError={onError}/>;
}
