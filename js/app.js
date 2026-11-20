import { parseBookFile, serializeBook } from "./bookfile.js";
import { deleteOrder, deleteProduct, loadBook, replaceBook, saveOrder, saveProduct } from "./db.js";
import {
  computeTotals,
  currentMonth,
  formatMoney,
  moneyInput,
  monthTitle,
  roundMoney,
  shiftMonth,
  showDate,
  todayISO,
  wholeQuantity,
  wholeStock,
} from "./money.js";

const app = document.querySelector("#app");

const state = {
  view: "orders",
  month: currentMonth(),
  book: null,
  orderId: null,
  productId: null,
  flash: null,
  dialog: null,
  loadError: "",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function clientName(clientId) {
  return state.book.clients.find((client) => client.id === clientId)?.name || "Без имени";
}

function productName(productId) {
  return state.book.products.find((product) => product.id === productId)?.name || "Товар удалён";
}

function orderTitle(order) {
  return order.title || productName(order.productId);
}

function sortedOrders() {
  return [...state.book.orders].sort(
    (a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

function monthOrders() {
  return sortedOrders().filter((order) => order.date.startsWith(state.month));
}

function flashHtml() {
  if (!state.flash) return "";
  return `<p class="banner ${state.flash.kind === "ok" ? "ok" : "err"}">${esc(state.flash.text)}</p>`;
}

function nav(current) {
  const item = (view, label) => {
    const here = current === view ? ' aria-current="page"' : "";
    return `<button type="button" data-action="nav" data-view="${view}"${here}>${label}</button>`;
  };
  return `<nav class="nav">${item("orders", "Заказы")}${item("products", "Товары")}${item("book", "Книга")}</nav>`;
}

function dialogHtml() {
  if (!state.dialog) return "";
  return `<div class="dialog-back">
    <div class="dialog" role="dialog" aria-modal="true">
      <h2>${esc(state.dialog.title)}</h2>
      <p>${esc(state.dialog.text)}</p>
      <div class="dialog-actions">
        <button type="button" data-action="dialog-no">Отмена</button>
        <button type="button" class="primary" data-action="dialog-yes">${esc(state.dialog.confirm)}</button>
      </div>
    </div>
  </div>`;
}

function shell(title, body, current) {
  app.innerHTML = `<div class="shell">
    <header class="top"><h1 class="brand">${esc(title)}</h1></header>
    ${flashHtml()}
    ${body}
    ${nav(current)}
    ${dialogHtml()}
  </div>`;
}

function renderOrders() {
  const orders = monthOrders();
  let income = 0;
  let profit = 0;
  let pending = 0;
  for (const order of orders) {
    if (order.status === "sold") {
      income += order.income;
      profit += order.profit;
    } else {
      pending += order.itemTotal;
    }
  }
  const rows = orders.length
    ? `<div class="list">${orders
        .map((order) => {
          const sold = order.status === "sold";
          const result = sold ? `Прибыль ${formatMoney(order.profit)}` : `Если продать ${formatMoney(order.itemTotal - order.materialsCost)}`;
          return `<button type="button" class="list-btn" data-action="open-order" data-id="${esc(order.id)}">
            <b>${esc(clientName(order.clientId))}</b>
            <span class="badge ${sold ? "sold" : "work"}">${sold ? "Продано" : "В работе"}</span>
            <span class="sum">${esc(formatMoney(order.itemTotal))}</span>
            <span class="meta">${esc(showDate(order.date))} · ${esc(orderTitle(order))} · ${order.quantity} шт. · ${esc(result)}</span>
          </button>`;
        })
        .join("")}</div>`
    : `<p class="empty">В этом месяце записей ещё нет.</p>`;

  shell(
    "Учёт",
    `<div class="month-row">
      <button type="button" class="icon-btn" data-action="month" data-delta="-1" aria-label="Предыдущий месяц">‹</button>
      <h2>${esc(monthTitle(state.month))}</h2>
      <button type="button" class="icon-btn" data-action="month" data-delta="1" aria-label="Следующий месяц">›</button>
    </div>
    <section class="ledger">
      <div class="figure"><span>Доход</span><strong>${esc(formatMoney(income))}</strong></div>
      <div class="figure"><span>Чистая прибыль</span><strong>${esc(formatMoney(profit))}</strong></div>
    </section>
    ${pending ? `<p class="aside">Ещё не продано на ${esc(formatMoney(pending))}</p>` : ""}
    ${rows}
    <button type="button" class="primary" data-action="new-order">Новый заказ</button>`,
    "orders",
  );
}

function names(list) {
  return [...list]
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((item) => `<option value="${esc(item.name)}"></option>`)
    .join("");
}

function renderOrderForm() {
  const order = state.orderId ? state.book.orders.find((item) => item.id === state.orderId) : null;
  const status = order?.status || "work";
  const product = order ? state.book.products.find((item) => item.id === order.productId) : null;
  shell(
    order ? "Заказ" : "Новый заказ",
    `<button type="button" class="back" data-action="nav" data-view="orders">К заказам</button>
    <form class="form" data-form="order" data-status="${status}" data-price-touched="${order ? "1" : "0"}">
      <label>Дата<input name="date" type="date" value="${esc(order?.date || todayISO())}" required></label>
      <label>Клиент<input name="clientName" list="client-names" value="${esc(order ? clientName(order.clientId) : "")}" autocomplete="off" required></label>
      <datalist id="client-names">${names(state.book.clients)}</datalist>
      <label>Заказ<input name="title" value="${esc(order?.title || "")}" placeholder="Платье на выпускной" autocomplete="off"></label>
      <label>Товар<input name="productName" list="product-names" value="${esc(product?.name || "")}" autocomplete="off" required></label>
      <datalist id="product-names">${names(state.book.products)}</datalist>
      <label>Количество в заказе<input name="quantity" inputmode="numeric" value="${order?.quantity ?? 1}" required></label>
      <label>Цена товара<input name="unitPrice" inputmode="decimal" value="${esc(moneyInput(order?.unitPrice ?? product?.price ?? 0))}" required></label>
      <label>Стоимость расходных материалов<input name="materialsCost" inputmode="decimal" value="${esc(moneyInput(order?.materialsCost ?? 0))}"></label>
      <div class="choice">
        <button type="button" data-action="status" data-status="work" aria-pressed="${status === "work"}">В работе</button>
        <button type="button" data-action="status" data-status="sold" aria-pressed="${status === "sold"}">Продано</button>
      </div>
      <p class="preview" data-preview></p>
      <label>Заметка<textarea name="note">${esc(order?.note || "")}</textarea></label>
      <button class="primary" type="submit">Сохранить</button>
      ${order ? `<button class="danger" type="button" data-action="delete-order" data-id="${esc(order.id)}">Удалить заказ</button>` : ""}
    </form>`,
    "orders",
  );
  const form = app.querySelector("[data-form=order]");
  updatePreview(form);
}

function updatePreview(form) {
  const preview = form.querySelector("[data-preview]");
  const totals = computeTotals({
    quantity: form.quantity.value,
    unitPrice: form.unitPrice.value,
    materialsCost: form.materialsCost.value,
    status: form.dataset.status,
  });
  if (!totals || !wholeQuantity(form.quantity.value)) {
    preview.textContent = "Укажите количество и цену, и здесь появится расчёт.";
    return;
  }
  if (form.dataset.status === "sold") {
    preview.textContent = `Стоимость изделия ${formatMoney(totals.itemTotal)}. Доход ${formatMoney(totals.income)}. Чистая прибыль ${formatMoney(totals.profit)}.`;
    return;
  }
  preview.textContent = `Стоимость изделия ${formatMoney(totals.itemTotal)}. Пока в работе: если продать, прибыль ${formatMoney(totals.expectedProfit)}.`;
}

function renderProducts() {
  const products = [...state.book.products].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const rows = products.length
    ? `<div class="list">${products
        .map((product) => {
          const stock = product.trackStock ? `В наличии ${product.stock} шт.` : "Наличие не ведётся";
          return `<button type="button" class="product-row" data-action="open-product" data-id="${esc(product.id)}">
            <b>${esc(product.name)}</b>
            <span class="sum">${esc(formatMoney(product.price))}</span>
            <span class="meta">${esc(stock)}</span>
          </button>`;
        })
        .join("")}</div>`
    : `<p class="empty">Товаров пока нет. Их можно завести здесь или прямо из заказа.</p>`;
  shell(
    "Товары",
    `${rows}<button type="button" class="primary" data-action="new-product">Новый товар</button>`,
    "products",
  );
}

function renderProductForm() {
  const product = state.productId ? state.book.products.find((item) => item.id === state.productId) : null;
  const tracked = Boolean(product?.trackStock);
  shell(
    product ? "Товар" : "Новый товар",
    `<button type="button" class="back" data-action="nav" data-view="products">К товарам</button>
    <form class="form" data-form="product">
      <label>Название<input name="name" value="${esc(product?.name || "")}" autocomplete="off" required></label>
      <label>Цена товара<input name="price" inputmode="decimal" value="${esc(moneyInput(product?.price ?? 0))}" required></label>
      <label class="check"><input name="trackStock" type="checkbox" ${tracked ? "checked" : ""}> Вести наличие</label>
      <label data-stock ${tracked ? "" : "hidden"}>Сколько есть<input name="stock" inputmode="numeric" value="${product?.stock ?? 0}"></label>
      <button class="primary" type="submit">Сохранить</button>
      ${product ? `<button class="danger" type="button" data-action="delete-product" data-id="${esc(product.id)}">Удалить товар</button>` : ""}
    </form>`,
    "products",
  );
}

function renderBook() {
  shell(
    "Книга",
    `<section class="panel">
      <div class="counts">
        <div><strong>${state.book.clients.length}</strong><span>клиентов</span></div>
        <div><strong>${state.book.products.length}</strong><span>товаров</span></div>
        <div><strong>${state.book.orders.length}</strong><span>заказов</span></div>
      </div>
      <p>Файл — это вся книга: клиенты, товары, заказы и уже посчитанные суммы. Отправьте его себе в сообщение. С нового телефона или после смены ссылки загрузите этот же файл обратно.</p>
      <button type="button" class="primary" data-action="export">Выгрузить файл</button>
      <button type="button" class="danger" data-action="pick-file">Загрузить файл</button>
      <input data-file type="file" accept="application/json,.json" hidden>
    </section>`,
    "book",
  );
}

function render() {
  if (state.loadError) {
    app.innerHTML = `<div class="shell"><h1 class="brand">Учёт</h1><p class="banner err">${esc(state.loadError)}</p></div>`;
    return;
  }
  if (!state.book) {
    app.innerHTML = `<div class="shell"><h1 class="brand">Учёт</h1><p class="quiet">Открываю книгу…</p></div>`;
    return;
  }
  if (state.view === "order") renderOrderForm();
  else if (state.view === "products") renderProducts();
  else if (state.view === "product") renderProductForm();
  else if (state.view === "book") renderBook();
  else renderOrders();
  window.scrollTo(0, 0);
}

function showError(error) {
  state.flash = { kind: "err", text: error.message || "Не удалось сохранить" };
  render();
}

async function refresh(view) {
  state.book = await loadBook();
  state.view = view;
  state.dialog = null;
  render();
}

async function submitOrder(form) {
  await saveOrder({
    id: state.orderId,
    date: form.date.value,
    clientName: form.clientName.value,
    title: form.title.value,
    productName: form.productName.value,
    quantity: form.quantity.value,
    unitPrice: form.unitPrice.value,
    materialsCost: form.materialsCost.value,
    note: form.note.value,
    status: form.dataset.status,
  });
  state.flash = { kind: "ok", text: "Заказ сохранён" };
  await refresh("orders");
}

async function submitProduct(form) {
  const price = roundMoney(form.price.value);
  const trackStock = form.trackStock.checked;
  const stock = trackStock ? wholeStock(form.stock.value) : 0;
  if (price == null) throw new Error("Проверьте цену товара");
  if (trackStock && stock == null) throw new Error("Укажите, сколько штук есть");
  await saveProduct({
    id: state.productId,
    name: form.name.value,
    price,
    trackStock,
    stock,
  });
  state.flash = { kind: "ok", text: "Товар сохранён" };
  await refresh("products");
}

async function exportFile() {
  const json = serializeBook(state.book);
  const name = `uchet-${todayISO()}.json`;
  const file = new File([json], name, { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Книга учёта" });
      return;
    }
  } catch (error) {
    if (error.name === "AbortError") return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
  state.flash = { kind: "ok", text: "Файл сохранён" };
  render();
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "nav") {
    state.view = target.dataset.view;
    state.orderId = null;
    state.productId = null;
    state.flash = null;
    render();
  } else if (action === "month") {
    state.month = shiftMonth(state.month, Number(target.dataset.delta));
    render();
  } else if (action === "new-order") {
    state.view = "order";
    state.orderId = null;
    state.flash = null;
    render();
  } else if (action === "open-order") {
    state.view = "order";
    state.orderId = target.dataset.id;
    state.flash = null;
    render();
  } else if (action === "new-product") {
    state.view = "product";
    state.productId = null;
    state.flash = null;
    render();
  } else if (action === "open-product") {
    state.view = "product";
    state.productId = target.dataset.id;
    state.flash = null;
    render();
  } else if (action === "status") {
    const form = target.closest("form");
    form.dataset.status = target.dataset.status;
    for (const button of form.querySelectorAll("[data-action=status]")) {
      button.setAttribute("aria-pressed", String(button === target));
    }
    updatePreview(form);
  } else if (action === "delete-order") {
    state.dialog = {
      title: "Удалить заказ",
      text: "Заказ исчезнет из книги. Если он был продан из наличия, штуки вернутся.",
      confirm: "Удалить",
      run: async () => {
        await deleteOrder(target.dataset.id);
        state.flash = { kind: "ok", text: "Заказ удалён" };
        await refresh("orders");
      },
    };
    render();
  } else if (action === "delete-product") {
    state.dialog = {
      title: "Удалить товар",
      text: "Товар можно удалить, только если его нет в заказах.",
      confirm: "Удалить",
      run: async () => {
        await deleteProduct(target.dataset.id);
        state.flash = { kind: "ok", text: "Товар удалён" };
        await refresh("products");
      },
    };
    render();
  } else if (action === "dialog-no") {
    state.dialog = null;
    render();
  } else if (action === "dialog-yes") {
    const run = state.dialog?.run;
    state.dialog = null;
    Promise.resolve()
      .then(() => run?.())
      .catch(showError);
  } else if (action === "export") {
    exportFile().catch(showError);
  } else if (action === "pick-file") {
    app.querySelector("[data-file]").click();
  }
});

app.addEventListener("input", (event) => {
  const form = event.target.closest("[data-form=order]");
  if (!form) return;
  if (event.target.name === "unitPrice") form.dataset.priceTouched = "1";
  if (event.target.name === "productName" && form.dataset.priceTouched !== "1") {
    const product = state.book.products.find(
      (item) => item.name.toLowerCase() === event.target.value.trim().toLowerCase(),
    );
    if (product) form.unitPrice.value = moneyInput(product.price);
  }
  updatePreview(form);
});

app.addEventListener("change", (event) => {
  if (event.target.name === "trackStock") {
    const stock = app.querySelector("[data-stock]");
    stock.hidden = !event.target.checked;
  }
  if (event.target.matches("[data-file]")) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    file
      .text()
      .then((raw) => {
        const book = parseBookFile(raw);
        state.dialog = {
          title: "Заменить книгу",
          text: `В файле заказов: ${book.orders.length}. Текущие записи на этом телефоне будут стёрты.`,
          confirm: "Заменить",
          run: async () => {
            await replaceBook(book);
            state.flash = { kind: "ok", text: "Книга загружена из файла" };
            await refresh("orders");
          },
        };
        render();
      })
      .catch(showError);
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const task = form.dataset.form === "order" ? submitOrder(form) : submitProduct(form);
  task.catch(showError);
});

const APP_VERSION = "2";

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((registration) => {
    registration.update().catch(() => {});
  }).catch(() => {});
}

fetch("./version.txt", { cache: "no-store" })
  .then((response) => response.text())
  .then((raw) => {
    const remote = raw.trim();
    if (!remote || remote === APP_VERSION) return;
    if (sessionStorage.getItem("uchet-reload") === remote) return;
    sessionStorage.setItem("uchet-reload", remote);
    const next = new URL("./", window.location.href);
    next.searchParams.set("v", remote);
    window.location.replace(next.href);
  })
  .catch(() => {});

loadBook()
  .then((book) => {
    state.book = book;
    render();
  })
  .catch(() => {
    state.loadError = "Не удалось открыть книгу на этом устройстве.";
    render();
  });
