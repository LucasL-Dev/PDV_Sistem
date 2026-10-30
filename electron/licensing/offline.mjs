import { createLocalJWKSet, jwtVerify } from 'jose';
export async function verifyOffline(token, keys, config, session, now) {
  const {payload}=await jwtVerify(token,createLocalJWKSet({keys: (keys?.keys || []).filter(k => k.kty==='OKP' && k.crv==='Ed25519' && !k.d && k.alg==='EdDSA' && k.use==='sig')}),{
    issuer:config.issuer,audience:config.audience, algorithms:['EdDSA'],typ:'omnipvd-license+jwt',currentDate:new Date(now),
    requiredClaims:['sub','sid','installation_id','iat','nbf','exp','jti'],
  });
  if(payload.authorized!==true || payload.product!=='omnipvd' || payload.sub!==session.account_id || payload.sid!==session.session_id || payload.installation_id!==session.installation_id ||
    !Number.isFinite(Date.parse(session.session_expires_at)) || !Number.isFinite(payload.iat) || payload.iat*1000>now || payload.exp-payload.iat>14400 || payload.exp*1000>Date.parse(session.session_expires_at))
    throw Error('Autorização offline inválida.');
  return payload;
}
