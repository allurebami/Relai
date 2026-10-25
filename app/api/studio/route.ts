import {z} from "zod";
import {emptyStudio} from "../../types";
import {checkOrigin,db,json} from "../_shared";
export const dynamic="force-dynamic";
const platform=z.enum(["instagram","tiktok","youtube","facebook","linkedin"]);
const format=z.enum(["vertical","square","landscape","original"]);
const kind=z.enum(["video","image","text"]);
const uid=z.string().uuid();
const stateSchema=z.object({
 workspace:z.string().trim().min(1).max(80),brand:z.string().max(80),cta:z.string().max(1000),
 contents:z.array(z.object({id:uid,title:z.string().trim().min(1).max(180),notes:z.string().max(10000),kind,brand:z.string().max(80),createdAt:z.string().datetime(),fileId:uid.optional(),fileName:z.string().max(255).optional(),mime:z.string().max(100).optional(),size:z.number().min(0).max(40*1024*1024).optional(),width:z.number().min(0).max(50000).optional(),height:z.number().min(0).max(50000).optional(),duration:z.number().min(0).max(86400).optional(),example:z.boolean().optional()})).max(1000),
 drafts:z.array(z.object({id:uid,contentId:uid,platform,caption:z.string().max(15000),format,status:z.enum(["draft","ready","scheduled","exported"]),scheduledAt:z.string().max(50),createdAt:z.string().datetime()})).max(5000),
 workflows:z.array(z.object({id:uid,name:z.string().trim().min(1).max(120),kinds:z.array(kind).min(1).max(3),targets:z.array(platform).min(1).max(5),formats:z.record(format),cta:z.string().max(1000),autoPrepare:z.boolean(),createdAt:z.string().datetime()})).max(100)
});
export async function GET(){
 try{
  await db().prepare("INSERT OR IGNORE INTO relai_studios (id,payload,version,updated_at) VALUES (?,?,0,?)").bind("private-workspace",JSON.stringify(emptyStudio),new Date().toISOString()).run();
  const row=await db().prepare("SELECT payload,version FROM relai_studios WHERE id=?").bind("private-workspace").first<{payload:string;version:number}>();
  return json({state:JSON.parse(row!.payload),version:row!.version});
 }catch{return json({error:"Le studio n’a pas pu être chargé. Réessayez."},503);}
}
export async function PUT(req:Request){
 const blocked=checkOrigin(req);if(blocked)return blocked;
 try{
  const raw=await req.text();if(raw.length>3_000_000)return json({error:"Le studio dépasse la taille autorisée."},413);
  const body=z.object({state:stateSchema,version:z.number().int().nonnegative()}).safeParse(JSON.parse(raw));
  if(!body.success)return json({error:"Certaines données du studio sont invalides."},400);
  const {state,version}=body.data;const ids=new Set(state.contents.map(c=>c.id));
  if(state.drafts.some(d=>!ids.has(d.contentId)))return json({error:"Une déclinaison référence un contenu absent."},400);
  for(const d of state.drafts)if(d.status==="scheduled"&&(!d.scheduledAt||!Number.isFinite(Date.parse(d.scheduledAt))))return json({error:"Choisissez une date valide."},400);
  const result=await db().prepare("UPDATE relai_studios SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(JSON.stringify(state),new Date().toISOString(),"private-workspace",version).run();
  if(!result.meta.changes)return json({error:"Le studio a changé dans un autre onglet. Rechargez avant de réessayer."},409);
  return json({state,version:version+1});
 }catch{return json({error:"Enregistrement impossible. Vos modifications n’ont pas été sauvegardées."},500);}
}
