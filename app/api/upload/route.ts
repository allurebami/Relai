import {bucket,checkOrigin,json} from "../_shared";
export const dynamic="force-dynamic";
const types=new Set(["image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"]);
export async function POST(req:Request){
 const blocked=checkOrigin(req);if(blocked)return blocked;
 try{
  if(Number(req.headers.get("content-length"))>41*1024*1024)return json({error:"Le fichier doit faire moins de 40 Mo."},413);
  const form=await req.formData();const file=form.get("file");
  if(!(file instanceof File)||!file.size)return json({error:"Sélectionnez un fichier."},400);
  if(file.size>40*1024*1024)return json({error:"Le fichier doit faire moins de 40 Mo."},413);
  if(!types.has(file.type))return json({error:"Formats acceptés : JPG, PNG, WebP, MP4, WebM et MOV."},400);
  const id=crypto.randomUUID();
  await bucket().put("media/"+id,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{name:file.name.slice(0,255)}});
  return json({fileId:id,fileName:file.name.slice(0,255),mime:file.type,size:file.size});
 }catch{return json({error:"L’import du média a échoué. Réessayez."},500);}
}
