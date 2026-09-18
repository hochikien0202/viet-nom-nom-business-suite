const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

// Lightweight env loader for local development. Vercel injects env vars automatically.
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, name);
  if (!fs.existsSync(envPath)) continue;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('='), key = line.slice(0, i).trim(); let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const db = require('./db');
const { deliveryFee, decorateMenuWithWeeklySpecials, weeklySpecialDiscount, weeklySpecialSummary } = require('./pricing');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const normalizePin = v => String(v ?? '').trim().replace(/^['\"]|['\"]$/g, '');
const ADMIN_PIN = normalizePin(process.env.ADMIN_PIN || '2468');
const TAX_RATE = Number(process.env.TAX_RATE || 0.13);
const STORE_ADDRESS = '6645 Tecumseh Rd E, Windsor, ON N8T 1E7';
const BRAND_NAME = "Viet Nom Nom";
const DATA = path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const money = n => Math.round((Number(n) || 0) * 100) / 100;
// V11.25 — Canadian cash rounding: only the FINAL cash payment is rounded to the nearest $0.05.
const cashNickel = n => money(Math.round((Number(n) || 0) * 20) / 20);
const isCashPayment = v => /cash/i.test(String(v || ''));
const txt = (v, m = 1000) => String(v ?? '').trim().slice(0, m);
const id = () => crypto.randomUUID();
const orderNo = () => 'T' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
const saleNo = () => 'S' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

app.use(express.json({ limit: '2mb' }));

// V11 never performs schema ALTERs, JSON seeding, or a blocking startup
// database check during web requests. Every route performs only the query it
// actually needs, so a single transient cold-start failure cannot poison the
// whole serverless instance. Migrations are explicit (`npm run migrate`).

function admin(req, res, next) {
  if (normalizePin(req.headers['x-admin-pin']) !== ADMIN_PIN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function localStoreState(s) {
  if (s.storeOverride === 'open') return { open: true, reason: 'Manually opened' };
  if (s.storeOverride === 'closed') return { open: false, reason: 'Temporarily closed' };
  const tz = s.timezone || 'America/Toronto';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const day = String(parts.weekday || '').toLowerCase(), h = s.hours?.[day];
  if (!h || h.closed) return { open: false, reason: 'Closed today' };
  const mins = Number(parts.hour) * 60 + Number(parts.minute), toMin = t => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + b; };
  return { open: mins >= toMin(h.open) && mins < toMin(h.close), reason: `${h.open}–${h.close}` };
}
function publicStatusFromSettings(s) {
  const state = localStoreState(s);
  return { ...state, onlineOrderingEnabled: !!s.onlineOrderingEnabled, deliveryEnabled: s.deliveryEnabled !== false, notice: s.notice || '', hours: s.hours || {}, businessName: s.businessName, email: s.email, address: s.address || STORE_ADDRESS, phone: s.phone || '', deliveryPolicy: { baseKm: 5, baseFee: 6, extraPerKm: 1 } };
}

function torontoLocalStampV116(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function weekdayForLocalDateV116(dateStr) {
  try { return new Intl.DateTimeFormat('en-US', { weekday:'long', timeZone:'America/Toronto' }).format(new Date(`${dateStr}T12:00:00Z`)).toLowerCase(); } catch { return ''; }
}
function clockMinutesV116(t){ const [h,m]=String(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); }
function validateRequestedTimeV116(requestedTime, settings) {
  const raw=String(requestedTime||'ASAP').trim();
  if (!raw || raw.toUpperCase()==='ASAP') return { ok:true, scheduled:false, value:'ASAP' };
  const m=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/); if(!m) return { ok:false, error:'Choose a valid scheduled date and time.' };
  const [,dateStr,timeStr]=m, stamp=`${dateStr}T${timeStr}`, now=torontoLocalStampV116();
  if(stamp<now) return { ok:false, error:'Scheduled time must be in the future.' };
  const day=weekdayForLocalDateV116(dateStr), h=settings?.hours?.[day];
  if(!h||h.closed) return { ok:false, error:`The restaurant is closed on ${day||'that day'}. Please choose another date.` };
  const mins=clockMinutesV116(timeStr), open=clockMinutesV116(h.open), close=clockMinutesV116(h.close);
  if(mins<open||mins>=close) return { ok:false, error:`Please choose a scheduled time during opening hours (${h.open}–${h.close}).` };
  return { ok:true, scheduled:true, value:stamp, day, open:h.open, close:h.close };
}

function promoState(p, channel = 'pos', at = new Date(), fulfillment = '') {
  if (!p || !p.active) return { valid: false, reason: 'Disabled' };
  if (Array.isArray(p.channels) && p.channels.length && !p.channels.includes(channel)) return { valid: false, reason: 'Not available for this channel' };
  const f = String(fulfillment || '').toLowerCase();
  if (Array.isArray(p.allowedFulfillments) && p.allowedFulfillments.length && f && !p.allowedFulfillments.map(x=>String(x).toLowerCase()).includes(f)) return { valid: false, reason: 'Not available for this order type' };
  const t = at.getTime();
  if (p.startAt && t < new Date(p.startAt).getTime()) return { valid: false, reason: 'Scheduled' };
  if (p.endAt && t > new Date(p.endAt).getTime()) return { valid: false, reason: 'Expired' };
  return { valid: true, reason: 'Active' };
}
function applyPromo(sub, promoId, promotions, channel = 'pos', fulfillment = '', at = new Date()) {
  if (!promoId) return { discount: 0, promoName: '', promo: null };
  const p = promotions.find(x => x.id === promoId), st = promoState(p, channel, at, fulfillment);
  if (!st.valid) return { discount: 0, promoName: '', promo: null, reason: st.reason };
  if (Number(p.minSpend || 0) > sub) return { discount: 0, promoName: '', promo: null, reason: `Minimum spend $${Number(p.minSpend).toFixed(2)}` };
  let d = p.type === 'percent' ? sub * (Number(p.value) || 0) / 100 : Number(p.value) || 0;
  if (Number(p.maxDiscount || 0) > 0) d = Math.min(d, Number(p.maxDiscount));
  return { discount: money(Math.min(sub, d)), promoName: p.name, promo: p };
}
function proteinVariantSurcharge(menuItem, requestedName) {
  const id = String(menuItem?.id || '');
  if (!(id === 'pad-thai' || id.startsWith('wok-'))) return null;
  const name = String(requestedName || '').toLowerCase();
  if (/\b(chicken|pork)\b/.test(name)) return 1;
  if (/\b(beef|shrimp)\b/.test(name)) return 2;
  // Veggies & Tofu uses the original menu price.
  if (/veggies|tofu/.test(name)) return 0;
  return 0;
}
const V160_HOT_READY_COMBOS = [
  { id:'combo-rice-noodles-two', name:'C1. Rice/Noodles + 2 Hot Items', category:'Combo', price:12.99, description:'Choose 1 rice or noodle base and any 2 Hot & Ready items.', active:true, soldOut:false, cost:0, image:'' },
  { id:'combo-single-item', name:'C2. Single Rice or Noodles', category:'Combo', price:5.99, description:'Choose one serving of fried rice or chow mein.', active:true, soldOut:false, cost:0, image:'' },
  { id:'combo-single-hot-item', name:'C3. Single Hot Item', category:'Combo', price:7.99, description:'Choose one available Hot & Ready item.', active:true, soldOut:false, cost:0, image:'' }
];
const V160_HOT_READY_SELECTIONS = [
  { id:'hot-base-fried-rice', name:'Fried Rice', viName:'Cơm chiên', category:'Hot & Ready Base', price:0, description:'Hot & Ready base selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-base-chow-mein', name:'Chow Mein', viName:'Mì xào', category:'Hot & Ready Base', price:0, description:'Hot & Ready base selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-beef-broccoli', name:'Beef & Broccoli', viName:'Bò xào bông cải xanh', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-grilled-chicken', name:'Grilled Chicken', viName:'Gà nướng', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-sweet-sour-chicken', name:'Sweet & Sour Chicken', viName:'Gà chua ngọt', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-sesame-chicken', name:'Sesame Chicken', viName:'Gà sốt mè', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-sesame-chicken-wings', name:'Sesame Chicken Wings', viName:'Cánh gà sốt mè', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-sweet-sour-pork-peppers', name:'Sweet & Sour Pork with Bell Peppers', viName:'Heo chua ngọt xào ớt chuông', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-fried-chicken', name:'Fried Chicken', viName:'Gà chiên giòn', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-fried-shrimp', name:'Fried Shrimp', viName:'Tôm chiên giòn', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-meatballs-tomato', name:'Meatballs in Tomato Sauce', viName:'Thịt viên sốt cà chua', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-braised-pork-eggs', name:'Braised Pork Belly & Eggs', viName:'Thịt kho trứng', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-spring-rolls', name:'Spring Rolls', viName:'Chả giò', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' },
  { id:'hot-braised-beef-pork', name:'Braised Beef / Pork', viName:'Bò / heo kho', category:'Hot & Ready Item', price:0, description:'Hot & Ready selection.', active:true, soldOut:false, cost:0, image:'' }
];
const V160_COMBO_IDS = new Set(V160_HOT_READY_COMBOS.map(x=>x.id));
function v160HotReadyLookup(menu,id,category){
  const x=menu.find(row=>String(row.id)===String(id)&&row.category===category);
  return x&&x.active&&!x.soldOut?x:null;
}
function v160ComboAvailability(menu){
  const bases=menu.filter(x=>x.category==='Hot & Ready Base'&&x.active&&!x.soldOut);
  const hot=menu.filter(x=>x.category==='Hot & Ready Item'&&x.active&&!x.soldOut);
  return {
    'combo-rice-noodles-two': bases.length>=1&&hot.length>=1,
    'combo-single-item': bases.length>=1,
    'combo-single-hot-item': hot.length>=1
  };
}
function v160PublicHotReady(menu){
  const meta=new Map(V160_HOT_READY_SELECTIONS.map(x=>[x.id,x]));
  const mapRow=x=>({id:x.id,name:x.name,viName:meta.get(x.id)?.viName||x.name,type:x.category==='Hot & Ready Base'?'base':'hot-item',available:!!x.active&&!x.soldOut,visible:x.active!==false,comboUpcharge:money(x.price||0)});
  return {note:'Hot & Ready selections may change daily. Available while quantities last.',bases:menu.filter(x=>x.category==='Hot & Ready Base').map(mapRow),hotItems:menu.filter(x=>x.category==='Hot & Ready Item').map(mapRow)};
}
async function ensureV160HotReady(){
  const current=await db.getMenu(),by=new Map(current.map(x=>[String(x.id),x]));
  for(const def of V160_HOT_READY_COMBOS){
    const old=by.get(def.id);const next=old?{...old,...def,active:old.active!==false,soldOut:false}:{...def};
    if(!old||['name','category','price','description'].some(k=>String(old[k]??'')!==String(next[k]??''))||old.soldOut)await db.upsertMenu(next);
  }
  for(const def of V160_HOT_READY_SELECTIONS){
    const old=by.get(def.id);if(!old){await db.upsertMenu({...def});continue}
    const next={...old,name:def.name,category:def.category,description:def.description,price:Number(old.price??0),active:old.active!==false,soldOut:!!old.soldOut};
    if(['name','category','description'].some(k=>String(old[k]??'')!==String(next[k]??'')))await db.upsertMenu(next);
  }
}

function normalizeItemModifiers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => txt(v, 120)).filter(Boolean).slice(0, 12);
}
function menuItemsFrom(raw, menu, allowOverride = false) {
  const out = [];
  for (const r of (Array.isArray(raw) ? raw : [])) {
    const m = menu.find(x => x.id === r.id); if (!m) continue;
    const comboId=String(m.id||'');
    if(V160_COMBO_IDS.has(comboId)){
      const avail=v160ComboAvailability(menu);if(!allowOverride&&!avail[comboId])throw Error(`${m.name} is currently unavailable.`);
      const sel=(r&&typeof r.selections==='object'&&r.selections)|| (r&&typeof r.comboSelections==='object'&&r.comboSelections)||{};
      const extraMods=normalizeItemModifiers(r.modifiers).filter(x=>!/^Base:|^Hot Item(?: #\d+)?:/i.test(x));
      const qty=Math.max(1,Math.min(50,Number(r.qty)||1));
      if(allowOverride&&!Object.keys(sel).length){out.push({id:m.id,name:txt(r.displayName||r.name||m.name,180)||m.name,price:money(r.priceOverride!==undefined?r.priceOverride:m.price),qty,modifiers:extraMods});continue}
      let selections={},detailMods=[],upcharge=0;const selectionId=v=>v&&typeof v==='object'?v.id:v;
      if(comboId==='combo-rice-noodles-two'){
        const base=v160HotReadyLookup(menu,selectionId(sel.base),'Hot & Ready Base');if(!base)throw Error('Please choose an available rice or noodle option.');
        const item1=v160HotReadyLookup(menu,selectionId(sel.item1),'Hot & Ready Item');if(!item1)throw Error('Please choose an available Hot Item #1.');
        const item2=v160HotReadyLookup(menu,selectionId(sel.item2),'Hot & Ready Item');if(!item2)throw Error('Please choose an available Hot Item #2.');
        selections={base:{id:base.id,name:base.name},item1:{id:item1.id,name:item1.name},item2:{id:item2.id,name:item2.name}};
        detailMods=[`Base: ${base.name}`,`Hot Item #1: ${item1.name}`,`Hot Item #2: ${item2.name}`];upcharge=Number(base.price||0)+Number(item1.price||0)+Number(item2.price||0);
      }else if(comboId==='combo-single-item'){
        const base=v160HotReadyLookup(menu,selectionId(sel.base),'Hot & Ready Base');if(!base)throw Error('Please choose an available rice or noodle option.');
        selections={base:{id:base.id,name:base.name}};detailMods=[`Base: ${base.name}`];upcharge=Number(base.price||0);
      }else{
        const item=v160HotReadyLookup(menu,selectionId(sel.item||sel.item1),'Hot & Ready Item');if(!item)throw Error('Please choose an available Hot & Ready item.');
        selections={item:{id:item.id,name:item.name}};detailMods=[`Hot Item: ${item.name}`];upcharge=Number(item.price||0);
      }
      out.push({id:m.id,name:m.name,price:money(Number(m.price||0)+upcharge),qty,modifiers:[...detailMods,...extraMods],selections});
      continue;
    }
    if (!allowOverride && (m.soldOut || !m.active)) throw Error(`${m.name} is currently unavailable.`);
    const requestedName = txt(r.displayName || r.name || m.name, 180);
    const proteinExtra = proteinVariantSurcharge(m, requestedName);
    const authoritativePrice = proteinExtra === null
      ? (allowOverride && r.priceOverride !== undefined ? r.priceOverride : m.price)
      : Number(m.price || 0) + proteinExtra;
    out.push({ id: m.id, name: requestedName || m.name, price: money(authoritativePrice), qty: Math.max(1, Math.min(50, Number(r.qty) || 1)), modifiers: normalizeItemModifiers(r.modifiers) });
  }
  return out;
}
function recalcOrder(o, promotions, channel = 'pos') {
  const subtotal = money((o.items || []).reduce((s, x) => s + Number(x.price || 0) * Number(x.qty || 0), 0));
  const weekly = { discount: 0, label: '', details: [] };
  const promoBase = subtotal;
  const promoAt = new Date(o.createdAt || Date.now());
  const promoId = o.promotionId || '';
  const ap = applyPromo(promoBase, promoId, promotions, channel, o.fulfillment, promoAt);
  const manual = money(Math.max(0, Number(o.manualDiscount) || 0));
  const discount = money(Math.min(subtotal, ap.discount + manual));
  const delivery = String(o.fulfillment || '').toLowerCase() === 'delivery' ? deliveryFee(o.finalDistanceKm || o.customerDistanceKm) : 0;
  // V11.19: percentage discount reduces the food selling price BEFORE HST.
  // Viet Nom Nom checkout policy treats the delivery fee as a separate
  // non-taxable fee: food subtotal → discount → HST on discounted food → delivery fee.
  const afterDiscount = money(Math.max(0, subtotal - discount));
  const tax = money(o.taxExempt ? 0 : afterDiscount * TAX_RATE);
  const totalBeforeDelivery = money(afterDiscount + tax);
  const exactFinalTotal = money(totalBeforeDelivery + delivery);
  // Canada penny-rounding rule: round the final amount only when the tender is cash.
  // Debit / credit / e-transfer remain exact to the cent.
  const total = isCashPayment(o.payment) ? cashNickel(exactFinalTotal) : exactFinalTotal;
  const cashRounding = money(total - exactFinalTotal);
  const promotion = [weekly.label, ap.promoName].filter(Boolean).join(' + ');
  Object.assign(o, { subtotal, discount, promotion, weeklySpecialDiscount: weekly.discount, weeklySpecialDetails: weekly.details, promotionDiscount: ap.discount, deliveryFee: delivery, tax, taxRate: TAX_RATE, total, subtotalAfterDiscount: afterDiscount, totalBeforeDelivery, exactFinalTotal, cashRounding });
  return o;
}
async function createSaleFromOrder(o) {
  if (o.saleId) return o;
  const sale = { id: id(), saleNo: saleNo(), orderId: o.id, orderNo: o.orderNo, createdAt: new Date().toISOString(), items: o.items, subtotal: o.subtotal, discount: o.discount, promotion: o.promotion || '', manualDiscount: o.manualDiscount || 0, deliveryFee: o.deliveryFee || 0, tax: o.tax, total: o.total, payment: o.payment, channel: o.channel || o.source || o.fulfillment || 'Order', customerName: o.customer?.name || '', customerPhone: o.customer?.phone || '', customerEmail: o.customer?.email || '', notes: `Order ${o.orderNo}${o.notes ? ` · ${o.notes}` : ''}` };
  await db.insertSale(sale); o.saleId = sale.id; return o;
}

function normalizePhone(v) { const raw = String(v || '').trim(); if (raw.startsWith('+')) return '+' + raw.replace(/\D/g, ''); const d = raw.replace(/\D/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d.startsWith('1')) return '+' + d; return raw; }
function statusTitle(status) { return ({ new: 'Order received', accepted: 'Order accepted', preparing: 'Your order is being prepared', ready: 'Your order is ready', 'out-for-delivery': 'Your order is out for delivery', completed: 'Thank you — order completed', cancelled: 'Order cancelled' })[status] || `Order update: ${status}`; }
function statusMessage(status, o) { const scheduled=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(o?.requestedTime||'')); return ({ new: scheduled ? `We received your pre-order for ${o.requestedTime.replace('T',' at ')}. It is visible to staff immediately and will be reminded again as preparation time approaches.` : "We received your order and the Viet Nom Nom team will review it shortly.", accepted: 'Your order has been accepted by the restaurant.', preparing: 'The kitchen is preparing your food now.', ready: o.fulfillment === 'delivery' ? 'Your order is ready and waiting for delivery.' : (o.fulfillment === 'dine-in' ? 'Your order is ready for dine-in service.' : 'Your order is ready for pickup.'), 'out-for-delivery': 'Your order has left the restaurant and is on the way.', completed: 'Thank you for ordering from Viet Nom Nom. Your order is completed. We appreciate your support. If you have any feedback, please call us at (519) 916-0879.', cancelled: 'Your order has been cancelled. Please contact the restaurant if you have questions.' })[status] || 'Your order status has been updated.'; }
function billText(o) { const lines = (o.items || []).flatMap(x => [`${x.qty} x ${x.name} @ $${Number(x.price).toFixed(2)} = $${money(x.price * x.qty).toFixed(2)}`, ...(Array.isArray(x.modifiers)&&x.modifiers.length?[`  ↳ ${x.modifiers.join(' · ')}`]:[])]); return [`Order: ${o.orderNo}`, `Customer: ${o.customer?.name || ''}`, `Phone: ${o.customer?.phone || ''}`, `Email: ${o.customer?.email || ''}`, `Method: ${o.fulfillment || o.channel || ''}`, `Payment: ${o.payment || ''}`, `Requested time: ${o.requestedTime || 'ASAP'}`, ...lines, `Subtotal (before tax): $${Number(o.subtotal || 0).toFixed(2)}`, `Discount: -$${Number(o.discount || 0).toFixed(2)}${o.promotion ? ` (${o.promotion})` : ''}`, `Subtotal after discount: $${Math.max(0,Number(o.subtotal||0)-Number(o.discount||0)).toFixed(2)}`, `HST 13% on food: $${Number(o.tax || 0).toFixed(2)}`, `Food total after tax: $${(Math.max(0,Number(o.subtotal||0)-Number(o.discount||0))+Number(o.tax||0)).toFixed(2)}`, o.deliveryFee ? `Delivery fee (not taxed): $${Number(o.deliveryFee).toFixed(2)}` : '', isCashPayment(o.payment) && Math.abs(Number(o.cashRounding||0))>=0.001 ? `Cash rounding to nearest $0.05: ${Number(o.cashRounding)>0?'+':''}$${Number(o.cashRounding).toFixed(2)}` : '', `Final total: $${Number(o.total || 0).toFixed(2)}`].filter(Boolean).join('\n'); }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]); }
function emailHtml(status, o) { const items = (o.items || []).map(x => `<tr><td style="padding:7px 0">${x.qty} × ${escapeHtml(x.name)}${Array.isArray(x.modifiers)&&x.modifiers.length?`<div style="font-size:12px;color:#7b5d52;margin-top:4px">${x.modifiers.map(escapeHtml).join(' · ')}</div>`:''}</td><td style="text-align:right">$${money(x.price * x.qty).toFixed(2)}</td></tr>`).join(''); return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff7e4;color:#173d3e;padding:24px"><div style="max-width:640px;margin:auto;background:#fffdf5;border:1px solid #d8d4be;border-radius:18px;padding:26px"><h1 style="color:#075a5d;margin-top:0">${escapeHtml(statusTitle(status))}</h1><p>${escapeHtml(statusMessage(status, o))}</p><p><b>Order ${escapeHtml(o.orderNo)}</b><br>${escapeHtml(o.customer?.name || '')} · ${escapeHtml(o.customer?.phone || '')} · ${escapeHtml(o.customer?.email || '')}</p><table style="width:100%;border-collapse:collapse">${items}</table><hr style="border:0;border-top:1px solid #ddd"><p>Subtotal: <b>$${Number(o.subtotal || 0).toFixed(2)}</b><br>Discount: <b>-$${Number(o.discount || 0).toFixed(2)}</b>${o.promotion ? ` (${escapeHtml(o.promotion)})` : ''}<br>Subtotal after discount: <b>$${Math.max(0,Number(o.subtotal||0)-Number(o.discount||0)).toFixed(2)}</b><br>HST 13% on food: <b>$${Number(o.tax || 0).toFixed(2)}</b><br>Food total after tax: <b>$${(Math.max(0,Number(o.subtotal||0)-Number(o.discount||0))+Number(o.tax||0)).toFixed(2)}</b><br>${o.deliveryFee ? `Delivery fee (not taxed): <b>$${Number(o.deliveryFee).toFixed(2)}</b><br>` : ''}${isCashPayment(o.payment) && Math.abs(Number(o.cashRounding||0))>=0.001 ? `Cash rounding to nearest $0.05: <b>${Number(o.cashRounding)>0?'+':''}$${Number(o.cashRounding).toFixed(2)}</b><br>` : ''}<span style="font-size:20px">Final total: <b>$${Number(o.total || 0).toFixed(2)}</b></span></p><p style="color:#6e7772">Viet Nom Nom<br>${STORE_ADDRESS}</p></div></body></html>`; }
async function logNotification(o, status, type, state, detail = '') { return db.addNotification({ id: id(), orderId: o.id, orderNo: o.orderNo, status, type, state, detail, recipient: type === 'email' ? o.customer?.email : o.customer?.phone, createdAt: new Date().toISOString() }); }
async function sendEmail(o, status) { const s = await db.getSettings(); if (!s.notificationEmailEnabled || !o.customer?.email) return logNotification(o, status, 'email', 'pending', 'No email or email notifications disabled'); const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM || `${BRAND_NAME} Orders <orders@resend.dev>`; if (!key) return logNotification(o, status, 'email', 'simulated', 'Set RESEND_API_KEY and EMAIL_FROM in Vercel to send live email.'); try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [o.customer.email], subject: `${BRAND_NAME} ${o.orderNo} — ${statusTitle(status)}`, html: emailHtml(status, o), text: `${statusTitle(status)}\n\n${statusMessage(status, o)}\n\n${billText(o)}` }) }); const d = await r.text(); return logNotification(o, status, 'email', r.ok ? 'sent' : 'failed', d.slice(0, 500)); } catch (e) { return logNotification(o, status, 'email', 'failed', e.message); } }
async function sendSms(o, status) { const s = await db.getSettings(); if (!s.notificationSmsEnabled || !o.customer?.phone) return logNotification(o, status, 'sms', 'pending', 'No phone or SMS notifications disabled'); const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER; if (!sid || !token || !from) return logNotification(o, status, 'sms', 'simulated', 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in Vercel to send live SMS.'); const to = normalizePhone(o.customer.phone), msg = `Viet Nom Nom ${o.orderNo}: ${statusMessage(status, o)}\n${billText(o)}`; try { const form = new URLSearchParams({ To: to, From: from, Body: msg }), r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }); const d = await r.text(); return logNotification(o, status, 'sms', r.ok ? 'sent' : 'failed', d.slice(0, 500)); } catch (e) { return logNotification(o, status, 'sms', 'failed', e.message); } }
async function notifyOrder(o, status) { await Promise.allSettled([sendEmail(o, status), sendSms(o, status)]); }
async function sendOwnerInventorySms(items) {
  const s = await db.getSettings(), toRaw = s.inventoryOwnerPhone || '382-342-2566', to = normalizePhone(toRaw);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone || 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const groups = new Map();
  for (const x of items) {
    const section = txt(x.section, 80) || 'Inventory';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(x);
  }
  const sections = [...groups.entries()].map(([section, rows]) => {
    const bullets = rows.map(x => {
      const suggested = Math.max(0, (Number(x.targetQty) || 0) - (Number(x.qty) || 0));
      const amount = suggested > 0 ? `${suggested} ${x.unit || 'unit'}` : 'CHECK TARGET';
      return `• ${x.name}: BUY / PREPARE ${amount}${x.supplier ? ` — ${x.supplier}` : ''}`;
    });
    return `${section.toUpperCase()}\n${bullets.join('\n')}`;
  });
  const msg = `${BRAND_NAME} Today's Order List — ${date}\n\n${sections.join('\n\n')}\n\nSuggested amount = Target stock − On hand.`;
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  const fake = { id: 'inventory', orderNo: `INV-${Date.now()}`, customer: { phone: toRaw }, status: 'inventory-reorder' };
  if (!sid || !token || !from) {
    await logNotification(fake, 'inventory-reorder', 'sms', 'simulated', msg);
    return { live: false, message: `SMS simulation saved for ${toRaw}. ${items.length} item(s) on today's order list.` };
  }
  try {
    const form = new URLSearchParams({ To: to, From: from, Body: msg });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const d = await r.text();
    await logNotification(fake, 'inventory-reorder', 'sms', r.ok ? 'sent' : 'failed', d.slice(0, 500));
    if (!r.ok) throw Error('Twilio could not send the order list.');
    return { live: true, message: `Today's Order List sent to ${toRaw}.` };
  } catch (e) {
    await logNotification(fake, 'inventory-reorder', 'sms', 'failed', e.message);
    throw e;
  }
}


function excelXmlEscape(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function inventorySectionFromNote(note) {
  const m = String(note || '').match(/^\[SECTION:([^\]]+)\]/i);
  return m ? m[1].trim() : 'Other / Unassigned';
}
function inventoryCleanNote(note) {
  return String(note || '').replace(/^\[SECTION:[^\]]+\]\s*(?:\|\s*)?/i, '').trim();
}
function inventoryStatusLabel(x) {
  if (x.statusOverride === 'ok') return 'STOCKED';
  if (x.statusOverride === 'reorder') return 'NEEDS STOCKING';
  return Number(x.qty) <= Number(x.reorder) ? 'NEEDS STOCKING' : 'STOCKED';
}
function inventoryExcelXml(items, settings, exportedAtLabel) {
  const rows = [...items].sort((a,b) => inventorySectionFromNote(a.usageNote).localeCompare(inventorySectionFromNote(b.usageNote)) || String(a.name||'').localeCompare(String(b.name||'')));
  const needCount = rows.filter(x => inventoryStatusLabel(x) === 'NEEDS STOCKING').length;
  const cell = (value, type='String', style='') => `<Cell${style?` ss:StyleID="${style}"`:''}><Data ss:Type="${type}">${excelXmlEscape(value)}</Data></Cell>`;
  const titleRow = `<Row ss:Height="28">${cell(`${BRAND_NAME} — Inventory Export`,'String','Title')}</Row>`;
  const meta = [
    ['Exported at', exportedAtLabel],
    ['Timezone', settings.timezone || 'America/Toronto'],
    ['Total stock items', rows.length],
    ['Need to order', needCount]
  ].map(([k,v]) => `<Row>${cell(k,'String','MetaKey')}${cell(v, typeof v === 'number' ? 'Number' : 'String','MetaValue')}</Row>`).join('');
  const headers = ['Section','Item','Unit','On Hand','Reorder At','Target Stock','Suggested Order','Status','Supplier','Cost','Used For / Note','Last Checked','Last Updated'];
  const headerRow = `<Row>${headers.map(h=>cell(h,'String','Header')).join('')}</Row>`;
  const body = rows.map(x => {
    const suggested = Math.max(0, (Number(x.targetQty)||0) - (Number(x.qty)||0));
    const status = inventoryStatusLabel(x);
    const vals = [
      ['String',inventorySectionFromNote(x.usageNote)],['String',x.name||''],['String',x.unit||'unit'],
      ['Number',Number(x.qty)||0],['Number',Number(x.reorder)||0],['Number',Number(x.targetQty)||0],
      ['Number',status==='NEEDS STOCKING'?suggested:0],['String',status],['String',x.supplier||''],['Number',Number(x.cost)||0],
      ['String',inventoryCleanNote(x.usageNote)],['String',x.lastStockedAt||''],['String',x.updatedAt||'']
    ];
    return `<Row>${vals.map(([t,v],i)=>cell(v,t,i===7?(status==='NEEDS STOCKING'?'Need':'Good'):(i===9?'Money':''))).join('')}</Row>`;
  }).join('');
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Styles>\n<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>\n<Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" ss:Color="#064F56"/></Style>\n<Style ss:ID="MetaKey"><Font ss:Bold="1" ss:Color="#5B696B"/></Style>\n<Style ss:ID="MetaValue"><Font ss:Color="#17343A"/></Style>\n<Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#07596A" ss:Pattern="Solid"/></Style>\n<Style ss:ID="Need"><Interior ss:Color="#FFE1DC" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#A42D24"/></Style>\n<Style ss:ID="Good"><Interior ss:Color="#DFF1DF" ss:Pattern="Solid"/><Font ss:Bold="1" ss:Color="#246024"/></Style>\n<Style ss:ID="Money"><NumberFormat ss:Format="$0.00"/></Style>\n</Styles>\n<Worksheet ss:Name="Inventory"><Table>\n<Column ss:Width="145"/><Column ss:Width="165"/><Column ss:Width="70"/><Column ss:Width="70"/><Column ss:Width="78"/><Column ss:Width="82"/><Column ss:Width="95"/><Column ss:Width="110"/><Column ss:Width="130"/><Column ss:Width="72"/><Column ss:Width="220"/><Column ss:Width="145"/><Column ss:Width="145"/>\n${titleRow}<Row/><Row>${cell('Inventory snapshot','String','MetaKey')}</Row>${meta}<Row/>${headerRow}${body}</Table>\n<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>7</SplitHorizontal><TopRowBottomPane>7</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>\n</Worksheet></Workbook>`;
}

async function createOrderFromPayload(b, { source = 'website', allowOverride = false, initialStatus = 'new' } = {}) {
  await ensureV160HotReady();
  const [menu, promotions] = await Promise.all([db.getMenu(), db.getPromotions()]);
  const items = menuItemsFrom(b.items, menu, allowOverride); if (!items.length) throw Error('Add at least one item.');
  const fulfillment = String(b.fulfillment || b.channel || 'pickup').toLowerCase();
  const customer = { name: txt(b.customer?.name || b.customerName, 100), phone: txt(b.customer?.phone || b.customerPhone, 40), email: txt(b.customer?.email || b.customerEmail, 120) };
  const o = { id: id(), orderNo: orderNo(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source, channel: txt(b.channel || source, 40), status: initialStatus, customer, items, fulfillment: ['pickup', 'delivery', 'walk-in', 'dine-in', 'phone'].includes(fulfillment) ? fulfillment : 'pickup', address: txt(b.address, 300), requestedTime: txt(b.requestedTime, 60) || 'ASAP', payment: txt(b.payment, 60) || 'Cash', paymentStatus: txt(b.paymentStatus, 30) || 'unpaid', notes: txt(b.notes, 1000), staffNote: '', promotionId: txt(b.promotionId, 100), manualDiscount: money(Math.max(0, Number(b.manualDiscount) || 0)), taxExempt: !!b.taxExempt, customerDistanceKm: Math.max(0, Number(b.distanceKm || b.customerDistanceKm) || 0), finalDistanceKm: Math.max(0, Number(b.finalDistanceKm || b.distanceKm || b.customerDistanceKm) || 0), saleId: null };
  recalcOrder(o, promotions, source === 'website' ? 'website' : 'pos'); return o;
}

app.get('/api/health', async (req, res, next) => { try { const h = await db.healthCheck(); res.setHeader('Cache-Control','no-store'); res.json({ ok: true, time: new Date().toISOString(), version: '1.7.0', storage: db.storageLabel || 'Supabase PostgreSQL', databaseTime: h.serverTime, adminPinSource: process.env.ADMIN_PIN ? 'environment' : 'default' }); } catch (e) { next(e); } });
app.get('/api/public/menu', async (req, res, next) => { try {
  await ensureV116MenuAddons(); await ensureV118ComboItems(); await ensureV1112MenuNames(); await ensureV1113MenuStructure(); await ensureV1116WokRows(); await ensureV1135BeverageRows(); await ensureV119PromotionCampaign(); await ensureV160HotReady();
  const [menu, promotions] = await Promise.all([db.getMenu(), db.getPromotions()]);
  const allowedVietNomNomIds = new Set(["banhmi-special", "banhmi-chicken", "banhmi-pork", "banhmi-beef", "banhmi-pork-sausage", "banhmi-tofu-veg", "combo-rice-noodles-two", "combo-single-item", "combo-single-hot-item", "summer-chicken", "summer-pork", "summer-beef", "summer-pork-sausage", "summer-shrimp", "summer-shrimp-pork", "summer-tofu-veg", "vermicelli-chicken-pork-spring", "vermicelli-chicken-beef-spring", "vermicelli-chicken-pork-sausage-spring", "vermicelli-tofu-vegetable", "rice-chicken-pork", "rice-chicken-beef", "rice-chicken-pork-chop", "rice-beef-pork-chop", "rice-shrimp-pork-chop", "rice-crispy-chicken-leg", "pho-special", "pho-rare-beef", "pho-well-done-brisket", "pho-beef-balls", "pho-rare-beef-balls", "pho-tofu-vegetable", "pho-chicken", "dessert-three-colour", "dessert-tofu-pudding", "dessert-grass-jelly-boba"]);
  const availability=v160ComboAvailability(menu);
  const pricedMenu = menu.map(x=>({ ...x, soldOut:V160_COMBO_IDS.has(String(x.id))?!availability[String(x.id)]:!!x.soldOut, basePrice:Number(x.price||0), weeklySpecial:null }));
  res.setHeader('Cache-Control','no-store');
  res.json({ menu: pricedMenu.filter(x => x.active && allowedVietNomNomIds.has(String(x.id))), hotReady:v160PublicHotReady(menu), promotions: [], weeklySpecial: { day:'', label:'', items:[], combos:[] } });
} catch (e) { next(e); } });
app.get('/api/public/status', async (req, res, next) => { try { await ensureV1110BrandName(); res.json(publicStatusFromSettings(await db.getSettings())); } catch (e) { next(e); } });

function customerComingAtV1122(o){
  const m=String(o?.staffNote||'').match(/\[\[CUSTOMER_COMING:([^\]]+)\]\]/);
  return m?m[1]:'';
}
function stripCustomerComingMarkerV1122(v){return String(v||'').replace(/\s*\[\[CUSTOMER_COMING:[^\]]+\]\]\s*/g,' ').trim()}
app.post('/api/public/order-status', async (req, res, next) => { try {
  const orderNo=txt(req.body?.orderNo,40),phone=txt(req.body?.phone,40);
  if(!orderNo||!phone)return res.status(400).json({error:'Order number and phone number are required.'});
  const o=await db.getOrderByNumber(orderNo);if(!o)return res.status(404).json({error:'Order not found.'});
  if(normalizePhone(o.customer?.phone)!==normalizePhone(phone))return res.status(403).json({error:'Phone number does not match this order.'});
  res.setHeader('Cache-Control','no-store');
  res.json({ok:true,serverTime:new Date().toISOString(),order:{
    orderNo:o.orderNo,createdAt:o.createdAt,updatedAt:o.updatedAt,status:o.status,customer:o.customer,items:o.items,
    fulfillment:o.fulfillment,address:o.address,requestedTime:o.requestedTime,payment:o.payment,paymentStatus:o.paymentStatus,
    notes:o.notes,promotion:o.promotion,subtotal:o.subtotal,discount:o.discount,tax:o.tax,taxRate:o.taxRate,deliveryFee:o.deliveryFee,total:o.total,
    customerDistanceKm:o.customerDistanceKm,finalDistanceKm:o.finalDistanceKm,customerComingAt:customerComingAtV1122(o)
  }});
} catch(e){next(e)} });
app.post('/api/public/order-coming', async (req,res,next)=>{try{
  const orderNo=txt(req.body?.orderNo,40),phone=txt(req.body?.phone,40);
  if(!orderNo||!phone)return res.status(400).json({error:'Order number and phone number are required.'});
  const o=await db.getOrderByNumber(orderNo);if(!o)return res.status(404).json({error:'Order not found.'});
  if(normalizePhone(o.customer?.phone)!==normalizePhone(phone))return res.status(403).json({error:'Phone number does not match this order.'});
  if(!['ready','accepted','preparing'].includes(o.status))return res.status(409).json({error:'Pickup acknowledgement is not available for this order status.'});
  const stamp=new Date().toISOString();
  o.staffNote=`${stripCustomerComingMarkerV1122(o.staffNote)} [[CUSTOMER_COMING:${stamp}]]`.trim();
  o.updatedAt=stamp;await db.updateOrder(o);
  res.setHeader('Cache-Control','no-store');res.json({ok:true,customerComingAt:stamp});
}catch(e){next(e)}});
app.post('/api/admin/login', (req, res) => { res.setHeader('Cache-Control','no-store'); return normalizePin(req.body?.pin) === ADMIN_PIN ? res.json({ ok: true, version: '1.7.0' }) : res.status(401).json({ error: 'Incorrect PIN' }); });

