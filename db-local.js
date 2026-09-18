const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SEED_DIR = path.join(ROOT, 'data');
const IS_VERCEL = !!process.env.VERCEL;
const STORE_DIR = IS_VERCEL ? path.join('/tmp', 'viet-nom-nom-data') : path.join(ROOT, '.local-data');
const FILES = {
  menu: 'menu.json',
  promotions: 'promotions.json',
  inventory: 'inventory.json',
  employees: 'employees.json',
  shifts: 'shifts.json',
  payroll: 'payroll.json',
  recipes: 'recipes.json',
  settings: 'settings.json',
  orders: 'orders.json',
  sales: 'sales.json',
  notifications: 'notifications.json',
  revenueLedger: 'revenue-ledger.json'
};

const uuid = () => crypto.randomUUID();
const money = n => Math.round((Number(n) || 0) * 100) / 100;
const clone = v => JSON.parse(JSON.stringify(v));
const now = () => new Date().toISOString();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return clone(fallback); }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
function seedDefault(key) {
  const fallback = key === 'settings' ? {} : [];
  return readJson(path.join(SEED_DIR, FILES[key]), fallback);
}
function storePath(key) { return path.join(STORE_DIR, FILES[key]); }
function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  for (const key of Object.keys(FILES)) {
    const p = storePath(key);
    if (!fs.existsSync(p)) writeJson(p, seedDefault(key));
  }
}
function read(key) { ensureStore(); return readJson(storePath(key), key === 'settings' ? {} : []); }
function write(key, value) { ensureStore(); writeJson(storePath(key), value); return value; }
function upsertList(key, item, idField = 'id') {
  const arr = read(key);
  const id = String(item[idField] || uuid());
  const next = { ...item, [idField]: id };
  const idx = arr.findIndex(x => String(x?.[idField]) === id);
  if (idx >= 0) arr[idx] = next; else arr.push(next);
  write(key, arr);
  return clone(next);
}
function deleteFromList(key, id, idField = 'id') {
  const arr = read(key);
  const before = arr.length;
  const next = arr.filter(x => String(x?.[idField]) !== String(id));
  write(key, next);
  return before !== next.length;
}

async function healthCheck() {
  ensureStore();
  return { ok: true, serverTime: now(), storage: 'Local JSON' };
}
async function ensureSchemaExtensions() { ensureStore(); }

async function getMenu() { return read('menu'); }
async function upsertMenu(x) { return upsertList('menu', { ...x, id: String(x.id || uuid()) }); }
async function deleteMenu(id) { return deleteFromList('menu', id); }

async function getPromotions() { return read('promotions'); }
async function upsertPromotion(x) { return upsertList('promotions', { ...x, id: String(x.id || uuid()) }); }
async function deletePromotion(id) { return deleteFromList('promotions', id); }

async function getInventory() { return read('inventory'); }
async function upsertInventory(x) {
  return upsertList('inventory', { ...x, id: String(x.id || uuid()), updatedAt: x.updatedAt || now() });
}
async function deleteInventory(id) { return deleteFromList('inventory', id); }

async function getEmployees() { return read('employees'); }
async function upsertEmployee(x) {
  const existing = read('employees').find(e => String(e.id) === String(x.id));
  const next = { ...existing, ...x, id: String(x.id || existing?.id || uuid()) };
  if (x.sin !== undefined) next.sinLast4 = String(x.sin || '').replace(/\D/g, '').slice(-4);
  return upsertList('employees', next);
}
async function deleteEmployee(id) {
  const ok = deleteFromList('employees', id);
  if (ok) {
    write('shifts', read('shifts').filter(x => String(x.employeeId) !== String(id)));
    write('payroll', read('payroll').filter(x => String(x.employeeId) !== String(id)));
  }
  return ok;
}

