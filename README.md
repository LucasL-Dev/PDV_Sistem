# OmniPDV

Aplicativo desktop Electron + React, com banco SQLite local e emissor NFC-e embutido do [Sull-s/fiscal](https://github.com/Sull-s/fiscal).

![Símbolo OmniPDV](assets/brand/icon-256.png)

## Instalar no Windows — sem comandos

Use Windows 10 ou 11 de 64 bits (x64). **Quem instala o aplicativo não precisa de Node.js, Git ou pnpm.**

1. Abra [Instalador Windows no GitHub Actions](https://github.com/LucasL-Dev/PDV_Sistem/actions/workflows/windows.yml) e entre na sua conta do GitHub.
2. Abra a execução mais recente com **✓ verde**. Ao fim da página, em **Artifacts**, baixe **Instalador-Windows**. Se a execução estiver em andamento, aguarde a conclusão; um build com falha não disponibiliza o instalador.
3. Clique com o botão direito no ZIP baixado e selecione **Extrair tudo**.
4. Abra `OmniPDV-Setup-2.1.0-x64.exe` e aguarde a instalação. Ela é feita para o seu usuário, sem escolher pastas ou executar comandos.
5. O aplicativo abre ao terminar. Nas próximas vezes, use o atalho **OmniPDV** na Área de Trabalho ou no menu Iniciar.
6. No primeiro acesso, crie o administrador. Cadastre seus produtos e clique em **Abrir caixa** para começar.

Quando houver uma versão publicada em [Releases](https://github.com/LucasL-Dev/PDV_Sistem/releases), você também poderá baixar o `.exe` diretamente por lá, sem o ZIP dos artefatos. O workflow publica Releases quando uma tag `v*` é enviada; um push em `main` gera o artefato de teste. Os artefatos ficam disponíveis por 90 dias. Se não houver execução, o responsável pelo repositório pode abrir **Actions → Instalador Windows → Run workflow**.

A geração suporta assinatura digital com Azure Artifact Signing. Até configurar a conta e ativar a assinatura no GitHub, os builds de teste continuam sem assinatura e o Windows pode mostrar um aviso de editor desconhecido. Veja o [tutorial de assinatura para Windows](docs/ASSINATURA-WINDOWS.md). Não desative as proteções do sistema. O arquivo `.sha256` acompanha o `.exe` para conferência de integridade. Os testes do workflow conferem o aplicativo em Windows, mas impressão, hardware do caixa e emissão real precisam ser validados na loja.

### Dados do cliente opcionais

Nome, CPF/CNPJ e telefone são opcionais no cadastro. Sem nome, o sistema gera “Cliente não identificado” com um identificador. Também é possível concluir vendas sem selecionar cliente. Fiado e crédito da loja exigem selecionar um cadastro para vincular o saldo, mas seus dados pessoais continuam opcionais. Exigências específicas da legislação fiscal ou do provedor de pagamento ainda podem se aplicar na emissão/cobrança.

### Exportar dados para Excel

Entre como **Gerente ou Admin**, abra **Relatórios → Exportar Excel (.xlsx)**, escolha a pasta e salve. Abra o arquivo no Excel ou LibreOffice Calc.

A planilha contém abas de produtos, clientes, funcionários, vendas, itens, pagamentos, caixas, conferência por forma de pagamento, movimentos, devoluções, contas a receber, recebimentos, créditos da loja, cancelamentos e auditoria resumida. A exportação inclui todo o histórico disponível (não apenas a data do relatório), com registros excluídos marcados por status. Os valores são células numéricas em reais, códigos de barras preservam zeros à esquerda e quantidades mantêm até três casas decimais. Datas usam o formato ISO registrado pelo sistema.

Senhas, credenciais Pix, certificados e detalhes internos da auditoria não entram na planilha. Ela contém dados pessoais/comerciais: compartilhe apenas com pessoas autorizadas. **Excel não substitui o backup SQLite nem os XMLs fiscais** e não há importação dessa planilha.

### Atualizar sem reinstalar ferramentas

Feche o PDV, faça backup e execute o instalador da nova versão. Ele reutiliza a instalação do usuário; o banco local e os dados fiscais ficam separados dos arquivos do aplicativo. A desinstalação não apaga os dados da loja. A versão 1.2.0 passa a se chamar OmniPDV; o identificador de instalação e o diretório legado `pdv-sistem` são preservados para manter vendas, cadastros, certificados e XMLs existentes. Não há atualizador automático nesta versão.

### Interface simplificada

- **Frente de caixa:** catálogo compacto e carrinho. Clique em **Ir para pagamento** para informar o recebimento e concluir, sem misturar as duas etapas.
- **Cliente e desconto:** expanda essa seção somente quando precisar.
- **Gerenciar caixa:** abre sangria, suprimento e fechamento em uma janela separada.
- **Cadastros:** os formulários ficam recolhidos; clique em Novo produto, Novo cliente ou Adicionar funcionário. Editar um registro abre o formulário automaticamente.
- **Dados fiscais:** ficam em uma seção própria dentro do cadastro do produto. Vendas, devoluções, clientes, relatórios, equipe e documentos fiscais continuam no menu lateral.

<details>
<summary><strong>Sou desenvolvedor: executar pelo código e gerar instaladores</strong></summary>

### Executar a partir do código no Windows

Este tutorial abre o aplicativo a partir do código publicado neste repositório. **Não é necessário baixar o ZIP de Windows mostrado anteriormente na conversa**: ele não está publicado no GitHub. A pasta `release/` é gerada localmente e não faz parte do código versionado.

### 1. Instale as ferramentas

Use **Windows 10 ou 11 de 64 bits (x64)**, com acesso à internet para baixar as dependências.

1. Baixe e instale o **Node.js 24 LTS para Windows x64** em [nodejs.org](https://nodejs.org/). Mantenha a opção de adicionar ao `PATH`.
2. Baixe e instale o **Git para Windows** em [git-scm.com](https://git-scm.com/downloads/win). Na instalação, permita o uso do Git pela linha de comando.
3. Feche terminais que já estavam abertos. Abra o menu Iniciar, digite **cmd** e abra o **Prompt de Comando**. Os comandos abaixo foram escritos para esse terminal.
4. Confira a instalação:

```bat
node --version
npm --version
git --version
```

O Node deve mostrar `v24.x.x` ou uma versão posterior compatível. Se aparecer “não é reconhecido como um comando”, reabra o terminal; se persistir, revise a instalação e o `PATH` antes de continuar.

### 2. Baixe o projeto

No Prompt de Comando, execute uma linha de cada vez:

```bat
cd /d "%USERPROFILE%\Documents"
git clone https://github.com/LucasL-Dev/PDV_Sistem.git
cd PDV_Sistem
```

Se preferir outra pasta, substitua a primeira linha pelo caminho desejado. Se o repositório for privado, autentique-se no GitHub quando o Git solicitar; nunca coloque tokens ou senhas dentro do código.

**Alternativa sem Git:** na página do repositório, clique em **Code → Download ZIP**, extraia tudo e abra o Prompt de Comando na pasta extraída, normalmente `PDV_Sistem-main`. Essa alternativa dispensa a instalação do Git, mas exige baixar outro ZIP para receber atualizações.

Antes de continuar, confira se está na pasta correta:

```bat
dir package.json
```

O comando deve encontrar o arquivo `package.json`. Todos os próximos comandos devem ser executados nessa mesma pasta.

### 3. Instale as dependências

```bat
npx --yes pnpm@9.15.0 install --frozen-lockfile
```

Aguarde o comando terminar e o terminal voltar a aceitar comandos. A primeira instalação pode demorar alguns minutos. O `npx` obtém a versão do pnpm usada pelo projeto; não é necessário instalar pnpm globalmente.

Use **pnpm**, pois o projeto contém pacotes locais em workspace. Não substitua esse comando por `npm install`.

### 4. Baixe o Electron

```bat
node --use-env-proxy node_modules/electron/install.js
```

O Electron 45 exige essa instalação explícita do executável. Aguarde o término. O comando pode finalizar sem exibir uma mensagem de sucesso.

### 5. Compile o aplicativo

```bat
npx --yes pnpm@9.15.0 build
```

Esse comando compila a biblioteca fiscal e a interface. Ao terminar com sucesso, a pasta `dist` estará disponível. Se houver erro, resolva-o antes de tentar abrir o aplicativo.

### 6. Abra o OmniPDV

```bat
npx --yes pnpm@9.15.0 start
```

Uma janela do **OmniPDV** deverá abrir. Mantenha o terminal aberto enquanto usa o aplicativo.

Depois de concluir a primeira instalação, para abrir novamente basta entrar na pasta do projeto e executar o comando `start`. Não é necessário reinstalar nem compilar a cada abertura se o código não mudou.

### 7. Configure o primeiro acesso e faça uma venda

1. Na tela inicial, crie o **administrador**, com nome, login e senha de pelo menos oito caracteres. Não existe usuário ou senha padrão.
2. Abra **Produtos e estoque** e cadastre nome, código de barras/SKU, categoria, preço e estoque inicial.
3. Se desejar, cadastre os clientes em **Clientes** e os operadores em **Funcionários**.
4. Entre em **Frente de caixa**, informe o fundo inicial e clique em **Abrir caixa**.
5. Selecione os produtos e clique em **Ir para pagamento**. Informe o recebimento e clique em **Concluir venda**.
6. Em **Vendas e devoluções**, consulte a venda e imprima o recibo. O recibo interno é **não fiscal**.
7. No fechamento, informe o dinheiro contado e clique em **Fechar caixa**, usando o administrador.

O leitor de código de barras pode funcionar como teclado: selecione a busca de produtos, leia o código e envie Enter.

**Uma venda fica gravada de verdade e altera o estoque.** Se estiver apenas avaliando, use produtos de teste e registre a devolução para desfazer seus efeitos. Pix e cartão são registrados manualmente: confirme o recebimento fora do aplicativo antes de concluir a venda.

Para NFC-e, siga a seção [Configuração fiscal](#configuração-fiscal). O cadastro do A1 é feito dentro do aplicativo, com proteção do Windows; nunca coloque certificado, senha ou CSC no repositório. Emissão real ainda depende da configuração da empresa e de validação em homologação.

### 8. Gere um instalador `.exe` no Windows — opcional

Para usar o PDV, o comando `start` já é suficiente. Se quiser gerar um instalador local, depois do build execute:

```bat
npx --yes pnpm@9.15.0 exec electron-builder --win nsis --x64 --config.win.signExecutable=false
```

Esse comando cria uma versão de desenvolvimento **sem assinatura digital**, com os recursos do executável (nome e ícone) personalizados e sem configurar certificado de assinatura de código. O certificado de assinatura do instalador é diferente do A1 usado para notas fiscais.

Ao finalizar, procure:

```text
release\OmniPDV-Setup-2.1.0-x64.exe
```

Abra esse arquivo para instalar no Windows e use o atalho criado pelo instalador. O computador que apenas executa o aplicativo instalado não precisa de Node.js nem Git. Para distribuir oficialmente, configure assinatura de código e teste o instalador em Windows; a opção `signExecutable=false` permite personalizar nome e ícone, mas não substitui a assinatura digital.

### 9. Atualize o código posteriormente

Se baixou usando Git e não modificou os arquivos do projeto, feche o aplicativo e execute na pasta do projeto:

```bat
git pull --ff-only origin main
npx --yes pnpm@9.15.0 install --frozen-lockfile
node --use-env-proxy node_modules/electron/install.js
npx --yes pnpm@9.15.0 build
npx --yes pnpm@9.15.0 start
```

Se o Git informar alterações locais ou conflito, preserve seu trabalho antes de atualizar. Não use comandos de reset para apagar alterações. Se você usa o aplicativo instalado, gere e instale a nova versão depois de atualizar e compilar o código. Faça backup do banco e dos dados fiscais antes de atualizar; veja [Dados e backup](#dados-e-backup).

### Problemas comuns no Windows

| Mensagem ou sintoma | O que conferir |
| --- | --- |
| `node`, `npm`, `npx` ou `git` não reconhecido | Reabra o terminal e confira se as ferramentas estão instaladas e no `PATH`. |
| PowerShell bloqueia `npx.ps1` | Use o **Prompt de Comando (cmd)** deste tutorial ou `npx.cmd` no lugar de `npx` no PowerShell. Não é necessário mudar a política de execução do Windows. |
| Arquivo `package.json` não encontrado | Entre na pasta que contém `package.json`, `pnpm-workspace.yaml` e `src`. |
| `Unsupported URL Type: workspace:` | Você provavelmente usou npm para instalar. Utilize o comando de instalação com pnpm da etapa 3. |
| Electron não instalado ou `path.txt` ausente | Execute novamente a etapa 4 e confira se o download terminou sem erro. |
| Janela não abre por ausência de `dist/index.html` | Execute o build da etapa 5 antes do `start`. Não abra `index.html` diretamente pelo navegador. |
| Falha de download ou de certificado TLS | Confira internet, proxy e certificados da rede corporativa. Não desative a verificação TLS nem o antivírus para contornar o erro. |
| Arquivo de instalador não aparece | Confira se o comando de empacotamento terminou sem erro. Gerar o instalador no Linux pode exigir Wine; este tutorial utiliza Windows. |
| Emissão fiscal bloqueada | Configure os dados da empresa, A1, CSC e códigos fiscais com o contador; teste em homologação. |

Os testes do caixa, o build e o fluxo Electron foram validados em Linux. O workflow Windows executa testes da interface e do aplicativo empacotado antes de disponibilizar o instalador; só considere uma execução validada quando ela estiver verde. A instalação interativa e o uso com o hardware da loja ainda precisam ser conferidos. Ao relatar um problema, informe a versão do Windows, o comando executado e a mensagem de erro, sem enviar senhas, certificados ou dados de clientes.

## Executar no Linux

Requer Node.js 24 ou superior. O emissor fiscal exige um cofre de senhas do sistema (Secret Service/KWallet); armazenamento `basic_text` é recusado.

```sh
npx --yes pnpm@9.15.0 install --frozen-lockfile
node --use-env-proxy node_modules/electron/install.js
npx --yes pnpm@9.15.0 build
npx --yes pnpm@9.15.0 start
```

</details>

## Novidades da versão 2.0.0

- Tema claro, escuro ou do sistema, disponível também no login e lembrado neste computador.
- Atalhos F1/F2/F3/F4/F6/F12/Esc, foco contínuo no leitor, consulta rápida e valores de cédulas.
- Fechamento cego, divergências por forma de pagamento e resumos gerenciais X/Z.
- Medidas fracionadas, estoque bloqueante ou com alerta, caderneta e crédito de troca.
- Perfis Supervisor/Gerente, autorização por senha para descontos elevados e cancelamentos.
- Mercado Pago com QR Code, reserva de estoque, conferência de pagamento e recuperação de cobranças.
- Driver de bobina 58/80 mm e ESC/POS TCP com comando de corte.

Veja o [manual das novas operações](docs/OPERACAO-2.md) para configurar Pix, impressora, unidades, permissões e fechamento. Faça backup antes de atualizar. **Pix real e equipamentos físicos ainda exigem homologação na loja.**

## Funcionalidades

- Produtos: preço, SKU/código de barras único, categoria, unidades UN/KG/M/L/CX/FD, quantidades com até três casas decimais e campos NCM/CFOP/CSOSN.
- Caixa: abertura, fundo, sangria, suprimento, fechamento com dinheiro contado, esperado e diferença.
- Vendas: carrinho, desconto, cliente, dinheiro, Pix, crédito, débito e outros; múltiplos pagamentos e troco somente em dinheiro.
- Estoque baixado atomicamente com a venda; repetição do mesmo identificador não duplica vendas.
- Clientes e histórico de compras; recibo não fiscal imprimível em diálogo do sistema.
- Vendas e devoluções totais/parciais, rateio de desconto e recomposição de estoque; reembolso registrado no caixa em que ocorreu.
- Perfis Operador, Supervisor, Gerente e Admin; senhas com scrypt e salt, autorização de ações sensíveis no processo principal e auditoria.
- Relatórios por dia, receita, reembolsos, recebimentos, produtos vendidos e fechamentos.
- Backup consistente do SQLite por diálogo de arquivo.
- Configuração de empresa/A1, NFC-e vinculada à venda, consulta, documentos fiscais, cancelamento, relatórios e XMLs pelo emissor embutido.

Cartão/TEF e recebimentos da caderneta são registros manuais. Nas vendas, Pix pode operar manualmente ou por QR Code dinâmico do Mercado Pago com confirmação automática; ative explicitamente em Configurações. O aplicativo não executa reembolsos bancários nem integra maquininha TEF.

## Configuração fiscal

Acesse **Documentos fiscais → Configurar empresa e A1**. Configure inicialmente o ambiente **Homologação**, dados reais da empresa, certificado A1 e senha, CSC/identificador e séries conforme sua UF. Os códigos tributários vêm do contador; não há códigos fictícios preenchidos nos produtos. A configuração usa a tela oficial da biblioteca; a senha e o certificado ficam cifrados pelo emissor com chave protegida pelo sistema operacional, fora do repositório.

Após concluir uma venda, abra **Vendas e devoluções → Emitir / recuperar NFC-e**. O payload é criado no processo principal a partir do registro da venda, com `Idempotency-Key: pdv-<id>`. As situações autorizada, offline, pendente, rejeitada e denegada são exibidas. Consultas posteriores recuperam a situação pela chave; contingências são geridas pelo agente. O agente é reiniciado automaticamente se já existir uma chave protegida na pasta fiscal.

O recibo interno é identificado como **não fiscal**. DANFE/XML ficam disponíveis na tela oficial de documentos fiscais. Para cancelamento integrado, use **Cancelar NFC-e na SEFAZ** dentro da venda: somente após confirmação do emissor fica disponível a devolução integral para recomposição de estoque e registro do reembolso. Cancelamento realizado diretamente na listagem fiscal deve ser sincronizado pelo botão **Emitir / recuperar NFC-e** na venda. Devolução fiscal parcial requer uma NF-e de devolução orientada pelo contador e não é automatizada. A configuração/listagem aceita NF-e 55, mas o fluxo automático de vendas desta versão emite **NFC-e 65, com CSOSN**; não há formulário completo de NF-e/NFS-e nem tributação CST para regime normal.

Antes de produção, valide no computador da loja: emissão autorizada em homologação, Pix/dinheiro, cancelamento, impressão e contingência. Nenhuma emissão real foi efetuada no ambiente de desenvolvimento por ausência de certificado e credenciais da loja. Não ative produção antes dessa validação. Se uma emissão fica sem resposta, preserve a venda e consulte/reutilize seu identificador; não cadastre outra venda para repetir a nota.

## Dados e backup

Os dados ficam em `app.getPath('userData')`: `pdv.sqlite` e pasta `fiscal/` (XMLs, numeração e cofre). O backup da tela Relatórios cobre somente o SQLite do PDV. Faça também backup da pasta fiscal e retenha os XMLs por pelo menos cinco anos; não exclua nem recrie a numeração para resolver erros. Restaurar a chave cifrada em outro usuário/computador exige reconfiguração segura do A1. Para restaurar o banco, feche o aplicativo e preserve os arquivos atuais antes de substituir o SQLite pelo backup. Não copie um banco em uso manualmente sem WAL; prefira o botão de backup.

## Testar e empacotar

```sh
npx --yes pnpm@9.15.0 test
npx --yes pnpm@9.15.0 build
npx --yes pnpm@9.15.0 exec electron-builder --linux AppImage
# No Windows:
npx --yes pnpm@9.15.0 exec electron-builder --win nsis
```

O instalador Windows deve ser gerado e testado em Windows, com assinatura de código configurada para distribuição. `release/` contém os artefatos locais e não é versionado. `asarUnpack` preserva os arquivos necessários do PGlite/PDFKit.

O smoke test Electron usa uma pasta vazia exclusiva:

```sh
PDV_SMOKE=/tmp/pdv-smoke-novo npx --yes pnpm@9.15.0 exec electron --ozone-platform=headless --disable-gpu .
```

Dentro de contêineres sem sandbox Linux disponível, a conferência automatizada pode exigir `--no-sandbox`; não use essa opção na instalação desktop. O teste cria apenas dados fictícios na pasta indicada, faz login, registra venda pela interface e verifica troco e estoque. A imagem de conferência é salva em `/tmp/omnipdv.png`. O cofre fiscal indisponível no contêiner é comunicado na tela; isso não é validação de emissão real.

## Dependência fiscal

`vendor/fiscal` preserva o código consultado no commit `d890afa5f52b3648bc88bd3d62634268b16cbd24` do repositório indicado, para builds sem token de registro privado. A cópia é compilada como workspace pnpm, com lockfile da aplicação. Origem e restrições de redistribuição estão em [THIRD_PARTY.md](THIRD_PARTY.md). Não atualize os pacotes fiscais sem revisar mudanças e repetir a homologação.

## Limites atuais

Aplicativo de uma loja/um computador, sem sincronização multi-terminal ou driver universal de balança de rede. A balança pode informar o peso por teclado/F12; o protocolo de rede depende do modelo. O banco guarda o estado em um documento transacional SQLite: adequado para a primeira versão local; grandes históricos precisam de migração para tabelas normalizadas e paginação. Não há conta de demonstração ou produtos fictícios na instalação real.

## Exclusões e mensagens de erro (1.3.0)

As mensagens mostram apenas o erro de negócio, como “Usuário ou senha incorretos.”.

Administradores podem excluir produtos e funcionários pelo botão **Excluir** de cada cadastro. Não é possível excluir o próprio usuário. O produto sai do catálogo e o funcionário perde o acesso; ambos continuam identificáveis no histórico.

Em **Vendas e devoluções**, selecione uma venda e use **Excluir venda**, ou **Excluir vendas do dia** para o dia atual. Confirme na janela que aparece. Os itens ainda não devolvidos voltam ao estoque, e os totais do caixa e relatórios são recalculados. Vendas de caixa já fechado e documentos fiscais ainda não regularizados bloqueiam a exclusão; o lote inteiro é validado antes de qualquer alteração. Cancelamentos/rejeições fiscais não apagam XMLs. Nenhuma dessas opções estorna Pix ou cartão no provedor.

A exclusão remove os registros das telas operacionais, mantendo-os arquivados com autor e data para auditoria e integridade dos vínculos. IDs e números de vendas não são reutilizados.
