const { contextBridge, ipcRenderer } = require("electron");
async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld("pdv", {
  call: (action, payload) => invoke("pdv", action, payload),
  print: (id) => invoke("receipt", id),
  emit: (id) => invoke("emit", id),
  cancelFiscal: (id, reason) => invoke("cancelFiscal", id, reason),
  backup: () => invoke("backup"),
});
contextBridge.exposeInMainWorld("fiscal", {
  chamar: (pedido) => invoke("fiscal:fetch", pedido),
});
