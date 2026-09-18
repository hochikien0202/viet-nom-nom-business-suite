# Viet Nom Nom Business Suite V1.7

Restaurant website + ordering + Vietnamese Staff Admin for **Viet Nom Nom**.

## Restaurant information
- Address: 6645 Tecumseh Rd E, Windsor, ON N8T 1E7
- Phone: (519) 916-0879
- Hours: Mon–Sat 8:00 AM–7:00 PM; Sun 8:00 AM–6:00 PM
- Public menu: Vietnamese cuisine only

## V1.7 — Hot & Ready Combo system
- **C1 — $12.99:** choose 1 rice/noodle base + Hot Item #1 + Hot Item #2. The same hot item may be selected twice.
- **C2 — $5.99:** choose 1 base (Fried Rice or Chow Mein).
- **C3 — $7.99:** choose 1 Hot & Ready item.
- Base and Hot Item availability are stored separately from the combos.
- C1/C2/C3 availability is calculated automatically from the currently available selections.
- Sold-out choices stay visible but disabled in the configurator.
- Customer cart stores exact combo selections and supports editing configured combos.
- Server revalidates the selections before accepting the order.
- Staff receives the exact base/item choices in Vietnamese.
- Staff POS also uses a Vietnamese combo configurator for C1/C2/C3.
- Staff Menu Management has a dedicated Hot & Ready control with per-item availability, **HẾT TẤT CẢ**, and **MỞ LẠI TẤT CẢ**.
- Selection rows are operational data and are hidden from the ordinary POS/menu-item lists.
- Selection prices are already treated as future combo upcharges; all are $0 by default.

## Other V1.7 features
- Staff Admin is localized into Vietnamese.
- Uber Eats and Skip links appear beside Order Direct.
- Website-order item names, statuses, fulfillment, payment and kitchen modifiers display in Vietnamese for staff.

## Local Mac run
When PostgreSQL is not configured, local development uses JSON storage.

```bash
npm install
npm run migrate
npm start
```

Open:
- Website: http://localhost:3000
- Menu: http://localhost:3000/menu.html
- Order: http://localhost:3000/order.html
- Staff Admin: http://localhost:3000/admin.html
- Manager: http://localhost:3000/manager.html

Default Admin PIN: `2468`

## Vercel / Supabase production
If `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, or `POSTGRES_URL_NON_POOLING` is present, the app uses PostgreSQL (`db-postgres.js`).

Without PostgreSQL, Vercel falls back to `/tmp` so the app can load, but `/tmp` is temporary. Connect Supabase/PostgreSQL before relying on production website orders or persistent staff data.


V1.7: hardened Vercel/serverless local fallback detection so read-only /var/task never receives .local-data writes.
