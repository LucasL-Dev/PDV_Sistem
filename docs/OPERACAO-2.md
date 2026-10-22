# OmniPDV 2.0 — operação e configuração

## Tema e atalhos

O seletor no topo da janela e do login oferece Claro, Escuro e Sistema. A preferência é guardada localmente, sem incluir senhas ou informações de pagamento.

| Tecla | Na frente de caixa |
| --- | --- |
| F1 | Focar a busca/código de barras |
| F2 | Abrir pagamento; dentro do pagamento, concluir recebimentos manuais |
| F3 | Cancelar o item selecionado (ou o último) com motivo/autorização |
| F4 | Abrir cliente/desconto e focar o valor |
| F6 | Consultar preço e estoque sem perder o carrinho |
| F12 | Informar quantidade ou peso do item selecionado |
| Esc | Fechar uma janela; na venda aberta, solicitar cancelamento da pré-venda |

Os formulários também podem ser percorridos com Tab/Shift+Tab e enviados com Enter. Um leitor configurado como teclado com Enter final lê códigos consecutivos; o campo de busca volta a ficar pronto após cada leitura. Clique/focalize uma linha do carrinho para selecionar o alvo de F3/F12. Reduções de quantidade exigem motivo e são registradas como cancelamentos.

No pagamento, R$20/R$50/R$100 preenchem o dinheiro recebido. Valor exato considera os outros pagamentos divididos. O restante pode ser Pix, crédito, débito, fiado ou crédito da loja; troco só sai de dinheiro.

## Caixa: abertura, movimentos e fechamento cego

A abertura exige o fundo inicial, inclusive quando for zero. Em Gerenciar caixa, registre sangria/suprimento com valor e justificativa. A operação é gravada antes de imprimir o comprovante; se a impressão falhar, o movimento continua registrado e pode ser reimpresso. Os movimentos antigos também recebem identificadores estáveis para reimpressão.

No fechamento, o operador informa separadamente Dinheiro, Pix, Crédito, Débito e Fiado. Não aparece o esperado do sistema na tela. Operadores não recebem os valores de conferência nem podem solicitar resumos X/Z pela API. Gerentes/Admin consultam, em Relatórios, os valores esperados, contados e a sobra/falta por forma.

X é um resumo gerencial durante a operação; Z é o resumo do caixa fechado. **São relatórios gerenciais não fiscais, não leituras de ECF.** Incluem fundo, movimentos, quantidade de vendas e agrupamento dos recebimentos. Cobranças Pix pendentes precisam ser concluídas ou canceladas antes de fechar o caixa.

## Unidades e estoque

Selecione UN, KG, M, L, CX ou FD no cadastro do produto. Preço e estoque estão na unidade cadastrada: um SKU em CX controla caixas; não converte automaticamente uma caixa em unidades de outro SKU. KG/M/L aceitam até três casas decimais. O valor de cada linha é arredondado em centavos, e o estoque é operado em milésimos para evitar erros de ponto flutuante.

Em Configurações, o Admin escolhe Bloquear ou Alertar. No segundo modo, a venda pode gerar estoque negativo, com alerta. Não é possível alterar um produto reservado por cobrança Pix pendente.

**Balança:** como marca/modelo/protocolo ainda não foram identificados, não há leitura automática de peso pela rede. Use F12 para informar o peso ou uma balança que o envie como teclado. Opcionalmente, ative o formato de etiquetas documentado: EAN-13 com prefixo 20, SKU de cinco dígitos, peso em gramas em cinco dígitos e checksum. Essa opção é desativada por padrão; não a use em etiquetas de preço ou outro formato. Outro protocolo precisa de um adaptador próprio, sem adivinhar o significado dos bytes.

## Perfis e autorizações

| Perfil | Permissões principais |
| --- | --- |
| Operador | Vender, abrir/movimentar caixa, fechar cegamente, consultar estoque, receber caderneta |
| Supervisor | Operação e autorização de descontos acima do limite e cancelamentos/devoluções |
| Gerente | Gestão de produtos/clientes, crédito pré-aprovado, exclusões permitidas e conferência gerencial |
| Admin | Todas as anteriores, usuários, política de desconto/estoque e equipamentos/credenciais |

No pagamento, descontos acima do limite configurado exigem login/senha de Supervisor, Gerente ou Admin. Nas devoluções e cancelamentos, a mesma autorização é verificada no processo principal. Perfis privilegiados podem autorizar com a própria sessão. A auditoria guarda o operador e o autorizador, nunca a senha. O Admin define os perfis em Funcionários. Cancelamento fiscal continua dependendo da SEFAZ e do certificado, além da autorização local.

## Fiado, recebimento e trocas

Em Clientes, Gerente/Admin cadastra um limite de fiado em reais. Na venda, vincule o cliente e selecione Fiado; o saldo em aberto somado à nova compra não pode exceder o limite. Em Caderneta e trocas, consulte os saldos, imprima o comprovante de débito e registre pagamentos efetivamente recebidos, com caixa aberto. Há comprovante de recebimento. Pix da caderneta, como cartões, é confirmado manualmente pelo operador nesta versão; a integração automática a seguir se aplica às vendas.

