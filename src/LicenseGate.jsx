import React, { useEffect, useState } from 'react';
import logo from '../assets/brand/icon-256.png';
export function LicenseGate({children}) {
  const [license,setLicense]=useState({status:'checking',authorized:false,message:'Verificando licença…'});
  const [recovery,setRecovery]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;
    const poll=()=>window.license.status().then(s=>{if(alive)setLicense(s);}).catch(()=>{if(alive)setLicense({authorized:false,message:'Não foi possível verificar a licença.'});});
    poll();const timer=setInterval(poll,2000);return()=>{alive=false;clearInterval(timer);};
  },[]);
  const act=async(method)=>{setBusy(true);setError('');try{setLicense(await window.license[method]());}catch{setError('Não foi possível concluir. Confira a configuração e tente novamente.');}finally{setBusy(false);}};
  if(license.authorized || recovery)return <>
    <aside className="license-banner" role="status">
      {license.authorized ? (license.status==='offline'?'Modo offline autorizado':'Assinatura ativa') : 'Modo de recuperação: operações comerciais bloqueadas.'}
      {license.expiresAt && <> · Válida até {new Date(license.expiresAt).toLocaleString('pt-BR')}</>}
      {!license.authorized && <button onClick={()=>setRecovery(false)}>Ativar assinatura</button>}
      <button disabled={busy} onClick={()=>act('logout')}>Desconectar assinatura</button>
    </aside>{children}
  </>;
  return <main className="license-screen"><section className="panel">
    <img src={logo} width="64" height="64" alt="OmniPDV"/>
    <h1>Ative seu OmniPDV</h1><p role="status">{license.message}</p>
    {license.expiresAt && <p>Autorização até {new Date(license.expiresAt).toLocaleString('pt-BR')}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" disabled={busy} onClick={()=>act('login')}>{busy?'Aguardando…':'Entrar na minha conta'}</button>
    <button disabled={busy} onClick={()=>act('check')}>Verificar novamente</button>
    <button onClick={()=>setRecovery(true)}>Consultar e recuperar meus dados</button>
    <button onClick={()=>act('logout')}>Cancelar entrada / sair da assinatura</button>
    <p className="muted">A entrada será feita no navegador, com sua passkey. Seus dados locais serão preservados.</p>
  </section></main>;
}