app.post('/api/orders', async (req, res, next) => { try {
  await ensureV1110BrandName();
  const settings = await db.getSettings(), st = publicStatusFromSettings(settings); if (!st.onlineOrderingEnabled) return res.status(409).json({ error: 'Online ordering is temporarily disabled.' });
  const b = req.body || {}, requested = validateRequestedTimeV116(b.requestedTime, settings);
  if(!requested.ok) return res.status(400).json({ error: requested.error });
  if(!requested.scheduled && !st.open) return res.status(409).json({ error: `${BRAND_NAME} is currently closed. Please choose Schedule / pre-order and select a time during opening hours.` });
  b.requestedTime=requested.value;
  if (!b.customer?.name || !b.customer?.phone) return res.status(400).json({ error: 'Name and phone are required to place an order.' });
  if (b.fulfillment === 'delivery' && settings.deliveryEnabled === false) return res.status(409).json({ error: 'Delivery is temporarily unavailable. Please choose Pickup or Dine-in.' });
  if (b.fulfillment === 'delivery' && !txt(b.address, 300)) return res.status(400).json({ error: 'Delivery address is required.' }); if (b.fulfillment === 'delivery' && !(Number(b.distanceKm) > 0)) return res.status(400).json({ error: 'Please enter the estimated distance in km.' });
  const o = await createOrderFromPayload(b, { source: 'website', allowOverride: false, initialStatus: 'new' }); await db.insertOrder(o); await notifyOrder(o, 'new'); res.status(201).json({ ok: true, order: o, scheduled: requested.scheduled });
} catch (e) { next(e); } });

