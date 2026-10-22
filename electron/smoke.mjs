import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function smoke(win) {
  const js = (code) => win.webContents.executeJavaScript(code);
  async function until(code) {
    for (let n = 0; n < 80; n++) {
      if (await js(code)) return;
      await wait(100);
    }
    throw Error(
      "Tela não ficou pronta: " +
        code +
        " TEXTO: " +
        (await js("document.body.innerText")),
    );
  }
  const click = (label) =>
    js(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(label)}))?.click()`,
    );
  await until("document.body.innerText.includes('Crie o administrador')");
  await until(
    "document.title === 'OmniPDV' && document.querySelector('.brand-mark')?.naturalWidth > 0",
  );
  if (win.getTitle() !== "OmniPDV") throw Error("Nome da janela incorreto.");
  await js(
    `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [name,value] of [['name','Administrador'],['login','admin'],['password','smoke-password']]){const input=document.querySelector('[name="'+name+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`,
  );
  await until("document.body.innerText.includes('Catálogo de produtos')");
  await js(
    `(async()=>{await window.pdv.call('login',{login:'admin',password:'smoke-password'});const products=[['Café especial','Bebidas',2490],['Chocolate 70%','Doces',1290],['Caderno pontilhado','Papelaria',3590],['Caneca cerâmica','Casa',4590],['Chá de camomila','Bebidas',1690],['Biscoito artesanal','Alimentos',1890]];for(let i=0;i<products.length;i++)await window.pdv.call('product',{name:products[i][0],barcode:'789000'+i,category:products[i][1],price:products[i][2],stock:20});await window.pdv.call('customer',{name:'Maria Silva',phone:'11999990000'});await window.pdv.call('employee',{name:'Funcionário temporário',login:'temporario',password:'smoke-password',role:'cashier',active:true});await window.pdv.call('employee',{name:'Operador Turno',login:'turno',password:'smoke-password',role:'cashier',active:true});await window.pdv.call('openShift',{opening:10000});})()`,
  );
  await click("Sair da conta");
  await until("document.body.innerText.includes('Bem-vindo de volta')");
  const loginError = await js(
    "window.pdv.call('login',{login:'admin',password:'senha-errada'}).then(()=>null,e=>e.message)",
  );
  if (loginError !== "Usuário ou senha incorretos.")
    throw Error(
      "Mensagem de erro contém detalhes do transporte: " + loginError,
    );
  // Enter through the actual login form, exercising React and the preload bridge.
  await js(
    `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [name,value] of [['login','admin'],['password','smoke-password']]){const input=document.querySelector('[name="'+name+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`,
  );
  await until("document.body.innerText.includes('Catálogo de produtos')");
  // Secondary cash controls must remain accessible without crowding the sale.
  await click("Gerenciar caixa");
  await until("Boolean(document.querySelector('dialog[open]'))");
  await until(
    "document.querySelector('dialog[open]').innerText.includes('Movimentar dinheiro')",
  );
  await js("document.querySelector('dialog[open]').close()");
  await until("!document.querySelector('dialog')");
  await until("!document.querySelector('dialog[open]')");
  await js("document.querySelector('.sale-options').open=true");
  await until("Boolean(document.querySelector('.sale-options select'))");
  await js("document.querySelector('.sale-options').open=false");
  await js(
    "(()=>{const select=document.querySelector('[aria-label=\"Tema do aplicativo\"]');select.value='dark';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await until(
    "document.documentElement.dataset.theme==='dark' && localStorage.getItem('omnipdv-theme')==='dark'",
  );
  if ((await js("localStorage.getItem('omnipdv-theme')")) !== "dark")
    throw Error("Preferência de tema não persistida.");
  await js(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F6',bubbles:true}))",
  );
  await until("Boolean(document.querySelector('dialog[open]'))");
  if (
    !(await js(
      "document.querySelector('dialog[open]').innerText.includes('R$')",
    ))
  )
    throw Error("Consulta rápida sem preços.");
  await js("document.querySelector('dialog[open]').close()");
  await until("!document.querySelector('dialog')");
  await js(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F1',bubbles:true}))",
  );
  await until(
    "document.activeElement===document.querySelector('[aria-label=\"Buscar produto ou código de barras\"]')",
  );
  for (const code of ["7890000", "7890001"]) {
    await js(
      `(()=>{const input=document.querySelector('[aria-label="Buscar produto ou código de barras"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(code)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await js(
      "document.querySelector('[aria-label=\"Buscar produto ou código de barras\"]').form.requestSubmit()",
    );
    await until(
      "document.querySelector('[aria-label=\"Buscar produto ou código de barras\"]').value===''",
    );
    if (
      !(await js(
        "document.activeElement===document.querySelector('[aria-label=\"Buscar produto ou código de barras\"]')",
      ))
    )
      throw Error("Leitor perdeu foco.");
  }
  await until("document.body.innerText.includes('R$ 37,80')");
  await js(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F12',bubbles:true}))",
  );
  await until(
    "Boolean(document.querySelector('dialog[open] input[name=qty]'))",
  );
  await js("document.querySelector('dialog[open] form').requestSubmit()");
  await until("!document.querySelector('dialog[open]')");
  await until("document.body.innerText.includes('R$ 37,80')");
  await js(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
  const image = await win.webContents.capturePage();
  writeFileSync(join(tmpdir(), "omnipdv.png"), image.toPNG());
  await js(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true}))",
  );
  await until("Boolean(document.querySelector('dialog[open]'))");
  await until("getComputedStyle(document.querySelector('.payment-dialog .payment')).gap==='14px'");
  writeFileSync(join(tmpdir(), "omnipdv-pagamento.png"), (await win.webContents.capturePage()).toPNG());
  await click("R$ 50");
  await until(
    "document.querySelector('[aria-label=\"Valor pago\"]').value==='50.00'",
  );
  await click("Concluir venda");
  await until("document.body.innerText.includes('Venda concluída')");
  const state = await js(`window.pdv.call('snapshot')`);
  if (
    state.sales.length !== 1 ||
    state.sales[0].total !== 3780 ||
    state.sales[0].change !== 1220 ||
    state.products[0].stock !== 19
  )
    throw Error("Venda Electron incorreta.");
  await click("Frente de caixa");
  await until("document.body.innerText.includes('Catálogo de produtos')");
  if (await js("Boolean(document.querySelector('dialog[open]'))"))
    throw Error("Pagamento anterior permaneceu aberto.");
  await js(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F4',bubbles:true}))",
  );
  await until(
    "document.querySelector('.sale-options').open && document.activeElement===document.querySelector('.sale-options input')",
  );
  await js("document.querySelector('.sale-options').open=false");
  for (const key of ["F3", "Escape"]) {
    await click("Café especial");
    await until("document.body.innerText.includes('1 itens')");
    await js(
      `window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}))`,
    );
    await until(
      "Boolean(document.querySelector('dialog[open] input[name=reason]'))",
    );
    await js(
      "(()=>{const form=document.querySelector('dialog[open] form');form.elements.reason.value='Teste de cancelamento';form.requestSubmit();})()",
    );
    await until("!document.querySelector('dialog[open]')");
  }
  const cancellations = await js("window.pdv.call('snapshot')");
  if (
    cancellations.cancellations.length !== 2 ||
    cancellations.products[0].stock !== 19
  )
    throw Error("Cancelamento de pré-venda não foi auditado corretamente.");
  await click("Relatórios");
  await until("document.body.innerText.includes('Receita líquida do dia')");
  await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Exportar Excel'))");
  await click("Clientes");
  await until("document.body.innerText.includes('Clientes e histórico')");
  await js("document.querySelector('.editor summary').click()");
  await until("document.querySelector('.editor details').open");
  await js("document.querySelector('.editor form').requestSubmit()");
  await until("document.body.innerText.includes('Cliente não identificado')");

  await click("Produtos e estoque");
  await until("Boolean(document.querySelector('.editor details'))");
  await js("document.querySelector('.editor summary').click()");
  await until("document.querySelector('.editor details').open");
  await js("document.querySelector('.tax-fields summary').click()");
  await until("document.querySelector('.tax-fields').open");
  await click("Funcionários");
  await until("document.body.innerText.includes('Adicionar funcionário')");
  // Exclusões pela interface: cancelar deve preservar, confirmar deve remover.
  await until(
    "Boolean(document.querySelector('[aria-label=\"Excluir funcionário Funcionário temporário\"]'))",
  );
  await js(
    "document.querySelector('[aria-label=\"Excluir funcionário Funcionário temporário\"]').click()",
  );
  await until("Boolean(document.querySelector('dialog[open]'))");
  await click("Confirmar exclusão");
  await until(
    "!document.querySelector('[aria-label=\"Excluir funcionário Funcionário temporário\"]')",
  );
  await click("Produtos e estoque");
  await js(
    "document.querySelector('[aria-label=\"Excluir produto Café especial\"]').click()",
  );
  await until("Boolean(document.querySelector('dialog[open]'))");
  await click("Voltar");
  if (
    !(await js(
      "Boolean(document.querySelector('[aria-label=\"Excluir produto Café especial\"]'))",
    ))
  )
    throw Error("Cancelar excluiu o produto.");
  await js(
    "document.querySelector('[aria-label=\"Excluir produto Café especial\"]').click()",
  );
  await until("Boolean(document.querySelector('dialog[open]'))");
  await click("Confirmar exclusão");
  await until(
    "!document.querySelector('[aria-label=\"Excluir produto Café especial\"]')",
  );
  await click("Vendas e devoluções");
  await click("Excluir vendas do dia");
  await until("Boolean(document.querySelector('dialog[open]'))");
  await click("Confirmar exclusão");
  await until("!document.querySelector('dialog[open]')");
  const deleted = await js("window.pdv.call('snapshot')");
  if (
    deleted.sales.length !== 0 ||
    deleted.products.find((p) => p.name === "Chocolate 70%").stock !== 20
  )
    throw Error("Exclusão diária não restaurou estoque/relatório.");
  await click("Documentos fiscais");
  await until(
    "document.body.innerText.includes('cofre de senhas') || document.body.innerText.includes('Empresa') || document.body.innerText.includes('Configurar emissor')",
  );
  await click("Sair da conta");
  await until("document.body.innerText.includes('Bem-vindo de volta')");
  await js(
    `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [name,value] of [['login','turno'],['password','smoke-password']]){const input=document.querySelector('[name="'+name+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`,
  );
  await until("document.body.innerText.includes('Catálogo de produtos')");
  await click("Gerenciar caixa");
  await until("Boolean(document.querySelector('.close-shift form'))");
  await js(
    "(()=>{const form=document.querySelector('.close-shift form');for(const method of ['dinheiro','pix','credito','debito','fiado'])form.elements[method].value=method==='dinheiro'?'100':'0';form.requestSubmit();})()",
  );
  await until("!document.querySelector('dialog[open]')");
  const closed = await js("window.pdv.call('snapshot')");
  if (
    !closed.shifts[0].closedAt ||
    closed.shifts[0].expected !== undefined ||
    closed.shifts[0].divergences !== undefined
  )
    throw Error("Fechamento cego expôs a conferência.");
  console.log(
    "PDV_SMOKE_OK: login, catálogo, carrinho, venda, pagamento, troco, estoque, relatórios, funcionários e tela fiscal.",
  );
}
