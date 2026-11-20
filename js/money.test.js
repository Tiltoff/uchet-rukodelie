import assert from "node:assert/strict";
import test from "node:test";
import { parseBookFile, serializeBook } from "./bookfile.js";
import { computeTotals, roundMoney, stockDeduction } from "./money.js";

test("заказ в работе не входит в доход", () => {
  const totals = computeTotals({
    quantity: "2",
    unitPrice: "1 500",
    materialsCost: "400",
    status: "work",
  });
  assert.equal(totals.itemTotal, 3000);
  assert.equal(totals.income, 0);
  assert.equal(totals.profit, 0);
  assert.equal(totals.expectedProfit, 2600);
});

test("продажа считает доход и прибыль", () => {
  const totals = computeTotals({
    quantity: 2,
    unitPrice: "1500,50",
    materialsCost: "100,25",
    status: "sold",
  });
  assert.equal(totals.unitPrice, 1500.5);
  assert.equal(totals.itemTotal, 3001);
  assert.equal(totals.income, 3001);
  assert.equal(totals.profit, 2900.75);
});

test("пустые материалы считаются нулём", () => {
  const totals = computeTotals({ quantity: 1, unitPrice: 100, materialsCost: "", status: "sold" });
  assert.equal(totals.profit, 100);
});

test("наличие списывается только у проданного товара с учётом", () => {
  assert.equal(stockDeduction({ status: "sold", trackStock: true, quantity: 4 }), 4);
  assert.equal(stockDeduction({ status: "work", trackStock: true, quantity: 4 }), 0);
  assert.equal(stockDeduction({ status: "sold", trackStock: false, quantity: 4 }), 0);
});

test("копейки округляются по третьему знаку", () => {
  assert.equal(roundMoney("10,235"), 10.24);
  assert.equal(roundMoney("10,234"), 10.23);
  assert.equal(roundMoney("-5"), null);
});

test("файл хранит посчитанные суммы как есть", () => {
  const book = {
    clients: [{ id: "c1", name: "Маша", note: "", updatedAt: "" }],
    products: [{ id: "p1", name: "Игрушка", price: 1500, trackStock: true, stock: 7, updatedAt: "" }],
    orders: [
      {
        id: "o1",
        date: "2026-11-20",
        clientId: "c1",
        title: "набор",
        productId: "p1",
        quantity: 2,
        unitPrice: 1500,
        materialsCost: 400,
        itemTotal: 3000,
        status: "sold",
        soldAt: "2026-11-20T10:00:00.000Z",
        income: 3000,
        profit: 2600,
        stockDeducted: 2,
        note: "",
        updatedAt: "",
      },
    ],
  };
  const loaded = parseBookFile(serializeBook(book));
  assert.equal(loaded.orders[0].profit, 2600);
  assert.equal(loaded.orders[0].itemTotal, 3000);
  assert.equal(loaded.products[0].stock, 7);
});

test("чужой файл не принимается", () => {
  assert.throws(() => parseBookFile("{}"), /не файл книги/);
  assert.throws(() => parseBookFile('{"format":"rukodelie-uchet","version":2}'), /не поддерживается/);
});