const V116_FRIES_SIDE_ADDONS = [
  { id: 'side-bacon', name: 'Bacon', category: 'Fries & Sides', price: 2.00, description: 'Optional side / add-on.', active: true, soldOut: false, cost: 0, image: '' },
  { id: 'side-sausages', name: 'Sausages', category: 'Fries & Sides', price: 2.00, description: 'Optional side / add-on.', active: true, soldOut: false, cost: 0, image: '' },
  { id: 'side-ham', name: 'Ham', category: 'Fries & Sides', price: 2.00, description: 'Optional side / add-on.', active: true, soldOut: false, cost: 0, image: '' },
  { id: 'side-fruit', name: 'Fruit', category: 'Fries & Sides', price: 2.00, description: 'Optional side / add-on.', active: true, soldOut: false, cost: 0, image: '' },
  { id: 'side-pancake-2pcs', name: 'Pancake (2 pcs)', category: 'Fries & Sides', price: 2.00, description: 'Optional side / add-on.', active: true, soldOut: false, cost: 0, image: '' }
];
async function ensureV116MenuAddons() {
  return 0; // Disabled for Viet Nom Nom: Vietnamese-only menu / no inherited promotion seeding.

  const existing = await db.getMenu();
  const ids = new Set(existing.map(x => String(x.id)));
  const missing = V116_FRIES_SIDE_ADDONS.filter(x => !ids.has(x.id));
  for (const item of missing) await db.upsertMenu(item);
  return missing.length;
}



