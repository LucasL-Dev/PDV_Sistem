// UI integration fixture: real renderer, preload, IPC, manager, PKCE callback,
// signed leases and SQLite. Only OS browser and API transport are synthetic.
import { app, BrowserWindow, ipcMain } from 'electron';
import { createServer } from 'node:http';
import { randomBytes,generateKeyPairSync,createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { SignJWT,exportJWK } from 'jose';
import { LicenseManager } from '../electron/licensing/manager.mjs';
import { LicenseClient } from '../electron/licensing/client.mjs';
import { authorization } from '../electron/licensing/loopback.mjs';
import { registerLicenseHandlers } from '../electron/licensing/ipc.mjs';
import { checkOperation } from '../electron/licensing/policy.mjs';
import { Store } from '../electron/store.mjs';
const folder=await mkdtemp(join(tmpdir(),'omnipdv-email-ui-'));app.setPath('userData',folder);
let stage='startup';
app.whenReady().then(async()=>{
 const pair=generateKeyPairSync('ed25519'),jwk={...await exportJWK(pair.publicKey),kid:'ui',alg:'EdDSA',use:'sig'};
 let mode='browser_fail',request,opens=0,origin,grantUsed=false;
 const sessionExpiry=new Date(Date.now()+86400000).toISOString();
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  try {
   if(mode==='network'){res.writeHead(503).end('{}');return;}
   if(req.url==='/.well-known/omnipvd-license-keys.json'){res.end(JSON.stringify({keys:[jwk]}));return;}
   if(req.url==='/api/auth/token'){
    let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
    if(grantUsed || body.client_id!=='omnipvd-desktop' || body.code!=='fixture-code' || body.redirect_uri!==request.searchParams.get('redirect_uri') || createHash('sha256').update(body.code_verifier).digest('base64url')!==request.searchParams.get('code_challenge')){res.writeHead(400).end('{}');return;}
    grantUsed=true;res.end(JSON.stringify({access_token:'synthetic-ui-access',refresh_token:'synthetic-ui-refresh',token_type:'Bearer',expires_in:600,session_expires_at:sessionExpiry,session_id:'ui-session',account_id:'ui-account',installation_id:request.searchParams.get('installation_id')}));return;
   }
   if(req.url==='/api/license/status'){
    if(mode==='inactive'){res.end(JSON.stringify({authorized:false,subscription_status:'canceled'}));return;}
    const now=Math.floor(Date.now()/1000),exp=now+3600;
    const token=await new SignJWT({sid:'ui-session',installation_id:request.searchParams.get('installation_id'),product:'omnipvd',authorized:true}).setProtectedHeader({alg:'EdDSA',typ:'omnipvd-license+jwt',kid:'ui'}).setIssuer(origin).setAudience('omnipvd-desktop').setSubject('ui-account').setIssuedAt(now).setNotBefore(now).setExpirationTime(exp).setJti('ui-license').sign(pair.privateKey);
    res.end(JSON.stringify({authorized:true,subscription_status:'active',offline_authorization:token,authorization_expires_at:new Date(exp*1000).toISOString(),next_check_at:new Date(Date.now()+900000).toISOString()}));return;
   }
   if(req.url==='/api/auth/logout'){res.end('{"ok":true}');return;}
   res.writeHead(404).end('{}');
  }catch{res.writeHead(500).end('{}');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));server.unref();origin=`http://127.0.0.1:${server.address().port}`;
 let value;const storage={load:async()=>value,save:async data=>{value=structuredClone(data);}};
 const manager=new LicenseManager({config:{origin,issuer:origin,audience:'omnipvd-desktop'},client:new LicenseClient({origin}),storage,
  authorize:(config,id)=>authorization(config,id,async url=>{
   opens++;request=new URL(url);assert.equal(request.origin,origin);assert.equal(request.pathname,'/api/auth/authorize');grantUsed=false;
   if(mode==='browser_fail')throw Error('synthetic-browser-failure');
   if(['wait','timeout'].includes(mode))return;
   const callback=new URL(request.searchParams.get('redirect_uri'));callback.searchParams.set('code','fixture-code');callback.searchParams.set('state',request.searchParams.get('state'));assert.equal((await fetch(callback)).status,200);
  },{timeout:mode==='timeout'?50:10000})});
 await manager.init();
 const store=new Store(join(folder,'pdv.sqlite'));store.authorize=action=>checkOperation(manager,action);
 const win=new BrowserWindow({show:false,webPreferences:{preload:fileURLToPath(new URL('../electron/preload.cjs',import.meta.url)),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const trusted=e=>{assert.equal(e.sender,win.webContents);assert.equal(e.senderFrame,win.webContents.mainFrame);};
 const handle=(channel,fn)=>ipcMain.handle(channel,async(...args)=>{try{return{ok:true,value:await fn(...args)};}catch(error){return{ok:false,error:error.message};}});
 registerLicenseHandlers({handle,trusted,license:manager});handle('pdv',(e,action,payload)=>{trusted(e);return store.call(action,payload);});
 await win.loadFile(fileURLToPath(new URL('../dist/index.html',import.meta.url)));
 const js=code=>win.webContents.executeJavaScript(code);
 const until=async code=>{for(let i=0;i<150;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('UI assertion timed out: '+stage);};
 const click=label=>js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(label)}))?.click()`);
 stage='login-button/browser-error';await until("document.querySelector('.license-screen .primary') && !document.querySelector('.license-screen .primary').disabled");await click('Entrar na minha conta');await until("document.body.innerText.includes('Não foi possível abrir o navegador padrão')");assert.equal(opens,1);assert.equal(manager.status().authorized,false);
 stage='cancel/retry';mode='wait';await click('Entrar na minha conta');await until("document.body.innerText.includes('Cancelar autenticação')");assert.equal(await js("document.querySelector('.license-screen .primary').disabled"),true);await click('Cancelar autenticação');await until("document.body.innerText.includes('Autenticação cancelada')");
 stage='timeout';mode='timeout';await click('Entrar na minha conta');await until("document.body.innerText.includes('O tempo de entrada terminou')");
 stage='activation-button';await click('Consultar e recuperar');await until("document.body.innerText.includes('Ativar aplicativo')");mode='wait';const before=opens;await click('Ativar aplicativo');await until("document.body.innerText.includes('Cancelar autenticação')");assert.equal(opens,before+1);await click('Cancelar autenticação');await until("document.body.innerText.includes('Autenticação cancelada')");
 stage='inactive-license';mode='inactive';await click('Entrar na minha conta');await until("document.body.innerText.includes('Sua assinatura não está ativa')");assert.equal(manager.status().authorized,false);assert.throws(()=>manager.assertCommercial());
 stage='network-error';await js('window.license.logout()');mode='network';await click('Entrar na minha conta');await until("document.body.innerText.includes('Não foi possível conectar à API')");assert.equal(manager.status().authorized,false);
 stage='active-license';mode='active';await click('Entrar na minha conta');await until("document.body.innerText.includes('Licença ativa')");assert.equal(manager.status().authorized,true);await until("document.body.innerText.includes('Crie o administrador')");
 assert.ok(!JSON.stringify(await js('window.license.status()')).includes('synthetic-ui-access'));
 assert.equal(store.read().sales.length,0);assert.equal(store.read().products.length,0);
 await manager.stop();store.close();server.closeAllConnections();await new Promise(r=>server.close(r));win.destroy();console.log('EMAIL_LOGIN_UI_OK: botões, IPC, navegador, cancelamento, timeout, PKCE, licença, rede e atualização automática.');app.quit();
}).catch(()=>{console.error('::error title=Email login UI::'+stage);app.exit(1);});
