import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { SignJWT, exportJWK } from 'jose';
import { LicenseManager } from '../electron/licensing/manager.mjs';
import { LicenseClient, LicenseError } from '../electron/licensing/client.mjs';
import { authorization } from '../electron/licensing/loopback.mjs';
import { ProtectedStorage } from '../electron/licensing/storage.mjs';
import { licenseConfig } from '../electron/licensing/config.mjs';
import { checkOperation, checkFiscal } from '../electron/licensing/policy.mjs';
import { Store } from '../electron/store.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const config=licenseConfig({packaged:false,env:{OMNIPDV_LICENSE_ORIGIN:'http://localhost:3000'}});
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'EdDSA',use:'sig'};
function memory(initial=null) {let value=initial;return {load:async()=>structuredClone(value),save:async(v)=>{value=structuredClone(v);},get:()=>structuredClone(value)};}
async function fixture() {
  let time=Date.now();const now=()=>time;
  const installation_id=randomBytes(24).toString('base64url');
  const session={installation_id,session_id:'session-1',account_id:'account-1',refresh_token:'refresh-1',session_expires_at:new Date(time+86400000).toISOString()};
  const token=()=>({...session,token_type:'Bearer',access_token:'access-1',expires_in:600});
  const sign=async(extra={})=>new SignJWT({sid:session.session_id,installation_id,product:'omnipvd',authorized:true,...extra}).setProtectedHeader({alg:'EdDSA',kid:'test-key',typ:'omnipvd-license+jwt'}).setIssuer(config.issuer).setAudience(config.audience).setSubject(session.account_id).setIssuedAt(Math.floor(now()/1000)).setNotBefore(Math.floor(now()/1000)).setExpirationTime(Math.floor(now()/1000)+3600).setJti('unique-license').sign(privateKey);
  const storage=memory({installation_id,origin:config.origin,session,lastTime:time});
  const client={keys:async()=>({keys:[jwk]}),exchange:async()=>token(),logout:async()=>({ok:true}),status:async()=>({authorized:true,authorization_expires_at:new Date(now()+3599000).toISOString(),next_check_at:new Date(now()+900000).toISOString(),offline_authorization:await sign()})};
  const manager=new LicenseManager({config,client,storage,now,authorize:async()=>({result:Promise.resolve({grant_type:'authorization_code',code:'code'}),cancel:()=>{}})});
  return {manager,storage,client,session,token,sign,now,advance:(ms)=>{time+=ms;}};
}
test('unauthenticated application is blocked, recovery reads remain available',async()=>{
 const f=await fixture();f.storage=memory();const m=new LicenseManager({config,client:f.client,storage:f.storage,now:f.now});
 await m.init();assert.equal(m.status().status,'unauthenticated');assert.throws(()=>m.assertCommercial());
 for(const action of ['status','login','snapshot','shiftReport'])checkOperation(m,action);
 for(const action of ['sale','openShift','settings','return','settleDebt','deleteSale','unknown'])assert.throws(()=>checkOperation(m,action));
 checkFiscal(m,'GET');assert.throws(()=>checkFiscal(m,'POST'));
});
test('successful authorization-code login uses existing installation and releases active subscription',async()=>{
 const f=await fixture();await f.manager.init();let grant;
 f.client.exchange=async input=>{grant=input;return f.token();};await f.manager.login();
 assert.equal(grant.grant_type,'authorization_code');assert.equal(f.manager.status().authorized,true);
 assert.equal(f.storage.get().session.refresh_token,'refresh-1');assert.ok(!JSON.stringify(f.manager.status()).includes('access-1'));
});
test('active subscription is cryptographically verified; canceled subscription removes offline access',async()=>{
 const f=await fixture();await f.manager.init();assert.equal(f.manager.status().authorized,true);
 f.client.status=async()=>({authorized:false,subscription_status:'canceled'});await f.manager.check();
 assert.equal(f.manager.status().status,'inactive');assert.equal(f.storage.get().offline,null);assert.throws(()=>f.manager.assertCommercial());
});
test('expired access token refreshes once for concurrent checks',async()=>{
 const f=await fixture();await f.manager.init();f.advance(601000);let count=0;f.client.exchange=async()=>{count++;return f.token();};
 await Promise.all([f.manager.check(),f.manager.check(),f.manager.check()]);assert.equal(count,1);assert.equal(f.manager.status().authorized,true);
});
test('revoked or invalid refresh token requires login and rejects previous offline lease',async()=>{
 const f=await fixture();await f.manager.init();f.advance(601000);f.client.exchange=async()=>{throw new LicenseError(400,'invalid_grant');};await f.manager.check();
 assert.equal(f.manager.status().authorized,false);assert.equal(f.storage.get().offline,null);assert.equal(f.storage.get().session,null);
});
test('valid offline authorization survives backend outage without extending expiration',async()=>{
 const f=await fixture();await f.manager.init();const until=f.manager.status().expiresAt;f.client.status=async()=>{throw new LicenseError(503,'offline');};await f.manager.check();
 assert.equal(f.manager.status().status,'offline');assert.equal(f.manager.status().expiresAt,until);const fixed=f.manager.status().expiresAt;
 f.advance(10000);await f.manager.check();assert.equal(f.manager.status().expiresAt,fixed);
});
test('expired or tampered offline signature cannot authorize',async()=>{
 const f=await fixture();await f.manager.init();f.client.status=async()=>{throw new LicenseError(0,'network');};
 f.manager.data.offline=f.manager.data.offline.slice(0,-10)+'aaaaaaaaaa';await f.manager.check();assert.equal(f.manager.status().authorized,false);
 const g=await fixture();await g.manager.init();g.advance(3601000);assert.throws(()=>g.manager.assertCommercial());
 g.client.keys=async()=>{throw new LicenseError(0,'network');};g.manager.access=null;await g.manager.check();assert.equal(g.manager.status().authorized,false);
});
test('backend unavailable without a previous lease remains blocked without claiming cancellation',async()=>{
 const f=await fixture();f.client.keys=async()=>{throw new LicenseError(503,'offline');};await f.manager.init();
 assert.equal(f.manager.status().status,'unavailable');assert.equal(f.manager.status().authorized,false);
});
test('restart restores protected session and performs real refresh/status; offline restart uses existing signed lease',async()=>{
 const f=await fixture();await f.manager.init();const m=new LicenseManager({config,client:f.client,storage:f.storage,now:f.now});await m.init();assert.equal(m.status().authorized,true);
 f.client.keys=async()=>{throw new LicenseError(0,'network');};const offline=new LicenseManager({config,client:f.client,storage:f.storage,now:f.now});await offline.init();assert.equal(offline.status().status,'offline');
});
test('uncertain refresh persists a marker, never replays after restart',async()=>{
 const f=await fixture();await f.manager.init();f.advance(601000);let count=0;f.client.exchange=async()=>{count++;throw new LicenseError(0,'network');};
 await f.manager.check();await f.manager.check();assert.equal(count,1);assert.equal(f.storage.get().refreshPending,true);
 const m=new LicenseManager({config,client:f.client,storage:f.storage,now:f.now});await m.init();assert.equal(m.status().status,'login_required');assert.equal(count,1);
});
test('clock rollback and foreign identity/installation are rejected',async()=>{
 const f=await fixture();await f.manager.init();f.advance(-10000);assert.throws(()=>f.manager.assertCommercial());await f.manager.check();assert.equal(f.manager.status().authorized,false);
 const g=await fixture();g.client.status=async()=>({authorized:true,authorization_expires_at:new Date(g.now()+100000).toISOString(),next_check_at:new Date(g.now()+30000).toISOString(),offline_authorization:await g.sign({installation_id:'another-install'})});await g.manager.init();assert.equal(g.manager.status().authorized,false);
});
test('loopback rejects wrong state, paths, methods and duplicates, and produces exact S256 exchange',async()=>{
 let captured;const flow=await authorization(config,randomBytes(24).toString('base64url'),async url=>{captured=new URL(url);},{timeout:3000});
 try {
 const redirect=captured.searchParams.get('redirect_uri');const url=new URL(redirect);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/omnipvd/callback');
 assert.equal((await fetch(redirect+'?state=wrong&code=code')).status,400);
 assert.equal((await fetch(redirect.replace('/callback','/wrong'))).status,400);
 assert.equal((await fetch(redirect,{method:'POST'})).status,400);
 const good=new URL(redirect);good.searchParams.set('code','valid-code');good.searchParams.set('state',captured.searchParams.get('state'));
 const duplicate=new URL(good);duplicate.searchParams.append('code','extra');assert.equal((await fetch(duplicate)).status,400);
 assert.equal((await fetch(good)).status,200);const exchange=await flow.result;
 assert.equal(exchange.redirect_uri,redirect);assert.equal(exchange.grant_type,'authorization_code');
 assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'),captured.searchParams.get('code_challenge'));
 } finally {flow.cancel();}
});
test('protected storage writes encrypted content and refuses insecure protection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omni-license-'));const key=randomBytes(32);
 const safe={isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'test',encryptStringAsync:async text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(text,'utf8'),c.final(),c.getAuthTag()]);},decryptStringAsync:async b=>{const c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();}};
 try {const file=join(dir,'session.bin');const storage=new ProtectedStorage(file,safe);await storage.save({refresh_token:'secret-refresh'});assert.ok(!(await readFile(file)).includes(Buffer.from('secret-refresh')));assert.equal((await storage.load()).refresh_token,'secret-refresh');await assert.rejects(new ProtectedStorage(file,{isAsyncEncryptionAvailable:async()=>false}).load());}finally{await rm(dir,{recursive:true,force:true});}
});
test('license denial preserves existing local database; direct commercial calls are blocked',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'omni-preserve-'));const path=join(dir,'pdv.sqlite');let db=new Store(path);
 try {
 db.call('bootstrap',{name:'Admin',login:'admin',password:'password123'});db.call('product',{name:'Existing',barcode:'001',category:'Existing',price:1000,stock:5});db.call('openShift',{opening:100});const before=db.read();db.close();db=new Store(path);
 const f=await fixture();f.manager.set('inactive','');db.authorize=a=>checkOperation(f.manager,a);
 db.call('login',{login:'admin',password:'password123'});assert.equal(db.call('snapshot').products[0].stock,5);assert.throws(()=>db.call('movement',{type:'sangria',amount:1,reason:'blocked'}));assert.deepEqual(db.read(),before);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('production forbids localhost and environment overrides; client uses exact routes and never follows redirects',async()=>{
 assert.throws(()=>licenseConfig({packaged:true,production:{origin:'http://localhost:3000'}}));assert.throws(()=>licenseConfig({packaged:true,env:{OMNIPDV_LICENSE_ORIGIN:'http://localhost:3000'}}));
 const prod=licenseConfig({packaged:true,env:{OMNIPDV_LICENSE_ORIGIN:'http://localhost:3000'},production:{origin:'https://account.example.com'}});assert.equal(prod.origin,'https://account.example.com');
 const calls=[];const c=new LicenseClient(config,async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({})};});await c.exchange({grant_type:'refresh_token',refresh_token:'secret'});await c.status('access');await c.keys();await c.logout('access');
 assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/api/auth/token','/api/license/status','/.well-known/omnipvd-license-keys.json','/api/auth/logout']);assert.equal(calls[0].options.redirect,'error');assert.equal(JSON.parse(calls[0].options.body).client_id,'omnipvd-desktop');
});

test('known outage with expired access preserves valid offline authorization without sending refresh',async()=>{
 const f=await fixture();await f.manager.init();f.advance(601000);let calls=0;
 f.client.keys=async()=>{throw new LicenseError(0,'network');};f.client.exchange=async()=>{calls++;return f.token();};
 await f.manager.check();assert.equal(f.manager.status().status,'offline');assert.equal(calls,0);assert.equal(f.storage.get().refreshPending,false);
});