const V1116_WOK_ROWS = [
  { id:'wok-lo-mein', name:'From the Wok – Lo Mein', category:'From the Wok', price:14.99, description:'Soft Lo Mein noodles wok-tossed with fresh vegetables. Choose Beef, Chicken, Pork, Shrimp, or Veggies & Tofu.', active:true, soldOut:false, cost:0, image:'' },
  { id:'wok-chow-mein', name:'From the Wok – Chow Mein', category:'From the Wok', price:14.99, description:'Chow Mein noodles stir-fried with fresh vegetables. Choose Beef, Chicken, Pork, Shrimp, or Veggies & Tofu.', active:true, soldOut:false, cost:0, image:'' },
  { id:'wok-fried-rice', name:'From the Wok – Fried Rice', category:'From the Wok', price:14.99, description:'Wok-fried rice with vegetables and your selected protein.', active:true, soldOut:false, cost:0, image:'' },
  { id:'wok-stir-fried-vegetables', name:'From the Wok – Stir Fried Vegetables', category:'From the Wok', price:14.99, description:'Fresh vegetables stir-fried to order with your selected protein.', active:true, soldOut:false, cost:0, image:'' }
];
async function ensureV1116WokRows(){
  return 0; // Disabled for Viet Nom Nom: Vietnamese-only menu / no inherited promotion seeding.

  // Seed only rows that are genuinely missing from production. Never overwrite
  // live SOLD OUT / IN STOCK state or a manager-edited price/description.
  const existing=await db.getMenu(), ids=new Set(existing.map(x=>String(x.id)));
  for(const item of V1116_WOK_ROWS) if(!ids.has(item.id)) await db.upsertMenu(item);
}