Para troca, abra a venda e escolha Devolução → Crédito para troca na loja. É necessário que a venda tenha cliente identificado. O produto retorna ao estoque e o valor pago vira saldo do cliente. Na compra seguinte, use o mesmo cliente e Crédito da loja como pagamento, combinando com outra forma se necessário. Não se permite gastar acima do saldo. Devolução em dinheiro/Pix/cartão gera registro do reembolso; a transferência/estorno externo continua a cargo da loja.

Ao devolver uma venda fiada, o sistema primeiro abate a dívida ainda não paga. Só o valor já pago pode gerar reembolso/crédito. A tela informa o abatimento e o reembolso efetivo. Vendas vinculadas à caderneta/crédito não podem ser apagadas como uma venda avulsa: utilize devolução e mantenha o histórico financeiro. Devoluções fiscais parciais continuam exigindo orientação/documento do contador.

## Pix dinâmico — Mercado Pago

1. Obtenha a credencial adequada no painel de desenvolvedores do Mercado Pago. Comece com a homologação/contas de teste oferecidas pelo provedor.
2. Como Admin, abra Configurações. Digite o Access Token no campo protegido e clique em Guardar no cofre. **Não envie o token em chat, não o coloque em Git/.env/localStorage.**
3. Ative Exigir confirmação automática do Pix nas vendas e salve.
4. Monte a compra e informe todos os pagamentos. Para dividir, registre antes os demais recebimentos manuais.
5. Informe o e-mail do pagador e gere o QR Code. O cliente pode usar o QR ou o copia e cola.
6. O app consulta o Mercado Pago e conclui somente quando o pagamento estiver `approved`, com ID, referência, moeda BRL, método Pix e valor compatíveis. Clicar em Concluir não contorna a verificação.
7. Uma chave de idempotência fixa por cobrança evita duplicações nas tentativas. Enquanto pendente, ficam reservados estoque e limites/saldo usados na compra. O estoque reservado é subtraído do disponível no modo Bloquear; no modo Alertar, a política permite venda com saldo negativo. Alterações incompatíveis são bloqueadas.
8. Se fechar a janela ou reiniciar o app, use Retomar cobrança. Há consulta periódica em segundo plano enquanto o aplicativo está aberto. A reserva só é liberada após confirmação de cancelamento/rejeição; não apague dados para resolver um timeout.

O token é cifrado pelo cofre do Windows em `userData/mercadopago.bin`, separado do SQLite. Em sistemas sem cofre seguro, o app recusa armazenamento inseguro. Restaurar em outro usuário/PC exige recadastrar a credencial. O código usa exclusivamente `https://api.mercadopago.com/v1/payments` (POST criação, GET consulta, PUT cancelamento), com TLS verificado. Não expõe o token à interface depois de gravado.

A implementação foi conferida com os contratos do SDK oficial `mercadopago/sdk-nodejs`, commit `bf920b9415ba19986b7ffdbf83a5aa21b589a6e0`. Os testes locais usam respostas controladas; **não houve cobrança real, validação de credencial nem homologação bancária neste ambiente**. Pix requer internet; se estiver indisponível, continue com as formas offline disponíveis. Para trocar a política de Pix manual/automático, o Admin precisa alterar a configuração explicitamente. Um reembolso bancário não é enviado por esta integração.

## Impressão em rede e pelo driver

Em Configurações, escolha largura 58/80 mm, driver e, se desejado, impressão direta sem diálogo. Carregar impressoras lista os drivers instalados no Windows. Para ESC/POS, informe IP/host e porta TCP da impressora (comumente 9100; confirme no equipamento).

Com host configurado, recibos operacionais e comprovantes são enviados por TCP em ESC/POS, com inicialização, texto compatível e comando GS V para corte. O corte depende de a impressora ter guilhotina e suportar o comando. O envio TCP não é confirmação física de papel impresso. Sem host, é usado o driver/diálogo. O DANFE fiscal continua disponível no módulo Documentos fiscais; o recibo operacional é identificado como não fiscal.

Os testes verificam o conteúdo ESC/POS e transmissão a um servidor TCP local simulado; não validam impressora física, driver, cortador ou balança. Faça essas verificações com o equipamento real antes de operar em produção.

## Banco, auditoria e offline

O app é desktop, com SQLite local, WAL, `synchronous=FULL` e transações `BEGIN IMMEDIATE`. Venda, baixa de estoque, uso de crédito e geração de débito são gravados juntos; falha gera rollback. Devolução e geração de crédito/abatimento de dívida também são uma transação. Dados de versões anteriores recebem os novos campos com valores compatíveis, mantendo o mesmo diretório.

Vendas locais em dinheiro e lançamentos manuais continuam sem internet. Não há sincronização entre computadores/servidor nesta versão. A contingência NFC-e depende do emissor fiscal configurado; não transforma Pix offline em pagamento aprovado. A auditoria guarda data/hora, usuário, ação e autorizador nas operações sensíveis, incluindo configuração, cancelamentos e financeiro. Faça backup do SQLite pelo app e cópia separada dos dados fiscais/cofres, conforme o README.
