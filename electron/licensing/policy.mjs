const recovery = new Set(['bootstrap','login','logout','status','snapshot','shiftReport']);
export function checkOperation(manager, action) {
  if (!recovery.has(action)) manager.assertCommercial();
}
export function checkFiscal(manager, method) {
  if (!['GET','HEAD'].includes(method)) manager.assertCommercial();
}
