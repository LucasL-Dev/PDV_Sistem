import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../electron/store.mjs";
import { defaults, totals, lineTotal } from "../electron/operations.mjs";
import { reservePix, finalizePix } from "../electron/pix-flow.mjs";
import { MercadoPago, verifiedPayment } from "../electron/pix.mjs";
import { escpos, sendThermal } from "../electron/thermal.mjs";
import { createServer } from "node:net";
import { scaleBarcode } from "../src/pos-utils.js";
function setup() {
  const s = new Store(":memory:");
  s.call("bootstrap", {
    name: "Admin",
    login: "admin",
    password: "password123",
  });
  const p = s.call("product", {
    name: "Produto",
    barcode: "12345",
    category: "Geral",
    price: 1000,
    stock: 10,
  });
  s.call("openShift", { opening: 10000 });
  return { s, p };
}
function checkout(p, extra = {}) {
  return {
    id: crypto.randomUUID(),
    items: [{ id: p.id, qty: 1 }],
    discount: 0,
    payments: [{ forma: "dinheiro", amount: 1000 }],
    ...extra,
  };
}
function user(s, role, login = role) {
  s.call("employee", {
    name: role,
    login,
    password: "password123",
    role,
    active: true,
  });
  return s.read().users.find((u) => u.login === login);
}
test("fechamento cego oculta conferência do operador e gera diferenças ao gerente", () => {
  const { s, p } = setup();
  user(s, "cashier");
  s.call("sale", checkout(p));
  s.call("login", { login: "cashier", password: "password123" });
  assert.throws(
    () => s.call("shiftReport", { id: s.read().shifts[0].id, type: "X" }),
    /gerente/,
  );
  s.call("closeShift", {
    countedPayments: {
      dinheiro: 10950,
      pix: 0,
      credito: 0,
      debito: 0,
      fiado: 0,
    },
  });
  const view = s.snapshot().shifts[0];
  assert.equal(view.expected, undefined);
  assert.equal(view.divergences, undefined);
  s.call("login", { login: "admin", password: "password123" });
  const report = s.call("shiftReport", {
    id: s.read().shifts[0].id,
    type: "Z",
  });
  assert.equal(report.methods.dinheiro, 11000);
  assert.equal(report.divergences.dinheiro, -50);
  s.close();
});
test("fracionados têm três casas e centavos exatos; regra bloqueia ou alerta", () => {
  const { s, p } = setup();
  s.call("product", { ...p, unit: "KG" });
  const v = s.call(
    "sale",
    checkout(p, {
      items: [{ id: p.id, qty: 0.125 }],
      payments: [{ forma: "pix", amount: 125 }],
    }),
  );
  assert.equal(v.total, 125);
  assert.equal(s.read().products[0].stock, 9.875);
  assert.throws(
    () => s.call("sale", checkout(p, { items: [{ id: p.id, qty: 0.1234 }] })),
    /Quantidade/,
  );
  s.call("settings", { ...defaults, stockPolicy: "warn" });
  const negative = s.call(
    "sale",
    checkout(p, {
      items: [{ id: p.id, qty: 10 }],
      payments: [{ forma: "dinheiro", amount: 10000 }],
    }),
  );
  assert.equal(s.read().products[0].stock, -0.125);
  assert.equal(negative.warnings.length, 1);
  assert.equal(lineTotal(1999, 0.125), 250);
  s.close();
});
test("supervisor autoriza desconto e cancelamento sem expor senha na auditoria", () => {
  const { s, p } = setup();
  const supervisor = user(s, "supervisor");
  user(s, "cashier");
  s.call("login", { login: "cashier", password: "password123" });
  const payload = checkout(p, {
    discount: 200,
    payments: [{ forma: "dinheiro", amount: 800 }],
  });
  assert.throws(() => s.call("sale", payload), /supervisor/);
  const v = s.call("sale", {
    ...payload,
    approval: { login: "supervisor", password: "password123" },
  });
  assert.equal(v.authorizedBy, supervisor.id);
  const cancelled = s.call("cancelDraft", {
    draftId: crypto.randomUUID(),
    items: [{ id: p.id, qty: 1 }],
    reason: "Cliente desistiu",
    approval: { login: "supervisor", password: "password123" },
  });
  assert.equal(cancelled.authorizedBy, supervisor.id);
  assert.ok(!JSON.stringify(s.read().audit).includes("password123"));
  s.close();
});
test("caderneta exige limite e cliente; recebimento entra no caixa e reduz saldo", () => {
  const { s, p } = setup();
  const c = s.call("customer", { name: "Cliente", creditLimit: 1500 });
  const v = s.call(
    "sale",
    checkout(p, {
      customer: c.id,
      payments: [{ forma: "fiado", amount: 1000 }],
    }),
  );
  assert.throws(
    () =>
      s.call(
        "sale",
        checkout(p, {
          customer: c.id,
          payments: [{ forma: "fiado", amount: 1000 }],
        }),
      ),
    /Limite/,
  );
  assert.equal(s.read().products[0].stock, 9);
  s.call("settleDebt", {
    id: s.read().receivables[0].id,
    amount: 400,
    method: "dinheiro",
  });
  assert.equal(s.read().receivables[0].balance, 600);
  assert.equal(s.cash(s.read(), s.read().shifts[0]), 10400);
  assert.equal(totals(s.read(), s.read().shifts[0]).fiado, 600);
  assert.throws(() => s.call("deleteSale", { id: v.id }), /caderneta/);
  s.close();
});
test("devolução de fiado abate dívida antes de reembolsar valores pagos", () => {
  const { s, p } = setup();
  const c = s.call("customer", { name: "Cliente", creditLimit: 1000 });
  const v = s.call(
    "sale",
    checkout(p, {
      customer: c.id,
      payments: [{ forma: "fiado", amount: 1000 }],
    }),
  );
  s.call("settleDebt", {
    id: s.read().receivables[0].id,
    amount: 300,
    method: "dinheiro",
  });
  const r = s.call("return", {
    id: v.id,
    items: [{ id: p.id, qty: 1 }],
    reason: "Produto devolvido",
    method: "dinheiro",
  });
  assert.equal(r.value, 1000);
  assert.equal(r.debtReduction, 700);
  assert.equal(r.refund, 300);
  assert.equal(s.read().receivables[0].balance, 0);
  assert.equal(s.cash(s.read(), s.read().shifts[0]), 10000);
  s.close();
});
test("troca gera crédito e venda consome saldo; falha restaura todo o financeiro", () => {
  const { s, p } = setup();
  const c = s.call("customer", { name: "Cliente" });
  const v = s.call("sale", checkout(p, { customer: c.id }));
  s.call("return", {
    id: v.id,
    items: [{ id: p.id, qty: 1 }],
    reason: "Troca do produto",
    method: "creditoloja",
  });
  assert.equal(s.read().storeCredits[0].balance, 1000);
  assert.throws(
    () =>
      s.call(
        "sale",
        checkout(p, {
          customer: c.id,
          items: [{ id: p.id, qty: 20 }],
          payments: [{ forma: "creditoloja", amount: 20000 }],
        }),
      ),
    /Estoque/,
  );
  assert.equal(s.read().storeCredits[0].balance, 1000);
  s.call(
    "sale",
    checkout(p, {
      customer: c.id,
      payments: [{ forma: "creditoloja", amount: 1000 }],
    }),
  );
  assert.equal(s.read().storeCredits[0].balance, 0);
  assert.equal(s.read().products[0].stock, 9);
  s.close();
});
test("reserva Pix impede consumo do estoque, mantém payload imutável e só conclui aprovado", () => {
  const { s, p } = setup();
  s.call("settings", { ...defaults, pixEnabled: true });
  const payload = checkout(p, {
    items: [{ id: p.id, qty: 10 }],
    payments: [{ forma: "pix", amount: 10000 }],
  });
  const c = reservePix(s, payload, "teste@example.com");
  assert.equal(reservePix(s, payload, "teste@example.com").id, c.id);
  assert.throws(() => s.call("sale", checkout(p)), /Estoque/);
  assert.throws(() => finalizePix(s, c.id), /confirmado/);
  assert.throws(() => s.call("closeShift", { counted: 10000 }), /Pix pendente/);
  assert.throws(() => s.call("sale", payload), /confirme/i);
  s.mutate((state) => {
    state.pixCharges[0].status = "approved";
    state.pixCharges[0].remoteId = "123";
  });
  const sale = finalizePix(s, c.id);
  assert.equal(sale.total, 10000);
  assert.equal(s.read().pixCharges[0].status, "completed");
  assert.equal(s.read().products[0].stock, 0);
  assert.equal(s.call("sale", { ...payload, pixChargeId: c.id }).id, sale.id);
  s.close();
});
test("Mercado Pago usa idempotência e confere valor, referência, moeda e status", async () => {
  let observed;
  const client = new MercadoPago("token-ficticio", async (url, options) => {
    observed = { url, options };
    return { ok: true, json: async () => ({ id: 123 }) };
  });
  await client.create({
    id: "referencia",
    amount: 1234,
    email: "teste@example.com",
  });
  assert.equal(observed.url, "https://api.mercadopago.com/v1/payments");
  assert.equal(
    observed.options.headers["X-Idempotency-Key"],
    "omnipdv-referencia",
  );
  assert.equal(JSON.parse(observed.options.body).transaction_amount, 12.34);
  const payment = {
    id: 123,
    external_reference: "referencia",
    transaction_amount: 12.34,
    currency_id: "BRL",
    payment_method_id: "pix",
    status: "approved",
  };
  assert.equal(
    verifiedPayment(payment, {
      id: "referencia",
      amount: 1234,
      remoteId: "123",
    }),
    true,
  );
  assert.throws(
    () =>
      verifiedPayment(
        { ...payment, transaction_amount: 0.01 },
        { id: "referencia", amount: 1234, remoteId: "123" },
      ),
    /corresponde/,
  );
  assert.equal(
    verifiedPayment(
      { ...payment, status: "pending" },
      { id: "referencia", amount: 1234, remoteId: "123" },
    ),
    false,
  );
});
test("ESC/POS envia inicialização, texto sem injeções e corte por TCP", async () => {
  const packet = escpos(["OmniPDV", "\x1bInjeção", "Valor: R$ 20,00"], 58);
  assert.deepEqual([...packet.subarray(-3)], [0x1d, 0x56, 0]);
  assert.equal(packet.subarray(5).includes(0x1b), false);
  const server = createServer((socket) => {
    const chunks = [];
    socket.on("data", (data) => chunks.push(data));
    socket.on("end", () => {
      assert.ok(Buffer.concat(chunks).includes(Buffer.from("OmniPDV")));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await sendThermal(
      {
        thermalHost: "127.0.0.1",
        thermalPort: server.address().port,
        paper: 80,
      },
      ["OmniPDV"],
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("etiqueta de peso só aceita checksum e prefixo documentado", () => {
  const prefix = "201234500125";
  const sum = prefix
    .split("")
    .reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  const code = prefix + ((10 - (sum % 10)) % 10);
  assert.equal(
    scaleBarcode(code, [{ id: "p", barcode: "12345", unit: "KG" }]).qty,
    0.125,
  );
  assert.equal(
    scaleBarcode(code.slice(0, 12) + "9", [{ barcode: "12345", unit: "KG" }]),
    null,
  );
});
test("retorno fracionado conserva estoque e rateio de centavos", () => {
  const { s, p } = setup();
  s.call("product", { ...p, unit: "KG" });
  const v = s.call(
    "sale",
    checkout(p, {
      items: [{ id: p.id, qty: 0.125 }],
      payments: [{ forma: "dinheiro", amount: 125 }],
    }),
  );
  const r = s.call("return", {
    id: v.id,
    items: [{ id: p.id, qty: 0.025 }],
    reason: "Retorno parcial",
    method: "dinheiro",
  });
  assert.equal(r.refund, 25);
  assert.equal(s.read().products[0].stock, 9.9);
  s.close();
});
test("Pix reserva limite e crédito de cliente, não apenas produtos", () => {
  const { s, p } = setup();
  const c = s.call("customer", { name: "Cliente", creditLimit: 1000 });
  s.call("settings", { ...defaults, pixEnabled: true });
  reservePix(
    s,
    checkout(p, {
      customer: c.id,
      items: [{ id: p.id, qty: 2 }],
      payments: [
        { forma: "pix", amount: 1000 },
        { forma: "fiado", amount: 1000 },
      ],
    }),
    "teste@example.com",
  );
  assert.throws(
    () =>
      s.call(
        "sale",
        checkout(p, {
          customer: c.id,
          payments: [{ forma: "fiado", amount: 1000 }],
        }),
      ),
    /Limite/,
  );
  assert.equal(s.read().receivables.length, 0);
  s.close();
});
test("configurações e usuários continuam restritos; gerente pode conferir X", () => {
  const { s } = setup();
  user(s, "manager");
  s.call("login", { login: "manager", password: "password123" });
  assert.throws(() => s.call("settings", defaults), /administrador/);
  assert.throws(
    () =>
      s.call("employee", {
        name: "Novo",
        login: "novo",
        password: "password123",
        role: "admin",
      }),
    /administrador/,
  );
  assert.equal(
    s.call("shiftReport", { id: s.read().shifts[0].id, type: "X" }).type,
    "X",
  );
  s.close();
});
test("devolução decimal em duas partes não rejeita o saldo por ponto flutuante", () => {
  const { s, p } = setup();
  s.call("product", { ...p, unit: "KG" });
  const v = s.call(
    "sale",
    checkout(p, {
      items: [{ id: p.id, qty: 0.3 }],
      payments: [{ forma: "dinheiro", amount: 300 }],
    }),
  );
  for (const quantity of [0.1, 0.2])
    s.call("return", {
      id: v.id,
      items: [{ id: p.id, qty: quantity }],
      reason: "Devolução por peso",
      method: "dinheiro",
    });
  assert.equal(s.read().products[0].stock, 10);
  assert.equal(
    s.read().sales[0].returns.reduce((a, r) => a + r.value, 0),
    300,
  );
  s.close();
});
test("cobrança e reserva persistem após reabrir SQLite; credenciais não entram no payload", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "omni-db-"));
  let s;
  try {
    s = new Store(join(directory, "db.sqlite"));
    s.call("bootstrap", {
      name: "Admin",
      login: "admin",
      password: "password123",
    });
    const p = s.call("product", {
      name: "Produto",
      barcode: "0001",
      category: "Geral",
      price: 1000,
      stock: 1,
    });
    s.call("openShift", { opening: 0 });
    s.call("settings", { ...defaults, pixEnabled: true });
    const payload = checkout(p, {
      payments: [{ forma: "pix", amount: 1000 }],
      approval: { login: "admin", password: "password123" },
      supervisorPassword: "nao-persistir",
    });
    const charge = reservePix(s, payload, "teste@example.com");
    assert.ok(!JSON.stringify(s.read().pixCharges).includes("password123"));
    assert.ok(!JSON.stringify(s.read().pixCharges).includes("nao-persistir"));
    s.close();
    s = new Store(join(directory, "db.sqlite"));
    s.call("login", { login: "admin", password: "password123" });
    assert.equal(s.read().pixCharges[0].id, charge.id);
    assert.throws(() => s.call("sale", checkout(p)), /Estoque/);
  } finally {
    s?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("abatimento de fiado de turno anterior não cria divergência de comprovante no turno atual", () => {
  const { s, p } = setup();
  const customer = s.call("customer", { name: "Cliente", creditLimit: 1000 });
  const sale = s.call(
    "sale",
    checkout(p, {
      customer: customer.id,
      payments: [{ forma: "fiado", amount: 1000 }],
    }),
  );
  s.call("closeShift", {
    countedPayments: {
      dinheiro: 10000,
      pix: 0,
      credito: 0,
      debito: 0,
      fiado: 1000,
    },
  });
  s.call("openShift", { opening: 0 });
  s.call("return", {
    id: sale.id,
    items: [{ id: p.id, qty: 1 }],
    reason: "Devolução posterior",
    method: "dinheiro",
  });
  assert.equal(totals(s.read(), s.read().shifts[1]).fiado, 0);
  s.close();
});
