const fs = require('fs');
const path = require('path');
const pricing = require('./pricing');

const root = __dirname;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (ok, msg) => { if (!ok) throw new Error(msg); };

const menu = JSON.parse(read('data/menu.json'));
const settings = JSON.parse(read('data/settings.json'));
const allowed = new Set(['Bánh Mì','Combo','Summer Rolls','Vermicelli','Rice','Phở','Desserts']);

must(settings.businessName === 'Viet Nom Nom', 'Business name must be Viet Nom Nom');
must(settings.address === '6645 Tecumseh Rd E, Windsor, ON N8T 1E7', 'Address mismatch');
must(settings.phone === '(519) 916-0879', 'Phone mismatch');
must(settings.deliveryEnabled === false, 'Delivery should remain unpublished in V1.0');
must(menu.length === 35, 'Expected 35 Vietnamese menu rows');
must(menu.every(x => allowed.has(x.category)), 'Menu contains a non-Vietnamese category');
must(Object.keys(pricing.WEEKLY_SPECIALS).length === 0, 'Inherited weekly specials must be disabled');

const customer = ['public/index.html','public/menu.html','public/order.html','public/about.html','public/contact.html','public/checkout.html'].map(read).join('\n');
for (const term of ['Greek','Gyro','Poutine','Pad Thai','Burger','Submarine','Breakfast']) {
  must(!customer.includes(term), `Customer website contains inherited item/category: ${term}`);
}
must(customer.includes('Viet Nom Nom'), 'Viet Nom Nom branding missing');

console.log('Viet Nom Nom V1.0 smoke test passed: Vietnamese-only public menu and restaurant details verified.');
