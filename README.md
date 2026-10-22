# PDV Sistem

Aplicativo desktop Electron + React, com banco SQLite local e emissor NFC-e embutido do [Sull-s/fiscal](https://github.com/Sull-s/fiscal).

## Executar

Pré-requisitos: Node.js 24 ou superior e um sistema desktop Windows/Linux. No Linux, o emissor exige um cofre de senhas do sistema (Secret Service/KWallet); armazenamento `basic_text` é recusado.

```sh
npx --yes pnpm@9.15.0 install --frozen-lockfile
node --use-env-proxy node_modules/electron/install.js
npx --yes pnpm@9.15.0 build
npx --yes pnpm@9.15.0 start
```

Electron 45 tem instalação explícita do binário. No Windows, também é possível executar `node node_modules/electron/install.js` sem a opção de proxy quando não houver proxy configurado.

O primeiro uso pede a criação do administrador, sem senha predefinida. Cadastre produtos e estoque, adicione funcionários e clientes, abra o caixa e registre as vendas. Um leitor de código de barras que funciona como teclado pode usar o campo de busca com Enter.

## Funcionalidades

- Produtos: preço, SKU/código de barras único, categoria, estoque inteiro e campos NCM/CFOP/CSOSN.
- Caixa: abertura, fundo, sangria, suprimento, fechamento com dinheiro contado, esperado e diferença.
- Vendas: carrinho, desconto, cliente, dinheiro, Pix, crédito, débito e outros; múltiplos pagamentos e troco somente em dinheiro.
- Estoque baixado atomicamente com a venda; repetição do mesmo identificador não duplica vendas.
- Clientes e histórico de compras; recibo não fiscal imprimível em diálogo do sistema.
- Vendas e devoluções totais/parciais, rateio de desconto e recomposição de estoque; reembolso registrado no caixa em que ocorreu.
- Administrador e operador; senhas com scrypt e salt, permissões no processo principal, histórico de operações.
- Relatórios por dia, receita, reembolsos, recebimentos, produtos vendidos e fechamentos.
- Backup consistente do SQLite por diálogo de arquivo.
- Configuração de empresa/A1, NFC-e vinculada à venda, consulta, documentos fiscais, cancelamento, relatórios e XMLs pelo emissor embutido.

Pix e cartão são **registros manuais de recebimentos**. O aplicativo não transfere dinheiro, não confirma Pix com banco e não integra TEF/maquininha. Confirme o recebimento antes de concluir; reembolsos também são executados fora do aplicativo.

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

Dentro de contêineres sem sandbox Linux disponível, a conferência automatizada pode exigir `--no-sandbox`; não use essa opção na instalação desktop. O teste cria apenas dados fictícios na pasta indicada, faz login, registra venda pela interface e verifica troco e estoque. A imagem de conferência é salva em `/tmp/pdv-sistem.png`. O cofre fiscal indisponível no contêiner é comunicado na tela; isso não é validação de emissão real.

## Dependência fiscal

`vendor/fiscal` preserva o código consultado no commit `d890afa5f52b3648bc88bd3d62634268b16cbd24` do repositório indicado, para builds sem token de registro privado. A cópia é compilada como workspace pnpm, com lockfile da aplicação. Origem e restrições de redistribuição estão em [THIRD_PARTY.md](THIRD_PARTY.md). Não atualize os pacotes fiscais sem revisar mudanças e repetir a homologação.

## Limites atuais

Aplicativo de uma loja/um computador, sem sincronização multi-terminal, estoque fracionário ou hardware fiscal específico. O banco guarda o estado em um documento transacional SQLite: adequado para a primeira versão local; grandes históricos precisam de migração para tabelas normalizadas e paginação. Não há conta de demonstração ou produtos fictícios na instalação real.
