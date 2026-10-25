import { env } from "cloudflare:workers";
// These endpoints are behind the owner-private Sites boundary.
export function db(){if(!env.DB)throw new Error("Base de données indisponible.");return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error("Stockage des médias indisponible.");return env.BUCKET;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}
export function checkOrigin(req:Request){
 const origin=req.headers.get("origin");const url=new URL(req.url);const forwarded=req.headers.get("x-forwarded-host");
 if(origin&&origin!==url.origin&&new URL(origin).host!==forwarded)return json({error:"Origine de la requête non autorisée."},403);
 return null;
}
export const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
