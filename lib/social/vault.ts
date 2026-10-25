import "server-only";
import {createCipheriv,createDecipheriv,createHash,randomBytes,scrypt,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";

const derive=promisify(scrypt);
const prefix="relai:social:v1:";
export class SocialError extends Error {
 constructor(message:string,public status=500,public code="unavailable"){super(message);}
}
export const randomSecret=()=>randomBytes(32).toString("base64url");
export const digest=(text:string)=>createHash("sha256").update(text).digest("hex");
export const key=(value:string)=>prefix+value;

function encryptionKey(){
 const value=process.env.RELAI_TOKEN_ENCRYPTION_KEY??"";
 if(!/^[a-f\d]{64}$/i.test(value))throw new SocialError("Le chiffrement des connexions doit être configuré.",503,"setup");
 return Buffer.from(value,"hex");
}
export function seal(value:unknown,context:string){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
 cipher.setAAD(Buffer.from(context));
 const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
export function unseal<T>(value:string,context:string):T{
 try{
  const [version,iv,tag,data,...rest]=value.split(".");
  if(version!=="v1"||!iv||!tag||!data||rest.length)throw new Error("format");
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
  decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(tag,"base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8")) as T;
 }catch{throw new SocialError("La connexion conservée ne peut pas être lue. Vérifiez la clé de chiffrement du serveur.",503,"vault");}
}

export function validPasswordHash(value:string){return /^scrypt:[a-f\d]{32}:[a-f\d]{128}$/i.test(value);}
export async function verifyPassword(password:string){
 const hash=process.env.RELAI_ADMIN_PASSWORD_HASH??"";
 if(!validPasswordHash(hash))throw new SocialError("L’accès administrateur doit être configuré.",503,"setup");
 const [,salt,expected]=hash.split(":");
 const actual=await derive(password,salt,64) as Buffer;
 return timingSafeEqual(actual,Buffer.from(expected,"hex"));
}

export async function redis<T=unknown>(...command:(string|number)[]):Promise<T>{
 const rawUrl=process.env.UPSTASH_REDIS_REST_URL??process.env.KV_REST_API_URL;
 const token=process.env.UPSTASH_REDIS_REST_TOKEN??process.env.KV_REST_API_TOKEN;
 if(!rawUrl||!token)throw new SocialError("Le stockage sécurisé des connexions doit être configuré.",503,"setup");
 let url:URL;
 try{url=new URL(rawUrl);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("url");}catch{throw new SocialError("L’adresse du stockage sécurisé est invalide.",503,"setup");}
 try{
  const response=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(command),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
  const data=await response.json() as {result?:T;error?:string};
  if(!response.ok||data.error||!("result" in data))throw new Error("storage");
  return data.result as T;
 }catch{throw new SocialError("Le stockage des connexions est momentanément indisponible. Réessayez.",503,"storage");}
}

export async function rateLimit(id:string,maximum:number,seconds:number){
 const count=await redis<number>("EVAL","local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",1,key("rate:"+digest(id)),seconds);
 if(count>maximum)throw new SocialError("Trop de tentatives. Réessayez dans quelques minutes.",429,"rate_limit");
}

export async function withProviderLock<T>(provider:string,action:()=>Promise<T>){
 const lockKey=key("lock:"+provider),value=randomSecret();
 if(await redis("SET",lockKey,value,"NX","EX",90)!=="OK")throw new SocialError("Une opération sur ce réseau est déjà en cours. Réessayez.",409,"busy");
 try{return await action();}
 finally{await redis("EVAL","if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lockKey,value);}
}
