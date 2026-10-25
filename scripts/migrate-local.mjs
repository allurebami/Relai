import {readFile,mkdir,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const built=path.join(root,"dist/server/wrangler.json");
let config;
try{config=JSON.parse(await readFile(built,"utf8"));}
catch{console.error("Exécutez npm run build avant les migrations locales.");process.exit(1);}
config.main=path.resolve(path.dirname(built),config.main);
if(config.assets?.directory)config.assets.directory=path.resolve(path.dirname(built),config.assets.directory);
config.d1_databases=config.d1_databases.map(db=>({...db,migrations_dir:path.join(root,"drizzle")}));
await mkdir(path.join(root,".sites-runtime"),{recursive:true});
const filename=path.join(root,".sites-runtime/migrations-wrangler.json");
await writeFile(filename,JSON.stringify(config));
const result=spawnSync(process.execPath,["--import","./scripts/sites-env.mjs","./node_modules/wrangler/bin/wrangler.js","d1","migrations","apply","DB","--local","--config",filename,"--persist-to",path.join(root,".wrangler/state")],{cwd:root,stdio:"inherit"});
if(result.error)throw result.error;
process.exit(result.status??1);