async function getShifts() {
  const employees = new Map(read('employees').map(e => [String(e.id), e]));
  return read('shifts').map(x => ({ ...x, employeeName: x.employeeName || employees.get(String(x.employeeId))?.name || '' }));
}
async function upsertShift(x) {
  const emp = read('employees').find(e => String(e.id) === String(x.employeeId));
  if (!emp) throw new Error('Employee not found');
  return upsertList('shifts', { ...x, id: String(x.id || uuid()), employeeName: x.employeeName || emp.name, createdAt: x.createdAt || now() });
}
async function deleteShift(id) { return deleteFromList('shifts', id); }

async function getPayroll() {
  const employees = new Map(read('employees').map(e => [String(e.id), e]));
  return read('payroll').map(x => ({ ...x, employeeName: x.employeeName || employees.get(String(x.employeeId))?.name || '' }));
}
async function upsertPayroll(x) {
  const emp = read('employees').find(e => String(e.id) === String(x.employeeId));
  if (!emp) throw new Error('Employee not found');
  return upsertList('payroll', { ...x, id: String(x.id || uuid()), employeeName: x.employeeName || emp.name, createdAt: x.createdAt || now(), status: x.status || 'paid' });
}
async function deletePayroll(id) { return deleteFromList('payroll', id); }

async function getRecipes() { return read('recipes'); }
async function upsertRecipe(x) { return upsertList('recipes', { ...x, id: String(x.id || uuid()), updatedAt: x.updatedAt || now() }); }
async function deleteRecipe(id) { return deleteFromList('recipes', id); }

async function getSettings() {
  const seed = seedDefault('settings');
  return { ...seed, ...read('settings'), hours: { ...(seed.hours || {}), ...(read('settings').hours || {}) } };
}
async function updateSettings(s) {
  const current = await getSettings();
  const next = { ...current, ...s, hours: { ...(current.hours || {}), ...(s.hours || {}) } };
  write('settings', next);
  return clone(next);
}

async function getOrders(status) {
  let arr = read('orders').slice().sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (status && status !== 'all') arr = arr.filter(x => String(x.status) === String(status));
  return arr;
}
async function getOrderByNumber(orderNo) { return read('orders').find(x => String(x.orderNo) === String(orderNo)) || null; }
async function insertOrder(o) {
  const next = { ...o, id: String(o.id || uuid()), createdAt: o.createdAt || now(), updatedAt: o.updatedAt || now() };
  const arr = read('orders');
  if (arr.some(x => String(x.id) === next.id)) throw new Error('Order already exists');
  arr.push(next); write('orders', arr); return clone(next);
}
async function updateOrder(o) {
  const arr = read('orders');
  const idx = arr.findIndex(x => String(x.id) === String(o.id));
  if (idx < 0) throw new Error('Order not found');
  arr[idx] = { ...o, updatedAt: o.updatedAt || now() };
  write('orders', arr); return clone(arr[idx]);
}
async function deleteOrder(id) {
  const orders = read('orders');
  const target = orders.find(x => String(x.id) === String(id));
  if (!target) return false;
  write('orders', orders.filter(x => String(x.id) !== String(id)));
  write('sales', read('sales').filter(x => String(x.orderId) !== String(id)));
  write('notifications', read('notifications').filter(x => String(x.orderId) !== String(id)));
  return true;
}

async function getSales() { return read('sales').slice().sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); }
async function insertSale(s) {
  const next = { ...s, id: String(s.id || uuid()), createdAt: s.createdAt || now() };
  return upsertList('sales', next);
}
async function getNotifications() { return read('notifications').slice().sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 2000); }
async function addNotification(n) { return upsertList('notifications', { ...n, id: String(n.id || uuid()), createdAt: n.createdAt || now() }); }

async function analytics(salesInput) {
  const sales = Array.isArray(salesInput) ? salesInput : await getSales();
  const today = new Date().toDateString(), month = new Date().getMonth(), yr = new Date().getFullYear();
  const sum = a => money(a.reduce((s,x) => s + Number(x.total || 0), 0));
  const todaySales = sales.filter(x => new Date(x.createdAt).toDateString() === today);
  const monthSales = sales.filter(x => { const d = new Date(x.createdAt); return d.getMonth() === month && d.getFullYear() === yr; });
  const count = {};
  for (const s of sales) for (const i of s.items || []) count[i.name] = (count[i.name] || 0) + Number(i.qty || 0);
  return {
    todayRevenue: sum(todaySales), monthRevenue: sum(monthSales), allRevenue: sum(sales),
    todayOrders: todaySales.length, totalOrders: sales.length,
    topItems: Object.entries(count).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,qty])=>({name,qty}))
  };
}

