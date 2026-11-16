import React from 'react';
import type {PosterProps} from './CatalogPoster';
export default function CatalogPoster({uri,width,height,onError}:PosterProps){
 return <img src={uri} width={width} height={height} loading="lazy" decoding="async" draggable={false} alt="" onError={onError} style={{width,height,objectFit:'cover',display:'block'}}/>;
}
