const base = "https://api.mercadopago.com";
export class MercadoPago {
  constructor(token, fetcher = fetch) {
    this.token = token;
    this.fetcher = fetcher;
  }
  async request(path, method = "GET", body, key) {
    const response = await this.fetcher(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(key ? { "X-Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        `Mercado Pago não confirmou a operação (HTTP ${response.status}). Confira as credenciais e os dados do pagador.`,
      );
    return result;
  }
  create({ id, amount, email }) {
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email)
    )
      throw Error("Informe valor Pix e e-mail válidos.");
    return this.request(
      "/v1/payments",
      "POST",
      {
        transaction_amount: amount / 100,
        description: "Venda OmniPDV",
        payment_method_id: "pix",
        external_reference: id,
        payer: { email },
      },
      "omnipdv-" + id,
    );
  }
  get(id) {
    if (!/^\d+$/.test(String(id))) throw Error("Identificador Pix inválido.");
    return this.request("/v1/payments/" + id);
  }
  cancel(id) {
    return this.request("/v1/payments/" + id, "PUT", { status: "cancelled" });
  }
}
export function verifiedPayment(payment, charge) {
  if (
    String(payment.id) !== String(charge.remoteId) ||
    payment.external_reference !== charge.id ||
    Math.round(Number(payment.transaction_amount) * 100) !== charge.amount ||
    payment.currency_id !== "BRL" ||
    payment.payment_method_id !== "pix"
  )
    throw Error("A cobrança Pix não corresponde a esta venda.");
  return payment.status === "approved";
}
