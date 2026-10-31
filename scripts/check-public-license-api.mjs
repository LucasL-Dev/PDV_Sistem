// Read-only diagnostics. No login, Stripe calls, tokens, keys or server writes.
import { readFile } from 'node:fs/promises';
import { importJWK } from 'jose';
import { licenseConfig } from '../electron/licensing/config.mjs';
import { LicenseClient } from '../electron/licensing/client.mjs';
try {
 const production=JSON.parse(await readFile(new URL('../electron/licensing/production.json',import.meta.url)));
 const config=licenseConfig({packaged:true,production});
 if(config.origin!=='https://api.omnipdv.com.br')throw Error();
 const keys=await new LicenseClient(config).keys();
 if(!Array.isArray(keys.keys)||!keys.keys.length||keys.keys.length>11)throw Error();
 for(const key of keys.keys){
  if(key.kty!=='OKP'||key.crv!=='Ed25519'||key.alg!=='EdDSA'||key.use!=='sig'||typeof key.kid!=='string'||key.d)throw Error();
  await importJWK(key,'EdDSA');
 }
 const res=await fetch(config.origin+'/api/license/status',{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(res.status!==401)throw Error();
 const page=await fetch(config.origin+'/account/login',{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!page.ok)throw Error();
 console.log('PUBLIC_API_OK: JWKS Ed25519 público válido, conta disponível e licença exige autenticação.');
}catch{console.error('PUBLIC_API_FAILED: confira HTTPS, disponibilidade da API e rotas públicas. Nenhuma sessão foi enviada.');process.exitCode=1;}
