import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { licenseConfig } from '../electron/licensing/config.mjs';
import { LicenseClient } from '../electron/licensing/client.mjs';
import { LicenseManager } from '../electron/licensing/manager.mjs';
import { authorization } from '../electron/licensing/loopback.mjs';
const production=JSON.parse(await readFile(new URL('../electron/licensing/production.json',import.meta.url)));
test('packaged configuration uses only public API, ignoring localhost and site-origin overrides',()=>{
 for(const override of ['http://localhost:3000','https://omnipdv.com.br','https://attacker.invalid']){
  const config=licenseConfig({packaged:true,production,env:{OMNIPDV_LICENSE_ORIGIN:override}});
  assert.equal(config.origin,'https://api.omnipdv.com.br');assert.equal(config.issuer,config.origin);assert.equal(config.audience,'omnipvd-desktop');assert.equal(config.local,false);
 }
 for(const origin of ['http://localhost:3000','https://localhost','https://dev.localhost','https://127.0.0.1','https://[::1]','http://api.omnipdv.com.br','https://api.omnipdv.com.br/','https://user:pass@api.omnipdv.com.br','https://api.omnipdv.com.br/path'])assert.throws(()=>licenseConfig({packaged:true,production:{origin},env:{}}));
 assert.throws(()=>licenseConfig({packaged:true,production:{},env:{OMNIPDV_LICENSE_ORIGIN:'https://api.omnipdv.com.br'}}));
});
test('packaged auth URL opens on API; callback loopback remains required by PKCE protocol',async()=>{
 const config=licenseConfig({packaged:true,production,env:{}});let opened;
 const flow=await authorization(config,'installation-production-test',async url=>{opened=new URL(url);});
 try {
  assert.equal(opened.origin,'https://api.omnipdv.com.br');assert.equal(opened.pathname,'/api/auth/authorize');assert.equal(opened.searchParams.get('client_id'),'omnipvd-desktop');assert.equal(opened.searchParams.get('code_challenge_method'),'S256');
  const callback=new URL(opened.searchParams.get('redirect_uri'));assert.equal(callback.hostname,'127.0.0.1');assert.equal(callback.pathname,'/omnipvd/callback');assert.ok(Number(callback.port)>=1024);
 }finally{flow.cancel();}
});
test('license/JWKS/token requests use trusted API with redirects refused and no private keys',async()=>{
 const config=licenseConfig({packaged:true,production,env:{}}),calls=[];
 const client=new LicenseClient(config,async(url,options)=>{calls.push({url:new URL(url),options});return {ok:true,json:async()=>({keys:[]})};});
 await client.keys();await client.status('synthetic-access');await client.exchange({grant_type:'authorization_code',code:'synthetic',code_verifier:'synthetic',redirect_uri:'http://127.0.0.1:54321/omnipvd/callback'});
 assert.deepEqual(calls.map(c=>c.url.pathname),['/.well-known/omnipvd-license-keys.json','/api/license/status','/api/auth/token']);
 for(const {url,options} of calls){assert.equal(url.origin,'https://api.omnipdv.com.br');assert.equal(options.redirect,'error');assert.equal(url.search,'');}
 assert.deepEqual(Object.keys(production),['origin']);
});
test('development local backend remains explicit and does not change persisted data namespace',async()=>{
 assert.equal(licenseConfig({packaged:false,production,env:{OMNIPDV_LICENSE_ORIGIN:'http://localhost:3000'}}).local,true);
 const source=await readFile(new URL('../electron/main.mjs',import.meta.url),'utf8');
 assert.match(source,/join\(app.getPath\("appData"\), "pdv-sistem"\)/);assert.match(source,/new Store\(join\(folder, "pdv.sqlite"\)\)/);
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));assert.equal(pkg.build.appId,'br.com.pdvsistem');assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);
});

test('old localhost session never sends its refresh token or offline lease to public API',async()=>{
 let calls=0;const value={origin:'http://localhost:3000',installation_id:'existing-installation',session:{refresh_token:'old-environment-refresh'},offline:'old-environment-license'};
 const saved=[];const manager=new LicenseManager({config:licenseConfig({packaged:true,production,env:{}}),storage:{load:async()=>structuredClone(value),save:async v=>saved.push(structuredClone(v))},client:{keys:async()=>{calls++;throw Error();},exchange:async()=>{calls++;throw Error();}}});
 await manager.init();assert.equal(manager.status().status,'origin_changed');await manager.check();assert.equal(calls,0);assert.equal(manager.status().authorized,false);assert.equal(saved.length,0);
 await manager.logout();assert.equal(saved.at(-1).origin,'https://api.omnipdv.com.br');assert.equal(saved.at(-1).installation_id,'existing-installation');assert.equal(saved.at(-1).session,undefined);
});
