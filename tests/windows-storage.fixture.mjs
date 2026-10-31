import { app, safeStorage } from 'electron';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { ProtectedStorage } from '../electron/licensing/storage.mjs';
if(process.platform!=='win32'||!process.env.PDV_STORAGE_TEST_DIR)throw Error('Fixture exige Windows e pasta temporária dedicada.');
app.whenReady().then(async()=>{
 const path=join(process.env.PDV_STORAGE_TEST_DIR,'session.bin');
 const storage=new ProtectedStorage(path,safeStorage);
 const expected={refresh_token:'synthetic-refresh-DPAPI-restart-fixture',session_id:'synthetic-session'};
 if(process.env.PDV_STORAGE_TEST_PHASE==='write')await storage.save(expected);
 else assert.deepEqual(await storage.load(),expected);
 const ciphertext=await readFile(path);assert.ok(!ciphertext.includes(Buffer.from(expected.refresh_token)));assert.ok(!ciphertext.includes(Buffer.from('session_id')));
 await assert.rejects(access(path+'.tmp'));
 console.log('WINDOWS_DPAPI_OK: sessão cifrada, leitura protegida e troca atômica.');app.quit();
}).catch(()=>{console.error('WINDOWS_DPAPI_FAILED');app.exit(1);});
