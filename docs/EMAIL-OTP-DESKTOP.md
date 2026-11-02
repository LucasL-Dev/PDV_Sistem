# OmniPDV Windows — e-mail e código no navegador

Branch: `feat/email-otp-desktop-login`, baseada em `feat/windows-online-license`. Backend revisado: `LandingPage_OmniPVD/feat/production-integration`, commit `371f2c9` (documentos `auth/EMAIL-OTP.md` e `docs/WINDOWS-EMAIL-OTP.md`). Nenhum backend, serviço Resend/Stripe ou arquivo da VPS foi modificado.

## O que muda

O cliente **reutiliza** `electron/licensing/client.mjs`, `manager.mjs`, `storage.mjs`, `config.mjs`, `loopback.mjs` e a validação Ed25519 existentes. Não há segundo sistema de licença, campo OTP no renderer ou envio de e-mail pelo Electron.

- **Entrar na minha conta** inicia o login pelo navegador padrão.
- **Ativar aplicativo**, no modo de recuperação, inicia o mesmo login com um clique.
- A tela mostra preparação, espera no navegador, verificação da licença e o resultado; erros de abertura do navegador, conexão, timeout e armazenamento têm mensagens específicas.
- **Cancelar autenticação** encerra a tentativa e o listener local sem fazer logout, apagar credenciais anteriores ou alterar dados comerciais. Uma nova tentativa gera outro state/verifier/porta.
- **Sair da assinatura / trocar ambiente** continua sendo a ação explícita de logout, separada do cancelamento.
- A janela aparece enquanto a sessão inicial é verificada. Isso evita que uma consulta lenta à API deixe o usuário esperando sem interface.

As falhas anteriores eram favorecidas por ausência de estado visível de espera, mensagens genéricas, espera pela abertura do navegador antes de devolver um fluxo cancelável e uso de logout como cancelamento. A inicialização também aguardava a API antes de criar a janela. Os erros agora são classificados sem incluir URLs sensíveis, códigos, tokens ou mensagens privadas dos provedores.

## Fluxo e contratos preservados

1. O processo principal abre listener somente em `127.0.0.1`, porta efêmera, `/omnipvd/callback`.
2. Gera state de 32 bytes, verifier criptográfico e challenge S256. Abre `https://api.omnipdv.com.br/api/auth/authorize` com os parâmetros existentes, sem e-mail/OTP/token na URL.
3. O navegador da **API** apresenta e-mail/código ou passkey, conforme a configuração do backend. O Electron não chama os endpoints `/api/auth/email-otp/*` e não armazena o código de seis dígitos.
4. Depois da confirmação no navegador e consentimento explícito, o backend retorna somente o código de autorização curto e state ao callback. Esse código PKCE não é o OTP do e-mail.
5. O processo principal troca o código em `POST /api/auth/token`, consulta `GET /api/license/status` e verifica a autorização Ed25519 usando o JWKS confiável da API.
6. Somente autorização válida libera o comercial. Login OTP bem-sucedido com assinatura inativa continua bloqueado. Erro de conexão não é tratado como cancelamento da assinatura; a licença offline anterior continua sujeita às verificações/prazos existentes.

A callback tem uso único, state comparado em tempo constante, limites de conexões/headers e encerramento em cancelamento/timeout. A espera no navegador é de **dez minutos**, para acomodar o recebimento do e-mail; isso não aumenta a validade do OTP, do código PKCE, da sessão ou da licença no backend. O código PKCE continua com o prazo definido pelo servidor.

## Disponibilidade do OTP no backend

A funcionalidade ainda depende de implantação/habilitação pelo responsável pelo backend. Enquanto `EMAIL_OTP_AUTH_ENABLED` estiver desligado, o navegador não oferecerá OTP; **passkey continua disponível**. O aplicativo não força nem ativa essa flag. O backend decide a interface por `GET /api/auth/config`.

Não gere outra chave Ed25519/outbox, não mude Stripe/Resend e não faça deploy para testar esta branch. A habilitação futura do backend segue os pré-requisitos e procedimentos já documentados no repositório dele.

Contas antigas não migram por coincidência de e-mail. Enquanto não aderirem explicitamente ao OTP pelo fluxo autenticado do navegador, continuam usando passkey. A adesão preserva conta e passkeys; ambiguidades/perda de acesso exigem o suporte definido pelo backend. O desktop não seleciona cliente Stripe ou assinatura pelo e-mail.

