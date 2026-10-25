import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {scryptSync} from "node:crypto";
import ts from "typescript";

// Exercise the real handler, vault and provider adapters. Only the outgoing
// HTTP boundary (Redis REST and provider APIs) is replaced by contract fixtures.
const modules=new Map();
async function moduleUrl(path){
 if(modules.has(path))return modules.get(path);
 let code=ts.transpileModule(await readFile(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ["']server-only["'];?\s*/g,"");
 const relative={"lib/social/catalog.ts":{"../../app/types":"app/types.ts"},"lib/social/vault.ts":{},"lib/social/providers.ts":{"../../app/types":"app/types.ts","./catalog":"lib/social/catalog.ts","./vault":"lib/social/vault.ts"},"lib/social/service.ts":{"../../app/types":"app/types.ts","./catalog":"lib/social/catalog.ts","./providers":"lib/social/providers.ts","./vault":"lib/social/vault.ts"}};
 for(const [name,file] of Object.entries(relative[path]??{}))code=code.replaceAll(JSON.stringify(name),JSON.stringify(await moduleUrl(file)));
 code=code.replaceAll('"zod"',JSON.stringify(import.meta.resolve("zod")));
 const url="data:text/javascript;base64,"+Buffer.from(code).toString("base64");modules.set(path,url);return url;
}
const {handleSocial}=await import(await moduleUrl("lib/social/service.ts"));
const vault=await import(await moduleUrl("lib/social/vault.ts"));
const {platforms}=await import(await moduleUrl("app/types.ts"));
const origin="https://relai.test",password="fixture-admin-password-32-characters",salt="a".repeat(32);
const environment={NODE_ENV:"production",RELAI_APP_URL:origin,UPSTASH_REDIS_REST_URL:"https://redis.test",UPSTASH_REDIS_REST_TOKEN:"fixture-redis-secret",RELAI_TOKEN_ENCRYPTION_KEY:"b".repeat(64),RELAI_ADMIN_PASSWORD_HASH:"scrypt:"+salt+":"+scryptSync(password,salt,64).toString("hex")};
for(const name of ["INSTAGRAM","FACEBOOK","GOOGLE","LINKEDIN"]){environment[name+"_CLIENT_ID"]="fixture-"+name+"-client";environment[name+"_CLIENT_SECRET"]="fixture-"+name+"-secret";}
environment.TIKTOK_CLIENT_KEY="fixture-TIKTOK-client";environment.TIKTOK_CLIENT_SECRET="fixture-TIKTOK-secret";
const before={...process.env};
const db=new Map(),expiry=new Map(),commands=[],calls=[];
let failure="",emptyChannel=false,refreshCount=0;
const get=k=>{if((expiry.get(k)??Infinity)<=Date.now()){db.delete(k);expiry.delete(k);}return db.get(k)??null;};
const remove=k=>{const had=db.delete(k);expiry.delete(k);return had?1:0;};
function command(args){
 commands.push(args);
 const [verb,k,v,...options]=args;
 if(verb==="GET")return get(k);
 if(verb==="GETDEL"){const value=get(k);remove(k);return value;}
 if(verb==="MGET")return args.slice(1).map(get);
 if(verb==="DEL")return args.slice(1).reduce((total,k)=>total+remove(k),0);
 if(verb==="SET"){
  if(options.includes("NX")&&get(k)!==null)return null;
  db.set(k,v);expiry.delete(k);const ex=options.indexOf("EX");if(ex>=0)expiry.set(k,Date.now()+Number(options[ex+1])*1000);return "OK";
 }
 if(verb==="EVAL"){
  const [,script,,redisKey,arg]=args;
  if(script.includes("INCR")){const count=Number(get(redisKey)??0)+1;db.set(redisKey,count);if(count===1)expiry.set(redisKey,Date.now()+Number(arg)*1000);return count;}
  if(get(redisKey)===arg)return remove(redisKey);return 0;
 }
 throw new Error("Unexpected Redis command: "+verb);
}
const originalFetch=globalThis.fetch;
globalThis.fetch=async (input,init={})=>{
 const url=new URL(String(input));
 if(url.origin==="https://redis.test"){
  assert.equal(init.headers.Authorization,"Bearer fixture-redis-secret");assert.equal(init.cache,"no-store");
  return Response.json({result:command(JSON.parse(init.body))});
 }
 const form=init.body?new URLSearchParams(init.body):new URLSearchParams();
 calls.push({host:url.host,path:url.pathname,form,search:url.searchParams,headers:init.headers});
 let provider=url.hostname.includes("instagram")?"instagram":url.hostname.includes("facebook")?"facebook":url.hostname.includes("tiktok")?"tiktok":url.hostname.includes("linkedin")?"linkedin":"youtube";
 if(url.hostname==="oauth2.googleapis.com"||url.pathname.includes("oauth/token")||url.pathname.includes("accessToken")||url.pathname.includes("access_token")){
  if(form.get("grant_type")==="authorization_code"){
   assert.equal(form.get("redirect_uri"),origin+"/api/social/callback/"+provider);
   assert.equal(form.get("client_secret"),environment[(provider==="youtube"?"GOOGLE":provider.toUpperCase())+"_CLIENT_SECRET"]);
   if(provider==="youtube")assert.match(form.get("code_verifier"),/^[-\w]{43}$/);
  }
  if(form.get("grant_type")==="refresh_token"){
   assert.ok(form.get("refresh_token"));refreshCount++;
   return Response.json({access_token:"fixture-"+provider+"-renewed",refresh_token:"fixture-"+provider+"-refresh-rotated-"+refreshCount,expires_in:3600,refresh_expires_in:31536000});
  }
  const scopes={youtube:"https://www.googleapis.com/auth/youtube.readonly",tiktok:"user.info.basic",instagram:"instagram_business_basic",facebook:"pages_show_list",linkedin:"openid profile"};
  return Response.json({access_token:"fixture-"+provider+"-access",refresh_token:["youtube","tiktok"].includes(provider)?"fixture-"+provider+"-refresh":undefined,expires_in:3600,refresh_expires_in:31536000,scope:scopes[provider]});
 }
 if(failure==="temporary")return Response.json({error:"server_error"},{status:503});
 if(failure==="revoked")return Response.json({error:{code:"access_token_invalid"}},{status:200});
 assert.equal(init.headers.Authorization.startsWith("Bearer fixture-"),true);
 if(provider==="youtube")return Response.json({items:emptyChannel?[]:[{id:"channel-1",snippet:{title:"Chaîne SIU"}}]});
 if(provider==="tiktok")return Response.json({data:{user:{open_id:"tiktok-1",display_name:"SIU TikTok"}},error:{code:"ok"}});
 if(provider==="linkedin")return Response.json({sub:"linkedin-1",name:"Christian SIU"});
 if(provider==="instagram")return Response.json({user_id:"instagram-1",username:"siu_education"});
 if(provider==="facebook")return Response.json(url.searchParams.has("after")?{data:[{id:"page-1",name:"SIU"},{id:"page-2",name:"SIU Étudiants"}]}:{data:[{id:"page-1",name:"SIU"}],paging:{next:"https://untrusted.example/not-followed",cursors:{after:"cursor-two"}}});
 throw new Error("Unexpected outgoing network request: "+url.origin+url.pathname);
};
function request(path,method="GET",cookie="",value,requestOrigin=origin){
 return new Request(origin+"/api/social/"+path,{method,headers:{...(method!=="GET"?{Origin:requestOrigin}:{}),...(cookie?{Cookie:cookie}:{}),...(value!==undefined?{"Content-Type":"application/json"}:{}),"x-forwarded-for":"192.0.2.1"},...(value!==undefined?{body:JSON.stringify(value)}:{})});
}
const run=(path,method="GET",cookie="",value,requestOrigin)=>handleSocial(request(path,method,cookie,value,requestOrigin),path.split("?")[0].split("/"));
const status=async cookie=>(await run("status","GET",cookie)).json();
const connection=provider=>vault.key("connection:"+provider);
const decode=provider=>vault.unseal(get(connection(provider)),connection(provider));
const persist=(provider,value)=>db.set(connection(provider),vault.seal(value,connection(provider)));

try{
 // No infrastructure: usable status, no misleading authorization, no storage call.
 for(const name of Object.keys(environment))delete process.env[name];
 const unconfigured=await status();assert.equal(unconfigured.ready,false);assert.equal(unconfigured.authenticated,false);assert.ok(unconfigured.connections.every(c=>c.status==="unconfigured"&&c.accounts.length===0));
 assert.equal((await run("connect/youtube","POST")).status,503);assert.equal(commands.length,0);
 Object.assign(process.env,environment);
 assert.equal((await run("connect/youtube","POST")).status,401);
 assert.equal((await run("session","POST","",{password},"https://attacker.test")).status,403);
 assert.equal((await run("session","POST","",{password:"wrong-password-at-least-16"})).status,401);
 const login=await run("session","POST","",{password});assert.equal(login.status,200);
 const setCookie=login.headers.get("set-cookie");assert.match(setCookie,/^__Host-relai_session=/);for(const flag of ["HttpOnly","Secure","SameSite=Lax","Path=/","Max-Age=43200"])assert.ok(setCookie.includes(flag));
 const cookie=setCookie.split(";")[0];assert.equal((await status(cookie)).authenticated,true);
 assert.equal((await run("connect/youtube","POST",cookie,undefined,"https://attacker.test")).status,403);
 const otherLogin=await run("session","POST","",{password}),otherCookie=otherLogin.headers.get("set-cookie").split(";")[0];
 for(const provider of platforms){
  const start=await run("connect/"+provider,"POST",cookie);assert.equal(start.status,200);
  const target=new URL((await start.json()).url),state=target.searchParams.get("state");assert.match(state,/^[-\w]{43}$/);
  assert.equal(target.searchParams.get("redirect_uri"),origin+"/api/social/callback/"+provider);
  assert.equal(target.searchParams.get("response_type"),"code");assert.ok(!target.href.includes("secret"));
  if(provider==="youtube"){assert.equal(target.searchParams.get("code_challenge_method"),"S256");assert.equal(target.searchParams.get("access_type"),"offline");}
  if(provider==="linkedin")assert.equal(target.searchParams.get("scope"),"openid profile");
  const cb="callback/"+provider+"?state="+state+"&code=fixture-code";
  if(provider==="youtube"){
   const outgoing=calls.length;
   assert.match((await run(cb,"GET",otherCookie)).headers.get("location"),/reason=state/);assert.equal(calls.length,outgoing);
   assert.ok(get(vault.key("oauth:"+vault.digest(state))),"Wrong session must not consume valid state");
  }
  const result=await run(cb,"GET",cookie);assert.equal(result.status,303);assert.match(result.headers.get("location"),/social=connected/);assert.ok(result.headers.get("location").endsWith("#connections"));
  assert.match((await run(cb,"GET",cookie)).headers.get("location"),/reason=state/,"Authorization code cannot be replayed");
  assert.ok(!get(connection(provider)).includes("fixture-"),"Stored tokens must be encrypted");
 }
 let linked=await status(cookie);assert.equal(linked.connections.filter(c=>c.status==="connected").length,5);assert.equal(linked.connections.find(c=>c.provider==="facebook").accounts.length,2);
 assert.equal(calls.some(c=>c.host==="untrusted.example"),false,"Provider pagination URLs must not be followed");
 assert.ok(!JSON.stringify(linked).includes("access_token"));assert.ok(!JSON.stringify(linked).includes("fixture-"));assert.ok(!JSON.stringify(linked).includes("refreshToken"));
 const publicStatus=await status();assert.ok(publicStatus.connections.every(c=>c.accounts.length===0));
 assert.throws(()=>vault.unseal(get(connection("youtube")),connection("tiktok")),/ne peut pas être lue/);
 const encrypted=get(connection("youtube"));assert.throws(()=>vault.unseal(encrypted.slice(0,-3)+"bad",connection("youtube")),/ne peut pas être lue/);
 // Denial and no-account responses never replace an existing valid connection.
 let startData=await(await run("connect/youtube","POST",cookie)).json();let state=new URL(startData.url).searchParams.get("state");
 assert.match((await run("callback/youtube?state="+state+"&error=access_denied","GET",cookie)).headers.get("location"),/reason=cancelled/);
 assert.equal(get(connection("youtube")),encrypted);
 startData=await(await run("connect/youtube","POST",cookie)).json();state=new URL(startData.url).searchParams.get("state");emptyChannel=true;
 assert.match((await run("callback/youtube?state="+state+"&code=fixture-code","GET",cookie)).headers.get("location"),/reason=no_accounts/);emptyChannel=false;
 assert.equal(get(connection("youtube")),encrypted);
 // Refresh rotation is saved even if the following profile request is unavailable.
 for(const provider of ["youtube","tiktok"]){
  const current=decode(provider);current.grant.expiresAt=new Date(Date.now()-1000).toISOString();persist(provider,current);
  assert.equal((await status(cookie)).connections.find(c=>c.provider===provider).status,"verify");
  const oldRefresh=current.grant.refreshToken;failure="temporary";
  assert.equal((await run("check/"+provider,"POST",cookie)).status,502);
  assert.notEqual(decode(provider).grant.refreshToken,oldRefresh,"Rotated refresh token must not be lost");
  failure="";assert.equal((await run("check/"+provider,"POST",cookie)).status,200);
 }
 failure="revoked";assert.equal((await run("check/tiktok","POST",cookie)).status,502);failure="";
 assert.equal((await status(cookie)).connections.find(c=>c.provider==="tiktok").status,"reconnect");
 const oldLinkedIn=decode("linkedin");oldLinkedIn.grant.expiresAt=new Date(Date.now()-1000).toISOString();persist("linkedin",oldLinkedIn);
 assert.equal((await run("check/linkedin","POST",cookie)).status,502);
 assert.equal((await status(cookie)).connections.find(c=>c.provider==="linkedin").status,"reconnect");
 // A concurrent per-provider lease protects refresh and deletion from stale writes.
 db.set(vault.key("lock:facebook"),"another-operation");assert.equal((await run("connection/facebook","DELETE",cookie)).status,409);remove(vault.key("lock:facebook"));
 assert.equal((await run("connection/facebook","DELETE")).status,401);
 assert.equal((await run("connection/facebook","DELETE",cookie,undefined,"https://attacker.test")).status,403);
 const removal=await run("connection/facebook","DELETE",cookie);assert.equal(removal.status,200);assert.equal((await removal.json()).providerRevoked,false);assert.equal(get(connection("facebook")),null);
 assert.equal((await status(cookie)).connections.find(c=>c.provider==="facebook").status,"disconnected");
 const logout=await run("session","DELETE",cookie);assert.equal(logout.status,200);assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));assert.equal((await status(cookie)).authenticated,false);
 assert.equal((await run("connect/instagram","POST",cookie)).status,401);assert.ok(get(connection("instagram")),"Logging out must retain encrypted connections");
 // Changing administrator password invalidates every existing session.
 process.env.RELAI_ADMIN_PASSWORD_HASH="scrypt:"+salt+":"+scryptSync("new-fixture-password-32-characters",salt,64).toString("hex");
 assert.equal((await status(otherCookie)).authenticated,false);process.env.RELAI_ADMIN_PASSWORD_HASH=environment.RELAI_ADMIN_PASSWORD_HASH;
 for(let i=0;i<12;i++)await run("session","POST","",{password:"another-wrong-password-32"});
 assert.equal((await run("session","POST","",{password})).status,429);
 assert.ok(commands.some(c=>c[0]==="SET"&&String(c[1]).includes("oauth:")&&c.includes(600)),"OAuth state must have a ten-minute expiry");
 assert.ok(commands.some(c=>c[0]==="GETDEL"),"State must be consumed atomically");
 console.log("Social verification passed: five OAuth adapters, authenticated sessions, same-origin protection, one-use state binding, encrypted credentials, real-name extraction, pagination safety, refusals, refresh rotation, revocation detection, locking, unlink and login rate limits. Provider HTTP responses are test fixtures; no live consent is claimed.");
}finally{
 globalThis.fetch=originalFetch;
 for(const name of Object.keys(process.env))if(!(name in before))delete process.env[name];Object.assign(process.env,before);
}