const V118_COMBO_ITEMS = [
  { id:'combo-rice-noodles-two', name:'C1. Rice or Noodles with Any 2 Items', category:'Combo', price:11.99, description:'Choose rice or noodles with any two available hot-table items.', active:true, soldOut:false, cost:0, image:'' },
  { id:'combo-single-item', name:'C2. Single Item', category:'Combo', price:7.99, description:'One single hot-table item.', active:true, soldOut:false, cost:0, image:'' }
];
async function ensureV118ComboItems() {
  // Only seed missing combo rows. Never overwrite an existing row here: doing so
  // used to reset SOLD OUT back to IN STOCK every time the snapshot/menu loaded.
  const existing = await db.getMenu();
  const ids = new Set(existing.map(x => String(x.id)));
  const missing = V118_COMBO_ITEMS.filter(x => !ids.has(String(x.id)));
  for (const item of missing) await db.upsertMenu(item);
  return missing.length;
}

let v1112MenuNamesEnsured = false;
async function ensureV1112MenuNames(){
  if (v1112MenuNamesEnsured) return;
  const rename = {
    'vermicelli-tofu-vegetable': 'Vermicelli – Veggies & Tofu',
    'summer-tofu-veg': 'Summer Rolls – Veggies & Tofu',
    'banhmi-tofu-veg': 'Bánh Mì – Veggies & Tofu'
  };
  const current = await db.getMenu();
  for (const item of current) {
    const next = rename[item.id];
    if (next && item.name !== next) await db.upsertMenu({ ...item, name: next });
  }
  v1112MenuNamesEnsured = true;
}

// V11.13 menu structure: Thai category, spring-roll choices and coffee temperatures.
// Existing rows keep their live SOLD OUT / IN STOCK state; only missing rows are seeded.
let v1113MenuStructureEnsured = false;
async function ensureV1113MenuStructure(){
  return 0; // Disabled for Viet Nom Nom: Vietnamese-only menu / no inherited promotion seeding.

  if (v1113MenuStructureEnsured) return;
  const current = await db.getMenu();
  const byId = new Map(current.map(x=>[String(x.id),x]));
  const patches = [];
  const pad = byId.get('pad-thai');
  if (pad && (pad.category !== 'Thai' || /tofu/i.test(pad.description||''))) patches.push({ ...pad, category:'Thai', description:'Thai-style noodles. Choose Beef, Chicken, Pork, Shrimp, or Veggies & Tofu.' });
  const spring = byId.get('spring-rolls');
  if (spring && spring.name !== 'Spring Rolls – Veggies') patches.push({ ...spring, name:'Spring Rolls – Veggies', category:'Appetizers', description:'Crispy vegetable spring rolls.' });
  const iced = byId.get('vietnamese-iced-coffee');
  if (iced && iced.name !== 'Condensed Milk Coffee – Cold') patches.push({ ...iced, name:'Condensed Milk Coffee – Cold', category:'Desserts & Drinks', description:'Vietnamese coffee with condensed milk, served cold.' });
  for (const x of patches) await db.upsertMenu(x);
  const existingIds = new Set(current.map(x=>String(x.id)));
  const seed = [
    { id:'spring-rolls-pork-shrimp', name:'Spring Rolls – Pork & Shrimp', category:'Appetizers', price:Number(spring?.price||5.99), description:'Crispy pork & shrimp spring rolls.', active:true, soldOut:false, cost:0, image:'' },
    { id:'coffee-black-hot', name:'Black Coffee – Hot', category:'Desserts & Drinks', price:3.99, description:'Vietnamese black coffee, served hot.', active:true, soldOut:false, cost:0, image:'' },
    { id:'coffee-black-cold', name:'Black Coffee – Cold', category:'Desserts & Drinks', price:3.99, description:'Vietnamese black coffee, served cold.', active:true, soldOut:false, cost:0, image:'' },
    { id:'coffee-condensed-hot', name:'Condensed Milk Coffee – Hot', category:'Desserts & Drinks', price:Number(iced?.price||3.99), description:'Vietnamese coffee with condensed milk, served hot.', active:true, soldOut:false, cost:0, image:'' }
  ];
  for (const item of seed) if (!existingIds.has(item.id)) await db.upsertMenu(item);
  v1113MenuStructureEnsured = true;
}


