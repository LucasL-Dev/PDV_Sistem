import {writeFileSync} from 'node:fs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function smoke(win){
 const js=code=>win.webContents.executeJavaScript(code);
 async function until(code){for(let n=0;n<80;n++){if(await js(code))return;await wait(100);}throw Error('Tela não ficou pronta: '+code+' TEXTO: '+await js('document.body.innerText'));}
 const click=label=>js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(label)}))?.click()`);
 await until("document.body.innerText.includes('Crie o administrador')");
 await js(`(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [name,value] of [['name','Administrador'],['login','admin'],['password','smoke-password']]){const input=document.querySelector('[name="'+name+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`);
 await until("document.body.innerText.includes('Catálogo de produtos')");
 await js(`(async()=>{await window.pdv.call('login',{login:'admin',password:'smoke-password'});const products=[['Café especial','Bebidas',2490],['Chocolate 70%','Doces',1290],['Caderno pontilhado','Papelaria',3590],['Caneca cerâmica','Casa',4590],['Chá de camomila','Bebidas',1690],['Biscoito artesanal','Alimentos',1890]];for(let i=0;i<products.length;i++)await window.pdv.call('product',{name:products[i][0],barcode:'789000'+i,category:products[i][1],price:products[i][2],stock:20});await window.pdv.call('customer',{name:'Maria Silva',phone:'11999990000'});await window.pdv.call('openShift',{opening:10000});})()`);
 await click('Sair da conta');
 await until("document.body.innerText.includes('Bem-vindo de volta')");
 // Enter through the actual login form, exercising React and the preload bridge.
 await js(`(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [name,value] of [['login','admin'],['password','smoke-password']]){const input=document.querySelector('[name="'+name+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('form').requestSubmit();})()`);
 await until("document.body.innerText.includes('Catálogo de produtos')");
 await click('Café especial');await click('Chocolate 70%');
 await until("document.body.innerText.includes('R$ 37,80')");
 const image=await win.webContents.capturePage();writeFileSync('/tmp/pdv-sistem.png',image.toPNG());
 await js(`(()=>{const input=document.querySelector('[aria-label="Valor pago"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'50');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await click('Concluir venda');
 await until("document.body.innerText.includes('Venda concluída')");
 const state=await js(`window.pdv.call('snapshot')`);
 if(state.sales.length!==1||state.sales[0].total!==3780||state.sales[0].change!==1220||state.products[0].stock!==19)throw Error('Venda Electron incorreta.');
 await click('Relatórios');await until("document.body.innerText.includes('Receita líquida do dia')");
 await click('Funcionários');await until("document.body.innerText.includes('Adicionar funcionário')");
 await click('Documentos fiscais');await until("document.body.innerText.includes('cofre de senhas') || document.body.innerText.includes('Empresa') || document.body.innerText.includes('Configurar emissor')");
 console.log('PDV_SMOKE_OK: login, catálogo, carrinho, venda, pagamento, troco, estoque, relatórios, funcionários e tela fiscal.');
}
