import {randomBytes,scrypt} from "node:crypto";
import {promisify} from "node:util";
import {writeFile} from "node:fs/promises";

const password=randomBytes(24).toString("base64url"),salt=randomBytes(16).toString("hex");
const hash=await promisify(scrypt)(password,salt,64);
const env="RELAI_TOKEN_ENCRYPTION_KEY="+randomBytes(32).toString("hex")+"\nRELAI_ADMIN_PASSWORD_HASH=scrypt:"+salt+":"+hash.toString("hex")+"\n";
// Never print secrets into terminal/build logs and never overwrite an existing key.
await writeFile(".env.social.local",env,{mode:0o600,flag:"wx"});
await writeFile(".relai-admin-password",password+"\n",{mode:0o600,flag:"wx"});
console.log("Secrets créés dans .env.social.local ; mot de passe administrateur dans .relai-admin-password. Conservez-les en lieu sûr. Les deux fichiers sont exclus de Git.");
