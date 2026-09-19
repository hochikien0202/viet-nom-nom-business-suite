const fs = require('fs');
const path = require('path');
const pricing = require('./pricing');

const root = __dirname;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (ok, msg) => { if (!ok) throw new Error(msg); };

const menu = JSON.parse(read('data/menu.json'));
const settings = JSON.parse(read('data/settings.json'));
const publicCategories = new Set(['Bánh Mì','Combo','Summer Rolls','Vermicelli','Rice','Phở','Desserts']);
const operationalCategories = new Set(['Hot & Ready Base','Hot & Ready Item']);
const publicRows = menu.filter(x => publicCategories.has(x.category));
const operationalRows = menu.filter(x => operationalCategories.has(x.category));

must(settings.businessName === 'Viet Nom Nom', 'Business name must be Viet Nom Nom');
must(settings.address === '6645 Tecumseh Rd E, Windsor, ON N8T 1E7', 'Address mismatch');
must(settings.phone === '(519) 916-0879', 'Phone mismatch');
must(settings.deliveryEnabled === false, 'Direct website delivery should remain unpublished');
must(publicRows.length === 36, `Expected 36 customer-facing Vietnamese menu rows, got ${publicRows.length}`);
must(operationalRows.length === 15, `Expected 15 Hot & Ready operational choices, got ${operationalRows.length}`);
must(menu.every(x => publicCategories.has(x.category) || operationalCategories.has(x.category)), 'Menu contains an unexpected category');
must(Object.keys(pricing.WEEKLY_SPECIALS).length === 0, 'Inherited weekly specials must be disabled');

const customer = ['public/index.html','public/menu.html','public/order.html','public/about.html','public/contact.html','public/checkout.html'].map(read).join('\n');
for (const term of ['Greek','Gyro','Poutine','Pad Thai','Burger','Submarine','Breakfast']) {
  must(!customer.includes(term), `Customer website contains inherited item/category: ${term}`);
}
must(customer.includes('Viet Nom Nom'), 'Viet Nom Nom branding missing');

const orderHtml = read('public/order.html');
must(!/Dine-in|dine-in/.test(orderHtml), 'Direct order page must not offer dine-in');
must((orderHtml.match(/name="fulfillment"/g)||[]).length === 1, 'Direct order page should have one fulfillment input only');
must(/name="fulfillment" value="pickup" checked/.test(orderHtml), 'Direct orders must default to pickup');

const adminHtml = read('public/admin.html');
must(!/<option[^>]+value="(?:Dine-in|dine-in)"/i.test(adminHtml), 'Staff controls must not offer dine-in');
const adminVi = read('public/admin-vi.js');
for (const term of ['Không lấy muỗng, đũa, nĩa hoặc khăn giấy','Chỉ lấy muỗng / đũa / nĩa','Chỉ lấy khăn giấy','Lấy muỗng / đũa / nĩa và khăn giấy']) {
  must(adminVi.includes(term), `Missing Staff Vietnamese packing translation: ${term}`);
}
must(!adminVi.includes("document.addEventListener('input',scheduleViRefresh,true)"), 'Staff localization should not rescan on every keystroke');

console.log('Viet Nom Nom V2.0 smoke test passed: pickup-only direct ordering, Vietnamese Staff packing labels, menu structure and performance guard verified.');
