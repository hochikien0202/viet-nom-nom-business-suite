const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATABASE_URL = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '';
if (!DATABASE_URL) {
  throw new Error('Database connection missing. Connect Supabase to Vercel so POSTGRES_URL is available.');
}

// Vercel/Supabase connection strings can include sslmode/sslrootcert parameters.
// node-postgres lets SSL options embedded in the URL override the explicit `ssl`
// object below, which can surface as: "self-signed certificate in certificate chain".
// Remove URL-level SSL options, then apply the TLS policy in one place.
function normalizePgUrl(raw) {
  try {
    const u = new URL(raw);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const localDb = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const connectionString = localDb ? DATABASE_URL : normalizePgUrl(DATABASE_URL);
const pool = new Pool({
  connectionString,
  // Keep the per-function pool deliberately small on Vercel. Supabase's pooled
  // connection URL is designed for many short-lived serverless invocations;
  // opening a large local pool in every invocation can exhaust connections.
  max: Math.max(1, Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 2 : 5))),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 8000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 15000),
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000),
  application_name: 'viet-nom-nom-business-suite-v11',
  keepAlive: true,
  ssl: localDb ? false : { rejectUnauthorized: false },
});
pool.on('error', err => console.error('PostgreSQL pool error:', err.message));

const q = (text, params = []) => pool.query(text, params);
async function healthCheck() {
  const r = await q('select 1 as ok, now() as server_time');
  return { ok: Number(r.rows[0]?.ok) === 1, serverTime: r.rows[0]?.server_time || null };
}
const money = n => Math.round((Number(n) || 0) * 100) / 100;
const externalId = row => row.legacy_id || String(row.id);
const asDate = v => v ? new Date(v).toISOString() : '';
const cleanDate = v => v ? String(v).slice(0, 10) : '';
const uuid = () => crypto.randomUUID();

