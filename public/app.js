let menuData=[], publicPromos=[], storeStatus={}, weeklySpecialInfo={};
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function setActiveNav(){const file=location.pathname.split('/').pop()||'index.html';$$('.nav-links a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===file))}
function setupNav(){$('.mobile-toggle')?.addEventListener('click',()=>$('.nav-links')?.classList.toggle('open'));$('.order-trigger')?.addEventListener('click',e=>{e.stopPropagation();$('.order-pop')?.classList.toggle('open')});document.addEventListener('click',()=>$('.order-pop')?.classList.remove('open'))}
function toast(msg){let el=$('.toast');if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el)}el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800)}
function setupExternalButtons(){$$('[data-platform]').forEach(el=>el.addEventListener('click',e=>{const href=el.getAttribute('href');if(!href||href==='#'){e.preventDefault();toast(`${el.dataset.platform} link can be replaced with Viet Nom Nom official store URL.`)}}))}
async function fetchJsonWithTimeout(url,timeoutMs=8000){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);try{const r=await fetch(url,{cache:'no-store',signal:ctrl.signal});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`${url} returned ${r.status}`);return d}finally{clearTimeout(timer)}}
async function loadPublicData(){
  // Menu and store status are intentionally loaded independently. A slow/broken
  // status endpoint must never prevent the customer menu from rendering.
  const menuTask=fetchJsonWithTimeout('/api/public/menu').then(m=>{menuData=Array.isArray(m.menu)?m.menu:[];publicPromos=Array.isArray(m.promotions)?m.promotions:[];weeklySpecialInfo=m.weeklySpecial||{};refreshCartFromMenu();return true}).catch(e=>{console.error('Live menu load failed',e);menuData=[];publicPromos=[];const root=$('#orderMenu')||$('#menuGrid');if(root)root.innerHTML='<p class="menu-empty">Live menu is temporarily unavailable. Please refresh in a moment.</p>';toast('Could not refresh the live menu.');return false});
  fetchJsonWithTimeout('/api/public/status').then(s=>{storeStatus=s||{};renderStoreBanner()}).catch(e=>{console.error('Store status load failed',e);storeStatus={open:false,onlineOrderingEnabled:false,reason:'Live store status unavailable',notice:'Menu is still available to browse.'};renderStoreBanner()});
  return await menuTask;
}

