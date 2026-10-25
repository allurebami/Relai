import {requestStudio} from "../lib/local-studio";
import {Content,Draft,Format,platformNames} from "./types";

export const slug=(name:string)=>name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"contenu";
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.rel="noopener";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function fileMetadata(file:File):Promise<{width:number;height:number;duration?:number}>{
 const url=URL.createObjectURL(file);
 try{
  if(file.type.startsWith("image/")){const image=new Image();image.src=url;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};}
  return await new Promise((resolve,reject)=>{const video=document.createElement("video");video.preload="metadata";video.onloadedmetadata=()=>{if(!Number.isFinite(video.duration)){reject(new Error("La durée de la vidéo est inconnue."));return;}resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});};video.onerror=()=>reject(new Error("Ce navigateur ne peut pas lire cette vidéo. Essayez un fichier MP4."));video.src=url;});
 }finally{URL.revokeObjectURL(url);}
}
function dimensions(format:Format,video=false){const n=video?720:1080;return format==="vertical"?[n,Math.round(n*16/9)]:format==="landscape"?[Math.round(n*16/9),n]:[n,n];}
function drawFitted(ctx:CanvasRenderingContext2D,source:CanvasImageSource,sw:number,sh:number,w:number,h:number){
 ctx.fillStyle="#14271f";ctx.fillRect(0,0,w,h);
 const cover=Math.max(w/sw,h/sh);ctx.save();ctx.filter="blur(28px) brightness(0.65)";ctx.drawImage(source,(w-sw*cover)/2-30,(h-sh*cover)/2-30,sw*cover+60,sh*cover+60);ctx.restore();
 const fit=Math.min(w/sw,h/sh);ctx.drawImage(source,(w-sw*fit)/2,(h-sh*fit)/2,sw*fit,sh*fit);
}
export async function adaptImage(blob:Blob,format:Format){
 if(format==="original")return blob;
 const bitmap=await createImageBitmap(blob);const [w,h]=dimensions(format);const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext("2d");if(!ctx)throw new Error("L’export d’image n’est pas disponible.");
 drawFitted(ctx,bitmap,bitmap.width,bitmap.height,w,h);bitmap.close();
 return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("L’image n’a pas pu être exportée.")),"image/jpeg",0.94));
}
export async function adaptVideo(blob:Blob,format:Format,start:number,length:number,onProgress:(n:number)=>void,signal:AbortSignal):Promise<Blob>{
 if(!window.MediaRecorder)throw new Error("L’export vidéo nécessite un navigateur compatible avec MediaRecorder.");
 const type=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
 if(!type)throw new Error("Ce navigateur ne propose pas de format d’export vidéo compatible.");
 const url=URL.createObjectURL(blob);const video=document.createElement("video");video.playsInline=true;video.preload="auto";video.src=url;
 let audio:AudioContext|undefined;let recorder:MediaRecorder|undefined;let animation=0;let stream:MediaStream|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(new Error("La vidéo ne peut pas être décodée."));});
  const end=Math.min(start+length,video.duration);if(start>=end)throw new Error("L’extrait choisi est vide.");
  if(start>0){video.currentTime=start;await new Promise<void>(r=>{video.onseeked=()=>r();});}
  const canvas=document.createElement("canvas");const [w,h]=format==="original"?[video.videoWidth,video.videoHeight]:dimensions(format,true);canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("L’export vidéo n’est pas disponible.");
  drawFitted(ctx,video,video.videoWidth,video.videoHeight,w,h);stream=canvas.captureStream(25);
  audio=new AudioContext();await audio.resume();const source=audio.createMediaElementSource(video);const dest=audio.createMediaStreamDestination();source.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream!.addTrack(t));
  recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:3_500_000});const chunks:BlobPart[]=[];
  return await new Promise<Blob>((resolve,reject)=>{
   const abort=()=>{video.pause();if(recorder?.state!=="inactive")recorder?.stop();reject(new Error("Export annulé."));};
   signal.addEventListener("abort",abort,{once:true});
   recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder!.onerror=()=>reject(new Error("L’encodage vidéo a échoué."));
   recorder!.onstop=()=>{signal.removeEventListener("abort",abort);if(!signal.aborted)resolve(new Blob(chunks,{type:type.split(";")[0]}));};
   const frame=()=>{if(signal.aborted)return;drawFitted(ctx,video,video.videoWidth,video.videoHeight,w,h);onProgress(Math.min(99,Math.round((video.currentTime-start)/(end-start)*100)));if(video.currentTime>=end||video.ended){video.pause();if(recorder?.state!=="inactive")recorder?.stop();}else animation=requestAnimationFrame(frame);};
   video.onended=()=>{if(recorder?.state!=="inactive")recorder?.stop();};
   recorder!.start(500);video.play().then(()=>{animation=requestAnimationFrame(frame);}).catch(reject);
  });
 }finally{cancelAnimationFrame(animation);video.pause();if(recorder?.state!=="inactive")recorder?.stop();stream?.getTracks().forEach(t=>t.stop());if(audio&&audio.state!=="closed")await audio.close();URL.revokeObjectURL(url);video.removeAttribute("src");video.load();}
}
const esc=(s:string)=>s.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
const stamp=(date:string)=>new Date(date).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z/,"Z");
function fold(line:string){const encoder=new TextEncoder();let part="",result="";for(const char of line){if(encoder.encode(part+char).length>73){result+=part+"\r\n ";part="";}part+=char;}return result+part;}
export function calendarFile(drafts:Draft[],contents:Content[]){
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Relai//Studio//FR","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
 for(const d of drafts.filter(d=>d.scheduledAt)){
  const c=contents.find(c=>c.id===d.contentId);if(!c)continue;
  lines.push("BEGIN:VEVENT","UID:"+d.id+"@relai.studio","DTSTAMP:"+stamp(new Date().toISOString()),"DTSTART:"+stamp(d.scheduledAt),"DTEND:"+stamp(new Date(Date.parse(d.scheduledAt)+30*60000).toISOString()),"SUMMARY:"+esc(platformNames[d.platform]+" · "+c.title),"DESCRIPTION:"+esc("Publication manuelle prévue.\n\n"+d.caption),"END:VEVENT");
 }
 lines.push("END:VCALENDAR");return new Blob([lines.map(fold).join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"});
}
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return (crc^0xffffffff)>>>0;}
export async function zipFile(files:{name:string;blob:Blob}[]){
 const encoder=new TextEncoder();const parts:BlobPart[]=[];const central:BlobPart[]=[];let offset=0,centralSize=0;
 const header=(n:number)=>{const bytes=new Uint8Array(n);return {bytes,view:new DataView(bytes.buffer)};};
 for(const file of files){
  const name=encoder.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(data);const h=header(30);h.view.setUint32(0,0x04034b50,true);h.view.setUint16(4,20,true);h.view.setUint16(6,0x800,true);h.view.setUint32(14,crc,true);h.view.setUint32(18,data.length,true);h.view.setUint32(22,data.length,true);h.view.setUint16(26,name.length,true);
  parts.push(h.bytes.buffer,name.buffer as ArrayBuffer,data.buffer);
  const c=header(46);c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x800,true);c.view.setUint32(16,crc,true);c.view.setUint32(20,data.length,true);c.view.setUint32(24,data.length,true);c.view.setUint16(28,name.length,true);c.view.setUint32(42,offset,true);
  central.push(c.bytes.buffer,name.buffer as ArrayBuffer);centralSize+=46+name.length;offset+=30+name.length+data.length;
 }
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
 return new Blob([...parts,...central,end.bytes.buffer],{type:"application/zip"});
}
export async function contentPack(content:Content,drafts:Draft[]){
 const files:{name:string;blob:Blob}[]=[];const cache=new Map<Format,Blob>();
 let original:Blob|undefined;if(content.fileId){const r=await requestStudio("/api/media/"+content.fileId);if(!r.ok)throw new Error("Le média original est indisponible.");original=await r.blob();}
 for(const d of drafts){files.push({name:d.platform+"/legende.txt",blob:new Blob([d.caption],{type:"text/plain;charset=utf-8"})});if(original&&content.kind==="image"){if(!cache.has(d.format))cache.set(d.format,await adaptImage(original,d.format));const adapted=cache.get(d.format)!;files.push({name:d.platform+"/visuel."+(adapted.type==="image/jpeg"?"jpg":adapted.type==="image/png"?"png":"webp"),blob:adapted});}}
 if(original&&content.kind==="video")files.push({name:"video-originale."+({"video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm"}[original.type]??"mp4"),blob:original});
 files.push({name:"planning.ics",blob:calendarFile(drafts,[content])},{name:"informations.json",blob:new Blob([JSON.stringify({content,drafts},null,2)],{type:"application/json"})},{name:"LISEZ-MOI.txt",blob:new Blob(["Relai · Pack de diffusion\n\nLes légendes sont modifiables. Les images sont adaptées aux formats choisis avec un fond flouté.\nPour les vidéos, le pack contient le fichier original ; exportez chaque extrait adapté depuis l’éditeur.\nLes dates du calendrier correspondent à des publications manuelles. Aucun contenu n’a été publié automatiquement.\n"],{type:"text/plain;charset=utf-8"})});
 return zipFile(files);
}
