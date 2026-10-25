import "server-only";
import {platforms,type Platform} from "../../app/types";
import type {ConnectionSummary,SocialStatus} from "./catalog";
import {authorizationUrl,exchangeCode,providerConfigured,ProviderError,readAccounts,refreshIfNeeded,type SavedConnection} from "./providers";
import {digest,key,randomSecret,rateLimit,redis,seal,SocialError,unseal,validPasswordHash,verifyPassword,withProviderLock} from "./vault";

const sessionSeconds=12*60*60;
const headers={"Cache-Control":"no-store, private","Vary":"Cookie","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{...headers,...extra}});
const validProvider=(value:string):value is Platform=>platforms.includes(value as Platform);
const connectionKey=(provider:Platform)=>key("connection:"+provider);
type AuthorizationState={provider:Platform;session:string;verifier:string;redirectUri:string};

function appOrigin():string|null{
 try{
  const url=new URL(process.env.RELAI_APP_URL??"");
  const local=["localhost","127.0.0.1"].includes(url.hostname)&&process.env.NODE_ENV!=="production";
  if((url.protocol!=="https:"&&!(local&&url.protocol==="http:"))||url.username||url.password||url.search||url.hash||url.pathname!=="/")return null;
  return url.origin;
 }catch{return null;}
}
function setup(){
 let storage=false;
 try{const url=new URL(process.env.UPSTASH_REDIS_REST_URL??process.env.KV_REST_API_URL??"");storage=url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash&&Boolean(process.env.UPSTASH_REDIS_REST_TOKEN??process.env.KV_REST_API_TOKEN);}catch{/* Not configured yet. */}
 return {appUrl:Boolean(appOrigin()),storage,encryption:/^[a-f\d]{64}$/i.test(process.env.RELAI_TOKEN_ENCRYPTION_KEY??""),administrator:validPasswordHash(process.env.RELAI_ADMIN_PASSWORD_HASH??"")};
}
function requireSetup(){if(!Object.values(setup()).every(Boolean))throw new SocialError("L’administrateur doit terminer la configuration sécurisée des réseaux sociaux.",503,"setup");}
function checkOrigin(request:Request){
 if(request.headers.get("origin")!==appOrigin()||new URL(request.url).origin!==appOrigin())throw new SocialError("Cette action doit être lancée depuis l’adresse officielle de Relai.",403,"origin");
}
function cookieName(){return appOrigin()?.startsWith("https:")?"__Host-relai_session":"relai_session";}
function cookie(value:string,age=sessionSeconds){return cookieName()+"="+value+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+age+(appOrigin()?.startsWith("https:")?"; Secure":"");}
async function session(request:Request){
 const value=(request.headers.get("cookie")??"").split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName()+"="))?.slice(cookieName().length+1);
 if(!value||!/^[-\w]{43}$/.test(value))return null;
 const id=digest(value);
 return await redis<string|null>("GET",key("session:"+id))===digest(process.env.RELAI_ADMIN_PASSWORD_HASH??"")?id:null;
}
async function requireSession(request:Request){const id=await session(request);if(!id)throw new SocialError("Ouvrez votre espace administrateur Relai pour gérer les comptes.",401,"session");return id;}
async function body(request:Request){
 if(!request.headers.get("content-type")?.startsWith("application/json"))throw new SocialError("La demande est invalide.",400,"invalid_request");
 const text=await request.text();if(text.length>8192)throw new SocialError("La demande est trop volumineuse.",413,"invalid_request");
 try{return JSON.parse(text) as Record<string,unknown>;}catch{throw new SocialError("La demande est invalide.",400,"invalid_request");}
}
function savedStatus(provider:Platform,saved:SavedConnection|null,ready:boolean):ConnectionSummary{
 const configured=ready&&providerConfigured(provider);
 if(!saved)return {provider,configured,status:configured?"disconnected":"unconfigured",accounts:[]};
 const expired=Boolean(saved.grant.expiresAt&&Date.parse(saved.grant.expiresAt)<=Date.now());
 const renewable=Boolean(saved.grant.refreshToken&&(provider==="youtube"||provider==="tiktok")&&(!saved.grant.refreshExpiresAt||Date.parse(saved.grant.refreshExpiresAt)>Date.now()));
 return {provider,configured,status:saved.reconnect?"reconnect":expired?(renewable?"verify":"reconnect"):"connected",accounts:saved.accounts,connectedAt:saved.connectedAt,checkedAt:saved.checkedAt,expiresAt:saved.grant.expiresAt};
}
async function status(request:Request){
 const settings=setup(),ready=Object.values(settings).every(Boolean),authenticated=ready&&Boolean(await session(request));
 const values=authenticated?await redis<(string|null)[]>("MGET",...platforms.map(connectionKey)):platforms.map(()=>null);
 const result:SocialStatus={ready,authenticated,appOrigin:appOrigin(),setup:settings,connections:platforms.map((provider,i)=>savedStatus(provider,values[i]?unseal<SavedConnection>(values[i]!,connectionKey(provider)):null,ready))};
 return json(result);
}
async function readConnection(provider:Platform){
 const value=await redis<string|null>("GET",connectionKey(provider));
 return value?unseal<SavedConnection>(value,connectionKey(provider)):null;
}
async function writeConnection(saved:SavedConnection){await redis("SET",connectionKey(saved.provider),seal(saved,connectionKey(saved.provider)));}

