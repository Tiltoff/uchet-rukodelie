import { computeTotals, stockDeduction } from "./money.js";

const DB_NAME = "rukodelie";
const DB_VERSION = 1;

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("clients")) db.createObjectStore("clients", { keyPath: "id" });
        if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
        if (!db.objectStoreNames.contains("orders")) db.createObjectStore("orders", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function editBook(mutator) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(["clients", "products", "orders"], "readwrite");
        const stores = {
          clients: tx.objectStore("clients"),
          products: tx.objectStore("products"),
          orders: tx.objectStore("orders"),
        };
        const requests = {
          clients: stores.clients.getAll(),
          products: stores.products.getAll(),
          orders: stores.orders.getAll(),
        };
        const book = {};
        let left = 3;
        let failed = false;

        const fail = (error) => {
          if (failed) return;
          failed = true;
          reject(error instanceof Error ? error : new Error("Не удалось сохранить"));
          try {
            tx.abort();
          } catch {
            /* транзакция уже закрывается */
          }
        };

        for (const key of ["clients", "products", "orders"]) {
          requests[key].onsuccess = () => {
            book[key] = requests[key].result;
            left -= 1;
            if (left === 0) {
              try {
                mutator(stores, book);
              } catch (error) {
                fail(error);
              }
            }
          };
          requests[key].onerror = () => fail(requests[key].error);
        }

        tx.oncomplete = () => {
          if (!failed) resolve();
        };
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => {
          if (!failed) fail(tx.error || new Error("Не удалось сохранить"));
        };
      }),
  );
}

function uid() {
  return crypto.randomUUID();
}

function byName(list, name) {
  const key = name.trim().toLowerCase();
  return list.find((item) => item.name.trim().toLowerCase() === key);
}

export function loadBook() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(["clients", "products", "orders"], "readonly");
        const requests = {
          clients: tx.objectStore("clients").getAll(),
          products: tx.objectStore("products").getAll(),
          orders: tx.objectStore("orders").getAll(),
        };
        const book = {};
        let left = 3;
        for (const key of ["clients", "products", "orders"]) {
          requests[key].onsuccess = () => {
            book[key] = requests[key].result;
            left -= 1;
            if (left === 0) resolve(book);
          };
          requests[key].onerror = () => reject(requests[key].error);
        }
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export function saveOrder(input) {
  return editBook((stores, book) => {
    const status = input.status === "sold" ? "sold" : "work";
    const totals = computeTotals({ ...input, status });
    if (!totals) throw new Error("Проверьте количество, цену и материалы");
    const clientName = String(input.clientName ?? "").trim();
    const productName = String(input.productName ?? "").trim();
    if (!clientName) throw new Error("Укажите клиента");
    if (!productName) throw new Error("Укажите товар");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) throw new Error("Укажите дату");

    const now = new Date().toISOString();
    const prev = input.id ? book.orders.find((order) => order.id === input.id) : null;
    if (input.id && !prev) throw new Error("Заказ уже удалён");

    let client = byName(book.clients, clientName);
    if (!client) {
      client = { id: uid(), name: clientName, note: "", updatedAt: now };
      stores.clients.put(client);
    }

    let product = byName(book.products, productName);
    if (!product) {
      product = {
        id: uid(),
        name: productName,
        price: totals.unitPrice,
        trackStock: false,
        stock: 0,
        updatedAt: now,
      };
      stores.products.put(product);
    }

    const newDeduct = stockDeduction({
      status,
      trackStock: product.trackStock,
      quantity: totals.quantity,
    });
    const oldDeduct = prev?.stockDeducted || 0;
    const oldProduct = prev ? book.products.find((item) => item.id === prev.productId) : null;

    if (oldProduct && oldProduct.id === product.id) {
      product.stock = (Number(product.stock) || 0) - (newDeduct - oldDeduct);
      product.updatedAt = now;
      stores.products.put(product);
    } else {
      if (oldProduct && oldDeduct) {
        oldProduct.stock = (Number(oldProduct.stock) || 0) + oldDeduct;
        oldProduct.updatedAt = now;
        stores.products.put(oldProduct);
      }
      if (newDeduct) {
        product.stock = (Number(product.stock) || 0) - newDeduct;
        product.updatedAt = now;
        stores.products.put(product);
      }
    }

    const stayingSold = status === "sold" && prev?.status === "sold" && prev.soldAt;
    stores.orders.put({
      id: prev?.id || uid(),
      date: input.date,
      clientId: client.id,
      title: String(input.title ?? "").trim(),
      productId: product.id,
      quantity: totals.quantity,
      unitPrice: totals.unitPrice,
      materialsCost: totals.materialsCost,
      itemTotal: totals.itemTotal,
      status,
      soldAt: status === "sold" ? stayingSold || now : null,
      income: totals.income,
      profit: totals.profit,
      stockDeducted: newDeduct,
      note: String(input.note ?? "").trim(),
      updatedAt: now,
    });
  });
}

export function deleteOrder(id) {
  return editBook((stores, book) => {
    const order = book.orders.find((item) => item.id === id);
    if (!order) return;
    if (order.stockDeducted) {
      const product = book.products.find((item) => item.id === order.productId);
      if (product) {
        product.stock = (Number(product.stock) || 0) + order.stockDeducted;
        product.updatedAt = new Date().toISOString();
        stores.products.put(product);
      }
    }
    stores.orders.delete(id);
  });
}

export function saveProduct(input) {
  return editBook((stores, book) => {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Укажите название товара");
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) throw new Error("Проверьте цену товара");
    const trackStock = Boolean(input.trackStock);
    const stock = Number(input.stock);
    if (trackStock && !Number.isInteger(stock)) throw new Error("Укажите, сколько штук есть");
    const duplicate = book.products.find(
      (product) => product.id !== input.id && product.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) throw new Error("Такой товар уже есть");

    const now = new Date().toISOString();
    const prev = input.id ? book.products.find((product) => product.id === input.id) : null;
    if (input.id && !prev) throw new Error("Товар уже удалён");

    if (prev?.trackStock && !trackStock) {
      for (const order of book.orders) {
        if (order.productId === prev.id && order.stockDeducted) {
          stores.orders.put({ ...order, stockDeducted: 0, updatedAt: now });
        }
      }
    }

    stores.products.put({
      id: prev?.id || uid(),
      name,
      price,
      trackStock,
      stock: trackStock ? stock : 0,
      updatedAt: now,
    });
  });
}

export function deleteProduct(id) {
  return editBook((stores, book) => {
    if (book.orders.some((order) => order.productId === id)) {
      throw new Error("Этот товар есть в заказах. Его можно переименовать.");
    }
    stores.products.delete(id);
  });
}

export function replaceBook(book) {
  return editBook((stores) => {
    stores.clients.clear();
    stores.products.clear();
    stores.orders.clear();
    for (const client of book.clients) stores.clients.put(client);
    for (const product of book.products) stores.products.put(product);
    for (const order of book.orders) stores.orders.put(order);
  });
}