function priceMarkup(item){
  const sale=Number(item.price||0),base=Number(item.basePrice??item.price??0),sp=item.weeklySpecial;
  if(sp&&base>sale){return `<div class="price price-special"><span class="price-old">$${base.toFixed(2)}</span><strong>$${sale.toFixed(2)}</strong><small>${esc(sp.label||'Weekly Special')}</small></div>`}
  return `<div class="price">$${sale.toFixed(2)}</div>`;
}
function renderStoreBanner(){let b=$('#storeStatusBanner');if(!b){b=document.createElement('div');b.id='storeStatusBanner';b.style.cssText='padding:10px 18px;text-align:center;font-weight:800;background:#f7efcf;color:#0c5960;border-bottom:1px solid #dfd5aa';document.body.insertBefore(b,document.body.firstChild)}const orderOK=storeStatus.open&&storeStatus.onlineOrderingEnabled;b.innerHTML=`${orderOK?'🟢 OPEN':'🔴 CLOSED'} · ${esc(storeStatus.reason||'')} ${storeStatus.notice?` · ${esc(storeStatus.notice)}`:''}`;b.style.background=orderOK?'#e7f5df':'#ffe2d8';syncDeliveryAvailabilityV1122()}
function renderMenu(target='#menuGrid',filter='All',addButtons=true){const root=$(target);if(!root)return;const items=filter==='All'?menuData:menuData.filter(x=>x.category===filter);root.innerHTML=items.map(item=>`<article class="menu-item ${item.soldOut?'soldout':''}"><div><div class="eyebrow">${esc(item.category)}</div><h3>${esc(item.name)}</h3><p>${esc(item.description||'Freshly prepared at Viet Nom Nom.')}</p>${addButtons?`<button class="add-btn" data-add="${item.id}" ${item.soldOut?'disabled':''}>${item.soldOut?'Sold Out':'Add to order'}</button>`:''}</div>${priceMarkup(item)}</article>`).join('')||'<p>No menu items available in this category.</p>';bindAddButtons()}
function menuGroup(category){const vietnam=new Set(['Bánh Mì','Combo','Summer Rolls','Vermicelli','Rice','Phở','Desserts','Desserts & Drinks']);return vietnam.has(category)?'Vietnamese':'Other'}
function renderMenuGroup(target='#menuGrid',group='All',addButtons=true){const root=$(target);if(!root)return;const items=group==='All'?menuData:menuData.filter(x=>menuGroup(x.category)===group);root.innerHTML=items.map(item=>`<article class="menu-item ${item.soldOut?'soldout':''}"><div><div class="eyebrow">${esc(item.category)}</div><h3>${esc(item.name)}</h3><p>${esc(item.description||'Freshly prepared at Viet Nom Nom.')}</p>${addButtons?`<button class="add-btn" data-add="${item.id}" ${item.soldOut?'disabled':''}>${item.soldOut?'Sold Out':'Add to order'}</button>`:''}</div>${priceMarkup(item)}</article>`).join('')||'<p>No menu items available in this group.</p>';bindAddButtons()}
function setupMenuTabs(){const tabs=$$('.menu-tabs button');if(!tabs.length)return;const groups=['All','Vietnamese'];const wrap=tabs[0]?.parentElement;if(wrap){wrap.innerHTML=groups.map((c,i)=>`<button class="${i===0?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('');$$('.menu-tabs button').forEach(btn=>btn.addEventListener('click',()=>{$$('.menu-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderMenuGroup('#menuGrid',btn.dataset.filter)}))}renderMenuGroup()}
function getCart(){try{return JSON.parse(localStorage.getItem('vietNomNomCart')||'[]')}catch{return[]}}
function saveCart(cart){localStorage.setItem('vietNomNomCart',JSON.stringify(cart));updateCartBadge();updateMobileCartBar()}
function refreshCartFromMenu(){let cart=getCart(),changed=false;cart=cart.map(row=>{const live=menuData.find(m=>m.id===row.id);if(!live||!live.active){changed=true;return null}const base=Number(live.basePrice??live.price),price=Number(live.price);if(row.price!==price||row.basePrice!==base||row.name!==live.name||live.soldOut){changed=true}return live.soldOut?null:{id:live.id,name:live.name,category:live.category,price,basePrice:base,weeklySpecial:live.weeklySpecial||null,qty:row.qty}}).filter(Boolean);if(changed)saveCart(cart)}
function addToCart(id){const item=menuData.find(x=>x.id===id);if(!item)return;if(item.soldOut)return toast(`${item.name} is sold out.`);const cart=getCart(),row=cart.find(x=>x.id===id),base=Number(item.basePrice??item.price),price=Number(item.price);row?row.qty++:cart.push({id:item.id,name:item.name,category:item.category,price,basePrice:base,weeklySpecial:item.weeklySpecial||null,qty:1});saveCart(cart);toast(`${item.name}${item.weeklySpecial?' · weekly special':''} added to your order.`);renderCart();const bar=$('#mobileCartBar');if(bar&&window.matchMedia('(max-width: 780px)').matches){bar.hidden=false;bar.classList.remove('cart-bump');void bar.offsetWidth;bar.classList.add('cart-bump')}}
function bindAddButtons(){$$('[data-add]').forEach(btn=>btn.onclick=()=>addToCart(btn.dataset.add))}
function updateCartBadge(){const count=getCart().reduce((s,x)=>s+x.qty,0);$$('[data-cart-count]').forEach(el=>el.textContent=count);updateMobileCartBar()}
function updateMobileCartBar(){const bar=$('#mobileCartBar');if(!bar)return;const cart=getCart(),count=cart.reduce((sum,x)=>sum+Number(x.qty||0),0),total=cart.reduce((sum,x)=>sum+Number(x.price||0)*Number(x.qty||0),0);const c=$('[data-mobile-cart-count]'),pl=$('[data-mobile-cart-plural]'),t=$('[data-mobile-cart-total]');if(c)c.textContent=count;if(pl)pl.textContent=count===1?'':'s';if(t)t.textContent='$'+total.toFixed(2);bar.hidden=count===0}
function changeQty(id,delta){let cart=getCart(),row=cart.find(x=>x.id===id);if(!row)return;row.qty+=delta;cart=cart.filter(x=>x.qty>0);saveCart(cart);renderCart()}
function renderCart(){
  const root=$('#cartItems');if(!root)return;const cart=getCart();let specialRow=$('#cartWeeklySpecial');
  if(!specialRow){specialRow=document.createElement('div');specialRow.id='cartWeeklySpecial';specialRow.className='cart-special-row';const total=$('#cartTotal')?.closest('.total-row');total?.insertAdjacentElement('afterend',specialRow)}
  if(!cart.length){root.innerHTML='<p style="color:var(--muted)">Your cart is empty. Add a few favourites from the menu.</p>';$('#cartTotal').textContent='$0.00';specialRow.hidden=true;updateMobileCartBar();return}
  root.innerHTML=cart.map(x=>{const base=Number(x.basePrice??x.price),sale=Number(x.price),isSpecial=x.weeklySpecial&&base>sale;return `<div class="cart-line"><div><strong>${esc(x.name)}</strong><small>${isSpecial?`<span class="cart-old-price">$${base.toFixed(2)}</span> <b>$${sale.toFixed(2)} each</b> · ${esc(x.weeklySpecial.label||'Weekly Special')}`:`$${sale.toFixed(2)} each`}</small></div><div><strong>$${(sale*x.qty).toFixed(2)}</strong><div class="qty"><button type="button" aria-label="Remove one ${esc(x.name)}" data-qty="${x.id}" data-delta="-1">−</button><span>${x.qty}</span><button type="button" aria-label="Add one ${esc(x.name)}" data-qty="${x.id}" data-delta="1">+</button></div></div></div>`}).join('');
  $$('[data-qty]').forEach(b=>b.onclick=()=>changeQty(b.dataset.qty,Number(b.dataset.delta)));
  const regular=cart.reduce((sum,x)=>sum+Number(x.basePrice??x.price)*x.qty,0),final=cart.reduce((sum,x)=>sum+Number(x.price)*x.qty,0),saved=Math.max(0,regular-final);
  $('#cartTotal').textContent='$'+regular.toFixed(2);
  specialRow.hidden=saved<.005;specialRow.innerHTML=saved>=.005?`<span>${esc(weeklySpecialInfo.label||'Weekly Special')}</span><strong>−$${saved.toFixed(2)}</strong><small>Items after special: <b>$${final.toFixed(2)}</b></small>`:'';
  updateMobileCartBar();
}
function calcDeliveryFee(km){const d=Number(km)||0;if(d<=0)return 0;return d<=5?6:6+Math.ceil(d-5)}
function renderOrderBrowseMenu(){
  const root=$('#orderMenu');if(!root)return;const q=($('#orderSearch')?.value||'').trim().toLowerCase(),group=$('#orderGroup')?.value||'All';let items=menuData;
  if(group!=='All')items=items.filter(x=>menuGroup(x.category)===group);
  if(q)items=items.filter(x=>`${x.name} ${x.category} ${x.description||''}`.toLowerCase().includes(q));
  root.innerHTML=items.map(item=>`<article class="menu-item ${item.soldOut?'soldout':''}"><div><div class="eyebrow">${esc(item.category)}</div><h3>${esc(item.name)}</h3><p>${esc(item.description||'Freshly prepared at Viet Nom Nom.')}</p><button type="button" class="add-btn" data-add="${item.id}" ${item.soldOut?'disabled':''}>${item.soldOut?'Sold Out':'Add to order'}</button></div>${priceMarkup(item)}</article>`).join('')||'<p class="menu-empty">No matching menu items.</p>';bindAddButtons();
}
function setupMobileOrderDrawer(){
  const panel=$('#cartPanel'),bar=$('#mobileCartBar'),openBtn=$('#mobileCartOpen'),closeBtn=$('#mobileCartClose'),backdrop=$('#mobileCartBackdrop');if(!panel||!bar||!openBtn||!closeBtn||!backdrop)return;
  const isMobile=()=>window.matchMedia('(max-width: 780px)').matches;
  const open=()=>{if(!isMobile())return;panel.classList.add('mobile-open');panel.setAttribute('aria-modal','true');backdrop.hidden=false;requestAnimationFrame(()=>backdrop.classList.add('open'));document.body.classList.add('order-drawer-open');closeBtn.focus({preventScroll:true})};
  const close=()=>{panel.classList.remove('mobile-open');panel.setAttribute('aria-modal','false');backdrop.classList.remove('open');document.body.classList.remove('order-drawer-open');setTimeout(()=>{if(!panel.classList.contains('mobile-open'))backdrop.hidden=true},220)};
  openBtn.addEventListener('click',open);closeBtn.addEventListener('click',close);backdrop.addEventListener('click',close);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('mobile-open'))close()});
  window.addEventListener('resize',()=>{if(!isMobile())close()},{passive:true});
  window.__vietNomNomOpenMobileCart=open;window.__vietNomNomCloseMobileCart=close;updateMobileCartBar();
}
function focusOrderField(el,msg){toast(msg);if(window.matchMedia('(max-width: 780px)').matches)window.__vietNomNomOpenMobileCart?.();setTimeout(()=>{el?.focus({preventScroll:true});el?.scrollIntoView({behavior:'smooth',block:'center'})},120)}
async function currentOrderingStatus(){
  try{const s=await fetchJsonRetry('/api/public/status',{timeoutMs:7000,retries:1});storeStatus=s||storeStatus;renderStoreBanner();return s}catch(e){console.warn('Fresh store status check failed; server will validate order state.',e);return storeStatus||{}}
}
function setupOrderPage(){
  if(!$('#orderMenu'))return;renderOrderBrowseMenu();renderCart();setupMobileOrderDrawer();$('#orderSearch')?.addEventListener('input',renderOrderBrowseMenu);$('#orderGroup')?.addEventListener('change',renderOrderBrowseMenu);
  const fulfillment=$$('input[name="fulfillment"]'),addressWrap=$('#addressWrap'),pickupPay=$('#pickupPayments'),deliveryPay=$('#deliveryPayments'),dist=$('#deliveryDistance'),estimate=$('#deliveryEstimate'),maps=$('#mapsCheck'),availability=$('#orderAvailabilityMessage');
  function syncDeliveryEstimate(){const km=Number(dist?.value)||0,fee=calcDeliveryFee(km);if(estimate)estimate.innerHTML=km>0?`Estimated delivery fee: <strong>$${fee.toFixed(2)}</strong><small>Staff will verify the route before final completion. Delivery fee is added after food HST and is not included in the tax calculation.</small>`:'Enter your estimated distance to see the delivery fee.';const addr=$('#deliveryAddress')?.value?.trim()||'';if(maps)maps.href=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('6645 Tecumseh Rd E, Windsor, ON N8T 1E7')}&destination=${encodeURIComponent(addr)}`;renderCart()}
  function sync(){const mode=$('input[name="fulfillment"]:checked')?.value||'pickup',atRestaurant=mode!=='delivery';addressWrap.style.display=mode==='delivery'?'grid':'none';pickupPay.style.display=atRestaurant?'grid':'none';deliveryPay.style.display=mode==='delivery'?'grid':'none';const payTitle=$('#restaurantPaymentTitle');if(payTitle)payTitle.textContent=mode==='dine-in'?'Payment — Dine-in':'Payment — Pickup';const desired=mode==='delivery'?'cash-driver':'counter',checked=$('input[name="payment"]:checked');if(!checked||((atRestaurant&&checked.value==='cash-driver')||(mode==='delivery'&&checked.value==='counter'))){const fallback=$(`input[name="payment"][value="${desired}"]`);if(fallback)fallback.checked=true}syncDeliveryEstimate();renderCart()}
  fulfillment.forEach(x=>x.addEventListener('change',sync));dist?.addEventListener('input',syncDeliveryEstimate,{passive:true});$('#deliveryAddress')?.addEventListener('input',syncDeliveryEstimate,{passive:true});sync();
  function showAvailability(){if(!availability)return;const known=typeof storeStatus.open==='boolean'&&typeof storeStatus.onlineOrderingEnabled==='boolean';if(!known){availability.className='order-availability';availability.textContent='';return}const ok=storeStatus.open&&storeStatus.onlineOrderingEnabled;availability.className='order-availability show '+(ok?'open':'closed');availability.textContent=ok?'Online ordering is open. Your order will go directly to Staff Admin.':`Online ordering is currently closed${storeStatus.reason?` · ${storeStatus.reason}`:''}.`}
  showAvailability();setTimeout(showAvailability,1200);
  $('#placeOrder')?.addEventListener('click',async()=>{
    const cart=getCart();if(!cart.length){toast('Please add at least one item first.');return}
    const name=$('#customerName')?.value.trim()||'',phone=$('#customerPhone')?.value.trim()||'',email=$('#customerEmail')?.value.trim()||'',mode=$('input[name="fulfillment"]:checked')?.value||'pickup',payment=$('input[name="payment"]:checked')?.value||'';
    if(!name)return focusOrderField($('#customerName'),'Please enter your name.');if(!phone)return focusOrderField($('#customerPhone'),'Please enter your phone number.');if(email&&!$('#customerEmail').checkValidity())return focusOrderField($('#customerEmail'),'Please enter a valid email address.');if(mode==='delivery'&&!$('#deliveryAddress')?.value.trim())return focusOrderField($('#deliveryAddress'),'Please enter a delivery address.');if(mode==='delivery'&&!(Number(dist?.value)>0))return focusOrderField(dist,'Please enter the estimated distance in km.');if(!payment)return focusOrderField(mode==='delivery'?$('#deliveryPayments input'):$('#pickupPayments input'),'Please choose a payment method.');
    const btn=$('#placeOrder'),original=btn.textContent;btn.disabled=true;btn.textContent='Checking store…';
    try{
      const fresh=await currentOrderingStatus();showAvailability();if(fresh&&fresh.onlineOrderingEnabled===false)throw new Error('Online ordering is temporarily disabled.');if(fresh&&fresh.open===false)throw new Error(`Viet Nom Nom is currently closed${fresh.reason?` · ${fresh.reason}`:''}.`);
      btn.textContent='Sending order…';const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),22000);let response,data;
      try{response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',signal:ctrl.signal,body:JSON.stringify({customer:{name,phone,email},items:cart.map(({id,qty,name,modifiers})=>({id,qty,displayName:name,modifiers:Array.isArray(modifiers)?modifiers:[]})),fulfillment:mode,address:$('#deliveryAddress')?.value.trim()||'',distanceKm:mode==='delivery'?Number(dist?.value):0,requestedTime:$('#orderTime')?.value||'ASAP',payment,notes:$('#orderNotes')?.value.trim()||''})});const text=await response.text();try{data=text?JSON.parse(text):{}}catch{data={error:text||`Server returned ${response.status}`}}}finally{clearTimeout(timer)}
      if(!response.ok)throw new Error(data.error||'Could not send order.');const o=data.order;if(!o)throw new Error('Order was sent but the confirmation response was incomplete. Please call the restaurant before retrying.');
      const afterDiscount=Math.max(0,Number(o.subtotal||0)-Number(o.discount||0)),foodAfterTax=afterDiscount+Number(o.tax||0);$('#successBox').innerHTML=`<strong>Order received — ${esc(o.orderNo)}</strong><div class="success-bill"><div><span>Subtotal before tax</span><b>$${Number(o.subtotal||0).toFixed(2)}</b></div>${o.discount?`<div class="saved"><span>${esc(o.promotion||'Discount')}</span><b>−$${Number(o.discount||0).toFixed(2)}</b></div>`:''}<div><span>Subtotal after discount</span><b>$${afterDiscount.toFixed(2)}</b></div>${o.deliveryFee?`<div><span>Delivery fee</span><b>$${Number(o.deliveryFee||0).toFixed(2)}</b></div>`:''}<div><span>HST 13%</span><b>$${Number(o.tax||0).toFixed(2)}</b></div><div class="final"><span>FINAL TOTAL · TAX INCLUDED</span><b>$${Number(o.total||0).toFixed(2)}</b></div></div>${email?`Updates will be sent to <strong>${esc(email)}</strong> and <strong>${esc(phone)}</strong>.`:`Updates can be confirmed using <strong>${esc(phone)}</strong>.`} ${payment==='etransfer'?`Please call <strong>(519) 916-0879</strong> for e-transfer payment instructions and reference order <strong>${esc(o.orderNo)}</strong>.`:'Payment will be collected using your selected method.'}`;$('#successBox').classList.add('show');localStorage.removeItem('vietNomNomCart');updateCartBadge();renderCart();$('#successBox').scrollIntoView({behavior:'smooth',block:'center'});toast(`Order ${o.orderNo} sent successfully.`)
    }catch(err){const msg=err?.name==='AbortError'?'The order request took too long. Please check your connection and try again once.':(err.message||'Order could not be sent.');toast(msg);if(window.matchMedia('(max-width: 780px)').matches)window.__vietNomNomOpenMobileCart?.()}finally{btn.disabled=false;btn.textContent=original}
  })
}
function setupContact(){$('#contactForm')?.addEventListener('submit',e=>{e.preventDefault();toast('Message received locally. Connect email service before public launch.')})}
document.addEventListener('DOMContentLoaded',async()=>{setActiveNav();setupNav();setupExternalButtons();const orderRoot=$('#orderMenu');if(orderRoot)orderRoot.innerHTML='<p style="color:var(--muted)">Loading live menu…</p>';await loadPublicData();setupMenuTabs();updateCartBadge();setupOrderPage();setupContact()});

