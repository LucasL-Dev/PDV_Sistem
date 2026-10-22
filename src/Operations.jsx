import React, { useState, useEffect } from "react";
export const labels = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
  fiado: "Fiado",
  creditoloja: "Crédito da loja",
  outros: "Outros",
};
const money = (n) =>
  ((n || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const cents = (v) => Math.round(Number(String(v).replace(",", ".")) * 100);
const fields = (f) => Object.fromEntries(new FormData(f));
export const authorization = (p) => ({
  login: p.supervisorLogin,
  password: p.supervisorPassword,
});
export function ApprovalFields() {
  return (
    <details className="approval">
      <summary>Autorização de supervisor (quando necessária)</summary>
      <label>
        Login do autorizador
        <input name="supervisorLogin" autoComplete="off" />
      </label>
      <label>
        Senha do autorizador
        <input
          name="supervisorPassword"
          type="password"
          autoComplete="new-password"
        />
      </label>
    </details>
  );
}
export function ThemeSelect({ value, onChange }) {
  return (
    <select
      className="theme-switch"
      aria-label="Tema do aplicativo"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="system">Tema do sistema</option>
      <option value="light">Modo claro</option>
      <option value="dark">Modo escuro</option>
    </select>
  );
}
export function Settings({ s, api, run }) {
  const [printers, setPrinters] = useState([]);
  const settings = s.settings;
  return (
    <div className="management">
      <section className="panel">
        <h2>Operação e equipamentos</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = fields(e.currentTarget);
            run(
              () =>
                api.call("settings", {
                  ...p,
                  discountLimit: Number(p.discountLimit),
                  paper: Number(p.paper),
                  thermalPort: Number(p.thermalPort),
                  silentPrint: p.silentPrint === "on",
                  pixEnabled: p.pixEnabled === "on",
                  scaleLabels: p.scaleLabels === "on",
                }),
              "Configurações salvas.",
            );
          }}
        >
          <div className="form-grid">
            <label>
              Estoque insuficiente
              <select name="stockPolicy" defaultValue={settings.stockPolicy}>
                <option value="block">Bloquear venda</option>
                <option value="warn">
                  Alertar e permitir estoque negativo
                </option>
              </select>
            </label>
            <label>
              Desconto livre até (%)
              <input
                name="discountLimit"
                type="number"
                min="0"
                max="100"
                step="0.1"
                defaultValue={settings.discountLimit}
                required
              />
            </label>
            <label>
              Largura da bobina
              <select name="paper" defaultValue={settings.paper}>
                <option value="58">58 mm</option>
                <option value="80">80 mm</option>
              </select>
            </label>
            <label>
              Driver de impressão
              <select name="printer" defaultValue={settings.printer}>
                <option value="">Impressora padrão</option>
                {settings.printer &&
                  !printers.some((p) => p.name === settings.printer) && (
                    <option>{settings.printer}</option>
                  )}
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IP/host da térmica (ESC/POS)
              <input
                name="thermalHost"
                defaultValue={settings.thermalHost}
                placeholder="Ex.: 192.168.1.100"
              />
            </label>
            <label>
              Porta TCP
              <input
                name="thermalPort"
                type="number"
                min="1"
                max="65535"
                defaultValue={settings.thermalPort}
                required
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              name="silentPrint"
              defaultChecked={settings.silentPrint}
            />
            Imprimir direto pelo driver, sem diálogo
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="pixEnabled"
              defaultChecked={settings.pixEnabled}
            />
            Exigir confirmação automática do Pix nas vendas pelo Mercado Pago
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="scaleLabels"
              defaultChecked={settings.scaleLabels}
            />
            Ler etiquetas EAN-13: prefixo 20, SKU de 5 dígitos, peso em gramas
            (5 dígitos)
          </label>
          <p className="muted">
            Sem esta opção, Pix é um registro manual de recebimento. A balança
            pode preencher o peso por teclado em F12; protocolo de rede depende
            do modelo. Comprovantes X/Z são resumos gerenciais, não leituras de
            ECF.
          </p>
          <div className="actions">
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  setPrinters(await api.printers());
                }, "Impressoras carregadas.")
              }
            >
              Carregar impressoras
            </button>
            <button className="primary">Salvar configurações</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Credencial do Mercado Pago</h2>
        <p>
          O Access Token é cifrado pelo cofre do Windows. Não é salvo na
          interface, no repositório nem no backup do banco. Use credenciais e
          usuários de teste para homologação.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              p = fields(form);
            run(async () => {
              await api.pixConfigure(p.token);
              form.reset();
            }, "Credencial protegida no cofre do sistema.");
          }}
        >
          <label>
            Access Token
            <input
              name="token"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          <button>Guardar no cofre</button>
        </form>
      </section>
    </div>
  );
}
export function Accounts({ s, api, run }) {
  const [receipt, setReceipt] = useState(null);
  return (
    <section className="panel">
      <h2>Caderneta e crédito para trocas</h2>
      {s.customers.map((c) => {
        const accounts = s.receivables.filter(
          (d) => d.customer === c.id && d.balance > 0,
        );
        const credits = s.storeCredits
          .filter((d) => d.customer === c.id)
          .reduce((a, d) => a + d.balance, 0);
        return (
          <details key={c.id}>
            <summary>
              {c.name} · Em aberto{" "}
              {money(accounts.reduce((a, d) => a + d.balance, 0))} · Limite{" "}
              {money(c.creditLimit)} · Crédito da loja {money(credits)}
            </summary>
            {accounts.map((d) => (
              <div className="account" key={d.id}>
                <p>
                  Débito de {new Date(d.at).toLocaleString("pt-BR")} · Saldo{" "}
                  {money(d.balance)}
                </p>
                <div className="actions">
                  <button
                    onClick={() =>
                      run(
                        () => api.document("debt", d.id),
                        "Comprovante aberto.",
                      )
                    }
                  >
                    Imprimir débito
                  </button>
                  {s.settings.thermalHost && (
                    <button
                      onClick={() =>
                        run(() => api.document("debt", d.id, true))
                      }
                    >
                      Enviar à térmica
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const p = fields(e.currentTarget);
                    run(async () => {
                      const r = await api.call("settleDebt", {
                        id: d.id,
                        amount: cents(p.amount),
                        method: p.method,
                      });
                      setReceipt(r.id);
                    }, "Recebimento registrado no caixa.");
                  }}
                >
                  <div className="form-grid">
                    <label>
                      Valor recebido
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        max={d.balance / 100}
                        step="0.01"
                        required
                      />
                    </label>
                    <label>
                      Forma
                      <select name="method">
                        {["dinheiro", "pix", "credito", "debito"].map((m) => (
                          <option key={m} value={m}>
                            {labels[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button>Registrar recebimento confirmado</button>
                </form>
              </div>
            ))}
          </details>
        );
      })}
      {receipt && (
        <button
          onClick={() =>
            run(
              () => api.document("settlement", receipt),
              "Comprovante aberto.",
            )
          }
        >
          Imprimir último recebimento
        </button>
      )}
      <p className="muted">
        Recebimentos da caderneta são registros confirmados manualmente. Trocas:
        devolva para crédito da loja e use esse saldo na próxima venda do mesmo
        cliente.
      </p>
    </section>
  );
}
export function ShiftReports({ s, api, run }) {
  return (
    <section className="panel">
      <h2>Resumos gerenciais X/Z</h2>
      {s.shifts
        .slice()
        .reverse()
        .map((c) => (
          <details key={c.id}>
            <summary>
              {new Date(c.openedAt).toLocaleString("pt-BR")} ·{" "}
              {c.closedAt ? "Fechado — Z" : "Em operação — X"}
            </summary>
            <div className="actions">
              <button
                onClick={() =>
                  run(
                    () => api.document(c.closedAt ? "shiftZ" : "shiftX", c.id),
                    "Resumo aberto.",
                  )
                }
              >
                Imprimir resumo {c.closedAt ? "Z" : "X"}
              </button>
              {s.settings.thermalHost && (
                <button
                  onClick={() =>
                    run(() =>
                      api.document(
                        c.closedAt ? "shiftZ" : "shiftX",
                        c.id,
                        true,
                      ),
                    )
                  }
                >
                  Enviar à térmica
                </button>
              )}
            </div>
            {c.closedAt && c.expectedPayments && (
              <table>
                <thead>
                  <tr>
                    <th>Forma</th>
                    <th>Sistema</th>
                    <th>Contado</th>
                    <th>Sobra/falta</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(c.countedPayments).map((m) => (
                    <tr key={m}>
                      <td>{labels[m]}</td>
                      <td>{money(c.expectedPayments[m])}</td>
                      <td>{money(c.countedPayments[m])}</td>
                      <td>{money(c.divergences[m])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </details>
        ))}
      <h3>Cancelamentos autorizados na pré-venda</h3>
      {s.cancellations
        .slice(-30)
        .reverse()
        .map((c) => (
          <p key={c.id}>
            {new Date(c.at).toLocaleString("pt-BR")} ·{" "}
            {s.users.find((u) => u.id === c.user)?.name} · Autorizado por{" "}
            {s.users.find((u) => u.id === c.authorizedBy)?.name} · {c.reason}
          </p>
        ))}
    </section>
  );
}
export function PixPanel({
  api,
  checkout,
  onSale,
  initial,
  run,
  onChanged,
  onReset,
}) {
  const [charge, setCharge] = useState(initial || null),
    [email, setEmail] = useState(initial?.email || ""),
    [error, setError] = useState(""),
    [polling, setPolling] = useState(false);
  const apply = (r) => {
    setCharge(r.charge);
    Promise.resolve(onChanged?.()).catch(() => {});
    if (r.sale)
      Promise.resolve(onSale(r.sale)).catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (
      !charge ||
      ["completed", "cancelled", "rejected"].includes(charge.status)
    )
      return;
    let live = true,
      working = false;
    const poll = async () => {
      if (working) return;
      working = true;
      try {
        const r = await api.pixCheck(charge.id);
        if (live) {
          setError("");
          apply(r);
        }
      } catch (e) {
        if (live) setError(e.message);
      } finally {
        working = false;
      }
    };
    const timer = setInterval(poll, 3500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [charge?.id, charge?.status]);
  return (
    <section className="pix-panel">
      <h3>Pix dinâmico — Mercado Pago</h3>
      {!charge ? (
        <>
          <label>
            E-mail do pagador
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <p className="muted">
            Confirme os demais pagamentos antes de gerar. O estoque fica
            reservado enquanto a cobrança estiver pendente.
          </p>
          <button
            disabled={polling}
            onClick={async () => {
              setPolling(true);
              try {
                apply(await api.pixCreate(checkout, email));
              } catch (e) {
                setError(e.message);
                Promise.resolve(onChanged?.()).catch(() => {});
                try {
                  const state = await api.call("snapshot");
                  setCharge(
                    state.pixCharges.find((c) => c.saleId === checkout.id) ||
                      null,
                  );
                } catch {}
              } finally {
                setPolling(false);
              }
            }}
          >
            Gerar QR Code e aguardar pagamento
          </button>
        </>
      ) : (
        <>
          <p>Situação: {charge.status}</p>
          {charge.qrImage && (
            <img
              className="pix-qr"
              alt="QR Code Pix"
              src={"data:image/png;base64," + charge.qrImage}
            />
          )}
          <label>
            Pix copia e cola
            <textarea readOnly value={charge.qrCode || ""} />
          </label>
          <div className="actions">
            <button
              onClick={() =>
                run(
                  async () => apply(await api.pixCheck(charge.id)),
                  "Cobrança consultada.",
                )
              }
            >
              Consultar agora
            </button>
            <button
              onClick={() =>
                run(async () => {
                  setCharge(await api.pixCancel(charge.id));
                }, "Cobrança cancelada no Mercado Pago.")
              }
            >
              Cancelar cobrança
            </button>
          </div>
        </>
      )}
      {charge &&
        ["cancelled", "rejected", "expired"].includes(charge.status) && (
          <button
            onClick={() => {
              setCharge(null);
              setError("");
              onReset?.();
            }}
          >
            Nova tentativa com outra cobrança
          </button>
        )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
