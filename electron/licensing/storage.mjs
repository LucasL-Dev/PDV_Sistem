import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
export class ProtectedStorage {
  constructor(file, safeStorage) { this.file=file; this.safe=safeStorage; }
  async ready() {
    if (!(await this.safe.isAsyncEncryptionAvailable()) || (process.platform==='linux' && this.safe.getSelectedStorageBackend()==='basic_text'))
      throw Error('Ative a proteção de credenciais do sistema para entrar na conta.');
  }
  async load() {
    await this.ready();
    let encrypted; try { encrypted=await readFile(this.file); } catch(e) { if(e.code==='ENOENT')return null; throw Error('Não foi possível ler a sessão protegida.'); }
    try { return JSON.parse(await this.safe.decryptStringAsync(encrypted)); } catch { throw Error('Sessão protegida ilegível. Os dados comerciais foram preservados.'); }
  }
  async save(value) {
    await this.ready(); await mkdir(dirname(this.file),{recursive:true});
    const encrypted=await this.safe.encryptStringAsync(JSON.stringify(value));
    await writeFile(this.file+'.tmp',encrypted,{mode:0o600}); await rename(this.file+'.tmp',this.file);
  }
}
