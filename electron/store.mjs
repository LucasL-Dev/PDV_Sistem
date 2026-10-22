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
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
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
    return JSON.parse(
      this.db.prepare("SELECT data FROM state WHERE id=1").get().data,
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
    if (!u) fail("Entre no sistema.");
    if (admin && u.role !== "admin") fail("Acesso exclusivo do administrador.");
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
      audit: u.role === "admin" ? s.audit : [],
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
        "return",
        "closeShift",
        "deleteProduct",
        "deleteEmployee",
        "deleteSale",
        "deleteSalesDay",
      ].includes(action);
      const u = this.user(s, admin);
      let result;
      switch (action) {
        case "product": {
          const old = s.products.find((x) => x.id === p.id && !x.deletedAt);
          if (p.id && !old) fail("Produto não encontrado.");
          const product = {
            id: old?.id || randomUUID(),
            name: text(p.name),
            barcode: text(p.barcode),
            category: text(p.category),
            price: integer(p.price, 1),
            stock: integer(p.stock),
            ncm: p.ncm?.trim() || "",
            cfop: p.cfop?.trim() || "",
            csosn: p.csosn?.trim() || "",
          };
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
          const c = {
            id: old?.id || randomUUID(),
            name: text(p.name),
            document: p.document?.trim() || "",
            phone: p.phone?.trim() || "",
          };
          if (old) Object.assign(old, c);
          else s.customers.push(c);
          result = c;
          break;
        }
        case "employee": {
          const old = s.users.find((x) => x.id === p.id && !x.deletedAt);
          if (p.id && !old) fail("Funcionário não encontrado.");
          if (!["admin", "cashier"].includes(p.role)) fail("Perfil inválido.");
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
              product.stock += item.qty - item.returned;
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
          shift.movements.push({
            type: p.type,
            amount: integer(p.amount, 1),
            reason: text(p.reason),
            user: u.id,
            at: new Date().toISOString(),
          });
          break;
        }
        case "closeShift": {
          const shift = s.shifts.find((x) => !x.closedAt);
          if (!shift) fail("Caixa já fechado.");
          shift.counted = integer(p.counted);
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
            integer(i.qty, 1);
            if (product.stock < i.qty)
              fail("Estoque insuficiente: " + product.name);
            return { ...product, qty: i.qty, returned: 0 };
          });
          const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
          integer(subtotal);
          const discount = integer(p.discount);
          if (discount > subtotal) fail("Desconto maior que a venda.");
          const total = subtotal - discount;
          if (!Array.isArray(p.payments) || !p.payments.length)
            fail("Informe o pagamento.");
          const payments = p.payments.map((x) => {
            if (
              !["dinheiro", "pix", "credito", "debito", "outros"].includes(
                x.forma,
              )
            )
              fail("Pagamento inválido.");
            return { forma: x.forma, amount: integer(x.amount, 1) };
          });
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
          items.forEach(
            (i) =>
              (s.products.find((x) => x.id === i.id && !x.deletedAt).stock -=
                i.qty),
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
          };
          s.sales.push(result);
          break;
        }
        case "return": {
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
          const refundedBefore = sale.returns.reduce((a, r) => a + r.refund, 0);
          let refund = 0;
          for (const r of p.items) {
            if (seen.has(r.id)) fail("Item repetido.");
            seen.add(r.id);
            const item = sale.items.find((i) => i.id === r.id);
            if (!item) fail("Item não encontrado.");
            integer(r.qty, 1);
            if (r.qty > item.qty - item.returned)
              fail("Quantidade superior ao saldo.");
            const before = Math.round(
              item.price * item.returned * (sale.total / sale.subtotal),
            );
            item.returned += r.qty;
            const after = Math.round(
              item.price * item.returned * (sale.total / sale.subtotal),
            );
            refund += after - before;
            s.products.find((x) => x.id === item.id).stock += r.qty;
          }
          const all = sale.items.every((i) => i.qty === i.returned);
          if (sale.fiscal?.situacao === "cancelada" && !all)
            fail("Documento cancelado exige devolução integral.");
          refund =
            Math.round(
              (sale.items.reduce((a, i) => a + i.price * i.returned, 0) *
                sale.total) /
                sale.subtotal,
            ) - refundedBefore;
          if (all) refund = sale.total - refundedBefore;
          const r = {
            id: randomUUID(),
            at: new Date().toISOString(),
            user: u.id,
            reason,
            items: p.items,
            refund,
            shift: shift.id,
            method: p.method,
          };
          if (!["dinheiro", "pix", "credito", "debito"].includes(r.method))
            fail("Informe como o reembolso foi realizado.");
          sale.returns.push(r);
          result = r;
          break;
        }
        default:
          fail("Operação desconhecida.");
      }
      this.audit(s, u, action, result?.id || p.id || "");
      return result || true;
    });
  }
  cash(s, shift) {
    return (
      shift.opening +
      shift.movements.reduce(
        (a, m) => a + (m.type === "sangria" ? -m.amount : m.amount),
        0,
      ) +
      s.sales
        .filter((x) => !x.deletedAt && x.shift === shift.id)
        .reduce(
          (a, v) =>
            a +
            v.payments
              .filter((p) => p.forma === "dinheiro")
              .reduce((a, p) => a + p.amount, 0) -
            v.change,
          0,
        ) -
      s.sales
        .filter((v) => !v.deletedAt)
        .flatMap((v) => v.returns)
        .filter((r) => r.shift === shift.id && r.method === "dinheiro")
        .reduce((a, r) => a + r.refund, 0)
    );
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
          ncm: i.ncm,
          cfop: i.cfop,
          csosn: i.csosn,
          quantidade: i.qty,
          valorUnitario: i.price / 100,
        })),
        pagamentos: sale.payments.map((p) => ({
          forma: p.forma,
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
    });
  }
  close() {
    this.db.close();
  }
}
