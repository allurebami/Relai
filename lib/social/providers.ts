import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import {platformNames,type Platform} from "../../app/types";
import {socialCatalog,type SocialAccount} from "./catalog";
import {SocialError} from "./vault";

const credentials:Record<Platform,[string,string]>= {
 instagram:["INSTAGRAM_CLIENT_ID","INSTAGRAM_CLIENT_SECRET"],facebook:["FACEBOOK_CLIENT_ID","FACEBOOK_CLIENT_SECRET"],
 youtube:["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET"],tiktok:["TIKTOK_CLIENT_KEY","TIKTOK_CLIENT_SECRET"],linkedin:["LINKEDIN_CLIENT_ID","LINKEDIN_CLIENT_SECRET"]
};
const endpoints:Record<Platform,{authorize:string;token:string}>= {
 instagram:{authorize:"https://www.instagram.com/oauth/authorize",token:"https://api.instagram.com/oauth/access_token"},
 facebook:{authorize:"https://www.facebook.com/v25.0/dialog/oauth",token:"https://graph.facebook.com/v25.0/oauth/access_token"},
 youtube:{authorize:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token"},
 tiktok:{authorize:"https://www.tiktok.com/v2/auth/authorize/",token:"https://open.tiktokapis.com/v2/oauth/token/"},
 linkedin:{authorize:"https://www.linkedin.com/oauth/v2/authorization",token:"https://www.linkedin.com/oauth/v2/accessToken"}
};
export type Grant={accessToken:string;refreshToken?:string;expiresAt:string|null;refreshExpiresAt?:string;issuedAt:string;scopes:string[]};
export type SavedConnection={provider:Platform;grant:Grant;accounts:SocialAccount[];connectedAt:string;checkedAt:string;reconnect?:boolean};
export function providerConfigured(provider:Platform){return credentials[provider].every(name=>Boolean(process.env[name]?.trim()));}
function client(provider:Platform){
 const [id,secret]=credentials[provider].map(name=>process.env[name]?.trim());
 if(!id||!secret)throw new SocialError("L’application "+platformNames[provider]+" doit être configurée par l’administrateur.",503,"provider_setup");
 return {id,secret};
}
export function authorizationUrl(provider:Platform,redirectUri:string,state:string,verifier:string){
 const url=new URL(endpoints[provider].authorize),{id}=client(provider);
 url.search=new URLSearchParams({response_type:"code",[provider==="tiktok"?"client_key":"client_id"]:id,redirect_uri:redirectUri,state,scope:socialCatalog[provider].permissions.join(provider==="facebook"||provider==="instagram"||provider==="tiktok"?",":" ")}).toString();
 if(provider==="youtube"){
  url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent select_account");
  url.searchParams.set("code_challenge",createHash("sha256").update(verifier).digest("base64url"));url.searchParams.set("code_challenge_method","S256");
 }
 if(provider==="instagram"){url.searchParams.set("enable_fb_login","0");url.searchParams.set("force_authentication","1");}
 if(provider==="tiktok")url.searchParams.set("disable_auto_auth","1");
 return url.href;
}

export class ProviderError extends SocialError {
 constructor(provider:Platform,public reconnect=false){super(reconnect?"L’autorisation "+platformNames[provider]+" a expiré ou a été retirée. Reconnectez le compte.":platformNames[provider]+" n’a pas confirmé l’accès au compte. Vérifiez les autorisations de l’application et réessayez.",502,reconnect?"reconnect":"provider_error");}
}
type ObjectData=Record<string,unknown>;
async function providerJson(provider:Platform,url:string|URL,init?:RequestInit):Promise<ObjectData>{
 let response:Response;
 try{response=await fetch(url,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});}catch{throw new ProviderError(provider);}
 let data:ObjectData;
 try{data=await response.json() as ObjectData;}catch{throw new ProviderError(provider);}
 if(!data||typeof data!=="object")throw new ProviderError(provider);
 const error=data.error as string|{code?:string|number;type?:string}|undefined;
 const badTikTok=provider==="tiktok"&&typeof error==="object"&&error?.code!=="ok";
 const failed=typeof error==="string"||Boolean(error&&provider!=="tiktok")||badTikTok;
 if(!response.ok||failed){
  const code=typeof error==="object"?error?.code:error;
  throw new ProviderError(provider,response.status===401||response.status===403||["invalid_grant","invalid_token","access_token_invalid","access_token_expired",190,102].includes(code as string|number));
 }
 return data;
}
const expires=(seconds:unknown)=>typeof seconds==="number"&&seconds>0?new Date(Date.now()+seconds*1000).toISOString():null;
function grantFrom(data:ObjectData,provider:Platform,previous?:Grant):Grant{
 const parsed=z.object({access_token:z.string().min(1).max(32000),refresh_token:z.string().min(1).max(32000).optional(),expires_in:z.number().positive().optional(),refresh_expires_in:z.number().positive().optional(),scope:z.string().optional()}).safeParse(data);
 if(!parsed.success)throw new ProviderError(provider);
 const t=parsed.data;
 const scopes=t.scope?t.scope.split(/[\s,]+/).filter(Boolean):(previous?.scopes??socialCatalog[provider].permissions);
 if(!socialCatalog[provider].permissions.every(s=>scopes.includes(s)))throw new SocialError("Autorisez l’accès au profil demandé pour relier ce compte.",400,"permissions");
 return {accessToken:t.access_token,refreshToken:t.refresh_token??previous?.refreshToken,expiresAt:expires(t.expires_in),refreshExpiresAt:expires(t.refresh_expires_in)??previous?.refreshExpiresAt,issuedAt:new Date().toISOString(),scopes};
}
function postForm(provider:Platform,url:string,body:Record<string,string>){return providerJson(provider,url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body)});}
function api(provider:Platform,url:string|URL,token:string){return providerJson(provider,url,{headers:{Authorization:"Bearer "+token}});}

