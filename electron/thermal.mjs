import { createConnection } from "node:net";
export function escpos(lines, paper = 80) {
  const width = paper === 58 ? 32 : 48;
  const text = lines
    .map(
      (line) =>
        String(line)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^\x20-\x7e]/g, " ")
          .match(new RegExp(`.{1,${width}}`, "g"))
          ?.join("\n") || "",
    )
    .join("\n");
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0]),
    Buffer.from(text + "\n\n\n\n", "ascii"),
    Buffer.from([0x1d, 0x56, 0]),
  ]);
}
export function sendThermal(settings, lines) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: settings.thermalHost,
      port: settings.thermalPort || 9100,
    });
    socket.setTimeout(5000);
    socket.on("timeout", () =>
      socket.destroy(Error("A impressora não respondeu.")),
    );
    socket.on("error", () =>
      reject(
        Error(
          "Não foi possível enviar à impressora de rede. Confira endereço e porta.",
        ),
      ),
    );
    socket.on("connect", () => socket.end(escpos(lines, settings.paper)));
    socket.on("finish", () =>
      resolve("Comprovante enviado à impressora de rede."),
    );
  });
}
