const FORMAT = "rukodelie-uchet";
const VERSION = 1;

function text(value) {
  return String(value ?? "");
}

function cleanClient(client) {
  if (!client || typeof client.id !== "string" || !client.id) {
    throw new Error("В файле есть клиент без номера");
  }
  const name = text(client.name).trim();
  if (!name) throw new Error("В файле есть клиент без имени");
  return {
    id: client.id,
    name,
    note: text(client.note),
    updatedAt: text(client.updatedAt),
  };
}

function cleanProduct(product) {
  if (!product || typeof product.id !== "string" || !product.id) {
    throw new Error("В файле есть товар без номера");
  }
  const name = text(product.name).trim();
  if (!name) throw new Error("В файле есть товар без названия");
  const price = Number(product.price);
  const stock = Number(product.stock);
  if (!Number.isFinite(price) || price < 0) throw new Error(`Проверьте цену товара «${name}»`);
  if (!Number.isInteger(stock)) throw new Error(`Проверьте наличие товара «${name}»`);
  return {
    id: product.id,
    name,
    price,
    trackStock: Boolean(product.trackStock),
    stock,
    updatedAt: text(product.updatedAt),
  };
}

function cleanOrder(order) {
  if (!order || typeof order.id !== "string" || !order.id) {
    throw new Error("В файле есть заказ без номера");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(order.date))) {
    throw new Error("В файле есть заказ без даты");
  }
  if (order.status !== "work" && order.status !== "sold") {
    throw new Error("В файле есть заказ без статуса");
  }
  const quantity = Number(order.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("В файле есть заказ с неверным количеством");
  }
  for (const key of ["unitPrice", "materialsCost", "itemTotal", "income", "profit"]) {
    if (!Number.isFinite(Number(order[key]))) throw new Error("В файле есть заказ с неверной суммой");
  }
  const stockDeducted = Number(order.stockDeducted);
  if (!Number.isInteger(stockDeducted) || stockDeducted < 0) {
    throw new Error("В файле есть заказ с неверным списанием");
  }
  return {
    id: order.id,
    date: order.date,
    clientId: text(order.clientId),
    title: text(order.title),
    productId: text(order.productId),
    quantity,
    unitPrice: Number(order.unitPrice),
    materialsCost: Number(order.materialsCost),
    itemTotal: Number(order.itemTotal),
    status: order.status,
    soldAt: order.soldAt ? text(order.soldAt) : null,
    income: Number(order.income),
    profit: Number(order.profit),
    stockDeducted,
    note: text(order.note),
    updatedAt: text(order.updatedAt),
  };
}

function unique(list, label) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.id)) throw new Error(`В файле повторяется ${label}`);
    seen.add(item.id);
  }
}

export function serializeBook(book) {
  return JSON.stringify(
    {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      clients: book.clients,
      products: book.products,
      orders: book.orders,
    },
    null,
    2,
  );
}

export function parseBookFile(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Файл не читается");
  }
  if (!data || data.format !== FORMAT) throw new Error("Это не файл книги учёта");
  if (data.version !== VERSION) throw new Error("Эта версия файла пока не поддерживается");
  if (!Array.isArray(data.clients) || !Array.isArray(data.products) || !Array.isArray(data.orders)) {
    throw new Error("В файле не хватает книги");
  }
  const clients = data.clients.map(cleanClient);
  const products = data.products.map(cleanProduct);
  const orders = data.orders.map(cleanOrder);
  unique(clients, "клиент");
  unique(products, "товар");
  unique(orders, "заказ");
  return { clients, products, orders };
}