// V11.35 — $1.60 canned pop + water lineup. Seed only missing rows so managers
// can still change SOLD OUT state or descriptions without the public menu resetting them.
const V1135_BEVERAGE_ROWS = [
  { id:'drink-coke', name:'Coke', category:'Desserts & Drinks', price:1.60, description:'Cold canned Coke.', active:true, soldOut:false, cost:0, image:'' },
  { id:'drink-pepsi', name:'Pepsi', category:'Desserts & Drinks', price:1.60, description:'Cold canned Pepsi.', active:true, soldOut:false, cost:0, image:'' },
  { id:'drink-water', name:'Water', category:'Desserts & Drinks', price:1.60, description:'Cold bottled water.', active:true, soldOut:false, cost:0, image:'' },
  { id:'drink-diet-coke', name:'Diet Coke', category:'Desserts & Drinks', price:1.60, description:'Cold canned Diet Coke.', active:true, soldOut:false, cost:0, image:'' },
  { id:'drink-diet-pepsi', name:'Diet Pepsi', category:'Desserts & Drinks', price:1.60, description:'Cold canned Diet Pepsi.', active:true, soldOut:false, cost:0, image:'' }
];
async function ensureV1135BeverageRows(){
  return 0; // Disabled for Viet Nom Nom: Vietnamese-only menu / no inherited promotion seeding.
const current=await db.getMenu(),ids=new Set(current.map(x=>String(x.id)));for(const item of V1135_BEVERAGE_ROWS)if(!ids.has(item.id))await db.upsertMenu(item)}

async function ensureV119PromotionCampaign(){ return 0; }

const ar = express.Router(); ar.use(admin);
let v1110BrandEnsured = false;
async function ensureV1110BrandName(){
  if (v1110BrandEnsured) return;
  const settings = await db.getSettings();
  if (settings.businessName !== BRAND_NAME) await db.updateSettings({ ...settings, businessName: BRAND_NAME });
  v1110BrandEnsured = true;
}

const providerState = () => ({
  emailConfigured: !!process.env.RESEND_API_KEY,
  smsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
});


// V11.40 — seed the private Manager revenue/cash ledger from the supplied
// handwritten closing notebook. The seed runs only when the ledger is empty,
// so Manager corrections are never overwritten.
let v1140RevenueSeedEnsured=false;
async function ensureV1140RevenueLedgerSeed(){
  if(v1140RevenueSeedEnsured)return;
  const existing=await db.getRevenueLedger();
  if(!existing.length){
    let rows=[];
    try{rows=JSON.parse(fs.readFileSync(path.join(DATA,'revenue-ledger.json'),'utf8'))}catch{}
    if(rows.length)await db.seedRevenueLedger(rows);
  }
  v1140RevenueSeedEnsured=true;
}

// One database-backed snapshot replaces 4-10 simultaneous browser requests.
// This is materially more stable on serverless deployments and Supabase Free.
ar.get('/snapshot', async (req, res, next) => {
  try {
    await ensureV116MenuAddons();
    await ensureV118ComboItems();
    await ensureV1112MenuNames();
    await ensureV1113MenuStructure();
    await ensureV1116WokRows();
    await ensureV1135BeverageRows();
    await ensureV119PromotionCampaign();
    await ensureV1110BrandName();
    const view = String(req.query.view || 'manager').toLowerCase();
    if (view === 'staff') {
      const [allOrders, menu, settings, promotions] = await Promise.all([
        db.getOrders(), db.getMenu(), db.getSettings(), db.getPromotions()
      ]);
      // V11.18: Surface future pre-orders to Staff immediately so they stay visible
      // in Active. Alarm logic remains due-time aware, so future pre-orders do not ring early.
      const orders=allOrders;
      return res.json({ orders, menu, settings, promotions, status: publicStatusFromSettings(settings), notificationProviders: providerState() });
    }
    await ensureV1140RevenueLedgerSeed();
    const [menu, promotions, inventory, recipes, employees, payroll, shifts, sales, orders, settings, revenueLedger] = await Promise.all([
      db.getMenu(), db.getPromotions(), db.getInventory(), db.getRecipes(), db.getEmployees(), db.getPayroll(), db.getShifts(), db.getSales(), db.getOrders(), db.getSettings(), db.getRevenueLedger()
    ]);
    const analytics = await db.analytics(sales);
    res.json({ menu, promotions, inventory, recipes, employees, payroll, shifts, sales, orders, revenueLedger, analytics, settings, status: publicStatusFromSettings(settings), notificationProviders: providerState() });
  } catch (e) { next(e); }
});
ar.get('/analytics', async (req, res, next) => { try { res.json(await db.analytics()); } catch (e) { next(e); } });

// V11.40 — Manager-only daily revenue / till close ledger.
ar.get('/revenue-ledger', async (req,res,next)=>{try{await ensureV1140RevenueLedgerSeed();res.json({revenueLedger:await db.getRevenueLedger()})}catch(e){next(e)}});
ar.post('/revenue-ledger', async (req,res,next)=>{try{const b=req.body||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date||'')))return res.status(400).json({error:'Enter a valid business date.'});const {id:ignored,...payload}=b;const row=await db.upsertRevenueLedger({...payload,source:txt(b.source,120)||'Manager entry'});res.status(201).json({ok:true,row})}catch(e){next(e)}});
ar.patch('/revenue-ledger/:id', async (req,res,next)=>{try{const b=req.body||{};const row=await db.upsertRevenueLedger({...b,id:req.params.id,source:txt(b.source,120)||'Manager entry'});res.json({ok:true,row})}catch(e){next(e)}});
ar.delete('/revenue-ledger/:id', async (req,res,next)=>{try{await db.deleteRevenueLedger(req.params.id);res.json({ok:true})}catch(e){next(e)}});
ar.get('/menu', async (req, res, next) => { try { await ensureV116MenuAddons(); await ensureV118ComboItems(); await ensureV160HotReady(); await ensureV1112MenuNames(); await ensureV1113MenuStructure(); await ensureV1116WokRows(); await ensureV1135BeverageRows(); res.json({ menu: await db.getMenu() }); } catch (e) { next(e); } });
// V1.6 — batch Hot & Ready availability control. Combo availability is derived from the underlying items.
ar.patch('/hot-ready/availability', async (req,res,next)=>{try{
  await ensureV160HotReady();
  const b=req.body||{},allowed=new Set(V160_HOT_READY_SELECTIONS.map(x=>x.id)),menu=await db.getMenu();
  const targets=menu.filter(x=>allowed.has(String(x.id)));
  let updates=[];
  if(typeof b.soldOut==='boolean')updates=targets.map(x=>({id:x.id,soldOut:b.soldOut}));
  else if(Array.isArray(b.updates))updates=b.updates.filter(x=>allowed.has(String(x?.id))&&typeof x?.soldOut==='boolean').map(x=>({id:String(x.id),soldOut:!!x.soldOut}));
  if(!updates.length)return res.status(400).json({error:'No Hot & Ready availability updates supplied.'});
  const byId=new Map(targets.map(x=>[String(x.id),x]));
  for(const u of updates){const row=byId.get(u.id);if(row)await db.upsertMenu({...row,soldOut:u.soldOut});}
  const nextMenu=await db.getMenu();
  res.json({ok:true,hotReady:v160PublicHotReady(nextMenu),combos:v160ComboAvailability(nextMenu)});
}catch(e){next(e)}});
ar.get('/promotions', async (req, res, next) => { try { await ensureV119PromotionCampaign(); res.json({ promotions: await db.getPromotions() }); } catch (e) { next(e); } });

