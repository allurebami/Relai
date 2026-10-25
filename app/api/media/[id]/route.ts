import {bucket,checkOrigin,json,validId} from "../../_shared";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!validId(id))return json({error:"Média introuvable."},404);
 try{
  const object=await bucket().get("media/"+id,{range:req.headers});
  if(!object)return json({error:"Média introuvable."},404);
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("ETag",object.httpEtag);headers.set("Cache-Control","private, max-age=300");headers.set("Accept-Ranges","bytes");headers.set("X-Content-Type-Options","nosniff");
  if("range" in object&&object.range&&"offset" in object.range){const r=object.range as {offset:number;length:number};headers.set("Content-Range","bytes "+r.offset+"-"+(r.offset+r.length-1)+"/"+object.size);headers.set("Content-Length",String(r.length));return new Response(object.body,{status:206,headers});}
  headers.set("Content-Length",String(object.size));return new Response(object.body,{headers});
 }catch{return json({error:"Lecture du média impossible."},500);}
}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=checkOrigin(req);if(blocked)return blocked;const {id}=await params;
 if(!validId(id))return json({error:"Média introuvable."},404);
 try{await bucket().delete("media/"+id);return json({ok:true});}catch{return json({error:"Suppression du média impossible."},500);}
}