// V8 nested menu taxonomy
function renderFilteredMenu(group='All',subcategory='All'){
  const root=$('#menuGrid'); if(!root)return;
  let items=menuData;
  if(group!=='All')items=items.filter(x=>menuGroup(x.category)===group);
  if(subcategory!=='All')items=items.filter(x=>x.category===subcategory);
  root.innerHTML=items.map(item=>`<article class="menu-item ${item.soldOut?'soldout':''}"><div><div class="eyebrow">${esc(item.category)}</div><h3>${esc(item.name)}</h3><p>${esc(item.description||'Freshly prepared at Viet Nom Nom.')}</p><button class="add-btn" data-add="${item.id}" ${item.soldOut?'disabled':''}>${item.soldOut?'Sold Out':'Add to order'}</button></div>${priceMarkup(item)}</article>`).join('')||'<p class="menu-empty">No items in this section yet.</p>';bindAddButtons();
}
setupMenuTabs=function(){
  const major=$('#majorMenuTabs'),sub=$('#subMenuTabs'); if(!major)return;
  let activeMajor='All';
  const subgroups={'Vietnamese':['Bánh Mì','Combo','Summer Rolls','Vermicelli','Rice','Phở','Desserts']};
  function chooseMajor(g,btn){activeMajor=g;$$('[data-major]',major).forEach(x=>x.classList.toggle('active',x===btn));if(g==='All'){sub.hidden=true;sub.innerHTML='';renderFilteredMenu('All','All');return}const existing=(subgroups[g]||[]).filter(c=>menuData.some(x=>x.category===c));sub.hidden=false;sub.innerHTML=['All',...existing].map((c,i)=>`<button class="${i===0?'active':''}" data-sub="${esc(c)}">${esc(c)}</button>`).join('');$$('[data-sub]',sub).forEach(b=>b.onclick=()=>{$$('[data-sub]',sub).forEach(x=>x.classList.toggle('active',x===b));renderFilteredMenu(activeMajor,b.dataset.sub)});renderFilteredMenu(g,'All')}
  $$('[data-major]',major).forEach(b=>b.onclick=()=>chooseMajor(b.dataset.major,b));renderFilteredMenu('All','All');
}

// V11 resilient public data loader. A transient database/serverless hiccup no
// longer leaves the customer menu blank; the last successful menu is used as a
// short-lived browse-only fallback while the live API retries.
async function fetchJsonRetry(url,{timeoutMs=10000,retries=2}={}){
  let last;
  for(let i=0;i<=retries;i++){
    try{return await fetchJsonWithTimeout(url,timeoutMs)}catch(e){last=e;if(i<retries)await new Promise(r=>setTimeout(r,500*(i+1)))}
  }
  throw last;
}
loadPublicData=async function(){
  const cacheKey='vietNomNomLiveMenuV1';
  let cached=null;
  try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
  const menuTask=fetchJsonRetry('/api/public/menu',{timeoutMs:10000,retries:2}).then(m=>{
    menuData=Array.isArray(m.menu)?m.menu:[];publicPromos=Array.isArray(m.promotions)?m.promotions:[];weeklySpecialInfo=m.weeklySpecial||{};
    try{localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),menu:menuData,promotions:publicPromos,weeklySpecial:weeklySpecialInfo}))}catch{}
    refreshCartFromMenu();renderCart();return true;
  }).catch(e=>{
    console.error('Live menu load failed',e);
    const usable=cached&&Date.now()-Number(cached.at||0)<10*60*1000&&Array.isArray(cached.menu)&&cached.menu.length;
    if(usable){menuData=cached.menu;publicPromos=Array.isArray(cached.promotions)?cached.promotions:[];weeklySpecialInfo=cached.weeklySpecial||{};refreshCartFromMenu();toast('Live menu is reconnecting. Showing the latest saved menu.');return true}
    menuData=[];publicPromos=[];
    const root=$('#orderMenu')||$('#menuGrid');if(root)root.innerHTML='<p class="menu-empty">Live menu is temporarily unavailable. Please refresh in a moment.</p>';
    toast('Could not refresh the live menu.');return false;
  });
  fetchJsonRetry('/api/public/status',{timeoutMs:9000,retries:1}).then(s=>{storeStatus=s||{};renderStoreBanner()}).catch(e=>{
    console.error('Store status load failed',e);storeStatus={open:false,onlineOrderingEnabled:false,reason:'Live store status unavailable',notice:'Menu is still available to browse.'};renderStoreBanner();
  });
  return await menuTask;
};