const V1111_OPERATING_SUPPLIES = [
  { name:'Trash Bags', unit:'box', section:'Waste & Trash', note:'New supply checklist — enter On hand, Reorder at and Target stock.' },
  { name:'Napkins', unit:'pack', section:'Paper & Washroom', note:'New supply checklist — front counter / dining room.' },
  { name:'Toilet Paper (White)', unit:'pack', section:'Paper & Washroom', note:'New supply checklist — washroom.' },
  { name:'Hand-Wash Paper (Brown)', unit:'pack', section:'Paper & Washroom', note:'New supply checklist — brown hand paper towels.' },
  { name:'Vinyl Gloves', unit:'box', section:'Gloves & Food Safety', note:'New supply checklist — food handling.' },
  { name:'Plastic Gloves', unit:'box', section:'Gloves & Food Safety', note:'New supply checklist — food handling.' },
  { name:'Floor Cleaner', unit:'bottle', section:'Cleaning & Sanitation', note:'New supply checklist — floor cleaning.' },
  { name:'Dish Soap (Lemon)', unit:'bottle', section:'Cleaning & Sanitation', note:'New supply checklist — dishwashing.' },
  { name:'Hand Soap', unit:'bottle', section:'Cleaning & Sanitation', note:'New supply checklist — handwashing stations.' },
  { name:'Glass Cleaner', unit:'bottle', section:'Cleaning & Sanitation', note:'New supply checklist — windows / glass.' },
  { name:'Bleach', unit:'bottle', section:'Cleaning & Sanitation', note:'New supply checklist — sanitation.' },
  { name:'Nylon Bag (Phở Soup)', unit:'pack', section:'Packaging & Takeout', note:'New supply checklist — phở soup takeout.' },
  { name:'Food Wrap', unit:'roll', section:'Kitchen Consumables', note:'New supply checklist — food prep / storage.' },
  { name:'Tin Foil', unit:'roll', section:'Kitchen Consumables', note:'New supply checklist — food prep / wrapping.' },
  { name:'Oil Blotting Paper', unit:'pack', section:'Kitchen Consumables', note:'New supply checklist — fryer / food prep.' }
];
function invSeedKeyV1111(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
async function ensureV1111OperatingSupplies(){
  const existing=await db.getInventory();
  const have=new Set(existing.map(x=>invSeedKeyV1111(x.name)));
  let added=0;
  for(const x of V1111_OPERATING_SUPPLIES){
    if(have.has(invSeedKeyV1111(x.name))) continue;
    await db.upsertInventory({
      id:id(), name:x.name, unit:x.unit, qty:0, reorder:0, targetQty:0,
      usageNote:`[SECTION:${x.section}] | ${x.note}`, cost:0, supplier:'',
      statusOverride:'ok', lastStockedAt:null, updatedAt:new Date().toISOString()
    });
    added++;
  }
  return added;
}

ar.get('/inventory', async (req, res, next) => { try { await ensureV1111OperatingSupplies(); res.json({ inventory: await db.getInventory() }); } catch (e) { next(e); } });
ar.get('/inventory/export-excel', async (req, res, next) => { try {
  await ensureV1110BrandName();
  const [items, settings] = await Promise.all([db.getInventory(), db.getSettings()]);
  const tz = settings.timezone || 'America/Toronto';
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const stamp = `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
  const display = new Intl.DateTimeFormat('en-CA',{timeZone:tz,dateStyle:'full',timeStyle:'medium'}).format(now);
  const xml = inventoryExcelXml(items, settings, display);
  res.setHeader('Content-Type','application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="VietNomNom_Inventory_${stamp}.xls"`);
  res.setHeader('Cache-Control','no-store');
  res.send(Buffer.from(xml,'utf8'));
} catch (e) { next(e); } });
ar.get('/employees', async (req, res, next) => { try { res.json({ employees: await db.getEmployees() }); } catch (e) { next(e); } });
ar.get('/payroll', async (req, res, next) => { try { res.json({ payroll: await db.getPayroll() }); } catch (e) { next(e); } });
ar.get('/shifts', async (req, res, next) => { try { res.json({ shifts: await db.getShifts() }); } catch (e) { next(e); } });
ar.get('/sales', async (req, res, next) => { try { res.json({ sales: await db.getSales() }); } catch (e) { next(e); } });
ar.get('/notifications', async (req, res, next) => { try { res.json({ notifications: await db.getNotifications() }); } catch (e) { next(e); } });
ar.get('/recipes', async (req, res, next) => { try { res.json({ recipes: await db.getRecipes() }); } catch (e) { next(e); } });
ar.get('/settings', async (req, res, next) => { try { const settings = await db.getSettings(); res.json({ settings, status: publicStatusFromSettings(settings), notificationProviders: providerState() }); } catch (e) { next(e); } });
ar.patch('/settings', async (req, res, next) => { try { const b = req.body || {}, s = await db.getSettings(); for (const k of ['businessName', 'phone', 'address', 'email', 'notice', 'biweeklyAnchorDate']) if (b[k] !== undefined) s[k] = txt(b[k], 300); for (const k of ['onlineOrderingEnabled', 'deliveryEnabled', 'notificationEmailEnabled', 'notificationSmsEnabled']) if (b[k] !== undefined) s[k] = !!b[k]; if (['auto', 'open', 'closed'].includes(b.storeOverride)) s.storeOverride = b.storeOverride; if (b.hours && typeof b.hours === 'object') s.hours = b.hours; const saved = await db.updateSettings(s); res.json({ ok: true, settings: saved, status: publicStatusFromSettings(saved) }); } catch (e) { next(e); } });
ar.get('/orders', async (req, res, next) => { try { res.json({ orders: await db.getOrders(req.query.status) }); } catch (e) { next(e); } });

ar.post('/orders', async (req, res, next) => { try { await ensureV119PromotionCampaign(); const b = req.body || {}, status = ['new', 'accepted', 'preparing', 'ready', 'out-for-delivery', 'completed'].includes(b.status) ? b.status : 'new', o = await createOrderFromPayload(b, { source: 'pos', allowOverride: true, initialStatus: status }); await db.insertOrder(o); if (status === 'completed') { await createSaleFromOrder(o); await db.updateOrder(o); } if (o.customer?.email || o.customer?.phone) await notifyOrder(o, status === 'completed' ? 'completed' : 'new'); res.status(201).json({ ok: true, order: o, saleId: o.saleId }); } catch (e) { next(e); } });
ar.post('/sales', async (req, res, next) => { try { await ensureV119PromotionCampaign(); const b = req.body || {}, o = await createOrderFromPayload({ ...b, customer: { name: b.customerName, phone: b.customerPhone, email: b.customerEmail }, fulfillment: String(b.channel || 'walk-in').toLowerCase() }, { source: 'pos', allowOverride: true, initialStatus: 'completed' }); await db.insertOrder(o); await createSaleFromOrder(o); await db.updateOrder(o); if (o.customer?.email || o.customer?.phone) await notifyOrder(o, 'completed'); const sales = await db.getSales(); res.status(201).json({ ok: true, order: o, sale: sales.find(s => s.id === o.saleId) }); } catch (e) { next(e); } });

