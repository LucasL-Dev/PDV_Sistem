import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { licenseConfig } from '../electron/licensing/config.mjs';
const require=createRequire(import.meta.url);
const builderRequire=createRequire(require.resolve('electron-builder'));
const resourcesRequire=createRequire(builderRequire.resolve('app-builder-lib'));
const asar=resourcesRequire('@electron/asar');
const archive=resolve(process.argv[2]||'release/win-unpacked/resources/app.asar');
const production=JSON.parse(asar.extractFile(archive,'electron/licensing/production.json').toString());
const config=licenseConfig({packaged:true,production,env:{OMNIPDV_LICENSE_ORIGIN:'http://localhost:3000'}});
if(config.origin!=='https://api.omnipdv.com.br'||config.local)throw Error('Pacote não aponta exclusivamente para a API pública.');
const files=asar.listPackage(archive);
for(const name of files){
 const path=name.replaceAll('\\','/');
 if(asar.statFile(archive,path.slice(1)).files)continue;
 // Reject sensitive file types/test fixtures. Public configuration is allowed.
 if(/\.(pem|key|pfx|p12|sqlite|sqlite-wal|sqlite-shm|db|bin)$/i.test(path)||/(^|\/)\.env($|\.)/.test(path)||/^\/(tests|docs|\.github)\//.test(path))
   throw Error('Arquivo privado ou de teste encontrado no pacote.');
 if(/\.(mjs|cjs|js|json)$/.test(path) && !path.startsWith('/node_modules/')){
  const text=asar.extractFile(archive,path.slice(1)).toString();
  if(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|re_[A-Za-z0-9]{24,}/.test(text))
   throw Error('Material de credencial não permitido no pacote.');
 }
}
console.log('PRODUCTION_PACKAGE_OK: origem HTTPS pública, ambiente local ignorado e ausência de arquivos privados/fixtures.');