// V11.1: refresh live menu pricing periodically so day-based weekly specials switch without a hard reload.
if(!window.__vietNomNomMenuTimer){window.__vietNomNomMenuTimer=setInterval(()=>{if(!document.hidden&&($('#orderMenu')||$('#menuGrid')))loadPublicData().then(()=>{setupMenuTabs();if($('#orderMenu'))renderOrderBrowseMenu();renderCart()}).catch(()=>{})},60000)}

// V11.12 — consolidated dropdown variants for customer menu/order flow.
function variantVM(){return window.VietNomNomMenuVariants||null}
function variantSelectionsFromCard(card){const out={};card?.querySelectorAll('[data-variant-control]').forEach(s=>out[s.dataset.variantControl]=s.value);return out}
function variantFamilyOptionsHtml(family,defaults={}){return family.controls.map(c=>`<label class="variant-field"><span>${esc(c.label)}</span><select data-variant-control="${esc(c.key)}">${c.options.map(o=>`<option value="${esc(o.value)}" ${String(defaults[c.key])===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}
function variantPriceText(item){return item?`$${Number(item.price||0).toFixed(2)}`:'—'}
function syncCustomerVariantCard(card){
  const vm=variantVM();if(!vm||!card)return null;const key=card.dataset.familyKey,selections=variantSelectionsFromCard(card),family=vm.family(key);if(!family)return null;
  family.controls.forEach(c=>{const select=card.querySelector(`[data-variant-control="${c.key}"]`);if(!select)return;const states=vm.optionState(menuData,key,c.key,selections);[...select.options].forEach(opt=>{const state=states.find(x=>String(x.value)===String(opt.value));opt.disabled=!!state?.disabled})});
  let resolved=vm.resolveAvailable(menuData,key,selections);
  if(resolved){family.controls.forEach(c=>{const s=card.querySelector(`[data-variant-control="${c.key}"]`);if(s&&resolved.variant.values[c.key]!=null)s.value=resolved.variant.values[c.key]})}
  const price=card.querySelector('[data-variant-price]'),summary=card.querySelector('[data-variant-summary]'),desc=card.querySelector('[data-variant-description]'),btn=card.querySelector('[data-variant-add]');
  if(price)price.textContent=resolved?variantPriceText(resolved.item):'Unavailable';
  if(summary)summary.textContent=resolved?resolved.displayName:'No available option';
  if(desc)desc.textContent=resolved?(resolved.description||resolved.item.description||family.description):family.description;
  const unavailable=!resolved||resolved.item.active===false||resolved.item.soldOut;
  if(btn){btn.disabled=unavailable;btn.textContent=unavailable?'Sold Out':'Add to order'}
  return resolved;
}
function customerVariantCard(entry){
  const vm=variantVM(),family=vm?.family(entry.key),defs=vm?.defaults(menuData,entry.key)||{};if(!family)return'';
  return `<article class="menu-item variant-menu-item ${entry.soldOut?'soldout':''}" data-family-key="${esc(entry.key)}"><div><div class="eyebrow">${esc(entry.category)}</div><h3>${esc(entry.title)}</h3><p class="variant-description" data-variant-description>${esc(entry.description||'Choose your options below.')}</p><div class="variant-controls">${variantFamilyOptionsHtml(family,defs)}</div><div class="variant-summary" data-variant-summary></div><button type="button" class="add-btn variant-add-btn" data-variant-add>Add to order</button></div><div class="price variant-price-current" data-variant-price>${esc(vm.priceLabel(entry))}</div></article>`
}
function customerEntryCard(entry){if(entry.kind==='family')return customerVariantCard(entry);const item=entry.item;return `<article class="menu-item ${item.soldOut?'soldout':''}"><div><div class="eyebrow">${esc(item.category)}</div><h3>${esc(item.name)}</h3><p>${esc(item.description||'Freshly prepared at Viet Nom Nom.')}</p><button type="button" class="add-btn" data-add="${item.id}" ${item.soldOut?'disabled':''}>${item.soldOut?'Sold Out':'Add to order'}</button></div>${priceMarkup(item)}</article>`}
function renderVariantEntryList(root,entries){root.innerHTML=entries.map(customerEntryCard).join('')||'<p class="menu-empty">No matching menu items.</p>';bindAddButtons();root.querySelectorAll('[data-family-key]').forEach(syncCustomerVariantCard)}
function visibleVariantEntries({group='All',subcategory='All',q='' }={}){const vm=variantVM();if(!vm)return[];let entries=vm.build(menuData);if(group!=='All')entries=entries.filter(e=>menuGroup(e.category)===group);if(subcategory!=='All')entries=entries.filter(e=>e.category===subcategory);q=String(q||'').trim().toLowerCase();if(q)entries=entries.filter(e=>e.searchText.includes(q));return entries}
renderFilteredMenu=function(group='All',subcategory='All'){const root=$('#menuGrid');if(!root)return;renderVariantEntryList(root,visibleVariantEntries({group,subcategory}))};
renderMenuGroup=function(target='#menuGrid',group='All'){const root=$(target);if(!root)return;renderVariantEntryList(root,visibleVariantEntries({group}))};
renderOrderBrowseMenu=function(){const root=$('#orderMenu');if(!root)return;const q=$('#orderSearch')?.value||'',group=$('#orderGroup')?.value||'All';renderVariantEntryList(root,visibleVariantEntries({group,q}))};
function addResolvedCustomerItem(resolved){if(!resolved)return;const item=resolved.item;if(item.soldOut||item.active===false)return toast(`${resolved.displayName} is sold out.`);const cart=getCart(),key=resolved.cartKey,row=cart.find(x=>(x.cartKey||x.id)===key),base=Number(item.basePrice??item.price),price=Number(item.price);if(row)row.qty++;else cart.push({id:item.id,cartKey:key,name:resolved.displayName,category:item.category,price,basePrice:base,weeklySpecial:item.weeklySpecial||null,qty:1});saveCart(cart);toast(`${resolved.displayName} added to your order.`);renderCart();const bar=$('#mobileCartBar');if(bar&&window.matchMedia('(max-width: 780px)').matches){bar.hidden=false;bar.classList.remove('cart-bump');void bar.offsetWidth;bar.classList.add('cart-bump')}}
addToCart=function(id){const item=menuData.find(x=>x.id===id);if(!item)return;addResolvedCustomerItem({item,displayName:item.name,cartKey:item.id})};
bindAddButtons=function(){
  $$('[data-add]').forEach(btn=>btn.onclick=()=>addToCart(btn.dataset.add));
  $$('[data-family-key]').forEach(card=>{card.querySelectorAll('[data-variant-control]').forEach(s=>s.onchange=()=>syncCustomerVariantCard(card));const btn=card.querySelector('[data-variant-add]');if(btn)btn.onclick=()=>addResolvedCustomerItem(syncCustomerVariantCard(card))})
};
function liveVariantCartPrice(live,row){const base=Number(live?.price||0),id=String(live?.id||''),name=String(row?.name||'').toLowerCase();if(!(id==='pad-thai'||id.startsWith('wok-')))return base;if(/\b(chicken|pork)\b/.test(name))return base+1;if(/\b(beef|shrimp)\b/.test(name))return base+2;return base}
refreshCartFromMenu=function(){let cart=getCart(),changed=false;cart=cart.map(row=>{const live=menuData.find(m=>m.id===row.id);if(!live||!live.active||live.soldOut){changed=true;return null}const base=Number(live.basePrice??live.price),price=liveVariantCartPrice(live,row),isVariant=String(row.cartKey||'').includes('::');const name=isVariant?(row.name||live.name):live.name,cartKey=row.cartKey||row.id;if(row.price!==price||row.basePrice!==base||row.name!==name||row.cartKey!==cartKey)changed=true;return {...row,id:live.id,name,cartKey,category:live.category,price,basePrice:base,weeklySpecial:live.weeklySpecial||null}}).filter(Boolean);if(changed)saveCart(cart)};
changeQty=function(key,delta){let cart=getCart(),row=cart.find(x=>(x.cartKey||x.id)===key);if(!row)return;row.qty+=delta;cart=cart.filter(x=>x.qty>0);saveCart(cart);renderCart()};
renderCart=function(){
  const root=$('#cartItems');if(!root)return;const cart=getCart();let specialRow=$('#cartWeeklySpecial');if(!specialRow){specialRow=document.createElement('div');specialRow.id='cartWeeklySpecial';specialRow.className='cart-special-row';const total=$('#cartTotal')?.closest('.total-row');total?.insertAdjacentElement('afterend',specialRow)}
  if(!cart.length){root.innerHTML='<p style="color:var(--muted)">Your cart is empty. Add a few favourites from the menu.</p>';$('#cartTotal').textContent='$0.00';specialRow.hidden=true;updateMobileCartBar();return}
  root.innerHTML=cart.map(x=>{const base=Number(x.basePrice??x.price),sale=Number(x.price),isSpecial=x.weeklySpecial&&base>sale,key=x.cartKey||x.id;return `<div class="cart-line"><div><strong>${esc(x.name)}</strong><small>${isSpecial?`<span class="cart-old-price">$${base.toFixed(2)}</span> <b>$${sale.toFixed(2)} each</b> · ${esc(x.weeklySpecial.label||'Weekly Special')}`:`$${sale.toFixed(2)} each`}</small></div><div><strong>$${(sale*x.qty).toFixed(2)}</strong><div class="qty"><button type="button" data-cart-key="${esc(key)}" data-delta="-1">−</button><span>${x.qty}</span><button type="button" data-cart-key="${esc(key)}" data-delta="1">+</button></div></div></div>`}).join('');
  $$('[data-cart-key]').forEach(b=>b.onclick=()=>changeQty(b.dataset.cartKey,Number(b.dataset.delta)));const final=cart.reduce((sum,x)=>sum+Number(x.price)*x.qty,0),estimatedTax=final*.13,estimatedTotal=final+estimatedTax;$('#cartTotal').textContent='$'+final.toFixed(2);specialRow.hidden=false;specialRow.innerHTML=`<div class="checkout-breakdown-row"><span>HST 13%</span><strong>$${estimatedTax.toFixed(2)}</strong></div><div class="checkout-breakdown-row total-due"><span>Estimated total</span><strong>$${estimatedTotal.toFixed(2)}</strong></div>`;updateMobileCartBar()
};

// V11.15 — customer item customizer, clearer checkout totals, and pork +$1 pricing.
let pendingCustomizationV115=null;
function customizationEligibleV115(resolved){
  const item=resolved?.item;if(!item)return false;
  const cat=String(item.category||'').toLowerCase(),name=String(resolved.displayName||item.name||'').toLowerCase();
  if(cat.includes('dessert')||cat.includes('drink'))return false;
  if(/coffee|soda|pepsi|coke|sprite|water|lemonade|juice/.test(name))return false;
  return true;
}
const PACKAGED_BEVERAGE_IDS_V1137=new Set(['drink-coke','drink-pepsi','drink-water','drink-diet-coke','drink-diet-pepsi']);
function icePreferenceEligibleV1135(resolved){
  const item=resolved?.item;if(!item)return false;
  if(PACKAGED_BEVERAGE_IDS_V1137.has(String(item.id||'')))return false;
  const cat=String(item.category||'').toLowerCase(),name=String(resolved.displayName||item.name||'').toLowerCase();
  return cat.includes('dessert')||cat.includes('drink')||/coffee|soda|pop|pepsi|coke|sprite|water|lemonade|juice|tea|smoothie/.test(name);
}
function packingLabelV1135(v){return ({None:'No utensils or napkins',Utensils:'Utensils only',Napkins:'Napkins only',Both:'Utensils & napkins'})[String(v||'')]||''}
function banhMiPreferenceEligibleV1138(resolved){
  const item=resolved?.item;if(!item)return false;
  const plain=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const cat=plain(item.category),name=plain(resolved.displayName||item.name||'');
  return cat.includes('banh mi')||name.includes('banh mi');
}
function customizationSelectionsV115(){
  const ice=$('#customizerIceSectionV1135')?.hidden?'':($('input[name="customIce"]:checked')?.value||'');
  const banhMiSection=$('#customizerBanhMiSectionV1138'),banhMiActive=banhMiSection&&!banhMiSection.hidden;
  const pickles=banhMiActive?($('input[name="customBanhMiPicklesV1138"]:checked')?.value||''):'';
  const toastBread=banhMiActive?($('input[name="customBanhMiToastV1138"]:checked')?.value||''):'';
  const spice=$('input[name="customSpice"]:checked')?.value||'';
  const removals=$$('#customizerRemovals input:checked').map(x=>x.value);
  const alerts=$$('#customizerAlerts input:checked').map(x=>`⚠ ALLERGY: ${x.value}`);
  const pregnancy=$$('#customizerPregnancy input:checked').map(x=>`Pregnancy: ${x.value}`);
  const note=$('#customizerNote')?.value.trim();
  return [ice?`Ice: ${ice}`:'',pickles?`Pickled veggies: ${pickles}`:'',toastBread?`Bread: ${toastBread}`:'',spice?`Spice: ${spice}`:'',...removals,...alerts,...pregnancy,note?`Item note: ${note}`:''].filter(Boolean);
}
function modifierSignatureV115(modifiers){return (modifiers||[]).join('|').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,180)}
function commitResolvedCustomerItemV115(resolved,modifiers=[]){
  if(!resolved)return;const item=resolved.item;if(item.soldOut||item.active===false)return toast(`${resolved.displayName} is sold out.`);
  const cart=getCart(),sig=modifierSignatureV115(modifiers),key=sig?`${resolved.cartKey}::mods::${sig}`:resolved.cartKey,row=cart.find(x=>(x.cartKey||x.id)===key),base=Number(item.basePrice??item.price),price=Number(item.price);
  if(row)row.qty++;else cart.push({id:item.id,cartKey:key,name:resolved.displayName,category:item.category,price,basePrice:base,weeklySpecial:item.weeklySpecial||null,modifiers:[...modifiers],qty:1});
  saveCart(cart);toast(`${resolved.displayName} added to your order.`);renderCart();const bar=$('#mobileCartBar');if(bar&&window.matchMedia('(max-width: 780px)').matches){bar.hidden=false;bar.classList.remove('cart-bump');void bar.offsetWidth;bar.classList.add('cart-bump')}
}
function closeCustomizerV115(){const modal=$('#itemCustomizer');if(!modal)return;modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('customizer-open');pendingCustomizationV115=null}
function openCustomizerV115(resolved){
  setupCustomizerV115();
  const modal=$('#itemCustomizer');if(!modal)return commitResolvedCustomerItemV115(resolved,[]);
  const fullFoodOptions=customizationEligibleV115(resolved),iceOptions=icePreferenceEligibleV1135(resolved),banhMiOptions=banhMiPreferenceEligibleV1138(resolved);
  pendingCustomizationV115=resolved;$('#customizerTitle').textContent=resolved.displayName||resolved.item.name;$('#customizerDescription').textContent=(banhMiOptions?'Choose the Bánh Mì preparation preferences below.':resolved.description||resolved.item.description||(fullFoodOptions?'Choose any optional preferences for this item.':iceOptions?'Choose your ice preference, then add any special note.':'Add any special note for this item.'));$('#customizerPrice').textContent=`$${Number(resolved.item.price||0).toFixed(2)}`;
  const foodOnlySections=['#customizerSpice','#customizerRemovals','#customizerPregnancy','#customizerAlerts'];foodOnlySections.forEach(sel=>{const section=$(sel)?.closest('.customizer-section');if(section)section.hidden=!fullFoodOptions});const iceSection=$('#customizerIceSectionV1135');if(iceSection)iceSection.hidden=!iceOptions;const banhMiSection=$('#customizerBanhMiSectionV1138');if(banhMiSection)banhMiSection.hidden=!banhMiOptions;modal.classList.toggle('simple-note-mode-v1132',!fullFoodOptions);
  $$('input[name="customIce"],input[name="customBanhMiPicklesV1138"],input[name="customBanhMiToastV1138"]').forEach(x=>x.checked=false);$$('input[name="customSpice"]').forEach(x=>x.checked=x.value==='');$$('#customizerRemovals input,#customizerAlerts input,#customizerPregnancy input').forEach(x=>x.checked=false);if($('#customerAllergyAttention'))$('#customerAllergyAttention').hidden=true;if($('#customizerNote'))$('#customizerNote').value='';
  modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('customizer-open');setTimeout(()=>$('#customizerNote')?.focus({preventScroll:true}),30)
}
addResolvedCustomerItem=function(resolved){if(!resolved)return;openCustomizerV115(resolved)};

function setupCustomizerV115(){
  const modal=$('#itemCustomizer');if(!modal||modal.dataset.ready)return;modal.dataset.ready='1';
  modal.querySelectorAll('[data-customizer-close]').forEach(x=>x.addEventListener('click',closeCustomizerV115));
  $('#customizerAdd')?.addEventListener('click',()=>{if(!pendingCustomizationV115)return;const r=pendingCustomizationV115;if(icePreferenceEligibleV1135(r)&&!$('input[name="customIce"]:checked')){toast('Please choose: ice together in cup or ice on the side.');$('#customizerIceSectionV1135')?.scrollIntoView({behavior:'smooth',block:'center'});return}if(banhMiPreferenceEligibleV1138(r)){const pickles=$('input[name="customBanhMiPicklesV1138"]:checked'),toastBread=$('input[name="customBanhMiToastV1138"]:checked');if(!pickles||!toastBread){toast('Please choose the Bánh Mì pickled veggies and bread-toasting preferences.');$('#customizerBanhMiSectionV1138')?.scrollIntoView({behavior:'smooth',block:'center'});return}}const mods=customizationSelectionsV115();closeCustomizerV115();commitResolvedCustomerItemV115(r,mods)});
  const syncAllergyAttention=()=>{const box=$('#customerAllergyAttention'),count=$$('#customizerAlerts input:checked').length;if(box){box.hidden=count===0;box.querySelector('span').textContent=count?`${count} allergy/dietary alert${count===1?'':'s'} selected — this will be highlighted prominently for our staff and kitchen.`:'Your allergy note will be highlighted prominently for our staff and kitchen.'}};
  $$('#customizerAlerts input').forEach(x=>x.addEventListener('change',syncAllergyAttention));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeCustomizerV115()});
}

