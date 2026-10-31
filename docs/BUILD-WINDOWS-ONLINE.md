# Instalador Windows — licença na API pública

Branch do desktop: `feat/windows-online-license`, baseada em `feat/desktop-subscription-license` (`d3b1423`). Backend revisado: `feat/production-integration`, commit `c586c128a3dd4bfd19df0c4983b4120a7fca5890`.

## Origens e compatibilidade

O arquivo `electron/licensing/production.json` aponta para **`https://api.omnipdv.com.br`**. A landing comercial é `https://omnipdv.com.br`; ela não recebe tokens, não fornece o JWKS e não autentica o desktop. O issuer é a origem da API; audience/client ID continuam `omnipvd-desktop` e produto `omnipvd`, conforme o protocolo existente.

| Uso | Rota na API |
| --- | --- |
| Autorização com PKCE S256 / consentimento | `GET /api/auth/authorize` |
| Página de passkey, cookies e consentimento | `GET /account/login` |
| Passkeys no navegador | `/api/auth/passkeys/login/options` e `/verify` |
| Troca de código / refresh rotativo | `POST /api/auth/token` |
| Decisão da licença | `GET /api/license/status` |
| Chaves públicas Ed25519 | `GET /.well-known/omnipvd-license-keys.json` |
| Revogação da sessão atual | `POST /api/auth/logout` |

O aplicativo empacotado ignora `OMNIPDV_LICENSE_ORIGIN`, inclusive se configurada como localhost. HTTP e hosts loopback são rejeitados para a API de produção. **O callback `http://127.0.0.1:PORTA/omnipvd/callback` continua necessário pelo protocolo**, limitado à interface local e a uma porta efêmera. Ele não é um backend local e não hospeda o PDV. Não substitua esse callback por uma URL pública.

O JWKS é buscado somente da API configurada, sem redirecionamentos e sem URLs/chaves escolhidas pelo token. A licença offline verifica Ed25519, tipo, issuer, audience, conta, sessão, instalação e validade. Nenhuma chave Ed25519 privada, Stripe ou Resend é incluída no aplicativo. O empacotamento também exclui diretórios de testes/fixtures das dependências fiscais e certificados/bancos privados, incluindo o certificado PFX sintético de teste do fornecedor. Os certificados fiscais do cliente continuam na pasta de dados externa ao programa.

## Gerar NSIS x64 no Windows

Use Windows 10/11 x64, Node.js **24** e Git. Feche qualquer PDV aberto antes dos testes manuais. Não é necessário copiar nenhum `.env` do backend para o desktop.

No PowerShell:

```powershell
git clone --branch feat/windows-online-license https://github.com/LucasL-Dev/PDV_Sistem.git
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

O instalador é gerado **somente no computador/runner que executou os comandos**:

```text
release\OmniPDV-Setup-2.1.0-x64.exe
```

O executável desempacotado fica em `release\win-unpacked\OmniPDV.exe`. A versão permanece 2.1.0 nesta branch de preparação; não há nova release ou alteração no instalador já distribuído. Diferencie os builds pelo commit e SHA-256. Não publique esse arquivo sem revisão e homologação.

Não use `--publish always`, não crie tags e não envie o `.exe` ao Git. O workflow de testes desta branch gera NSIS para validação e o descarta ao finalizar: **não faz upload do instalador ou publicação de release**. O workflow legado de distribuição não é acionado pelo push nesta branch.

### Assinatura do instalador

A assinatura Azure Artifact Signing já suportada continua opcional e requer sua configuração de identidade/publicador. Consulte [ASSINATURA-WINDOWS.md](ASSINATURA-WINDOWS.md). Não use o A1 fiscal para assinar o programa. Sem configuração de assinatura, o build de validação é sem assinatura e pode receber aviso do SmartScreen. Não desative proteções do Windows para encobrir esse aviso. Esta entrega não configura nem usa credenciais Azure automaticamente.

## Verificar API e login real

Diagnóstico de leitura, sem enviar sessão ou executar cobrança:

```powershell
node scripts/check-public-license-api.mjs
```

Confere a obtenção do JWKS Ed25519 público por HTTPS, página de conta e HTTP 401 para consulta de licença sem autenticação. Não valida assinatura de um usuário e não substitui o teste interativo. No ambiente automatizado de implementação, o acesso direto ao domínio foi bloqueado com HTTP 403 pelo proxy; por isso a disponibilidade pública não foi afirmada a partir desse ambiente.

Para homologação interativa:

1. Execute o instalador gerado, ou `release\win-unpacked\OmniPDV.exe`.
2. Clique em **Entrar na minha conta**. O navegador deve abrir em `https://api.omnipdv.com.br`, não no domínio da landing nem em localhost.
3. Autentique-se com uma passkey cadastrada **nesse domínio da API** e autorize o dispositivo. Passkeys criadas para localhost não migram automaticamente para outro RP ID.
4. Volte ao OmniPDV. Uma conta vinculada à assinatura de teste ativa é liberada pelo backend; assinatura inativa permanece bloqueada com acesso à recuperação.
5. Entre também com seu funcionário local, como antes. Feche e abra novamente para testar restauração da sessão e refresh protegido.
6. Depois de validação online, teste indisponibilidade temporária com a autorização offline ainda válida e confira o prazo. Não altere o relógio nem desative a política para contornar testes.

