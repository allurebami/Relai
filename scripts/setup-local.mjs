import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
for(const script of ["scripts/run-framework.mjs","scripts/migrate-local.mjs"]){
 const args=script.endsWith("run-framework.mjs")?[script,"build"]:[script];
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:"inherit"});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
console.log("Relai est prêt. Lancez npm run dev, puis ouvrez http://localhost:5173.");
