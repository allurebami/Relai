import {z} from "zod";
const platform=z.enum(["instagram","tiktok","youtube","facebook","linkedin"]);
const format=z.enum(["vertical","square","landscape","original"]);
const kind=z.enum(["video","image","text"]);
const uid=z.string().uuid();
export const stateSchema=z.object({
 workspace:z.string().trim().min(1).max(80),brand:z.string().max(80),cta:z.string().max(1000),
 contents:z.array(z.object({id:uid,title:z.string().trim().min(1).max(180),notes:z.string().max(10000),kind,brand:z.string().max(80),createdAt:z.string().datetime(),fileId:uid.optional(),fileName:z.string().max(255).optional(),mime:z.string().max(100).optional(),size:z.number().min(0).max(40*1024*1024).optional(),width:z.number().min(0).max(50000).optional(),height:z.number().min(0).max(50000).optional(),duration:z.number().min(0).max(86400).optional(),example:z.boolean().optional()})).max(1000),
 drafts:z.array(z.object({id:uid,contentId:uid,platform,caption:z.string().max(15000),format,status:z.enum(["draft","ready","scheduled","exported"]),scheduledAt:z.string().max(50),createdAt:z.string().datetime()})).max(5000),
 workflows:z.array(z.object({id:uid,name:z.string().trim().min(1).max(120),kinds:z.array(kind).min(1).max(3),targets:z.array(platform).min(1).max(5),formats:z.record(format),cta:z.string().max(1000),autoPrepare:z.boolean(),createdAt:z.string().datetime()})).max(100)
});
