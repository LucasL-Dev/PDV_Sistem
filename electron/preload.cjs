const { contextBridge, ipcRenderer } = require("electron");
async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld("pdv", {
  call: (action, payload) => invoke("pdv", action, payload),
  print: (id, network = false) => invoke("receipt", id, network),
  document: (type, id, network = false) =>
    invoke("document", type, id, network),
  printers: () => invoke("printers"),
  pixConfigure: (token) => invoke("pix:configure", token),
  pixCreate: (checkout, email) => invoke("pix:create", checkout, email),
  pixCheck: (id) => invoke("pix:check", id),
  pixCancel: (id) => invoke("pix:cancel", id),
  emit: (id) => invoke("emit", id),
  cancelFiscal: (id, reason, approval) =>
    invoke("cancelFiscal", id, reason, approval),
  exportExcel: () => invoke("export:excel"),
  backup: () => invoke("backup"),
});
contextBridge.exposeInMainWorld("fiscal", {
  chamar: (pedido) => invoke("fiscal:fetch", pedido),
});
