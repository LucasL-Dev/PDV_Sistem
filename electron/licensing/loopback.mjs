import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export async function authorization(config, installationId, openExternal, {timeout = 180000} = {}) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  let resolve, reject, consumed = false, timer;
  const result = new Promise((yes, no) => { resolve = yes; reject = no; });
  // Attach a handler immediately; browser launch may fail before caller awaits.
  result.catch(() => {});
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400).end('Callback inválido.'); return; }
    const supplied = url.searchParams.get('state') || '';
    const valid = req.method === 'GET' && req.headers.host === `127.0.0.1:${server.address()?.port}` && url.pathname === '/omnipvd/callback' &&
      [...url.searchParams.keys()].length === 2 && url.searchParams.getAll('state').length === 1 && url.searchParams.getAll('code').length === 1 &&
      Buffer.byteLength(supplied) === Buffer.byteLength(state) && timingSafeEqual(Buffer.from(supplied), Buffer.from(state)) &&
      /^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get('code') || '');
    if (!valid || consumed) { res.writeHead(400).end('Callback inválido. Volte ao aplicativo.'); return; }
    consumed = true;
    res.end('Autorização recebida. Você pode voltar ao OmniPDV.');
    clearTimeout(timer); server.close(); server.closeIdleConnections();
    resolve({grant_type:'authorization_code', code:url.searchParams.get('code'), code_verifier:verifier, redirect_uri:redirect});
  });
  await new Promise((yes,no) => { server.once('error',no); server.listen(0,'127.0.0.1',yes); });
  const redirect = `http://127.0.0.1:${server.address().port}/omnipvd/callback`;
  const cancel = () => { clearTimeout(timer); server.close(); server.closeAllConnections(); reject(Error('Autenticação cancelada. Tente entrar novamente.')); };
  timer = setTimeout(cancel,timeout); timer.unref();
  const url = new URL('/api/auth/authorize',config.origin);
  Object.entries({client_id:'omnipvd-desktop', response_type:'code', code_challenge_method:'S256', code_challenge:createHash('sha256').update(verifier).digest('base64url'), state, installation_id:installationId, device_name:'OmniPDV Windows', redirect_uri:redirect}).forEach(([k,v])=>url.searchParams.set(k,v));
  try { await openExternal(url.href); } catch { cancel(); }
  return {result, cancel};
}