async function bootstrapFromJson(dataDir = SEED_DIR) {
  ensureStore();
  const pairs = [
    ['menu','menu.json'],['promotions','promotions.json'],['inventory','inventory.json'],['employees','employees.json'],
    ['recipes','recipes.json'],['orders','orders.json'],['sales','sales.json'],['shifts','shifts.json'],
    ['payroll','payroll.json'],['notifications','notifications.json'],['revenueLedger','revenue-ledger.json']
  ];
  for (const [key,file] of pairs) {
    const current = read(key);
    if (Array.isArray(current) && current.length === 0) {
      const seed = readJson(path.join(dataDir, file), []);
      if (Array.isArray(seed) && seed.length) write(key, seed);
    }
  }
  const seedSettings = readJson(path.join(dataDir, 'settings.json'), {});
  if (Object.keys(seedSettings).length) await updateSettings(seedSettings);
  return true;
}

async function ensureRevenueLedgerSchemaV1140() { ensureStore(); }
async function getRevenueLedger() { return read('revenueLedger').slice().sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))); }
async function upsertRevenueLedger(x) {
  const date = String(x.date || x.businessDate || '').slice(0,10);
  if (!date) throw new Error('Business date required');
  const arr = read('revenueLedger');
  const idxByDate = arr.findIndex(r => String(r.date) === date);
  const idxById = x.id ? arr.findIndex(r => String(r.id) === String(x.id)) : -1;
  const idx = idxById >= 0 ? idxById : idxByDate;
  const existing = idx >= 0 ? arr[idx] : {};
  const row = { ...existing, ...x, id: String(existing.id || x.id || uuid()), date, createdAt: existing.createdAt || x.createdAt || now(), updatedAt: now() };
  if (idx >= 0) arr[idx] = row; else arr.push(row);
  write('revenueLedger', arr); return clone(row);
}
async function seedRevenueLedger(entries = []) {
  const arr = read('revenueLedger');
  const dates = new Set(arr.map(x => String(x.date)));
  for (const x of entries) {
    const date = String(x.date || '').slice(0,10); if (!date || dates.has(date)) continue;
    arr.push({ ...x, id: String(x.id || uuid()), date, createdAt: x.createdAt || now(), updatedAt: x.updatedAt || now() });
    dates.add(date);
  }
  write('revenueLedger', arr);
}
async function deleteRevenueLedger(id) {
  const arr = read('revenueLedger');
  const next = arr.filter(x => String(x.id) !== String(id) && String(x.date) !== String(id));
  write('revenueLedger', next); return arr.length !== next.length;
}

const pool = { end: async () => {}, connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) };

module.exports = {
  storageLabel: IS_VERCEL ? 'Temporary JSON (/tmp) – connect PostgreSQL for persistent production data' : 'Local JSON (development)', pool, healthCheck, ensureSchemaExtensions, bootstrapFromJson,
  getMenu, upsertMenu, deleteMenu, getPromotions, upsertPromotion, deletePromotion,
  getInventory, upsertInventory, deleteInventory, getEmployees, upsertEmployee, deleteEmployee,
  getShifts, upsertShift, deleteShift, getPayroll, upsertPayroll, deletePayroll,
  getRecipes, upsertRecipe, deleteRecipe, getSettings, updateSettings,
  getOrders, getOrderByNumber, insertOrder, updateOrder, deleteOrder,
  getSales, insertSale, getNotifications, addNotification, analytics,
  ensureRevenueLedgerSchemaV1140, getRevenueLedger, upsertRevenueLedger, seedRevenueLedger, deleteRevenueLedger
};