function snakeStatusToApp(v = '') { return String(v).replaceAll('_', '-'); }
function appStatusToDb(v = '') { return String(v).replaceAll('-', '_'); }
function normalizeOrderType(v = 'pickup') {
  const s = String(v || 'pickup').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (s === 'walkin') return 'walk_in';
  // Legacy Supabase constraint orders_order_type_check predates Dine-in.
  // Keep the real modern service type in the separate `fulfillment` column,
  // but write a legacy-safe value to `order_type` so Dine-in/pre-orders can be saved.
  if (s === 'dine_in') return 'pickup';
  return ['pickup', 'delivery', 'walk_in', 'phone'].includes(s) ? s : 'pickup';
}
function displayFulfillment(v = 'pickup') { return String(v).replaceAll('_', '-'); }
function normalizePayment(v = '') {
  const s = String(v || '').toLowerCase();
  if (s.includes('cash')) return 'cash';
  if (s.includes('debit')) return 'debit';
  if (s.includes('credit')) return 'credit';
  if (s.includes('transfer')) return 'etransfer';
  if (s.includes('counter') || s.includes('pickup')) return 'counter';
  if (s.includes('cheque') || s.includes('check')) return 'cheque';
  return s ? 'other' : null;
}
function paymentLabel(dbValue) {
  return ({ cash: 'Cash', debit: 'Debit', credit: 'Credit', etransfer: 'E-transfer', counter: 'Counter', cheque: 'Cheque', other: 'Other' })[dbValue] || '';
}
function payFreqToDb(v = 'Bi-weekly') {
  const s = String(v).toLowerCase().replaceAll('-', '');
  if (s.includes('daily')) return 'daily';
  if (s.includes('weekly') && !s.includes('bi')) return 'weekly';
  return 'biweekly';
}
function payFreqFromDb(v = 'biweekly') { return ({ daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly' })[v] || 'Bi-weekly'; }
function employeePaymentToDb(v = '') {
  const s = String(v).toLowerCase();
  if (s.includes('cash')) return 'cash';
  if (s.includes('cheque') || s.includes('check')) return 'cheque';
  if (s.includes('transfer')) return 'etransfer';
  if (s.includes('deposit')) return 'direct_deposit';
  return null;
}
function employeePaymentFromDb(v = '') { return ({ cash: 'Cash', cheque: 'Cheque', etransfer: 'E-transfer', direct_deposit: 'Direct Deposit' })[v] || 'Cheque'; }
function stockToDb(v = 'auto') { return v === 'ok' || v === 'stocked' ? 'stocked' : v === 'reorder' || v === 'needs_stocking' ? 'needs_stocking' : 'auto'; }
function stockFromDb(v = 'auto') { return v === 'stocked' ? 'ok' : v === 'needs_stocking' ? 'reorder' : 'auto'; }

function encryptionKey() {
  const seed = process.env.EMPLOYEE_DATA_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.ADMIN_PIN || 'viet-nom-nom-local-fallback-key';
  return crypto.createHash('sha256').update(String(seed)).digest();
}
function encryptSin(value) {
  const plain = String(value || '').trim();
  if (!plain) return { ciphertext: null, last4: null };
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`, last4: plain.replace(/\D/g, '').slice(-4) || plain.slice(-4) };
}
function decryptSin(value) {
  if (!value) return '';
  try {
    const [ivB64, tagB64, dataB64] = String(value).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

async function ensureSchemaExtensions() {
  // Schema upgrades are intentionally migration-only in V11. They are never
  // executed by normal HTTP requests. Run `npm run migrate` after changing the
  // schema. Executing ALTER TABLE during serverless cold starts can block on
  // locks and was the cause of the "statement timeout" dashboard failures.
  const statements = [
    `alter table public.menu_items add column if not exists legacy_id text`,
    `create unique index if not exists uq_menu_items_legacy_id on public.menu_items(legacy_id)`,
    `alter table public.promotions add column if not exists legacy_id text`,
    `create unique index if not exists uq_promotions_legacy_id on public.promotions(legacy_id)`,
    `alter table public.inventory add column if not exists legacy_id text`,
    `create unique index if not exists uq_inventory_legacy_id on public.inventory(legacy_id)`,
    `alter table public.recipes add column if not exists legacy_id text`,
    `create unique index if not exists uq_recipes_legacy_id on public.recipes(legacy_id)`,
    `alter table public.employees add column if not exists legacy_id text`,
    `alter table public.employees add column if not exists hours_this_week numeric(8,2) not null default 0`,
    `create unique index if not exists uq_employees_legacy_id on public.employees(legacy_id)`,
    `alter table public.shifts add column if not exists legacy_id text`,
    `create unique index if not exists uq_shifts_legacy_id on public.shifts(legacy_id)`,
    `alter table public.payroll_entries add column if not exists legacy_id text`,
    `alter table public.payroll_entries add column if not exists payroll_no text`,
    `alter table public.payroll_entries add column if not exists pay_frequency text`,
    `create unique index if not exists uq_payroll_legacy_id on public.payroll_entries(legacy_id)`,
    `alter table public.orders add column if not exists legacy_id text`,
    `alter table public.orders add column if not exists channel text`,
    `alter table public.orders add column if not exists fulfillment text`,
    `alter table public.orders add column if not exists payment_label text`,
    `alter table public.orders add column if not exists staff_note text`,
    `alter table public.orders add column if not exists manual_discount numeric(10,2) not null default 0`,
    `alter table public.orders add column if not exists tax_exempt boolean not null default false`,
    `alter table public.orders add column if not exists final_distance_km numeric(10,2)`,
    `alter table public.orders add column if not exists sale_legacy_id text`,
    `create unique index if not exists uq_orders_legacy_id on public.orders(legacy_id)`,
    `alter table public.sales add column if not exists legacy_id text`,
    `create unique index if not exists uq_sales_legacy_id on public.sales(legacy_id)`,
    `alter table public.notifications add column if not exists legacy_id text`,
    `alter table public.notifications add column if not exists state text`,
    `alter table public.notifications add column if not exists detail text`,
    `create unique index if not exists uq_notifications_legacy_id on public.notifications(legacy_id)`,
    `alter table public.store_settings add column if not exists timezone text not null default 'America/Toronto'`,
    `alter table public.store_settings add column if not exists notification_email_enabled boolean not null default true`,
    `alter table public.store_settings add column if not exists notification_sms_enabled boolean not null default true`,
    `alter table public.store_settings add column if not exists feedback_phone text default '(519) 916-0879'`,
    `alter table public.store_settings add column if not exists inventory_owner_phone text default '382-342-2566'`
  ];
  const client = await pool.connect();
  try {
    await client.query(`set lock_timeout = '5s'`);
    await client.query(`set statement_timeout = '60s'`);
    for (const sql of statements) await client.query(sql);
  } finally {
    client.release();
  }
}

async function categoryId(name) {
  const n = String(name || 'Other').trim() || 'Other';
  const found = await q('select id from public.menu_categories where name=$1 limit 1', [n]);
  if (found.rows[0]) return found.rows[0].id;
  const ins = await q('insert into public.menu_categories(name, sort_order, active) values($1, 999, true) returning id', [n]);
  return ins.rows[0].id;
}
async function menuInternalId(ext) {
  const r = await q('select id from public.menu_items where legacy_id=$1 or id::text=$1 limit 1', [String(ext)]);
  return r.rows[0]?.id || null;
}
async function promoInternalId(ext) {
  if (!ext) return null;
  const r = await q('select id from public.promotions where legacy_id=$1 or id::text=$1 limit 1', [String(ext)]);
  return r.rows[0]?.id || null;
}
async function employeeInternalId(ext) {
  const r = await q('select id from public.employees where legacy_id=$1 or id::text=$1 limit 1', [String(ext)]);
  return r.rows[0]?.id || null;
}
async function orderInternalId(ext) {
  const r = await q('select id from public.orders where legacy_id=$1 or id::text=$1 limit 1', [String(ext)]);
  return r.rows[0]?.id || null;
}

async function getMenu() {
  const r = await q(`select m.*, c.name category_name from public.menu_items m left join public.menu_categories c on c.id=m.category_id order by m.sort_order, m.created_at`);
  return r.rows.map(x => ({ id: externalId(x), name: x.name, category: x.category_name || 'Other', description: x.description || '', price: Number(x.price || 0), cost: Number(x.cost || 0), active: !!x.active, soldOut: x.stock_status === 'sold_out', image: x.image_url || '' }));
}
async function upsertMenu(item) {
  const ext = String(item.id || uuid()), cid = await categoryId(item.category || 'Other');
  const r = await q(`
    insert into public.menu_items(legacy_id,name,category_id,description,price,cost,image_url,visible_on_website,active,stock_status,sort_order)
    values($1,$2,$3,$4,$5,$6,$7,true,$8,$9,0)
    on conflict (legacy_id) do update set name=excluded.name,category_id=excluded.category_id,description=excluded.description,price=excluded.price,cost=excluded.cost,image_url=excluded.image_url,active=excluded.active,stock_status=excluded.stock_status
    returning id`, [ext, item.name, cid, item.description || '', money(item.price), money(item.cost), item.image || '', item.active !== false, item.soldOut ? 'sold_out' : 'in_stock']);
  return { ...item, id: ext, _dbId: r.rows[0].id };
}
async function deleteMenu(ext) { await q('delete from public.menu_items where legacy_id=$1 or id::text=$1', [String(ext)]); }

async function getPromotions() {
  const r = await q('select * from public.promotions order by created_at desc');
  return r.rows.map(x => ({ id: externalId(x), name: x.name, type: x.discount_type === 'fixed' ? 'fixed' : 'percent', value: Number(x.discount_value || 0), active: !!x.active, websiteVisible: !!x.show_on_website, startAt: x.starts_at ? asDate(x.starts_at).slice(0,16) : '', endAt: x.ends_at ? asDate(x.ends_at).slice(0,16) : '', minSpend: Number(x.minimum_spend || 0), maxDiscount: Number(x.maximum_discount || 0), channels: [x.available_pos ? 'pos' : null, x.available_website ? 'website' : null].filter(Boolean), code: x.code || '', notes: x.notes || '' }));
}
async function upsertPromotion(p) {
  const ext = String(p.id || uuid()), channels = Array.isArray(p.channels) ? p.channels : ['pos'];
  await q(`insert into public.promotions(legacy_id,name,code,discount_type,discount_value,minimum_spend,maximum_discount,starts_at,ends_at,available_pos,available_website,show_on_website,active,notes)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    on conflict (legacy_id) do update set name=excluded.name,code=excluded.code,discount_type=excluded.discount_type,discount_value=excluded.discount_value,minimum_spend=excluded.minimum_spend,maximum_discount=excluded.maximum_discount,starts_at=excluded.starts_at,ends_at=excluded.ends_at,available_pos=excluded.available_pos,available_website=excluded.available_website,show_on_website=excluded.show_on_website,active=excluded.active,notes=excluded.notes`,
    [ext,p.name,p.code||null,p.type==='fixed'?'fixed':'percent',money(p.value),money(p.minSpend),Number(p.maxDiscount)>0?money(p.maxDiscount):null,p.startAt||null,p.endAt||null,channels.includes('pos'),channels.includes('website'),!!p.websiteVisible,p.active!==false,p.notes||'']);
  return { ...p, id: ext };
}
async function deletePromotion(ext) { await q('delete from public.promotions where legacy_id=$1 or id::text=$1', [String(ext)]); }

async function getInventory() {
  const r = await q('select * from public.inventory where active=true order by created_at');
  return r.rows.map(x => ({ id: externalId(x), name: x.item_name, unit: x.unit || 'unit', qty: Number(x.current_quantity || 0), reorder: Number(x.reorder_at || 0), targetQty: Number(x.target_stock || 0), usageNote: x.usage_note || '', cost: Number(x.cost || 0), supplier: x.supplier || '', statusOverride: stockFromDb(x.stock_status), updatedAt: asDate(x.updated_at), lastStockedAt: asDate(x.last_stocked_at) }));
}
async function upsertInventory(x) {
  const ext=String(x.id||uuid());
  await q(`insert into public.inventory(legacy_id,item_name,unit,current_quantity,reorder_at,target_stock,cost,supplier,usage_note,stock_status,last_stocked_at,active)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
    on conflict (legacy_id) do update set item_name=excluded.item_name,unit=excluded.unit,current_quantity=excluded.current_quantity,reorder_at=excluded.reorder_at,target_stock=excluded.target_stock,cost=excluded.cost,supplier=excluded.supplier,usage_note=excluded.usage_note,stock_status=excluded.stock_status,last_stocked_at=excluded.last_stocked_at,active=true`,
    [ext,x.name,x.unit||'unit',Number(x.qty)||0,Number(x.reorder)||0,Number(x.targetQty)||null,money(x.cost),x.supplier||'',x.usageNote||'',stockToDb(x.statusOverride),x.lastStockedAt||null]);
  return {...x,id:ext};
}
async function deleteInventory(ext){await q('delete from public.inventory where legacy_id=$1 or id::text=$1',[String(ext)]);}

async function getEmployees(){
  const r=await q('select * from public.employees order by created_at');
  return r.rows.map(x=>({id:externalId(x),name:x.legal_name,preferredName:x.preferred_name||'',role:x.role||'',phone:x.phone||'',email:x.email||'',address:x.address||'',city:x.city||'',province:x.province||'',postalCode:x.postal_code||'',dateOfBirth:cleanDate(x.date_of_birth),sin:decryptSin(x.sin_ciphertext),sinLast4:x.sin_last4||'',emergencyName:x.emergency_contact_name||'',emergencyPhone:x.emergency_contact_phone||'',hireDate:cleanDate(x.hire_date),employmentType:x.employment_type||'Part-time',status:x.active?'Active':'Inactive',hourlyRate:Number(x.hourly_rate||0),hoursThisWeek:Number(x.hours_this_week||0),payFrequency:payFreqFromDb(x.pay_frequency),defaultPaymentMethod:employeePaymentFromDb(x.default_payment_method),notes:x.notes||''}));
}
async function upsertEmployee(x){
  const ext=String(x.id||uuid()); let sinCipher=null,sinLast4=null;
  if(x.sin!==undefined){const e=encryptSin(x.sin);sinCipher=e.ciphertext;sinLast4=e.last4}
  const existing=await q('select sin_ciphertext,sin_last4 from public.employees where legacy_id=$1 or id::text=$1 limit 1',[ext]);
  if(x.sin===undefined&&existing.rows[0]){sinCipher=existing.rows[0].sin_ciphertext;sinLast4=existing.rows[0].sin_last4}
  await q(`insert into public.employees(legacy_id,legal_name,preferred_name,role,employment_type,phone,email,address,city,province,postal_code,date_of_birth,sin_ciphertext,sin_last4,emergency_contact_name,emergency_contact_phone,hire_date,hourly_rate,pay_frequency,default_payment_method,notes,active,hours_this_week)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    on conflict (legacy_id) do update set legal_name=excluded.legal_name,preferred_name=excluded.preferred_name,role=excluded.role,employment_type=excluded.employment_type,phone=excluded.phone,email=excluded.email,address=excluded.address,city=excluded.city,province=excluded.province,postal_code=excluded.postal_code,date_of_birth=excluded.date_of_birth,sin_ciphertext=excluded.sin_ciphertext,sin_last4=excluded.sin_last4,emergency_contact_name=excluded.emergency_contact_name,emergency_contact_phone=excluded.emergency_contact_phone,hire_date=excluded.hire_date,hourly_rate=excluded.hourly_rate,pay_frequency=excluded.pay_frequency,default_payment_method=excluded.default_payment_method,notes=excluded.notes,active=excluded.active,hours_this_week=excluded.hours_this_week`,
    [ext,x.name,x.preferredName||null,x.role||null,x.employmentType||null,x.phone||null,x.email||null,x.address||null,x.city||null,x.province||null,x.postalCode||null,x.dateOfBirth||null,sinCipher,sinLast4,x.emergencyName||null,x.emergencyPhone||null,x.hireDate||null,money(x.hourlyRate),payFreqToDb(x.payFrequency),employeePaymentToDb(x.defaultPaymentMethod),x.notes||null,String(x.status||'Active').toLowerCase()!=='inactive',Number(x.hoursThisWeek)||0]);
  return {...x,id:ext};
}
async function deleteEmployee(ext){await q('delete from public.employees where legacy_id=$1 or id::text=$1',[String(ext)]);}

async function getShifts(){
  const r=await q(`select s.*,e.legal_name employee_name,e.legacy_id employee_legacy_id from public.shifts s join public.employees e on e.id=s.employee_id order by s.shift_date,s.start_time`);
  return r.rows.map(x=>({id:externalId(x),employeeId:x.employee_legacy_id||String(x.employee_id),employeeName:x.employee_name,date:cleanDate(x.shift_date),shiftType:x.shift_type?x.shift_type[0].toUpperCase()+x.shift_type.slice(1):'Custom',startTime:String(x.start_time||'').slice(0,5),endTime:String(x.end_time||'').slice(0,5),breakMinutes:Number(x.break_minutes||0),hours:Number(x.hours_worked||0),hourlyRate:Number(x.hourly_rate||0),gross:Number(x.gross_pay||0),notes:x.notes||'',createdAt:asDate(x.created_at)}));
}
async function upsertShift(x){
  const ext=String(x.id||uuid()),eid=await employeeInternalId(x.employeeId);if(!eid)throw Error('Employee not found');
  await q(`insert into public.shifts(legacy_id,employee_id,shift_date,shift_type,start_time,end_time,break_minutes,hours_worked,hourly_rate,gross_pay,payroll_status,notes)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unpaid',$11)
    on conflict (legacy_id) do update set employee_id=excluded.employee_id,shift_date=excluded.shift_date,shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,break_minutes=excluded.break_minutes,hours_worked=excluded.hours_worked,hourly_rate=excluded.hourly_rate,gross_pay=excluded.gross_pay,notes=excluded.notes`,
    [ext,eid,x.date,String(x.shiftType||'custom').toLowerCase(),x.startTime,x.endTime,Number(x.breakMinutes)||0,Number(x.hours)||0,money(x.hourlyRate),money(x.gross),x.notes||null]);
  return {...x,id:ext};
}
async function deleteShift(ext){await q('delete from public.shifts where legacy_id=$1 or id::text=$1',[String(ext)]);}

async function getPayroll(){
  const r=await q(`select p.*,e.legal_name employee_name,e.legacy_id employee_legacy_id from public.payroll_entries p join public.employees e on e.id=p.employee_id order by p.created_at desc`);
  return r.rows.map(x=>({id:externalId(x),payrollNo:x.payroll_no||'',employeeId:x.employee_legacy_id||String(x.employee_id),employeeName:x.employee_name,payFrequency:x.pay_frequency||payFreqFromDb('biweekly'),periodStart:cleanDate(x.pay_period_start),periodEnd:cleanDate(x.pay_period_end),payDate:cleanDate(x.actual_paid_date||x.scheduled_pay_date),regularHours:Number(x.regular_hours||0),overtimeHours:Number(x.overtime_hours||0),hourlyRate:Number(x.hourly_rate||0),overtimeMultiplier:Number(x.overtime_multiplier||1.5),regularPay:Number(x.regular_pay||0),overtimePay:Number(x.overtime_pay||0),grossPay:Number(x.gross_pay||0),incomeTax:Number(x.income_tax||0),cpp:Number(x.cpp||0),ei:Number(x.ei||0),otherDeductions:Number(x.other_deductions||0),totalDeductions:Number(x.total_deductions||0),netPay:Number(x.net_pay||0),paymentMethod:employeePaymentFromDb(x.payment_method),referenceNo:x.cheque_reference||'',notes:x.notes||'',status:x.status||'paid',createdAt:asDate(x.created_at)}));
}
async function upsertPayroll(x){
  const ext=String(x.id||uuid()),eid=await employeeInternalId(x.employeeId);if(!eid)throw Error('Employee not found');
  const paidDate=x.payDate||new Date().toISOString().slice(0,10);
  await q(`insert into public.payroll_entries(legacy_id,payroll_no,employee_id,pay_period_start,pay_period_end,scheduled_pay_date,actual_paid_date,regular_hours,overtime_hours,hourly_rate,overtime_multiplier,regular_pay,overtime_pay,gross_pay,income_tax,cpp,ei,other_deductions,total_deductions,net_pay,payment_method,cheque_reference,status,notes,pay_frequency)
    values($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'paid',$22,$23)
    on conflict (legacy_id) do update set payroll_no=excluded.payroll_no,employee_id=excluded.employee_id,pay_period_start=excluded.pay_period_start,pay_period_end=excluded.pay_period_end,scheduled_pay_date=excluded.scheduled_pay_date,actual_paid_date=excluded.actual_paid_date,regular_hours=excluded.regular_hours,overtime_hours=excluded.overtime_hours,hourly_rate=excluded.hourly_rate,overtime_multiplier=excluded.overtime_multiplier,regular_pay=excluded.regular_pay,overtime_pay=excluded.overtime_pay,gross_pay=excluded.gross_pay,income_tax=excluded.income_tax,cpp=excluded.cpp,ei=excluded.ei,other_deductions=excluded.other_deductions,total_deductions=excluded.total_deductions,net_pay=excluded.net_pay,payment_method=excluded.payment_method,cheque_reference=excluded.cheque_reference,status='paid',notes=excluded.notes,pay_frequency=excluded.pay_frequency`,
    [ext,x.payrollNo||null,eid,x.periodStart,x.periodEnd,paidDate,Number(x.regularHours)||0,Number(x.overtimeHours)||0,money(x.hourlyRate),Number(x.overtimeMultiplier)||1.5,money(x.regularPay),money(x.overtimePay),money(x.grossPay),money(x.incomeTax),money(x.cpp),money(x.ei),money(x.otherDeductions),money(x.totalDeductions),money(x.netPay),employeePaymentToDb(x.paymentMethod),x.referenceNo||null,x.notes||null,x.payFrequency||'Bi-weekly']);
  return {...x,id:ext};
}
async function deletePayroll(ext){await q('delete from public.payroll_entries where legacy_id=$1 or id::text=$1',[String(ext)]);}

async function getRecipes(){
  const rr=await q(`select r.*,m.name menu_name from public.recipes r left join public.menu_items m on m.id=r.related_menu_item_id order by r.created_at`);
  const ir=await q('select ri.*,r.legacy_id recipe_legacy_id from public.recipe_ingredients ri join public.recipes r on r.id=ri.recipe_id order by ri.sort_order,ri.created_at');
  const by=new Map();for(const i of ir.rows){const key=i.recipe_legacy_id||String(i.recipe_id);if(!by.has(key))by.set(key,[]);by.get(key).push({qty:i.quantity===null?'':String(Number(i.quantity)),unit:i.unit||'',item:i.ingredient_name,note:i.note||''})}
  return rr.rows.map(x=>({id:externalId(x),name:x.name,category:x.category||'',menuItemName:x.menu_name||'',yield:x.batch_yield||'',active:!!x.active,ingredients:by.get(externalId(x))||[],instructions:x.preparation_method||'',notes:x.manager_notes||'',referenceImage:x.reference_image_url||'',updatedAt:asDate(x.updated_at)}));
}
async function upsertRecipe(x){
  const ext=String(x.id||uuid());let mid=null;if(x.menuItemName){const m=await q('select id from public.menu_items where name=$1 limit 1',[x.menuItemName]);mid=m.rows[0]?.id||null}
  const r=await q(`insert into public.recipes(legacy_id,name,category,related_menu_item_id,batch_yield,preparation_method,manager_notes,reference_image_url,active)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (legacy_id) do update set name=excluded.name,category=excluded.category,related_menu_item_id=excluded.related_menu_item_id,batch_yield=excluded.batch_yield,preparation_method=excluded.preparation_method,manager_notes=excluded.manager_notes,reference_image_url=excluded.reference_image_url,active=excluded.active returning id`,
    [ext,x.name,x.category||null,mid,x.yield||null,x.instructions||null,x.notes||null,x.referenceImage||null,x.active!==false]);
  const rid=r.rows[0].id;await q('delete from public.recipe_ingredients where recipe_id=$1',[rid]);let n=0;for(const i of x.ingredients||[]){if(!i.item)continue;const qty=i.qty===''||i.qty===null||i.qty===undefined?null:Number(i.qty);await q('insert into public.recipe_ingredients(recipe_id,ingredient_name,quantity,unit,note,sort_order) values($1,$2,$3,$4,$5,$6)',[rid,i.item,Number.isFinite(qty)?qty:null,i.unit||null,i.note||null,n++])}
  return {...x,id:ext};
}
async function deleteRecipe(ext){await q('delete from public.recipes where legacy_id=$1 or id::text=$1',[String(ext)]);}


function decodeWebsiteNoticeV1122(raw){
  const text=String(raw||'');
  const deliveryEnabled=!/\[\[DELIVERY_OFF\]\]/i.test(text);
  return {deliveryEnabled,notice:text.replace(/\s*\[\[DELIVERY_OFF\]\]\s*/ig,'').trim()};
}
function encodeWebsiteNoticeV1122(notice,deliveryEnabled){
  const clean=String(notice||'').replace(/\s*\[\[DELIVERY_OFF\]\]\s*/ig,'').trim();
  return deliveryEnabled===false ? `${clean}${clean?' ':''}[[DELIVERY_OFF]]` : clean;
}
async function getSettings(){
  const sr=await q('select * from public.store_settings order by created_at limit 1');
  let s=sr.rows[0];if(!s){s=(await q(`insert into public.store_settings(store_name,phone,address,email) values('Viet Nom Nom','(519) 916-0879','6645 Tecumseh Rd E, Windsor, ON N8T 1E7','') returning *`)).rows[0]}
  const hr=await q('select * from public.store_hours order by day_of_week');
  const pr=await q('select * from public.payroll_settings order by created_at limit 1');
  const hours={};for(const h of hr.rows){hours[String(h.day_name||'').toLowerCase()]={open:String(h.open_time||'10:00').slice(0,5),close:String(h.close_time||'20:00').slice(0,5),closed:!h.is_open}}
  const decodedNotice=decodeWebsiteNoticeV1122(s.website_notice||'');
  return {businessName:s.store_name||"Viet Nom Nom",phone:s.phone||'',address:s.address||'',email:s.email||'',timezone:s.timezone||'America/Toronto',onlineOrderingEnabled:!!s.online_ordering_enabled,deliveryEnabled:decodedNotice.deliveryEnabled,storeOverride:s.manual_status||'auto',notice:decodedNotice.notice,notificationEmailEnabled:s.notification_email_enabled!==false,notificationSmsEnabled:s.notification_sms_enabled!==false,feedbackPhone:s.feedback_phone||'(519) 916-0879',inventoryOwnerPhone:s.inventory_owner_phone||'382-342-2566',biweeklyAnchorDate:cleanDate(pr.rows[0]?.common_biweekly_payday),hours};
}
async function updateSettings(s){
  const existing=await q('select id from public.store_settings order by created_at limit 1');
  if(existing.rows[0]) await q(`update public.store_settings set store_name=$1,phone=$2,address=$3,email=$4,timezone=$5,online_ordering_enabled=$6,manual_status=$7,website_notice=$8,notification_email_enabled=$9,notification_sms_enabled=$10,feedback_phone=$11,inventory_owner_phone=$12 where id=$13`,[s.businessName||"Viet Nom Nom",s.phone||'',s.address||'',s.email||'',s.timezone||'America/Toronto',!!s.onlineOrderingEnabled,s.storeOverride||'auto',encodeWebsiteNoticeV1122(s.notice||'',s.deliveryEnabled!==false),s.notificationEmailEnabled!==false,s.notificationSmsEnabled!==false,s.feedbackPhone||'(519) 916-0879',s.inventoryOwnerPhone||'382-342-2566',existing.rows[0].id]);
  else await q(`insert into public.store_settings(store_name,phone,address,email,timezone,online_ordering_enabled,manual_status,website_notice,notification_email_enabled,notification_sms_enabled,feedback_phone,inventory_owner_phone) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[s.businessName||"Viet Nom Nom",s.phone||'',s.address||'',s.email||'',s.timezone||'America/Toronto',!!s.onlineOrderingEnabled,s.storeOverride||'auto',encodeWebsiteNoticeV1122(s.notice||'',s.deliveryEnabled!==false),s.notificationEmailEnabled!==false,s.notificationSmsEnabled!==false,s.feedbackPhone||'(519) 916-0879',s.inventoryOwnerPhone||'382-342-2566']);
  const dayNo={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};for(const [day,h] of Object.entries(s.hours||{})){await q(`insert into public.store_hours(day_of_week,day_name,is_open,open_time,close_time) values($1,$2,$3,$4,$5) on conflict(day_of_week) do update set day_name=excluded.day_name,is_open=excluded.is_open,open_time=excluded.open_time,close_time=excluded.close_time`,[dayNo[day],day[0].toUpperCase()+day.slice(1),!h.closed,h.open||'10:00',h.close||'20:00'])}
  if(s.biweeklyAnchorDate){const pr=await q('select id from public.payroll_settings order by created_at limit 1');if(pr.rows[0])await q('update public.payroll_settings set common_biweekly_payday=$1 where id=$2',[s.biweeklyAnchorDate,pr.rows[0].id]);else await q('insert into public.payroll_settings(common_biweekly_payday) values($1)',[s.biweeklyAnchorDate])}
  return getSettings();
}

function parseOrderItemMeta(raw){
  if(!raw)return {modifiers:[],note:''};
  try{
    const v=typeof raw==='string'?JSON.parse(raw):raw;
    if(v&&typeof v==='object')return {modifiers:Array.isArray(v.modifiers)?v.modifiers.map(String):[],note:String(v.note||'')};
  }catch{}
  return {modifiers:[],note:String(raw||'')};
}
function orderItemMeta(i){return JSON.stringify({modifiers:Array.isArray(i?.modifiers)?i.modifiers.map(String):[],note:String(i?.notes||'')})}

async function getOrders(status){
  const params=[];let where='';if(status&&status!=='all'){params.push(appStatusToDb(status));where='where o.status=$1'}
  const r=await q(`select o.*,p.legacy_id promotion_legacy_id,p.name promotion_db_name from public.orders o left join public.promotions p on p.id=o.promotion_id ${where} order by o.created_at desc`,params);
  if(!r.rows.length)return [];
  const ids=r.rows.map(x=>x.id), ir=await q(`select oi.*,m.legacy_id menu_legacy_id from public.order_items oi left join public.menu_items m on m.id=oi.menu_item_id where oi.order_id = any($1::uuid[]) order by oi.created_at`,[ids]);
  const by=new Map();for(const i of ir.rows){const a=by.get(i.order_id)||[],meta=parseOrderItemMeta(i.notes);a.push({id:i.menu_legacy_id||i.menu_item_id||i.id,name:i.item_name,price:Number(i.unit_price||0),qty:Number(i.quantity||1),modifiers:meta.modifiers,notes:meta.note});by.set(i.order_id,a)}
  return r.rows.map(x=>({id:externalId(x),orderNo:x.order_number,createdAt:asDate(x.created_at),updatedAt:asDate(x.updated_at),source:x.source||'website',channel:x.channel||x.source||'website',status:snakeStatusToApp(x.status),customer:{name:x.customer_name||'',phone:x.customer_phone||'',email:x.customer_email||''},items:by.get(x.id)||[],fulfillment:x.fulfillment||displayFulfillment(x.order_type),address:x.delivery_address||'',requestedTime:x.requested_time||'ASAP',payment:x.payment_label||paymentLabel(x.payment_method),paymentStatus:x.payment_status||'unpaid',notes:x.notes||'',staffNote:x.staff_note||'',promotionId:x.promotion_legacy_id||'',manualDiscount:Number(x.manual_discount||0),taxExempt:!!x.tax_exempt,customerDistanceKm:Number(x.customer_distance_km||0),finalDistanceKm:Number(x.final_distance_km||x.staff_confirmed_distance_km||x.customer_distance_km||0),saleId:x.sale_legacy_id||null,subtotal:Number(x.subtotal||0),discount:Number(x.total_discount||0),promotion:x.promotion_name||x.promotion_db_name||'',deliveryFee:Number(x.delivery_fee||0),tax:Number(x.tax_amount||0),taxRate:Number(x.tax_rate||0.13),total:Number(x.total||0)}));
}
async function getOrderByNumber(orderNo){
  const r=await q(`select o.*,p.legacy_id promotion_legacy_id,p.name promotion_db_name from public.orders o left join public.promotions p on p.id=o.promotion_id where o.order_number=$1 limit 1`,[String(orderNo||'')]);
  const x=r.rows[0];if(!x)return null;
  const ir=await q(`select oi.*,m.legacy_id menu_legacy_id from public.order_items oi left join public.menu_items m on m.id=oi.menu_item_id where oi.order_id=$1 order by oi.created_at`,[x.id]);
  const items=ir.rows.map(i=>{const meta=parseOrderItemMeta(i.notes);return {id:i.menu_legacy_id||i.menu_item_id||i.id,name:i.item_name,price:Number(i.unit_price||0),qty:Number(i.quantity||1),modifiers:meta.modifiers,notes:meta.note}});
  return {id:externalId(x),orderNo:x.order_number,createdAt:asDate(x.created_at),updatedAt:asDate(x.updated_at),source:x.source||'website',channel:x.channel||x.source||'website',status:snakeStatusToApp(x.status),customer:{name:x.customer_name||'',phone:x.customer_phone||'',email:x.customer_email||''},items,fulfillment:x.fulfillment||displayFulfillment(x.order_type),address:x.delivery_address||'',requestedTime:x.requested_time||'ASAP',payment:x.payment_label||paymentLabel(x.payment_method),paymentStatus:x.payment_status||'unpaid',notes:x.notes||'',staffNote:x.staff_note||'',promotionId:x.promotion_legacy_id||'',manualDiscount:Number(x.manual_discount||0),taxExempt:!!x.tax_exempt,customerDistanceKm:Number(x.customer_distance_km||0),finalDistanceKm:Number(x.final_distance_km||x.staff_confirmed_distance_km||x.customer_distance_km||0),saleId:x.sale_legacy_id||null,subtotal:Number(x.subtotal||0),discount:Number(x.total_discount||0),promotion:x.promotion_name||x.promotion_db_name||'',deliveryFee:Number(x.delivery_fee||0),tax:Number(x.tax_amount||0),taxRate:Number(x.tax_rate||0.13),total:Number(x.total||0)};
}

async function insertOrder(o){
  const ext=String(o.id||uuid()),pid=await promoInternalId(o.promotionId);let cid=null;
  if(o.customer?.name||o.customer?.phone||o.customer?.email){const c=await q('insert into public.customers(name,phone,email,address) values($1,$2,$3,$4) returning id',[o.customer?.name||null,o.customer?.phone||null,o.customer?.email||null,o.address||null]);cid=c.rows[0].id}
  const r=await q(`insert into public.orders(legacy_id,order_number,customer_id,customer_name,customer_phone,customer_email,source,channel,order_type,fulfillment,status,payment_method,payment_label,payment_status,delivery_address,customer_distance_km,staff_confirmed_distance_km,final_distance_km,requested_time,promotion_id,promotion_name,subtotal,promotion_discount,manual_discount,total_discount,taxable_subtotal,tax_rate,tax_amount,total,delivery_fee,notes,staff_note,tax_exempt,sale_legacy_id,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36) returning id`,
    [ext,o.orderNo,cid,o.customer?.name||'',o.customer?.phone||'',o.customer?.email||'',o.source||'website',o.channel||o.source||'website',normalizeOrderType(o.fulfillment),o.fulfillment||'pickup',appStatusToDb(o.status||'new'),normalizePayment(o.payment),o.payment||'',o.paymentStatus||'unpaid',o.address||null,Number(o.customerDistanceKm)||null,Number(o.finalDistanceKm)||null,Number(o.finalDistanceKm)||null,o.requestedTime||'ASAP',pid,o.promotion||'',money(o.subtotal),money(Math.max(0,Number(o.discount||0)-Number(o.manualDiscount||0))),money(o.manualDiscount),money(o.discount),money(Number(o.subtotal||0)-Number(o.discount||0)+Number(o.deliveryFee||0)),Number(o.taxRate)||0.13,money(o.tax),money(o.total),money(o.deliveryFee),o.notes||'',o.staffNote||'',!!o.taxExempt,o.saleId||null,o.createdAt||new Date(),o.updatedAt||new Date()]);
  const oid=r.rows[0].id;for(const i of o.items||[]){const mid=await menuInternalId(i.id);await q('insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price,line_discount,line_total,notes) values($1,$2,$3,$4,$5,0,$6,$7)',[oid,mid,i.name,Number(i.qty)||1,money(i.price),money(Number(i.price||0)*Number(i.qty||1)),orderItemMeta(i)])}
  return {...o,id:ext};
}
async function updateOrder(o){
  const oid=await orderInternalId(o.id);if(!oid)throw Error('Order not found');const pid=await promoInternalId(o.promotionId);
  await q(`update public.orders set customer_name=$1,customer_phone=$2,customer_email=$3,channel=$4,order_type=$5,fulfillment=$6,status=$7,payment_method=$8,payment_label=$9,payment_status=$10,delivery_address=$11,customer_distance_km=$12,staff_confirmed_distance_km=$13,final_distance_km=$13,requested_time=$14,promotion_id=$15,promotion_name=$16,subtotal=$17,promotion_discount=$18,manual_discount=$19,total_discount=$20,taxable_subtotal=$21,tax_rate=$22,tax_amount=$23,total=$24,delivery_fee=$25,notes=$26,staff_note=$27,tax_exempt=$28,sale_legacy_id=$29,updated_at=now() where id=$30`,
    [o.customer?.name||'',o.customer?.phone||'',o.customer?.email||'',o.channel||o.source||'website',normalizeOrderType(o.fulfillment),o.fulfillment||'pickup',appStatusToDb(o.status),normalizePayment(o.payment),o.payment||'',o.paymentStatus||'unpaid',o.address||null,Number(o.customerDistanceKm)||null,Number(o.finalDistanceKm)||null,o.requestedTime||'ASAP',pid,o.promotion||'',money(o.subtotal),money(Math.max(0,Number(o.discount||0)-Number(o.manualDiscount||0))),money(o.manualDiscount),money(o.discount),money(Number(o.subtotal||0)-Number(o.discount||0)+Number(o.deliveryFee||0)),Number(o.taxRate)||0.13,money(o.tax),money(o.total),money(o.deliveryFee),o.notes||'',o.staffNote||'',!!o.taxExempt,o.saleId||null,oid]);
  await q('delete from public.order_items where order_id=$1',[oid]);for(const i of o.items||[]){const mid=await menuInternalId(i.id);await q('insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price,line_discount,line_total,notes) values($1,$2,$3,$4,$5,0,$6,$7)',[oid,mid,i.name,Number(i.qty)||1,money(i.price),money(Number(i.price||0)*Number(i.qty||1)),orderItemMeta(i)])}
  return o;
}

async function deleteOrder(ext){
  const client=await pool.connect();
  try{
    await client.query('begin');
    const found=await client.query('select id,customer_id,order_number from public.orders where legacy_id=$1 or id::text=$1 limit 1',[String(ext)]);
    const row=found.rows[0];
    if(!row){await client.query('rollback');return false}
    const oid=row.id,cid=row.customer_id;
    // Manager delete is intended for test/duplicate orders, so remove every linked
    // record that would otherwise keep the order in history, analytics or notices.
    await client.query('delete from public.notifications where order_id=$1',[oid]);
    await client.query('delete from public.sales where order_id=$1',[oid]);
    await client.query('delete from public.order_items where order_id=$1',[oid]);
    await client.query('delete from public.orders where id=$1',[oid]);
    // Customer rows are created per order in this app. Clean up only if orphaned.
    if(cid){await client.query('delete from public.customers c where c.id=$1 and not exists(select 1 from public.orders o where o.customer_id=c.id)',[cid])}
    await client.query('commit');
    return true;
  }catch(e){
    try{await client.query('rollback')}catch{}
    throw e;
  }finally{client.release()}
}

async function getSales(){
  const r=await q(`select s.*,o.legacy_id order_legacy_id,o.order_number,o.customer_name,o.customer_phone,o.customer_email from public.sales s left join public.orders o on o.id=s.order_id order by s.completed_at desc`);if(!r.rows.length)return [];
  const orderIds=r.rows.map(x=>x.order_id).filter(Boolean);let by=new Map();if(orderIds.length){const ir=await q(`select oi.*,m.legacy_id menu_legacy_id from public.order_items oi left join public.menu_items m on m.id=oi.menu_item_id where oi.order_id=any($1::uuid[])`,[orderIds]);for(const i of ir.rows){const a=by.get(i.order_id)||[],meta=parseOrderItemMeta(i.notes);a.push({id:i.menu_legacy_id||i.menu_item_id||i.id,name:i.item_name,price:Number(i.unit_price||0),qty:Number(i.quantity||1),modifiers:meta.modifiers,notes:meta.note});by.set(i.order_id,a)}}
  return r.rows.map(x=>({id:externalId(x),saleNo:x.sale_number,orderId:x.order_legacy_id||x.order_id||'',orderNo:x.order_number||'',createdAt:asDate(x.completed_at||x.created_at),items:by.get(x.order_id)||[],subtotal:Number(x.subtotal||0),discount:Number(x.discount||0),promotion:'',manualDiscount:0,deliveryFee:Number(x.delivery_fee||0),tax:Number(x.tax_amount||0),total:Number(x.total||0),payment:x.payment_method||'',channel:x.channel||'',customerName:x.customer_name||'',customerPhone:x.customer_phone||'',customerEmail:x.customer_email||'',notes:''}));
}
async function insertSale(s){
  const ext=String(s.id||uuid()),oid=await orderInternalId(s.orderId);const r=await q(`insert into public.sales(legacy_id,sale_number,order_id,channel,payment_method,subtotal,discount,delivery_fee,tax_amount,total,completed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(legacy_id) do update set sale_number=excluded.sale_number,order_id=excluded.order_id,channel=excluded.channel,payment_method=excluded.payment_method,subtotal=excluded.subtotal,discount=excluded.discount,delivery_fee=excluded.delivery_fee,tax_amount=excluded.tax_amount,total=excluded.total,completed_at=excluded.completed_at returning id`,[ext,s.saleNo,oid,s.channel||'',s.payment||'',money(s.subtotal),money(s.discount),money(s.deliveryFee),money(s.tax),money(s.total),s.createdAt||new Date()]);return {...s,id:ext,_dbId:r.rows[0].id};
}

async function getNotifications(){
  const r=await q('select n.*,o.legacy_id order_legacy_id,o.order_number from public.notifications n left join public.orders o on o.id=n.order_id order by n.created_at desc limit 2000');
  return r.rows.map(x=>({id:externalId(x),orderId:x.order_legacy_id||x.order_id||'',orderNo:x.order_number||'',status:x.order_status||'',type:x.notification_type,state:x.state||x.delivery_status,detail:x.detail||x.message||'',recipient:x.recipient||'',createdAt:asDate(x.created_at)}));
}
async function addNotification(n){
  const ext=String(n.id||uuid()),oid=n.orderId&&n.orderId!=='inventory'?await orderInternalId(n.orderId):null;await q(`insert into public.notifications(legacy_id,order_id,notification_type,recipient,order_status,subject,message,provider,delivery_status,provider_message_id,error_message,state,detail,created_at,sent_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[ext,oid,n.type||'system',n.recipient||null,n.status||null,n.subject||null,n.detail||n.message||null,n.provider||null,['sent','failed','simulated','pending'].includes(n.state)?n.state:'pending',n.providerMessageId||null,n.errorMessage||null,n.state||null,n.detail||null,n.createdAt||new Date(),n.state==='sent'?new Date():null]);return {...n,id:ext};
}

async function analytics(salesInput){
  const sales=Array.isArray(salesInput)?salesInput:await getSales(),today=new Date().toDateString(),month=new Date().getMonth(),yr=new Date().getFullYear(),sum=a=>money(a.reduce((s,x)=>s+Number(x.total||0),0));const todaySales=sales.filter(x=>new Date(x.createdAt).toDateString()===today),monthSales=sales.filter(x=>{const d=new Date(x.createdAt);return d.getMonth()===month&&d.getFullYear()===yr});const count={};for(const s of sales)for(const i of s.items||[])count[i.name]=(count[i.name]||0)+Number(i.qty||0);return {todayRevenue:sum(todaySales),monthRevenue:sum(monthSales),allRevenue:sum(sales),todayOrders:todaySales.length,totalOrders:sales.length,topItems:Object.entries(count).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,qty])=>({name,qty}))};
}

function loadJson(dir,file,fallback){try{return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'))}catch{return fallback}}
async function bootstrapFromJson(dataDir){
  await ensureSchemaExtensions();
  const client=await pool.connect();
  let locked=false;
  try{
    const lockResult=await client.query("select pg_try_advisory_lock(hashtext('viet-nom-nom-v1-bootstrap')) as locked");
    locked=!!lockResult.rows[0]?.locked;
    if(!locked) throw new Error('Another Viet Nom Nom database migration is already running. Wait a moment and retry.');
    const counts={};for(const [k,t] of Object.entries({menu:'menu_items',promotions:'promotions',inventory:'inventory',employees:'employees',recipes:'recipes',orders:'orders',sales:'sales',shifts:'shifts',payroll:'payroll_entries'})){counts[k]=Number((await q(`select count(*) c from public.${t}`)).rows[0].c)}
    if(!counts.menu) for(const x of loadJson(dataDir,'menu.json',[])) await upsertMenu(x);
    if(!counts.promotions) for(const x of loadJson(dataDir,'promotions.json',[])) await upsertPromotion(x);
    if(!counts.inventory) for(const x of loadJson(dataDir,'inventory.json',[])) await upsertInventory(x);
    if(!counts.employees) for(const x of loadJson(dataDir,'employees.json',[])) await upsertEmployee(x);
    if(!counts.recipes) for(const x of loadJson(dataDir,'recipes.json',[])) await upsertRecipe(x);
    const settings=loadJson(dataDir,'settings.json',{}); if(Object.keys(settings).length) await updateSettings({...await getSettings(),...settings,hours:settings.hours|| (await getSettings()).hours});
    if(!counts.orders) for(const x of loadJson(dataDir,'orders.json',[])) await insertOrder(x);
    if(!counts.sales) for(const x of loadJson(dataDir,'sales.json',[])) await insertSale(x);
    if(!counts.shifts) for(const x of loadJson(dataDir,'shifts.json',[])) await upsertShift(x);
    if(!counts.payroll) for(const x of loadJson(dataDir,'payroll.json',[])) await upsertPayroll(x);
    await seedRevenueLedger(loadJson(dataDir,'revenue-ledger.json',[]));
  } finally {
    if(locked){try{await client.query("select pg_advisory_unlock(hashtext('viet-nom-nom-v1-bootstrap'))")}catch{}}
    client.release();
  }
}


// V11.40 — Manager daily revenue / cash close ledger.
// This is a standalone table created lazily because it does not alter any existing
// production table. Existing rows are never overwritten by the bundled notebook seed.
let revenueLedgerSchemaReadyV1140=false;
async function ensureRevenueLedgerSchemaV1140(){
  if(revenueLedgerSchemaReadyV1140)return;
  await q(`create table if not exists public.manager_daily_revenue (
    id uuid primary key,
    business_date date not null unique,
    debit_total numeric(12,2),
    cash_drawer_total numeric(12,2),
    debit_tips numeric(12,2),
    cash_tips numeric(12,2),
    begin_cash numeric(12,2),
    owner_cash_out numeric(12,2),
    other_cash_out numeric(12,2),
    revenue_override numeric(12,2),
    notes text,
    source text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await q(`create index if not exists idx_manager_daily_revenue_date on public.manager_daily_revenue(business_date desc)`);
  revenueLedgerSchemaReadyV1140=true;
}
function nullableMoneyV1140(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?money(n):null}
function mapRevenueLedgerRowV1140(x){
  const n=v=>v===null||v===undefined?null:Number(v);
  return {id:String(x.id),date:cleanDate(x.business_date),debitTotal:n(x.debit_total),cashDrawerTotal:n(x.cash_drawer_total),debitTips:n(x.debit_tips),cashTips:n(x.cash_tips),beginCash:n(x.begin_cash),ownerCashOut:n(x.owner_cash_out),otherCashOut:n(x.other_cash_out),revenueOverride:n(x.revenue_override),notes:x.notes||'',source:x.source||'',createdAt:asDate(x.created_at),updatedAt:asDate(x.updated_at)};
}
async function getRevenueLedger(){
  await ensureRevenueLedgerSchemaV1140();
  const r=await q(`select * from public.manager_daily_revenue order by business_date desc`);
  return r.rows.map(mapRevenueLedgerRowV1140);
}
async function upsertRevenueLedger(x){
  await ensureRevenueLedgerSchemaV1140();
  const date=cleanDate(x.date||x.businessDate);if(!date)throw Error('Business date required');
  const ext=String(x.id||uuid());
  const r=await q(`insert into public.manager_daily_revenue(id,business_date,debit_total,cash_drawer_total,debit_tips,cash_tips,begin_cash,owner_cash_out,other_cash_out,revenue_override,notes,source,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
    on conflict(business_date) do update set debit_total=excluded.debit_total,cash_drawer_total=excluded.cash_drawer_total,debit_tips=excluded.debit_tips,cash_tips=excluded.cash_tips,begin_cash=excluded.begin_cash,owner_cash_out=excluded.owner_cash_out,other_cash_out=excluded.other_cash_out,revenue_override=excluded.revenue_override,notes=excluded.notes,source=excluded.source,updated_at=now() returning *`,
    [ext,date,nullableMoneyV1140(x.debitTotal),nullableMoneyV1140(x.cashDrawerTotal),nullableMoneyV1140(x.debitTips),nullableMoneyV1140(x.cashTips),nullableMoneyV1140(x.beginCash),nullableMoneyV1140(x.ownerCashOut),nullableMoneyV1140(x.otherCashOut),nullableMoneyV1140(x.revenueOverride),String(x.notes||''),String(x.source||'Manager entry')]);
  return mapRevenueLedgerRowV1140(r.rows[0]);
}
async function seedRevenueLedger(entries=[]){
  await ensureRevenueLedgerSchemaV1140();
  for(const x of entries){
    const date=cleanDate(x.date);if(!date)continue;
    await q(`insert into public.manager_daily_revenue(id,business_date,debit_total,cash_drawer_total,debit_tips,cash_tips,begin_cash,owner_cash_out,other_cash_out,revenue_override,notes,source)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(business_date) do nothing`,
      [uuid(),date,nullableMoneyV1140(x.debitTotal),nullableMoneyV1140(x.cashDrawerTotal),nullableMoneyV1140(x.debitTips),nullableMoneyV1140(x.cashTips),nullableMoneyV1140(x.beginCash),nullableMoneyV1140(x.ownerCashOut),nullableMoneyV1140(x.otherCashOut),nullableMoneyV1140(x.revenueOverride),String(x.notes||''),String(x.source||'Imported notebook')]);
  }
}
async function deleteRevenueLedger(ext){
  await ensureRevenueLedgerSchemaV1140();
  await q(`delete from public.manager_daily_revenue where id::text=$1 or business_date::text=$1`,[String(ext)]);
  return true;
}

module.exports={pool,healthCheck,ensureSchemaExtensions,bootstrapFromJson,getMenu,upsertMenu,deleteMenu,getPromotions,upsertPromotion,deletePromotion,getInventory,upsertInventory,deleteInventory,getEmployees,upsertEmployee,deleteEmployee,getShifts,upsertShift,deleteShift,getPayroll,upsertPayroll,deletePayroll,getRecipes,upsertRecipe,deleteRecipe,getSettings,updateSettings,getOrders,getOrderByNumber,insertOrder,updateOrder,deleteOrder,getSales,insertSale,getNotifications,addNotification,analytics,ensureRevenueLedgerSchemaV1140,getRevenueLedger,upsertRevenueLedger,seedRevenueLedger,deleteRevenueLedger};
