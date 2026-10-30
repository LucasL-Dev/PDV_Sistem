// Windows-only UI fixture. Synthetic backend + real Windows DPAPI, no licensing
// bypass in the application. This file is excluded from application packaging.
import { app, safeStorage } from 'electron';
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { SignJWT, exportJWK } from 'jose';
import { join } from 'node:path';
import { ProtectedStorage } from '../electron/licensing/storage.mjs';
if (!process.env.PDV_SMOKE || process.platform!=='win32') throw Error('Use esta fixture apenas no teste Windows com pasta temporária.');
app.whenReady().then(async () => {
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const key={...await exportJWK(publicKey),kid:'ui-test',alg:'EdDSA',use:'sig'};
const installation_id=randomBytes(24).toString('base64url');
const session={installation_id,session_id:'ui-session',account_id:'ui-account',refresh_token:randomBytes(32).toString('base64url'),session_expires_at:new Date(Date.now()+86400000).toISOString()};
let origin;
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 try {
  if(req.url==='/.well-known/omnipvd-license-keys.json'){res.end(JSON.stringify({keys:[key]}));return;}
  if(req.url==='/api/auth/token' && req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
   if(input.client_id!=='omnipvd-desktop'||input.refresh_token!==session.refresh_token)throw Error();
   session.refresh_token=randomBytes(32).toString('base64url');
   res.end(JSON.stringify({...session,access_token:'synthetic-ui-access',token_type:'Bearer',expires_in:600}));return;
  }
  if(req.url==='/api/license/status' && req.headers.authorization==='Bearer synthetic-ui-access'){
   const now=Math.floor(Date.now()/1000),exp=now+3600;
   const token=await new SignJWT({sid:session.session_id,installation_id,product:'omnipvd',authorized:true}).setProtectedHeader({alg:'EdDSA',kid:key.kid,typ:'omnipvd-license+jwt'}).setIssuer(origin).setAudience('omnipvd-desktop').setSubject(session.account_id).setIssuedAt(now).setNotBefore(now).setExpirationTime(exp).setJti(randomBytes(16).toString('hex')).sign(privateKey);
   res.end(JSON.stringify({authorized:true,subscription_status:'active',authorization_expires_at:new Date(exp*1000).toISOString(),next_check_at:new Date(Date.now()+900000).toISOString(),offline_authorization:token}));return;
  }
  res.writeHead(404).end('{}');
 }catch{res.writeHead(401).end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));server.unref();
origin=`http://127.0.0.1:${server.address().port}`;
process.env.OMNIPDV_LICENSE_ORIGIN=origin;
await new ProtectedStorage(join(process.env.PDV_SMOKE,'licensing/session.bin'),safeStorage).save({installation_id,origin,session,lastTime:Date.now()});
await import('../electron/main.mjs');

}).catch(() => { console.error("Falha na fixture de licença/DPAPI."); app.exit(1); });
