import test from 'node:test';
import assert from 'node:assert/strict';
import { authorization } from '../electron/licensing/loopback.mjs';
import { LicenseManager } from '../electron/licensing/manager.mjs';
import { registerLicenseHandlers } from '../electron/licensing/ipc.mjs';
const config={origin:'https://api.omnipdv.com.br',issuer:'https://api.omnipdv.com.br',audience:'omnipvd-desktop'};
function fixture(authorize) {
 let value={origin:config.origin,installation_id:'persistent-installation'};
 const storage={load:async()=>structuredClone(value),save:async v=>{value=structuredClone(v);},value:()=>structuredClone(value)};
 const manager=new LicenseManager({config,storage,client:{},authorize});return {manager,storage};
}
test('browser launch failure is distinct from timeout and cancellation; flow can be cancelled before OS launch resolves',async()=>{
 const failed=await authorization(config,'persistent-installation',async()=>{throw Error('private OS details');});
 await assert.rejects(failed.result,e=>e.code==='browser_open_failed');assert.equal(await failed.launched,false);
 const waiting=await authorization(config,'persistent-installation',()=>new Promise(()=>{}));waiting.cancel();await assert.rejects(waiting.result,e=>e.code==='authorization_cancelled');
 const timeout=await authorization(config,'persistent-installation',async()=>{}, {timeout:20});await assert.rejects(timeout.result,e=>e.code==='authorization_timeout');
});
test('manager exposes waiting/progress and browser errors without swallowing them or releasing license',async()=>{
 const {manager}=fixture((c,id)=>authorization(c,id,async()=>{throw Error('sensitive-details');}));await manager.init();
 const result=await manager.login();assert.equal(result.status,'browser_error');assert.match(result.message,/navegador padrão/);assert.ok(!result.message.includes('sensitive-details'));assert.equal(result.authorized,false);
});
test('cancel during browser wait preserves previous credentials and no late result overwrites cancelled state',async()=>{
 let opened;const {manager,storage}=fixture(async()=>{let reject;const result=new Promise((_,no)=>reject=no);opened={result,cancel:()=>reject(Object.assign(Error(),{code:'authorization_cancelled'}))};return opened;});
 await manager.init();manager.data.session={refresh_token:'old-protected-refresh'};manager.data.offline='old-signed-lease';
 const login=manager.login();for(let i=0;i<20&&!opened;i++)await new Promise(r=>setTimeout(r,1));assert.equal(manager.status().status,'waiting_browser');
 const cancelled=manager.cancelLogin();assert.equal(cancelled.status,'cancelled');await login;assert.equal(manager.status().status,'cancelled');assert.equal(storage.value().session.refresh_token,'old-protected-refresh');assert.equal(storage.value().offline,'old-signed-lease');
});
test('cancellation before callback listener is ready still cancels eventual listener and permits retry',async()=>{
 let resolve,closed=0;const {manager}=fixture(()=>new Promise(r=>resolve=r));await manager.init();const first=manager.login();for(let i=0;i<20&&!resolve;i++)await new Promise(r=>setTimeout(r,1));
 manager.cancelLogin();let reject;const result=new Promise((_,no)=>reject=no);resolve({result,cancel:()=>{closed++;reject(Object.assign(Error(),{code:'authorization_cancelled'}));}});await first;assert.equal(manager.status().status,'cancelled');assert.ok(closed>=1);
 manager.authorize=(c,id)=>authorization(c,id,async()=>{throw Error();});assert.equal((await manager.login()).status,'browser_error');
});
test('login and activation use same restricted IPC; untrusted sender cannot open browser',async()=>{
 let starts=0;const callbacks=new Map(),license={status:()=>({authorized:false}),login:async()=>{starts++;return {status:'waiting_browser'};},cancelLogin:()=>({status:'cancelled'}),check:()=>({authorized:false}),logout:()=>({authorized:false})};
 registerLicenseHandlers({handle:(c,f)=>callbacks.set(c,f),trusted:e=>{if(e!=='trusted')throw Error('Denied');},license});
 await assert.rejects(callbacks.get('license:login')('other'));assert.equal(starts,0);await callbacks.get('license:login')('trusted');assert.equal(starts,1);assert.equal((await callbacks.get('license:cancel')('trusted')).status,'cancelled');assert.equal((await callbacks.get('license:status')('trusted')).authorized,false);
});
test('duplicate callbacks complete only once; wrong state cannot consume pending authorization',async()=>{
 let url;const flow=await authorization(config,'persistent-installation',async value=>{url=new URL(value);});await flow.launched;
 try{
  const callback=new URL(url.searchParams.get('redirect_uri'));callback.searchParams.set('code','single-code');callback.searchParams.set('state','wrong');assert.equal((await fetch(callback)).status,400);
  callback.searchParams.set('state',url.searchParams.get('state'));const results=await Promise.allSettled([fetch(callback),fetch(callback)]);assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.status===200).length,1);assert.equal((await flow.result).code,'single-code');
 }finally{flow.cancel();}
});
