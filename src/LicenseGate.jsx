import React, { useEffect, useRef, useState } from 'react';
import logo from '../assets/brand/icon-256.png';
const pending=new Set(['checking','opening_browser','waiting_browser','verifying']);
export function LicenseGate({children}) {
  const [license,setLicense]=useState({status:'checking',authorized:false,message:'Verificando licença…'});
  const [recovery,setRecovery]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const actionRef=useRef(false), sequence=useRef(0);
  useEffect(()=>{
    let alive=true;
    const poll=()=>{const current=sequence.current;return window.license.status().then(s=>{if(alive && current===sequence.current)setLicense(s);}).catch(()=>{if(alive)setError('Não foi possível consultar a licença no aplicativo. Tente novamente ou reinicie o OmniPDV.');});};
    poll();const timer=setInterval(poll,500);return()=>{alive=false;clearInterval(timer);};
  },[]);
  const act=async(method)=>{
    if(actionRef.current)return;
    actionRef.current=true;setBusy(true);setError('');const current=++sequence.current;
    if(method==='login')setLicense(s=>({...s,status:'opening_browser',message:'Abrindo o navegador padrão para entrar na sua conta…'}));
    try{const value=await window.license[method]();if(current===sequence.current)setLicense(value);}
    catch(e){if(current===sequence.current){setError(e?.message || 'Não foi possível concluir a operação. Tente novamente.');if(method==='login')setLicense(s=>({...s,authorized:false,status:'login_error',message:'Não foi possível iniciar a entrada. Tente novamente.'}));}}
    finally{if(current===sequence.current){actionRef.current=false;setBusy(false);}}
  };
  const cancel=async()=>{
    const current=++sequence.current;setError('');
    try{const value=await window.license.cancel();if(current===sequence.current)setLicense(value);}
    catch(e){if(current===sequence.current)setError(e?.message || 'Não foi possível cancelar. Tente novamente.');}
    finally{if(current===sequence.current){actionRef.current=false;setBusy(false);}}
  };
  const waiting=['opening_browser','waiting_browser'].includes(license.status);
  const disabled=busy||pending.has(license.status);
  const feedback=error&&<p className="error" role="alert">{error}</p>;
  if(license.authorized || recovery)return <>
    <aside className="license-banner" role="status">
      {license.authorized ? (license.status==='offline'?'Modo offline autorizado':'Licença ativa') : 'Modo de recuperação: operações comerciais bloqueadas.'}
      {license.expiresAt && <> · Válida até {new Date(license.expiresAt).toLocaleString('pt-BR')}</>}
      {!license.authorized && <button onClick={()=>{setRecovery(false);act('login');}}>Ativar aplicativo</button>}
      <button disabled={disabled} onClick={()=>act('logout')}>Desconectar assinatura</button>
    </aside>{feedback}{children}
  </>;
  return <main className="license-screen"><section className="panel">
    <img src={logo} width="64" height="64" alt="OmniPDV"/>
    <h1>Ative seu OmniPDV</h1><p role="status" aria-live="polite">{license.message}</p>
    {license.expiresAt && <p>Autorização até {new Date(license.expiresAt).toLocaleString('pt-BR')}</p>}
    {feedback}
    <button className="primary" disabled={disabled} onClick={()=>act('login')}>{waiting?'Aguardando autenticação no navegador…':license.status==='verifying'?'Verificando licença…':'Entrar na minha conta'}</button>
    {waiting && <p>Não apareceu nenhuma janela? Confira seu navegador padrão e a barra de tarefas. Você pode cancelar e tentar novamente.</p>}
    {waiting && <button onClick={cancel}>Cancelar autenticação</button>}
    <button disabled={disabled} onClick={()=>act('check')}>Verificar licença novamente</button>
    <button onClick={()=>setRecovery(true)}>Consultar e recuperar meus dados</button>
    {!waiting && <button disabled={disabled} onClick={()=>act('logout')}>Sair da assinatura / trocar ambiente</button>}
    <p className="muted">Entre com o e-mail da compra e o código temporário na página da API, quando essa opção estiver habilitada. Passkey continua disponível no navegador. Seus dados locais serão preservados.</p>
  </section></main>;
}
