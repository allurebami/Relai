export function newId(){if(typeof crypto.randomUUID==="function")return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,n=>n.toString(16).padStart(2,"0")).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);}
export const platforms = ["instagram", "tiktok", "youtube", "facebook", "linkedin"] as const;
export type Platform = typeof platforms[number];
export type Format = "vertical" | "square" | "landscape" | "original";
export type Kind = "video" | "image" | "text";
export type Content = { id:string; title:string; notes:string; kind:Kind; brand:string; createdAt:string; fileId?:string; fileName?:string; mime?:string; size?:number; width?:number; height?:number; duration?:number; example?:boolean };
export type Draft = { id:string; contentId:string; platform:Platform; caption:string; format:Format; status:"draft"|"ready"|"scheduled"|"exported"; scheduledAt:string; createdAt:string; };
export type Workflow = { id:string; name:string; kinds:Kind[]; targets:Platform[]; formats:Partial<Record<Platform,Format>>; cta:string; autoPrepare:boolean; createdAt:string };
export type Studio = { workspace:string; brand:string; cta:string; contents:Content[]; drafts:Draft[]; workflows:Workflow[] };
export const emptyStudio:Studio = { workspace:"Mon studio", brand:"SIU", cta:"", contents:[], drafts:[], workflows:[] };
export const platformNames:Record<Platform,string> = {instagram:"Instagram",tiktok:"TikTok",youtube:"YouTube",facebook:"Facebook",linkedin:"LinkedIn"};
export const formatNames:Record<Format,string> = { vertical:"Vertical · 9:16",square:"Carré · 1:1",landscape:"Paysage · 16:9",original:"Format original" };
export const defaultFormats:Record<Platform,Format> = {instagram:"vertical",tiktok:"vertical",youtube:"vertical",facebook:"square",linkedin:"square"};
export function captionFor(content:Content, platform:Platform, cta:string) {
  const text=[content.title.trim(),content.notes.trim(),cta.trim()].filter(Boolean).join("\n\n");
  const limit=platform==="youtube"?4900:platform==="linkedin"?2950:platform==="instagram"?2150:platform==="tiktok"?3900:6000;
  return text.slice(0,limit);
}
export function prepareDrafts(studio:Studio,content:Content,targets:Platform[],formats:Partial<Record<Platform,Format>>=defaultFormats,cta=studio.cta):Studio{
  const drafts=[...studio.drafts];
  for(const platform of targets){
    if(drafts.some(d=>d.contentId===content.id&&d.platform===platform))continue;
    drafts.push({id:newId(),contentId:content.id,platform,caption:captionFor(content,platform,cta),format:formats[platform]??defaultFormats[platform],status:"draft",scheduledAt:"",createdAt:new Date().toISOString()});
  }
  return {...studio,drafts};
}
