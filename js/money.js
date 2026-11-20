export function roundMoney(value) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return 0;
  if (raw.startsWith("-")) return null;
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const frac3 = (frac + "000").slice(0, 3);
  let kopecks = Number(whole) * 100 + Number(frac3.slice(0, 2));
  if (Number(frac3[2]) >= 5) kopecks += 1;
  return kopecks / 100;
}

export function wholeQuantity(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const quantity = Number(raw);
  if (quantity < 1) return null;
  return quantity;
}

export function wholeStock(value) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

function kopecks(amount) {
  return Math.round(amount * 100);
}

export function computeTotals({ quantity, unitPrice, materialsCost, status }) {
  const qty = wholeQuantity(quantity);
  const price = roundMoney(unitPrice);
  const materials = roundMoney(materialsCost);
  if (qty == null || price == null || materials == null) return null;
  const itemTotal = (kopecks(price) * qty) / 100;
  const expectedProfit = (kopecks(itemTotal) - kopecks(materials)) / 100;
  const sold = status === "sold";
  return {
    quantity: qty,
    unitPrice: price,
    materialsCost: materials,
    itemTotal,
    income: sold ? itemTotal : 0,
    profit: sold ? expectedProfit : 0,
    expectedProfit,
  };
}

export function stockDeduction({ status, trackStock, quantity }) {
  if (status === "sold" && trackStock) return quantity;
  return 0;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function todayISO() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

export function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const title = new Date(year, monthNumber - 1, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
  return title.replace(" г.", "");
}

export function moneyInput(value) {
  return String(roundMoney(value) ?? 0).replace(".", ",");
}

export function showDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}
