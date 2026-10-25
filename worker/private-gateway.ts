// Standalone production builds require an authenticated, trusted gateway.
// The gateway strips user-supplied x-relai-gateway-token and injects its own secret.
// Never put this secret in the browser bundle or expose a public direct Worker route.
export async function requirePrivateGateway(request:Request,secret?:string):Promise<Response|null>{
 if(!secret||secret.length<32)return new Response("Relai : la passerelle privée doit être configurée avant un déploiement en production.",{status:503,headers:{"Content-Type":"text/plain;charset=utf-8","Cache-Control":"no-store"}});
 const received=request.headers.get("x-relai-gateway-token")??"";
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(secret)),crypto.subtle.digest("SHA-256",encoder.encode(received))]);
 const aa=new Uint8Array(a),bb=new Uint8Array(b);let diff=0;
 for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
 if(diff!==0)return new Response("Accès privé requis.",{status:401,headers:{"Content-Type":"text/plain;charset=utf-8","Cache-Control":"no-store"}});
 return null;
}
