export const fractional = (p) => ["KG", "M", "L"].includes(p.unit || "UN");
export const lineValue = (price, qty) =>
  Math.floor((price * Math.round(qty * 1000) + 500) / 1000);
export function scaleBarcode(code, products) {
  if (!/^20[0-9]{11}$/.test(code)) return null;
  const sum = code
    .slice(0, 12)
    .split("")
    .reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== Number(code[12])) return null;
  const product = products.find(
    (p) => p.barcode === code.slice(2, 7) && p.unit === "KG",
  );
  if (!product) return null;
  const qty = Number(code.slice(7, 12)) / 1000;
  return qty > 0 ? { product, qty } : null;
}
