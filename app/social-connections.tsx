"use client";
import {useCallback,useEffect,useState,type FormEvent,type ReactNode} from "react";
import {ArrowUpRight,CheckCircle2,ExternalLink,Link2,Loader2,LockKeyhole,LogOut,RefreshCw,ShieldCheck,Trash2} from "lucide-react";
import {platformNames,platforms,type Platform} from "./types";
import {socialCatalog,type ConnectionSummary,type SocialStatus} from "../lib/social/catalog";

const statusLabels:Record<ConnectionSummary["status"],string>={unconfigured:"Configuration requise",disconnected:"Non connecté",connected:"Autorisé",verify:"À vérifier",reconnect:"À reconnecter"};
const errorMessages:Record<string,string>={cancelled:"Vous avez annulé l’autorisation. Aucun compte n’a été ajouté.",state:"Cette autorisation a expiré ou a déjà été utilisée. Relancez la connexion.",session:"Votre session Relai a expiré. Ouvrez votre espace puis relancez la connexion.",no_accounts:"Aucun profil, Page ou chaîne accessible n’a été trouvé. Vérifiez le compte sélectionné et les autorisations accordées.",permissions:"Les permissions nécessaires n’ont pas été accordées. Relancez la connexion pour autoriser l’accès au profil.",provider_error:"Le réseau n’a pas confirmé l’accès. Vérifiez la configuration développeur et les permissions de l’application.",reconnect:"L’autorisation a expiré ou a été retirée. Reconnectez votre compte.",busy:"Une autre opération est en cours sur ce réseau. Réessayez.",setup:"L’administrateur doit terminer la configuration de Relai.",provider_setup:"Ce réseau doit être configuré dans Vercel.",storage:"Le stockage sécurisé est momentanément indisponible. Réessayez.",vault:"Vérifiez la clé de chiffrement configurée sur le serveur."};
const displayDate=(value:string)=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Douala"}).format(new Date(value));