export async function exchangeCode(provider:Platform,code:string,redirectUri:string,verifier:string){
 const {id,secret}=client(provider);
 const body:Record<string,string>={grant_type:"authorization_code",code,redirect_uri:redirectUri,client_secret:secret,[provider==="tiktok"?"client_key":"client_id"]:id};
 if(provider==="youtube")body.code_verifier=verifier;
 let data=await postForm(provider,endpoints[provider].token,body);
 if(provider==="instagram"){
  const token=z.string().min(1).safeParse(data.access_token);if(!token.success)throw new ProviderError(provider);
  const url=new URL("https://graph.instagram.com/access_token");url.search=new URLSearchParams({grant_type:"ig_exchange_token",client_secret:secret,access_token:token.data}).toString();
  data=await providerJson(provider,url);
 }
 if(provider==="facebook"){
  const token=z.string().min(1).safeParse(data.access_token);if(!token.success)throw new ProviderError(provider);
  const url=new URL(endpoints.facebook.token);url.search=new URLSearchParams({grant_type:"fb_exchange_token",client_id:id,client_secret:secret,fb_exchange_token:token.data}).toString();
  data=await providerJson(provider,url);
 }
 return grantFrom(data,provider);
}

const account=z.object({id:z.string().min(1).max(256),name:z.string().min(1).max(300)});
export async function readAccounts(provider:Platform,grant:Grant):Promise<SocialAccount[]>{
 const token=grant.accessToken;
 try{
  if(provider==="youtube"){
   const data=await api(provider,"https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",token);
   const parsed=z.object({items:z.array(z.object({id:z.string(),snippet:z.object({title:z.string()})}))}).parse(data);
   return parsed.items.map(x=>({...account.parse({id:x.id,name:x.snippet.title}),kind:"channel" as const}));
  }
  if(provider==="tiktok"){
   const data=await api(provider,"https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",token);
   const parsed=z.object({data:z.object({user:z.object({open_id:z.string(),display_name:z.string()})})}).parse(data);
   return [{...account.parse({id:parsed.data.user.open_id,name:parsed.data.user.display_name}),kind:"profile"}];
  }
  if(provider==="linkedin"){
   const data=await api(provider,"https://api.linkedin.com/v2/userinfo",token);
   return [{...account.parse({id:data.sub,name:data.name}),kind:"profile"}];
  }
  if(provider==="instagram"){
   const data=await api(provider,"https://graph.instagram.com/v25.0/me?fields=user_id,username",token);
   return [{...account.parse({id:String(data.user_id??data.id??""),name:data.username}),kind:"profile"}];
  }
  const accounts:SocialAccount[]=[];let after:string|undefined;
  for(let page=0;page<10;page++){
   const url=new URL("https://graph.facebook.com/v25.0/me/accounts");url.search=new URLSearchParams({fields:"id,name",limit:"100",...(after?{after}:{})}).toString();
   const data=await api(provider,url,token);
   const parsed=z.object({data:z.array(account),paging:z.object({next:z.string().optional(),cursors:z.object({after:z.string().max(2048).optional()}).optional()}).optional()}).parse(data);
   accounts.push(...parsed.data.map(x=>({...x,kind:"page" as const})));
   if(!parsed.paging?.next)break;
   after=parsed.paging.cursors?.after;if(!after)throw new ProviderError(provider);
   if(page===9)throw new SocialError("Plus de 1 000 Pages ont été renvoyées. Limitez les Pages autorisées puis reconnectez Facebook.",400,"too_many_accounts");
  }
  return [...new Map(accounts.map(x=>[x.id,x])).values()];
 }catch(error){if(error instanceof SocialError)throw error;throw new ProviderError(provider);}
}

export async function refreshIfNeeded(provider:Platform,grant:Grant):Promise<Grant>{
 const remaining=grant.expiresAt?Date.parse(grant.expiresAt)-Date.now():Infinity;
 if(provider==="instagram"&&remaining>0&&remaining<7*86400000&&Date.now()-Date.parse(grant.issuedAt)>86400000){
  const url=new URL("https://graph.instagram.com/refresh_access_token");url.search=new URLSearchParams({grant_type:"ig_refresh_token",access_token:grant.accessToken}).toString();
  return grantFrom(await providerJson(provider,url),provider,grant);
 }
 if(remaining>90000)return grant;
 if((provider!=="youtube"&&provider!=="tiktok")||!grant.refreshToken||(grant.refreshExpiresAt&&Date.parse(grant.refreshExpiresAt)<=Date.now()))throw new ProviderError(provider,true);
 const {id,secret}=client(provider);
 const data=await postForm(provider,endpoints[provider].token,{grant_type:"refresh_token",refresh_token:grant.refreshToken,client_secret:secret,[provider==="tiktok"?"client_key":"client_id"]:id});
 return grantFrom(data,provider,grant);
}
