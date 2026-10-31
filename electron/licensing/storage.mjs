import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
export class ProtectedStorage {
  constructor(file, safeStorage, platform=process.platform) { this.file=file; this.safe=safeStorage; this.platform=platform; }
  async ready() {
    if(this.platform==='win32'){
      if(!this.safe.isEncryptionAvailable())throw Error('Ative a proteção de credenciais do Windows para entrar na conta.');
      return;
    }
    if (!(await this.safe.isAsyncEncryptionAvailable()) || (this.platform==='linux' && this.safe.getSelectedStorageBackend()==='basic_text'))
      throw Error('Ative a proteção de credenciais do sistema para entrar na conta.');
  }
  async load() {
    await this.ready();
    let encrypted; try { encrypted=await readFile(this.file); } catch(e) { if(e.code==='ENOENT')return null; throw Error('Não foi possível ler a sessão protegida.'); }
    try {
      if(this.platform==='win32'){
        try {return JSON.parse(this.safe.decryptString(encrypted));}
        catch {
          // Read older async-encrypted sessions when that provider is available.
          // New writes always use Windows DPAPI via the stable synchronous API.
          return JSON.parse(await this.safe.decryptStringAsync(encrypted));
        }
      }
      return JSON.parse(await this.safe.decryptStringAsync(encrypted));
    } catch { throw Error('Sessão protegida ilegível. Os dados comerciais foram preservados.'); }
  }
  async save(value) {
    await this.ready(); await mkdir(dirname(this.file),{recursive:true});
    const plain=JSON.stringify(value);
    const encrypted=this.platform==='win32'?this.safe.encryptString(plain):await this.safe.encryptStringAsync(plain);
    await writeFile(this.file+'.tmp',encrypted,{mode:0o600}); await rename(this.file+'.tmp',this.file);
  }
}
