import {handleSocial} from "../../../../lib/social/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
type Context={params:Promise<{path?:string[]}>};
async function handler(request:Request,context:Context){return handleSocial(request,(await context.params).path??[]);}
export {handler as GET,handler as POST,handler as DELETE};