## Segurança e dados

- API HTTPS fixa `https://api.omnipdv.com.br` no aplicativo empacotado; a landing `https://omnipdv.com.br` permanece separada.
- PKCE, consentimento, state e callback de uso único permanecem obrigatórios. Nenhum fallback desativa licença, TLS, CSP, CORS ou isolamento do Electron.
- Sessão/refresh permanecem protegidos por DPAPI e escrita atômica; access token somente no processo principal. Nenhum token é retornado nos novos estados públicos ou IPC.
- Refresh, revogação, origem vinculada e licença offline assinada continuam usando o gerenciador original.
- Não há migração/limpeza de banco comercial, estoque, vendas, A1/XMLs ou credenciais de Mercado Pago. O namespace `%APPDATA%\pdv-sistem` e o appId são mantidos.
- Os testes usam pastas, bancos, e-mails, chaves e transportes de teste isolados. Não leem contas pessoais nem enviam e-mails reais.

## Construir o instalador no Windows

Use Windows x64, Node.js 24 e Git. No PowerShell:

```powershell
git clone --branch feat/email-otp-desktop-login https://github.com/LucasL-Dev/PDV_Sistem.git
cd PDV_Sistem
npm install --global pnpm@9.15.0
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm test
pnpm build
pnpm exec electron-builder --config electron-builder.config.cjs --win nsis --x64 --publish never
node scripts/verify-production-package.mjs
node scripts/verify-windows-icon.mjs
Get-ChildItem .\release\OmniPDV-Setup-*.exe | Get-FileHash -Algorithm SHA256
```

A versão permanece 2.1.0; identifique a revisão pelo commit e SHA-256. O arquivo fica em `release\OmniPDV-Setup-2.1.0-x64.exe`. Não há upload/release automático nesta branch. Assinatura de código Windows continua dependendo da configuração Azure já existente; sem ela o SmartScreen pode avisar. Consulte também [BUILD-WINDOWS-ONLINE.md](BUILD-WINDOWS-ONLINE.md).

## Testar a experiência

1. Faça o backup usual antes de testar uma atualização; feche o PDV anterior. Não remova sua pasta de dados.
2. Execute o binário novo. Clique em Entrar (ou use recuperação → Ativar aplicativo) e observe o estado de espera.
3. No navegador da API, use a modalidade disponível. Com OTP habilitado, informe o e-mail original da compra, confirme o código e autorize o dispositivo. Enquanto desligado, use passkey; isso não é falha do botão.
4. Volte ao aplicativo e aguarde a verificação. Assinatura ativa libera a tela local de operadores; assinatura inativa mantém recuperação/exportação/backup disponíveis conforme as permissões locais.
5. Teste cancelar e tentar novamente. Não reutilize uma aba/callback de tentativa cancelada.
6. Feche/reabra para conferir a sessão; não transfira `session.bin` para outro usuário/computador como ativação.

## Testes automatizados

```powershell
pnpm test
pnpm build
pnpm exec electron tests/desktop-email-login.fixture.mjs
```

A fixture de interface usa renderer e preload reais, o mesmo registro de IPC do produto, o gerenciador existente, servidor de callback real, S256 e licenças de teste Ed25519. Somente navegador/serviço remoto e armazenamento de teste são controlados. Verifica botões, erros, espera, cancelamento, timeout, assinatura inativa, falha de rede e atualização automática após autorização válida. DPAPI real entre processos é verificado separadamente na CI Windows existente; nenhuma licença é liberada por uma flag de teste.

Para conferir o protocolo OTP com **módulos reais do backend**, em checkout de teste atualizado com dependências instaladas (`npm ci`):

```powershell
$env:OMNIPDV_BACKEND_REPO = 'C:\caminho\LandingPage_OmniPVD'
node --test tests/backend-email-otp.contract.mjs tests/backend.contract.mjs
```

O contrato OTP importa a fixture isolada do backend atual e usa Stripe/Resend simulados, SQLite temporário e código capturado apenas pelo transporte fake. Testa comprador sem passkey, cookie/browser, consentimento, PKCE, licença, cancelamento/revogação e alternativa passkey com OTP desabilitado. Não utiliza sua conta/caixa postal nem a VPS. As suítes anteriores cobrem refresh expirado/revogado, persistência segura, migração sem perda de dados e falhas/offline.
