# Licenciamento do OmniPDV desktop

Implementação baseada no protocolo de `LucasL-Dev/LandingPage_OmniPVD`, branch `feat/subscription-licensing`, revisão `944051a65df5c2bd29cdbe652e213d016757fb8c`. O desktop usa os endpoints reais do backend; não acessa Stripe ou Resend diretamente. A autenticação de assinatura é separada do login local dos funcionários.

## Testar no Windows com sua passkey existente

### 1. Iniciar o backend existente

No PowerShell, abra o diretório onde você **já configurou e testou** o backend. Confira a branch `feat/subscription-licensing`. Use Node.js 24 e preserve o `.env`, o banco, a chave privada e os vínculos da conta existentes.

```powershell
cd C:\caminho\LandingPage_OmniPVD
git branch --show-current
npm ci
npm run dev
```

O backend carrega seu `.env`. Confirme que sua configuração existente usa:

```text
AUTH_ENABLED=true
AUTH_ORIGIN=http://localhost:3000
AUTH_RP_ID=localhost
AUTH_ALLOW_LOCALHOST=true
DOMAIN=http://localhost:3000
```

Mantenha os valores privados atuais de `BILLING_DB_PATH`, `LICENSE_PRIVATE_KEY_PATH`, `LICENSE_SIGNING_KEY_ID` e Stripe somente no backend. **Não gere outra chave, não recrie a conta, não refaça o convite e não reinicialize o banco.** Se sua passkey foi criada em `localhost`, continue com `localhost`; trocar por `127.0.0.1` muda a origem/RP da passkey.

Abra `http://localhost:3000/account/login` no navegador padrão e confirme que sua passkey existente funciona. Login sozinho não concede licença: a conta precisa continuar vinculada à compra de teste com assinatura e faturas válidas. O backend dessa revisão aceita recursos Stripe de teste.

### 2. Preparar o desktop pela branch do PR

Em outro PowerShell:

```powershell
cd C:\caminho\PDV_Sistem
git fetch origin
git switch feat/desktop-subscription-license
npx --yes pnpm@9.15.0 install --frozen-lockfile
npx --yes pnpm@9.15.0 build
$env:OMNIPDV_LICENSE_ORIGIN = 'http://localhost:3000'
npx --yes pnpm@9.15.0 start
```

Se o binário do Electron estiver ausente após a instalação, execute `node node_modules/electron/install.js` e tente iniciar novamente. Não é necessário gerar ou substituir o instalador existente.

Por padrão, o aplicativo de desenvolvimento usa a mesma pasta histórica `%APPDATA%\pdv-sistem` e preserva o banco. Se preferir testar com uma cópia isolada, feche o PDV, crie um backup consistente pela versão atual e escolha outra pasta **antes de iniciar**:

```powershell
$env:PDV_DATA_DIR = Join-Path $env:LOCALAPPDATA 'OmniPDV-Teste-Licenciamento'
```

Copie o backup SQLite para essa pasta com nome `pdv.sqlite` se quiser testar os dados existentes. A pasta fiscal pode ser copiada separadamente para consultas. Não copie um banco aberto ignorando arquivos WAL. Usar uma pasta vazia cria um ambiente de teste novo, sem tocar no banco original. `PDV_DATA_DIR` é aceito somente no aplicativo não empacotado.

### 3. Autorizar o aplicativo

1. Na tela de ativação, clique em **Entrar na minha conta**.
2. O navegador padrão abre a página do OmniPDV. Entre com sua passkey já cadastrada (Windows Hello, PIN ou autenticador utilizado anteriormente).
3. Confirme a conexão do dispositivo na página. Estar autenticado no navegador não dispensa o consentimento.
4. Após o callback local, volte ao aplicativo. A sessão fica protegida por DPAPI; tokens não são enviados ao React.
5. Com assinatura autorizada, a tela comercial é liberada. Entre também com seu usuário local do caixa, como antes.
6. Se aparecer assinatura inativa, confira o vínculo e a assinatura no backend. Não é solicitado cadastrar dados Stripe no desktop.

O firewall deve permitir o callback apenas na interface loopback `127.0.0.1`, com porta efêmera. Não exponha esse listener na rede. Cancelar a entrada fecha o listener; o prazo padrão é de três minutos.

### 4. Conferir reinício, offline e recuperação

