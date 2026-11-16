import {useEffect,useRef,useState,useCallback} from 'react';
export function usePlaybackLock(scope: string | number) {
 const [locked,setValue]=useState(false), lockedRef=useRef(false);
 const setLocked=useCallback((value:boolean)=>{lockedRef.current=value;setValue(value);},[]);
 useEffect(()=>{setLocked(false);},[scope,setLocked]);
 return {locked,lockedRef,setLocked};
}
