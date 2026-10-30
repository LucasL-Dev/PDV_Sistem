export class LicenseError extends Error {
  constructor(status, code) { super('Não foi possível validar a licença.'); this.status = status; this.code = code; }
}
export class LicenseClient {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  async request(path, { body, access } = {}) {
    let response;
    try {
      response = await this.fetcher(this.config.origin + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {}), ...(access ? {Authorization: `Bearer ${access}`} : {}) },
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
    } catch { throw new LicenseError(0, 'network'); }
    if (!response.ok) throw new LicenseError(response.status, 'http');
    try { return await response.json(); } catch { throw new LicenseError(502, 'invalid_response'); }
  }
  exchange(body) { return this.request('/api/auth/token', {body: {client_id:'omnipvd-desktop', ...body}}); }
  status(access) { return this.request('/api/license/status', {access}); }
  keys() { return this.request('/.well-known/omnipvd-license-keys.json'); }
  logout(access) { return this.request('/api/auth/logout', {access, body:{}}); }
}
