import { MercadoPago, verifiedPayment } from "./pix.mjs";
import { reservePix, finalizePix } from "./pix-flow.mjs";
import { sendThermal } from "./thermal.mjs";
import { ranks, lineTotal, approve } from "./operations.mjs";
import { app, BrowserWindow, ipcMain, safeStorage, dialog } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { backup } from "node:sqlite";
import { Store } from "./store.mjs";
import { iniciarAgente, chaveMestraProtegida } from "@fiscal/agente";
// Preserve o namespace usado antes da mudança de marca (vendas, A1 e XMLs).
app.setName("OmniPDV");
app.setPath(
  "userData",
  process.env.PDV_SMOKE || join(app.getPath("appData"), "pdv-sistem"),
);
const here = dirname(fileURLToPath(import.meta.url));
const appIcon = join(here, "../assets/brand/icon-256.png");
const receiptLogo =
  "data:image/png;base64," + readFileSync(appIcon).toString("base64");
let store, win, agent, agentPromise, pixTimer;
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Envie erros de negócio como dados: o Electron não acrescenta seu prefixo técnico.
function handle(channel, listener) {
  ipcMain.handle(channel, async (...args) => {
    try {
      return { ok: true, value: await listener(...args) };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Não foi possível concluir a operação.",
      };
    }
  });
}
function trusted(event) {
  if (
    event.sender !== win?.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw Error("Origem não autorizada.");
}
async function fiscal() {
  if (agent) return agent;
  if (!agentPromise)
    agentPromise = (async () => {
      if (
        !(await safeStorage.isAsyncEncryptionAvailable()) ||
        (process.platform === "linux" &&
          safeStorage.getSelectedStorageBackend() === "basic_text")
      )
        throw Error(
          "Ative o cofre de senhas do sistema operacional para proteger o certificado.",
        );
      const folder = join(app.getPath("userData"), "fiscal");
      agent = await iniciarAgente({
        pastaDados: join(folder, "dados"),
        chaveMestra: () =>
          chaveMestraProtegida({
            arquivo: join(folder, "chave.bin"),
            proteger: (t) => safeStorage.encryptStringAsync(t),
            abrir: (b) => safeStorage.decryptStringAsync(b),
          }),
        aoRegistrar: () => {},
      });
      return agent;
    })();
  try {
    return await agentPromise;
  } catch (e) {
    agentPromise = null;
    throw e;
  }
}
async function pixClient() {
  const file = join(app.getPath("userData"), "mercadopago.bin");
  if (!existsSync(file))
    throw Error("Configure o Access Token do Mercado Pago nas configurações.");
  const token = await safeStorage.decryptStringAsync(readFileSync(file));
  return new MercadoPago(token);
}
const pixLocks = new Map();
async function pixLock(id, fn) {
  if (pixLocks.has(id)) return pixLocks.get(id);
  const task = fn();
  pixLocks.set(id, task);
  try {
    return await task;
  } finally {
    pixLocks.delete(id);
  }
}
function ownCharge(id) {
  const state = store.read();
  const user = store.user(state);
  const charge = state.pixCharges.find((c) => c.id === id);
  if (!charge || (charge.user !== user.id && ranks[user.role] < 2))
    throw Error("Cobrança não encontrada ou sem permissão.");
  return charge;
}
function recordCharge(id, payment) {
  return store.mutate((s) => {
    const c = s.pixCharges.find((c) => c.id === id);
    if (c.status === "completed") return c;
    const reference = { ...c, remoteId: c.remoteId || String(payment.id) };
    verifiedPayment(payment, reference);
    const previousStatus = c.status;
    c.remoteId = reference.remoteId;
    c.status =
      payment.status === "approved"
        ? "approved"
        : ["cancelled", "rejected"].includes(payment.status)
          ? payment.status
          : "pending";
    if (previousStatus !== c.status)
      store.audit(s, { id: "sistema" }, "pix.status", {
        charge: c.id,
        status: c.status,
        remoteId: c.remoteId,
      });
    const data = payment.point_of_interaction?.transaction_data;
    c.qrCode = String(data?.qr_code || c.qrCode || "").slice(0, 20000);
    const image = String(data?.qr_code_base64 || c.qrImage || "");
    c.qrImage =
      /^[A-Za-z0-9+/=]*$/.test(image) && image.length < 1500000 ? image : "";
    return c;
  });
}
async function pixResult(c) {
  if (c.status === "approved")
    return { charge: c, sale: finalizePix(store, c.id) };
  if (c.status === "completed")
    return { charge: c, sale: store.read().sales.find((s) => s.id === c.sale) };
  return { charge: c };
}
async function printLines(lines, settings) {
  const receipt = new BrowserWindow({
    show: !settings.silentPrint,
    width: 430,
    height: 700,
    parent: win,
    icon: appIcon,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  receipt.removeMenu();
  receipt.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const path = join(
    app.getPath("temp"),
    "omnipdv-comprovante-" + Date.now() + ".html",
  );
  writeFileSync(
    path,
    `<!doctype html><meta charset="utf-8"><title>OmniPDV</title><style>@page{size:${settings.paper}mm auto;margin:2mm}body{font:12px monospace;width:${settings.paper - 8}mm;white-space:pre-wrap;overflow-wrap:anywhere}</style><body>${lines.map(escape).join("\n")}</body>`,
  );
  await receipt.loadFile(path);
  return new Promise((resolve, reject) =>
    receipt.webContents.print(
      {
        silent: settings.silentPrint,
        deviceName: settings.printer || "",
        printBackground: true,
      },
      (ok, reason) => {
        if (settings.silentPrint) receipt.close();
        if (ok) resolve("Comprovante enviado ao driver.");
        else if (reason === "cancelled") resolve("Impressão cancelada.");
        else reject(Error("Falha de impressão: " + reason));
      },
    ),
  );
}
const emitting = new Map();
app
  .whenReady()
  .then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("br.com.pdvsistem");
    const folder = app.getPath("userData");
    if (existsSync(join(folder, "fiscal", "chave.bin")))
      fiscal().catch((e) => dialog.showErrorBox("Emissor fiscal", e.message));
    mkdirSync(folder, { recursive: true });
    store = new Store(join(folder, "pdv.sqlite"));
    pixTimer = setInterval(() => {
      if (!existsSync(join(app.getPath("userData"), "mercadopago.bin"))) return;
      for (const c of store
        .read()
        .pixCharges.filter((c) =>
          ["creating", "pending", "approved"].includes(c.status),
        )
        .slice(0, 10)) {
        pixLock(c.id, async () => {
          const current = store.read().pixCharges.find((x) => x.id === c.id);
          if (current.status === "completed") return pixResult(current);
          const client = await pixClient();
          const payment = current.remoteId
            ? await client.get(current.remoteId)
            : await client.create({
                id: current.id,
                amount: current.amount,
                email: current.email,
              });
          const updated = recordCharge(current.id, payment);
          if (updated.status === "approved") {
            const previous = store.session;
            try {
              store.session = updated.user;
              const sale = finalizePix(store, updated.id);
              return {
                charge: store
                  .read()
                  .pixCharges.find((c) => c.id === updated.id),
                sale,
              };
            } finally {
              store.session = previous;
            }
          }
          return { charge: updated };
        }).catch((error) => {
          try {
            store.mutate((s) => {
              const charge = s.pixCharges.find((x) => x.id === c.id);
              if (charge) charge.lastError = error.message;
            });
          } catch {}
        });
      }
    }, 10000);

    handle("pdv", (e, a, p) => {
      trusted(e);
      return store.call(a, p);
    });
    handle("printers", async (e) => {
      trusted(e);
      store.user(store.read(), true);
      return (await win.webContents.getPrintersAsync()).map((p) => ({
        name: p.name,
        displayName: p.displayName,
      }));
    });
    handle("pix:configure", async (e, token) => {
      trusted(e);
      const user = store.user(store.read());
      if (user.role !== "admin")
        throw Error("Somente o administrador configura credenciais.");
      if (typeof token !== "string" || token.length < 10 || token.length > 1000)
        throw Error("Access Token inválido.");
      if (
        !(await safeStorage.isAsyncEncryptionAvailable()) ||
        (process.platform === "linux" &&
          safeStorage.getSelectedStorageBackend() === "basic_text")
      )
        throw Error("Ative o cofre de senhas do sistema para guardar o token.");
      const file = join(app.getPath("userData"), "mercadopago.bin");
      writeFileSync(
        file + ".tmp",
        await safeStorage.encryptStringAsync(token),
        { mode: 0o600 },
      );
      renameSync(file + ".tmp", file);
      store.mutate((s) =>
        store.audit(s, user, "pix.credentials", "Token atualizado no cofre"),
      );
      return true;
    });
    handle("pix:create", async (e, checkout, email) => {
      trusted(e);
      const client = await pixClient();
      const charge = reservePix(store, checkout, email);
      return pixLock(charge.id, async () => {
        const current = ownCharge(charge.id);
        const payment = current.remoteId
          ? await client.get(current.remoteId)
          : await client.create({
              id: current.id,
              amount: current.amount,
              email: current.email,
            });
        return pixResult(recordCharge(current.id, payment));
      });
    });
    handle("pix:check", async (e, id) => {
      trusted(e);
      const c = ownCharge(id);
      return pixLock(id, async () => {
        if (c.status === "completed") return pixResult(c);
        const client = await pixClient();
        const payment = c.remoteId
          ? await client.get(c.remoteId)
          : await client.create({ id: c.id, amount: c.amount, email: c.email });
        return pixResult(recordCharge(c.id, payment));
      });
    });
    handle("pix:cancel", async (e, id) => {
      trusted(e);
      if (pixLocks.has(id)) await pixLocks.get(id);
      const c = ownCharge(id);
      if (c.status === "completed" || c.status === "approved")
        throw Error(
          "O Pix já foi aprovado. Consulte a cobrança para concluir a venda.",
        );
      return pixLock(id, async () => {
        const client = await pixClient();
        if (!c.remoteId) throw Error("Consulte a cobrança antes de cancelar.");
        const payment = await client.cancel(c.remoteId);
        const updated = recordCharge(id, payment);
        if (!["cancelled", "rejected"].includes(updated.status))
          throw Error("O Mercado Pago ainda não confirmou o cancelamento.");
        return updated;
      });
    });
    handle("document", async (e, type, id, network = false) => {
      trusted(e);
      const state = store.read();
      const user = store.user(state);
      let lines = ["OmniPDV", "COMPROVANTE NAO FISCAL"];
      if (type === "movement") {
        const shift = state.shifts.find((c) =>
          c.movements.some((m) => m.id === id),
        );
        const m = shift?.movements.find((m) => m.id === id);
        if (!m) throw Error("Movimento não encontrado.");
        lines.push(
          m.type.toUpperCase(),
          m.at,
          "Operador: " + state.users.find((u) => u.id === m.user)?.name,
          "Valor: " + money(m.amount),
          "Motivo: " + m.reason,
          "Assinatura: __________________",
        );
      } else if (type === "shiftX" || type === "shiftZ") {
        const report = store.call("shiftReport", {
          id,
          type: type === "shiftX" ? "X" : "Z",
        });
        lines.push(
          "RESUMO GERENCIAL " + report.type,
          "Sem validade de leitura fiscal X/Z",
          report.generatedAt,
          "Abertura: " + money(report.opening),
          "Vendas: " + report.sales,
        );
        for (const [method, value] of Object.entries(report.methods))
          lines.push(method + ": " + money(value));
        if (report.counted)
          for (const method of Object.keys(report.counted))
            lines.push(
              method +
                " contado " +
                money(report.counted[method]) +
                " / divergencia " +
                money(report.divergences[method]),
            );
      } else if (type === "debt") {
        const d = state.receivables.find((d) => d.id === id);
        if (!d) throw Error("Conta não encontrada.");
        lines.push(
          "COMPROVANTE DE DEBITO",
          state.customers.find((c) => c.id === d.customer)?.name,
          "Data: " + d.at,
          "Valor: " + money(d.total),
          "Saldo: " + money(d.balance),
          "Assinatura: __________________",
        );
      } else if (type === "settlement") {
        const t = state.settlements.find((t) => t.id === id);
        if (!t) throw Error("Recebimento não encontrado.");
        lines.push(
          "RECEBIMENTO DE CADERNETA",
          state.customers.find((c) => c.id === t.customer)?.name,
          t.at,
          t.method + ": " + money(t.amount),
        );
      } else throw Error("Documento desconhecido.");
      if (network) {
        if (!state.settings.thermalHost)
          throw Error("Configure o endereço da impressora.");
        return sendThermal(state.settings, lines);
      }
      return printLines(lines, state.settings);
    });
    handle("fiscal:fetch", async (e, p) => {
      trusted(e);
      store.user(store.read(), true);
      const url = new URL(p.url, "http://local");
      if (!url.pathname.startsWith("/v1/")) throw Error("Rota não permitida.");
      if (p.metodo === "POST" && /^\/v1\/nfc?e$/.test(url.pathname))
        throw Error("Emita a partir de uma venda registrada.");
      const a = await fiscal();
      const r = await a.fetch(url.pathname + url.search, {
        method: p.metodo,
        headers: p.cabecalhos.filter(
          ([k]) => k.toLowerCase() !== "authorization",
        ),
        ...(p.corpo !== null && !["GET", "HEAD"].includes(p.metodo)
          ? { body: p.corpo }
          : {}),
      });
      return {
        status: r.status,
        cabecalhos: [...r.headers],
        corpo: new Uint8Array(await r.arrayBuffer()),
      };
    });
    handle("emit", async (e, id) => {
      trusted(e);
      const payload = store.fiscalPayload(id);
      if (emitting.has(id)) return emitting.get(id);
      const run = (async () => {
        const a = await fiscal();
        const existing = store.read().sales.find((v) => v.id === id).fiscal;
        if (
          existing?.chave &&
          !["rejeitada", "denegada"].includes(existing.situacao)
        ) {
          const response = await a.fetch("/v1/nfce/" + existing.chave);
          const updated = await response.json();
          if (!response.ok || updated.erro)
            throw Error(updated.erro?.mensagem || "Falha ao consultar NFC-e.");
          const result = { ...existing, ...updated, chave: existing.chave };
          store.recordFiscal(id, result);
          return result;
        }
        store.recordFiscal(id, { situacao: "emissao-em-andamento" });
        const r = await a.fetch("/v1/nfce", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "pdv-" + id,
          },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (data.erro) {
          if (data.erro.codigo === "EMISSOR_NAO_CONFIGURADO")
            store.recordFiscal(id, null);
          throw Error(data.erro.mensagem);
        }
        store.recordFiscal(id, data);
        return data;
      })();
      emitting.set(id, run);
      try {
        return await run;
      } finally {
        emitting.delete(id);
      }
    });
    handle("cancelFiscal", async (e, id, justificativa, approval) => {
      trusted(e);
      const state = store.read();
      const actor = store.user(state);
      const authorized = approve(state, actor, { approval });
      const sale = state.sales.find((v) => v.id === id);
      if (!sale?.fiscal?.chave) throw Error("Venda sem chave fiscal.");
      if (typeof justificativa !== "string" || justificativa.trim().length < 15)
        throw Error("Justificativa deve ter pelo menos 15 caracteres.");
      const a = await fiscal();
      const r = await a.fetch(
        "/v1/nfce/" + sale.fiscal.chave + "/cancelamento",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ justificativa }),
        },
      );
      const result = await r.json();
      if (!r.ok || result.erro)
        throw Error(result.erro?.mensagem || "Cancelamento não confirmado.");
      if (result.situacao !== "cancelada")
        throw Error("Cancelamento não confirmado.");
      store.recordFiscal(id, {
        ...sale.fiscal,
        ...result,
        chave: sale.fiscal.chave,
      });
      store.mutate((s) =>
        store.audit(s, actor, "fiscal.cancel", {
          sale: id,
          authorizedBy: authorized.id,
        }),
      );
      return "Cancelamento fiscal confirmado. Registre agora a devolução integral e o reembolso.";
    });
    handle("backup", async (e) => {
      trusted(e);
      store.user(store.read(), true);
      const r = await dialog.showSaveDialog(win, {
        defaultPath: "pdv-backup.sqlite",
      });
      if (!r.canceled) {
        await backup(store.db, r.filePath);
        return "Backup do PDV salvo. Os XMLs e o certificado ficam na pasta fiscal e precisam de backup separado.";
      }
      return "Backup cancelado.";
    });
    handle("receipt", async (e, id, network = false) => {
      trusted(e);
      const s = store.read();
      store.user(s);
      const sale = s.sales.find((x) => x.id === id && !x.deletedAt);
      if (!sale) throw Error("Venda não encontrada.");
      if (network) {
        if (!s.settings.thermalHost)
          throw Error("Configure a impressora de rede.");
        return sendThermal(s.settings, [
          "OmniPDV",
          "RECIBO NAO FISCAL",
          "Venda " + sale.number,
          ...sale.items.map(
            (i) =>
              `${i.qty} ${i.unit || "UN"} ${i.name} ${money(lineTotal(i.price, i.qty))}`,
          ),
          "Total: " + money(sale.total),
          ...sale.payments.map((p) => p.forma + ": " + money(p.amount)),
          "Troco: " + money(sale.change),
        ]);
      }
      const path = join(app.getPath("temp"), "pdv-recibo-" + sale.id + ".html");
      writeFileSync(
        path,
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Recibo — OmniPDV</title><style>body{font:14px monospace;max-width:300px;margin:20px auto}hr{border:0;border-top:1px dashed}table{width:100%}td:last-child{text-align:right}</style><img alt="" src="${receiptLogo}" style="width:48px;height:48px"><h2>OmniPDV</h2><b>RECIBO NÃO FISCAL</b><p>Venda ${sale.number} · ${escape(new Date(sale.at).toLocaleString("pt-BR"))}</p><p>Cliente: ${escape(s.customers.find((c) => c.id === sale.customer)?.name || "Consumidor")}</p><hr>${sale.items.map((i) => `<p>${i.qty} × ${escape(i.name)} — ${money(lineTotal(i.price, i.qty))}</p>`).join("")}<hr><p>Desconto: ${money(sale.discount)}</p><h3>Total: ${money(sale.total)}</h3>${sale.payments.map((p) => `<p>${escape(p.forma)}: ${money(p.amount)}</p>`).join("")}<p>Troco: ${money(sale.change)}</p><p>Devolvido: ${money(sale.returns.reduce((a, r) => a + r.refund, 0))}</p></html>`,
      );
      const receipt = new BrowserWindow({
        icon: appIcon,
        width: 430,
        height: 700,
        parent: win,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      receipt.removeMenu();
      receipt.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      await receipt.loadFile(path);
      receipt.webContents.print(
        {
          silent: s.settings.silentPrint,
          deviceName: s.settings.printer || "",
          printBackground: true,
          pageSize: { width: s.settings.paper * 1000, height: 200000 },
        },
        (ok, reason) => {
          if (!ok && reason !== "cancelled")
            dialog.showErrorBox("Impressão", reason);
        },
      );
      return true;
    });
    win = new BrowserWindow({
      icon: appIcon,
      width: 1440,
      height: 940,
      minWidth: 1000,
      minHeight: 700,
      title: "OmniPDV",
      backgroundColor: "#f5f6fa",
      webPreferences: {
        preload: join(here, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.removeMenu();
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    await win.loadFile(join(here, "../dist/index.html"));
    if (process.env.PDV_SMOKE) {
      await (await import("./smoke.mjs")).smoke(win);
      app.quit();
    }
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
app.on("window-all-closed", () => app.quit());
let closing = false;
app.on("before-quit", (e) => {
  if (closing) return;
  e.preventDefault();
  closing = true;
  if (pixTimer) clearInterval(pixTimer);
  Promise.resolve(agentPromise)
    .catch(() => {})
    .then(() => Promise.allSettled([...pixLocks.values()]))
    .then(() => agent?.parar())
    .finally(() => {
      store?.close();
      app.quit();
    });
});
