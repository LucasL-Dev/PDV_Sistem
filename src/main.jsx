import {
  ApprovalFields,
  authorization,
  ThemeSelect,
  Settings,
  Accounts,
  ShiftReports,
  PixPanel,
  labels,
} from "./Operations.jsx";
import { fractional, lineValue, scaleBarcode } from "./pos-utils.js";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ProvedorFiscal,
  ConfigurarEmissor,
  ListaNotas,
  RelatorioContador,
  criarClienteFiscal,
  fetchPeloIpc,
} from "@fiscal/ui";
import "@fiscal/ui/estilos.css";
import "./style.css";
import logo from "../assets/brand/icon-256.png";
const api = window.pdv;
const fiscal = criarClienteFiscal({
  url: "fiscal://local",
  fetch: fetchPeloIpc(window.fiscal.chamar),
});
const money = (n) =>
  ((n || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const cents = (v) => {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) throw Error("Valor inválido.");
  return Math.round(n * 100);
};
const date = (v) => new Date(v).toLocaleString("pt-BR");
const localDay = (v) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fields = (f) => Object.fromEntries(new FormData(f));
const nav = [
  ["caixa", "caixa", "Frente de caixa"],
  ["produtos", "produtos", "Produtos e estoque"],
  ["clientes", "clientes", "Clientes"],
  ["vendas", "vendas", "Vendas e devoluções"],
  ["relatorios", "relatorios", "Relatórios"],
  ["equipe", "equipe", "Funcionários"],
  ["fiscal", "fiscal", "Documentos fiscais"],
  ["accounts", "clientes", "Caderneta e trocas"],
  ["settings", "produtos", "Configurações"],
];
const iconPaths = {
  caixa: "M3 3h18v18H3z M3 9h18 M9 9v12",
  produtos: "m12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9",
  clientes: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  vendas: "M4 17 10 11 14 15 21 5 M15 5h6v6",
  relatorios: "M4 20h17 M7 16v-5 M12 16V5 M17 16V8",
  equipe:
    "M16 21v-2a6 6 0 0 0-12 0v2 M10 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M17 4a4 4 0 0 1 0 7 M20 21v-2a6 6 0 0 0-3-5",
  fiscal: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
};
function Icon({ name }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name] || iconPaths.caixa} />
    </svg>
  );
}
function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    ref.current
      .querySelector("input:not([type=hidden]),select,textarea")
      ?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="panel-title">
        <h2>{title}</h2>
        <button aria-label="Fechar janela" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Input({ label, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function App() {
  const [s, setS] = useState(null),
    [setup, setSetup] = useState(false),
    [page, setPage] = useState("caixa"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [cart, setCart] = useState([]),
    [query, setQuery] = useState(""),
    [customer, setCustomer] = useState(""),
    [discount, setDiscount] = useState("0"),
    [payments, setPayments] = useState([{ forma: "dinheiro", value: "" }]),
    [saleId, setSaleId] = useState(crypto.randomUUID()),
    [editing, setEditing] = useState(null),
    [selected, setSelected] = useState(null),
    [day, setDay] = useState(localDay(new Date())),
    [fiscalTab, setFiscalTab] = useState("config"),
    [ambiente, setAmbiente] = useState(2),
    [shiftOpen, setShiftOpen] = useState(false),
    [paymentOpen, setPaymentOpen] = useState(false),
    [deletion, setDeletion] = useState(null),
    [theme, setTheme] = useState(
      () => localStorage.getItem("omnipdv-theme") || "system",
    ),
    [operation, setOperation] = useState(null),
    [activeItem, setActiveItem] = useState(null),
    [approval, setApproval] = useState({ login: "", password: "" }),
    [activeCharge, setActiveCharge] = useState(null);
  const searchRef = useRef(null);
  const saleRef = useRef(saleId);
  saleRef.current = saleId;
  useEffect(() => {
    localStorage.setItem("omnipdv-theme", theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (page === "caixa" && s?.me && !document.querySelector("dialog[open]"))
      searchRef.current?.focus();
  }, [page, s?.me?.id]);
  useEffect(() => {
    api
      .call("status")
      .then((r) => setSetup(r.setup))
      .catch((e) => setError(e.message));
  }, []);
  const refresh = async () => setS(await api.call("snapshot"));
  useEffect(() => {
    if (!s?.me) return;
    const timer = setInterval(() => {
      if (!document.querySelector("dialog[open]")) refresh().catch(() => {});
    }, 12000);
    return () => clearInterval(timer);
  }, [s?.me?.id]);
  const run = async (fn, msg = "Operação concluída.") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      if (s && !result?.signedOut) await refresh();
      setShiftOpen(false);
      setNotice(typeof result === "string" ? result : msg);
    } catch (e) {
      setError(e.message);
      if (s) {
        try {
          await refresh();
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  };
  const act = (name, p) => api.call(name, p);
  const admin = ["admin", "manager"].includes(s?.me.role);
  const shift = s?.shifts.find((x) => !x.closedAt);
  const checkoutLocked = Boolean(
    s?.pixCharges.some(
      (c) =>
        c.saleId === saleId &&
        ["creating", "pending", "approved", "recovery"].includes(c.status),
    ),
  );
  const add = (p, quantity) => {
    if (checkoutLocked) {
      setError("Confirme ou cancele o Pix antes de alterar o carrinho.");
      return;
    }
    if (quantity === undefined && fractional(p)) {
      setOperation({ type: "add", product: p });
      return;
    }
    const n = quantity ?? 1;
    if (!Number.isFinite(n) || n <= 0) return;
    setCart((c) => {
      const old = c.find((i) => i.id === p.id),
        value = Math.round(((old?.qty || 0) + n) * 1000) / 1000;
      if (value > p.stock && s.settings.stockPolicy === "block") {
        setError("Estoque insuficiente: " + p.name);
        return c;
      }
      if (value > p.stock)
        setNotice("Atenção: venda com estoque insuficiente.");
      setActiveItem(p.id);
      return old
        ? c.map((i) => (i.id === p.id ? { ...i, qty: value } : i))
        : [...c, { ...p, qty: n }];
    });
    queueMicrotask(() => searchRef.current?.focus());
  };
  const changeQty = (i, value) =>
    !checkoutLocked && setOperation({ type: "quantity", product: i, value });
  const finishSale = (v) => {
    setCart([]);
    setPaymentOpen(false);
    setPayments([{ forma: "dinheiro", value: "" }]);
    setDiscount("0");
    setApproval({ login: "", password: "" });
    setActiveCharge(null);
    setSaleId(crypto.randomUUID());
    setSelected(v.id);
    setPage("vendas");
  };
  useEffect(() => {
    if (!cart.length) return;
    const charge = s?.pixCharges.find(
      (c) => c.saleId === saleId && c.status === "completed",
    );
    if (charge) {
      const sale = s.sales.find((v) => v.id === charge.sale);
      if (sale) {
        finishSale(sale);
        setError("");
        setNotice("Pix confirmado e venda concluída automaticamente.");
      }
    }
  }, [s?.pixCharges]);
  const checkout = {
    id: saleId,
    items: cart.map((i) => ({ id: i.id, qty: i.qty })),
    customer,
    discount: cents(discount),
    payments: payments.map((p) => ({ forma: p.forma, amount: cents(p.value) })),
    approval,
  };
  const subtotal = cart.reduce((a, i) => a + lineValue(i.price, i.qty), 0),
    total = subtotal - (Number(discount.replace(",", ".")) * 100 || 0),
    paid = payments.reduce(
      (a, p) => a + (Number(p.value.replace(",", ".")) * 100 || 0),
      0,
    );
  const saveSale = () =>
    run(async () => {
      const v = await act("sale", checkout);
      finishSale(v);
      if (v.warnings?.length)
        return "Venda concluída com alerta: " + v.warnings.join("; ");
    }, "Venda concluída. Estoque atualizado; recibo e emissão fiscal disponíveis.");
  const remove = () =>
    run(async () => {
      const request = deletion;
      const result = await act(request.action, request.payload);
      if (request.action === "deleteProduct")
        setCart((items) => items.filter((i) => i.id !== request.payload.id));
      if (["deleteSale", "deleteSalesDay"].includes(request.action))
        setSelected(null);
      setEditing(null);
      setDeletion(null);
      return result.count
        ? `${result.count} venda(s) excluída(s). Estoque e caixa atualizados.`
        : "Registro excluído.";
    });
  const selectedSale = s?.sales.find((v) => v.id === selected);
  const fiscalEmit = (id) =>
    run(async () => {
      const r = await api.emit(id);
      await refresh();
      return `NFC-e: ${r.situacao}. ${r.motivo || ""}`;
    }, "Consulte o resultado fiscal na venda.");
  useLayoutEffect(() => {
    const key = (e) => {
      if (!s) return;
      const dialog = document.querySelector("dialog[open]");
      if (dialog) {
        if (e.key === "F2" && paymentOpen) {
          e.preventDefault();
          if (
            !s.settings.pixEnabled ||
            !payments.some((p) => p.forma === "pix")
          )
            saveSale();
        }
        return;
      }
      if (page !== "caixa") return;
      if (checkoutLocked && ["F3", "F4", "F12", "Escape"].includes(e.key)) {
        e.preventDefault();
        setError("Confirme ou cancele o Pix antes de alterar a venda.");
        return;
      }
      const last = cart.find((i) => i.id === activeItem) || cart.at(-1);
      if (["F1", "F2", "F3", "F4", "F6", "F12", "Escape"].includes(e.key))
        e.preventDefault();
      switch (e.key) {
        case "F1":
          searchRef.current?.focus();
          break;
        case "F2":
          if (cart.length && shift) setPaymentOpen(true);
          break;
        case "F3":
          if (last) setOperation({ type: "cancel", product: last });
          break;
        case "F4":
          document.querySelector(".sale-options").open = true;
          document.querySelector(".sale-options input")?.focus();
          break;
        case "F6":
          setOperation({ type: "lookup" });
          break;
        case "F12":
          if (last) changeQty(last, last.qty);
          break;
        case "Escape":
          if (cart.length) setOperation({ type: "cancelAll" });
          break;
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const confirmOperation = (form) => {
    const data = fields(form),
      op = operation;
    run(async () => {
      if (op.type === "lookup") return;
      if (op.type === "add") {
        add(op.product, Number(data.qty));
        setOperation(null);
        return "Quantidade adicionada.";
      }
      const current = cart.find((i) => i.id === op.product?.id);
      const value = op.type === "quantity" ? Number(data.qty) : 0;
      if (
        op.type === "quantity" &&
        (!Number.isFinite(value) ||
          value < 0 ||
          Math.abs(value * 1000 - Math.round(value * 1000)) > 0.00001 ||
          (!fractional(current) && !Number.isInteger(value)))
      )
        throw Error("Quantidade inválida.");
      if (
        op.type === "quantity" &&
        value > current.stock &&
        s.settings.stockPolicy === "block"
      )
        throw Error("Estoque insuficiente.");
      const removed =
        op.type === "cancelAll"
          ? cart
          : current && value < current.qty
            ? [
                {
                  ...current,
                  qty: Math.round((current.qty - value) * 1000) / 1000,
                },
              ]
            : [];
      if (removed.length)
        await act("cancelDraft", {
          draftId: saleId,
          items: removed.map((i) => ({ id: i.id, qty: i.qty })),
          reason: data.reason,
          approval: authorization(data),
        });
      setCart((c) =>
        op.type === "cancelAll"
          ? []
          : c
              .map((i) => (i.id === current.id ? { ...i, qty: value } : i))
              .filter((i) => i.qty > 0),
      );
      setOperation(null);
      if (op.type === "cancelAll") setSaleId(crypto.randomUUID());
      queueMicrotask(() => searchRef.current?.focus());
      return op.type === "quantity" && value > current.stock
        ? "Quantidade alterada. Atenção: estoque insuficiente."
        : "Operação registrada.";
    });
  };
  if (!s)
    return (
      <div className="auth">
        <ThemeSelect value={theme} onChange={setTheme} />
        <div className="brand">
          <img className="brand-mark" src={logo} alt="" /> OmniPDV
        </div>
        <div className="auth-card">
          <small>ACESSO À SUA LOJA</small>
          <h1>{setup ? "Crie o administrador" : "Bem-vindo de volta"}</h1>
          <p>
            {setup
              ? "Configure o primeiro acesso. Não há senha padrão."
              : "Entre para iniciar sua operação."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await act(
                  setup ? "bootstrap" : "login",
                  fields(e.currentTarget),
                );
                setSetup(false);
                await refresh();
              });
            }}
          >
            {setup && <Input label="Nome" name="name" required />}
            <Input
              label="Usuário"
              name="login"
              autoComplete="username"
              required
            />
            <Input
              label="Senha"
              name="password"
              type="password"
              minLength={setup ? 8 : 1}
              autoComplete={setup ? "new-password" : "current-password"}
              required
            />
            <button disabled={busy} className="primary">
              {setup ? "Criar administrador" : "Entrar no caixa"} →
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <p className="muted">Aplicativo local • Seus dados neste computador</p>
      </div>
    );
  return (
    <ProvedorFiscal cliente={fiscal}>
      <div className="shell">
        <aside>
          <div className="brand">
            <img className="brand-mark" src={logo} alt="" />
            <div>
              OmniPDV<small>Gestão da loja</small>
            </div>
          </div>
          <small className="section-label">MENU</small>
          <nav>
            {nav
              .filter(([id]) =>
                ["settings", "equipe"].includes(id)
                  ? s.me.role === "admin"
                  : ["produtos", "clientes", "relatorios", "fiscal"].includes(
                        id,
                      )
                    ? admin
                    : true,
              )
              .map(([id, icon, title]) => (
                <button
                  className={page === id ? "active" : ""}
                  key={id}
                  onClick={() => {
                    setPage(id);
                    setEditing(null);
                    setQuery("");
                    setNotice("");
                    setError("");
                  }}
                >
                  <Icon name={icon} />
                  {title}
                </button>
              ))}
          </nav>
          <div className="side-bottom">
            <b>{s.me.name}</b>
            <small>
              {
                {
                  admin: "Administrador",
                  manager: "Gerente",
                  supervisor: "Supervisor",
                  cashier: "Operador de caixa",
                }[s.me.role]
              }
            </small>
            <button
              onClick={() =>
                run(async () => {
                  await act("logout");
                  setS(null);
                  setPage("caixa");
                  setPaymentOpen(false);
                  setOperation(null);
                  setActiveCharge(null);
                  setSetup(false);
                  setCart([]);
                  setSelected(null);
                  return { signedOut: true };
                })
              }
            >
              Sair da conta
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header>
            <div>
              <span className="muted">Minha loja</span>
            </div>
            <div>
              <span className={"badge " + (shift ? "green" : "")}>
                {shift ? "● Caixa aberto" : "○ Caixa fechado"}
              </span>
              <ThemeSelect value={theme} onChange={setTheme} />
              <span className="avatar">{s.me.name[0].toUpperCase()}</span>
            </div>
          </header>
          <main
            onClick={(e) => {
              if (
                page === "caixa" &&
                !e.target.closest(
                  "button,input,select,textarea,label,summary,dialog,a",
                )
              )
                searchRef.current?.focus();
            }}
          >
            <div className="title">
              <div>
                <h1>{nav.find((n) => n[0] === page)?.[2]}</h1>
                <p>
                  {page === "caixa"
                    ? "Busque os produtos e conclua a venda."
                    : {
                        produtos:
                          "Preços, quantidades e dados dos seus produtos.",
                        clientes: "Cadastro e histórico de compras.",
                        vendas: "Consulte vendas, recibos e devoluções.",
                        relatorios: "Acompanhe os resultados da loja.",
                        equipe: "Gerencie os acessos da sua equipe.",
                        fiscal:
                          "Configure a emissão e consulte seus documentos.",
                      }[page]}
                </p>
              </div>
              <span className="muted">
                {new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}
              </span>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
                <button onClick={() => setError("")}>×</button>
              </div>
            )}
            {notice && (
              <div role="status" className="notice">
                {notice}
                <button onClick={() => setNotice("")}>×</button>
              </div>
            )}
            {page === "caixa" && (
              <>
                <div className="cash-tools">
                  <div>
                    <span
                      className={"status-dot " + (shift ? "is-open" : "")}
                    />
                    <b>
                      {shift
                        ? "Caixa em operação"
                        : "Abra o caixa para começar"}
                    </b>
                    <span className="shift-meta">
                      {shift
                        ? `Fundo inicial: ${money(shift.opening)}`
                        : "Informe o fundo inicial antes de registrar vendas."}
                    </span>
                  </div>
                  <button
                    className={shift ? "" : "primary"}
                    onClick={() => setShiftOpen(true)}
                  >
                    {shift ? "Gerenciar caixa" : "Abrir caixa"}
                  </button>
                </div>
                {shiftOpen && (
                  <Modal
                    title={shift ? "Gerenciar caixa" : "Abertura do caixa"}
                    onClose={() => setShiftOpen(false)}
                  >
                    {error && (
                      <p role="alert" className="error">
                        {error}
                      </p>
                    )}
                    {!shift ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const p = fields(e.currentTarget);
                          run(
                            () =>
                              act("openShift", { opening: cents(p.opening) }),
                            "Caixa aberto. Você já pode vender.",
                          );
                        }}
                      >
                        <Input
                          label="Fundo de abertura (R$)"
                          name="opening"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue="0"
                          required
                        />
                        <button className="primary" disabled={busy}>
                          Abrir caixa
                        </button>
                      </form>
                    ) : (
                      <>
                        <p className="muted">
                          Aberto em {date(shift.openedAt)} · Fundo{" "}
                          {money(shift.opening)}
                        </p>
                        <h3>Movimentar dinheiro</h3>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const p = fields(e.currentTarget);
                            run(async () => {
                              const r = await act("movement", {
                                ...p,
                                amount: cents(p.amount),
                              });
                              try {
                                await api.document(
                                  "movement",
                                  r.id,
                                  Boolean(s.settings.thermalHost),
                                );
                              } catch (error) {
                                throw Error(
                                  "Movimento registrado. Falha ao imprimir: " +
                                    error.message +
                                    " Reimprima em Gerenciar caixa.",
                                );
                              }
                            }, "Movimento registrado.");
                          }}
                        >
                          <label>
                            Tipo de movimento
                            <select name="type">
                              <option value="sangria">
                                Sangria — retirar dinheiro
                              </option>
                              <option value="suprimento">
                                Suprimento — adicionar dinheiro
                              </option>
                            </select>
                          </label>
                          <Input
                            label="Valor (R$)"
                            name="amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                          />
                          <Input label="Motivo" name="reason" required />
                          <button disabled={busy}>Registrar movimento</button>
                        </form>
                        {shift.movements.map((m) => (
                          <div className="list-row" key={m.id || m.at}>
                            <span>
                              {m.type} · {money(m.amount)}
                            </span>
                            <button
                              onClick={() =>
                                run(
                                  () =>
                                    api.document(
                                      "movement",
                                      m.id,
                                      Boolean(s.settings.thermalHost),
                                    ),
                                  "Comprovante enviado.",
                                )
                              }
                            >
                              Reimprimir
                            </button>
                          </div>
                        ))}
                        {true && (
                          <section className="close-shift">
                            <h3>Fechamento cego</h3>
                            <p className="muted">
                              Informe o dinheiro e os comprovantes contados. A
                              conferência ficará disponível ao gerente.
                            </p>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const p = fields(e.currentTarget);
                                run(
                                  () =>
                                    act("closeShift", {
                                      countedPayments: Object.fromEntries(
                                        [
                                          "dinheiro",
                                          "pix",
                                          "credito",
                                          "debito",
                                          "fiado",
                                        ].map((m) => [m, cents(p[m])]),
                                      ),
                                    }),
                                  "Caixa fechado. Conferência encaminhada ao gerente.",
                                );
                              }}
                            >
                              {[
                                "dinheiro",
                                "pix",
                                "credito",
                                "debito",
                                "fiado",
                              ].map((m) => (
                                <Input
                                  key={m}
                                  label={labels[m] + " contado (R$)"}
                                  name={m}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required
                                />
                              ))}
                              <button disabled={busy}>
                                Confirmar fechamento
                              </button>
                            </form>
                          </section>
                        )}
                      </>
                    )}
                  </Modal>
                )}
                {s.pixCharges
                  .filter(
                    (c) =>
                      ["creating", "pending", "approved", "recovery"].includes(
                        c.status,
                      ) &&
                      (c.user === s.me.id || admin),
                  )
                  .map((c) => (
                    <div className="notice" key={c.id}>
                      Pix em andamento · {money(c.amount)}{" "}
                      <button
                        onClick={() => {
                          setCart(c.items);
                          setPayments(
                            c.checkout.payments.map((p) => ({
                              forma: p.forma,
                              value: (p.amount / 100).toFixed(2),
                            })),
                          );
                          setDiscount((c.checkout.discount / 100).toFixed(2));
                          setCustomer(c.checkout.customer || "");
                          setSaleId(c.saleId);
                          setActiveCharge(c);
                          setPaymentOpen(true);
                        }}
                      >
                        Retomar cobrança
                      </button>
                    </div>
                  ))}
                <div className="keyboard-help">
                  F1 Buscar · F2 Pagar · F3 Cancelar item · F4 Desconto · F6
                  Consultar · F12 Quantidade/peso · Esc Cancelar
                </div>
                <div className="pos-grid">
                  <section className="panel catalog">
                    <div className="panel-title">
                      <h2>Catálogo de produtos</h2>
                      <span className="badge">
                        {s.products.length} produtos
                      </span>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!query.trim()) return;
                        const p = s.products.find((p) => p.barcode === query);
                        const weighed =
                          s.settings.scaleLabels &&
                          !p &&
                          scaleBarcode(query, s.products);
                        if (p) add(p);
                        else if (weighed) add(weighed.product, weighed.qty);
                        else {
                          const first = s.products.find((p) =>
                            (p.name + " " + p.barcode)
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                          );
                          if (first) add(first);
                        }
                        setQuery("");
                        searchRef.current?.focus();
                      }}
                    >
                      <input
                        ref={searchRef}
                        className="search"
                        aria-label="Buscar produto ou código de barras"
                        placeholder="Buscar produto ou ler código de barras"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </form>
                    <div className="product-grid">
                      {s.products
                        .filter((p) =>
                          (p.name + " " + p.barcode + " " + p.category)
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((p, index) => (
                          <button
                            className="product"
                            key={p.id}
                            onClick={() => add(p)}
                            disabled={
                              s.settings.stockPolicy === "block" && p.stock <= 0
                            }
                          >
                            <b>{p.name}</b>
                            <small>
                              {p.category} · {p.stock} {p.unit || "UN"} em
                              estoque
                            </small>
                            <strong>
                              {money(p.price)} <span aria-hidden="true">+</span>
                            </strong>
                          </button>
                        ))}
                    </div>
                    {!s.products.length && (
                      <div className="empty">
                        ◈<h3>Seu catálogo começa aqui</h3>
                        <p>
                          Cadastre os produtos e o estoque inicial para começar
                          a vender.
                        </p>
                        {admin && (
                          <button onClick={() => setPage("produtos")}>
                            Cadastrar primeiro produto →
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                  <section className="panel cart">
                    <div className="panel-title">
                      <h2>Venda atual</h2>
                      <span className="badge">
                        {cart.reduce((a, i) => a + i.qty, 0)} itens
                      </span>
                    </div>
                    <details className="sale-options">
                      <summary>
                        Cliente e desconto
                        {customer || Number(discount) ? (
                          <span className="badge">Aplicado</span>
                        ) : null}
                      </summary>
                      <label>
                        Cliente
                        <select
                          value={customer}
                          onChange={(e) => setCustomer(e.target.value)}
                        >
                          <option value="">Consumidor não identificado</option>
                          {s.customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        label="Desconto (R$)"
                        disabled={checkoutLocked}
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </details>
                    <div className="cart-items">
                      {!cart.length && (
                        <div className="empty">
                          <span>▧</span>
                          <h3>Sua venda está vazia</h3>
                          <p>Selecione um produto ao lado.</p>
                        </div>
                      )}
                      {cart.map((i) => (
                        <div
                          className={
                            "cart-item " +
                            (activeItem === i.id ? "selected-item" : "")
                          }
                          key={i.id}
                          tabIndex="0"
                          onFocus={() => setActiveItem(i.id)}
                          onClick={() => setActiveItem(i.id)}
                        >
                          <div>
                            <b>{i.name}</b>
                            <small>
                              {money(i.price)} / {i.unit || "UN"}
                            </small>
                          </div>
                          <div className="qty">
                            <button
                              aria-label={"Diminuir " + i.name}
                              onClick={() =>
                                changeQty(
                                  i,
                                  Math.max(
                                    0,
                                    i.qty - (fractional(i) ? 0.001 : 1),
                                  ),
                                )
                              }
                            >
                              −
                            </button>
                            <span>{i.qty}</span>
                            <button
                              aria-label={"Aumentar " + i.name}
                              onClick={() => add(i)}
                            >
                              +
                            </button>
                          </div>
                          <b>{money(lineValue(i.price, i.qty))}</b>
                        </div>
                      ))}
                    </div>
                    <div className="totals">
                      <p>
                        <span>Subtotal</span>
                        {money(subtotal)}
                      </p>
                      {Number(discount) > 0 && (
                        <p>
                          <span>Desconto</span>− {money(cents(discount))}
                        </p>
                      )}
                      <p className="grand">
                        <span>Total</span>
                        {money(total)}
                      </p>
                    </div>
                    <button
                      className="primary checkout"
                      disabled={busy || !shift || !cart.length}
                      onClick={() => setPaymentOpen(true)}
                    >
                      Ir para pagamento <span>→</span>
                    </button>
                    {paymentOpen && (
                      <Modal
                        title="Pagamento"
                        onClose={() => {
                          setPaymentOpen(false);
                          setApproval({ login: "", password: "" });
                          refresh();
                        }}
                      >
                        <div className="payment-total">
                          <small>Total da venda</small>
                          <h1>{money(total)}</h1>
                        </div>
                        {error && (
                          <p className="error" role="alert">
                            {error}
                          </p>
                        )}

                        <small className="muted">
                          Confirme os pagamentos manuais antes de concluir.
                        </small>
                        {payments.map((p, i) => (
                          <div className="payment" key={i}>
                            <select
                              aria-label="Forma de pagamento"
                              disabled={checkoutLocked}
                              value={p.forma}
                              onChange={(e) =>
                                setPayments((v) =>
                                  v.map((x, n) =>
                                    n === i
                                      ? { ...x, forma: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                            >
                              {[
                                ["dinheiro", "Dinheiro"],
                                ["pix", "Pix"],
                                ["credito", "Crédito"],
                                ["debito", "Débito"],
                                ["outros", "Outros"],
                                ["fiado", "Fiado"],
                                ["creditoloja", "Crédito da loja"],
                              ].map(([id, t]) => (
                                <option key={id} value={id}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label="Valor pago"
                              disabled={checkoutLocked}
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="Valor R$"
                              value={p.value}
                              onChange={(e) =>
                                setPayments((v) =>
                                  v.map((x, n) =>
                                    n === i
                                      ? { ...x, value: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                            />
                            {payments.length > 1 && (
                              <button
                                aria-label="Remover pagamento"
                                disabled={checkoutLocked}
                                onClick={() =>
                                  setPayments((v) =>
                                    v.filter((_, n) => n !== i),
                                  )
                                }
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          className="link"
                          disabled={checkoutLocked}
                          onClick={() =>
                            setPayments((p) => [
                              ...p,
                              { forma: "pix", value: "" },
                            ])
                          }
                        >
                          + Dividir pagamento
                        </button>
                        <div className="cash-bills">
                          {[20, 50, 100, "Exato"].map((value) => (
                            <button
                              key={value}
                              disabled={checkoutLocked}
                              onClick={() => {
                                const other = payments
                                  .filter((p) => p.forma !== "dinheiro")
                                  .reduce((a, p) => a + cents(p.value), 0);
                                const amount =
                                  value === "Exato"
                                    ? Math.max(0, total - other)
                                    : value * 100;
                                setPayments((p) => [
                                  {
                                    forma: "dinheiro",
                                    value: (amount / 100).toFixed(2),
                                  },
                                  ...p.filter((x) => x.forma !== "dinheiro"),
                                ]);
                              }}
                            >
                              {value === "Exato"
                                ? "Valor exato"
                                : "R$ " + value}
                            </button>
                          ))}
                        </div>
                        <details className="approval">
                          <summary>Autorizar desconto acima do limite</summary>
                          <label>
                            Login do supervisor
                            <input
                              value={approval.login}
                              onChange={(e) =>
                                setApproval((a) => ({
                                  ...a,
                                  login: e.target.value,
                                }))
                              }
                              autoComplete="off"
                            />
                          </label>
                          <label>
                            Senha do supervisor
                            <input
                              type="password"
                              value={approval.password}
                              onChange={(e) =>
                                setApproval((a) => ({
                                  ...a,
                                  password: e.target.value,
                                }))
                              }
                              autoComplete="new-password"
                            />
                          </label>
                        </details>
                        {customer && (
                          <p className="muted">
                            Crédito disponível:{" "}
                            {money(
                              s.storeCredits
                                .filter((c) => c.customer === customer)
                                .reduce((a, c) => a + c.balance, 0),
                            )}
                          </p>
                        )}
                        {s.settings.pixEnabled &&
                          payments.some((p) => p.forma === "pix") && (
                            <PixPanel
                              api={api}
                              checkout={checkout}
                              initial={activeCharge}
                              onChanged={() => refresh()}
                              onReset={() => {
                                setSaleId(crypto.randomUUID());
                                setActiveCharge(null);
                              }}
                              run={run}
                              onSale={async (v) => {
                                if (saleRef.current === v.id) finishSale(v);
                                await refresh();
                                setNotice(
                                  "Pix confirmado e venda concluída automaticamente.",
                                );
                              }}
                            />
                          )}
                        <p className="change">
                          {paid >= total ? "Troco" : "Falta receber"}{" "}
                          <b>{money(Math.abs(paid - total))}</b>
                        </p>
                        <button
                          className="primary checkout"
                          disabled={
                            busy ||
                            !shift ||
                            !cart.length ||
                            (s.settings.pixEnabled &&
                              payments.some((p) => p.forma === "pix"))
                          }
                          onClick={saveSale}
                        >
                          {busy ? "Processando…" : "Concluir venda"}{" "}
                          <span>→</span>
                        </button>
                      </Modal>
                    )}
                    <small className="muted center">
                      NFC-e e recibo disponíveis após concluir.
                    </small>
                  </section>
                </div>
              </>
            )}
            {page === "produtos" && (
              <div className="management">
                <section className="panel editor">
                  <details key={editing?.id || "new"} open={Boolean(editing)}>
                    <summary>
                      {editing ? "Editar produto" : "Novo produto"}
                    </summary>
                    <form
                      key={editing?.id || "new"}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const p = fields(e.currentTarget);
                        run(async () => {
                          await act("product", {
                            ...p,
                            id: editing?.id,
                            price: cents(p.price),
                            stock: Number(p.stock),
                          });
                          setEditing(null);
                        });
                      }}
                    >
                      <div className="form-grid">
                        <Input
                          label="Nome do produto"
                          name="name"
                          defaultValue={editing?.name}
                          required
                        />
                        <Input
                          label="Código de barras / SKU"
                          name="barcode"
                          defaultValue={editing?.barcode}
                          required
                        />
                        <Input
                          label="Categoria"
                          name="category"
                          defaultValue={editing?.category}
                          required
                        />
                        <Input
                          label="Preço (R$)"
                          name="price"
                          type="number"
                          min="0.01"
                          step="0.01"
                          defaultValue={
                            editing ? editing.price / 100 : undefined
                          }
                          required
                        />
                        <Input
                          label="Estoque na unidade do produto"
                          name="stock"
                          step="0.001"
                          type="number"
                          min="0"
                          defaultValue={editing?.stock ?? 0}
                          required
                        />
                      </div>
                      <label>
                        Unidade de medida
                        <select
                          name="unit"
                          defaultValue={editing?.unit || "UN"}
                        >
                          {["UN", "KG", "M", "L", "CX", "FD"].map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </label>
                      <details className="tax-fields">
                        <summary>Dados fiscais para NFC-e</summary>
                        <p className="muted">
                          Informe os códigos fornecidos pelo contador.
                        </p>
                        <div className="form-grid">
                          <Input
                            label="NCM — contador"
                            name="ncm"
                            pattern="[0-9]{8}"
                            defaultValue={editing?.ncm}
                          />
                          <Input
                            label="CFOP — contador"
                            name="cfop"
                            pattern="[0-9]{4}"
                            defaultValue={editing?.cfop}
                          />
                          <Input
                            label="CSOSN — Simples Nacional"
                            name="csosn"
                            pattern="[0-9]{3}"
                            defaultValue={editing?.csosn}
                          />
                        </div>
                      </details>
                      <button className="primary" disabled={busy}>
                        Salvar produto
                      </button>
                      {editing && (
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancelar edição
                        </button>
                      )}
                    </form>
                  </details>
                </section>
                <section className="panel">
                  <h2>Estoque e preços</h2>
                  <input
                    className="search"
                    placeholder="Buscar produto…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Preço</th>
                        <th>Estoque</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {s.products
                        .filter((p) =>
                          (p.name + p.barcode)
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <b>{p.name}</b>
                              <small>{p.barcode}</small>
                            </td>
                            <td>{p.category}</td>
                            <td>{money(p.price)}</td>
                            <td>
                              <span
                                className={
                                  "badge " + (p.stock > 5 ? "green" : "orange")
                                }
                              >
                                {p.stock} un.
                              </span>
                            </td>
                            <td>
                              <button onClick={() => setEditing(p)}>
                                Editar
                              </button>{" "}
                              <button
                                className="danger"
                                aria-label={"Excluir produto " + p.name}
                                onClick={() =>
                                  setDeletion({
                                    action: "deleteProduct",
                                    payload: { id: p.id },
                                    title: "Excluir produto?",
                                    message: `${p.name} deixará de aparecer no catálogo. O histórico das vendas será mantido.`,
                                  })
                                }
                              >
                                Excluir
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}
            {page === "clientes" && (
              <div className="management">
                <section className="panel editor">
                  <details key={editing?.id || "new"} open={Boolean(editing)}>
                    <summary>
                      {editing ? "Editar cliente" : "Novo cliente"}
                    </summary>
                    <form
                      key={editing?.id || "new"}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const p = fields(e.currentTarget);
                        run(async () => {
                          await act("customer", {
                            ...p,
                            id: editing?.id,
                            creditLimit: cents(p.creditLimit),
                          });
                          setEditing(null);
                        });
                      }}
                    >
                      <div className="form-grid">
                        <Input
                          label="Nome"
                          name="name"
                          defaultValue={editing?.name}
                          required
                        />
                        <Input
                          label="CPF / CNPJ"
                          name="document"
                          defaultValue={editing?.document}
                        />
                        <Input
                          label="Telefone"
                          name="phone"
                          defaultValue={editing?.phone}
                        />
                        <Input
                          label="Limite de fiado pré-aprovado (R$)"
                          name="creditLimit"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={(editing?.creditLimit || 0) / 100}
                          required
                        />
                      </div>
                      <button className="primary" disabled={busy}>
                        Salvar cliente
                      </button>
                      {editing && (
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      )}
                    </form>
                  </details>
                </section>
                <section className="panel">
                  <h2>Clientes e histórico</h2>
                  {s.customers.map((c) => (
                    <details key={c.id}>
                      <summary>
                        <b>{c.name}</b> · {c.document || "Sem documento"} ·{" "}
                        {c.phone}
                      </summary>
                      <button onClick={() => setEditing(c)}>
                        Editar cadastro
                      </button>
                      {s.sales
                        .filter((v) => v.customer === c.id)
                        .map((v) => (
                          <p key={v.id}>
                            Venda #{v.number} · {date(v.at)} · {money(v.total)}{" "}
                            <button
                              onClick={() => {
                                setSelected(v.id);
                                setPage("vendas");
                              }}
                            >
                              Abrir
                            </button>
                          </p>
                        ))}
                    </details>
                  ))}
                </section>
              </div>
            )}
            {page === "equipe" && (
              <div className="management">
                <section className="panel editor">
                  <details key={editing?.id || "new"} open={Boolean(editing)}>
                    <summary>
                      {editing ? "Editar funcionário" : "Adicionar funcionário"}
                    </summary>
                    <form
                      key={editing?.id || "new"}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const p = fields(e.currentTarget);
                        run(async () => {
                          await act("employee", {
                            ...p,
                            id: editing?.id,
                            active: p.active === "true",
                          });
                          setEditing(null);
                        });
                      }}
                    >
                      <div className="form-grid">
                        <Input
                          label="Nome"
                          name="name"
                          defaultValue={editing?.name}
                          required
                        />
                        <Input
                          label="Login"
                          name="login"
                          defaultValue={editing?.login}
                          required
                        />
                        <Input
                          label={
                            editing
                              ? "Nova senha (opcional)"
                              : "Senha (mínimo 8 caracteres)"
                          }
                          name="password"
                          type="password"
                          minLength="8"
                          required={!editing}
                        />
                        <label>
                          Perfil
                          <select
                            name="role"
                            defaultValue={editing?.role || "cashier"}
                          >
                            <option value="cashier">Operador de caixa</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="manager">Gerente</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </label>
                        <label>
                          Situação
                          <select
                            name="active"
                            defaultValue={
                              editing?.active === false ? "false" : "true"
                            }
                          >
                            <option value="true">Ativo</option>
                            <option value="false">Inativo</option>
                          </select>
                        </label>
                      </div>
                      <button className="primary" disabled={busy}>
                        Salvar funcionário
                      </button>
                      {editing && (
                        <button type="button" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      )}
                    </form>
                    <p className="muted">
                      Operadores vendem, imprimem, emitem NFC-e das vendas e
                      movimentam o caixa. Administração controla cadastros,
                      reembolsos, fechamento e configuração fiscal.
                    </p>
                  </details>
                </section>
                <section className="panel">
                  {s.users
                    .filter((u) => !u.deletedAt)
                    .map((u) => (
                      <div className="list-row" key={u.id}>
                        <div>
                          <b>{u.name}</b>
                          <small>
                            {u.login} ·{" "}
                            {
                              {
                                admin: "Administrador",
                                manager: "Gerente",
                                supervisor: "Supervisor",
                                cashier: "Operador",
                              }[u.role]
                            }{" "}
                            · {u.active ? "Ativo" : "Inativo"}
                          </small>
                        </div>
                        <div className="row-actions">
                          <button onClick={() => setEditing(u)}>Editar</button>
                          <button
                            className="danger"
                            aria-label={"Excluir funcionário " + u.name}
                            disabled={u.id === s.me.id}
                            onClick={() =>
                              setDeletion({
                                action: "deleteEmployee",
                                payload: { id: u.id },
                                title: "Excluir funcionário?",
                                message: `${u.name} perderá o acesso ao sistema. O nome será preservado nos registros de vendas anteriores.`,
                              })
                            }
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                </section>
              </div>
            )}
            {page === "vendas" && (
              <div className="sales-grid">
                <section className="panel">
                  <h2>Vendas registradas</h2>
                  <input
                    type="date"
                    aria-label="Data das vendas"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                  {admin && (
                    <button
                      className="danger daily-delete"
                      disabled={
                        busy ||
                        day !== localDay(new Date()) ||
                        !s.sales.some((v) => localDay(v.at) === day)
                      }
                      onClick={() =>
                        setDeletion({
                          action: "deleteSalesDay",
                          payload: {
                            day,
                            ids: s.sales
                              .filter((v) => localDay(v.at) === day)
                              .map((v) => v.id),
                          },
                          title: "Excluir vendas do dia?",
                          message: `Excluir ${s.sales.filter((v) => localDay(v.at) === day).length} venda(s) de ${day.split("-").reverse().join("/")}? Os itens ainda não devolvidos voltarão ao estoque, e as vendas sairão dos totais do caixa e dos relatórios. Isso não cancela pagamentos no banco ou na maquininha.`,
                        })
                      }
                    >
                      Excluir vendas do dia
                    </button>
                  )}
                  {s.sales
                    .filter((v) => localDay(v.at) === day)
                    .slice()
                    .reverse()
                    .map((v) => (
                      <button
                        className={
                          "sale-row " + (selected === v.id ? "chosen" : "")
                        }
                        key={v.id}
                        onClick={() => setSelected(v.id)}
                      >
                        <div>
                          <b>Venda #{String(v.number).padStart(4, "0")}</b>
                          <small>
                            {date(v.at)} ·{" "}
                            {v.items.reduce((a, i) => a + i.qty, 0)} itens
                          </small>
                        </div>
                        <div>
                          <b>{money(v.total)}</b>
                          <small>
                            {v.returns.length
                              ? "Com devolução"
                              : v.fiscal?.situacao || "Recibo não fiscal"}
                          </small>
                        </div>
                      </button>
                    ))}
                </section>
                <section className="panel">
                  {!selectedSale ? (
                    <div className="empty">
                      <h3>Selecione uma venda</h3>
                      <p>
                        Consulte itens, emita NFC-e ou registre uma devolução.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="panel-title">
                        <h2>Venda #{selectedSale.number}</h2>
                        <span className="badge">{date(selectedSale.at)}</span>
                      </div>
                      <p>
                        Operador:{" "}
                        {s.users.find((u) => u.id === selectedSale.user)?.name}{" "}
                        · Cliente:{" "}
                        {s.customers.find((c) => c.id === selectedSale.customer)
                          ?.name || "Consumidor"}
                      </p>
                      <table>
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Quantidade</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSale.items.map((i) => (
                            <tr key={i.id}>
                              <td>{i.name}</td>
                              <td>
                                {i.qty} <small>{i.returned} devolvido(s)</small>
                              </td>
                              <td>{money(lineValue(i.price, i.qty))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p>
                        Desconto: {money(selectedSale.discount)} · Troco:{" "}
                        {money(selectedSale.change)}
                      </p>
                      <h2>Total: {money(selectedSale.total)}</h2>
                      <p>
                        {selectedSale.payments
                          .map((p) => `${p.forma}: ${money(p.amount)}`)
                          .join(" · ")}
                      </p>
                      <div className="actions">
                        {admin && (
                          <button
                            className="danger"
                            disabled={
                              busy ||
                              localDay(selectedSale.at) !== localDay(new Date())
                            }
                            onClick={() =>
                              setDeletion({
                                action: "deleteSale",
                                payload: { id: selectedSale.id },
                                title: "Excluir venda?",
                                message: `Excluir a venda #${selectedSale.number}? O estoque dos itens não devolvidos será reposto, e os totais do caixa serão ajustados. Isso não estorna pagamentos fora do aplicativo.`,
                              })
                            }
                          >
                            Excluir venda
                          </button>
                        )}
                        <button
                          onClick={() =>
                            run(
                              () =>
                                api.print(
                                  selectedSale.id,
                                  Boolean(s.settings.thermalHost),
                                ),
                              "Recibo aberto para impressão.",
                            )
                          }
                        >
                          Imprimir recibo
                        </button>
                        <button
                          className="primary"
                          disabled={busy || selectedSale.returns.length > 0}
                          onClick={() => fiscalEmit(selectedSale.id)}
                        >
                          Emitir / recuperar NFC-e
                        </button>
                      </div>
                      {selectedSale.fiscal && (
                        <div className="notice">
                          NFC-e: {selectedSale.fiscal.situacao} ·{" "}
                          {selectedSale.fiscal.motivo || ""}
                          <p>{selectedSale.fiscal.chave}</p>
                          {["pendente", "offline"].includes(
                            selectedSale.fiscal.situacao,
                          ) && (
                            <p>
                              Aguarde a conferência do emissor. Não crie outra
                              venda para repetir a emissão.
                            </p>
                          )}
                        </div>
                      )}
                      {true &&
                        (!selectedSale.fiscal ||
                          ["cancelada", "rejeitada"].includes(
                            selectedSale.fiscal.situacao,
                          )) &&
                        selectedSale.items.some((i) => i.returned < i.qty) && (
                          <details>
                            <summary>
                              Devolução, troca ou cancelamento integral
                            </summary>
                            <p>
                              Selecione quantidades devolvidas. O estoque será
                              reposto. Confirme o reembolso fora do aplicativo.
                            </p>
                            <form
                              key={selectedSale.id}
                              onSubmit={(e) => {
                                e.preventDefault();
                                const p = fields(e.currentTarget);
                                run(
                                  () =>
                                    act("return", {
                                      id: selectedSale.id,
                                      reason: p.reason,
                                      method: p.method,
                                      approval: authorization(p),
                                      items: selectedSale.items
                                        .map((i) => ({
                                          id: i.id,
                                          qty: Number(p[i.id]),
                                        }))
                                        .filter((i) => i.qty > 0),
                                    }),
                                  "Devolução registrada e estoque reposto.",
                                );
                              }}
                            >
                              {selectedSale.items.map((i) => (
                                <Input
                                  key={i.id}
                                  label={
                                    i.name +
                                    ` (saldo ${Math.round((i.qty - i.returned) * 1000) / 1000})`
                                  }
                                  name={i.id}
                                  step={fractional(i) ? "0.001" : "1"}
                                  type="number"
                                  min="0"
                                  max={
                                    Math.round((i.qty - i.returned) * 1000) /
                                    1000
                                  }
                                  defaultValue="0"
                                />
                              ))}
                              <Input
                                label="Motivo (mínimo 5 caracteres)"
                                name="reason"
                                minLength="5"
                                required
                              />
                              <label>
                                Reembolso realizado por
                                <select name="method">
                                  <option value="dinheiro">Dinheiro</option>
                                  <option value="pix">Pix</option>
                                  <option value="credito">Crédito</option>
                                  <option value="debito">Débito</option>
                                  <option value="creditoloja">
                                    Crédito para troca na loja
                                  </option>
                                </select>
                              </label>
                              <ApprovalFields />
                              <button disabled={busy}>
                                Confirmar devolução
                              </button>
                            </form>
                          </details>
                        )}
                      {selectedSale.returns.map((r) => (
                        <div className="notice" key={r.id}>
                          Devolução: {money(r.value ?? r.refund)} · {r.method} ·{" "}
                          {date(r.at)}
                          <p>{r.reason}</p>
                          {r.debtReduction > 0 && (
                            <p>
                              Caderneta abatida: {money(r.debtReduction)} ·
                              Reembolso/crédito efetivo: {money(r.refund)}
                            </p>
                          )}
                        </div>
                      ))}
                      {true &&
                        selectedSale.fiscal?.chave &&
                        selectedSale.fiscal.situacao !== "cancelada" && (
                          <details>
                            <summary>Cancelar NFC-e na SEFAZ</summary>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const p = fields(e.currentTarget);
                                run(() =>
                                  api.cancelFiscal(
                                    selectedSale.id,
                                    p.reason,
                                    authorization(p),
                                  ),
                                );
                              }}
                            >
                              <Input
                                label="Justificativa fiscal (mínimo 15 caracteres)"
                                name="reason"
                                minLength="15"
                                required
                              />
                              <p className="muted">
                                Depende do prazo e da autorização da SEFAZ.
                                Depois da confirmação, registre a devolução
                                integral para repor estoque e contabilizar o
                                reembolso.
                              </p>
                              <ApprovalFields />
                              <button disabled={busy}>
                                Solicitar cancelamento fiscal
                              </button>
                            </form>
                          </details>
                        )}
                      {selectedSale.fiscal && (
                        <p className="muted">
                          Devolução parcial de venda fiscal exige NF-e de
                          devolução orientada pelo contador e não é automatizada
                          nesta versão.
                        </p>
                      )}
                    </>
                  )}
                </section>
              </div>
            )}
            {page === "relatorios" && (
              <>
                <div className="actions">
                  <Input
                    label="Data do relatório"
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                  <button
                    onClick={() =>
                      run(
                        () => api.backup(),
                        "Solicitação de backup concluída.",
                      )
                    }
                  >
                    Salvar backup do banco
                  </button>
                </div>
                <Reports s={s} day={day} />
                <ShiftReports s={s} api={api} run={run} />
              </>
            )}
            {page === "fiscal" && (
              <section className="panel">
                <div className="actions">
                  <button onClick={() => setFiscalTab("config")}>
                    Configurar empresa e A1
                  </button>
                  <button onClick={() => setFiscalTab("notas")}>
                    Notas e cancelamentos
                  </button>
                  <label>
                    Ambiente de consulta
                    <select
                      value={ambiente}
                      onChange={(e) => setAmbiente(Number(e.target.value))}
                    >
                      <option value="2">Homologação (teste)</option>
                      <option value="1">Produção</option>
                    </select>
                  </label>
                </div>
                <div className="notice">
                  Integração Sull-s/fiscal · Configure a empresa em homologação
                  antes da primeira emissão. Certificado protegido pelo cofre do
                  sistema. Os códigos tributários devem ser fornecidos pelo
                  contador.
                </div>
                {fiscalTab === "config" ? (
                  <ConfigurarEmissor
                    notas={["nfce", "nfe"]}
                    onSalvo={(e) => {
                      setAmbiente(e.ambiente);
                      setNotice(
                        "Configuração fiscal salva. Valide em homologação antes de usar produção.",
                      );
                    }}
                  />
                ) : (
                  <>
                    <ListaNotas
                      ano={Number(day.slice(0, 4))}
                      mes={Number(day.slice(5, 7))}
                      ambiente={ambiente}
                    />
                    <Input
                      label="Mês de referência"
                      type="date"
                      value={day}
                      onChange={(e) => setDay(e.target.value)}
                    />
                    <RelatorioContador ambiente={ambiente} />
                  </>
                )}
              </section>
            )}
            {page === "settings" && s.me.role === "admin" && (
              <Settings s={s} api={api} run={run} />
            )}
            {page === "accounts" && <Accounts s={s} api={api} run={run} />}
            {operation && (
              <Modal
                key={operation.type + (operation.product?.id || "")}
                title={
                  operation.type === "lookup"
                    ? "Consulta rápida de estoque"
                    : operation.type === "add"
                      ? "Informar peso / quantidade"
                      : operation.type === "quantity"
                        ? "Alterar quantidade"
                        : "Cancelar pré-venda"
                }
                onClose={() => {
                  setOperation(null);
                  queueMicrotask(() => searchRef.current?.focus());
                }}
              >
                {error && <p className="error">{error}</p>}
                {operation.type === "lookup" ? (
                  <>
                    <input
                      aria-label="Consultar estoque"
                      placeholder="Nome ou código"
                      onChange={(e) =>
                        setOperation((o) => ({ ...o, query: e.target.value }))
                      }
                    />
                    <table>
                      <tbody>
                        {s.products
                          .filter((p) =>
                            (p.name + " " + p.barcode)
                              .toLowerCase()
                              .includes((operation.query || "").toLowerCase()),
                          )
                          .slice(0, 20)
                          .map((p) => (
                            <tr key={p.id}>
                              <td>{p.name}</td>
                              <td>{money(p.price)}</td>
                              <td>
                                {p.stock} {p.unit || "UN"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      confirmOperation(e.currentTarget);
                    }}
                  >
                    {["add", "quantity"].includes(operation.type) && (
                      <Input
                        label={
                          "Quantidade / peso (" +
                          (operation.product.unit || "UN") +
                          ")"
                        }
                        name="qty"
                        type="number"
                        min={operation.type === "quantity" ? "0" : "0.001"}
                        step={fractional(operation.product) ? "0.001" : "1"}
                        defaultValue={operation.value ?? ""}
                        required
                      />
                    )}
                    {operation.type !== "add" && (
                      <>
                        <Input
                          label="Motivo da redução/cancelamento (mínimo 5 caracteres)"
                          name="reason"
                          minLength="5"
                        />
                        <ApprovalFields />
                      </>
                    )}
                    <button className="primary" disabled={busy}>
                      Confirmar operação
                    </button>
                  </form>
                )}
              </Modal>
            )}
            {deletion && (
              <Modal
                title={deletion.title}
                onClose={() => {
                  if (!busy) {
                    setDeletion(null);
                    setError("");
                  }
                }}
              >
                <p>{deletion.message}</p>
                {["deleteSale", "deleteSalesDay"].includes(deletion.action) && (
                  <p className="muted">
                    Disponível apenas para vendas de hoje em caixa ainda aberto.
                    Documentos fiscais precisam estar cancelados ou rejeitados.
                    A exclusão é registrada na auditoria.
                  </p>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDeletion(null);
                      setError("");
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    className="danger primary-danger"
                    disabled={busy}
                    onClick={remove}
                  >
                    {busy ? "Excluindo…" : "Confirmar exclusão"}
                  </button>
                </div>
              </Modal>
            )}
          </main>
        </div>
      </div>
    </ProvedorFiscal>
  );
}
function Reports({ s, day }) {
  const sales = s.sales.filter((v) => localDay(v.at) === day),
    returns = s.sales
      .flatMap((v) => v.returns)
      .filter((r) => localDay(r.at) === day),
    gross = sales.reduce((a, v) => a + v.total, 0),
    refunds = returns.reduce((a, r) => a + (r.value ?? r.refund), 0),
    products = {};
  sales.forEach((v) =>
    v.items.forEach((i) => {
      const p = products[i.id] || { name: i.name, qty: 0, total: 0 };
      p.qty += i.qty;
      p.total += lineValue(i.price, i.qty);
      products[i.id] = p;
    }),
  );
  return (
    <>
      <div className="stats">
        {[
          ["Vendas no dia", sales.length],
          ["Receita de vendas", money(gross)],
          ["Reembolsos do dia", money(refunds)],
          ["Receita líquida do dia", money(gross - refunds)],
        ].map(([label, value]) => (
          <section className="panel" key={label}>
            <small>{label}</small>
            <h1>{value}</h1>
          </section>
        ))}
      </div>
      <div className="management">
        <section className="panel">
          <h2>Produtos mais vendidos</h2>
          <p className="muted">
            Quantidade bruta e valor antes dos descontos e devoluções.
          </p>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Unidades</th>
                <th>Valor bruto</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(products)
                .sort((a, b) => b[1].qty - a[1].qty)
                .map(([id, p]) => (
                  <tr key={id}>
                    <td>{p.name}</td>
                    <td>{p.qty}</td>
                    <td>{money(p.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Fechamentos de caixa</h2>
          {s.shifts
            .filter((c) => c.closedAt)
            .slice()
            .reverse()
            .map((c) => (
              <div className="list-row" key={c.id}>
                <div>
                  <b>{date(c.closedAt)}</b>
                  <small>
                    Esperado {money(c.expected)} · Contado {money(c.counted)}
                  </small>
                </div>
                <span className="badge">
                  Diferença {money(c.counted - c.expected)}
                </span>
              </div>
            ))}
        </section>
        <section className="panel">
          <h2>Recebimentos por forma</h2>
          {["dinheiro", "pix", "credito", "debito", "outros"].map((f) => (
            <p className="list-row" key={f}>
              <b>{f}</b>
              {money(
                sales.reduce(
                  (a, v) =>
                    a +
                    v.payments
                      .filter((p) => p.forma === f)
                      .reduce((a, p) => a + p.amount, 0) -
                    (f === "dinheiro" ? v.change : 0),
                  0,
                ),
              )}
            </p>
          ))}
        </section>
        <section className="panel">
          <h2>Últimas operações</h2>
          {s.audit
            .slice(-15)
            .reverse()
            .map((a) => (
              <p key={a.id}>
                {date(a.at)} · {s.users.find((u) => u.id === a.user)?.name} ·{" "}
                {a.action}
              </p>
            ))}
        </section>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