export default function SocialConnections({renderIcon}:{renderIcon:(provider:Platform)=>ReactNode}){
 const [data,setData]=useState<SocialStatus|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[password,setPassword]=useState(""),[remove,setRemove]=useState<Platform|null>(null),[browserOrigin,setBrowserOrigin]=useState("");
 const refresh=useCallback(async()=>{
  const response=await fetch("/api/social/status",{cache:"no-store",credentials:"same-origin"});
  const value=await response.json() as SocialStatus&{error?:string};
  if(!response.ok)throw new Error(value.error??"Les connexions sont momentanément indisponibles.");
  setData(value);
 },[]);
 useEffect(()=>{
  setBrowserOrigin(window.location.origin);
  const params=new URLSearchParams(window.location.search),result=params.get("social"),network=params.get("network");
  if(result==="connected"&&platforms.includes(network as Platform))setNotice(platformNames[network as Platform]+" a confirmé votre autorisation. Le compte est maintenant relié à Relai.");
  if(result==="error")setError(errorMessages[params.get("reason")??""]??"La connexion n’a pas abouti. Réessayez depuis Relai.");
  if(result){params.delete("social");params.delete("network");params.delete("reason");window.history.replaceState(null,"",window.location.pathname+(params.size?"?"+params:"")+"#connections");}
  void refresh().catch(e=>setError(e instanceof Error?e.message:"Chargement impossible.")).finally(()=>setLoading(false));
 },[refresh]);
 async function perform(path:string,method="POST",body?:unknown){
  setBusy(path);setError("");setNotice("");
  try{
   const response=await fetch("/api/social/"+path,{method,credentials:"same-origin",...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
   const result=await response.json() as {error?:string;url?:string};
   if(!response.ok)throw new Error(result.error??"Cette opération n’a pas abouti.");
   if(path.startsWith("connect/")&&result.url){window.location.assign(result.url);return;}
   if(path==="session"){setPassword("");setNotice(method==="DELETE"?"Votre session administrateur est fermée. Les comptes restent conservés sur le serveur.":"Votre espace administrateur est ouvert.");}
   if(path.startsWith("check/"))setNotice("Le réseau a confirmé l’accès au compte.");
   if(path.startsWith("connection/")){setRemove(null);setNotice("Les accès à ce réseau ont été supprimés de Relai. Vous pouvez aussi retirer l’autorisation dans les réglages du réseau.");}
  }catch(e){setError(e instanceof Error?e.message:"Cette opération n’a pas abouti.");}
  finally{await refresh().catch(e=>setError(e instanceof Error?e.message:"Chargement impossible."));setBusy("");}
 }
 function login(event:FormEvent){event.preventDefault();void perform("session","POST",{password});}
 const count=data?.connections.filter(c=>c.status==="connected").reduce((total,c)=>total+c.accounts.length,0)??0;
 const callbackOrigin=data?.appOrigin??browserOrigin;
 const checks:{key:keyof SocialStatus["setup"];label:string}[]=[{key:"appUrl",label:"Adresse officielle de Relai"},{key:"storage",label:"Stockage sécurisé"},{key:"encryption",label:"Chiffrement des accès"},{key:"administrator",label:"Accès administrateur"}];
 return <section aria-label="Connexions aux réseaux sociaux">
  <div className="page-head"><div><span className="eyebrow">VOS COMPTES SOCIAUX</span><h1>Vos réseaux, un même studio<span>.</span></h1><p>Reliez vos comptes par l’autorisation officielle de chaque réseau.</p></div><span className={"tag "+(count?"":"neutral")}>{count} compte{count>1?"s":""} autorisé{count>1?"s":""}</span></div>
  {error&&<div className="social-alert error" role="alert">{error}</div>}
  {notice&&<div className="social-alert success" role="status"><CheckCircle2 size={18}/><span>{notice}</span></div>}
  {loading?<div className="loading"><Loader2 className="spin" size={24}/><p>Vérification des connexions…</p></div>:!data?<button className="btn outline" onClick={()=>{setLoading(true);void refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Réessayer</button>:<>
   {!data.ready?<div className="connection-banner"><span className="connection-banner-icon"><Link2 size={25}/></span><div><h3>Terminer l’installation des connexions</h3><p>L’administrateur doit activer le stockage sécurisé et enregistrer Relai auprès des réseaux. Les boutons de connexion seront disponibles après cette configuration.</p><div className="social-setup-checks">{checks.map(check=><span key={check.key} className={data.setup[check.key]?"complete":""}>{data.setup[check.key]?<CheckCircle2 size={14}/>:<LockKeyhole size={14}/>} {check.label}</span>)}</div><a className="text-button green" href="https://github.com/allurebami/Relai/blob/main/docs/social-connections.md" target="_blank" rel="noreferrer">Guide d’activation administrateur <ArrowUpRight size={15}/></a></div></div>:data.authenticated?<div className="social-session"><span><ShieldCheck size={19}/><strong>Espace administrateur ouvert</strong></span><button className="btn subtle" onClick={()=>void perform("session","DELETE")} disabled={Boolean(busy)}><LogOut size={15}/>Fermer ma session</button></div>:<form id="social-login" className="social-login" onSubmit={login}><div><LockKeyhole size={23}/><h3>Ouvrir mon espace Relai</h3><p>Le mot de passe de votre espace protège l’accès à vos comptes reliés.</p></div><label className="field">Mot de passe administrateur Relai<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" minLength={16} maxLength={1024} required/></label><button className="btn primary" disabled={Boolean(busy)}>{busy==="session"?<Loader2 size={16} className="spin"/>:<LockKeyhole size={16}/>}Ouvrir mon espace</button></form>}
   <div className="connection-grid">{data.connections.map(connection=>{
    const p=connection.provider,catalog=socialCatalog[p],authorized=connection.accounts.length>0;
    return <article className="connection-card social-connection-card" key={p}>
     <div className="connection-top">{renderIcon(p)}<span className={"connection-state state-"+connection.status}>{statusLabels[connection.status]}</span></div>
     <h3>{platformNames[p]}</h3><p>{catalog.description}</p>
     {authorized&&<><ul className="social-accounts">{connection.accounts.map(account=><li key={account.id}><CheckCircle2 size={15}/><span>{account.name}<small>{account.kind==="page"?"Page Facebook":account.kind==="channel"?"Chaîne YouTube":"Profil"}</small></span></li>)}</ul>{connection.checkedAt&&<p className="social-last-check">Vérifié le {displayDate(connection.checkedAt)}</p>}{connection.expiresAt&&<p className="social-last-check">Accès valable jusqu’au {displayDate(connection.expiresAt)}</p>}</>}
     <div className="social-card-actions">{connection.configured?(data.authenticated?<><button className="btn outline" onClick={()=>void perform("connect/"+p)} disabled={Boolean(busy)}>{busy==="connect/"+p?<Loader2 size={15} className="spin"/>:<Link2 size={15}/ >}{authorized?"Reconnecter":"Connecter"} {platformNames[p]}</button>{authorized&&<button className="text-button green" onClick={()=>void perform("check/"+p)} disabled={Boolean(busy)}>{busy==="check/"+p?<Loader2 size={14} className="spin"/>:<RefreshCw size={14}/>}Vérifier la connexion</button>}</>:<a href="#social-login" className="btn outline">Ouvrir mon espace <ArrowUpRight size={15}/></a>):<span className="social-config-needed">Configuration administrateur nécessaire</span>}</div>
     {authorized&&data.authenticated&&<div className="social-remove">{remove===p?<div role="alert"><p>Retirer {platformNames[p]} de Relai ? Les accès conservés seront supprimés.</p><div><button className="btn danger" disabled={Boolean(busy)} onClick={()=>void perform("connection/"+p,"DELETE")}>Retirer</button><button className="btn subtle" disabled={Boolean(busy)} onClick={()=>setRemove(null)}>Annuler</button></div></div>:<button className="text-button" disabled={Boolean(busy)} onClick={()=>setRemove(p)}><Trash2 size={13}/>Retirer de Relai</button>}<a href={catalog.revokeUrl} target="_blank" rel="noreferrer">Gérer l’autorisation sur {platformNames[p]} <ExternalLink size={12}/></a></div>}
     <details className="social-guide"><summary>Prérequis et configuration</summary><p>{catalog.requirement}</p><label>URL de retour OAuth<code>{callbackOrigin}/api/social/callback/{p}</code></label><p>Permissions demandées : <code>{catalog.permissions.join(", ")}</code></p><div><a href={catalog.consoleUrl} target="_blank" rel="noreferrer">Console développeur <ExternalLink size={12}/></a><a href={catalog.docsUrl} target="_blank" rel="noreferrer">Documentation officielle <ExternalLink size={12}/></a></div></details>
    </article>;
   })}</div>
  </>}
  <div className="privacy-card"><ShieldCheck size={22}/><span><strong>Vous gardez le contrôle.</strong><p>Vos mots de passe sociaux restent chez chaque réseau. Relai conserve les autorisations chiffrées côté serveur. Cette étape relie vos profils ; la publication directe et l’envoi automatique restent à activer.</p><p><a href="/privacy">Confidentialité</a> · <a href="/data-deletion">Suppression des accès</a> · <a href="/terms">Conditions d’utilisation</a></p></span></div>
 </section>;
}
