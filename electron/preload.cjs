const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pdv', {call:(action,payload)=>ipcRenderer.invoke('pdv',action,payload),print:id=>ipcRenderer.invoke('receipt',id),emit:id=>ipcRenderer.invoke('emit',id),cancelFiscal:(id,reason)=>ipcRenderer.invoke('cancelFiscal',id,reason),backup:()=>ipcRenderer.invoke('backup')});
contextBridge.exposeInMainWorld('fiscal',{chamar:pedido=>ipcRenderer.invoke('fiscal:fetch',pedido)});