renderCart=function(){
  const root=$('#cartItems');if(!root)return;setupCustomizerV115();const cart=getCart();let summary=$('#cartWeeklySpecial');if(!summary){summary=document.createElement('div');summary.id='cartWeeklySpecial';summary.className='cart-special-row';const total=$('#cartTotal')?.closest('.total-row');total?.insertAdjacentElement('afterend',summary)}
  if(!cart.length){root.innerHTML='<p style="color:var(--muted)">Your cart is empty. Add a few favourites from the menu.</p>';$('#cartTotal').textContent='$0.00';summary.hidden=true;updateMobileCartBar();return}
  root.innerHTML=cart.map(x=>{const base=Number(x.basePrice??x.price),sale=Number(x.price),isSpecial=x.weeklySpecial&&base>sale,key=x.cartKey||x.id,mods=Array.isArray(x.modifiers)?x.modifiers:[];return `<div class="cart-line"><div><strong>${esc(x.name)}</strong><small>${isSpecial?`<span class="cart-old-price">$${base.toFixed(2)}</span> <b>$${sale.toFixed(2)} each</b> · ${esc(x.weeklySpecial.label||'Weekly Special')}`:`$${sale.toFixed(2)} each`}</small>${mods.length?`<div class="cart-item-modifiers">${mods.map(m=>`<span class="${/allergy|gluten|msg|canola/i.test(m)?'alert':/^Pregnancy:/i.test(m)?'pregnancy':''}">${esc(m)}</span>`).join('')}</div>`:''}</div><div><strong>$${(sale*x.qty).toFixed(2)}</strong><div class="qty"><button type="button" data-cart-key="${esc(key)}" data-delta="-1">−</button><span>${x.qty}</span><button type="button" data-cart-key="${esc(key)}" data-delta="1">+</button></div></div></div>`}).join('');
  $$('[data-cart-key]').forEach(b=>b.onclick=()=>changeQty(b.dataset.cartKey,Number(b.dataset.delta)));
  const foodSubtotal=cart.reduce((sum,x)=>sum+Number(x.price)*x.qty,0),mode=$('input[name="fulfillment"]:checked')?.value||'pickup',km=Number($('#deliveryDistance')?.value)||0,delivery=mode==='delivery'?calcDeliveryFee(km):0,tax=foodSubtotal*.13,foodTotalAfterTax=foodSubtotal+tax,total=foodTotalAfterTax+delivery;
  $('#cartTotal').textContent='$'+foodSubtotal.toFixed(2);summary.hidden=false;summary.innerHTML=`<div class="checkout-breakdown-row"><span>HST 13%</span><strong>$${tax.toFixed(2)}</strong></div><div class="checkout-breakdown-row food-after-tax"><span>Food total after tax</span><strong>$${foodTotalAfterTax.toFixed(2)}</strong></div>${delivery?`<div class="checkout-breakdown-row delivery-nontax"><span>Delivery fee <small>not taxed</small></span><strong>+$${delivery.toFixed(2)}</strong></div>`:''}<div class="checkout-breakdown-row total-due"><span>FINAL TOTAL</span><strong>$${total.toFixed(2)}</strong></div>`;
  updateMobileCartBar()
};