async function callback(request:Request,provider:Platform){
 requireSetup();
 // This GET is a cross-site OAuth return. The one-use state and same browser session
 // replace the Origin check used by all mutating requests from the app.
 if(new URL(request.url).origin!==appOrigin())throw new SocialError("Adresse de retour non reconnue.",400,"state");
 const id=await requireSession(request),url=new URL(request.url),state=url.searchParams.get("state")??"";
 if(!/^[-\w]{43}$/.test(state))throw new SocialError("Cette autorisation a expiré. Recommencez la connexion.",400,"state");
 const stateKey=key("oauth:"+digest(state)),encrypted=await redis<string|null>("GET",stateKey);
 if(!encrypted)throw new SocialError("Cette autorisation a expiré ou a déjà été utilisée.",400,"state");
 const saved=unseal<AuthorizationState>(encrypted,stateKey);
 if(saved.provider!==provider||saved.session!==id)throw new SocialError("Cette autorisation ne correspond pas à votre session.",400,"state");
 if(await redis("GETDEL",stateKey)!==encrypted)throw new SocialError("Cette autorisation a déjà été utilisée.",400,"state");
 if(url.searchParams.has("error"))throw new SocialError("L’autorisation a été annulée.",400,"cancelled");
 const code=url.searchParams.get("code");if(!code||code.length>4096)throw new SocialError("Le réseau n’a pas fourni de code d’autorisation.",400,"invalid_request");
 await withProviderLock(provider,async()=>{
  const grant=await exchangeCode(provider,code,saved.redirectUri,saved.verifier),accounts=await readAccounts(provider,grant);
  if(!accounts.length)throw new SocialError("Aucun compte, Page ou chaîne accessible n’a été trouvé. Vérifiez le compte choisi.",400,"no_accounts");
  const now=new Date().toISOString();await writeConnection({provider,grant,accounts,connectedAt:now,checkedAt:now});
 });
}
function callbackRedirect(provider:Platform,error?:SocialError){
 const origin=appOrigin();if(!origin)return json({error:"Configurez l’adresse officielle de Relai.",code:"setup"},503);
 const url=new URL("/",origin);url.searchParams.set("social",error?"error":"connected");url.searchParams.set("network",provider);
 if(error)url.searchParams.set("reason",error.code);url.hash="connections";
 return new Response(null,{status:303,headers:{...headers,Location:url.href}});
}

