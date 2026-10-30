import { randomBytes } from 'node:crypto';
import { verifyOffline } from './offline.mjs';
export class LicenseManager {
  constructor({config, client, storage, authorize, now=()=>Date.now()}) {
    Object.assign(this,{config,client,storage,authorize,now});
    this.state={status:'checking',authorized:false}; this.access=null; this.data=null; this.stopped=false; this.wallAnchor=this.now(); this.monoAnchor=performance.now();
  }
  set(status,message,authorized=false,until=null) { this.state={status,message,authorized,expiresAt:until}; return this.status(); }
  status() {
    const current=this.now(), monotonic=performance.now();
    if(current+1000 < this.wallAnchor+(monotonic-this.monoAnchor))this.clockUnsafe=true;
    if(current>=this.wallAnchor){this.wallAnchor=current;this.monoAnchor=monotonic;}
    if(this.state.authorized && (this.clockUnsafe || this.now()>=this.state.expiresAt || this.now()+1000<(this.data?.lastTime||0)))
      this.state={status:'reconnect',message:'Reconecte para validar a licença.',authorized:false};
    return {...this.state};
  }
  assertCommercial() { if(!this.status().authorized)throw Error('Licença necessária. Entre na sua conta ou use os recursos de recuperação.'); }
  async persist() { this.data.lastTime=Math.max(this.data.lastTime||0,this.now()); await this.storage.save(this.data); }
  async init() {
    try {
      this.data=await this.storage.load() || {installation_id:randomBytes(24).toString('base64url'),origin:this.config.origin};
      if(this.data.origin!==this.config.origin)throw Error('A origem da sessão mudou. Saia da conta e entre novamente.');
      if(this.now()+1000<(this.data.lastTime||0)) { this.data.offline=null; await this.persist(); return this.set('reconnect','Relógio regressivo detectado. Entre novamente com conexão.'); }
      if(this.data.refreshPending) return this.set('login_required','A renovação anterior foi interrompida. Entre novamente.');
      return await this.check();
    } catch { return this.set('storage_error','Não foi possível abrir a sessão protegida. Os dados locais foram preservados.'); }
  }
  async refresh() {
    const s=this.data.session;
    if(!s?.refresh_token || this.data.refreshPending || Date.parse(s.session_expires_at)<=this.now())throw Object.assign(Error(),{status:401});
    this.data.refreshPending=true; await this.persist();
    let result;
    try { result=await this.client.exchange({grant_type:'refresh_token',refresh_token:s.refresh_token}); }
    catch(e) {
      // Never retry a refresh whose outcome is unknown, including after restart.
      if(e.status===400 || e.status===401 || e.status===403) {this.data.session=null;this.data.offline=null;}
      throw e;
    }
    this.accept(result,s); this.data.refreshPending=false; await this.persist();
  }
  accept(result, previous) {
    if(result.token_type!=='Bearer' || typeof result.access_token!=='string' || typeof result.refresh_token!=='string' ||
       !Number.isFinite(result.expires_in) || result.expires_in<=0 || result.expires_in>900 ||
       !result.account_id || !result.session_id || result.installation_id!==this.data.installation_id ||
       !(Date.parse(result.session_expires_at)>this.now()) || (previous && (result.session_id!==previous.session_id || result.account_id!==previous.account_id || result.session_expires_at!==previous.session_expires_at)))
      throw Error('Resposta de autenticação inválida.');
    this.access={token:result.access_token,expires:this.now()+result.expires_in*1000};
    const {refresh_token,account_id,session_id,installation_id,session_expires_at}=result;
    this.data.session={refresh_token,account_id,session_id,installation_id,session_expires_at};
  }
  async offline() {
    if(this.clockUnsafe || !this.data?.offline || !this.data.session || this.data.refreshPending)throw Error();
    const claims=await verifyOffline(this.data.offline,this.data.keys,this.config,this.data.session,this.now());
    await this.persist();
    return this.set('offline','Sem conexão. Autorização offline válida até o prazo indicado.',true,Math.min(claims.exp*1000,this.data.offlineUntil || claims.exp*1000));
  }
  async check() {
    if(this.loginFlight && !this.completingLogin)return this.status();
    if(this.flight)return this.flight;
    this.flight=this.performCheck().finally(()=>{this.flight=null;}); return this.flight;
  }
  async performCheck() {
    if(this.stopped)return this.status();
    try {
      if(this.loginFlight && !this.access)return this.status();
      if(!this.data?.session)return this.set('unauthenticated','Entre na sua conta para ativar o OmniPDV.');
      if(this.now()+1000<(this.data.lastTime||0)) {this.data.offline=null;await this.persist();return this.set('reconnect','Relógio regressivo detectado. Reconecte e entre novamente.');}
      if(this.data.refreshPending)return this.set('login_required','Entre novamente para renovar sua sessão com segurança.');
      if(!this.access)await this.client.keys(); // Connectivity probe before a non-retryable refresh on restart.
      if(!this.access || this.access.expires<=this.now()+10000)await this.refresh();
      let response;
      try {response=await this.client.status(this.access.token);}
      catch(e) { if(e.status!==401)throw e; await this.refresh();response=await this.client.status(this.access.token); }
      if(typeof response.authorized!=='boolean')throw Error('Resposta de licença inválida.');
      if(!response.authorized) {this.data.offline=null;await this.persist();return this.set('inactive','Sua assinatura não está ativa. Os recursos de recuperação continuam disponíveis.');}
      const keys=await this.client.keys();
      const claims=await verifyOffline(response.offline_authorization,keys,this.config,this.data.session,this.now());
      const until=Math.min(claims.exp*1000,Date.parse(response.authorization_expires_at));
      const next=Date.parse(response.next_check_at);
      if(!(until>this.now()) || !(next>this.now()))throw Error('Prazo de licença inválido.');
      this.clockUnsafe=false;this.wallAnchor=this.now();this.monoAnchor=performance.now();
      this.data.offline=response.offline_authorization; this.data.offlineUntil=until; this.data.keys=keys;this.data.lastTime=Math.max(this.data.lastTime||0,claims.iat*1000);
      this.nextCheck=Math.min(next,until); await this.persist();
      return this.set('authorized','Assinatura validada.',true,until);
    } catch(e) {
      if(this.data?.refreshPending) {
        this.access=null;this.data.offline=null; await this.persist().catch(()=>{});
        return this.set('login_required','A renovação não foi confirmada. Entre novamente; sua assinatura não foi considerada cancelada.');
      }
      if([400,401,403].includes(e.status)) {
        this.access=null;this.data.session=null;this.data.offline=null;await this.persist().catch(()=>{});
        return this.set('login_required','Sessão expirada ou revogada. Entre novamente.');
      }
      if(e.status===0 || e.status===429 || e.status>=500) {
        try {return await this.offline();}catch{}
        return this.set('unavailable','Servidor temporariamente indisponível. Não há autorização offline válida; tente novamente.');
      }
      if(this.data){this.data.offline=null;await this.persist().catch(()=>{});}
      return this.set('invalid','Não foi possível verificar a autorização. Reconecte para validar sua licença.');
    }
  }
  async login() {
    if(this.loginFlight)return this.loginFlight;
    this.loginFlight=this.performLogin().finally(()=>{this.loginFlight=null;});return this.loginFlight;
  }
  async performLogin() {
    if(this.flight)await this.flight;
    if(!this.data)this.data={installation_id:randomBytes(24).toString('base64url'),origin:this.config.origin};
    if(this.data.origin!==this.config.origin)throw Error('Saia da conta antes de alterar a origem.');
    await this.persist();
    const flow=await this.authorize(this.config,this.data.installation_id);this.flow=flow;
    try {
      const grant=await flow.result;
      const result=await this.client.exchange(grant);
      this.accept(result);this.data.offline=null;this.data.refreshPending=false;await this.persist();
      this.completingLogin=true; return await this.check();
    } catch {return this.set('login_required','Não foi possível concluir a entrada. Tente novamente no navegador.');}
    finally {this.completingLogin=false;flow.cancel();this.flow=null;}
  }
  async logout() {
    this.flow?.cancel(); if(this.loginFlight)await this.loginFlight;
    if(this.flight)await this.flight;
    this.set('unauthenticated','Entre na sua conta para ativar o OmniPDV.');
    let revoked=true;
    if(this.access)try {await this.client.logout(this.access.token);}catch{revoked=false;}
    this.access=null;this.data={installation_id:this.data?.installation_id||randomBytes(24).toString('base64url'),origin:this.config.origin};await this.persist();
    return this.set('unauthenticated',revoked?'Sessão removida deste aplicativo.':'Sessão removida localmente. Sem conexão, revogue também em sua conta no navegador.');
  }
  start() { this.timer=setInterval(()=>{if(!this.loginFlight && (this.now()>=(this.nextCheck||0) || !this.status().authorized))this.check().catch(()=>{});},30000);this.timer.unref(); }
  async stop() {this.stopped=true;clearInterval(this.timer);this.flow?.cancel();await Promise.allSettled([this.flight,this.loginFlight]);if(this.data)await this.persist().catch(()=>{});}
}