// Setup customizer even if the order page is already initialized from cached assets.
document.addEventListener('DOMContentLoaded',setupCustomizerV115);

// V11.16 — scheduled/pre-orders, delivery-only policy/payment, and clearer checkout flow.
function torontoNowV116(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,stamp:`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`};
}
function weekdayForDateV116(dateStr){
  try{return new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'America/Toronto'}).format(new Date(`${dateStr}T12:00:00Z`)).toLowerCase()}catch{return''}
}
function minutesV116(t){const [h,m]=String(t||'00:00').split(':').map(Number);return (h||0)*60+(m||0)}
function scheduleValidationV116(dateStr,timeStr){
  if(!dateStr||!timeStr)return {ok:false,message:'Choose both a date and time.'};
  const now=torontoNowV116(),stamp=`${dateStr}T${timeStr}`;if(stamp<now.stamp)return {ok:false,message:'Please choose a future time.'};
  const day=weekdayForDateV116(dateStr),h=storeStatus?.hours?.[day];if(!h||h.closed)return {ok:false,message:`Viet Nom Nom is closed on ${day?day[0].toUpperCase()+day.slice(1):'that day'}. Choose another date.`};
  const mins=minutesV116(timeStr),open=minutesV116(h.open),close=minutesV116(h.close);if(mins<open||mins>=close)return {ok:false,message:`Choose a time during opening hours: ${h.open}–${h.close}.`};
  return {ok:true,message:`Scheduled for ${dateStr} at ${timeStr} · open ${h.open}–${h.close}.`};
}
function syncScheduleUIV116(){
  const mode=$('#orderTimingMode')?.value||'asap',fields=$('#scheduleFields'),date=$('#orderDate'),time=$('#orderClock'),hidden=$('#orderTime'),hint=$('#scheduleHoursHint'),chip=$('#scheduleStatusChip');
  if(!fields||!hidden)return;
  fields.hidden=mode!=='scheduled';
  if(mode==='scheduled'){
    const v=scheduleValidationV116(date?.value||'',time?.value||'');hidden.value=(date?.value&&time?.value)?`${date.value}T${time.value}`:'';
    if(hint){hint.textContent=v.message;hint.className='schedule-hours-hint '+(v.ok?'ok':'error')}
    if(chip){chip.textContent='PRE-ORDER';chip.className='schedule-status-chip scheduled'}
  }else{
    hidden.value='ASAP';if(hint){hint.textContent='';hint.className='schedule-hours-hint'}if(chip){chip.textContent='ASAP';chip.className='schedule-status-chip'}
  }
}
function applyStoreStateToScheduleV116(){
  const timing=$('#orderTimingMode'),availability=$('#orderAvailabilityMessage'),chip=$('#scheduleStatusChip');if(!timing)return;
  const asap=[...timing.options].find(o=>o.value==='asap'),known=typeof storeStatus?.open==='boolean'&&typeof storeStatus?.onlineOrderingEnabled==='boolean';
  const orderingEnabled=storeStatus?.onlineOrderingEnabled!==false;
  if(asap)asap.disabled=known&&!storeStatus.open;
  if(known&&!storeStatus.open&&timing.value==='asap')timing.value='scheduled';
  if(known&&!storeStatus.open&&chip){chip.textContent='PRE-ORDER';chip.className='schedule-status-chip closed'}
  if(availability){
    if(!known){availability.className='order-availability';availability.textContent='';}
    else{availability.className='order-availability show '+(orderingEnabled?(storeStatus.open?'open':'closed'):'closed');availability.textContent=!orderingEnabled?'Online ordering is temporarily disabled.':storeStatus.open?'Ordering is open now. Choose ASAP or schedule a future order.':`We are currently closed${storeStatus.reason?` · ${storeStatus.reason}`:''}. Pre-orders are welcome — choose a future date and time during opening hours. The Staff alert will activate when your scheduled time arrives.`;}
  }
  syncScheduleUIV116();
}
function setupScheduleInputsV116(){
  const timing=$('#orderTimingMode'),date=$('#orderDate'),time=$('#orderClock');if(!timing||timing.dataset.ready)return;timing.dataset.ready='1';
  const now=torontoNowV116();if(date){date.min=now.date;const max=new Date(Date.now()+45*86400000);date.max=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(max);if(!date.value)date.value=now.date}
  if(time&&!time.value)time.value='11:00';
  timing.addEventListener('change',syncScheduleUIV116);date?.addEventListener('change',syncScheduleUIV116);time?.addEventListener('change',syncScheduleUIV116);
  applyStoreStateToScheduleV116();
  currentOrderingStatus().then(()=>applyStoreStateToScheduleV116()).catch(()=>{});
}

