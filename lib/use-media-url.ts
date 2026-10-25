"use client";
import {useEffect,useState} from "react";
import {localMedia} from "./local-studio";

export function useMediaUrl(fileId?:string){
 const [source,setSource]=useState<{id?:string;url?:string}>({});
 useEffect(()=>{
  let active=true;let url:string|undefined;
  if(fileId)localMedia(fileId).then(media=>{
   if(!active||!media)return;
   url=URL.createObjectURL(media.blob);setSource({id:fileId,url});
  }).catch(()=>{if(active)setSource({id:fileId});});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[fileId]);
 return source.id===fileId?source.url:undefined;
}
