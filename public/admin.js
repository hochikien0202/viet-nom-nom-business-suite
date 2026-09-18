let pin=sessionStorage.getItem('vietNomNomAdminPin')||'',orders=[],menu=[],settings={},promotions=[],filter='active',soundEnabled=true,lastNew=new Set(),staffCart=[],editingOrder=null,editCart=[],alarmTimer=null,audioCtx=null,distanceDrafts=new Map(),refreshInFlight=false,orderMutationInFlight=0;
const A=s=>document.querySelector(s),AA=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),money=n=>'$'+Number(n||0).toFixed(2);
async function req(path,opt={}){const r=await fetch(path,{...opt,cache:'no-store',headers:{...(opt.headers||{}),'Content-Type':'application/json','x-admin-pin':pin}}),d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||'Request failed');e.status=r.status;throw e}return d}
function toast(t){A('#adminToast').textContent=t;A('#adminToast').classList.add('show');setTimeout(()=>A('#adminToast').classList.remove('show'),2600)}
function ensureAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!audioCtx)audioCtx=new C();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});return audioCtx}catch(e){console.warn('Audio unavailable',e);return null}}
function alarmBurst(){if(!soundEnabled)return;const c=ensureAudio();if(!c)return;const now=c.currentTime,g=c.createGain();g.connect(c.destination);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.72,now+.025);g.gain.setValueAtTime(.72,now+1.8);g.gain.exponentialRampToValueAtTime(.0001,now+2.15);[[880,0,.34],[1175,.38,.34],[880,.76,.34],[1320,1.14,.44],[988,1.62,.38]].forEach(([f,t,d],idx)=>{const o=c.createOscillator();o.type=idx%2?'square':'sine';o.frequency.setValueAtTime(f,now+t);o.connect(g);o.start(now+t);o.stop(now+t+d)})}
function stopAlarm(){if(alarmTimer){clearInterval(alarmTimer);alarmTimer=null}document.body.classList.remove('order-alarm-active');const b=A('#alarmBanner');if(b)b.hidden=true}
function syncAlarm(){const count=orders.filter(o=>o.status==='new').length,b=A('#alarmBanner');if(b){b.hidden=count===0;b.innerHTML=count?`🔔 <b>${count} NEW ORDER${count>1?'S':''}</b> — alarm continues until staff presses ACCEPT` : ''}if(!soundEnabled||count===0){stopAlarm();return}document.body.classList.add('order-alarm-active');if(!alarmTimer){alarmBurst();alarmTimer=setInterval(()=>{if(soundEnabled&&orders.some(o=>o.status==='new'))alarmBurst();else stopAlarm()},2450)}}
async function login(){const v=A('#pinInput').value.trim();try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:v})});if(!r.ok)throw Error('Incorrect PIN');ensureAudio();pin=v;sessionStorage.setItem('vietNomNomAdminPin',pin);openDashboard()}catch(e){A('#loginError').textContent=e.message}}
async function openDashboard(){A('#loginView').hidden=true;A('#dashboardView').hidden=false;A('#logoutBtn').style.visibility='visible';await refresh();window.adminTimer=setInterval(refresh,2500)}
async function refresh(){try{const [o,m,s,p]=await Promise.all([req('/api/admin/orders'),req('/api/admin/menu'),req('/api/admin/settings'),req('/api/admin/promotions')]);orders=o.orders||[];menu=m.menu||[];settings=s.settings||{};promotions=p.promotions||[];window.providerInfo=s.notificationProviders||{};const nowNew=new Set(orders.filter(x=>x.status==='new').map(x=>x.id));lastNew=nowNew;renderOrders();syncAlarm();renderStore(s.status);renderMenu();renderStaffPOS();A('#lastSync').textContent='Synced '+new Date().toLocaleTimeString()}catch(e){if(e.status===401){sessionStorage.removeItem('vietNomNomAdminPin');location.reload()}else A('#lastSync').textContent='Connection issue: '+e.message}}
function sourceLabel(o){if(o.source==='website')return 'Website';if(o.source==='pos')return o.channel||'POS';return o.channel||o.source||'Order'}
function deliveryEditor(o){
  if(o.fulfillment!=='delivery')return '';
  const saved=Number(o.finalDistanceKm||o.customerDistanceKm||0),draft=distanceDrafts.has(o.id)?distanceDrafts.get(o.id):String(saved||''),preview=deliveryFeeFromKm(draft);
  return `<div class="delivery-box"><b>Delivery</b><span>${esc(o.address)}</span><div class="distance-row"><label>Customer estimate<input type="number" step="0.1" value="${Number(o.customerDistanceKm||0)}" disabled> km</label><label>Staff confirmed<input id="dist-${o.id}" type="number" inputmode="decimal" step="0.1" min="0.1" value="${esc(draft)}" oninput="distanceDrafts.set('${o.id}',this.value);updateDistancePreview('${o.id}',this.value)"> km</label><div class="distance-save"><small id="distfee-${o.id}">Final fee: ${money(preview)}</small><button id="distbtn-${o.id}" onclick="updateDistance('${o.id}')">Save & Recalculate</button></div></div><a target="_blank" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('6645 Tecumseh Rd E, Windsor, ON N8T 1E7')}&destination=${encodeURIComponent(o.address||'')}">Check route in Google Maps ↗</a></div>`;
}
function deliveryFeeFromKm(km){const d=Math.max(0,Number(km)||0);if(!d)return 0;return d<=5?6:6+Math.ceil(d-5)}
function updateDistancePreview(id,value){const el=A('#distfee-'+id);if(el)el.textContent='Final fee: '+money(deliveryFeeFromKm(value))}
function renderOrders(){
  const active=o=>!['completed','cancelled'].includes(o.status),list=filter==='active'?orders.filter(active):filter==='all'?orders:orders.filter(o=>o.status===filter);
  A('#ordersGrid').innerHTML=list.map(o=>`<article class="order-card ${o.status==='new'?'is-new':''} ${o.status==='ready'?'is-ready':''}"><div class="order-head"><div><small>${new Date(o.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${esc(sourceLabel(o))}</small><h3>${esc(o.orderNo)}</h3></div><span class="status-badge ${esc(o.status)}">${esc(o.status).replaceAll('-',' ')}</span></div><div class="order-meta"><div><b>${esc(o.customer?.name||'Guest')}</b>${esc(o.customer?.phone||'No phone')}<small>${esc(o.customer?.email||'')}</small></div><div><b>${esc(String(o.fulfillment||'').toUpperCase())}</b>${esc(o.payment||'')}</div></div><div class="order-items">${o.items.map(i=>`<div class="order-item"><span>${i.qty}× ${esc(i.name)}${Array.isArray(i.modifiers)&&i.modifiers.length?`<small class="order-modifiers">${i.modifiers.map(esc).join(' · ')}</small>`:''}</span><b>${money(i.price*i.qty)}</b></div>`).join('')}</div><div class="mini-bill"><span>Subtotal ${money(o.subtotal)}</span>${o.discount?`<span>Discount −${money(o.discount)}${o.promotion?` · ${esc(o.promotion)}`:''}</span>`:''}${o.deliveryFee?`<span>Delivery ${money(o.deliveryFee)}</span>`:''}<span>HST ${money(o.tax)}</span></div>${deliveryEditor(o)}<div class="order-total"><span>Total</span><strong>${money(o.total)}</strong></div><div class="order-actions"><button class="action-btn checkout" onclick="openOrderEditor('${o.id}')">Edit / Checkout</button>${['accepted','preparing','ready',o.fulfillment==='delivery'?'out-for-delivery':'completed','completed'].filter((v,i,a)=>a.indexOf(v)===i).map(st=>`<button class="action-btn ${st==='completed'?'secondary':''}" onclick="setStatus('${o.id}','${st}')">${st==='ready'?(o.fulfillment==='pickup'?'READY FOR PICKUP':o.fulfillment==='dine-in'?'READY FOR DINE-IN':'READY'):st==='completed'?'PAID & COMPLETED':st.replaceAll('-',' ')}</button>`).join('')}</div></article>`).join('');
  A('#emptyState').hidden=!!list.length;A('#statNew').textContent=orders.filter(o=>o.status==='new').length;A('#statPreparing').textContent=orders.filter(o=>o.status==='preparing').length;A('#statReady').textContent=orders.filter(o=>['ready','out-for-delivery'].includes(o.status)).length;const today=new Date().toDateString();A('#statCompleted').textContent=orders.filter(o=>o.status==='completed'&&new Date(o.updatedAt).toDateString()===today).length;
}

