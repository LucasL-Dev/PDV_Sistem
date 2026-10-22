import ExcelJS from "exceljs";
import { lineTotal } from "./operations.mjs";

const currency = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
// Only explicit business fields enter the workbook. Never serialize raw state,
// user passwords, Pix credentials, certificate configuration or audit payloads.
export function exportWorkbook(store) {
  const s = store.read();
  const operator = store.user(s, true);
  const book = new ExcelJS.Workbook();
  book.creator = "OmniPDV";
  book.created = new Date();
  const name = (collection, id) => collection.find((x) => x.id === id)?.name || id || "";
  const user = (id) => name(s.users, id);
  const customer = (id) => name(s.customers, id);
  function sheet(title, headers, rows, money = [], quantities = []) {
    const ws = book.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(headers);
    rows.forEach((row) => ws.addRow(row.map((v) => v ?? "")));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17664D" } };
    ws.getRow(1).height = 26;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: headers.length } };
    ws.columns.forEach((col, i) => { col.width = Math.min(45, Math.max(18, headers[i].length + 3)); });
    money.forEach((i) => { ws.getColumn(i).numFmt = currency; });
    quantities.forEach((i) => { ws.getColumn(i).numFmt = '0.###'; });
  }
  const sales = s.sales; // Includes archived records with an explicit status.
  const status = (x) => x.deletedAt ? "Excluído" : "Ativo";
  sheet("Informações", ["Campo", "Valor"], [
    ["Aplicativo", "OmniPDV"], ["Exportado em (UTC)", book.created.toISOString()],
    ["Responsável", operator.name], ["Escopo", "Todos os registros, inclusive excluídos identificados por status"],
    ["Datas", "ISO 8601, com fuso/UTC conforme registrado"],
    ["Valores", "Reais (R$), células numéricas; quantidades até 3 casas decimais"],
    ["Importante", "Planilha para consulta. Não substitui o backup SQLite nem documentos fiscais."],
  ]);
  sheet("Produtos", ["ID", "Produto", "Código de barras", "Categoria", "Unidade", "Preço", "Estoque", "Status"],
    s.products.map((p) => [p.id, p.name, p.barcode, p.category, p.unit || "UN", p.price / 100, p.stock, status(p)]), [6], [7]);
  sheet("Clientes", ["ID", "Nome", "CPF ou CNPJ", "Telefone", "Limite de crédito", "Status"],
    s.customers.map((c) => [c.id, c.name, c.document, c.phone, (c.creditLimit || 0) / 100, status(c)]), [5]);
  sheet("Funcionários", ["ID", "Nome", "Login", "Perfil", "Ativo", "Status"],
    s.users.map((u) => [u.id, u.name, u.login, u.role, u.active ? "Sim" : "Não", status(u)]));
  sheet("Vendas", ["ID", "Número", "Data", "Operador", "Cliente", "Caixa", "Subtotal", "Desconto", "Total", "Troco", "Status", "Situação fiscal"],
    sales.map((v) => [v.id, v.number, v.at, user(v.user), customer(v.customer), v.shift, v.subtotal / 100, v.discount / 100, v.total / 100, v.change / 100, status(v), v.fiscal?.status || "Não emitida"]), [7,8,9,10]);
  sheet("Itens vendidos", ["Venda ID", "Número", "Produto ID", "Produto", "Unidade", "Quantidade", "Preço unitário", "Subtotal bruto", "Quantidade devolvida", "Status da venda"],
    sales.flatMap((v) => v.items.map((i) => [v.id, v.number, i.id, i.name, i.unit || "UN", i.qty, i.price / 100, lineTotal(i.price, i.qty) / 100, i.returned || 0, status(v)])), [7,8], [6,9]);
  sheet("Pagamentos", ["Venda ID", "Número", "Data", "Forma", "Valor informado", "Status da venda"],
    sales.flatMap((v) => v.payments.map((p) => [v.id, v.number, v.at, p.forma, p.amount / 100, status(v)])), [5]);
  sheet("Caixas", ["ID", "Operador", "Abertura", "Fechamento", "Fundo inicial", "Esperado dinheiro", "Declarado dinheiro"],
    s.shifts.map((c) => [c.id, user(c.user), c.openedAt, c.closedAt, c.opening / 100, c.expected == null ? "" : c.expected / 100, c.counted == null ? "" : c.counted / 100]), [5,6,7]);
  sheet("Conferência de caixa", ["Caixa ID", "Fechamento", "Forma", "Esperado", "Declarado", "Diferença"],
    s.shifts.filter((c) => c.closedAt).flatMap((c) => Object.entries(c.countedPayments || { dinheiro: c.counted }).map(([method, value]) => [c.id, c.closedAt, method, (c.expectedPayments?.[method] ?? (method === "dinheiro" ? c.expected : 0) ?? 0) / 100, value / 100, (c.divergences?.[method] ?? (value - (c.expectedPayments?.[method] ?? c.expected ?? 0))) / 100])), [4,5,6]);
  sheet("Movimentos de caixa", ["ID", "Caixa", "Data", "Operador", "Tipo", "Valor", "Justificativa"],
    s.shifts.flatMap((c) => c.movements.map((m) => [m.id, c.id, m.at, user(m.user), m.type, m.amount / 100, m.reason])), [6]);
  sheet("Devoluções", ["ID", "Venda", "Data", "Operador", "Autorizador", "Valor", "Redução da dívida", "Reembolso", "Forma", "Motivo", "Status da venda"],
    sales.flatMap((v) => v.returns.map((r) => [r.id, v.number, r.at, user(r.user), user(r.authorizedBy), r.value / 100, (r.debtReduction || 0) / 100, (r.refund || 0) / 100, r.method, r.reason, status(v)])), [6,7,8]);
  sheet("Contas a receber", ["ID", "Venda ID", "Cliente", "Data", "Valor original", "Saldo"],
    s.receivables.map((r) => [r.id, r.sale, customer(r.customer), r.at, r.total / 100, r.balance / 100]), [5,6]);
  sheet("Recebimentos", ["ID", "Conta ID", "Data", "Operador", "Caixa", "Forma", "Valor"],
    s.settlements.map((r) => [r.id, r.account, r.at, user(r.user), r.shift, r.method, r.amount / 100]), [7]);
  sheet("Créditos da loja", ["ID", "Cliente", "Data", "Valor original", "Saldo"],
    s.storeCredits.map((r) => [r.id, customer(r.customer), r.at, r.total / 100, r.balance / 100]), [4,5]);
  sheet("Cancelamentos de itens", ["ID", "Data", "Operador", "Autorizador", "Motivo", "Produto", "Unidade", "Quantidade"],
    s.cancellations.flatMap((c) => c.items.map((i) => [c.id, c.at, user(c.user), user(c.authorizedBy), c.reason, i.name || name(s.products, i.id), i.unit || "UN", i.qty])), [], [8]);
  sheet("Auditoria", ["Data", "Operador", "Ação"], s.audit.map((a) => [a.at, user(a.user), a.action]));
  return book;
}
