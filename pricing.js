const money = n => Math.round((Number(n) || 0) * 100) / 100;
const STORE_TIMEZONE = 'America/Toronto';

// Viet Nom Nom V1.0 ships without inherited weekly specials. Managers can add
// promotions later from the admin tools without exposing non-Vietnamese items.
const WEEKLY_SPECIALS = {};
const SUNDAY_COMBOS = [];

function localWeekday(at = new Date(), timeZone = STORE_TIMEZONE) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(at).toLowerCase();
}
function weeklySpecialForItem() { return null; }
function decorateMenuWithWeeklySpecials(menu) {
  return (menu || []).map(item => ({ ...item, basePrice: money(item.price), weeklySpecial: null }));
}
function weeklySpecialDiscount() { return { discount: 0, label: '', details: [] }; }
function weeklySpecialSummary(at = new Date(), timeZone = STORE_TIMEZONE) {
  return { day: localWeekday(at, timeZone), label: '', items: [], combos: [] };
}
function deliveryFee(km) {
  km = Number(km) || 0;
  if (km <= 0) return 0;
  if (km <= 5) return 6;
  return money(6 + Math.ceil(km - 5));
}

module.exports = { STORE_TIMEZONE, WEEKLY_SPECIALS, SUNDAY_COMBOS, localWeekday, weeklySpecialForItem, decorateMenuWithWeeklySpecials, weeklySpecialDiscount, weeklySpecialSummary, deliveryFee };
