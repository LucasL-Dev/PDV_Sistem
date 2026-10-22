import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
export const ranks = { cashier: 0, supervisor: 1, manager: 2, admin: 3 };
export const methods = [
  "dinheiro",
  "pix",
  "credito",
  "debito",
  "fiado",
  "creditoloja",
  "outros",
];
export const defaults = {
  stockPolicy: "block",
  discountLimit: 10,
  paper: 80,
  printer: "",
  silentPrint: false,
  thermalHost: "",
  thermalPort: 9100,
  pixEnabled: false,
  scaleLabels: false,
};
export const fail = (message) => {
  throw Error(message);
};
export function amount(v, min = 0) {
  if (!Number.isSafeInteger(v) || v < min) fail("Valor monetário inválido.");
  return v;
}
export function qty(v, { signed = false, fraction = true } = {}) {
  if (!fraction && !Number.isInteger(v))
    fail("Esta unidade exige valor inteiro.");
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    (!signed && v < 0) ||
    Math.abs(v) > 1e9 ||
    Math.abs(v * 1000 - Math.round(v * 1000)) > 0.00001 ||
    (!fraction && !Number.isInteger(v))
  )
    fail("Quantidade inválida. Use até três casas decimais.");
  return Math.round(v * 1000) / 1000;
}
export function lineTotal(price, quantity) {
  const product =
    BigInt(amount(price)) * BigInt(Math.round(qty(quantity) * 1000));
  const n = Number((product + 500n) / 1000n);
  return amount(n);
}
export function proportional(total, part, whole) {
  if (!Number.isSafeInteger(whole) || whole <= 0)
    fail("Base de rateio inválida.");
  const numerator = BigInt(amount(total)) * BigInt(amount(part));
  return amount(
    Number((numerator * 2n + BigInt(whole)) / (2n * BigInt(whole))),
  );
}
export function prepare(s) {
  s.settings = { ...defaults, ...s.settings };
  s.receivables ??= [];
  s.settlements ??= [];
  s.storeCredits ??= [];
  s.cancellations ??= [];
  s.pixCharges ??= [];
  for (const shift of s.shifts) {
    shift.movements ??= [];
    shift.movements.forEach((m, i) => {
      m.id ??= `legacy-${shift.id}-${i}`;
    });
  }
  return s;
}
export function approve(s, user, p, minimum = 1) {
  if (ranks[user.role] >= minimum) return user;
  const a = p.approval;
  const supervisor = s.users.find(
    (u) =>
      u.login === a?.login &&
      u.active &&
      !u.deletedAt &&
      ranks[u.role] >= minimum,
  );
  if (!supervisor || typeof a?.password !== "string" || a.password.length > 500)
    fail("Autorização de supervisor necessária.");
  const [salt, key] = supervisor.password.split(":");
  if (
    !timingSafeEqual(Buffer.from(key, "hex"), scryptSync(a.password, salt, 64))
  )
    fail("Autorização de supervisor inválida.");
  return supervisor;
}
export function debt(s, customer) {
  return s.receivables
    .filter((d) => d.customer === customer)
    .reduce((a, d) => a + d.balance, 0);
}
export function credit(s, customer) {
  return s.storeCredits
    .filter((c) => c.customer === customer)
    .reduce((a, c) => a + c.balance, 0);
}
export function totals(s, shift) {
  const result = Object.fromEntries(methods.map((m) => [m, 0]));
  result.dinheiro = shift.opening;
  for (const m of shift.movements)
    result.dinheiro += m.type === "sangria" ? -m.amount : m.amount;
  for (const sale of s.sales.filter((v) => !v.deletedAt)) {
    if (sale.shift === shift.id) {
      for (const p of sale.payments)
        result[p.forma] = (result[p.forma] || 0) + p.amount;
      result.dinheiro -= sale.change;
    }
    for (const r of sale.returns.filter((r) => r.shift === shift.id)) {
      result[r.method] = (result[r.method] || 0) - r.refund;
      if (sale.shift === shift.id) result.fiado -= r.debtReduction || 0;
    }
  }
  for (const payment of s.settlements.filter((p) => p.shift === shift.id)) {
    result[payment.method] += payment.amount;
    const account = s.receivables.find((d) => d.id === payment.account);
    if (
      account &&
      s.sales.find((v) => v.id === account.sale)?.shift === shift.id
    )
      result.fiado -= payment.amount;
  }
  return result;
}
export function report(s, shift, type) {
  const expected = totals(s, shift);
  return {
    type,
    shift: shift.id,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt || null,
    opening: shift.opening,
    movements: shift.movements,
    methods: expected,
    sales: s.sales.filter((v) => !v.deletedAt && v.shift === shift.id).length,
    counted: shift.countedPayments || null,
    divergences: shift.divergences || null,
    generatedAt: new Date().toISOString(),
  };
}
export function extra(store, s, u, action, p) {
  let result;
  switch (action) {
    case "settings":
      if (
        s.pixCharges.some((c) =>
          ["creating", "pending", "approved", "recovery"].includes(c.status),
        ) &&
        (p.stockPolicy !== s.settings.stockPolicy ||
          p.discountLimit !== s.settings.discountLimit ||
          p.pixEnabled !== s.settings.pixEnabled)
      )
        fail(
          "Conclua ou cancele as cobranças Pix antes de alterar políticas de venda.",
        );
      if (u.role !== "admin")
        fail("Somente o administrador pode alterar configurações.");
      if (
        !["block", "warn"].includes(p.stockPolicy) ||
        !Number.isFinite(p.discountLimit) ||
        p.discountLimit < 0 ||
        p.discountLimit > 100 ||
        ![58, 80].includes(p.paper)
      )
        fail("Configurações inválidas.");
      if (p.thermalHost && !/^([a-zA-Z0-9.-]+)$/.test(p.thermalHost))
        fail("Endereço da impressora inválido.");
      s.settings = {
        stockPolicy: p.stockPolicy,
        discountLimit: p.discountLimit,
        paper: p.paper,
        printer: String(p.printer || "").slice(0, 200),
        silentPrint: p.silentPrint === true,
        thermalHost: String(p.thermalHost || ""),
        thermalPort: amount(p.thermalPort || 9100, 1),
        pixEnabled: p.pixEnabled === true,
        scaleLabels: p.scaleLabels === true,
      };
      if (s.settings.thermalPort > 65535) fail("Porta inválida.");
      result = true;
      break;
    case "cancelDraft": {
      const authorizer = approve(s, u, p);
      if (
        typeof p.reason !== "string" ||
        p.reason.trim().length < 5 ||
        !Array.isArray(p.items) ||
        !p.items.length
      )
        fail("Informe os itens e o motivo do cancelamento.");
      if (
        s.pixCharges.some(
          (c) =>
            ["creating", "pending", "approved"].includes(c.status) &&
            c.saleId === p.draftId,
        )
      )
        fail("Cancele ou conclua a cobrança Pix antes de alterar esta venda.");
      const items = p.items.map((i) => {
        const product = s.products.find((p) => p.id === i.id);
        if (!product || i.qty <= 0) fail("Item inválido.");
        return {
          id: product.id,
          name: product.name,
          unit: product.unit || "UN",
          qty: qty(i.qty, {
            fraction: ["KG", "M", "L"].includes(product.unit || "UN"),
          }),
        };
      });
      result = {
        id: randomUUID(),
        at: new Date().toISOString(),
        user: u.id,
        authorizedBy: authorizer.id,
        draft: String(p.draftId),
        reason: p.reason.trim(),
        items,
      };
      s.cancellations.push(result);
      break;
    }
    case "shiftReport": {
      if (ranks[u.role] < 2)
        fail("Relatório disponível apenas ao gerente ou administrador.");
      const shift = s.shifts.find((c) => c.id === p.id);
      if (!shift) fail("Caixa não encontrado.");
      if (p.type === "Z" && !shift.closedAt)
        fail("Feche o caixa antes de gerar o resumo Z.");
      result = report(s, shift, p.type === "Z" ? "Z" : "X");
      break;
    }
    case "settleDebt": {
      const shift = s.shifts.find((c) => !c.closedAt);
      if (!shift) fail("Abra o caixa para receber a dívida.");
      const account = s.receivables.find((d) => d.id === p.id);
      if (!account) fail("Conta não encontrada.");
      const value = amount(p.amount, 1);
      if (
        value > account.balance ||
        !["dinheiro", "pix", "credito", "debito"].includes(p.method)
      )
        fail("Recebimento inválido.");
      account.balance -= value;
      result = {
        id: randomUUID(),
        account: account.id,
        customer: account.customer,
        shift: shift.id,
        amount: value,
        method: p.method,
        user: u.id,
        at: new Date().toISOString(),
      };
      s.settlements.push(result);
      break;
    }
    default:
      return { handled: false };
  }
  store.audit(s, u, action, {
    id: result?.id || p.id || "",
    authorizedBy: result?.authorizedBy,
  });
  return { handled: true, result };
}
