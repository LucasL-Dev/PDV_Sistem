import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Use a mesma biblioteca de recursos PE instalada pelo electron-builder.
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const resourcesRequire = createRequire(
  builderRequire.resolve("app-builder-lib"),
);
const { NtExecutable, NtExecutableResource } = await import(
  pathToFileURL(resourcesRequire.resolve("resedit")).href
);
const file = resolve("release/win-unpacked/OmniPDV.exe");
const executable = NtExecutable.from(readFileSync(file));
const resources = NtExecutableResource.from(executable);
const ico = readFileSync("assets/brand/omnipdv.ico");
const count = ico.readUInt16LE(4);
const expected = [];
for (let n = 0; n < count; n++) {
  const entry = 6 + n * 16;
  const length = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  expected.push(ico.subarray(offset, offset + length));
}
const icons = resources.entries.filter((entry) => entry.type === 3);
if (!resources.entries.some((entry) => entry.type === 14)) {
  throw Error("Executável sem grupo de ícones.");
}
for (const frame of expected) {
  if (!icons.some((entry) => Buffer.from(entry.bin).equals(frame))) {
    throw Error("O executável não contém todos os tamanhos do ícone OmniPDV.");
  }
}
console.log(
  `OMNIPDV_ICON_OK: ${count} tamanhos da marca confirmados no executável Windows.`,
);
