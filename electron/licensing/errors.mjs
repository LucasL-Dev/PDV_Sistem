// Only curated messages cross the licensing IPC boundary. Never echo API bodies,
// browser URLs, authorization codes, provider errors or tokens.
export class AuthorizationError extends Error {
  constructor(code) { super(code); this.code=code; }
}
export function loginFailure(error) {
  if(error?.message?.startsWith('Ative a proteção de credenciais'))return ['storage_error','A proteção de credenciais do Windows não está disponível. Entre novamente após desbloquear seu usuário do Windows.'];
  if(['EACCES','EPERM','ENOSPC'].includes(error?.code))return ['storage_error','Não foi possível salvar a sessão protegida. Confira permissões e espaço em disco e tente novamente.'];
  const messages={
    browser_open_failed:['browser_error','Não foi possível abrir o navegador padrão. Confira o navegador padrão do Windows e tente novamente.'],
    callback_unavailable:['callback_error','Não foi possível iniciar o retorno local. Verifique se a proteção do computador permite conexões em 127.0.0.1 e tente novamente.'],
    authorization_timeout:['timeout','O tempo de entrada terminou. Clique em Entrar novamente para receber outro código no navegador.'],
    authorization_cancelled:['cancelled','Autenticação cancelada. Você pode tentar novamente quando quiser.'],
  };
  if(messages[error?.code])return messages[error.code];
  if(error?.status===0 || error?.status>=500)return ['connection_error','Não foi possível conectar à API. Confira a internet e tente novamente.'];
  if(error?.status===429)return ['rate_limited','Muitas tentativas. Aguarde um minuto antes de tentar novamente.'];
  if([400,401,403].includes(error?.status))return ['login_required','A autorização expirou ou foi recusada. Clique em Entrar novamente no navegador.'];
  return ['login_error','Não foi possível concluir a entrada. Confira a conexão e tente novamente. Se continuar, procure o suporte.'];
}
