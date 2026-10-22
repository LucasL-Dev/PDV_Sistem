import { app, BrowserWindow, ipcMain, safeStorage, dialog } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
let store, win, agent, agentPromise;
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
    ipcMain.handle("pdv", (e, a, p) => {
      trusted(e);
      return store.call(a, p);
    });
    ipcMain.handle("fiscal:fetch", async (e, p) => {
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
    ipcMain.handle("emit", async (e, id) => {
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
    ipcMain.handle("cancelFiscal", async (e, id, justificativa) => {
      trusted(e);
      const state = store.read();
      store.user(state, true);
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
      return "Cancelamento fiscal confirmado. Registre agora a devolução integral e o reembolso.";
    });
    ipcMain.handle("backup", async (e) => {
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
    ipcMain.handle("receipt", async (e, id) => {
      trusted(e);
      const s = store.read();
      store.user(s);
      const sale = s.sales.find((x) => x.id === id);
      if (!sale) throw Error("Venda não encontrada.");
      const path = join(app.getPath("temp"), "pdv-recibo-" + sale.id + ".html");
      writeFileSync(
        path,
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Recibo — OmniPDV</title><style>body{font:14px monospace;max-width:300px;margin:20px auto}hr{border:0;border-top:1px dashed}table{width:100%}td:last-child{text-align:right}</style><img alt="" src="${receiptLogo}" style="width:48px;height:48px"><h2>OmniPDV</h2><b>RECIBO NÃO FISCAL</b><p>Venda ${sale.number} · ${escape(new Date(sale.at).toLocaleString("pt-BR"))}</p><p>Cliente: ${escape(s.customers.find((c) => c.id === sale.customer)?.name || "Consumidor")}</p><hr>${sale.items.map((i) => `<p>${i.qty} × ${escape(i.name)} — ${money(i.price * i.qty)}</p>`).join("")}<hr><p>Desconto: ${money(sale.discount)}</p><h3>Total: ${money(sale.total)}</h3>${sale.payments.map((p) => `<p>${escape(p.forma)}: ${money(p.amount)}</p>`).join("")}<p>Troco: ${money(sale.change)}</p><p>Devolvido: ${money(sale.returns.reduce((a, r) => a + r.refund, 0))}</p></html>`,
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
        { silent: false, printBackground: true },
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
  Promise.resolve(agentPromise)
    .catch(() => {})
    .then(() => agent?.parar())
    .finally(() => {
      store?.close();
      app.quit();
    });
});