ar.post('/menu', async (req, res, next) => { try { const b = req.body || {}, x = { id: txt(b.id, 80) || id(), name: txt(b.name, 120), category: txt(b.category, 60) || 'Other', description: txt(b.description, 500), price: money(b.price), cost: money(b.cost), active: b.active !== false, soldOut: !!b.soldOut, image: txt(b.image, 500) }; if (!x.name) return res.status(400).json({ error: 'Name required' }); await db.upsertMenu(x); res.status(201).json({ ok: true, item: x }); } catch (e) { next(e); } });
ar.post('/promotions', async (req, res, next) => { try { const b = req.body || {}, x = { id: id(), name: txt(b.name, 100), type: b.type === 'fixed' ? 'fixed' : 'percent', value: money(b.value), active: b.active !== false, websiteVisible: b.websiteVisible !== false, startAt: txt(b.startAt, 40), endAt: txt(b.endAt, 40), minSpend: money(b.minSpend), maxDiscount: money(b.maxDiscount), channels: Array.isArray(b.channels) ? b.channels.filter(x => ['pos', 'website'].includes(x)) : ['pos'], code: txt(b.code, 40), notes: txt(b.notes, 300) }; if (!x.name) return res.status(400).json({ error: 'Name required' }); await db.upsertPromotion(x); res.status(201).json({ ok: true, promotion: x }); } catch (e) { next(e); } });
ar.post('/inventory', async (req, res, next) => { try { const b = req.body || {}, x = { id: id(), name: txt(b.name, 100), unit: txt(b.unit, 30) || 'unit', qty: Number(b.qty) || 0, reorder: Number(b.reorder) || 0, targetQty: Number(b.targetQty) || 0, usageNote: txt(b.usageNote, 150), cost: money(b.cost), supplier: txt(b.supplier, 100), statusOverride: ['ok', 'reorder'].includes(b.statusOverride) ? b.statusOverride : 'auto', lastStockedAt: txt(b.lastStockedAt, 50) || null, updatedAt: new Date().toISOString() }; if (!x.name) return res.status(400).json({ error: 'Name required' }); await db.upsertInventory(x); res.status(201).json({ ok: true, item: x }); } catch (e) { next(e); } });
ar.post('/employees', async (req, res, next) => { try { const b = req.body || {}, x = { id: id(), name: txt(b.name, 100), preferredName: txt(b.preferredName, 100), role: txt(b.role, 80), phone: txt(b.phone, 40), email: txt(b.email, 120), address: txt(b.address, 300), city: txt(b.city, 100), province: txt(b.province, 80), postalCode: txt(b.postalCode, 20), dateOfBirth: txt(b.dateOfBirth, 20), sin: txt(b.sin, 20), emergencyName: txt(b.emergencyName, 120), emergencyPhone: txt(b.emergencyPhone, 40), hireDate: txt(b.hireDate, 20), employmentType: txt(b.employmentType, 40) || 'Part-time', status: txt(b.status, 30) || 'Active', hourlyRate: money(b.hourlyRate), hoursThisWeek: Number(b.hoursThisWeek) || 0, payFrequency: txt(b.payFrequency, 30) || 'Bi-weekly', defaultPaymentMethod: txt(b.defaultPaymentMethod, 40) || 'Cheque', notes: txt(b.notes, 1000) }; if (!x.name) return res.status(400).json({ error: 'Legal name required' }); await db.upsertEmployee(x); res.status(201).json({ ok: true, employee: x }); } catch (e) { next(e); } });
ar.post('/payroll', async (req, res, next) => { try { const b = req.body || {}, employees = await db.getEmployees(), emp = employees.find(e => e.id === b.employeeId); if (!emp) return res.status(404).json({ error: 'Employee not found' }); const regularHours = Math.max(0, Number(b.regularHours) || 0), overtimeHours = Math.max(0, Number(b.overtimeHours) || 0), rate = money(b.hourlyRate !== undefined ? b.hourlyRate : emp.hourlyRate), otMultiplier = Math.max(1, Number(b.overtimeMultiplier) || 1.5), regularPay = money(regularHours * rate), overtimePay = money(overtimeHours * rate * otMultiplier), grossPay = money(regularPay + overtimePay), incomeTax = money(Math.max(0, Number(b.incomeTax) || 0)), cpp = money(Math.max(0, Number(b.cpp) || 0)), ei = money(Math.max(0, Number(b.ei) || 0)), otherDeductions = money(Math.max(0, Number(b.otherDeductions) || 0)), totalDeductions = money(incomeTax + cpp + ei + otherDeductions), netPay = money(Math.max(0, grossPay - totalDeductions)); const rec = { id: id(), payrollNo: 'P' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000), employeeId: emp.id, employeeName: emp.name, payFrequency: txt(b.payFrequency, 30) || emp.payFrequency || 'Bi-weekly', periodStart: txt(b.periodStart, 20), periodEnd: txt(b.periodEnd, 20), payDate: txt(b.payDate, 20) || new Date().toISOString().slice(0, 10), regularHours, overtimeHours, hourlyRate: rate, overtimeMultiplier: otMultiplier, regularPay, overtimePay, grossPay, incomeTax, cpp, ei, otherDeductions, totalDeductions, netPay, paymentMethod: txt(b.paymentMethod, 40) || emp.defaultPaymentMethod || 'Cheque', referenceNo: txt(b.referenceNo, 80), notes: txt(b.notes, 1000), createdAt: new Date().toISOString() }; await db.upsertPayroll(rec); emp.hoursThisWeek = 0; await db.upsertEmployee(emp); res.status(201).json({ ok: true, payroll: rec }); } catch (e) { next(e); } });
ar.post('/recipes', async (req, res, next) => { try { const b = req.body || {}, ingredients = Array.isArray(b.ingredients) ? b.ingredients.map(x => ({ qty: txt(x.qty, 40), unit: txt(x.unit, 40), item: txt(x.item, 120), note: txt(x.note, 200) })).filter(x => x.item) : [], x = { id: id(), name: txt(b.name, 120), category: txt(b.category, 80), menuItemName: txt(b.menuItemName, 120), yield: txt(b.yield, 100), active: b.active !== false, ingredients, instructions: txt(b.instructions, 6000), notes: txt(b.notes, 3000), referenceImage: txt(b.referenceImage, 300), updatedAt: new Date().toISOString() }; if (!x.name) return res.status(400).json({ error: 'Recipe name required' }); await db.upsertRecipe(x); res.status(201).json({ ok: true, recipe: x }); } catch (e) { next(e); } });
ar.post('/shifts', async (req, res, next) => { try { const b = req.body || {}, emps = await db.getEmployees(), emp = emps.find(e => e.id === b.employeeId); if (!emp) return res.status(404).json({ error: 'Employee not found' }); const start = txt(b.startTime, 10) || '10:00', end = txt(b.endTime, 10) || '15:00', toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }; let mins = toMin(end) - toMin(start); if (mins < 0) mins += 1440; const breakMinutes = Math.max(0, Number(b.breakMinutes) || 0), hours = Math.max(0, (mins - breakMinutes) / 60), rate = money(b.hourlyRate !== undefined ? b.hourlyRate : emp.hourlyRate), rec = { id: id(), employeeId: emp.id, employeeName: emp.name, date: txt(b.date, 20), shiftType: txt(b.shiftType, 40) || 'Custom', startTime: start, endTime: end, breakMinutes, hours: money(hours), hourlyRate: rate, gross: money(hours * rate), notes: txt(b.notes, 300), createdAt: new Date().toISOString() }; await db.upsertShift(rec); res.status(201).json({ ok: true, shift: rec }); } catch (e) { next(e); } });

ar.delete('/shifts/:id', async (req, res, next) => { try { await db.deleteShift(req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });
ar.delete('/payroll/:id', async (req, res, next) => { try { await db.deletePayroll(req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });
ar.post('/inventory/send-reorder', async (req, res, next) => { try { const arr = await db.getInventory(), sectionById = req.body?.sectionById && typeof req.body.sectionById === 'object' ? req.body.sectionById : {}, items = arr.filter(x => x.statusOverride === 'reorder' || (x.statusOverride !== 'ok' && Number(x.qty) <= Number(x.reorder))).map(x => ({ ...x, section: txt(sectionById[x.id], 80) || 'Inventory' })); if (!items.length) return res.status(400).json({ error: "Today's Order List is empty." }); const result = await sendOwnerInventorySms(items); res.json({ ok: true, count: items.length, ...result }); } catch (e) { next(e); } });

const crudConfig = {
  menu: { get: db.getMenu, upsert: db.upsertMenu, del: db.deleteMenu }, promotions: { get: db.getPromotions, upsert: db.upsertPromotion, del: db.deletePromotion }, inventory: { get: db.getInventory, upsert: db.upsertInventory, del: db.deleteInventory }, employees: { get: db.getEmployees, upsert: db.upsertEmployee, del: db.deleteEmployee }, recipes: { get: db.getRecipes, upsert: db.upsertRecipe, del: db.deleteRecipe }
};
ar.delete('/:kind(menu|promotions|inventory|employees|recipes)/:id', async (req, res, next) => { try { await crudConfig[req.params.kind].del(req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });
ar.patch('/:kind(menu|promotions|inventory|employees|recipes)/:id', async (req, res, next) => { try { const c = crudConfig[req.params.kind], arr = await c.get(), current = arr.find(x => x.id === req.params.id); if (!current) return res.status(404).json({ error: 'Not found' }); const merged = { ...current, ...req.body, id: current.id }; if (req.params.kind === 'inventory' || req.params.kind === 'recipes') merged.updatedAt = new Date().toISOString(); await c.upsert(merged); res.json({ ok: true, item: merged }); } catch (e) { next(e); } });

ar.patch('/orders/:id', async (req, res, next) => { try { await ensureV119PromotionCampaign(); const b = req.body || {}, orders = await db.getOrders(), o = orders.find(x => x.id === req.params.id); if (!o) return res.status(404).json({ error: 'Order not found' }); const previous = o.status, menu = await db.getMenu(), promotions = await db.getPromotions(); if (Array.isArray(b.items)) o.items = menuItemsFrom(b.items, menu, true); if (b.customer && typeof b.customer === 'object') o.customer = { ...o.customer, name: txt(b.customer.name ?? o.customer?.name, 100), phone: txt(b.customer.phone ?? o.customer?.phone, 40), email: txt(b.customer.email ?? o.customer?.email, 120) }; for (const k of ['payment', 'paymentStatus', 'fulfillment', 'address', 'requestedTime', 'notes', 'staffNote', 'promotionId']) if (b[k] !== undefined) o[k] = txt(b[k], k === 'notes' || k === 'staffNote' ? 1000 : 300); if (b.manualDiscount !== undefined) o.manualDiscount = money(Math.max(0, Number(b.manualDiscount) || 0)); if (b.finalDistanceKm !== undefined) { o.finalDistanceKm = Math.max(0, Number(b.finalDistanceKm) || 0); if (!o.customerDistanceKm) o.customerDistanceKm = o.finalDistanceKm; } if (b.status) o.status = b.status; recalcOrder(o, promotions, o.source === 'website' ? 'website' : 'pos'); if (o.status === 'completed' && !o.saleId) await createSaleFromOrder(o); o.updatedAt = new Date().toISOString(); await db.updateOrder(o); if (b.status && b.status !== previous) await notifyOrder(o, b.status); res.json({ ok: true, order: o }); } catch (e) { next(e); } });

// V11.28 — Manager order cleanup. Permanently removes test/duplicate orders
// together with linked sale/history and notification records.
ar.delete('/orders/:id', async (req, res, next) => { try {
  const ok=await db.deleteOrder(req.params.id);
  if(!ok)return res.status(404).json({error:'Order not found'});
  res.json({ok:true});
} catch(e){next(e)} });

app.use('/api/admin', ar);

app.use(express.static(PUBLIC, { etag: true, maxAge: '1h', setHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // HTML/JS/CSS must update immediately after a production deploy. Stale app.js
  // was able to leave the order page blank even after the API was fixed.
  if (['.html','.js','.css','.webmanifest'].includes(ext)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
} }));
app.get('*', (req, res) => res.status(404).send('Not found'));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const msg = String(err?.message || 'Server error');
  const transient = /statement timeout|connection terminated|connection timeout|ECONNRESET|57P01|too many clients|database.*busy/i.test(msg);
  res.setHeader('Cache-Control','no-store');
  res.status(transient ? 503 : 500).json({ error: transient ? 'Database is temporarily busy. Please retry in a moment.' : msg, retryable: transient });
});

module.exports = app;
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`${BRAND_NAME} Business Suite V1.0 running at http://localhost:${PORT}\nWebsite: http://localhost:${PORT}\nStaff Admin: http://localhost:${PORT}/admin.html\nManager CRM: http://localhost:${PORT}/manager.html`));
