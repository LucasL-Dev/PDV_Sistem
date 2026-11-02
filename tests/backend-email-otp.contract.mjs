import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join,resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LicenseManager } from '../electron/licensing/manager.mjs';
import { LicenseClient } from '../electron/licensing/client.mjs';
import { authorization } from '../electron/licensing/loopback.mjs';
const backend=process.env.OMNIPDV_BACKEND_REPO;
test('real OTP backend interoperates with existing desktop PKCE/licensing, without passkey or provider calls', {skip:!backend},async()=>{
 const {fixture}=await import(pathToFileURL(join(resolve(backend),'tests/helpers/onboarding.mjs')).href);
 const f=await fixture({emailOtpEnabled:true});
 try {
  await f.pay();await f.billing.runQueue();const local=await f.listen();
  const origin='https://api.omnipdv.com.br';
  // Test-only HTTP transport maps the trusted production origin to an isolated
  // backend fixture. The application never performs this mapping.
  const transport=async(url,options={})=>{const parsed=new URL(url);assert.equal(parsed.origin,origin);return fetch(local+parsed.pathname+parsed.search,options);};
  const post=async(path,body,cookie,csrf)=>{
   const res=await transport(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:JSON.stringify(body)});
   assert.equal(res.status,200,path);return res;
  };
  let data;const storage={load:async()=>data,save:async value=>{data=structuredClone(value);}};
  const manager=new LicenseManager({config:{origin,issuer:origin,audience:'omnipvd-desktop'},client:new LicenseClient({origin},transport),storage,now:f.now,
   authorize:(config,id)=>authorization(config,id,async url=>{
    const settings=await(await transport(origin+'/api/auth/config')).json();assert.equal(settings.email_otp_enabled,true);
    const request=await post('/api/auth/email-otp/request',{email:'buyer@example.invalid',requestKey:randomBytes(32).toString('base64url')});
    const otpCookie=request.headers.getSetCookie().find(c=>c.startsWith('omnipdv_otp=')).split(';')[0];const {requestId}=await request.json();
    await f.billing.runQueue();const verified=await post('/api/auth/email-otp/verify',{requestId,code:f.loginCode()},otpCookie);
    const cookie=verified.headers.getSetCookie().find(c=>c.startsWith('omnipvd_browser=')).split(';')[0];
    assert.equal(f.billing.db.prepare('SELECT count(*) n FROM auth_credentials').get().n,0);
    const requestUrl=new URL(url);const redirect=await transport(url,{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(new URL(redirect.headers.get('location')).origin,origin);
    const session=await(await transport(origin+'/api/auth/session',{headers:{Cookie:cookie}})).json();
    const consent=await(await post('/api/auth/authorize',Object.fromEntries(requestUrl.searchParams),cookie,session.csrf_token)).json();
    assert.equal((await fetch(consent.redirect_uri)).status,200);
   })});
  await manager.init();await manager.login();assert.equal(manager.status().authorized,true);
  assert.ok(!JSON.stringify(manager.status()).includes(data.session.refresh_token));
  f.subs.get('sub_cus_A').status='canceled';await manager.check();assert.equal(manager.status().status,'inactive');assert.equal(data.offline,null);
  f.subs.get('sub_cus_A').status='active';await manager.check();assert.equal(manager.status().authorized,true);
  f.auth.revoke(f.auth.accessSession(manager.access.token));await manager.check();assert.equal(manager.status().authorized,false);
 }finally{await f.close();}
});
test('OTP disabled remains a browser choice and preserves the passkey alternative', {skip:!backend},async()=>{
 const {fixture}=await import(pathToFileURL(join(resolve(backend),'tests/helpers/onboarding.mjs')).href);const f=await fixture({emailOtpEnabled:false});
 try{const local=await f.listen();const config=await(await fetch(local+'/api/auth/config')).json();assert.equal(config.email_otp_enabled,false);const page=await(await fetch(local+'/account/login')).text();assert.match(page,/passkey/i);}
 finally{await f.close();}
});
