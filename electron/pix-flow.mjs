import { createHash, randomUUID } from "node:crypto";
export const fingerprint = (p) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        id: p.id,
        items: p.items.map((i) => ({ id: i.id, qty: i.qty })),
        customer: p.customer || "",
        discount: p.discount,
        payments: p.payments.map((x) => ({ forma: x.forma, amount: x.amount })),
      }),
    )
    .digest("hex");
export const held = (c) =>
  ["creating", "pending", "approved", "recovery"].includes(c.status);
export function reservePix(store, checkout, email) {
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email))
    throw Error("Informe o e-mail do pagador.");
  const state = store.read();
  const user = store.user(state);
  if (!state.settings.pixEnabled)
    throw Error("Ative o Mercado Pago nas configurações.");
  const key = fingerprint(checkout);
  const old = state.pixCharges.find((c) => c.saleId === checkout.id);
  if (old) {
    if (old.fingerprint !== key)
      throw Error(
        "Esta venda já possui uma cobrança. Consulte ou cancele antes de alterar.",
      );
    if (["cancelled", "rejected", "expired"].includes(old.status))
      throw Error("Inicie uma nova venda para gerar outra cobrança.");
    return old;
  }
  const probe = new store.constructor(":memory:");
  let quote;
  try {
    probe.db
      .prepare("UPDATE state SET data=? WHERE id=1")
      .run(JSON.stringify(state));
    probe.session = store.session;
    probe.simulation = true;
    quote = probe.call("sale", checkout);
  } finally {
    probe.close();
  }
  const amount = quote.payments
    .filter((x) => x.forma === "pix")
    .reduce((a, x) => a + x.amount, 0);
  if (!amount) throw Error("Informe o valor do Pix.");
  return store.mutate((s) => {
    const safe = {
      id: quote.id,
      items: quote.items.map((i) => ({ id: i.id, qty: i.qty })),
      customer: quote.customer || "",
      discount: quote.discount,
      payments: quote.payments,
    };
    const c = {
      id: randomUUID(),
      saleId: quote.id,
      shift: quote.shift,
      user: user.id,
      authorizedBy: quote.authorizedBy,
      amount,
      email,
      status: "creating",
      remoteId: null,
      fingerprint: key,
      checkout: safe,
      items: quote.items,
      at: new Date().toISOString(),
    };
    s.pixCharges.push(c);
    store.audit(s, user, "pix.reserve", c.id);
    return c;
  });
}
export function finalizePix(store, id) {
  const charge = store.read().pixCharges.find((c) => c.id === id);
  if (!charge || charge.status !== "approved")
    throw Error("O Pix ainda não foi confirmado.");
  const previous = store.session;
  if (
    store
      .read()
      .users.some((u) => u.id === charge.user && u.active && !u.deletedAt)
  )
    store.session = charge.user;
  store.pixApproval = charge.authorizedBy;
  try {
    return store.call("sale", { ...charge.checkout, pixChargeId: charge.id });
  } finally {
    store.pixApproval = null;
    store.session = previous;
  }
}
