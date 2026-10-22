import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { Store } from '../electron/store.mjs';
import { exportWorkbook } from '../electron/export.mjs';

function setup() {
  const store = new Store(':memory:');
  store.call('bootstrap', { name: 'Admin', login: 'admin', password: 'secret-password' });
  const product = store.call('product', { name: '=HYPERLINK("https://example.com")', barcode: '0012345678901', category: 'Teste', price: 1234, stock: 5, unit: 'KG' });
  store.call('openShift', { opening: 10000 });
  store.call('sale', { id: crypto.randomUUID(), items: [{id: product.id, qty: 0.125}], discount: 0, payments: [{forma: 'dinheiro', amount: 200}] });
  return store;
}
test('Excel roundtrip preserves money, fractional stock, text barcodes and formula-like names without exporting credentials', async () => {
  const store = setup();
  try {
    store.mutate(s => { s.settings.secret = 'never-export-this'; s.audit.push({at: '2026-10-22', user: s.users[0].id, action: 'test', details: {password: 'never-export-audit'}}); s.products[0].deletedAt = '2026-10-22'; });
    const buffer = await exportWorkbook(store).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    assert.equal(workbook.worksheets.length, 16);
    const products = workbook.getWorksheet('Produtos');
    assert.equal(products.getCell('C2').value, '0012345678901');
    assert.equal(products.getCell('B2').value, '=HYPERLINK("https://example.com")');
    assert.equal(products.getCell('B2').type, ExcelJS.ValueType.String);
    assert.equal(products.getCell('F2').value, 12.34);
    assert.equal(products.getCell('G2').value, 4.875);
    assert.equal(products.getCell('H2').value, 'Excluído');
    assert.equal(workbook.getWorksheet('Vendas').getCell('I2').value, 1.54);
    assert.equal(workbook.getWorksheet('Vendas').getCell('J2').value, 0.46);
    assert.equal(workbook.getWorksheet('Itens vendidos').getCell('F2').value, 0.125);
    assert.equal(workbook.getWorksheet('Itens vendidos').getCell('H2').value, 1.54);
    assert.match(products.getCell('F2').numFmt, /R\$/);
    const text = JSON.stringify(workbook.worksheets.map(ws => ws.getSheetValues()));
    for (const value of ['secret-password', 'never-export-this', 'never-export-audit', store.read().users[0].password]) assert.ok(!text.includes(value));
    assert.equal(products.views[0].ySplit, 1);
  } finally { store.db.close(); }
});
test('Excel export requires a logged-in manager or administrator', () => {
  const store = setup();
  try {
    store.call('employee', {name:'Operador', login:'cashier', password:'password123', role:'cashier', active:true});
    store.call('login', {login:'cashier', password:'password123'});
    assert.throws(() => exportWorkbook(store), /Acesso restrito/);
    store.call('logout');
    assert.throws(() => exportWorkbook(store), /Entre no sistema/);
  } finally { store.db.close(); }
});
test('customer personal data is optional and anonymous customers retain distinct identities', () => {
  const store = setup();
  try {
    const a = store.call('customer', {});
    const b = store.call('customer', {name: '   ', document: '', phone: ''});
    assert.match(a.name, /^Cliente não identificado/);
    assert.notEqual(a.name, b.name);
    assert.equal(a.document, '');
    assert.equal(a.phone, '');
    assert.equal(a.creditLimit, 0);
    const edited = store.call('customer', {id: a.id, name: 'Maria'});
    assert.equal(edited.id, a.id);
    assert.equal(edited.name, 'Maria');
    const sale = store.read().sales[0];
    assert.equal(sale.customer, null);
  } finally { store.db.close(); }
});