async function setStatus(id,status){await req('/api/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({status})});toast(`Status: ${status.replaceAll('-',' ')} · customer update triggered`);await refresh()}
async function updateDistance(id){
  const input=A('#dist-'+id),v=Number(input?.value),btn=A('#distbtn-'+id);if(!v||v<=0)return toast('Enter a valid distance.');
  if(btn){btn.disabled=true;btn.textContent='Saving…'}orderMutationInFlight++;
  try{const d=await req('/api/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({finalDistanceKm:v})});const i=orders.findIndex(o=>o.id===id);if(i>=0)orders[i]=d.order;distanceDrafts.delete(id);renderOrders();toast(`Distance saved · delivery fee ${money(d.order.deliveryFee)}`)}
  catch(e){toast('Could not recalculate: '+e.message)}finally{orderMutationInFlight=Math.max(0,orderMutationInFlight-1);const b=A('#distbtn-'+id);if(b){b.disabled=false;b.textContent='Save & Recalculate'}}
}

function renderStore(status){A('#storeOverride').value=settings.storeOverride||'auto';A('#onlineOrdering').value=String(!!settings.onlineOrderingEnabled);if(A('#deliveryEnabled'))A('#deliveryEnabled').value=String(settings.deliveryEnabled!==false);A('#storeNotice').value=settings.notice||'';A('#notifyEmail').checked=settings.notificationEmailEnabled!==false;A('#notifySms').checked=settings.notificationSmsEnabled!==false;A('#providerStatus').innerHTML=`<span class="provider ${window.providerInfo?.emailConfigured?'ok':'demo'}">Email: ${window.providerInfo?.emailConfigured?'LIVE':'SIMULATION'}</span><span class="provider ${window.providerInfo?.smsConfigured?'ok':'demo'}">SMS: ${window.providerInfo?.smsConfigured?'LIVE':'SIMULATION'}</span>`;A('#storeLiveStatus').innerHTML=`${status?.open?'🟢 OPEN':'🔴 CLOSED'} · ${esc(status?.reason||'')}`;const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];A('#hoursEditor').innerHTML=days.map(d=>{const h=settings.hours?.[d]||{open:'10:00',close:'20:00',closed:false};return `<div class="day-card"><strong>${d[0].toUpperCase()+d.slice(1)}</strong><label>Status<select data-day="${d}" data-k="closed"><option value="false" ${!h.closed?'selected':''}>Open</option><option value="true" ${h.closed?'selected':''}>Closed</option></select></label><label>Open<input type="time" data-day="${d}" data-k="open" value="${h.open||'10:00'}"></label><label>Close<input type="time" data-day="${d}" data-k="close" value="${h.close||'20:00'}"></label></div>`}).join('')}
async function saveStore(){const hours={};AA('[data-day]').forEach(el=>{const d=el.dataset.day;hours[d]=hours[d]||{};hours[d][el.dataset.k]=el.dataset.k==='closed'?el.value==='true':el.value});await req('/api/admin/settings',{method:'PATCH',body:JSON.stringify({storeOverride:A('#storeOverride').value,onlineOrderingEnabled:A('#onlineOrdering').value==='true',deliveryEnabled:A('#deliveryEnabled')?A('#deliveryEnabled').value==='true':true,notificationEmailEnabled:A('#notifyEmail').checked,notificationSmsEnabled:A('#notifySms').checked,notice:A('#storeNotice').value,hours})});toast('Store settings synced');await refresh()}
function renderMenu(){const cats=['All',...new Set(menu.map(x=>x.category))],cur=A('#staffMenuCategory').value||'All';A('#staffMenuCategory').innerHTML=cats.map(c=>`<option ${c===cur?'selected':''}>${esc(c)}</option>`).join('');const q=(A('#staffMenuSearch').value||'').toLowerCase(),cat=A('#staffMenuCategory').value||'All',list=menu.filter(x=>(cat==='All'||x.category===cat)&&(!q||x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q)));A('#staffMenuCards').innerHTML=list.map(x=>`<article class="menu-admin-card"><div class="menu-admin-top"><div><span>${esc(x.category)}</span><h3>${esc(x.name)}</h3></div><button class="stock-pill ${x.soldOut?'sold':'in'}" onclick="patchDish('${x.id}','soldOut',${!x.soldOut})">${x.soldOut?'SOLD OUT':'IN STOCK'}</button></div><div class="menu-fields"><label>Name<input value="${esc(x.name)}" onchange="patchDish('${x.id}','name',this.value)"></label><label>Category<input value="${esc(x.category)}" onchange="patchDish('${x.id}','category',this.value)"></label><label>Price<input type="number" step=".01" value="${x.price}" onchange="patchDish('${x.id}','price',this.value)"></label><label>Website<select onchange="patchDish('${x.id}','active',this.value==='true')"><option value="true" ${x.active?'selected':''}>Visible</option><option value="false" ${!x.active?'selected':''}>Hidden</option></select></label></div><label>Description<textarea rows="2" onchange="patchDish('${x.id}','description',this.value)">${esc(x.description||'')}</textarea></label><div class="menu-card-actions"><button class="danger" onclick="delDish('${x.id}')">Delete dish</button></div></article>`).join('')||'<div class="empty-state"><strong>No matching dishes.</strong></div>'}
async function patchDish(id,k,v){await req('/api/admin/menu/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});toast('Website, POS and CRM menu updated');await refresh()}
async function delDish(id){if(confirm('Delete this dish from the menu?')){await req('/api/admin/menu/'+id,{method:'DELETE'});await refresh()}}
function showDishForm(){A('#dishForm').innerHTML='<div class="dish-create"><label>Dish name<input id="dn"></label><label>Category<input id="dc"></label><label>Price<input id="dp" type="number" step=".01"></label><label>Description<input id="dd"></label><button id="saveDish" class="btn-primary">Save Dish</button></div>';A('#saveDish').onclick=async()=>{await req('/api/admin/menu',{method:'POST',body:JSON.stringify({name:A('#dn').value,category:A('#dc').value,price:A('#dp').value,description:A('#dd').value})});A('#dishForm').innerHTML='';await refresh()}}
function promoValid(p,sub=0){if(!p||!p.active)return false;const now=Date.now();if(p.startAt&&now<new Date(p.startAt).getTime())return false;if(p.endAt&&now>new Date(p.endAt).getTime())return false;if(Array.isArray(p.channels)&&p.channels.length&&!p.channels.includes('pos'))return false;const inEditor=editingOrder&&!A('#orderModal')?.hidden;const f=String(inEditor?A('#editFulfillment')?.value:A('#staffSaleChannel')?.value||'').toLowerCase();if(Array.isArray(p.allowedFulfillments)&&p.allowedFulfillments.length&&f&&!p.allowedFulfillments.map(x=>String(x).toLowerCase()).includes(f))return false;if(Number(p.minSpend||0)>sub)return false;return true}
function calcPromo(sub,id){const p=promotions.find(x=>x.id===id);if(!p||!promoValid(p,sub))return 0;let d=p.type==='percent'?sub*Number(p.value||0)/100:Number(p.value||0);if(Number(p.maxDiscount||0)>0)d=Math.min(d,Number(p.maxDiscount));return Math.min(sub,d)}
function renderStaffPOS(){if(!A('#staffPosMenu'))return;const cats=['All',...new Set(menu.filter(x=>x.active&&!x.soldOut).map(x=>x.category))],current=A('#staffPosCategory').value||'All';A('#staffPosCategory').innerHTML=cats.map(c=>`<option ${c===current?'selected':''}>${esc(c)}</option>`).join('');const q=A('#staffPosSearch').value.toLowerCase(),cat=A('#staffPosCategory').value||'All',list=menu.filter(x=>x.active&&!x.soldOut&&(cat==='All'||x.category===cat)&&(!q||x.name.toLowerCase().includes(q)));A('#staffPosMenu').innerHTML=list.map(x=>`<button class="pos-dish" onclick="staffAdd('${x.id}')"><b>${esc(x.name)}</b><span>${esc(x.category)}</span><strong>${money(x.price)}</strong></button>`).join('')||'<p>No matching items.</p>';renderStaffCart()}
function staffAdd(id){const m=menu.find(x=>x.id===id),r=staffCart.find(x=>x.id===id);if(r)r.qty++;else staffCart.push({...m,qty:1});renderStaffPOS()}
function staffQty(id,d){const r=staffCart.find(x=>x.id===id);if(!r)return;r.qty+=d;if(r.qty<=0)staffCart=staffCart.filter(x=>x.id!==id);renderStaffPOS()}
function renderStaffCart(){const root=A('#staffCart');if(!root)return;root.innerHTML=staffCart.length?staffCart.map(x=>`<div class="cart-line"><div><b>${esc(x.name)}</b><small>${money(x.price)} each</small></div><div class="qty-control"><button onclick="staffQty('${x.id}',-1)">−</button><span>${x.qty}</span><button onclick="staffQty('${x.id}',1)">+</button><b>${money(x.price*x.qty)}</b></div></div>`).join(''):'<p class="muted">No items yet.</p>';const sub=staffCart.reduce((s,x)=>s+x.price*x.qty,0),select=A('#staffSalePromo'),old=select.value;select.innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...select.options].some(o=>o.value===old))select.value=old;const pd=calcPromo(sub,select.value),md=Number(A('#staffManualDiscount').value)||0,disc=Math.min(sub,pd+md),tax=(sub-disc)*.13,total=sub-disc+tax;A('#staffTotals').innerHTML=`<div><span>Subtotal</span><b>${money(sub)}</b></div><div><span>Discount</span><b>−${money(disc)}</b></div><div><span>HST 13%</span><b>${money(tax)}</b></div><div class="grand"><span>Total</span><b>${money(total)}</b></div>`}
async function staffCompleteSale(){if(!staffCart.length)return toast('Add at least one item.');const channel=A('#staffSaleChannel').value,fulfillment=channel.toLowerCase()==='walk-in'?'walk-in':channel.toLowerCase(),payload={items:staffCart.map(x=>({id:x.id,qty:x.qty})),promotionId:A('#staffSalePromo').value,manualDiscount:Number(A('#staffManualDiscount').value)||0,payment:A('#staffSalePayment').value,channel,fulfillment,status:'completed',customer:{name:A('#staffCustomerName').value,phone:A('#staffCustomerPhone').value,email:A('#staffCustomerEmail').value},notes:A('#staffSaleNotes').value};const d=await req('/api/admin/orders',{method:'POST',body:JSON.stringify(payload)});staffCart=[];for(const id of ['staffManualDiscount','staffCustomerName','staffCustomerPhone','staffCustomerEmail','staffSaleNotes'])A('#'+id).value=id==='staffManualDiscount'?0:'';A('#staffSaleMsg').innerHTML=`<div class="success-note">Completed ${esc(d.order.orderNo)} · ${money(d.order.total)} · added to Orders / All</div>`;toast('Sale completed and linked to Orders');await refresh()}
function openOrderEditor(id){editingOrder=orders.find(o=>o.id===id);if(!editingOrder)return;editCart=(editingOrder.items||[]).map(x=>({...x}));A('#orderModal').hidden=false;document.body.classList.add('modal-open');A('#modalOrderTitle').textContent=`${editingOrder.orderNo} · ${sourceLabel(editingOrder)}`;A('#editCustomerName').value=editingOrder.customer?.name||'';A('#editCustomerPhone').value=editingOrder.customer?.phone||'';A('#editCustomerEmail').value=editingOrder.customer?.email||'';A('#editManualDiscount').value=Number(editingOrder.manualDiscount||0);A('#editPayment').value=[...A('#editPayment').options].some(x=>x.value===editingOrder.payment)?editingOrder.payment:'Cash';A('#editFulfillment').value=[...A('#editFulfillment').options].some(x=>x.value===editingOrder.fulfillment)?editingOrder.fulfillment:'pickup';A('#editAddress').value=editingOrder.address||'';A('#editDistance').value=Number(editingOrder.finalDistanceKm||editingOrder.customerDistanceKm||0)||'';A('#editNotes').value=editingOrder.notes||'';A('#editMenuSearch').value='';renderEditor()}
function closeOrderEditor(){A('#orderModal').hidden=true;document.body.classList.remove('modal-open');editingOrder=null;editCart=[]}
function editQty(id,d){const r=editCart.find(x=>x.id===id);if(!r)return;r.qty+=d;if(r.qty<=0)editCart=editCart.filter(x=>x.id!==id);renderEditor()}
function editAdd(id){const m=menu.find(x=>x.id===id);if(!m)return;const r=editCart.find(x=>x.id===id);if(r)r.qty++;else editCart.push({id:m.id,name:m.name,price:m.price,qty:1});renderEditor()}
function editorTotals(){const sub=editCart.reduce((s,x)=>s+Number(x.price)*Number(x.qty),0),promo=A('#editPromotion').value,pd=calcPromo(sub,promo),manual=Number(A('#editManualDiscount').value)||0,disc=Math.min(sub,pd+manual),ful=A('#editFulfillment').value,dist=Number(A('#editDistance').value)||0,delivery=ful==='delivery'?(dist>0?(dist<=5?6:6+Math.ceil(dist-5)):0):0,tax=(sub-disc+delivery)*.13,total=sub-disc+delivery+tax;return{sub,disc,delivery,tax,total}}
function renderEditor(){if(!editingOrder)return;const sub=editCart.reduce((s,x)=>s+x.price*x.qty,0),old=A('#editPromotion').value||editingOrder.promotionId||'';A('#editPromotion').innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...A('#editPromotion').options].some(x=>x.value===old))A('#editPromotion').value=old;A('#editOrderItems').innerHTML=editCart.map(x=>`<div class="editor-item"><div><b>${esc(x.name)}</b><small>${money(x.price)} each</small></div><div class="qty-control"><button onclick="editQty('${x.id}',-1)">−</button><span>${x.qty}</span><button onclick="editQty('${x.id}',1)">+</button><b>${money(x.price*x.qty)}</b></div></div>`).join('')||'<p class="muted">No items.</p>';const q=(A('#editMenuSearch').value||'').toLowerCase();A('#editMenuResults').innerHTML=(q?menu.filter(x=>x.active&&!x.soldOut&&x.name.toLowerCase().includes(q)).slice(0,12):[]).map(x=>`<button onclick="editAdd('${x.id}')"><span>${esc(x.name)}</span><b>${money(x.price)}</b></button>`).join('');A('#editDeliveryWrap').style.display=A('#editFulfillment').value==='delivery'?'grid':'none';const t=editorTotals();A('#editTotals').innerHTML=`<div><span>Subtotal</span><b>${money(t.sub)}</b></div><div><span>Discount</span><b>−${money(t.disc)}</b></div>${t.delivery?`<div><span>Delivery</span><b>${money(t.delivery)}</b></div>`:''}<div><span>HST 13%</span><b>${money(t.tax)}</b></div><div class="grand"><span>Total</span><b>${money(t.total)}</b></div>`}
async function saveOrderEdits(markComplete=false){if(!editingOrder||!editCart.length)return toast('Order must contain at least one item.');const payload={items:editCart.map(x=>({id:x.id,qty:x.qty,priceOverride:x.price})),customer:{name:A('#editCustomerName').value,phone:A('#editCustomerPhone').value,email:A('#editCustomerEmail').value},promotionId:A('#editPromotion').value,manualDiscount:Number(A('#editManualDiscount').value)||0,payment:A('#editPayment').value,fulfillment:A('#editFulfillment').value,address:A('#editAddress').value,finalDistanceKm:Number(A('#editDistance').value)||0,notes:A('#editNotes').value};if(markComplete)payload.status='completed';const d=await req('/api/admin/orders/'+editingOrder.id,{method:'PATCH',body:JSON.stringify(payload)});editingOrder=d.order;toast(markComplete?'Order completed · thank-you update triggered':'Order checkout updated');if(markComplete)closeOrderEditor();await refresh();if(!markComplete&&editingOrder)openOrderEditor(editingOrder.id)}
function printOrder(){if(!editingOrder)return;const t=editorTotals(),items=editCart.map(x=>`<tr><td>${x.qty} × ${esc(x.name)}</td><td style="text-align:right">${money(x.price*x.qty)}</td></tr>`).join(''),w=window.open('','_blank','width=560,height=760');w.document.write(`<!doctype html><html><head><title>${esc(editingOrder.orderNo)}</title><style>body{font-family:Arial;padding:28px;color:#222}h1{margin:0}small{color:#666}table{width:100%;margin:20px 0;border-collapse:collapse}td{padding:8px 0;border-bottom:1px dashed #ccc}.totals{margin-left:auto;max-width:300px}.totals div{display:flex;justify-content:space-between;padding:5px 0}.grand{font-size:22px;font-weight:bold;border-top:2px solid #222;margin-top:8px;padding-top:10px!important}</style></head><body><h1>Viet Nom Nom</h1><small>6645 Tecumseh Rd E, Windsor, ON N8T 1E7</small><h2>${esc(editingOrder.orderNo)}</h2><p>${esc(A('#editCustomerName').value)}<br>${esc(A('#editCustomerPhone').value)}<br>${esc(A('#editCustomerEmail').value)}</p><table>${items}</table><div class="totals"><div><span>Subtotal</span><b>${money(t.sub)}</b></div><div><span>Discount</span><b>−${money(t.disc)}</b></div>${t.delivery?`<div><span>Delivery</span><b>${money(t.delivery)}</b></div>`:''}<div><span>HST 13%</span><b>${money(t.tax)}</b></div><div class="grand"><span>Total</span><b>${money(t.total)}</b></div></div><p>Payment: ${esc(A('#editPayment').value)}</p><p>Thank you!</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
A('#loginBtn').onclick=login;A('#pinInput').addEventListener('keydown',e=>{if(e.key==='Enter')login()});A('#refreshBtn').onclick=refresh;A('#soundBtn').onclick=()=>{soundEnabled=!soundEnabled;A('#soundBtn').textContent=soundEnabled?'🔔 Sound on':'🔕 Sound off';if(soundEnabled){ensureAudio();syncAlarm()}else stopAlarm()};A('#logoutBtn').onclick=()=>{sessionStorage.removeItem('vietNomNomAdminPin');location.reload()};A('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;AA('#filters button').forEach(x=>x.classList.toggle('active',x===b));renderOrders()});A('#adminTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;AA('#adminTabs button').forEach(x=>x.classList.toggle('active',x===b));AA('.admin-tab').forEach(x=>x.hidden=x.id!=='tab-'+b.dataset.tab)});A('#saveStore').onclick=saveStore;A('#addDish').onclick=showDishForm;A('#staffPosSearch').oninput=renderStaffPOS;A('#staffPosCategory').onchange=renderStaffPOS;A('#staffSalePromo').onchange=renderStaffCart;A('#staffManualDiscount').oninput=renderStaffCart;A('#staffCompleteSale').onclick=staffCompleteSale;A('#staffMenuSearch').oninput=renderMenu;A('#staffMenuCategory').onchange=renderMenu;AA('[data-close-modal]').forEach(x=>x.onclick=closeOrderEditor);A('#editMenuSearch').oninput=renderEditor;A('#editPromotion').onchange=renderEditor;A('#editManualDiscount').oninput=renderEditor;A('#editFulfillment').onchange=renderEditor;A('#editDistance').oninput=renderEditor;A('#saveOrderEdits').onclick=()=>saveOrderEdits(false);A('#completeOrder').onclick=()=>saveOrderEdits(true);A('#printOrder').onclick=printOrder;A('#logoutBtn').style.visibility='hidden';

// V8 loud alarm + unified POS order flow
function alarmBurst(){if(!soundEnabled)return;const c=ensureAudio();if(!c)return;const now=c.currentTime,master=c.createGain();master.connect(c.destination);master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.98,now+.03);master.gain.setValueAtTime(.98,now+3.5);master.gain.exponentialRampToValueAtTime(.0001,now+3.9);for(let i=0;i<8;i++){const o=c.createOscillator(),g=c.createGain(),t=now+i*.46;o.type='square';o.frequency.setValueAtTime(i%2?1320:760,t);o.frequency.linearRampToValueAtTime(i%2?850:1450,t+.38);g.gain.setValueAtTime(.42,t);g.gain.exponentialRampToValueAtTime(.02,t+.4);o.connect(g);g.connect(master);o.start(t);o.stop(t+.42)}}
syncAlarm=function(){const count=orders.filter(o=>o.status==='new').length,b=A('#alarmBanner');if(b){b.hidden=count===0;b.innerHTML=count?`🚨 <b>${count} NEW ORDER${count>1?'S':''}</b> — PRESS ACCEPT TO SILENCE` : ''}if(!soundEnabled||count===0){stopAlarm();return}document.body.classList.add('order-alarm-active');ensureAudio();if(!alarmTimer){alarmBurst();alarmTimer=setInterval(()=>{if(soundEnabled&&orders.some(o=>o.status==='new'))alarmBurst();else stopAlarm()},4050)}};
staffCompleteSale=async function(){if(!staffCart.length)return toast('Add at least one item.');const channel=A('#staffSaleChannel').value,fulfillment=channel.toLowerCase()==='walk-in'?'walk-in':channel.toLowerCase(),payload={items:staffCart.map(x=>({id:x.id,qty:x.qty})),promotionId:A('#staffSalePromo').value,manualDiscount:Number(A('#staffManualDiscount').value)||0,payment:A('#staffSalePayment').value,channel,fulfillment,status:'new',customer:{name:A('#staffCustomerName').value||(channel==='Dine-in'?'Dine-in customer':'Walk-in customer'),phone:A('#staffCustomerPhone').value,email:A('#staffCustomerEmail').value},notes:A('#staffSaleNotes').value};const d=await req('/api/admin/orders',{method:'POST',body:JSON.stringify(payload)});staffCart=[];for(const id of ['staffManualDiscount','staffCustomerName','staffCustomerPhone','staffCustomerEmail','staffSaleNotes'])A('#'+id).value=id==='staffManualDiscount'?0:'';A('#staffSaleMsg').innerHTML=`<div class="success-note">Created ${esc(d.order.orderNo)} · ${money(d.order.total)} · now waiting in Orders / All</div>`;toast('POS order created — Accept it in Orders');await refresh();AA('#adminTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab==='orders'));AA('.admin-tab').forEach(x=>x.hidden=x.id!=='tab-orders')};
if(A('#staffCompleteSale')){A('#staffCompleteSale').textContent='Create Order & Send to Orders';A('#staffCompleteSale').onclick=staffCompleteSale}
let audioArmed=false;const _loginV8=login;login=async function(){await _loginV8();if(pin){audioArmed=true;soundEnabled=true;ensureAudio();if(A('#soundBtn'))A('#soundBtn').textContent='🔔 Alarm armed'}};
if(A('#soundBtn')){A('#soundBtn').textContent='🚨 Arm loud alarm';A('#soundBtn').onclick=()=>{if(!audioArmed){audioArmed=true;soundEnabled=true;ensureAudio();A('#soundBtn').textContent='🔔 Alarm armed';toast('Loud new-order alarm armed');syncAlarm();return}soundEnabled=!soundEnabled;A('#soundBtn').textContent=soundEnabled?'🔔 Alarm armed':'🔕 Alarm muted';if(soundEnabled){ensureAudio();syncAlarm()}else stopAlarm()}}

// V11 production stability layer: Staff Admin refreshes from one snapshot API.
// This prevents four parallel cold-start/database requests every 2.5 seconds.
req=async function(path,opt={},timeoutMs=12000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(path,{...opt,cache:'no-store',signal:c.signal,headers:{...(opt.headers||{}),'Content-Type':'application/json','x-admin-pin':pin}}),
      d=await r.json().catch(()=>({}));
    if(!r.ok){const e=Error(d.error||'Request failed');e.status=r.status;e.retryable=!!d.retryable;throw e}
    return d;
  }finally{clearTimeout(t)}
};
refresh=async function(){
  if(refreshInFlight||orderMutationInFlight>0)return;
  refreshInFlight=true;
  try{
    const d=await req('/api/admin/snapshot?view=staff');
    orders=d.orders||[];menu=d.menu||[];settings=d.settings||{};promotions=d.promotions||[];
    window.providerInfo=d.notificationProviders||{};
    lastNew=new Set(orders.filter(x=>x.status==='new').map(x=>x.id));
    renderOrders();syncAlarm();renderStore(d.status||{});renderMenu();renderStaffPOS();
    A('#lastSync').textContent='Synced '+new Date().toLocaleTimeString();
  }catch(e){
    if(e.status===401){sessionStorage.removeItem('vietNomNomAdminPin');location.reload();return}
    console.error('Staff snapshot failed',e);
    A('#lastSync').textContent=(e.status===503?'Database busy — retrying automatically':'Connection issue: '+e.message);
  }finally{refreshInFlight=false}
};


// V11.1 responsive admin polling. Avoid overlapping snapshot calls and never
// overwrite a distance field while staff are saving it.
openDashboard=async function(){
  A('#loginView').hidden=true;A('#dashboardView').hidden=false;A('#logoutBtn').style.visibility='visible';
  if(window.adminTimer)clearInterval(window.adminTimer);
  await refresh();
  window.adminTimer=setInterval(()=>{if(!document.hidden)refresh()},4000);
};
if(pin)openDashboard();

// V11.3 checkout redesign + pleasant chime alarm
function adminDT(v){try{return v?new Date(v).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—'}catch{return '—'}}
function statusTone(s){const x=(s||'').toLowerCase();if(x==='new')return '🆕 New';if(x==='accepted')return '✅ Accepted';if(x==='preparing')return '👨‍🍳 Preparing';if(x==='ready')return '📦 Ready';if(x==='completed')return '✔ Completed';return x||'—'}
function ensureEditorChrome(){const card=document.querySelector('#orderModal .modal-card');if(!card)return;card.classList.add('editor-premium');if(!A('#orderEditorMeta'))document.querySelector('#orderModal .modal-head')?.insertAdjacentHTML('afterend','<div id="orderEditorMeta"></div>');if(!document.querySelector('#orderModal .editor-search-hint'))A('#editMenuResults')?.insertAdjacentHTML('beforebegin','<div class="editor-search-hint">Search by dish name or use quick picks below.</div>');}
function editRemove(id){editCart=editCart.filter(x=>x.id!==id);renderEditor()}
function quickPickCandidates(){const seen=new Set();return menu.filter(x=>x.active&&!x.soldOut).filter(x=>{const key=(x.category||'').toLowerCase();if(seen.has(key))return false;seen.add(key);return true}).slice(0,6)}
function pleasantAlarmBurst(){if(!soundEnabled)return;const c=ensureAudio();if(!c)return;const start=c.currentTime+.01;const master=c.createGain();master.connect(c.destination);master.gain.setValueAtTime(.0001,start);master.gain.exponentialRampToValueAtTime(.44,start+.04);/* V11.4: 200% of previous chime output */master.gain.exponentialRampToValueAtTime(.0001,start+1.9);const notes=[783.99,987.77,1174.66,987.77,1318.51];notes.forEach((freq,i)=>{const osc=c.createOscillator(),g=c.createGain();osc.type=i%2===0?'triangle':'sine';const t=start+i*.17;osc.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.26,t+.03);g.gain.exponentialRampToValueAtTime(.0001,t+.22);osc.connect(g);g.connect(master);osc.start(t);osc.stop(t+.24)});}
alarmBurst=pleasantAlarmBurst;
syncAlarm=function(){const count=orders.filter(o=>o.status==='new').length,b=A('#alarmBanner');if(b){b.hidden=count===0;b.innerHTML=count?`🎵 <b>${count} NEW ORDER${count>1?'S':''}</b> — pleasant chime active until accepted` : ''}if(!soundEnabled||count===0){stopAlarm();return}document.body.classList.add('order-alarm-active');ensureAudio();if(!alarmTimer){alarmBurst();alarmTimer=setInterval(()=>{if(soundEnabled&&orders.some(o=>o.status==='new'))alarmBurst();else stopAlarm()},2600)}};
if(A('#soundBtn')){A('#soundBtn').textContent='🎵 Chime on';A('#soundBtn').onclick=()=>{soundEnabled=!soundEnabled;A('#soundBtn').textContent=soundEnabled?'🎵 Chime on':'🔕 Chime off';if(soundEnabled){ensureAudio();syncAlarm();toast('Pleasant order chime enabled')}else{stopAlarm();toast('Order chime muted')}}}
openOrderEditor=function(id){editingOrder=orders.find(o=>o.id===id);if(!editingOrder)return;editCart=(editingOrder.items||[]).map(x=>({...x}));A('#orderModal').hidden=false;document.body.classList.add('modal-open');A('#modalOrderTitle').textContent=`${editingOrder.orderNo} · ${sourceLabel(editingOrder)}`;A('#editCustomerName').value=editingOrder.customer?.name||'';A('#editCustomerPhone').value=editingOrder.customer?.phone||'';A('#editCustomerEmail').value=editingOrder.customer?.email||'';A('#editManualDiscount').value=Number(editingOrder.manualDiscount||0);A('#editPayment').value=[...A('#editPayment').options].some(x=>x.value===editingOrder.payment)?editingOrder.payment:'Cash';A('#editFulfillment').value=[...A('#editFulfillment').options].some(x=>x.value===editingOrder.fulfillment)?editingOrder.fulfillment:'pickup';A('#editAddress').value=editingOrder.address||'';A('#editDistance').value=Number(editingOrder.finalDistanceKm||editingOrder.customerDistanceKm||0)||'';A('#editNotes').value=editingOrder.notes||'';A('#editMenuSearch').value='';ensureEditorChrome();renderEditor()};
renderEditor=function(){if(!editingOrder)return;ensureEditorChrome();const sub=editCart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0),old=A('#editPromotion').value||editingOrder.promotionId||'';A('#editPromotion').innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...A('#editPromotion').options].some(x=>x.value===old))A('#editPromotion').value=old;const itemCount=editCart.reduce((s,x)=>s+Number(x.qty||0),0),meta=A('#orderEditorMeta');if(meta)meta.innerHTML=`<div class="meta-card"><span>Status</span><b>${statusTone(editingOrder.status)}</b></div><div class="meta-card"><span>Source</span><b>${sourceLabel(editingOrder)}</b></div><div class="meta-card"><span>Created</span><b>${adminDT(editingOrder.createdAt||editingOrder.updatedAt)}</b></div><div class="meta-card"><span>Items</span><b>${itemCount} item${itemCount===1?'':'s'}</b></div>`;A('#editOrderItems').innerHTML=editCart.length?editCart.map(x=>`<div class="editor-item"><div class="editor-item-main"><b>${esc(x.name)}</b>${Array.isArray(x.modifiers)&&x.modifiers.length?`<small class="order-modifiers">${x.modifiers.map(esc).join(' · ')}</small>`:''}<small>${money(x.price)} each</small><div class="chip-line"><span class="chip">Qty ${x.qty}</span><span class="chip">Line ${money(Number(x.price)*Number(x.qty))}</span></div></div><div class="qty-control"><button onclick="editQty('${x.id}',-1)">−</button><span>${x.qty}</span><button onclick="editQty('${x.id}',1)">+</button><b class="editor-line-total">${money(Number(x.price)*Number(x.qty))}</b><button class="remove-line" onclick="editRemove('${x.id}')">Remove</button></div></div>`).join(''):`<div class="editor-empty-state"><strong>No items in this order yet.</strong><div class="summary-caption">Use the search bar above or quick picks below to add dishes.</div></div>`;const q=(A('#editMenuSearch').value||'').trim().toLowerCase();const matches=(q?menu.filter(x=>x.active&&!x.soldOut&&(x.name.toLowerCase().includes(q)||(x.category||'').toLowerCase().includes(q))).slice(0,12):menu.filter(x=>x.active&&!x.soldOut).slice(0,6));A('#editMenuResults').innerHTML=matches.map(x=>`<button onclick="editAdd('${x.id}')"><span><b>${esc(x.name)}</b><small>${esc(x.category||'')}</small></span><b>${money(x.price)}</b></button>`).join('')||'<div class="editor-empty-state">No matching menu items.</div>';if(!q&&A('#editMenuResults'))A('#editMenuResults').insertAdjacentHTML('beforeend',`<div class="editor-quick-picks">${quickPickCandidates().map(x=>`<button onclick="A('#editMenuSearch').value='${String(x.category||'').replace(/'/g,"&#39;")}';renderEditor()">${esc(x.category||x.name)}</button>`).join('')}</div>`);A('#editDeliveryWrap').style.display=A('#editFulfillment').value==='delivery'?'grid':'none';const t=editorTotals();A('#editTotals').innerHTML=`<div class="totals-pro"><div class="tot-row"><span>Subtotal</span><strong>${money(t.sub)}</strong></div><div class="tot-row"><span>Discount</span><strong>−${money(t.disc)}</strong></div>${t.delivery?`<div class="tot-row"><span>Delivery</span><strong>${money(t.delivery)}</strong></div>`:''}<div class="tot-row"><span>HST 13%</span><strong>${money(t.tax)}</strong></div><div class="tot-row grand"><span>Total</span><strong>${money(t.total)}</strong></div><div class="summary-caption">Promotion + manual discount are calculated live before tax.</div>${A('#editFulfillment').value==='delivery'?'<div class="delivery-policy-note">Delivery policy: under 5 km = $6, over 5 km = $6 + $1/km above 5. Staff can confirm the final distance here.</div>':''}</div>`};

// V11.5 — real restaurant order alert audio.
// Uses the manager-selected MP3 at full browser volume and loops continuously
// while at least one order remains NEW. Accepting the final NEW order stops it.
let orderAlertAudioV115=null;
function ensureOrderAlertAudioV115(){
  if(!orderAlertAudioV115){
    orderAlertAudioV115=new Audio('/assets/sounds/order-alert.mp3?v=11.7.0');
    orderAlertAudioV115.preload='auto';
    orderAlertAudioV115.loop=true;
    orderAlertAudioV115.volume=1;
  }
  return orderAlertAudioV115;
}
function silenceOrderAlertV115(){
  if(alarmTimer){clearInterval(alarmTimer);alarmTimer=null}
  const audio=orderAlertAudioV115;
  if(audio){audio.pause();try{audio.currentTime=0}catch{}}
  document.body.classList.remove('order-alarm-active');
  const b=A('#alarmBanner');if(b)b.hidden=true;
}
stopAlarm=silenceOrderAlertV115;
alarmBurst=function(){
  if(!soundEnabled)return;
  const audio=ensureOrderAlertAudioV115();
  if(audio.paused){
    audio.play().catch(()=>{
      const b=A('#alarmBanner');
      if(b&&!b.hidden)b.innerHTML+=` <span class="alarm-unlock">— tap “Alert on” once to enable audio</span>`;
    });
  }
};
syncAlarm=function(){
  const count=orders.filter(o=>o.status==='new').length,b=A('#alarmBanner');
  if(!soundEnabled||count===0){silenceOrderAlertV115();return}
  document.body.classList.add('order-alarm-active');
  if(b){b.hidden=false;b.innerHTML=`🔔 <b>${count} NEW ORDER${count>1?'S':''}</b> — alert loops continuously until ${count>1?'all orders are':'the order is'} ACCEPTED`;}
  alarmBurst();
};
if(A('#soundBtn')){
  A('#soundBtn').textContent='🔔 Alert on';
  A('#soundBtn').onclick=()=>{
    soundEnabled=!soundEnabled;
    A('#soundBtn').textContent=soundEnabled?'🔔 Alert on':'🔕 Alert off';
    if(soundEnabled){
      const audio=ensureOrderAlertAudioV115();
      // This click also unlocks browser audio. If there is no new order, start
      // then stop immediately so future background refreshes may play it.
      const hasNew=orders.some(o=>o.status==='new');
      audio.play().then(()=>{if(!hasNew){audio.pause();audio.currentTime=0}else syncAlarm()}).catch(()=>{});
      toast('Order alert enabled at maximum browser volume');
    }else{
      silenceOrderAlertV115();toast('Order alert muted');
    }
  };
}

// V11.12 — reliable stock toggle + grouped menu variants in Staff POS / Edit Checkout.
function adminVM(){return window.VietNomNomMenuVariants||null}
patchDish=async function(id,k,v){
  const row=menu.find(x=>x.id===id),before=row?row[k]:undefined;if(row)row[k]=v;renderMenu();renderStaffPOS();
  try{await req('/api/admin/menu/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});toast(k==='soldOut'?(v?'Marked SOLD OUT':'Marked IN STOCK'):'Website, POS and CRM menu updated');await refresh()}
  catch(e){if(row)row[k]=before;renderMenu();renderStaffPOS();toast('Could not update menu: '+e.message)}
};
function adminVariantSelections(card){const out={};card.querySelectorAll('[data-admin-variant-control]').forEach(s=>out[s.dataset.adminVariantControl]=s.value);return out}
function adminVariantControls(family,defs,prefix='data-admin-variant-control'){return family.controls.map(c=>`<label><span>${esc(c.label)}</span><select ${prefix}="${esc(c.key)}">${c.options.map(o=>`<option value="${esc(o.value)}" ${String(defs[c.key])===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}
function syncStaffVariantCard(card){const vm=adminVM();if(!vm||!card)return null;const key=card.dataset.staffFamilyKey,sel=adminVariantSelections(card),family=vm.family(key);if(!family)return null;family.controls.forEach(c=>{const s=card.querySelector(`[data-admin-variant-control="${c.key}"]`),states=vm.optionState(menu,key,c.key,sel);[...(s?.options||[])].forEach(o=>{o.disabled=!!states.find(x=>String(x.value)===String(o.value))?.disabled})});let r=vm.resolveAvailable(menu,key,sel);if(r){family.controls.forEach(c=>{const s=card.querySelector(`[data-admin-variant-control="${c.key}"]`);if(s&&r.variant.values[c.key]!=null)s.value=r.variant.values[c.key]})}const price=card.querySelector('[data-staff-variant-price]'),summary=card.querySelector('[data-staff-variant-summary]'),desc=card.querySelector('[data-staff-variant-desc]'),btn=card.querySelector('[data-staff-variant-add]');if(price)price.textContent=r?money(r.item.price):'—';if(summary)summary.textContent=r?r.displayName:'No available option';if(desc)desc.textContent=r?(r.description||r.item.description||family.description):family.description;const bad=!r||r.item.active===false||r.item.soldOut;if(btn){btn.disabled=bad;btn.textContent=bad?'Sold Out':'Add'}return r}
function staffAddResolved(r){if(!r)return;const key=r.cartKey||r.item.id,row=staffCart.find(x=>(x._key||x.id)===key);if(row)row.qty++;else staffCart.push({id:r.item.id,_key:key,name:r.displayName||r.item.name,price:Number(r.item.price||0),qty:1});renderStaffCart()}
staffAdd=function(id){const m=menu.find(x=>x.id===id);if(m)staffAddResolved({item:m,displayName:m.name,cartKey:m.id})};
staffQty=function(key,d){const r=staffCart.find(x=>(x._key||x.id)===key);if(!r)return;r.qty+=d;if(r.qty<=0)staffCart=staffCart.filter(x=>(x._key||x.id)!==key);renderStaffCart()};
renderStaffPOS=function(){
  if(!A('#staffPosMenu'))return;const vm=adminVM(),cats=['All',...new Set(menu.filter(x=>x.active).map(x=>x.category))],current=A('#staffPosCategory').value||'All';A('#staffPosCategory').innerHTML=cats.map(c=>`<option ${c===current?'selected':''}>${esc(c)}</option>`).join('');const q=(A('#staffPosSearch').value||'').trim().toLowerCase(),cat=A('#staffPosCategory').value||'All';let entries=vm?vm.build(menu):menu.map((item,index)=>({kind:'item',item,index,category:item.category,searchText:`${item.name} ${item.category}`.toLowerCase()}));entries=entries.filter(e=>(cat==='All'||e.category===cat)&&(!q||e.searchText.includes(q)));
  A('#staffPosMenu').innerHTML=entries.map(e=>{if(e.kind==='item'){const x=e.item;return `<button class="pos-dish ${x.soldOut||!x.active?'pos-soldout':''}" data-staff-add="${esc(x.id)}" ${x.soldOut||!x.active?'disabled':''}><b>${esc(x.name)}</b><span>${esc(x.category)}</span><strong>${x.soldOut?'SOLD OUT':money(x.price)}</strong></button>`}const f=vm.family(e.key),defs=vm.defaults(menu,e.key);return `<div class="pos-dish pos-variant-card" data-staff-family-key="${esc(e.key)}"><div class="pos-variant-head"><div><b>${esc(e.title)}</b><span>${esc(e.category)}</span></div><strong data-staff-variant-price>${esc(vm.priceLabel(e))}</strong></div><small class="variant-live-desc" data-staff-variant-desc>${esc(e.description||f.description||'Choose options')}</small><div class="pos-variant-controls">${adminVariantControls(f,defs)}</div><small data-staff-variant-summary></small><button type="button" class="pos-variant-add" data-staff-variant-add>Add</button></div>`}).join('')||'<p>No matching items.</p>';
  A('#staffPosMenu').querySelectorAll('[data-staff-add]').forEach(b=>b.onclick=()=>staffAdd(b.dataset.staffAdd));A('#staffPosMenu').querySelectorAll('[data-staff-family-key]').forEach(card=>{card.querySelectorAll('[data-admin-variant-control]').forEach(s=>s.onchange=()=>syncStaffVariantCard(card));card.querySelector('[data-staff-variant-add]').onclick=()=>staffAddResolved(syncStaffVariantCard(card));syncStaffVariantCard(card)});renderStaffCart()
};
renderStaffCart=function(){const root=A('#staffCart');if(!root)return;root.innerHTML=staffCart.length?staffCart.map(x=>{const key=x._key||x.id;return `<div class="cart-line"><div><b>${esc(x.name)}</b><small>${money(x.price)} each</small></div><div class="qty-control"><button data-staff-qty="${esc(key)}" data-delta="-1">−</button><span>${x.qty}</span><button data-staff-qty="${esc(key)}" data-delta="1">+</button><b>${money(x.price*x.qty)}</b></div></div>`}).join(''):'<p class="muted">No items yet.</p>';root.querySelectorAll('[data-staff-qty]').forEach(b=>b.onclick=()=>staffQty(b.dataset.staffQty,Number(b.dataset.delta)));const sub=staffCart.reduce((s,x)=>s+x.price*x.qty,0),select=A('#staffSalePromo'),old=select.value;select.innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...select.options].some(o=>o.value===old))select.value=old;const pd=calcPromo(sub,select.value),md=Number(A('#staffManualDiscount').value)||0,disc=Math.min(sub,pd+md),tax=(sub-disc)*.13,total=sub-disc+tax;A('#staffTotals').innerHTML=`<div><span>Subtotal</span><b>${money(sub)}</b></div><div><span>Discount</span><b>−${money(disc)}</b></div><div><span>HST 13%</span><b>${money(tax)}</b></div><div class="grand"><span>Total</span><b>${money(total)}</b></div>`};
staffCompleteSale=async function(){if(!staffCart.length)return toast('Add at least one item.');const channel=A('#staffSaleChannel').value,fulfillment=channel.toLowerCase()==='walk-in'?'walk-in':channel.toLowerCase(),payload={items:staffCart.map(x=>({id:x.id,qty:x.qty,displayName:x.name,priceOverride:x.price})),promotionId:A('#staffSalePromo').value,manualDiscount:Number(A('#staffManualDiscount').value)||0,payment:A('#staffSalePayment').value,channel,fulfillment,status:'new',customer:{name:A('#staffCustomerName').value||(channel==='Dine-in'?'Dine-in customer':'Walk-in customer'),phone:A('#staffCustomerPhone').value,email:A('#staffCustomerEmail').value},notes:A('#staffSaleNotes').value};const d=await req('/api/admin/orders',{method:'POST',body:JSON.stringify(payload)});staffCart=[];for(const id of ['staffManualDiscount','staffCustomerName','staffCustomerPhone','staffCustomerEmail','staffSaleNotes'])A('#'+id).value=id==='staffManualDiscount'?0:'';A('#staffSaleMsg').innerHTML=`<div class="success-note">Created ${esc(d.order.orderNo)} · ${money(d.order.total)} · now waiting in Orders / All</div>`;toast('POS order created — Accept it in Orders');await refresh();AA('#adminTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab==='orders'));AA('.admin-tab').forEach(x=>x.hidden=x.id!=='tab-orders')};
if(A('#staffCompleteSale'))A('#staffCompleteSale').onclick=staffCompleteSale;

function editKey(x){return x._key||`${x.id}::${x.name||''}`}
editQty=function(key,d){const r=editCart.find(x=>editKey(x)===key);if(!r)return;r.qty+=d;if(r.qty<=0)editCart=editCart.filter(x=>editKey(x)!==key);renderEditor()};
editRemove=function(key){editCart=editCart.filter(x=>editKey(x)!==key);renderEditor()};
function editAddResolved(r){if(!r)return;const key=r.cartKey||r.item.id,row=editCart.find(x=>editKey(x)===key);if(row)row.qty++;else editCart.push({id:r.item.id,_key:key,name:r.displayName||r.item.name,price:Number(r.item.price||0),qty:1});renderEditor()}
editAdd=function(id){const m=menu.find(x=>x.id===id);if(m)editAddResolved({item:m,displayName:m.name,cartKey:m.id})};
function editorVariantSelections(card){const out={};card.querySelectorAll('[data-edit-variant-control]').forEach(s=>out[s.dataset.editVariantControl]=s.value);return out}
function syncEditorVariantCard(card){const vm=adminVM(),key=card.dataset.editFamilyKey,f=vm?.family(key);if(!vm||!f)return null;const sel=editorVariantSelections(card);let r=vm.resolveAvailable(menu,key,sel);if(r){f.controls.forEach(c=>{const s=card.querySelector(`[data-edit-variant-control="${c.key}"]`);if(s&&r.variant.values[c.key]!=null)s.value=r.variant.values[c.key]})}const p=card.querySelector('[data-edit-variant-price]'),sm=card.querySelector('[data-edit-variant-summary]'),desc=card.querySelector('[data-edit-variant-desc]'),btn=card.querySelector('[data-edit-variant-add]');if(p)p.textContent=r?money(r.item.price):'—';if(sm)sm.textContent=r?r.displayName:'Unavailable';if(desc)desc.textContent=r?(r.description||r.item.description||f.description):f.description;if(btn)btn.disabled=!r||r.item.soldOut||!r.item.active;return r}
openOrderEditor=function(id){editingOrder=orders.find(o=>o.id===id);if(!editingOrder)return;editCart=(editingOrder.items||[]).map(x=>({...x,_key:`${x.id}::${x.name||''}`}));A('#orderModal').hidden=false;document.body.classList.add('modal-open');A('#modalOrderTitle').textContent=`${editingOrder.orderNo} · ${sourceLabel(editingOrder)}`;A('#editCustomerName').value=editingOrder.customer?.name||'';A('#editCustomerPhone').value=editingOrder.customer?.phone||'';A('#editCustomerEmail').value=editingOrder.customer?.email||'';A('#editManualDiscount').value=Number(editingOrder.manualDiscount||0);A('#editPayment').value=[...A('#editPayment').options].some(x=>x.value===editingOrder.payment)?editingOrder.payment:'Cash';A('#editFulfillment').value=[...A('#editFulfillment').options].some(x=>x.value===editingOrder.fulfillment)?editingOrder.fulfillment:'pickup';A('#editAddress').value=editingOrder.address||'';A('#editDistance').value=Number(editingOrder.finalDistanceKm||editingOrder.customerDistanceKm||0)||'';A('#editNotes').value=editingOrder.notes||'';A('#editMenuSearch').value='';ensureEditorChrome();renderEditor()};
renderEditor=function(){
  if(!editingOrder)return;ensureEditorChrome();const vm=adminVM(),sub=editCart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0),old=A('#editPromotion').value||editingOrder.promotionId||'';A('#editPromotion').innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...A('#editPromotion').options].some(x=>x.value===old))A('#editPromotion').value=old;const itemCount=editCart.reduce((s,x)=>s+Number(x.qty||0),0),meta=A('#orderEditorMeta');if(meta)meta.innerHTML=`<div class="meta-card"><span>Status</span><b>${statusTone(editingOrder.status)}</b></div><div class="meta-card"><span>Source</span><b>${sourceLabel(editingOrder)}</b></div><div class="meta-card"><span>Created</span><b>${adminDT(editingOrder.createdAt||editingOrder.updatedAt)}</b></div><div class="meta-card"><span>Items</span><b>${itemCount} item${itemCount===1?'':'s'}</b></div>`;
  A('#editOrderItems').innerHTML=editCart.length?editCart.map(x=>{const key=editKey(x);return `<div class="editor-item"><div class="editor-item-main"><b>${esc(x.name)}</b>${Array.isArray(x.modifiers)&&x.modifiers.length?`<small class="order-modifiers">${x.modifiers.map(esc).join(' · ')}</small>`:''}<small>${money(x.price)} each</small><div class="chip-line"><span class="chip">Qty ${x.qty}</span><span class="chip">Line ${money(Number(x.price)*Number(x.qty))}</span></div></div><div class="qty-control"><button data-edit-qty="${esc(key)}" data-delta="-1">−</button><span>${x.qty}</span><button data-edit-qty="${esc(key)}" data-delta="1">+</button><b class="editor-line-total">${money(Number(x.price)*Number(x.qty))}</b><button class="remove-line" data-edit-remove="${esc(key)}">Remove</button></div></div>`}).join(''):`<div class="editor-empty-state"><strong>No items in this order yet.</strong><div class="summary-caption">Search and choose options below to add dishes.</div></div>`;A('#editOrderItems').querySelectorAll('[data-edit-qty]').forEach(b=>b.onclick=()=>editQty(b.dataset.editQty,Number(b.dataset.delta)));A('#editOrderItems').querySelectorAll('[data-edit-remove]').forEach(b=>b.onclick=()=>editRemove(b.dataset.editRemove));
  const q=(A('#editMenuSearch').value||'').trim().toLowerCase();let entries=vm?vm.build(menu):menu.map((item,index)=>({kind:'item',item,index,category:item.category,searchText:`${item.name} ${item.category}`.toLowerCase()}));entries=entries.filter(e=>!q||e.searchText.includes(q)).slice(0,10);A('#editMenuResults').innerHTML=entries.map(e=>{if(e.kind==='item'){const x=e.item;return `<button class="editor-menu-choice" data-edit-add="${esc(x.id)}" ${x.soldOut||!x.active?'disabled':''}><span><b>${esc(x.name)}</b><small>${esc(x.category||'')}</small></span><b>${x.soldOut?'SOLD OUT':money(x.price)}</b></button>`}const f=vm.family(e.key),d=vm.defaults(menu,e.key);return `<div class="editor-variant-card" data-edit-family-key="${esc(e.key)}"><div class="editor-variant-title"><span><b>${esc(e.title)}</b><small>${esc(e.category)}</small></span><strong data-edit-variant-price>${esc(vm.priceLabel(e))}</strong></div><small class="variant-live-desc" data-edit-variant-desc>${esc(e.description||f.description||'Choose options')}</small><div class="editor-variant-controls">${f.controls.map(c=>`<label><span>${esc(c.label)}</span><select data-edit-variant-control="${esc(c.key)}">${c.options.map(o=>`<option value="${esc(o.value)}" ${String(d[c.key])===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}</div><small data-edit-variant-summary></small><button type="button" data-edit-variant-add>Add selected option</button></div>`}).join('')||'<div class="editor-empty-state">No matching menu items.</div>';A('#editMenuResults').querySelectorAll('[data-edit-add]').forEach(b=>b.onclick=()=>editAdd(b.dataset.editAdd));A('#editMenuResults').querySelectorAll('[data-edit-family-key]').forEach(card=>{card.querySelectorAll('[data-edit-variant-control]').forEach(s=>s.onchange=()=>syncEditorVariantCard(card));card.querySelector('[data-edit-variant-add]').onclick=()=>editAddResolved(syncEditorVariantCard(card));syncEditorVariantCard(card)});
  A('#editDeliveryWrap').style.display=A('#editFulfillment').value==='delivery'?'grid':'none';const t=editorTotals();A('#editTotals').innerHTML=`<div class="totals-pro"><div class="tot-row"><span>Subtotal</span><strong>${money(t.sub)}</strong></div><div class="tot-row"><span>Discount</span><strong>−${money(t.disc)}</strong></div>${t.delivery?`<div class="tot-row"><span>Delivery</span><strong>${money(t.delivery)}</strong></div>`:''}<div class="tot-row"><span>HST 13%</span><strong>${money(t.tax)}</strong></div><div class="tot-row grand"><span>Total</span><strong>${money(t.total)}</strong></div><div class="summary-caption">Promotion + manual discount are calculated live before tax.</div></div>`
};
saveOrderEdits=async function(markComplete=false){if(!editingOrder||!editCart.length)return toast('Order must contain at least one item.');const payload={items:editCart.map(x=>({id:x.id,qty:x.qty,priceOverride:x.price,displayName:x.name,modifiers:Array.isArray(x.modifiers)?x.modifiers:[],selections:x.selections||null})),customer:{name:A('#editCustomerName').value,phone:A('#editCustomerPhone').value,email:A('#editCustomerEmail').value},promotionId:A('#editPromotion').value,manualDiscount:Number(A('#editManualDiscount').value)||0,payment:A('#editPayment').value,fulfillment:A('#editFulfillment').value,address:A('#editAddress').value,finalDistanceKm:Number(A('#editDistance').value)||0,notes:A('#editNotes').value};if(markComplete)payload.status='completed';const d=await req('/api/admin/orders/'+editingOrder.id,{method:'PATCH',body:JSON.stringify(payload)});editingOrder=d.order;toast(markComplete?'Order completed · thank-you update triggered':'Order checkout updated');if(markComplete)closeOrderEditor();await refresh();if(!markComplete&&editingOrder)openOrderEditor(editingOrder.id)};

// V11.16 — scheduled/pre-order awareness + high-visibility allergy alerts.
function torontoStampAdminV116(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
function scheduledStampAdminV116(o){const v=String(o?.requestedTime||'');return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)?v:''}
function orderDueAdminV116(o){if(o?.status!=='new')return false;const s=scheduledStampAdminV116(o);return !s||s<=torontoStampAdminV116()}
function orderScheduleHtmlV116(o){const s=scheduledStampAdminV116(o);if(!s)return `<div class="requested-order-strip asap"><b>Requested:</b> ASAP</div>`;const due=s<=torontoStampAdminV116();return `<div class="requested-order-strip ${due?'due':'future'}"><b>${due?'SCHEDULED ORDER DUE':'PRE-ORDER'}</b><span>${esc(s.replace('T',' · '))}</span></div>`}
function allergyAlertsAdminV116(o){const alerts=[];(o?.items||[]).forEach(i=>(i.modifiers||[]).forEach(m=>{if(/allergy|gluten|no msg|canola/i.test(String(m)))alerts.push(`${i.name}: ${String(m).replace(/^⚠\s*/, '')}`)}));return [...new Set(alerts)]}
function pregnancyNotesAdminV118(o){const notes=[];(o?.items||[]).forEach(i=>(i.modifiers||[]).forEach(m=>{if(/^Pregnancy:/i.test(String(m)))notes.push(`${i.name}: ${String(m).replace(/^Pregnancy:\s*/i,'')}`)}));return [...new Set(notes)]}

renderOrders=function(){
  const active=o=>!['completed','cancelled'].includes(o.status),nowStamp=torontoStampAdminV116();let list=filter==='active'?orders.filter(active):filter==='all'?orders:orders.filter(o=>o.status===filter);
  if(filter==='active')list=[...list].sort((a,b)=>{const sa=scheduledStampAdminV116(a),sb=scheduledStampAdminV116(b),fa=sa&&sa>nowStamp?1:0,fb=sb&&sb>nowStamp?1:0;if(fa!==fb)return fa-fb;return String(sa||a.createdAt||'').localeCompare(String(sb||b.createdAt||''))});
  A('#ordersGrid').innerHTML=list.map(o=>{const scheduled=scheduledStampAdminV116(o),due=!scheduled||scheduled<=nowStamp,alerts=allergyAlertsAdminV116(o),preg=pregnancyNotesAdminV118(o);return `<article class="order-card ${o.status==='new'&&due?'is-new':''} ${o.status==='new'&&!due?'is-scheduled':''} ${o.status==='ready'?'is-ready':''} ${alerts.length?'has-allergy-alert':''} ${preg.length?'has-pregnancy-note':''}"><div class="order-head"><div><small>${new Date(o.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${esc(sourceLabel(o))}</small><h3>${esc(o.orderNo)}</h3></div><span class="status-badge ${esc(o.status)}">${o.status==='new'&&!due?'scheduled':esc(o.status).replaceAll('-',' ')}</span></div>${orderScheduleHtmlV116(o)}${alerts.length?`<div class="allergy-order-alert"><strong>⚠ ALLERGY ALERT ⚠</strong><em>KITCHEN ATTENTION REQUIRED</em>${alerts.map(a=>`<span>${esc(a)}</span>`).join('')}<small>STOP & READ BEFORE PREPARING THIS ORDER</small></div>`:''}${preg.length?`<div class="pregnancy-order-note"><strong>Pregnancy preparation note</strong>${preg.map(a=>`<span>${esc(a)}</span>`).join('')}<small>Follow the customer's preparation requests exactly.</small></div>`:''}<div class="order-meta"><div><b>${esc(o.customer?.name||'Guest')}</b>${esc(o.customer?.phone||'No phone')}<small>${esc(o.customer?.email||'')}</small></div><div><b>${esc(String(o.fulfillment||'').toUpperCase())}</b>${esc(o.payment||'')}</div></div><div class="order-items">${o.items.map(i=>`<div class="order-item"><span>${i.qty}× ${esc(i.name)}${Array.isArray(i.modifiers)&&i.modifiers.length?`<small class="order-modifiers">${i.modifiers.map(m=>`<b class="${/allergy|gluten|no msg|canola/i.test(m)?'modifier-allergy':/^Pregnancy:/i.test(m)?'modifier-pregnancy':''}">${esc(m)}</b>`).join(' · ')}</small>`:''}</span><b>${money(i.price*i.qty)}</b></div>`).join('')}</div><div class="mini-bill"><span>Subtotal ${money(o.subtotal)}</span>${o.discount?`<span>Discount −${money(o.discount)}${o.promotion?` · ${esc(o.promotion)}`:''}</span>`:''}${o.deliveryFee?`<span>Delivery ${money(o.deliveryFee)}</span>`:''}<span>HST ${money(o.tax)}</span></div>${deliveryEditor(o)}<div class="order-total"><span>Total</span><strong>${money(o.total)}</strong></div><div class="order-actions"><button class="action-btn checkout" onclick="openOrderEditor('${o.id}')">Edit / Checkout</button>${['accepted','preparing','ready',o.fulfillment==='delivery'?'out-for-delivery':'completed','completed'].filter((v,i,a)=>a.indexOf(v)===i).map(st=>`<button class="action-btn ${st==='completed'?'secondary':''}" onclick="setStatus('${o.id}','${st}')">${st==='ready'?(o.fulfillment==='pickup'?'READY FOR PICKUP':o.fulfillment==='dine-in'?'READY FOR DINE-IN':'READY'):st==='completed'?'PAID & COMPLETED':st.replaceAll('-',' ')}</button>`).join('')}</div></article>`}).join('');
  A('#emptyState').hidden=!!list.length;A('#statNew').textContent=orders.filter(orderDueAdminV116).length;A('#statPreparing').textContent=orders.filter(o=>o.status==='preparing').length;A('#statReady').textContent=orders.filter(o=>['ready','out-for-delivery'].includes(o.status)).length;const today=new Date().toDateString();A('#statCompleted').textContent=orders.filter(o=>o.status==='completed'&&new Date(o.updatedAt).toDateString()===today).length;
};

syncAlarm=function(){
  const due=orders.filter(orderDueAdminV116),count=due.length,b=A('#alarmBanner');
  if(!soundEnabled||count===0){silenceOrderAlertV115();return}
  document.body.classList.add('order-alarm-active');if(b){b.hidden=false;b.innerHTML=`🔔 <b>${count} ORDER${count>1?'S':''} DUE NOW</b> — alert loops continuously until ${count>1?'all are':'the order is'} ACCEPTED`;}
  alarmBurst();
};

// V11.19 — customer-request visibility + cleaner Staff checkout + delivery fee after food tax.
function requestGroupsAdminV119(orderLike){
  const items=orderLike?.items||[];
  const out={allergy:[],pregnancy:[],preferences:[],notes:[]};
  for(const item of items){
    for(const raw of (Array.isArray(item.modifiers)?item.modifiers:[])){
      const m=String(raw||'').trim(); if(!m) continue;
      const label=`${item.name}: ${m}`;
      if(/allergy|gluten|no msg|canola/i.test(m)) out.allergy.push(label.replace(/^(.+?):\s*⚠\s*/,'$1: '));
      else if(/^Pregnancy:/i.test(m)) out.pregnancy.push(label.replace(/Pregnancy:\s*/i,''));
      else if(/^Item note:/i.test(m)) out.notes.push(label.replace(/Item note:\s*/i,''));
      else out.preferences.push(label);
    }
  }
  if(String(orderLike?.notes||'').trim())out.notes.push(`Order note: ${String(orderLike.notes).trim()}`);
  for(const k of Object.keys(out))out[k]=[...new Set(out[k])];
  return out;
}
function kitchenRequestSummaryAdminV1132(orderLike){
  const itemLines=[],seen=new Set();let urgent=false;
  for(const item of (orderLike?.items||[])){
    const notes=[];
    for(const raw of (Array.isArray(item.modifiers)?item.modifiers:[])){
      let m=String(raw||'').trim();if(!m)continue;
      if(/allergy|gluten|no msg|canola/i.test(m))urgent=true;
      m=m.replace(/^⚠\s*ALLERGY:\s*/i,'⚠ ALLERGY: ').replace(/^Item note:\s*/i,'Note: ');
      if(!notes.includes(m))notes.push(m);
    }
    if(notes.length){const line=`${item.name}: ${notes.join(' · ')}`;if(!seen.has(line)){seen.add(line);itemLines.push(line)}}
  }
  const orderNote=String(orderLike?.notes||'').trim();if(orderNote){const line=`Order note: ${orderNote}`;if(!seen.has(line))itemLines.push(line)}
  return {text:itemLines.join('  |  '),urgent};
}
function requestPanelAdminV119(o,compact=false){
  const summary=kitchenRequestSummaryAdminV1132(o);
  if(!summary.text)return '';
  return `<div class="staff-kitchen-line-v1134 ${summary.urgent?'urgent':''}"><strong>${summary.urgent?'⚠ KITCHEN NOTES':'KITCHEN NOTES'}</strong><span>${esc(summary.text)}</span></div>`;
}
editorTotals=function(){
  const sub=editCart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0),promo=A('#editPromotion')?.value||'',pd=calcPromo(sub,promo),manual=Number(A('#editManualDiscount')?.value)||0,disc=Math.min(sub,pd+manual),afterDiscount=Math.max(0,sub-disc),ful=A('#editFulfillment')?.value||'pickup',dist=Number(A('#editDistance')?.value)||0,delivery=ful==='delivery'?(dist>0?(dist<=5?6:6+Math.ceil(dist-5)):0):0,tax=afterDiscount*.13,foodAfterTax=afterDiscount+tax,total=foodAfterTax+delivery;
  return{sub,disc,afterDiscount,delivery,tax,foodAfterTax,total};
};
function cleanEditorAfterRenderV119(){
  if(!editingOrder)return;
  const left=document.querySelector('#orderModal .editor-layout>div'),aside=document.querySelector('#orderModal .editor-layout>aside');
  if(left){
    const customer=A('#orderModal .editor-customer'),add=A('#orderModal .editor-add'),items=A('#orderModal .editor-items');
    if(customer&&!customer.querySelector('.editor-block-title'))customer.insertAdjacentHTML('afterbegin','<div class="editor-block-title"><span>1</span><div><b>Customer</b><small>Contact details for this order</small></div></div>');
    if(add&&!add.querySelector('.editor-block-title'))add.insertAdjacentHTML('afterbegin','<div class="editor-block-title"><span>2</span><div><b>Add items</b><small>Search only if the order needs changes</small></div></div>');
    if(items&&!items.previousElementSibling?.classList?.contains('editor-items-label'))items.insertAdjacentHTML('beforebegin','<div class="editor-items-label"><span>3</span><div><b>Order items</b><small>Review quantities and customer selections</small></div></div>');
    let reqBox=A('#editorCustomerRequestsV119');if(!reqBox){reqBox=document.createElement('div');reqBox.id='editorCustomerRequestsV119';customer?.insertAdjacentElement('afterend',reqBox)}
    if(reqBox)reqBox.innerHTML=requestPanelAdminV119({...editingOrder,items:editCart,notes:A('#editNotes')?.value||editingOrder.notes});
  }
  if(aside&&!A('#checkoutSideHeadingV119'))aside.insertAdjacentHTML('afterbegin','<div id="checkoutSideHeadingV119" class="checkout-side-heading"><span>CHECKOUT</span><b>Payment & totals</b><small>Update only what changed. Totals recalculate automatically.</small></div>');
  const t=editorTotals(),totals=A('#editTotals');
  if(totals)totals.innerHTML=`<div class="staff-total-stack">
    <div><span>Subtotal before tax</span><strong>${money(t.sub)}</strong></div>
    <div class="discount"><span>Discount</span><strong>−${money(t.disc)}</strong></div>
    <div><span>Subtotal after discount</span><strong>${money(t.afterDiscount)}</strong></div>
    <div><span>HST 13% on food</span><strong>${money(t.tax)}</strong></div>
    <div class="food-tax-total"><span>Food total after tax</span><strong>${money(t.foodAfterTax)}</strong></div>
    ${t.delivery?`<div class="delivery-nontax"><span>Delivery fee <small>NOT TAXED</small></span><strong>+${money(t.delivery)}</strong></div>`:''}
    <div class="grand"><span>FINAL TOTAL</span><strong>${money(t.total)}</strong></div>
    <p>${t.delivery?'Delivery fee is added after food HST and is not included in the tax calculation.':'HST is calculated after discounts on the food subtotal.'}</p>
  </div>`;
  const deliveryWrap=A('#editDeliveryWrap');if(deliveryWrap&&A('#editFulfillment')?.value==='delivery'&&!deliveryWrap.querySelector('.delivery-tax-note'))deliveryWrap.insertAdjacentHTML('beforeend','<div class="delivery-tax-note">Delivery fee is added after food tax. <b>No HST is calculated on the delivery fee in this checkout configuration.</b></div>');
}
const _renderEditorBeforeV119=renderEditor;
renderEditor=function(){_renderEditorBeforeV119();cleanEditorAfterRenderV119()};
const _openOrderEditorBeforeV119=openOrderEditor;
openOrderEditor=function(id){_openOrderEditorBeforeV119(id);cleanEditorAfterRenderV119()};

renderOrders=function(){
  const active=o=>!['completed','cancelled'].includes(o.status),nowStamp=torontoStampAdminV116();let list=filter==='active'?orders.filter(active):filter==='all'?orders:orders.filter(o=>o.status===filter);
  if(filter==='active')list=[...list].sort((a,b)=>{const sa=scheduledStampAdminV116(a),sb=scheduledStampAdminV116(b),fa=sa&&sa>nowStamp?1:0,fb=sb&&sb>nowStamp?1:0;if(fa!==fb)return fa-fb;return String(sa||a.createdAt||'').localeCompare(String(sb||b.createdAt||''))});
  A('#ordersGrid').innerHTML=list.map(o=>{
    const scheduled=scheduledStampAdminV116(o),due=!scheduled||scheduled<=nowStamp,requests=requestGroupsAdminV119(o),hasRequests=requests.allergy.length||requests.pregnancy.length||requests.preferences.length||requests.notes.length,afterDiscount=Math.max(0,Number(o.subtotal||0)-Number(o.discount||0)),foodAfterTax=afterDiscount+Number(o.tax||0);
    return `<article class="order-card ${o.status==='new'&&due?'is-new':''} ${o.status==='new'&&!due?'is-scheduled':''} ${o.status==='ready'?'is-ready':''} ${requests.allergy.length?'has-allergy-alert':''}">
      <div class="order-head"><div><small>${new Date(o.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${esc(sourceLabel(o))}</small><h3>${esc(o.orderNo)}</h3></div><span class="status-badge ${esc(o.status)}">${o.status==='new'&&!due?'scheduled':esc(o.status).replaceAll('-',' ')}</span></div>
      ${orderScheduleHtmlV116(o)}
      ${hasRequests?requestPanelAdminV119(o,true):''}
      <div class="order-meta"><div><b>${esc(o.customer?.name||'Guest')}</b>${esc(o.customer?.phone||'No phone')}<small>${esc(o.customer?.email||'')}</small></div><div><b>${esc(String(o.fulfillment||'').toUpperCase())}</b>${esc(o.payment||'')}</div></div>
      <div class="order-items">${o.items.map(i=>`<div class="order-item"><span>${i.qty}× ${esc(i.name)}</span><b>${money(i.price*i.qty)}</b></div>`).join('')}</div>
      <div class="order-money-stack"><div><span>Subtotal</span><b>${money(o.subtotal)}</b></div>${o.discount?`<div><span>Discount</span><b>−${money(o.discount)}</b></div>`:''}<div><span>After discount</span><b>${money(afterDiscount)}</b></div><div><span>HST 13% on food</span><b>${money(o.tax)}</b></div><div><span>Food after tax</span><b>${money(foodAfterTax)}</b></div>${o.deliveryFee?`<div class="delivery-nontax"><span>Delivery <small>not taxed</small></span><b>+${money(o.deliveryFee)}</b></div>`:''}</div>
      ${deliveryEditor(o)}
      <div class="order-total"><span>Final total</span><strong>${money(o.total)}</strong></div>
      <div class="order-actions"><button class="action-btn checkout" onclick="openOrderEditor('${o.id}')">Edit / Checkout</button>${['accepted','preparing','ready',o.fulfillment==='delivery'?'out-for-delivery':'completed','completed'].filter((v,i,a)=>a.indexOf(v)===i).map(st=>`<button class="action-btn ${st==='completed'?'secondary':''}" onclick="setStatus('${o.id}','${st}')">${st==='ready'?(o.fulfillment==='pickup'?'READY FOR PICKUP':o.fulfillment==='dine-in'?'READY FOR DINE-IN':'READY'):st==='completed'?'PAID & COMPLETED':st.replaceAll('-',' ')}</button>`).join('')}</div>
    </article>`;
  }).join('');
  A('#emptyState').hidden=!!list.length;A('#statNew').textContent=orders.filter(orderDueAdminV116).length;A('#statPreparing').textContent=orders.filter(o=>o.status==='preparing').length;A('#statReady').textContent=orders.filter(o=>['ready','out-for-delivery'].includes(o.status)).length;const today=new Date().toDateString();A('#statCompleted').textContent=orders.filter(o=>o.status==='completed'&&new Date(o.updatedAt).toDateString()===today).length;
};

const _deliveryEditorV119=deliveryEditor;
deliveryEditor=function(o){const html=_deliveryEditorV119(o);return html?html.replace('Final fee:', 'Final fee (not taxed):').replace('</div><a target=', '</div><div class="delivery-tax-note">Delivery fee is added after food HST and is not taxed in this checkout configuration.</div><a target='):html};

printOrder=function(){
  if(!editingOrder)return;const t=editorTotals(),req=requestPanelAdminV119({...editingOrder,items:editCart,notes:A('#editNotes')?.value||''}),items=editCart.map(x=>`<tr><td>${x.qty} × ${esc(x.name)}${Array.isArray(x.modifiers)&&x.modifiers.length?`<br><small>${x.modifiers.map(esc).join(' · ')}</small>`:''}</td><td style="text-align:right">${money(x.price*x.qty)}</td></tr>`).join(''),w=window.open('','_blank','width=620,height=820');
  w.document.write(`<!doctype html><html><head><title>${esc(editingOrder.orderNo)}</title><style>body{font-family:Arial;padding:28px;color:#183c3e}h1{margin:0;color:#075a5d}small{color:#666}table{width:100%;margin:20px 0;border-collapse:collapse}td{padding:8px 0;border-bottom:1px dashed #ccc}.totals{margin-left:auto;max-width:380px}.totals div{display:flex;justify-content:space-between;padding:6px 0}.grand{font-size:22px;font-weight:bold;border-top:2px solid #075a5d;margin-top:8px;padding-top:10px!important}.requests{border:2px solid #c91f16;padding:12px;margin:14px 0}.note{font-size:11px;color:#665}</style></head><body><h1>Viet Nom Nom</h1><small>6645 Tecumseh Rd E, Windsor, ON N8T 1E7</small><h2>${esc(editingOrder.orderNo)}</h2><p>${esc(A('#editCustomerName').value)}<br>${esc(A('#editCustomerPhone').value)}<br>${esc(A('#editCustomerEmail').value)}</p>${req.includes('ALLERGY')?`<div class="requests"><b>⚠ CUSTOMER SPECIAL REQUESTS / ALLERGY</b><br>${requestGroupsAdminV119({...editingOrder,items:editCart,notes:A('#editNotes').value}).allergy.map(esc).join('<br>')}</div>`:''}<table>${items}</table><div class="totals"><div><span>Subtotal before tax</span><b>${money(t.sub)}</b></div><div><span>Discount</span><b>−${money(t.disc)}</b></div><div><span>Subtotal after discount</span><b>${money(t.afterDiscount)}</b></div><div><span>HST 13% on food</span><b>${money(t.tax)}</b></div><div><span>Food total after tax</span><b>${money(t.foodAfterTax)}</b></div>${t.delivery?`<div><span>Delivery fee (not taxed)</span><b>+${money(t.delivery)}</b></div>`:''}<div class="grand"><span>FINAL TOTAL</span><b>${money(t.total)}</b></div></div><p class="note">${t.delivery?'Delivery fee is added after food tax and is not included in HST.':''}</p><p>Payment: ${esc(A('#editPayment').value)}</p><p>Thank you!</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()
};
if(A('#editNotes'))A('#editNotes').addEventListener('input',()=>{if(editingOrder)cleanEditorAfterRenderV119()});
// Preserve the original website fulfillment/payment values when staff opens checkout.
const _openOrderEditorV119Normalized=openOrderEditor;
openOrderEditor=function(id){
  _openOrderEditorV119Normalized(id);
  if(!editingOrder)return;
  const f=String(editingOrder.fulfillment||'pickup').toLowerCase().replace('_','-');
  const payRaw=String(editingOrder.payment||'');
  const payMap={'e-transfer':'etransfer','etransfer':'etransfer','counter':'counter','cash-driver':'cash-driver','cash':'Cash','debit':'Debit','credit':'Credit'};
  const pay=payMap[payRaw.toLowerCase()]||payRaw;
  if(A('#editFulfillment')&&[...A('#editFulfillment').options].some(o=>o.value===f))A('#editFulfillment').value=f;
  if(A('#editPayment')&&[...A('#editPayment').options].some(o=>o.value===pay))A('#editPayment').value=pay;
  renderEditor();
};


// V11.21 — pre-order preparation alarm.
// ASAP/new orders still alert until Accepted.
// Accepted pre-orders begin alerting 30 minutes before the requested time and
// keep ringing until Staff moves the order to Preparing.
function scheduleMinutesAwayAdminV1121(o){
  const stamp=scheduledStampAdminV116(o);
  if(!stamp)return null;
  const now=torontoStampAdminV116();
  const a=Date.parse(stamp+':00Z'),b=Date.parse(now+':00Z');
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  return Math.round((a-b)/60000);
}
function staffAlarmReasonV1121(o){
  const stamp=scheduledStampAdminV116(o);
  if(o?.status==='new'){
    if(!stamp)return 'NEW ORDER';
    const mins=scheduleMinutesAwayAdminV1121(o);
    return mins!==null&&mins<=30?'PRE-ORDER NEEDS ACCEPTANCE':null;
  }
  if(o?.status==='accepted'&&stamp){
    const mins=scheduleMinutesAwayAdminV1121(o);
    if(mins!==null&&mins<=30)return 'PRE-ORDER · START PREPARING';
  }
  return null;
}
function staffAlarmOrdersV1121(){return orders.map(o=>({o,reason:staffAlarmReasonV1121(o)})).filter(x=>x.reason)}
syncAlarm=function(){
  const alerts=staffAlarmOrdersV1121(),b=A('#alarmBanner');
  if(!soundEnabled||!alerts.length){silenceOrderAlertV115();return}
  const prep=alerts.filter(x=>x.reason.includes('START PREPARING')).length;
  const unaccepted=alerts.filter(x=>x.reason.includes('NEEDS ACCEPTANCE')).length;
  const fresh=alerts.filter(x=>x.reason==='NEW ORDER').length;
  const parts=[];
  if(fresh)parts.push(`${fresh} NEW ORDER${fresh>1?'S':''}`);
  if(unaccepted)parts.push(`${unaccepted} PRE-ORDER${unaccepted>1?'S':''} NEED ACCEPTANCE`);
  if(prep)parts.push(`${prep} PRE-ORDER${prep>1?'S':''} START WITHIN 30 MIN`);
  document.body.classList.add('order-alarm-active');
  if(b){b.hidden=false;b.innerHTML=`🔔 <b>${parts.join(' · ')}</b> — ${prep?'move pre-order to PREPARING to silence prep alert':'press ACCEPT to silence new-order alert'}`;}
  alarmBurst();
};
const _orderScheduleHtmlV1121=orderScheduleHtmlV116;
orderScheduleHtmlV116=function(o){
  const base=_orderScheduleHtmlV1121(o),mins=scheduleMinutesAwayAdminV1121(o);
  if(!scheduledStampAdminV116(o)||o.status!=='accepted'||mins===null)return base;
  const note=mins<=30?'🔔 PREP WINDOW OPEN — start preparing now':`Prep alert starts 30 min before · ${mins} min until requested time`;
  return base.replace('</div>',`<small class="preorder-prep-note">${esc(note)}</small></div>`);
};

// V11.22 — delivery operations, customer pickup acknowledgement,
// staff POS modifiers, and a clean non-recursive Edit / Checkout flow.
function customerComingAtAdminV1122(o){const m=String(o?.staffNote||'').match(/\[\[CUSTOMER_COMING:([^\]]+)\]\]/);return m?m[1]:''}
function customerComingHtmlAdminV1122(o){const at=customerComingAtAdminV1122(o);if(!at)return'';let when='just now';try{when=new Date(at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}catch{}return `<div class="customer-coming-banner">🚶 <b>Customer is coming for pickup</b><span>Confirmed ${esc(when)}</span></div>`}
const _renderOrdersV1122Base=renderOrders;
renderOrders=function(){
  _renderOrdersV1122Base();
  A('#ordersGrid')?.querySelectorAll('.order-card').forEach(card=>{
    const orderNo=card.querySelector('.order-head h3')?.textContent?.trim(),o=orders.find(x=>x.orderNo===orderNo);if(!o)return;
    card.querySelector('.customer-coming-banner')?.remove();const html=customerComingHtmlAdminV1122(o);if(!html)return;
    const anchor=card.querySelector('.requested-order-strip')||card.querySelector('.order-head');anchor?.insertAdjacentHTML('afterend',html);
  });
};

function modifierSignatureAdminV1122(mods){return (mods||[]).join('|').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160)}
function staffCustomizerEligibleV1122(r){const x=r?.item;if(!x)return false;const cat=String(x.category||'').toLowerCase(),name=String(r.displayName||x.name||'').toLowerCase();return !(cat.includes('drink')||cat.includes('dessert')||/coffee|soda|pepsi|coke|sprite|water|juice|lemonade/.test(name))}
const STAFF_PACKAGED_BEVERAGE_IDS_V1137=new Set(['drink-coke','drink-pepsi','drink-water','drink-diet-coke','drink-diet-pepsi']);
function staffIceEligibleV1135(r){const x=r?.item;if(!x)return false;if(STAFF_PACKAGED_BEVERAGE_IDS_V1137.has(String(x.id||'')))return false;const cat=String(x.category||'').toLowerCase(),name=String(r.displayName||x.name||'').toLowerCase();return cat.includes('drink')||cat.includes('dessert')||/coffee|soda|pop|pepsi|coke|sprite|water|juice|lemonade|tea|smoothie/.test(name)}
function staffBanhMiEligibleV1138(r){const x=r?.item;if(!x)return false;const plain=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return plain(x.category).includes('banh mi')||plain(r.displayName||x.name||'').includes('banh mi')}
let staffCustomizerContextV1122=null;
function ensureStaffCustomizerV1122(){
  if(A('#staffItemCustomizerV1122'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="staffItemCustomizerV1122" class="staff-customizer" hidden>
    <div class="staff-customizer-backdrop" data-staff-customizer-close></div>
    <section class="staff-customizer-card" role="dialog" aria-modal="true">
      <div class="staff-customizer-head"><div><span>ITEM REQUESTS</span><h2 id="staffCustomizerTitleV1122">Customize item</h2><p id="staffCustomizerDescV1122"></p></div><button type="button" data-staff-customizer-close>×</button></div>
      <div class="staff-customizer-body">
        <section id="staffIceSectionV1135" hidden><h3>Ice preference <small>required for drinks & desserts</small></h3><div class="staff-chip-grid single"><label><input type="radio" name="staffIceV1135" value="Together in cup"><span>Ice together in cup</span></label><label><input type="radio" name="staffIceV1135" value="On the side"><span>Ice on the side</span></label></div></section>
        <section id="staffBanhMiSectionV1138" class="staff-banhmi-section-v1138" hidden><h3>Bánh Mì preferences <small>required for Bánh Mì</small></h3><p>Pickled vegetables</p><div class="staff-chip-grid single"><label><input type="radio" name="staffBanhMiPicklesV1138" value="In sandwich"><span>Keep in sandwich</span></label><label><input type="radio" name="staffBanhMiPicklesV1138" value="On the side"><span>Pickled veggies on the side</span></label></div><p>Toast the bánh mì?</p><div class="staff-chip-grid single"><label><input type="radio" name="staffBanhMiToastV1138" value="Toasted"><span>Toast the bánh mì</span></label><label><input type="radio" name="staffBanhMiToastV1138" value="Not toasted"><span>Do not toast</span></label></div></section>
        <section id="staffSpiceSectionV1135"><h3>Spice level <small>choose one</small></h3><div class="staff-chip-grid single">${['','Mild','Medium Spicy','Spicy','Very Spicy','Very ×2 Spicy'].map((v,i)=>`<label><input type="radio" name="staffSpiceV1122" value="${v}" ${i===0?'checked':''}><span>${v||'No spice preference'}</span></label>`).join('')}</div></section>
        <section id="staffRemoveSectionV1135"><h3>Remove / change ingredients</h3><div id="staffRemoveV1122" class="staff-chip-grid">${['No onion','No green onion','No cilantro','No vegetables','No bean sprouts'].map(v=>`<label><input type="checkbox" value="${v}"><span>${v}</span></label>`).join('')}</div></section>
        <section id="staffAllergySectionV1136" class="staff-allergy-section"><h3>⚠ Allergy / dietary alerts</h3><div id="staffAlertsV1122" class="staff-chip-grid">${['No MSG request','Peanut allergy','Gluten-free request','Canola oil allergy'].map(v=>`<label><input type="checkbox" value="${v}"><span>${v.replace(' request','')}</span></label>`).join('')}</div><small>These selections will appear as a large ALLERGY alert on the kitchen order.</small></section>
        <section id="staffPregnancySectionV1135"><h3>Pregnancy preparation requests</h3><div id="staffPregnancyV1122" class="staff-chip-grid">${['Fully cooked proteins','No rare beef','No raw bean sprouts','No runny egg','Mild spice'].map(v=>`<label><input type="checkbox" value="${v}"><span>${v}</span></label>`).join('')}</div></section>
        <label class="staff-customizer-note">Item note<textarea id="staffItemNoteV1122" rows="2" placeholder="Sauce on side, extra crispy, etc."></textarea></label>
      </div>
      <div class="staff-customizer-footer"><button type="button" class="secondary" data-staff-customizer-close>Cancel</button><button id="staffCustomizerAddV1122" type="button">Add item</button></div>
    </section></div>`);
  A('#staffItemCustomizerV1122').querySelectorAll('[data-staff-customizer-close]').forEach(b=>b.onclick=closeStaffCustomizerV1122);
  A('#staffCustomizerAddV1122').onclick=commitStaffCustomizerV1122;
}
function closeStaffCustomizerV1122(){const m=A('#staffItemCustomizerV1122');if(m)m.hidden=true;document.body.classList.remove('staff-customizer-open');staffCustomizerContextV1122=null}
function collectStaffModifiersV1122(){const ice=A('#staffIceSectionV1135')?.hidden?'':(A('input[name="staffIceV1135"]:checked')?.value||''),banhMi=A('#staffBanhMiSectionV1138'),banhMiActive=banhMi&&!banhMi.hidden,pickles=banhMiActive?(A('input[name="staffBanhMiPicklesV1138"]:checked')?.value||''):'',toastBread=banhMiActive?(A('input[name="staffBanhMiToastV1138"]:checked')?.value||''):'',spice=A('input[name="staffSpiceV1122"]:checked')?.value||'',rem=AA('#staffRemoveV1122 input:checked').map(x=>x.value),allergy=AA('#staffAlertsV1122 input:checked').map(x=>`⚠ ALLERGY: ${x.value}`),preg=AA('#staffPregnancyV1122 input:checked').map(x=>`Pregnancy: ${x.value}`),note=A('#staffItemNoteV1122')?.value.trim();return [ice?`Ice: ${ice}`:'',pickles?`Pickled veggies: ${pickles}`:'',toastBread?`Bread: ${toastBread}`:'',spice?`Spice: ${spice}`:'',...rem,...allergy,...preg,note?`Item note: ${note}`:''].filter(Boolean)}
function openStaffCustomizerV1122(resolved,target){
  const fullFood=staffCustomizerEligibleV1122(resolved),iceEligible=staffIceEligibleV1135(resolved),banhMiEligible=staffBanhMiEligibleV1138(resolved);if(!fullFood&&!iceEligible&&!banhMiEligible)return target==='edit'?editCommitResolvedV1122(resolved,[]):staffCommitResolvedV1122(resolved,[]);
  ensureStaffCustomizerV1122();staffCustomizerContextV1122={resolved,target};A('#staffCustomizerTitleV1122').textContent=resolved.displayName||resolved.item.name;A('#staffCustomizerDescV1122').textContent=banhMiEligible?'Choose the Bánh Mì preparation preferences.':(resolved.description||resolved.item.description||(iceEligible?'Choose how the customer wants the ice.':'Add any customer preparation requests.'));
  for(const id of ['staffSpiceSectionV1135','staffRemoveSectionV1135','staffPregnancySectionV1135','staffAllergySectionV1136']){const el=A('#'+id);if(el)el.hidden=!fullFood}const ice=A('#staffIceSectionV1135');if(ice)ice.hidden=!iceEligible;const banhMi=A('#staffBanhMiSectionV1138');if(banhMi)banhMi.hidden=!banhMiEligible;AA('input[name="staffIceV1135"],input[name="staffBanhMiPicklesV1138"],input[name="staffBanhMiToastV1138"]').forEach(x=>x.checked=false);AA('input[name="staffSpiceV1122"]').forEach((x,i)=>x.checked=i===0);AA('#staffRemoveV1122 input,#staffAlertsV1122 input,#staffPregnancyV1122 input').forEach(x=>x.checked=false);A('#staffItemNoteV1122').value='';A('#staffItemCustomizerV1122').hidden=false;document.body.classList.add('staff-customizer-open');
}
function commitStaffCustomizerV1122(){if(!staffCustomizerContextV1122)return;const {resolved,target}=staffCustomizerContextV1122;if(staffIceEligibleV1135(resolved)&&!A('input[name="staffIceV1135"]:checked'))return toast('Choose ice together in cup or ice on the side.');if(staffBanhMiEligibleV1138(resolved)&&(!A('input[name="staffBanhMiPicklesV1138"]:checked')||!A('input[name="staffBanhMiToastV1138"]:checked')))return toast('Choose the Bánh Mì pickled veggies and bread-toasting preferences.');const mods=collectStaffModifiersV1122();closeStaffCustomizerV1122();target==='edit'?editCommitResolvedV1122(resolved,mods):staffCommitResolvedV1122(resolved,mods)}
function staffCommitResolvedV1122(r,modifiers=[]){if(!r)return;const sig=modifierSignatureAdminV1122(modifiers),base=r.cartKey||r.item.id,key=sig?`${base}::mods::${sig}`:base,row=staffCart.find(x=>(x._key||x.id)===key);if(row)row.qty++;else staffCart.push({id:r.item.id,_key:key,name:r.displayName||r.item.name,price:Number(r.item.price||0),qty:1,modifiers:[...modifiers]});renderStaffCart()}
function editCommitResolvedV1122(r,modifiers=[]){if(!r)return;const sig=modifierSignatureAdminV1122(modifiers),base=r.cartKey||r.item.id,key=sig?`${base}::mods::${sig}`:base,row=editCart.find(x=>editKey(x)===key);if(row)row.qty++;else editCart.push({id:r.item.id,_key:key,name:r.displayName||r.item.name,price:Number(r.item.price||0),qty:1,modifiers:[...modifiers]});renderEditor()}
staffAddResolved=function(r){if(r)openStaffCustomizerV1122(r,'pos')};
editAddResolved=function(r){if(r)openStaffCustomizerV1122(r,'edit')};

function ensurePosRequestPreviewV1122(){if(A('#staffPosRequestPreviewV1122'))return A('#staffPosRequestPreviewV1122');const t=A('#staffTotals');if(!t)return null;const x=document.createElement('div');x.id='staffPosRequestPreviewV1122';x.className='staff-pos-request-preview';t.insertAdjacentElement('beforebegin',x);return x}
renderStaffCart=function(){
  const root=A('#staffCart');if(!root)return;root.innerHTML=staffCart.length?staffCart.map(x=>{const key=x._key||x.id,mods=Array.isArray(x.modifiers)?x.modifiers:[];return `<div class="cart-line"><div><b>${esc(x.name)}</b><small>${money(x.price)} each</small>${mods.length?`<div class="staff-cart-modifiers">${mods.map(m=>`<span class="${/allergy|gluten|no msg|canola/i.test(m)?'urgent':/^Pregnancy:/i.test(m)?'pregnancy':''}">${esc(m)}</span>`).join('')}</div>`:''}</div><div class="qty-control"><button data-staff-qty="${esc(key)}" data-delta="-1">−</button><span>${x.qty}</span><button data-staff-qty="${esc(key)}" data-delta="1">+</button><b>${money(x.price*x.qty)}</b></div></div>`}).join(''):'<p class="muted">No items yet.</p>';
  root.querySelectorAll('[data-staff-qty]').forEach(b=>b.onclick=()=>staffQty(b.dataset.staffQty,Number(b.dataset.delta)));
  const preview=ensurePosRequestPreviewV1122(),fake={items:staffCart,notes:A('#staffSaleNotes')?.value||''},groups=typeof requestGroupsAdminV119==='function'?requestGroupsAdminV119(fake):{allergy:[],pregnancy:[],preferences:[],notes:[]},has=groups.allergy.length||groups.pregnancy.length||groups.preferences.length||groups.notes.length;if(preview){preview.hidden=!has;preview.innerHTML=has?requestPanelAdminV119(fake,true):''}
  const sub=staffCart.reduce((sum,x)=>sum+Number(x.price||0)*Number(x.qty||0),0),select=A('#staffSalePromo'),old=select.value;select.innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...select.options].some(o=>o.value===old))select.value=old;const pd=calcPromo(sub,select.value),md=Number(A('#staffManualDiscount').value)||0,disc=Math.min(sub,pd+md),after=Math.max(0,sub-disc),tax=after*.13,total=after+tax;A('#staffTotals').innerHTML=`<div><span>Subtotal before tax</span><b>${money(sub)}</b></div><div><span>Discount</span><b>−${money(disc)}</b></div><div><span>Subtotal after discount</span><b>${money(after)}</b></div><div><span>HST 13%</span><b>${money(tax)}</b></div><div class="grand"><span>Total</span><b>${money(total)}</b></div>`;
};
if(A('#staffSaleNotes'))A('#staffSaleNotes').addEventListener('input',()=>renderStaffCart());
staffCompleteSale=async function(){
  if(!staffCart.length)return toast('Add at least one item.');const channel=A('#staffSaleChannel').value,fulfillment=channel.toLowerCase()==='walk-in'?'walk-in':channel.toLowerCase(),btn=A('#staffCompleteSale');btn.disabled=true;
  try{const payload={items:staffCart.map(x=>({id:x.id,qty:x.qty,displayName:x.name,priceOverride:x.price,modifiers:Array.isArray(x.modifiers)?x.modifiers:[],selections:x.selections||null})),promotionId:A('#staffSalePromo').value,manualDiscount:Number(A('#staffManualDiscount').value)||0,payment:A('#staffSalePayment').value,channel,fulfillment,status:'new',customer:{name:A('#staffCustomerName').value||(channel==='Dine-in'?'Dine-in customer':'Walk-in customer'),phone:A('#staffCustomerPhone').value,email:A('#staffCustomerEmail').value},notes:A('#staffSaleNotes').value};const d=await req('/api/admin/orders',{method:'POST',body:JSON.stringify(payload)});staffCart=[];for(const id of ['staffManualDiscount','staffCustomerName','staffCustomerPhone','staffCustomerEmail','staffSaleNotes'])A('#'+id).value=id==='staffManualDiscount'?0:'';A('#staffSaleMsg').innerHTML=`<div class="success-note">Created ${esc(d.order.orderNo)} · ${money(d.order.total)} · now waiting in Orders / All</div>`;toast('POS order created — customer requests are attached');await refresh();AA('#adminTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab==='orders'));AA('.admin-tab').forEach(x=>x.hidden=x.id!=='tab-orders')}catch(e){toast('Could not create POS order: '+e.message)}finally{btn.disabled=false}
};
if(A('#staffCompleteSale'))A('#staffCompleteSale').onclick=staffCompleteSale;

function normalizeEditorPaymentV1122(v){const raw=String(v||''),map={'e-transfer':'etransfer','etransfer':'etransfer','counter':'counter','pay at the counter':'counter','cash-driver':'cash-driver','cash to delivery driver':'cash-driver','cash':'Cash','debit':'Debit','credit':'Credit'};return map[raw.toLowerCase()]||raw}
function resetEditorChromeV1122(){['#orderEditorMeta','.editor-block-title','.editor-items-label','#editorCustomerRequestsV119','#checkoutSideHeadingV119','#editorCustomerRequestsV1122'].forEach(sel=>A('#orderModal')?.querySelectorAll(sel).forEach(x=>x.remove()))}
openOrderEditor=function(id){
  editingOrder=orders.find(o=>o.id===id);if(!editingOrder)return;editCart=(editingOrder.items||[]).map(x=>({...x,_key:`${x.id}::${x.name||''}::${modifierSignatureAdminV1122(x.modifiers||[])}`}));resetEditorChromeV1122();A('#orderModal').hidden=false;document.body.classList.add('modal-open');A('#modalOrderTitle').textContent=`${editingOrder.orderNo} · ${sourceLabel(editingOrder)}`;A('#editCustomerName').value=editingOrder.customer?.name||'';A('#editCustomerPhone').value=editingOrder.customer?.phone||'';A('#editCustomerEmail').value=editingOrder.customer?.email||'';A('#editManualDiscount').value=Number(editingOrder.manualDiscount||0);const pay=normalizeEditorPaymentV1122(editingOrder.payment);if([...A('#editPayment').options].some(x=>x.value===pay))A('#editPayment').value=pay;const f=String(editingOrder.fulfillment||'pickup').toLowerCase().replace('_','-');if([...A('#editFulfillment').options].some(x=>x.value===f))A('#editFulfillment').value=f;A('#editAddress').value=editingOrder.address||'';A('#editDistance').value=Number(editingOrder.finalDistanceKm||editingOrder.customerDistanceKm||0)||'';A('#editNotes').value=editingOrder.notes||'';A('#editMenuSearch').value='';renderEditor();
};
renderEditor=function(){
  if(!editingOrder)return;const vm=adminVM(),sub=editCart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0),promo=A('#editPromotion'),old=promo.value||editingOrder.promotionId||'';promo.innerHTML='<option value="">No promotion</option>'+promotions.filter(p=>promoValid(p,sub)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if([...promo.options].some(x=>x.value===old))promo.value=old;
  let requests=A('#editorCustomerRequestsV1122');if(!requests){requests=document.createElement('div');requests.id='editorCustomerRequestsV1122';A('#orderModal .editor-customer')?.insertAdjacentElement('afterend',requests)}requests.innerHTML=requestPanelAdminV119({...editingOrder,items:editCart,notes:A('#editNotes')?.value||''},true);
  A('#editOrderItems').innerHTML=editCart.length?editCart.map(x=>{const key=editKey(x),mods=Array.isArray(x.modifiers)?x.modifiers:[];return `<div class="editor-item"><div class="editor-item-main"><b>${esc(x.name)}</b><small>${money(x.price)} each</small></div><div class="qty-control"><button data-edit-qty="${esc(key)}" data-delta="-1">−</button><span>${x.qty}</span><button data-edit-qty="${esc(key)}" data-delta="1">+</button><b>${money(Number(x.price)*Number(x.qty))}</b><button class="remove-line" data-edit-remove="${esc(key)}">Remove</button></div></div>`}).join(''):'<div class="editor-empty-state">No items in this order.</div>';A('#editOrderItems').querySelectorAll('[data-edit-qty]').forEach(b=>b.onclick=()=>editQty(b.dataset.editQty,Number(b.dataset.delta)));A('#editOrderItems').querySelectorAll('[data-edit-remove]').forEach(b=>b.onclick=()=>editRemove(b.dataset.editRemove));
  const q=(A('#editMenuSearch').value||'').trim().toLowerCase();let entries=vm?vm.build(menu):menu.map(item=>({kind:'item',item,category:item.category,searchText:`${item.name} ${item.category}`.toLowerCase()}));entries=entries.filter(e=>!q||e.searchText.includes(q)).slice(0,8);A('#editMenuResults').innerHTML=entries.map(e=>{if(e.kind==='item'){const x=e.item;return `<button class="editor-menu-choice" data-edit-add="${esc(x.id)}" ${x.soldOut||!x.active?'disabled':''}><span><b>${esc(x.name)}</b><small>${esc(x.category||'')}</small></span><b>${x.soldOut?'SOLD OUT':money(x.price)}</b></button>`}const f=vm.family(e.key),d=vm.defaults(menu,e.key);return `<div class="editor-variant-card" data-edit-family-key="${esc(e.key)}"><div class="editor-variant-title"><span><b>${esc(e.title)}</b><small>${esc(e.category)}</small></span><strong data-edit-variant-price>${esc(vm.priceLabel(e))}</strong></div><small data-edit-variant-desc>${esc(e.description||f.description||'Choose options')}</small><div class="editor-variant-controls">${f.controls.map(c=>`<label><span>${esc(c.label)}</span><select data-edit-variant-control="${esc(c.key)}">${c.options.map(o=>`<option value="${esc(o.value)}" ${String(d[c.key])===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}</div><small data-edit-variant-summary></small><button type="button" data-edit-variant-add>Add selected item</button></div>`}).join('')||'<div class="editor-empty-state">Search by dish name to add an item.</div>';A('#editMenuResults').querySelectorAll('[data-edit-add]').forEach(b=>b.onclick=()=>editAdd(b.dataset.editAdd));A('#editMenuResults').querySelectorAll('[data-edit-family-key]').forEach(card=>{card.querySelectorAll('[data-edit-variant-control]').forEach(x=>x.onchange=()=>syncEditorVariantCard(card));card.querySelector('[data-edit-variant-add]').onclick=()=>editAddResolved(syncEditorVariantCard(card));syncEditorVariantCard(card)});
  const isDelivery=A('#editFulfillment').value==='delivery';A('#editDeliveryWrap').style.display=isDelivery?'grid':'none';const t=editorTotals();A('#editTotals').innerHTML=`<div class="staff-total-stack"><div><span>Subtotal before tax</span><strong>${money(t.sub)}</strong></div><div class="discount"><span>Discount</span><strong>−${money(t.disc)}</strong></div><div><span>Subtotal after discount</span><strong>${money(t.afterDiscount)}</strong></div><div><span>HST 13% on food</span><strong>${money(t.tax)}</strong></div><div><span>Food total after tax</span><strong>${money(t.foodAfterTax)}</strong></div>${t.delivery?`<div class="delivery-nontax"><span>Delivery fee <small>NOT TAXED</small></span><strong>+${money(t.delivery)}</strong></div>`:''}<div class="grand"><span>FINAL TOTAL</span><strong>${money(t.total)}</strong></div></div>`;
};
saveOrderEdits=async function(markComplete=false){
  if(!editingOrder||!editCart.length)return toast('Order must contain at least one item.');const save=A('#saveOrderEdits'),complete=A('#completeOrder');save.disabled=true;complete.disabled=true;
  try{const payload={items:editCart.map(x=>({id:x.id,qty:x.qty,priceOverride:x.price,displayName:x.name,modifiers:Array.isArray(x.modifiers)?x.modifiers:[],selections:x.selections||null})),customer:{name:A('#editCustomerName').value,phone:A('#editCustomerPhone').value,email:A('#editCustomerEmail').value},promotionId:A('#editPromotion').value,manualDiscount:Number(A('#editManualDiscount').value)||0,payment:A('#editPayment').value,fulfillment:A('#editFulfillment').value,address:A('#editAddress').value,finalDistanceKm:Number(A('#editDistance').value)||0,notes:A('#editNotes').value};if(markComplete)payload.status='completed';const d=await req('/api/admin/orders/'+editingOrder.id,{method:'PATCH',body:JSON.stringify(payload)});editingOrder=d.order;toast(markComplete?'Order completed':'Order updated successfully');if(markComplete){closeOrderEditor();await refresh()}else{const idx=orders.findIndex(x=>x.id===editingOrder.id);if(idx>=0)orders[idx]=editingOrder;renderEditor();renderOrders()}}
  catch(e){toast('Could not save order: '+e.message)}finally{save.disabled=false;complete.disabled=false}
};
if(A('#editNotes'))A('#editNotes').oninput=()=>{if(editingOrder){const r=A('#editorCustomerRequestsV1122');if(r)r.innerHTML=requestPanelAdminV119({...editingOrder,items:editCart,notes:A('#editNotes').value},true)}};


// V11.23 — immediate pre-order arrival alert + opening-time reminder.
// 1) Every NEW website/pre-order alerts Staff immediately, even while the store is closed.
// 2) Once accepted, a scheduled order for today gets a second one-time reminder when
//    the restaurant opens for that day.
// 3) The existing 30-minute preparation alert remains active until PREPARING.
let openingReminderAudioV1123=null;
let openingReminderShowingV1123=false;
function torontoPartsAdminV1123(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',weekday:'long',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {weekday:String(parts.weekday||'').toLowerCase(),date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
function minutesOfClockV1123(v){const m=String(v||'').match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function openingWindowActiveV1123(){
  const now=torontoPartsAdminV1123(),h=settings?.hours?.[now.weekday];
  if(!h||h.closed)return false;
  const open=minutesOfClockV1123(h.open),cur=minutesOfClockV1123(now.time);
  if(open===null||cur===null)return false;
  // Keep the reminder available for the first 45 minutes after opening so a
  // tablet that reconnects a little late still catches it.
  return cur>=open&&cur<open+45;
}
function openingReminderKeyV1123(o){const stamp=scheduledStampAdminV116(o),date=stamp?stamp.slice(0,10):'';return `viet-nom-nom-opening-reminder-v1:${o.id}:${date}`}
function openingReminderOrdersV1123(){
  if(!openingWindowActiveV1123())return [];
  const today=torontoPartsAdminV1123().date;
  return orders.filter(o=>{
    const stamp=scheduledStampAdminV116(o);
    if(!stamp||stamp.slice(0,10)!==today)return false;
    if(!['accepted','new'].includes(o.status))return false;
    if(localStorage.getItem(openingReminderKeyV1123(o))==='done')return false;
    return true;
  });
}
function ensureOpeningReminderBannerV1123(){
  let b=document.querySelector('#openingReminderBanner');
  if(!b){
    b=document.createElement('div');b.id='openingReminderBanner';b.className='opening-reminder-banner';b.hidden=true;
    const top=document.querySelector('.admin-topbar')||document.body.firstElementChild;
    if(top?.parentNode)top.parentNode.insertBefore(b,top.nextSibling);else document.body.prepend(b);
  }
  return b;
}
function dismissOpeningReminderV1123(){
  openingReminderOrdersV1123().forEach(o=>localStorage.setItem(openingReminderKeyV1123(o),'done'));
  if(openingReminderAudioV1123){openingReminderAudioV1123.pause();try{openingReminderAudioV1123.currentTime=0}catch{}}
  openingReminderShowingV1123=false;const b=document.querySelector('#openingReminderBanner');if(b)b.hidden=true;
}
window.dismissOpeningReminderV1123=dismissOpeningReminderV1123;
function syncOpeningReminderV1123(){
  const list=openingReminderOrdersV1123(),b=ensureOpeningReminderBannerV1123();
  if(!list.length){b.hidden=true;openingReminderShowingV1123=false;return}
  b.hidden=false;
  b.innerHTML=`<div><strong>🌅 OPENING PRE-ORDER REMINDER</strong><span>${list.length} scheduled order${list.length>1?'s':''} today · ${list.map(o=>`${esc(o.orderNo)} ${esc(scheduledStampAdminV116(o).slice(11))}`).join(' · ')}</span></div><button type="button" onclick="dismissOpeningReminderV1123()">Got it</button>`;
  if(openingReminderShowingV1123||!soundEnabled)return;
  openingReminderShowingV1123=true;
  openingReminderAudioV1123=new Audio('/assets/sounds/order-alert.mp3?v=11.33.0');
  openingReminderAudioV1123.volume=.75;openingReminderAudioV1123.loop=false;
  openingReminderAudioV1123.play().catch(()=>{});
}

// Override V11.21 alarm reason: a future pre-order in NEW status is still a
// NEW ORDER and must alert immediately. Accepting it silences the arrival alert.
staffAlarmReasonV1121=function(o){
  const stamp=scheduledStampAdminV116(o);
  if(o?.status==='new')return stamp?'NEW PRE-ORDER':'NEW ORDER';
  if(o?.status==='accepted'&&stamp){
    const mins=scheduleMinutesAwayAdminV1121(o);
    if(mins!==null&&mins<=30)return 'PRE-ORDER · START PREPARING';
  }
  return null;
};
staffAlarmOrdersV1121=function(){return orders.map(o=>({o,reason:staffAlarmReasonV1121(o)})).filter(x=>x.reason)};
syncAlarm=function(){
  const alerts=staffAlarmOrdersV1121(),b=A('#alarmBanner');
  const prep=alerts.filter(x=>x.reason.includes('START PREPARING')).length;
  const preNew=alerts.filter(x=>x.reason==='NEW PRE-ORDER').length;
  const fresh=alerts.filter(x=>x.reason==='NEW ORDER').length;
  if(!soundEnabled||!alerts.length){silenceOrderAlertV115();syncOpeningReminderV1123();return}
  // A looping NEW/PREP alarm has priority over the one-time opening reminder.
  const ob=document.querySelector('#openingReminderBanner');if(ob)ob.hidden=true;
  const parts=[];
  if(fresh)parts.push(`${fresh} NEW ORDER${fresh>1?'S':''}`);
  if(preNew)parts.push(`${preNew} NEW PRE-ORDER${preNew>1?'S':''}`);
  if(prep)parts.push(`${prep} PRE-ORDER${prep>1?'S':''} START WITHIN 30 MIN`);
  document.body.classList.add('order-alarm-active');
  if(b){b.hidden=false;b.innerHTML=`🔔 <b>${parts.join(' · ')}</b> — ${prep?'move pre-order to PREPARING to silence prep alert':'press ACCEPT to acknowledge the new order'}`;}
  alarmBurst();
};

// Make the card itself unmistakable that scheduled NEW orders are already received.
const _orderScheduleHtmlV1123=orderScheduleHtmlV116;
orderScheduleHtmlV116=function(o){
  const html=_orderScheduleHtmlV1123(o),stamp=scheduledStampAdminV116(o);
  if(stamp&&o.status==='new'&&stamp>torontoStampAdminV116())return html.replace('<b>PRE-ORDER</b>','<b>PRE-ORDER · RECEIVED NOW</b>');
  return html;
};

// V11.25 — near-real-time Staff polling + Canadian cash rounding.
// New website/POS orders are pulled automatically without requiring manual Refresh.
let v1125SnapshotReady=false;
function cashNickelAdminV1125(n){return Math.round((Number(n)||0)*20)/20}
function isCashAdminV1125(v){return /cash/i.test(String(v||''))}
function cashRoundingAdminV1125(exact,payment){const rounded=isCashAdminV1125(payment)?cashNickelAdminV1125(exact):exact;return {exact,rounded,adjustment:Math.round((rounded-exact)*100)/100,applies:isCashAdminV1125(payment)}}

refresh=async function(){
  if(refreshInFlight||orderMutationInFlight>0)return;
  refreshInFlight=true;
  try{
    const before=new Set((orders||[]).filter(x=>x.status==='new').map(x=>x.id));
    const d=await req('/api/admin/snapshot?view=staff&_v1125='+Date.now());
    orders=d.orders||[];menu=d.menu||[];settings=d.settings||{};promotions=d.promotions||[];window.providerInfo=d.notificationProviders||{};
    renderOrders();syncAlarm();renderStore(d.status||{});renderMenu();renderStaffPOS();
    A('#lastSync').textContent='Live · '+new Date().toLocaleTimeString();
    if(v1125SnapshotReady){
      const arrived=orders.filter(x=>x.status==='new'&&!before.has(x.id));
      if(arrived.length)toast(`🔔 ${arrived.length} new order${arrived.length>1?'s':''} received automatically`);
    }
    v1125SnapshotReady=true;
  }catch(e){
    if(e.status===401){sessionStorage.removeItem('vietNomNomAdminPin');location.reload();return}
    console.error('Staff live snapshot failed',e);
    A('#lastSync').textContent=(e.status===503?'Database busy — retrying':'Live sync issue · retrying');
  }finally{refreshInFlight=false}
};

function startStaffLiveSyncV1125(){
  if(window.adminTimer)clearInterval(window.adminTimer);
  window.adminTimer=setInterval(()=>refresh(),1500);
  if(!window.__vietNomNomLiveListenersV1){
    window.__vietNomNomLiveListenersV1=true;
    window.addEventListener('focus',()=>refresh());
    window.addEventListener('online',()=>refresh());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()},{passive:true});
  }
}
const _openDashboardV1125=openDashboard;
openDashboard=async function(){
  A('#loginView').hidden=true;A('#dashboardView').hidden=false;A('#logoutBtn').style.visibility='visible';
  await refresh();startStaffLiveSyncV1125();
};
// If a PIN auto-opened the dashboard earlier in this script, replace the old timer now.
if(pin && A('#dashboardView') && !A('#dashboardView').hidden)startStaffLiveSyncV1125();

function applyStaffCashRoundingV1125(){
  const root=A('#staffTotals');if(!root)return;
  root.querySelectorAll('.cash-rounding-v1125').forEach(x=>x.remove());
  const grand=root.querySelector('.grand');if(!grand)return;
  const sub=staffCart.reduce((sum,x)=>sum+Number(x.price||0)*Number(x.qty||0),0),pid=A('#staffSalePromo')?.value||'',pd=calcPromo(sub,pid),md=Number(A('#staffManualDiscount')?.value)||0,disc=Math.min(sub,pd+md),after=Math.max(0,sub-disc),tax=after*.13,exact=after+tax,r=cashRoundingAdminV1125(exact,A('#staffSalePayment')?.value);
  if(r.applies){grand.insertAdjacentHTML('beforebegin',`<div class="cash-rounding-v1125"><span>Cash rounding <small>nearest $0.05</small></span><b>${r.adjustment>0?'+':''}${money(r.adjustment)}</b></div>`);const b=grand.querySelector('b');if(b)b.textContent=money(r.rounded);const s=grand.querySelector('span');if(s)s.textContent='Final cash total';}
}
const _renderStaffCartV1125=renderStaffCart;
renderStaffCart=function(){_renderStaffCartV1125();applyStaffCashRoundingV1125()};
if(A('#staffSalePayment'))A('#staffSalePayment').onchange=()=>renderStaffCart();

function applyEditCashRoundingV1125(){
  const root=A('#editTotals');if(!root)return;
  root.querySelectorAll('.cash-rounding-v1125').forEach(x=>x.remove());
  const grand=root.querySelector('.grand');if(!grand)return;
  const t=editorTotals(),r=cashRoundingAdminV1125(t.total,A('#editPayment')?.value);
  if(r.applies){grand.insertAdjacentHTML('beforebegin',`<div class="cash-rounding-v1125"><span>Cash rounding <small>nearest $0.05 · after tax</small></span><strong>${r.adjustment>0?'+':''}${money(r.adjustment)}</strong></div>`);const b=grand.querySelector('strong,b');if(b)b.textContent=money(r.rounded);const s=grand.querySelector('span');if(s)s.textContent='FINAL CASH TOTAL';}
}
const _renderEditorV1125=renderEditor;
renderEditor=function(){_renderEditorV1125();applyEditCashRoundingV1125()};
if(A('#editPayment'))A('#editPayment').onchange=()=>renderEditor();


// V11.32 — incoming customer preparation requests are summarized once in a single kitchen-note row.


// V11.33 — FINAL kitchen-note renderer. This runs after every legacy render layer.
// All preparation preferences, pregnancy requests, allergy alerts and customer notes
// are collapsed into one compact line per order. Individual item rows never repeat modifiers.
function kitchenSummaryAdminV1133(orderLike){
  const rows=[],seenRows=new Set();let urgent=false;
  for(const item of (orderLike?.items||[])){
    const parts=[],seenParts=new Set();
    for(const raw of (Array.isArray(item.modifiers)?item.modifiers:[])){
      let m=String(raw||'').trim();if(!m)continue;
      if(/^⚠\s*ALLERGY:/i.test(m)){urgent=true;m=m.replace(/^⚠\s*ALLERGY:\s*/i,'ALLERGY: ')}
      else if(/allergy|gluten|no msg|canola/i.test(m)){urgent=true}
      m=m.replace(/^Pregnancy:\s*/i,'').replace(/^Item note:\s*/i,'Note: ');
      if(!seenParts.has(m)){seenParts.add(m);parts.push(m)}
    }
    if(parts.length){
      const row=`${item.name}: ${parts.join(' · ')}`;
      if(!seenRows.has(row)){seenRows.add(row);rows.push(row)}
    }
  }
  const orderNote=String(orderLike?.notes||'').trim();
  if(orderNote){const row=`Order note: ${orderNote}`;if(!seenRows.has(row))rows.push(row)}
  return {text:rows.join(' | '),urgent};
}
function kitchenLineAdminV1133(orderLike){
  const s=kitchenSummaryAdminV1133(orderLike);if(!s.text)return'';
  return `<div class="staff-kitchen-line-v1133 ${s.urgent?'urgent':''}"><strong>${s.urgent?'⚠ KITCHEN NOTES':'KITCHEN NOTES'}</strong><span>${esc(s.text)}</span></div>`;
}
function applyOrderKitchenLinesV1133(){
  const grid=A('#ordersGrid');if(!grid)return;
  grid.querySelectorAll('.order-card').forEach(card=>{
    const no=card.querySelector('.order-head h3')?.textContent?.trim();
    const o=orders.find(x=>String(x.orderNo)===String(no));if(!o)return;
    card.querySelectorAll('.customer-requests-panel,.customer-requests-empty,.allergy-order-alert,.pregnancy-order-note,.staff-kitchen-line-v1133').forEach(x=>x.remove());
    card.querySelectorAll('.order-modifiers,.staff-cart-modifiers,.editor-modifier-list').forEach(x=>x.remove());
    const line=kitchenLineAdminV1133(o);if(!line)return;
    const anchor=card.querySelector('.customer-coming-banner')||card.querySelector('.requested-order-strip')||card.querySelector('.order-head');
    anchor?.insertAdjacentHTML('afterend',line);
  });
}
const _renderOrdersFinalV1133=renderOrders;
renderOrders=function(){_renderOrdersFinalV1133();applyOrderKitchenLinesV1133()};

function applyEditorKitchenLineV1133(){
  if(!editingOrder)return;
  const modal=A('#orderModal');if(!modal)return;
  modal.querySelectorAll('#editorCustomerRequestsV119,#editorCustomerRequestsV1122,#editorCustomerRequestsV1133,.customer-requests-panel,.customer-requests-empty,.allergy-order-alert,.pregnancy-order-note').forEach(x=>x.remove());
  modal.querySelectorAll('.editor-modifier-list,.order-modifiers,.staff-cart-modifiers').forEach(x=>x.remove());
  const customer=modal.querySelector('.editor-customer');if(!customer)return;
  const box=document.createElement('div');box.id='editorCustomerRequestsV1133';
  box.innerHTML=kitchenLineAdminV1133({...editingOrder,items:editCart,notes:A('#editNotes')?.value||editingOrder.notes||''});
  if(box.innerHTML.trim())customer.insertAdjacentElement('afterend',box);
}
const _renderEditorFinalV1133=renderEditor;
renderEditor=function(){_renderEditorFinalV1133();applyEditorKitchenLineV1133()};

// Printed bill: keep the same single Kitchen Notes line and do not repeat modifiers under items.
printOrder=function(){
  if(!editingOrder)return;
  const t=editorTotals(),summary=kitchenSummaryAdminV1133({...editingOrder,items:editCart,notes:A('#editNotes')?.value||''});
  const items=editCart.map(x=>`<tr><td>${x.qty} × ${esc(x.name)}</td><td style="text-align:right">${money(x.price*x.qty)}</td></tr>`).join('');
  const w=window.open('','_blank','width=620,height=820');
  const note=summary.text?`<div class="kitchen ${summary.urgent?'urgent':''}"><b>${summary.urgent?'⚠ KITCHEN NOTES':'KITCHEN NOTES'}</b><span>${esc(summary.text)}</span></div>`:'';
  w.document.write(`<!doctype html><html><head><title>${esc(editingOrder.orderNo)}</title><style>body{font-family:Arial;padding:28px;color:#183c3e}h1{margin:0;color:#075a5d}small{color:#666}table{width:100%;margin:20px 0;border-collapse:collapse}td{padding:8px 0;border-bottom:1px dashed #ccc}.totals{margin-left:auto;max-width:380px}.totals div{display:flex;justify-content:space-between;padding:6px 0}.grand{font-size:22px;font-weight:bold;border-top:2px solid #075a5d;margin-top:8px;padding-top:10px!important}.kitchen{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;margin:14px 0;border:1px solid #d8ccb3;border-radius:10px;background:#fbf8ef;font-size:12px}.kitchen b{white-space:nowrap;color:#075a5d}.kitchen.urgent{background:#fff1ee;border:2px solid #c91f16}.kitchen.urgent b{color:#a61d16}</style></head><body><h1>Viet Nom Nom</h1><small>6645 Tecumseh Rd E, Windsor, ON N8T 1E7</small><h2>${esc(editingOrder.orderNo)}</h2><p>${esc(A('#editCustomerName').value)}<br>${esc(A('#editCustomerPhone').value)}<br>${esc(A('#editCustomerEmail').value)}</p>${note}<table>${items}</table><div class="totals"><div><span>Subtotal before tax</span><b>${money(t.sub)}</b></div><div><span>Discount</span><b>−${money(t.disc)}</b></div><div><span>Subtotal after discount</span><b>${money(t.afterDiscount)}</b></div><div><span>HST 13% on food</span><b>${money(t.tax)}</b></div><div><span>Food total after tax</span><b>${money(t.foodAfterTax)}</b></div>${t.delivery?`<div><span>Delivery fee (not taxed)</span><b>+${money(t.delivery)}</b></div>`:''}<div class="grand"><span>FINAL TOTAL</span><b>${money(t.total)}</b></div></div><p>Payment: ${esc(A('#editPayment').value)}</p><p>Thank you!</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
};
if(A('#printOrder'))A('#printOrder').onclick=printOrder;
if(A('#editNotes'))A('#editNotes').addEventListener('input',()=>{if(editingOrder)applyEditorKitchenLineV1133()});


// V11.34 — authoritative single-row Kitchen Notes renderer.
// All preparation preferences, pregnancy requests, allergy alerts and customer notes
// are consolidated into one compact row per order. Legacy group boxes are removed.
function kitchenSummaryAdminV1134(orderLike){
  const rows=[]; const seenRows=new Set(); let urgent=false;
  for(const item of (orderLike?.items||[])){
    const parts=[]; const seenParts=new Set();
    for(const raw of (Array.isArray(item.modifiers)?item.modifiers:[])){
      let m=String(raw||'').trim(); if(!m)continue;
      if(/^⚠\s*ALLERGY:/i.test(m)){
        urgent=true;
        m=m.replace(/^⚠\s*ALLERGY:\s*/i,'ALLERGY: ');
      }else if(/allergy|gluten|no msg|canola/i.test(m)){
        urgent=true;
      }
      m=m.replace(/^Pregnancy:\s*/i,'').replace(/^Item note:\s*/i,'Note: ');
      if(!seenParts.has(m)){seenParts.add(m);parts.push(m)}
    }
    if(parts.length){
      const row=`${item.name}: ${parts.join(' · ')}`;
      if(!seenRows.has(row)){seenRows.add(row);rows.push(row)}
    }
  }
  const orderNote=String(orderLike?.notes||'').trim();
  if(orderNote){for(const raw of orderNote.split(/\s*·\s*/)){let part=String(raw||'').trim();if(!part)continue;if(/^Customer note:/i.test(part))part=part.replace(/^Customer note:\s*/i,'Note: ');else if(!/^Packing:/i.test(part))part=`Order note: ${part}`;if(!seenRows.has(part)){seenRows.add(part);rows.push(part)}}}
  return {text:rows.join(' · '),urgent};
}
function kitchenLineAdminV1134(orderLike){
  const s=kitchenSummaryAdminV1134(orderLike); if(!s.text)return '';
  return `<div class="staff-kitchen-line-v1134 ${s.urgent?'urgent':''}"><strong>${s.urgent?'⚠ KITCHEN NOTES':'KITCHEN NOTES'}</strong><span>${esc(s.text)}</span></div>`;
}
function stripLegacyKitchenUiV1134(root){
  if(!root)return;
  root.querySelectorAll('.customer-requests-panel,.customer-requests-empty,.allergy-order-alert,.pregnancy-order-note,.request-group,.staff-kitchen-line-v1133,.staff-kitchen-line-v1134,#editorCustomerRequestsV119,#editorCustomerRequestsV1122,#editorCustomerRequestsV1133,#editorCustomerRequestsV1134,.order-modifiers,.staff-cart-modifiers,.editor-modifier-list').forEach(x=>x.remove());
}
function applyOrderKitchenLinesV1134(){
  const grid=A('#ordersGrid'); if(!grid)return;
  grid.querySelectorAll('.order-card').forEach(card=>{
    const no=card.querySelector('.order-head h3')?.textContent?.trim();
    const o=orders.find(x=>String(x.orderNo)===String(no)); if(!o)return;
    stripLegacyKitchenUiV1134(card);
    const line=kitchenLineAdminV1134(o); if(!line)return;
    const anchor=card.querySelector('.customer-coming-banner')||card.querySelector('.requested-order-strip')||card.querySelector('.order-head');
    anchor?.insertAdjacentHTML('afterend',line);
  });
}
const _renderOrdersFinalV1134=renderOrders;
renderOrders=function(){_renderOrdersFinalV1134();applyOrderKitchenLinesV1134()};

function applyEditorKitchenLineV1134(){
  if(!editingOrder)return;
  const modal=A('#orderModal'); if(!modal)return;
  stripLegacyKitchenUiV1134(modal);
  const line=kitchenLineAdminV1134({...editingOrder,items:editCart,notes:A('#editNotes')?.value||editingOrder.notes||''});
  if(!line)return;
  const customer=modal.querySelector('.editor-customer'); if(!customer)return;
  const box=document.createElement('div');box.id='editorCustomerRequestsV1134';box.innerHTML=line;customer.insertAdjacentElement('afterend',box);
}
const _renderEditorFinalV1134=renderEditor;
renderEditor=function(){_renderEditorFinalV1134();applyEditorKitchenLineV1134()};

const _renderStaffCartFinalV1134=renderStaffCart;
renderStaffCart=function(){
  _renderStaffCartFinalV1134();
  const preview=A('#staffRequestPreviewV1122');
  if(preview){const fake={items:staffCart,notes:A('#staffSaleNotes')?.value||''},line=kitchenLineAdminV1134(fake);preview.hidden=!line;preview.innerHTML=line}
};

printOrder=function(){
  if(!editingOrder)return;
  const t=editorTotals(),summary=kitchenSummaryAdminV1134({...editingOrder,items:editCart,notes:A('#editNotes')?.value||''});
  const items=editCart.map(x=>`<tr><td>${x.qty} × ${esc(x.name)}</td><td style="text-align:right">${money(x.price*x.qty)}</td></tr>`).join('');
  const w=window.open('','_blank','width=620,height=820');
  const note=summary.text?`<div class="kitchen ${summary.urgent?'urgent':''}"><b>${summary.urgent?'⚠ KITCHEN NOTES':'KITCHEN NOTES'}</b><span>${esc(summary.text)}</span></div>`:'';
  w.document.write(`<!doctype html><html><head><title>${esc(editingOrder.orderNo)}</title><style>body{font-family:Arial;padding:28px;color:#183c3e}h1{margin:0;color:#075a5d}small{color:#666}table{width:100%;margin:20px 0;border-collapse:collapse}td{padding:8px 0;border-bottom:1px dashed #ccc}.totals{margin-left:auto;max-width:380px}.totals div{display:flex;justify-content:space-between;padding:6px 0}.grand{font-size:22px;font-weight:bold;border-top:2px solid #075a5d;margin-top:8px;padding-top:10px!important}.kitchen{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;margin:14px 0;border:1px solid #d8ccb3;border-radius:10px;background:#fbf8ef;font-size:12px}.kitchen b{white-space:nowrap;color:#075a5d}.kitchen.urgent{background:#fff1ee;border:2px solid #c91f16}.kitchen.urgent b,.kitchen.urgent span{color:#a61d16}</style></head><body><h1>Viet Nom Nom</h1><small>6645 Tecumseh Rd E, Windsor, ON N8T 1E7</small><h2>${esc(editingOrder.orderNo)}</h2><p>${esc(A('#editCustomerName').value)}<br>${esc(A('#editCustomerPhone').value)}<br>${esc(A('#editCustomerEmail').value)}</p>${note}<table>${items}</table><div class="totals"><div><span>Subtotal before tax</span><b>${money(t.sub)}</b></div><div><span>Discount</span><b>−${money(t.disc)}</b></div><div><span>Subtotal after discount</span><b>${money(t.afterDiscount)}</b></div><div><span>HST 13% on food</span><b>${money(t.tax)}</b></div><div><span>Food total after tax</span><b>${money(t.foodAfterTax)}</b></div>${t.delivery?`<div><span>Delivery fee (not taxed)</span><b>+${money(t.delivery)}</b></div>`:''}<div class="grand"><span>FINAL TOTAL</span><b>${money(t.total)}</b></div></div><p>Payment: ${esc(A('#editPayment').value)}</p><p>Thank you!</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
};
if(A('#printOrder'))A('#printOrder').onclick=printOrder;
if(A('#editNotes'))A('#editNotes').addEventListener('input',()=>{if(editingOrder)applyEditorKitchenLineV1134()});
