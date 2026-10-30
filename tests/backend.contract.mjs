// Optional interoperability test: imports the backend without modifying its source,
// uses a new temporary SQLite database and synthetic passkey/Stripe resources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { LicenseManager } from '../electron/licensing/manager.mjs';
import { LicenseClient } from '../electron/licensing/client.mjs';
import { authorization } from '../electron/licensing/loopback.mjs';
const backend=process.env.OMNIPDV_BACKEND_REPO;
test('desktop interoperates with actual backend: verified passkey, browser consent, PKCE, license, refresh and revocation', {skip:!backend}, async()=>{
 const root=resolve(backend), load=p=>import(pathToFileURL(join(root,p)).href);
 const {createAuth}=await load('auth/service.mjs'),{createAuthHandler}=await load('auth/http.mjs'),{createLicensing}=await load('licensing/service.mjs'),{createBilling}=await load('billing/service.mjs');
 const require=createRequire(join(root,'package.json'));
 const {isoCBOR}=await import(pathToFileURL(require.resolve('@simplewebauthn/server/helpers')).href);
 const dir=await mkdtemp(join(tmpdir(),'omni-contract-'));let billing,server;
 try {
 const epoch=Math.floor(Date.now()/1000),list=items=>({async *[Symbol.asyncIterator](){yield*items;}});
 const invoice={id:'in_contract',customer:'cus_contract',subscription:'sub_contract',billing_reason:'subscription_create',status:'paid',paid:true,lines:{has_more:false,data:[{price:{id:'price_contract'},subscription:'sub_contract',period:{start:epoch-60,end:epoch+86400}}]}};
 const subscription={id:'sub_contract',customer:'cus_contract',livemode:false,status:'active',latest_invoice:invoice,items:{has_more:false,data:[{price:{id:'price_contract'}}]}};
 const stripe={subscriptions:{list:()=>list([subscription]),retrieve:async()=>subscription},invoices:{retrieve:async()=>invoice,list:()=>list([invoice]),listLineItems:()=>list(invoice.lines.data)}};
 billing=createBilling({stripe,resend:null,config:{projectRoot:root,dbPath:join(dir,'billing.sqlite'),emailEnabled:false}});
 let handler;server=createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')).catch(()=>res.writeHead(500).end()));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const config={origin,rpId:'127.0.0.1',secureCookies:false,accessTtlMs:600000,sessionTtlMs:86400000,browserTtlMs:3600000};
 const auth=createAuth({db:billing.db,config});const keys=generateKeyPairSync('ed25519');
 const licensing=await createLicensing({db:billing.db,stripe,privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'}),config:{priceId:'price_contract',keyId:'contract',issuer:origin,audience:'omnipvd-desktop',offlineTtlSeconds:14400,recheckSeconds:900}});
 handler=createAuthHandler({auth,licensing,db:billing.db,config});
 const sha=b=>createHash('sha256').update(b).digest(), b64=b=>Buffer.from(b).toString('base64url');
 const device=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=device.publicKey.export({format:'jwk'}),id=randomBytes(32);
 const claimToken=auth.issueClaim('cus_contract','synthetic-contract-test');
 const enrollment=await auth.registrationOptions({claimToken,displayName:'Synthetic'});
 const cbor=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
 const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
 const clientData=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:enrollment.options.challenge,origin,crossOrigin:false}));
 const authData=Buffer.concat([sha(config.rpId),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,id,cbor]);
 const common={id:b64(id),rawId:b64(id),type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{}};
 await auth.registrationVerify({claimToken,flowToken:enrollment.flowToken,response:{...common,response:{clientDataJSON:b64(clientData),attestationObject:b64(isoCBOR.encode(new Map([['fmt','none'],['authData',new Uint8Array(authData)],['attStmt',new Map()]]))),transports:['internal']}}});
 const post=async(path,body,cookie,csrf)=>{const res=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:JSON.stringify(body)});assert.equal(res.status,200,`Backend contract: ${path}`);return res;};
 const login=await (await post('/api/auth/passkeys/login/options',{})).json();
 const data=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:login.options.challenge,origin,crossOrigin:false}));const count=Buffer.alloc(4);count.writeUInt32BE(1);const assertion=Buffer.concat([sha(config.rpId),Buffer.from([0x05]),count]);
 const result=await post('/api/auth/passkeys/login/verify',{flowToken:login.flowToken,response:{...common,response:{clientDataJSON:b64(data),authenticatorData:b64(assertion),signature:b64(sign('sha256',Buffer.concat([assertion,sha(data)]),device.privateKey)),userHandle:enrollment.options.user.id}}});
 const cookie=result.headers.get('set-cookie').split(';')[0];
 let protectedValue=null;const storage={load:async()=>protectedValue,save:async v=>{protectedValue=structuredClone(v);}};
 const client=new LicenseClient({origin});
 const manager=new LicenseManager({config:{origin,issuer:origin,audience:'omnipvd-desktop'},client,storage,authorize:(c,install)=>authorization(c,install,async url=>{
   const request=new URL(url);const probe=await fetch(url,{redirect:'manual'});assert.equal(probe.status,302);
   const session=await(await fetch(origin+'/api/auth/session',{headers:{Cookie:cookie}})).json();
   const consent=await(await post('/api/auth/authorize',Object.fromEntries(request.searchParams),cookie,session.csrf_token)).json();
   assert.equal((await fetch(consent.redirect_uri)).status,200);
 })});
 await manager.init();assert.equal(manager.status().authorized,false);await manager.login();assert.equal(manager.status().authorized,true);
 const restart=new LicenseManager({config:manager.config,client,storage});await restart.init();assert.equal(restart.status().authorized,true);
 subscription.status='canceled';await restart.check();assert.equal(restart.status().status,'inactive');subscription.status='active';await restart.check();assert.equal(restart.status().authorized,true);
 auth.revoke(auth.accessSession(restart.access.token));await restart.check();assert.equal(restart.status().authorized,false);
 } finally {if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}billing?.close();await rm(dir,{recursive:true,force:true});}
});