export async function handleSocial(request:Request,path:string[]):Promise<Response>{
 const [action,network,...extra]=path,provider=network&&validProvider(network)?network:null;
 const isCallback=action==="callback"&&provider&&request.method==="GET"&&!extra.length;
 try{
  if(extra.length)return json({error:"Cette opération n’existe pas."},404);
  if(action==="status"&&!network&&request.method==="GET")return await status(request);
  if(isCallback){await callback(request,provider);return callbackRedirect(provider);}
  if(!["POST","DELETE"].includes(request.method))return json({error:"Cette opération n’existe pas."},404);
  requireSetup();checkOrigin(request);
  if(action==="session"&&!network&&request.method==="POST"){
   const address=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
   await rateLimit("login-ip:"+address,10,900);await rateLimit("login-global",100,900);
   const data=await body(request);
   if(typeof data?.password!=="string"||data.password.length<16||data.password.length>1024||!await verifyPassword(data.password))throw new SocialError("Le mot de passe de cet espace Relai est incorrect.",401,"invalid_credentials");
   const old=await session(request);if(old)await redis("DEL",key("session:"+old));
   const token=randomSecret();await redis("SET",key("session:"+digest(token)),digest(process.env.RELAI_ADMIN_PASSWORD_HASH!),"EX",sessionSeconds);
   return json({ok:true},200,{"Set-Cookie":cookie(token)});
  }
  const id=await requireSession(request);
  if(action==="session"&&!network&&request.method==="DELETE"){
   await redis("DEL",key("session:"+id));return json({ok:true},200,{"Set-Cookie":cookie("",0)});
  }
  if(!provider)return json({error:"Réseau inconnu."},404);
  if(action==="connect"&&request.method==="POST"){
   if(!providerConfigured(provider))throw new SocialError("L’intégration de ce réseau doit être configurée dans Vercel.",503,"provider_setup");
   await rateLimit("connect:"+id,30,600);
   const state=randomSecret(),verifier=randomSecret(),redirectUri=appOrigin()+"/api/social/callback/"+provider,stateKey=key("oauth:"+digest(state));
   const url=authorizationUrl(provider,redirectUri,state,verifier);
   await redis("SET",stateKey,seal({provider,session:id,verifier,redirectUri} satisfies AuthorizationState,stateKey),"EX",600,"NX");
   return json({url});
  }
  if(action==="connection"&&request.method==="DELETE"){
   await withProviderLock(provider,async()=>{await redis("DEL",connectionKey(provider));});
   // Remove all credentials held by Relai. Provider-side revocation is offered
   // separately through the official permissions settings, without false claims.
   return json({ok:true,providerRevoked:false});
  }
  if(action==="check"&&request.method==="POST"){
   await rateLimit("check:"+id,30,600);
   await withProviderLock(provider,async()=>{
    const current=await readConnection(provider);if(!current)throw new SocialError("Connectez d’abord ce réseau.",404,"disconnected");
    let renewed=current;
    try{
     const grant=await refreshIfNeeded(provider,current.grant);
     renewed={...current,grant};
     // Persist rotated refresh tokens before the profile request, so a transient
     // profile failure cannot discard a newly issued refresh token.
     if(grant!==current.grant)await writeConnection(renewed);
     const accounts=await readAccounts(provider,grant);if(!accounts.length)throw new ProviderError(provider,true);
     await writeConnection({...renewed,accounts,reconnect:false,checkedAt:new Date().toISOString()});
    }catch(error){if(error instanceof ProviderError&&error.reconnect)await writeConnection({...renewed,reconnect:true});throw error;}
   });
   return json({ok:true});
  }
  return json({error:"Cette opération n’existe pas."},404);
 }catch(error){
  const safe=error instanceof SocialError?error:new SocialError("La gestion des connexions est momentanément indisponible.",500);
  if(isCallback)return callbackRedirect(provider,safe);
  return json({error:safe.message,code:safe.code},safe.status);
 }
}