setupOrderPage=function(){
  if(!$('#orderMenu'))return;
  renderOrderBrowseMenu();renderCart();setupMobileOrderDrawer();setupCustomizerV115();setupScheduleInputsV116();
  $('#orderSearch')?.addEventListener('input',renderOrderBrowseMenu);$('#orderGroup')?.addEventListener('change',renderOrderBrowseMenu);
  const fulfillment=$$('input[name="fulfillment"]'),addressWrap=$('#addressWrap'),pickupPay=$('#pickupPayments'),deliveryPay=$('#deliveryPayments'),dist=$('#deliveryDistance'),estimate=$('#deliveryEstimate'),maps=$('#mapsCheck');
  function syncDeliveryEstimate(){const km=Number(dist?.value)||0,fee=calcDeliveryFee(km);if(estimate)estimate.innerHTML=km>0?`Estimated delivery fee: <strong>$${fee.toFixed(2)}</strong><small>Staff will verify the route before final completion. Delivery fee is added after food HST and is not included in the tax calculation.</small>`:'Enter your estimated distance to see the delivery fee.';const addr=$('#deliveryAddress')?.value?.trim()||'';if(maps)maps.href=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('6645 Tecumseh Rd E, Windsor, ON N8T 1E7')}&destination=${encodeURIComponent(addr)}`;renderCart()}
  function syncFulfillment(){
    const mode=$('input[name="fulfillment"]:checked')?.value||'pickup',isDelivery=mode==='delivery';
    if(addressWrap)addressWrap.style.display=isDelivery?'grid':'none';if(pickupPay)pickupPay.style.display=isDelivery?'none':'grid';if(deliveryPay)deliveryPay.style.display=isDelivery?'grid':'none';
    const payTitle=$('#restaurantPaymentTitle');if(payTitle)payTitle.textContent=mode==='dine-in'?'Payment — Dine-in':'Payment — Pickup';
    // E-transfer exists only for Viet Nom Nom delivery. Dine-in and pickup remain counter payment only.
    const wanted=isDelivery?'cash-driver':'counter';$$('input[name="payment"]').forEach(r=>{if(r.closest('#deliveryPayments'))r.disabled=!isDelivery;else if(r.closest('#pickupPayments'))r.disabled=isDelivery});
    const current=$('input[name="payment"]:checked');if(!current||current.disabled){const fallback=$(`input[name="payment"][value="${wanted}"]:not(:disabled)`);if(fallback)fallback.checked=true}
    syncDeliveryEstimate();renderCart();
  }
  fulfillment.forEach(x=>x.addEventListener('change',syncFulfillment));dist?.addEventListener('input',syncDeliveryEstimate,{passive:true});$('#deliveryAddress')?.addEventListener('input',syncDeliveryEstimate,{passive:true});syncFulfillment();
  $('#placeOrder')?.addEventListener('click',async()=>{
    const cart=getCart();if(!cart.length){toast('Please add at least one item first.');return}
    const name=$('#customerName')?.value.trim()||'',phone=$('#customerPhone')?.value.trim()||'',email=$('#customerEmail')?.value.trim()||'',mode=$('input[name="fulfillment"]:checked')?.value||'pickup',payment=$('input[name="payment"]:checked:not(:disabled)')?.value||'',timing=$('#orderTimingMode')?.value||'asap';
    if(!name)return focusOrderField($('#customerName'),'Please enter your name.');if(!phone)return focusOrderField($('#customerPhone'),'Please enter your phone number.');if(email&&!$('#customerEmail').checkValidity())return focusOrderField($('#customerEmail'),'Please enter a valid email address.');
    if(mode==='delivery'&&!$('#deliveryAddress')?.value.trim())return focusOrderField($('#deliveryAddress'),'Please enter a delivery address.');if(mode==='delivery'&&!(Number(dist?.value)>0))return focusOrderField(dist,'Please enter the estimated distance in km.');if(!payment)return focusOrderField(mode==='delivery'?$('#deliveryPayments input'):$('#pickupPayments input'),'Please choose a payment method.');
    if(timing==='scheduled'){const sv=scheduleValidationV116($('#orderDate')?.value||'',$('#orderClock')?.value||'');if(!sv.ok)return focusOrderField($('#orderDate'),sv.message)}
    const requestedTime=timing==='scheduled'?`${$('#orderDate').value}T${$('#orderClock').value}`:'ASAP';
    const btn=$('#placeOrder'),original=btn.textContent;btn.disabled=true;btn.textContent='Checking order…';
    try{
      const fresh=await currentOrderingStatus();applyStoreStateToScheduleV116();if(fresh&&fresh.onlineOrderingEnabled===false)throw new Error('Online ordering is temporarily disabled.');if(requestedTime==='ASAP'&&fresh&&fresh.open===false)throw new Error(`We are currently closed${fresh.reason?` · ${fresh.reason}`:''}. Please choose Schedule / pre-order.`);
      btn.textContent='Sending order…';const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),22000);let response,data;
      try{response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',signal:ctrl.signal,body:JSON.stringify({customer:{name,phone,email},items:cart.map(({id,qty,name,modifiers})=>({id,qty,displayName:name,modifiers:Array.isArray(modifiers)?modifiers:[]})),fulfillment:mode,address:$('#deliveryAddress')?.value.trim()||'',distanceKm:mode==='delivery'?Number(dist?.value):0,requestedTime,payment,notes:$('#orderNotes')?.value.trim()||''})});const text=await response.text();try{data=text?JSON.parse(text):{}}catch{data={error:text||`Server returned ${response.status}`}}}finally{clearTimeout(timer)}
      if(!response.ok)throw new Error(data.error||'Could not send order.');const o=data.order;if(!o)throw new Error('Order was sent but the confirmation response was incomplete. Please call the restaurant before retrying.');
      const afterDiscount=Math.max(0,Number(o.subtotal||0)-Number(o.discount||0)),foodAfterTax=afterDiscount+Number(o.tax||0);$('#successBox').innerHTML=`<strong>${requestedTime==='ASAP'?'Order received':'Pre-order received'} — ${esc(o.orderNo)}</strong>${requestedTime!=='ASAP'?`<div class="scheduled-confirmation">Requested for <b>${esc(requestedTime.replace('T',' at '))}</b>. Staff alert will activate when this scheduled time arrives.</div>`:''}<div class="success-bill"><div><span>Subtotal before tax</span><b>$${Number(o.subtotal||0).toFixed(2)}</b></div>${Number(o.discount||0)>0?`<div class="saved"><span>${esc(o.promotion||'Discount')}</span><b>−$${Number(o.discount||0).toFixed(2)}</b></div>`:''}<div><span>Subtotal after discount</span><b>$${afterDiscount.toFixed(2)}</b></div><div><span>HST 13% on food</span><b>$${Number(o.tax||0).toFixed(2)}</b></div><div><span>Food total after tax</span><b>$${foodAfterTax.toFixed(2)}</b></div>${o.deliveryFee?`<div class="delivery-nontax"><span>Delivery fee <small>not taxed</small></span><b>+$${Number(o.deliveryFee||0).toFixed(2)}</b></div>`:''}<div class="final"><span>FINAL TOTAL</span><b>$${Number(o.total||0).toFixed(2)}</b></div></div>Updates will be sent to <strong>${esc(email)}</strong> and <strong>${esc(phone)}</strong>. ${payment==='etransfer'?`Please e-transfer <strong>$${Number(o.total||0).toFixed(2)}</strong> to <strong></strong> (Account name: <strong>Viet Nom Nom</strong>) and put <strong>${esc(o.orderNo)}</strong> in the message.`:'Payment will be collected using your selected method.'}`;
      $('#successBox').classList.add('show');localStorage.removeItem('vietNomNomCart');updateCartBadge();renderCart();$('#successBox').scrollIntoView({behavior:'smooth',block:'center'});toast(`${requestedTime==='ASAP'?'Order':'Pre-order'} ${o.orderNo} sent successfully.`)
    }catch(err){const msg=err?.name==='AbortError'?'The order request took too long. Please check your connection and try again once.':(err.message||'Order could not be sent.');toast(msg);if(window.matchMedia('(max-width:780px)').matches)window.__vietNomNomOpenMobileCart?.()}finally{btn.disabled=false;btn.textContent=original}
  });
};

// Keep the price breakdown as one clean vertical stack.
const renderCartV115Base=renderCart;
renderCart=function(){
  renderCartV115Base();
  const subtotal=$('#cartTotal')?.closest('.checkout-subtotal-row'),summary=$('#cartWeeklySpecial'),stack=$('.checkout-totals-stack');if(stack&&subtotal&&subtotal.parentElement===stack&&summary&&summary.parentElement!==stack)stack.appendChild(summary);
};

// V11.21 — customer checkout handoff + draft restore.
const CHECKOUT_DRAFT_KEY_V1120='vietNomNomCheckoutDraftV1';
function currentCheckoutDraftV1120(){try{return JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY_V1120)||'null')}catch{return null}}
function saveCheckoutDraftV1120(draft){localStorage.setItem(CHECKOUT_DRAFT_KEY_V1120,JSON.stringify(draft))}
function collectCheckoutDraftV1120(){
  const cart=getCart(),timing=$('#orderTimingMode')?.value||'asap',mode=$('input[name="fulfillment"]:checked')?.value||'pickup';
  const requestedTime=timing==='scheduled'&&$('#orderDate')?.value&&$('#orderClock')?.value?`${$('#orderDate').value}T${$('#orderClock').value}`:'ASAP';
  return {
    version:'11.40.0',savedAt:new Date().toISOString(),
    customer:{name:$('#customerName')?.value.trim()||'',phone:$('#customerPhone')?.value.trim()||'',email:$('#customerEmail')?.value.trim()||''},
    items:cart.map(x=>{const cat=String(x.category||'').toLowerCase(),isDrinkDessert=cat.includes('drink')||cat.includes('dessert');const mods=(Array.isArray(x.modifiers)?x.modifiers:[]).filter(m=>!(isDrinkDessert&&/allergy|gluten|no msg|canola/i.test(String(m))));return {...x,modifiers:mods}}),
    fulfillment:mode,address:$('#deliveryAddress')?.value.trim()||'',distanceKm:mode==='delivery'?(Number($('#deliveryDistance')?.value)||0):0,
    requestedTime,payment:$('input[name="payment"]:checked:not(:disabled)')?.value||'',packingPreference:$('input[name="packingPreference"]:checked')?.value||'',notes:$('#orderNotes')?.value.trim()||''
  };
}
function validateCheckoutDraftV1120(d){
  if(!d.items?.length)return 'Please add at least one item first.';
  if(!d.customer?.name)return 'Please enter your name.';
  if(!d.customer?.phone)return 'Please enter your phone number.';
  if(d.customer?.email&&!/^\S+@\S+\.\S+$/.test(d.customer.email))return 'Please enter a valid email address or leave it blank.';
  if(d.fulfillment==='delivery'&&!d.address)return 'Please enter a delivery address.';
  if(d.fulfillment==='delivery'&&!(Number(d.distanceKm)>0))return 'Please enter the estimated delivery distance.';
  if(!d.payment)return 'Please choose a payment method.';
  if(!d.packingPreference)return 'Please choose whether you want utensils, napkins, both, or neither.';
  if(d.requestedTime!=='ASAP'){
    const [date,time]=String(d.requestedTime).split('T'),v=scheduleValidationV116(date,time);if(!v.ok)return v.message;
  }
  return '';
}
function restoreCheckoutDraftV1120(){
  if(!$('#continueCheckout'))return;const d=currentCheckoutDraftV1120();if(!d)return;
  if(!getCart().length&&Array.isArray(d.items)&&d.items.length)saveCart(d.items.map(x=>({...x,modifiers:Array.isArray(x.modifiers)?x.modifiers:[]})));
  if($('#customerName')&&!$('#customerName').value)$('#customerName').value=d.customer?.name||'';
  if($('#customerPhone')&&!$('#customerPhone').value)$('#customerPhone').value=d.customer?.phone||'';
  if($('#customerEmail')&&!$('#customerEmail').value)$('#customerEmail').value=d.customer?.email||'';
  if($('#orderNotes')&&!$('#orderNotes').value)$('#orderNotes').value=d.notes||'';
  const pack=$(`input[name="packingPreference"][value="${CSS.escape(d.packingPreference||'')}"]`);if(pack)pack.checked=true;
  const f=$(`input[name="fulfillment"][value="${CSS.escape(d.fulfillment||'pickup')}"]`);if(f){f.checked=true;f.dispatchEvent(new Event('change',{bubbles:true}))}
  if(d.address&&$('#deliveryAddress'))$('#deliveryAddress').value=d.address;
  if(Number(d.distanceKm)>0&&$('#deliveryDistance'))$('#deliveryDistance').value=d.distanceKm;
  if(d.requestedTime&&d.requestedTime!=='ASAP'){
    const [date,time]=String(d.requestedTime).split('T');if($('#orderTimingMode'))$('#orderTimingMode').value='scheduled';if($('#orderDate'))$('#orderDate').value=date||'';if($('#orderClock'))$('#orderClock').value=time||'';syncScheduleUIV116();
  }
  const p=$(`input[name="payment"][value="${CSS.escape(d.payment||'')}"]`);if(p&&!p.disabled)p.checked=true;
  renderCart();
}
function setupCheckoutHandoffV1120(){
  const btn=$('#continueCheckout');if(!btn||btn.dataset.ready)return;btn.dataset.ready='1';
  btn.addEventListener('click',()=>{
    const d=collectCheckoutDraftV1120(),error=validateCheckoutDraftV1120(d);if(error){toast(error);return}
    saveCheckoutDraftV1120(d);location.href='checkout.html';
  });
  restoreCheckoutDraftV1120();
}
document.addEventListener('DOMContentLoaded',()=>{setTimeout(setupCheckoutHandoffV1120,0);setTimeout(restoreCheckoutDraftV1120,1400)});


// V11.22 — live delivery availability + safer draft resume.
function syncDeliveryAvailabilityV1122(){
  const delivery=document.querySelector('input[name="fulfillment"][value="delivery"]');
  if(!delivery)return;
  const available=storeStatus?.deliveryEnabled!==false;
  delivery.disabled=!available;
  const label=delivery.closest('label');
  if(label){label.classList.toggle('delivery-unavailable',!available);let note=label.querySelector('.delivery-off-note');if(!available&&!note){note=document.createElement('small');note.className='delivery-off-note';note.textContent='Temporarily unavailable';label.appendChild(note)}if(available&&note)note.remove()}
  if(!available&&delivery.checked){const fallback=document.querySelector('input[name="fulfillment"][value="pickup"]');if(fallback){fallback.checked=true;fallback.dispatchEvent(new Event('change',{bubbles:true}))}}
}


// V11.26 — persistent customer order tracker shortcut.
function setupPersistentTrackingShortcutV1126(){
  let orderNo='';
  try{orderNo=localStorage.getItem('vietNomNomLastTrackedOrderV1')||''}catch{}
  if(!orderNo)return;
  const href=`checkout.html?order=${encodeURIComponent(orderNo)}`;
  document.querySelectorAll('.nav-links').forEach(nav=>{
    if(nav.querySelector('[data-track-current-order]'))return;
    const a=document.createElement('a');
    a.href=href;a.dataset.trackCurrentOrder='1';a.className='track-current-order-link';a.textContent='Track my order';
    nav.appendChild(a);
  });
  document.querySelectorAll('.order-menu').forEach(menu=>{
    if(menu.querySelector('[data-track-current-order]'))return;
    const a=document.createElement('a');a.href=href;a.dataset.trackCurrentOrder='1';a.className='track-current-order-menu';a.textContent='Track current order';menu.appendChild(a);
  });
  if(!document.querySelector('.customer-track-fab')){
    const a=document.createElement('a');a.href=href;a.className='customer-track-fab';a.innerHTML='<span>●</span> Track my order';document.body.appendChild(a);
  }
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(setupPersistentTrackingShortcutV1126,40));


// V11.32 — item notes are available consistently for every menu item.
// Food items keep the full preparation customizer; drinks/desserts still open the dialog
// with allergy alerts + the always-visible Special item note instead of bypassing it.