- Feche e reabra o desktop: ele restaura a sessão protegida e renova o token de acesso.
- Depois de uma autorização válida, pare temporariamente o backend. A licença assinada anterior continua somente até sua expiração original (no máximo quatro horas, conforme backend). O banner indica o modo offline e o prazo.
- Sem autorização offline válida, a indisponibilidade bloqueia operações sem afirmar que a assinatura foi cancelada.
- Se a resposta de uma renovação de refresh token se perder, o aplicativo pede nova entrada e não reutiliza o token incerto. Esse caso exige interação novamente mesmo que a falha tenha sido de rede.
- Para testar assinatura cancelada/revogação, use uma conta/assinatura de teste e os procedimentos administrativos já existentes do backend. Não altere os dados de produção nem apague tabelas. Ao receber uma negativa explícita, o aplicativo descarta a autorização offline anterior.
- Sem licença, clique em **Consultar e recuperar meus dados**, entre como usuário local e acesse histórico/recibos. Gerente/Admin mantém acesso a **Relatórios → Exportar Excel** e **Salvar backup do banco**. Alterações comerciais, emissões e processamento de Pix são bloqueados no processo principal.
- Ao selecionar **Desconectar assinatura**, o desktop tenta revogar a sessão remota e remove a sessão local. Se estiver offline ou sem access token válido, a mensagem orienta revogar também pelo navegador.

## Dados locais e segurança

O arquivo novo é `%APPDATA%\pdv-sistem\licensing\session.bin`. Contém a sessão de licenciamento criptografada com `safeStorage`/DPAPI no Windows, incluindo refresh token rotativo, licença assinada, chaves públicas e referências de tempo. O access token fica somente em memória. Não há fallback para texto puro. A sessão protegida não deve ser copiada como forma de ativação em outro usuário/computador.

O banco comercial `pdv.sqlite`, suas tabelas/registros e a pasta fiscal não recebem migração do licenciamento. A única alteração no Store é a chamada de política antes das ações; as regras comerciais permanecem as mesmas. A proteção de licença soma-se às permissões locais existentes.

Referências de tempo são persistidas protegidas, e o processo também compara o relógio monotônico. Relógio regressivo bloqueia a utilização offline e exige reconexão. Corrija o relógio do Windows e entre novamente se necessário. Isso não impede cracking do executável ou adulteração do sistema operacional.

O Pix pendente é preservado ao bloquear licença. A consulta automática e a finalização comercial ficam suspensas até nova autorização. Isso não cancela uma cobrança já criada no banco: faça a reconciliação antes de repetir qualquer pagamento. Uma operação externa iniciada enquanto a licença era válida pode terminar no provedor; a integração não promete desfazer efeitos externos em andamento.

## Produção HTTPS: configuração separada

`electron/licensing/production.json` contém a origem pública `https://api.omnipdv.com.br` na branch `feat/windows-online-license`. A ausência de origem bloqueia o comercial; **não existe localhost padrão no instalador**. A variável `OMNIPDV_LICENSE_ORIGIN` funciona somente em desenvolvimento e é ignorada pelo aplicativo empacotado.

A landing comercial `https://omnipdv.com.br` é separada da API. O JWKS é buscado exclusivamente em `/.well-known/omnipvd-license-keys.json` da origem HTTPS da API, sem redirecionamentos. Consulte [BUILD-WINDOWS-ONLINE.md](BUILD-WINDOWS-ONLINE.md) para os comandos exatos do instalador e a compatibilidade com `feat/production-integration`.

Somente origem e chaves **públicas** pertencem ao cliente. Nunca incluir chave Ed25519 privada, chave Stripe, Resend, tokens reais ou certificado fiscal na configuração do desktop. Nenhum instalador ou release é gerado por esta branch/CI de testes.

## Validação automatizada

```powershell
npx --yes pnpm@9.15.0 test
npx --yes pnpm@9.15.0 build
```

Os testes cobrem os 12 cenários solicitados, PKCE e callbacks inválidos, autorização Ed25519, refresh concorrente/interrompido, regressão do relógio, IPC/política, criptografia por adaptador e reabertura de um banco temporário existente sem alteração dos registros. As chaves, contas e bancos usados nos testes são sintéticos.

Teste adicional de contrato com o **código real do backend**, usando banco temporário e sem alterar o `.env` ou os bancos existentes:

```powershell
$env:OMNIPDV_BACKEND_REPO = 'C:\caminho\LandingPage_OmniPVD'
node --test tests/backend.contract.mjs
```

Instale antes as dependências desse backend com `npm ci`. Esse teste importa os módulos da branch indicada, verifica passkey sintética criptográfica, consentimento HTTP, callback/PKCE, token, licença, reinício, cancelamento e revogação. Stripe é simulado; não gera cobranças ou e-mails.

A CI `Testes do licenciamento desktop` executa testes, build e duas verificações de interface no Windows: bloqueada/recuperação e comercial com licença sintética válida, usando DPAPI real na segunda. Não empacota nem publica o aplicativo. O teste interativo com sua passkey pessoal deve ser feito pelos passos acima; os testes automatizados não usam nem exportam sua credencial.
