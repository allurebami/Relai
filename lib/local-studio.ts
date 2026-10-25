import {emptyStudio,newId,type Studio} from "../app/types";
import {stateSchema} from "./studio-schema";

type SavedStudio={state:Studio;version:number};
type SavedMedia={blob:Blob;fileName:string;mime:string;size:number};
let databasePromise:Promise<IDBDatabase>|undefined;
const response=(body:unknown,status=200)=>Response.json(body,{status});
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function openDatabase():Promise<IDBDatabase>{
 if(typeof indexedDB==="undefined")return Promise.reject(new Error("Ce navigateur ne permet pas la sauvegarde locale. Essayez un autre navigateur."));
 if(!databasePromise){
  databasePromise=new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open("relai-studio-v1",1);
   request.onupgradeneeded=()=>{
    const database=request.result;
    if(!database.objectStoreNames.contains("studio"))database.createObjectStore("studio");
    if(!database.objectStoreNames.contains("media"))database.createObjectStore("media");
   };
   request.onsuccess=()=>{const database=request.result;database.onversionchange=()=>{database.close();databasePromise=undefined;};resolve(database);};
   request.onerror=()=>{databasePromise=undefined;reject(request.error??new Error("Le stockage local est indisponible."));};
   request.onblocked=()=>{databasePromise=undefined;reject(new Error("Fermez les autres onglets Relai puis réessayez."));};
  });
 }
 return databasePromise;
}

async function transaction<T>(store:"studio"|"media",mode:IDBTransactionMode,action:(store:IDBObjectStore,result:(value:T)=>void)=>void):Promise<T>{
 const database=await openDatabase();
 return new Promise<T>((resolve,reject)=>{
  const tx=database.transaction(store,mode);let result:T;
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(tx.error??new Error("La sauvegarde locale a été interrompue."));
  tx.onerror=()=>reject(tx.error??new Error("La sauvegarde locale a échoué."));
  try{action(tx.objectStore(store),value=>{result=value;});}catch(error){tx.abort();reject(error);}
 });
}

export async function localMedia(fileId:string):Promise<SavedMedia|null>{
 if(!validId(fileId))return null;
 return transaction<SavedMedia|null>("media","readonly",(store,result)=>{
  const request=store.get(fileId);request.onsuccess=()=>result((request.result as SavedMedia|undefined)??null);
 });
}

async function readStudio(){
 return transaction<SavedStudio>("studio","readwrite",(store,result)=>{
  const request=store.get("workspace");
  request.onsuccess=()=>{
   let saved=request.result as SavedStudio|undefined;
   if(!saved){saved={state:structuredClone(emptyStudio),version:0};store.put(saved,"workspace");}
   result(saved);
  };
 });
}

export async function requestStudio(path:string,init?:RequestInit):Promise<Response>{
 try{
  const method=(init?.method??"GET").toUpperCase();
  if(path==="/api/studio"&&method==="GET")return response(await readStudio());
  if(path==="/api/studio"&&method==="PUT"){
   if(typeof init?.body!=="string"||init.body.length>3_000_000)return response({error:"Le studio dépasse la taille autorisée."},413);
   const raw=JSON.parse(init.body) as {state?:unknown;version?:unknown};
   const parsed=stateSchema.safeParse(raw.state);
   if(!parsed.success||!Number.isSafeInteger(raw.version)||Number(raw.version)<0)return response({error:"Certaines données du studio sont invalides."},400);
   const state=parsed.data as Studio;
   const ids=new Set(state.contents.map(c=>c.id));
   if(state.drafts.some(d=>!ids.has(d.contentId)))return response({error:"Une déclinaison référence un contenu absent."},400);
   if(state.drafts.some(d=>d.status==="scheduled"&&(!d.scheduledAt||!Number.isFinite(Date.parse(d.scheduledAt)))))return response({error:"Choisissez une date valide."},400);
   const saved=await transaction<SavedStudio|null>("studio","readwrite",(store,result)=>{
    const request=store.get("workspace");request.onsuccess=()=>{
     const current=request.result as SavedStudio|undefined;
     if((current?.version??0)!==raw.version){result(null);return;}
     const next={state,version:Number(raw.version)+1};store.put(next,"workspace");result(next);
    };
   });
   return saved?response(saved):response({error:"Le studio a changé dans un autre onglet. Rechargez avant de réessayer."},409);
  }
  if(path==="/api/upload"&&method==="POST"){
   const file=init?.body instanceof FormData?init.body.get("file"):null;
   if(!(file instanceof File)||!file.size)return response({error:"Sélectionnez un fichier."},400);
   if(file.size>40*1024*1024)return response({error:"Le fichier doit faire moins de 40 Mo."},413);
   if(!["image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"].includes(file.type))return response({error:"Formats acceptés : JPG, PNG, WebP, MP4, WebM et MOV."},400);
   const id=newId();
   const media:SavedMedia={blob:file.slice(0,file.size,file.type),fileName:file.name.slice(0,255),mime:file.type,size:file.size};
   await transaction<void>("media","readwrite",(store,result)=>{store.put(media,id);result(undefined);});
   return response({fileId:id,fileName:media.fileName,mime:media.mime,size:media.size});
  }
  if(path.startsWith("/api/media/")){
   const id=path.slice("/api/media/".length);if(!validId(id))return response({error:"Média introuvable."},404);
   if(method==="DELETE"){
    await transaction<void>("media","readwrite",(store,result)=>{store.delete(id);result(undefined);});return response({ok:true});
   }
   if(method==="GET"){
    const media=await localMedia(id);if(!media)return response({error:"Média introuvable."},404);
    return new Response(media.blob,{headers:{"Content-Type":media.mime,"Content-Length":String(media.size)}});
   }
  }
  return response({error:"Opération inconnue."},404);
 }catch(error){
  const quota=error instanceof DOMException&&error.name==="QuotaExceededError";
  return response({error:quota?"Le stockage de ce navigateur est plein. Exportez vos médias puis libérez de la place.":"La sauvegarde locale a échoué. Vos modifications n’ont pas été enregistrées."},quota?507:500);
 }
}
