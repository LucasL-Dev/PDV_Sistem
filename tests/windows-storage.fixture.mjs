import { app, safeStorage, BrowserWindow } from 'electron';
import { readFile, access, appendFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { ProtectedStorage } from '../electron/licensing/storage.mjs';
if(process.platform!=='win32'||!process.env.PDV_STORAGE_TEST_DIR)throw Error('Fixture exige Windows e pasta temporária dedicada.');
// Match the application: choose a stable, isolated userData path before ready.
const profile=join(process.env.PDV_STORAGE_TEST_DIR,'profile');mkdirSync(profile,{recursive:true});
app.setName('OmniPDV');app.setPath('userData',profile);
let stage='ready';
const diagnostic=async(result)=>{if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`DPAPI ${process.env.PDV_STORAGE_TEST_PHASE}: ${result} (${stage})\n`);};
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await window.loadURL('about:blank');
 const path=join(process.env.PDV_STORAGE_TEST_DIR,'session.bin');
 const storage=new ProtectedStorage(path,safeStorage);
 const expected={refresh_token:'synthetic-refresh-DPAPI-restart-fixture',session_id:'synthetic-session'};
 stage='protected-storage';
 if(process.env.PDV_STORAGE_TEST_PHASE==='write')await storage.save(expected);
 else assert.deepEqual(await storage.load(),expected);
 stage='ciphertext';const ciphertext=await readFile(path);assert.ok(!ciphertext.includes(Buffer.from(expected.refresh_token)));assert.ok(!ciphertext.includes(Buffer.from('session_id')));
 stage='atomic-rename';await assert.rejects(access(path+'.tmp'));
 await diagnostic('ok');console.log('WINDOWS_DPAPI_OK: sessão cifrada, leitura protegida e troca atômica.');window.destroy();app.quit();
}).catch(async()=>{await diagnostic('failed').catch(()=>{});console.error('WINDOWS_DPAPI_FAILED: '+stage);app.exit(1);});