Não modifique chave privada ou configurações da VPS para realizar esses passos. O backend dessa revisão continua de teste para Stripe; o desktop não ativa pagamentos reais.

## Dados locais e DPAPI

O namespace continua **`%APPDATA%\pdv-sistem`**, com `pdv.sqlite` e pasta `fiscal` existentes. O appId `br.com.pdvsistem` e a opção de preservar dados na desinstalação permanecem iguais. Não há migração de banco comercial ou alteração nas regras fiscais nesta branch. Faça o backup usual antes de atualizar; não copie bancos abertos ignorando WAL.

A sessão fica em `licensing\session.bin`, protegida por `safeStorage`/DPAPI do Windows, usando a API síncrona estável para persistência entre processos. A leitura tenta também o formato assíncrono anterior para preservar sessões legadas que ainda possam ser descriptografadas. O access token permanece em memória; o refresh token rotativo não vai para React, logs ou SQLite. Não há fallback para texto puro. O arquivo é substituído atomicamente, e uma renovação incerta exige nova entrada sem repetir o token consumido.

Uma sessão anterior de desenvolvimento vinculada a localhost não vale como sessão da API pública. Se aparecer mensagem de origem alterada, use **Cancelar entrada / sair da assinatura** e entre pela API. Isso remove somente a sessão de licenciamento local; preserva vendas, estoque e dados fiscais. A revogação da sessão antiga de localhost, se necessária, é feita na conta do ambiente antigo.

## Testes e inspeção do pacote

A suíte inclui configuração empacotada, bloqueio de HTTP/loopback/overrides, endereço do navegador, callback S256, URLs de licença/JWKS, proteção de dados e todos os testes anteriores.

Teste de contrato com o código real do backend, sem modificar VPS, banco ou conta existentes:

```powershell
$env:OMNIPDV_BACKEND_REPO = 'C:\caminho\LandingPage_OmniPVD'
node --test tests/backend.contract.mjs
```

Esse checkout deve estar na branch `feat/production-integration`, com dependências instaladas via `npm ci`. O teste usa DB temporário, passkey criptográfica sintética e Stripe simulado; não usa sua passkey pessoal nem credenciais reais.

A CI Windows executa testes, build React, fluxo comercial com licença sintética válida, DPAPI real (incluindo leitura após reinício de processo), NSIS x64 e inspeção do ASAR. Confere também o ícone e a rejeição de operações no executável empacotado sem licença, mesmo com variável apontando para localhost. Nenhuma verificação de licença é desativada para passar os testes.

`verify-production-package.mjs` confirma a origem real dentro do ASAR, exclui fixtures/arquivos privados e procura padrões comuns de credenciais no código do aplicativo. Essa inspeção soma-se à lista explícita de arquivos do electron-builder; não é promessa de detectar todo tipo possível de segredo. Segredos do backend nunca devem ser fornecidos ao build.
