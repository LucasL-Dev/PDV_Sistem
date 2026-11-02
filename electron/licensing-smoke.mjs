export async function licenseSmoke(win) {
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async(code)=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Interface de licenciamento não ficou pronta.');};
  await wait("document.body.innerText.includes('Entrar na minha conta')");
  const state=await js('window.license.status()');
  if(state.authorized || JSON.stringify(state).includes('token'))throw Error('Estado público de licença inválido.');
  await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Consultar e recuperar')).click()");
  await wait("document.body.innerText.includes('Crie o administrador')");
  await js(`(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [name,value] of [['name','Admin'],['login','admin'],['password','smoke-password']]){const input=document.querySelector('[name="'+name+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`);
  await wait("document.body.innerText.includes('Catálogo de produtos')");
  for(const code of [
    "window.pdv.call('openShift',{opening:0})",
    "window.pdv.call('product',{name:'Denied',barcode:'123',category:'Test',stock:1,price:100})",
    "window.pdv.pixCreate({},'')", "window.pdv.emit('unknown')",
    "window.fiscal.chamar({url:'/v1/admin/empresas/principal',metodo:'PUT',cabecalhos:[],corpo:'{}'})",
  ]) {
    if(!(await js(`(${code}).then(()=>false,()=>true)`)))throw Error('Operação comercial sem licença foi aceita.');
  }
  const snapshot=await js("window.pdv.call('snapshot')");
  if(snapshot.products.length || snapshot.shifts.length || snapshot.sales.length)throw Error('Bloqueio alterou dados comerciais.');
  await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Relatórios')).click()");
  await wait("document.body.innerText.includes('Exportar Excel')");
  console.log('PDV_LICENSE_SMOKE_OK: ativação, recuperação, autenticação local, bloqueio IPC e preservação.');
}
