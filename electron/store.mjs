import { held, fingerprint } from "./pix-flow.mjs";
import {
  prepare,
  extra,
  ranks,
  approve,
  qty,
  lineTotal,
  debt,
  credit,
  totals,
  proportional,
} from "./operations.mjs";
import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
const localDay = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fail = (message) => {
  throw new Error(message);
};
const integer = (v, min = 0) => {
  if (!Number.isSafeInteger(v) || v < min) fail("Valor inteiro inválido.");
  return v;
};
const text = (v, min = 1) => {
  if (typeof v !== "string" || v.trim().length < min || v.length > 500)
    fail("Preencha os campos corretamente.");
  return v.trim();
};
const hash = (password) => {
  text(password, 8);
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
};
const verify = (password, stored) => {
  const [salt, key] = stored.split(":");
  return (
    typeof password === "string" &&
    password.length <= 500 &&
    timingSafeEqual(Buffer.from(key, "hex"), scryptSync(password, salt, 64))
  );
};
export class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
    if (!this.db.prepare("SELECT id FROM state").get())
      this.db.prepare("INSERT INTO state VALUES(1,?)").run(
        JSON.stringify({
          products: [],
          customers: [],
          users: [],
          sales: [],
          shifts: [],
          audit: [],
        }),
      );
    this.session = null;
  }
  read() {
    return prepare(
      JSON.parse(
        this.db.prepare("SELECT data FROM state WHERE id=1").get().data,
      ),
    );
  }
  mutate(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const s = this.read();
      const result = fn(s);
      this.db
        .prepare("UPDATE state SET data=? WHERE id=1")
        .run(JSON.stringify(s));
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  user(s, admin = false) {
    const u = s.users.find((u) => u.id === this.session && u.active);
    if (!u || u.deletedAt || !Object.hasOwn(ranks, u.role))
      fail("Entre no sistema.");
    if (admin && (ranks[u.role] ?? -1) < 2)
      fail("Acesso restrito ao gerente ou administrador.");
    return u;
  }
  audit(s, u, action, details) {
    s.audit.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      user: u.id,
      action,
      details,
    });
  }
  snapshot() {
    const s = this.read();
    if (!s.users.length) return { setup: true };
    const u = this.user(s);
    return {
      ...s,
      products: s.products.filter((x) => !x.deletedAt),
      sales: s.sales.filter((x) => !x.deletedAt),
      users: s.users.map(({ password, ...u }) => u),
      me: { id: u.id, name: u.name, role: u.role },
      audit: ranks[u.role] >= 2 ? s.audit : [],
      shifts: s.shifts.map((shift) =>
        ranks[u.role] >= 2
          ? shift
          : (({
              expected,
              expectedPayments,
              divergences,
              countedPayments,
              counted,
              ...safe
            }) => safe)(shift),
      ),
      cancellations: ranks[u.role] >= 1 ? s.cancellations : [],
    };
  }
  call(action, p = {}) {
    if (action === "bootstrap")
      return this.mutate((s) => {
        if (s.users.length) fail("Administrador já configurado.");
        const u = {
          id: randomUUID(),
          name: text(p.name),
          login: text(p.login),
          password: hash(p.password),
          role: "admin",
          active: true,
        };
        s.users.push(u);
        this.audit(s, u, "bootstrap", u.id);
        this.session = u.id;
        return true;
      });
    if (action === "login") {
      const s = this.read(),
        u = s.users.find(
          (u) => u.login === p.login && u.active && !u.deletedAt,
        );
      if (!u || !verify(p.password, u.password))
        fail("Usuário ou senha incorretos.");
      this.session = u.id;
      return true;
    }
    if (action === "logout") {
      this.session = null;
      return true;
    }
    if (action === "status") return { setup: !this.read().users.length };
    if (action === "snapshot") return this.snapshot();
    return this.mutate((s) => {
      const admin = [
        "product",
        "customer",
        "employee",

        "deleteProduct",
        "deleteEmployee",
        "deleteSale",
        "deleteSalesDay",
      ].includes(action);
      const u = this.user(s, admin);
      let result;
      if (["employee", "deleteEmployee"].includes(action) && u.role !== "admin")
        fail("Somente o administrador pode gerenciar usuários.");
      const extension = extra(this, s, u, action, p);
      if (extension.handled) return extension.result;
      switch (action) {
        case "product": {
          const old = s.products.find((x) => x.id === p.id && !x.deletedAt);
          if (p.id && !old) fail("Produto não encontrado.");
          if (
            old &&
            s.pixCharges.some(
              (c) => held(c) && c.items.some((i) => i.id === old.id),
            )
          )
            fail(
              "Produto reservado por um Pix pendente. Confirme ou cancele a cobrança.",
            );
          const product = {
            id: old?.id || randomUUID(),
            name: text(p.name),
            barcode: text(p.barcode),
            category: text(p.category),
            price: integer(p.price, 1),
            unit: p.unit || old?.unit || "UN",
            stock: qty(p.stock, { signed: s.settings.stockPolicy === "warn" }),
            ncm: p.ncm?.trim() || "",
            cfop: p.cfop?.trim() || "",
            csosn: p.csosn?.trim() || "",
          };
          if (!["UN", "KG", "M", "L", "CX", "FD"].includes(product.unit))
            fail("Unidade inválida.");
          if (
            !["KG", "M", "L"].includes(product.unit) &&
            !Number.isInteger(product.stock)
          )
            fail("Esta unidade exige quantidade inteira.");
          if (
            s.products.some(
              (x) =>
                x.barcode === product.barcode &&
                x.id !== product.id &&
                !x.deletedAt,
            )
          )
            fail("Código de barras já cadastrado.");
          if (old) Object.assign(old, product);
          else s.products.push(product);
          result = product;
          break;
        }
        case "customer": {
          const old = s.customers.find((x) => x.id === p.id);
          if (
            old &&
            s.pixCharges.some((c) => held(c) && c.checkout.customer === old.id)
          )
            fail(
              "Cliente vinculado a cobrança Pix pendente. Confirme ou cancele antes de editar.",
            );
          const c = {
            id: old?.id || randomUUID(),
            name: text(p.name),
            document: p.document?.trim() || "",
            phone: p.phone?.trim() || "",
            creditLimit: integer(p.creditLimit ?? old?.creditLimit ?? 0),
          };
          if (old) Object.assign(old, c);
          else s.customers.push(c);
          result = c;
          break;
        }
        case "employee": {
          const old = s.users.find((x) => x.id === p.id && !x.deletedAt);
          if (p.id && !old) fail("Funcionário não encontrado.");
          if (!Object.hasOwn(ranks, p.role)) fail("Perfil inválido.");
          if (
            s.users.some(
              (x) => x.login === p.login && x.id !== p.id && !x.deletedAt,
            )
          )
            fail("Login já utilizado.");
          if (old?.id === u.id && (!p.active || p.role !== "admin"))
            fail("Não remova seu próprio acesso de administrador.");
          const employee = {
            id: old?.id || randomUUID(),
            name: text(p.name),
            login: text(p.login),
            role: p.role,
            active: p.active !== false,
            password: p.password ? hash(p.password) : old?.password,
          };
          if (!employee.password) fail("Defina uma senha com 8 caracteres.");
          if (old) Object.assign(old, employee);
          else s.users.push(employee);
          break;
        }
        case "deleteProduct": {
          if (
            s.pixCharges.some(
              (c) => held(c) && c.items.some((i) => i.id === p.id),
            )
          )
            fail("Produto reservado por cobrança Pix pendente.");
          const product = s.products.find((x) => x.id === p.id && !x.deletedAt);
          if (!product) fail("Produto não encontrado.");
          product.deletedAt = new Date().toISOString();
          product.deletedBy = u.id;
          result = { id: product.id };
          break;
        }
        case "deleteEmployee": {
          const employee = s.users.find((x) => x.id === p.id && !x.deletedAt);
          if (!employee) fail("Funcionário não encontrado.");
          if (employee.id === u.id)
            fail("Você não pode excluir seu próprio usuário.");
          employee.deletedAt = new Date().toISOString();
          employee.deletedBy = u.id;
          employee.active = false;
          result = { id: employee.id };
          break;
        }
        case "deleteSale":
        case "deleteSalesDay": {
          const today = localDay(new Date());
          let sales;
          if (action === "deleteSalesDay") {
            if (p.day !== today)
              fail("Só é possível excluir vendas do dia atual.");
            sales = s.sales.filter(
              (v) => !v.deletedAt && localDay(v.at) === today,
            );
            if (
              !Array.isArray(p.ids) ||
              !sales.length ||
              sales.length !== p.ids.length ||
              new Set(p.ids).size !== p.ids.length ||
              sales.some((v) => !p.ids.includes(v.id))
            )
              fail(
                "A lista de vendas mudou. Feche a confirmação e confira novamente.",
              );
          } else {
            sales = [s.sales.find((v) => v.id === p.id && !v.deletedAt)];
            if (!sales[0]) fail("Venda não encontrada.");
          }
          // Valide o lote inteiro antes de estornar qualquer item.
          for (const v of sales) {
            if (
              s.receivables.some((d) => d.sale === v.id) ||
              v.creditSpent?.length ||
              s.storeCredits.some((c) => c.sale === v.id)
            )
              fail(
                "Venda vinculada à caderneta ou crédito. Use devolução e preserve o financeiro.",
              );
            if (localDay(v.at) !== today)
              fail("Só é possível excluir vendas do dia atual.");
            const shift = s.shifts.find((c) => c.id === v.shift);
            if (!shift || shift.closedAt)
              fail("Não é possível excluir vendas de um caixa já fechado.");
            if (
              v.fiscal &&
              !["cancelada", "rejeitada"].includes(v.fiscal.situacao)
            )
              fail(
                "Regularize o documento fiscal antes de excluir esta venda.",
              );
            if (v.returns.some((r) => r.shift !== v.shift))
              fail(
                "Esta venda tem devoluções em outro caixa. Preserve o histórico.",
              );
          }
          for (const v of sales) {
            for (const item of v.items) {
              const product = s.products.find((x) => x.id === item.id);
              if (!product) fail("Produto da venda não encontrado.");
              product.stock = qty(product.stock + item.qty - item.returned, {
                signed: true,
              });
            }
            v.deletedAt = new Date().toISOString();
            v.deletedBy = u.id;
          }
          result = {
            id: sales.map((v) => v.id).join(","),
            count: sales.length,
          };
          break;
        }
        case "openShift":
          if (s.shifts.some((x) => !x.closedAt))
            fail("Já existe um caixa aberto.");
          result = {
            id: randomUUID(),
            user: u.id,
            openedAt: new Date().toISOString(),
            opening: integer(p.opening),
            movements: [],
          };
          s.shifts.push(result);
          break;
        case "movement": {
          const shift = s.shifts.find((x) => !x.closedAt);
          if (!shift) fail("Abra o caixa.");
          if (!["sangria", "suprimento"].includes(p.type))
            fail("Movimento inválido.");
          const movement = {
            id: randomUUID(),
            type: p.type,
            amount: integer(p.amount, 1),
            reason: text(p.reason),
            user: u.id,
            at: new Date().toISOString(),
          };
          shift.movements.push(movement);
          result = movement;
          break;
        }
        case "closeShift": {
          const shift = s.shifts.find((x) => !x.closedAt);
          if (!shift) fail("Caixa já fechado.");
          if (s.pixCharges.some((c) => held(c) && c.shift === shift.id))
            fail("Confirme ou cancele o Pix pendente antes de fechar o caixa.");
          const entered = p.countedPayments || {
            dinheiro: p.counted,
            pix: 0,
            credito: 0,
            debito: 0,
            fiado: 0,
          };
          shift.countedPayments = Object.fromEntries(
            ["dinheiro", "pix", "credito", "debito", "fiado"].map((m) => [
              m,
              integer(entered[m]),
            ]),
          );
          shift.expectedPayments = totals(s, shift);
          shift.divergences = Object.fromEntries(
            Object.entries(shift.countedPayments).map(([m, value]) => [
              m,
              value - shift.expectedPayments[m],
            ]),
          );
          shift.counted = shift.countedPayments.dinheiro;
          shift.expected = this.cash(s, shift);
          shift.closedAt = new Date().toISOString();
          shift.closedBy = u.id;
          break;
        }
        case "sale": {
          if (typeof p.id !== "string" || !p.id.match(/^[a-zA-Z0-9-]{16,64}$/))
            fail("Identificador inválido.");
          const existing = s.sales.find((x) => x.id === p.id);
          if (existing) {
            if (existing.deletedAt)
              fail("Esta venda foi excluída. Inicie uma nova venda.");
            return existing;
          }
          const shift = s.shifts.find((x) => !x.closedAt);
          if (!shift) fail("Abra o caixa antes de vender.");
          if (!Array.isArray(p.items) || !p.items.length)
            fail("Carrinho vazio.");
          const ids = new Set();
          const items = p.items.map((i) => {
            if (ids.has(i.id)) fail("Produto duplicado.");
            ids.add(i.id);
            const product = s.products.find(
              (x) => x.id === i.id && !x.deletedAt,
            );
            if (!product) fail("Produto não encontrado.");
            qty(i.qty, {
              fraction: ["KG", "M", "L"].includes(product.unit || "UN"),
            });
            if (i.qty <= 0) fail("Quantidade deve ser maior que zero.");
            const reserved = s.pixCharges
              .filter(
                (c) => held(c) && c.id !== p.pixChargeId && c.saleId !== p.id,
              )
              .reduce(
                (a, c) =>
                  a +
                  c.items
                    .filter((x) => x.id === product.id)
                    .reduce((n, x) => n + x.qty, 0),
                0,
              );
            if (
              s.settings.stockPolicy === "block" &&
              Math.round(product.stock * 1000) - Math.round(reserved * 1000) <
                Math.round(i.qty * 1000)
            )
              fail("Estoque insuficiente: " + product.name);
            return { ...product, qty: i.qty, returned: 0 };
          });
          const subtotal = items.reduce(
            (a, i) => a + lineTotal(i.price, i.qty),
            0,
          );
          integer(subtotal, 1);
          const discount = integer(p.discount);
          if (discount > subtotal) fail("Desconto maior que a venda.");
          const authorizer =
            discount > Math.floor((subtotal * s.settings.discountLimit) / 100)
              ? this.pixApproval
                ? s.users.find(
                    (a) =>
                      a.id === this.pixApproval && a.active && !a.deletedAt,
                  ) || approve(s, u, p)
                : approve(s, u, p)
              : u;
          const total = subtotal - discount;
          if (!Array.isArray(p.payments) || !p.payments.length)
            fail("Informe o pagamento.");
          const payments = p.payments.map((x) => {
            if (
              ![
                "dinheiro",
                "pix",
                "credito",
                "debito",
                "outros",
                "fiado",
                "creditoloja",
              ].includes(x.forma)
            )
              fail("Pagamento inválido.");
            return { forma: x.forma, amount: integer(x.amount, 1) };
          });
          const pixAmount = payments
            .filter((x) => x.forma === "pix")
            .reduce((a, x) => a + x.amount, 0);
          if (
            !this.simulation &&
            pixAmount &&
            (s.settings.pixEnabled ||
              p.pixChargeId ||
              s.pixCharges.some((c) => held(c) && c.saleId === p.id))
          ) {
            const charge = s.pixCharges.find(
              (c) => c.id === p.pixChargeId && c.status === "approved",
            );
            if (
              !charge ||
              charge.amount !== pixAmount ||
              charge.fingerprint !== fingerprint(p)
            )
              fail(
                "Confirme o pagamento Pix pelo Mercado Pago antes de concluir.",
              );
          }
          const paid = payments.reduce((a, x) => a + x.amount, 0);
          integer(paid);
          if (paid < total) fail("Pagamento insuficiente.");
          const change = paid - total;
          if (
            change >
            payments
              .filter((x) => x.forma === "dinheiro")
              .reduce((a, x) => a + x.amount, 0)
          )
            fail("Troco só pode sair do pagamento em dinheiro.");
          if (p.customer && !s.customers.some((x) => x.id === p.customer))
            fail("Cliente inexistente.");
          const creditPayment = payments
            .filter((x) => x.forma === "creditoloja")
            .reduce((a, x) => a + x.amount, 0);
          const deferred = payments
            .filter((x) => x.forma === "fiado")
            .reduce((a, x) => a + x.amount, 0);
          if (deferred || creditPayment) {
            const customer = s.customers.find((c) => c.id === p.customer);
            if (!customer)
              fail("Selecione um cliente para fiado ou crédito da loja.");
            const pending = s.pixCharges.filter(
              (c) =>
                held(c) &&
                c.saleId !== p.id &&
                c.checkout.customer === customer.id,
            );
            const reservedDebt = pending.reduce(
              (a, c) =>
                a +
                c.checkout.payments
                  .filter((x) => x.forma === "fiado")
                  .reduce((n, x) => n + x.amount, 0),
              0,
            );
            const reservedCredit = pending.reduce(
              (a, c) =>
                a +
                c.checkout.payments
                  .filter((x) => x.forma === "creditoloja")
                  .reduce((n, x) => n + x.amount, 0),
              0,
            );
            if (
              deferred + debt(s, customer.id) + reservedDebt >
              (customer.creditLimit || 0)
            )
              fail("Limite de crédito do cliente excedido.");
            if (creditPayment > credit(s, customer.id) - reservedCredit)
              fail("Saldo de crédito da loja insuficiente.");
          }
          const creditSpent = [];
          let spend = creditPayment;
          for (const account of s.storeCredits.filter(
            (c) => c.customer === p.customer && c.balance > 0,
          )) {
            const used = Math.min(spend, account.balance);
            account.balance -= used;
            spend -= used;
            if (used) creditSpent.push({ id: account.id, amount: used });
          }
          if (deferred)
            s.receivables.push({
              id: randomUUID(),
              sale: p.id,
              customer: p.customer,
              total: deferred,
              balance: deferred,
              at: new Date().toISOString(),
            });
          items.forEach(
            (i) =>
              (s.products.find((x) => x.id === i.id && !x.deletedAt).stock =
                qty(s.products.find((x) => x.id === i.id).stock - i.qty, {
                  signed: true,
                })),
          );
          result = {
            id: p.id,
            number: s.sales.length + 1,
            at: new Date().toISOString(),
            user: u.id,
            shift: shift.id,
            customer: p.customer || null,
            items,
            subtotal,
            discount,
            total,
            payments,
            change,
            returns: [],
            fiscal: null,
            creditSpent,
            authorizedBy: authorizer.id,
            warnings: items
              .filter((i) => i.stock < i.qty)
              .map((i) => `Estoque insuficiente: ${i.name}`),
          };
          s.sales.push(result);
          if (p.pixChargeId) {
            const c = s.pixCharges.find((c) => c.id === p.pixChargeId);
            c.status = "completed";
            c.sale = result.id;
          }
          break;
        }
        case "return": {
          const authorized = approve(s, u, p);
          const sale = s.sales.find((x) => x.id === p.id && !x.deletedAt);
          if (!sale) fail("Venda inexistente.");
          if (
            sale.fiscal &&
            !["cancelada", "rejeitada"].includes(sale.fiscal.situacao)
          )
            fail(
              "Regularize o documento fiscal e sua devolução com o contador antes de alterar esta venda.",
            );
          const shift = s.shifts.find((x) => !x.closedAt);
          if (!shift) fail("Abra o caixa para registrar o reembolso.");
          const reason = text(p.reason, 5);
          if (!Array.isArray(p.items) || !p.items.length)
            fail("Selecione os itens.");
          const seen = new Set();
          const refundedBefore = sale.returns.reduce(
            (a, r) => a + (r.value ?? r.refund),
            0,
          );
          let refund = 0;
          for (const r of p.items) {
            if (seen.has(r.id)) fail("Item repetido.");
            seen.add(r.id);
            const item = sale.items.find((i) => i.id === r.id);
            if (!item) fail("Item não encontrado.");
            qty(r.qty, {
              fraction: ["KG", "M", "L"].includes(item.unit || "UN"),
            });
            if (r.qty <= 0) fail("Quantidade inválida.");
            if (
              Math.round(r.qty * 1000) >
              Math.round((item.qty - item.returned) * 1000)
            )
              fail("Quantidade superior ao saldo.");
            item.returned = qty(item.returned + r.qty);
            s.products.find((x) => x.id === item.id).stock = qty(
              s.products.find((x) => x.id === item.id).stock + r.qty,
              { signed: true },
            );
          }
          const all = sale.items.every((i) => i.qty === i.returned);
          if (sale.fiscal?.situacao === "cancelada" && !all)
            fail("Documento cancelado exige devolução integral.");
          refund =
            proportional(
              sale.total,
              sale.items.reduce(
                (a, i) => a + lineTotal(i.price, i.returned),
                0,
              ),
              sale.subtotal,
            ) - refundedBefore;
          if (all) refund = sale.total - refundedBefore;
          const value = refund;
          const account = s.receivables.find((d) => d.sale === sale.id);
          const debtReduction = Math.min(refund, account?.balance || 0);
          if (account) account.balance -= debtReduction;
          refund -= debtReduction;
          if (p.method === "creditoloja") {
            if (!sale.customer)
              fail("Vincule a venda a um cliente para gerar crédito de troca.");
            if (refund)
              s.storeCredits.push({
                id: randomUUID(),
                customer: sale.customer,
                sale: sale.id,
                total: refund,
                balance: refund,
                at: new Date().toISOString(),
              });
          }
          const r = {
            value,
            debtReduction,
            authorizedBy: authorized.id,
            id: randomUUID(),
            at: new Date().toISOString(),
            user: u.id,
            reason,
            items: p.items,
            refund,
            shift: shift.id,
            method: p.method,
          };
          if (
            !["dinheiro", "pix", "credito", "debito", "creditoloja"].includes(
              r.method,
            )
          )
            fail("Informe como o reembolso foi realizado.");
          sale.returns.push(r);
          result = r;
          break;
        }
        default:
          fail("Operação desconhecida.");
      }
      this.audit(s, u, action, {
        id: result?.id || p.id || "",
        authorizedBy: result?.authorizedBy || u.id,
      });
      return result || true;
    });
  }
  cash(s, shift) {
    return totals(s, shift).dinheiro;
  }
  fiscalPayload(id) {
    const s = this.read();
    this.user(s);
    const sale = s.sales.find((v) => v.id === id && !v.deletedAt);
    if (!sale || sale.returns.length) fail("Venda inexistente ou devolvida.");
    if (
      sale.items.some(
        (i) =>
          !/^\d{8}$/.test(i.ncm) ||
          !/^\d{4}$/.test(i.cfop) ||
          !/^\d{3}$/.test(i.csosn),
      )
    )
      fail("Cadastre NCM, CFOP e CSOSN dos produtos com seu contador.");
    return {
      venda: {
        itens: sale.items.map((i) => ({
          codigo: i.id,
          descricao: i.name,
          unidade: i.unit || "UN",
          ncm: i.ncm,
          cfop: i.cfop,
          csosn: i.csosn,
          quantidade: i.qty,
          valorUnitario: i.price / 100,
        })),
        pagamentos: sale.payments.map((p) => ({
          forma: ["fiado", "creditoloja"].includes(p.forma)
            ? "credito-loja"
            : p.forma,
          valor: p.amount / 100,
          integrado: false,
        })),
        desconto: sale.discount / 100,
      },
      referencia: id,
    };
  }
  recordFiscal(id, result) {
    this.mutate((s) => {
      const sale = s.sales.find((v) => v.id === id && !v.deletedAt);
      if (!sale) fail("Venda não encontrada.");
      sale.fiscal = result;
      this.audit(s, { id: this.session || "sistema" }, "fiscal.result", {
        sale: id,
        status: result?.situacao || "sem-documento",
      });
    });
  }
  close() {
    this.db.close();
  }
}
