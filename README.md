## V1.4 update
- Staff Admin is localized into Vietnamese.
- Website-order item names, status, fulfillment, payment, structured modifiers, allergy/pregnancy notes and staff printouts display in Vietnamese.
- Customer-facing website stays unchanged.

# Viet Nom Nom Business Suite V1.2

Customized restaurant suite for **Viet Nom Nom** with a **Vietnamese-only** public menu.

## Restaurant information
- Address: 6645 Tecumseh Rd E, Windsor, ON N8T 1E7
- Phone: (519) 916-0879
- Hours: Mon–Sat 8:00 AM–7:00 PM; Sun 8:00 AM–6:00 PM
- Public listing facts shown on the site: 4.4 stars / 41 reviews / $10–20

## Local Mac run — no Supabase required
This version automatically uses local JSON storage when no PostgreSQL connection is configured.

```bash
npm install
npm run migrate
npm start
```

Then open:
- Website: http://localhost:3000
- Menu: http://localhost:3000/menu.html
- Order: http://localhost:3000/order.html
- Staff Admin: http://localhost:3000/admin.html
- Manager: http://localhost:3000/manager.html

Default admin PIN: `2468`

Local edits/orders are saved in `.local-data/` inside the project folder. Delete `.local-data/` and run `npm run migrate` to reset to the bundled starter data.

## Vercel / Supabase production
If `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, or `POSTGRES_URL_NON_POOLING` is present, the app automatically switches to the original PostgreSQL adapter (`db-postgres.js`).


## V1.4
- Added Uber Eats and Skip ordering links beside Order Direct in the public Order menu.
