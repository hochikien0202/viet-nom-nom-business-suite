const DRAFT_KEY='vietNomNomCheckoutDraftV1';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=n=>'$'+Number(n||0).toFixed(2);
const cashNickelV1125=n=>Math.round((Number(n)||0)*20)/20;
const cashPaymentV1125=v=>/cash/i.test(String(v||''));
const readyAudio=$('#customerReadyAudio');
let activeOrder=null,pollTimer=null,alertUnlocked=false,lastRenderedStatus=null;

// V11.28 — READY alert uses sound only. Vibration/notification haptics were removed for reliability.
function getDraft(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(d){d.fulfillment='pickup';d.address='';d.distanceKm=0;d.payment='counter';}return d}catch{return null}}
function trackingKey(orderNo){return `vietNomNomTrackingV1:${orderNo}`}
function saveTracking(orderNo,phone){
  const rec={orderNo,phone,savedAt:new Date().toISOString()};
  localStorage.setItem(trackingKey(orderNo),JSON.stringify(rec));
  localStorage.setItem('vietNomNomLastTrackedOrderV1',orderNo);
  try{const key='vietNomNomRecentTrackedOrdersV1',list=JSON.parse(localStorage.getItem(key)||'[]').filter(x=>x?.orderNo!==orderNo);list.unshift(rec);localStorage.setItem(key,JSON.stringify(list.slice(0,5)))}catch{}
}
function getTracking(orderNo){try{return JSON.parse(localStorage.getItem(trackingKey(orderNo))||'null')}catch{return null}}
function deliveryFee(km){km=Number(km)||0;if(km<=0)return 0;if(km<=5)return 6;return 6+Math.ceil(km-5)}
function draftTotals(d){const subtotal=(d.items||[]).reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0),discount=0,after=subtotal,tax=Math.round(after*.13*100)/100,foodAfterTax=Math.round((after+tax)*100)/100,delivery=d.fulfillment==='delivery'?deliveryFee(d.distanceKm):0,exactTotal=Math.round((foodAfterTax+delivery)*100)/100,total=cashPaymentV1125(d.payment)?cashNickelV1125(exactTotal):exactTotal,cashRounding=Math.round((total-exactTotal)*100)/100;return{subtotal,discount,after,tax,foodAfterTax,delivery,exactTotal,total,cashRounding,cashRounded:cashPaymentV1125(d.payment)}}
function orderTotals(o){const after=Math.max(0,Number(o.subtotal||0)-Number(o.discount||0)),foodAfterTax=after+Number(o.tax||0),delivery=Number(o.deliveryFee||0),exactTotal=Math.round((foodAfterTax+delivery)*100)/100,total=Number(o.total||0),cashRounding=Math.round((total-exactTotal)*100)/100;return{subtotal:Number(o.subtotal||0),discount:Number(o.discount||0),after,tax:Number(o.tax||0),foodAfterTax,delivery,exactTotal,total,cashRounding,cashRounded:cashPaymentV1125(o.payment)}}
function totalsHtml(t,promotion=''){
  return `<div class="tracking-total-row"><span>Subtotal before tax</span><b>${money(t.subtotal)}</b></div>
  ${t.discount>0?`<div class="tracking-total-row discount"><span>${promotion?esc(promotion):'Discount'}</span><b>−${money(t.discount)}</b></div><div class="tracking-total-row"><span>Subtotal after discount</span><b>${money(t.after)}</b></div>`:''}
  <div class="tracking-total-row"><span>HST 13% on food</span><b>${money(t.tax)}</b></div>
  <div class="tracking-total-row"><span>Food total after tax</span><b>${money(t.foodAfterTax)}</b></div>
  ${t.delivery?`<div class="tracking-total-row delivery"><span>Delivery fee<small>Not taxed · added after food HST</small></span><b>+${money(t.delivery)}</b></div>`:''}
  ${t.cashRounded?`<div class="tracking-total-row cash-rounding"><span>Cash rounding<small>Final cash payment rounded to nearest $0.05</small></span><b>${t.cashRounding>0?'+':''}${money(t.cashRounding)}</b></div>`:''}
  <div class="tracking-total-row final"><span>FINAL TOTAL<small>${t.cashRounded?'Cash total · rounded after tax':t.delivery?'Food total after tax + non-taxed delivery fee':'Tax included'}</small></span><b>${money(t.total)}</b></div>`;
}
function paymentLabel(v){return ({counter:'Pay at the counter','cash-driver':'Cash to delivery driver',etransfer:'E-transfer',Cash:'Cash',Debit:'Debit',Credit:'Credit','E-transfer':'E-transfer'})[v]||String(v||'')}
function paymentInstructions(d,t){
  const p=String(d.payment||'').toLowerCase();
  if(p.includes('transfer'))return `<div class="etransfer-panel"><span>Delivery payment</span><h3>E-transfer ${money(t.total)}</h3><p>Please call (519) 916-0879 for any payment instructions.</p>${d.orderNo?`<p class="etransfer-memo"><b>Message / memo:</b> ${esc(d.orderNo)}</p>`:'<p class="etransfer-memo">Your order number will appear here after confirmation. Use it as the e-transfer message.</p>'}</div>`;
  return `<div class="payment-method-panel"><span>Payment method</span><b>${esc(paymentLabel(d.payment))}</b><small>${d.fulfillment==='delivery'?'Payment will follow the selected delivery method.':'Pay when you arrive at the restaurant.'}</small></div>`;
}
function requestedTimeLabel(v){if(!v||v==='ASAP')return 'ASAP';const [d,t]=String(v).split('T');try{return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'short',day:'numeric'}).format(new Date(`${d}T12:00:00`))+` at ${t}`}catch{return `${d} at ${t}`}}
function fulfillmentLabel(v){return ({pickup:'Pickup',delivery:'Delivery','walk-in':'Walk-in',phone:'Phone'})[v]||String(v||'')}
function packingLabelV1135(v){return ({None:'No utensils or napkins',Utensils:'Utensils only',Napkins:'Napkins only',Both:'Utensils & napkins'})[String(v||'')]||String(v||'')}
function parseOrderNotesV1135(data){
  let packing=packingLabelV1135(data?.packingPreference||''),note=String(data?.notes||'').trim();
  const pm=note.match(/(?:^|\s*·\s*)Packing:\s*([^·]+)/i);if(pm&&!packing)packing=pm[1].trim();
  let customer='';const cm=note.match(/(?:^|\s*·\s*)Customer note:\s*(.+)$/i);if(cm)customer=cm[1].trim();
  note=note.replace(/(?:^|\s*·\s*)Packing:\s*[^·]+/i,'').replace(/(?:^|\s*·\s*)Customer note:\s*/i,'').replace(/^\s*·\s*|\s*·\s*$/g,'').trim();
  if(customer)note=customer;return {packing,note};
}
function composeOrderNotesV1135(d){const parts=[];const packing=packingLabelV1135(d?.packingPreference||'');if(packing)parts.push(`Packing: ${packing}`);const note=String(d?.notes||'').trim();if(note)parts.push(`Customer note: ${note}`);return parts.join(' · ')}
function infoGridHtml(d){const parsed=parseOrderNotesV1135(d),packing=packingLabelV1135(d.packingPreference||parsed.packing);return `<div><span>Name</span><b>${esc(d.customer?.name||'')}</b></div><div><span>Service</span><b>${esc(fulfillmentLabel(d.fulfillment))}</b></div>${d.requestedTime&&d.requestedTime!=='ASAP'?`<div><span>Scheduled for</span><b>${esc(requestedTimeLabel(d.requestedTime))}</b></div>`:''}<div><span>Payment</span><b>${esc(paymentLabel(d.payment))}</b></div>${packing?`<div><span>Utensils / napkins</span><b>${esc(packing)}</b></div>`:''}${d.fulfillment==='delivery'?`<div class="wide"><span>Delivery address</span><b>${esc(d.address||'')}</b></div>`:''}`}
function itemsHtml(items,showModifiers=true){return (items||[]).map(x=>`<div class="tracking-item"><div><b>${Number(x.qty||1)}× ${esc(x.name)}</b>${showModifiers&&Array.isArray(x.modifiers)&&x.modifiers.length?`<div class="tracking-item-tags">${x.modifiers.map(m=>`<span class="${/allergy|gluten|no msg|canola/i.test(m)?'alert':/^Pregnancy:/i.test(m)?'pregnancy':''}">${esc(m)}</span>`).join('')}</div>`:''}</div><strong>${money(Number(x.price||0)*Number(x.qty||1))}</strong></div>`).join('')||'<div class="tracking-empty">No items found.</div>'}
function requestGroups(data){const allergy=[],pregnancy=[],prep=[];(data.items||[]).forEach(i=>(i.modifiers||[]).forEach(m=>{const line=`${i.name}: ${String(m).replace(/^⚠\s*/,'')}`;if(/allergy|gluten|no msg|canola/i.test(m))allergy.push(line);else if(/^Pregnancy:/i.test(m))pregnancy.push(line.replace(/^(.+?): Pregnancy:\s*/,'$1: '));else prep.push(line)}));const parsed=parseOrderNotesV1135(data);if(parsed.packing)prep.push(`Packing: ${parsed.packing}`);return{allergy:[...new Set(allergy)],pregnancy:[...new Set(pregnancy)],prep:[...new Set(prep)],note:parsed.note}}

function requestsHtml(data){const r=requestGroups(data),has=r.allergy.length||r.pregnancy.length||r.prep.length||r.note;if(!has)return'';return `${r.allergy.length?`<div class="customer-request-box allergy"><div class="request-big-label">⚠ ALLERGY ALERT</div><b>Highlighted for Viet Nom Nom kitchen</b>${r.allergy.map(x=>`<p>${esc(x)}</p>`).join('')}<small>Our team will review these requests before preparing your food. Shared-kitchen cross-contact may still occur.</small></div>`:''}${r.pregnancy.length?`<div class="customer-request-box pregnancy"><b>Pregnancy preparation requests</b>${r.pregnancy.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:''}${r.prep.length?`<div class="customer-request-box"><b>Preparation preferences</b>${r.prep.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:''}${r.note?`<div class="customer-request-box"><b>Order note</b><p>${esc(r.note)}</p></div>`:''}`}

function syncCheckoutPackingV1136(d){
  const selected=d?.packingPreference||'';
  $$('input[name="checkoutPackingPreference"]').forEach(x=>x.checked=x.value===selected);
  const box=$('#checkoutPackingV1136');if(box)box.classList.toggle('needs-choice',!selected);
  const err=$('#checkoutPackingErrorV1136');if(err)err.hidden=!!selected;
}
function bindCheckoutPackingV1136(){
  $$('input[name="checkoutPackingPreference"]').forEach(x=>{if(x.dataset.bound)return;x.dataset.bound='1';x.addEventListener('change',()=>{const d=getDraft();if(!d)return;d.packingPreference=x.value;localStorage.setItem(DRAFT_KEY,JSON.stringify(d));syncCheckoutPackingV1136(d);$('#draftCustomerMeta').innerHTML=infoGridHtml(d)})});
}
function selectedCheckoutPackingV1136(){return $('input[name="checkoutPackingPreference"]:checked')?.value||''}
function hideLoading(){$('#checkoutLoading').hidden=true;$('#checkoutLoading').style.display='none'}
function showDraft(){
  const d=getDraft();hideLoading();if(!d||!d.items?.length){location.href='order.html';return}
  document.body.classList.add('review-mode');document.body.classList.remove('tracking-mode','recovery-mode');$('#draftCheckout').hidden=false;bindCheckoutPackingV1136();syncCheckoutPackingV1136(d);const req=compactRequestsHtmlV1127(d);$('#draftItems').innerHTML=itemsHtml(d.items,true);$('#draftRequestsCard').hidden=!req;$('#draftRequests').innerHTML=req;$('#draftCustomerMeta').innerHTML=infoGridHtml(d);const t=draftTotals(d);$('#draftTotals').innerHTML=totalsHtml(t,'');$('#draftPaymentInstructions').innerHTML=paymentInstructions(d,t);
}
async function unlockReadyAudio(){
  if(!readyAudio)return false;try{readyAudio.volume=0;await readyAudio.play();readyAudio.pause();readyAudio.currentTime=0;readyAudio.volume=.35;alertUnlocked=true;$('#enableReadyAlert')?.classList.add('enabled');if($('#enableReadyAlert'))$('#enableReadyAlert').textContent='🔔 Ready alert on';return true}catch{return false}
}
function stopReadyAudio(){if(!readyAudio)return;readyAudio.pause();readyAudio.currentTime=0}
async function startReadyAudio(orderNo){
  if(sessionStorage.getItem(`vietNomNomReadyAck:${orderNo}`)==='1')return;
  const fallback=$('#readyAlertFallback');
  if(!readyAudio)return;
  readyAudio.loop=true;
  readyAudio.volume=.35;
  try{
    await readyAudio.play();
    alertUnlocked=true;
    if(fallback)fallback.hidden=true;
  }catch{
    $('#enableReadyAlert')?.classList.add('needs-tap');
    if($('#enableReadyAlert'))$('#enableReadyAlert').textContent='🔔 Tap once to enable READY sound';
    if(fallback)fallback.hidden=false;
  }
}
async function confirmDraft(){
  const d=getDraft(),btn=$('#confirmOrderBtn');if(!d||!d.items?.length)return;const pack=selectedCheckoutPackingV1136();if(!pack){const box=$('#checkoutPackingV1136'),err=$('#checkoutPackingErrorV1136');if(box){box.classList.add('needs-choice');box.scrollIntoView({behavior:'smooth',block:'center'})}if(err)err.hidden=false;alert('Please choose whether you want utensils, napkins, both, or neither.');return}d.packingPreference=pack;localStorage.setItem(DRAFT_KEY,JSON.stringify(d));btn.disabled=true;btn.textContent='Placing order…';
  await unlockReadyAudio();
  try{
    const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({customer:d.customer,items:d.items.map(x=>({id:x.id,qty:x.qty,displayName:x.name,modifiers:Array.isArray(x.modifiers)?x.modifiers:[],selections:x.selections||null})),fulfillment:d.fulfillment,address:d.address||'',distanceKm:Number(d.distanceKm)||0,requestedTime:d.requestedTime||'ASAP',payment:d.payment,notes:composeOrderNotesV1135(d)})});
    const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||'Could not place your order.');
    const o=out.order;if(!o?.orderNo)throw new Error('Order confirmation was incomplete.');saveTracking(o.orderNo,d.customer.phone);localStorage.removeItem(DRAFT_KEY);localStorage.removeItem('vietNomNomCart');history.replaceState({},'',`checkout.html?order=${encodeURIComponent(o.orderNo)}`);$('#draftCheckout').hidden=true;activeOrder=o;renderLive(o);startPolling(o.orderNo,d.customer.phone);
  }catch(e){btn.disabled=false;btn.textContent='Confirm & Send Order';alert(e.message||'Could not place your order. Please try again.')}
}
async function fetchTrackedOrder(orderNo,phone){const r=await fetch('/api/public/order-status',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({orderNo,phone})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load order status.');return d}
function currentStatusLabel(o){if(o.status==='new'&&o.requestedTime!=='ASAP')return 'Pre-order received';return ({new:'Order received',accepted:'Accepted',preparing:'Preparing',ready:'Ready','out-for-delivery':'Out for delivery',completed:'Completed',cancelled:'Cancelled'})[o.status]||o.status}
function statusHeadline(o){
  if(o.status==='new')return o.requestedTime!=='ASAP'?`Your pre-order is scheduled for ${requestedTimeLabel(o.requestedTime)}.`:'Your order has reached Viet Nom Nom and is waiting for staff acceptance.';
  if(o.status==='accepted')return 'Your order has been accepted. The kitchen will get it moving shortly.';
  if(o.status==='preparing')return 'The kitchen is preparing your food now.';
  if(o.status==='ready')return o.fulfillment==='delivery'?'Your food is ready and waiting to head your way.':'Your food is ready for pickup — hot, fresh, and ready to enjoy!';
  if(o.status==='out-for-delivery')return 'Your order is on the way. Please keep an eye out for the driver.';
  if(o.status==='completed')return 'Order complete. Thank you for supporting Viet Nom Nom!';
  if(o.status==='cancelled')return 'This order was cancelled. Please call the restaurant if you have questions.';
  return 'We’re keeping this page updated automatically.';
}
function timelineStages(o){const stages=[['new','Received'],['accepted','Accepted'],['preparing','Preparing'],['ready',o.fulfillment==='delivery'?'Ready for delivery':'Ready for pickup']];if(o.fulfillment==='delivery')stages.push(['out-for-delivery','On the way']);stages.push(['completed','Completed']);return stages}
function timelineHtml(o){
  const stages=timelineStages(o),order=stages.map(x=>x[0]),idx=o.status==='cancelled'?-1:order.indexOf(o.status);return stages.map((s,i)=>`<div class="status-step ${idx>=i?'done':''} ${idx===i?'current':''}"><div class="status-dot">${idx>i?'✓':i+1}</div><div><b>${esc(s[1])}</b><small>${idx===i?'Current status':idx>i?'Completed':'Waiting'}</small></div></div>`).join('')
}
function renderReady(o,previousStatus){
  const box=$('#readyCelebration');
  const isReady=o.status==='ready';
  if(!isReady){
    box.hidden=true;
    box.classList.remove('acknowledged');
    stopReadyAudio();
    return;
  }
  box.hidden=false;
  const delivery=o.fulfillment==='delivery';
  $('#readyTitle').textContent=delivery?'Your food is ready!':'Your order is ready for pickup!';
  $('#readyMessage').textContent=delivery?'Fresh from the kitchen and waiting to head your way.':'Come grab it while it’s piping hot, fresh, and delicious!';
  if(previousStatus!=='ready')startReadyAudio(o.orderNo);
}
function renderLive(o){
  const previousStatus=lastRenderedStatus;
  activeOrder=o;hideLoading();document.body.classList.add('tracking-mode');document.body.classList.remove('review-mode','recovery-mode');$('#trackingRecovery').hidden=true;$('#draftCheckout').hidden=true;$('#liveTracking').hidden=false;$('#liveOrderNumber').textContent=`Order ${o.orderNo}`;$('#liveHeadline').textContent=statusHeadline(o);const pill=$('#liveStatusPill');pill.textContent=currentStatusLabel(o);pill.className=`tracking-status-pill ${String(o.status||'').replaceAll('-','_')}`;
  const pre=$('#preorderBanner');if(o.requestedTime&&o.requestedTime!=='ASAP'){pre.hidden=false;pre.innerHTML=`<span>PRE-ORDER</span><div><b>${esc(requestedTimeLabel(o.requestedTime))}</b><small>Your order is visible to staff now. Kitchen timing follows your requested time.</small></div>`}else pre.hidden=true;
  $('#statusTimeline').innerHTML=timelineHtml(o);const req=compactRequestsHtmlV1127(o);$('#liveItems').innerHTML=itemsHtml(o.items,true);$('#liveRequestsCard').hidden=!req;$('#liveRequests').innerHTML=req;$('#liveCustomerMeta').innerHTML=infoGridHtml(o);const t=orderTotals(o);$('#liveTotals').innerHTML=totalsHtml(t,o.promotion||'');$('#livePaymentInstructions').innerHTML=paymentInstructions({...o,orderNo:o.orderNo},t);$('#lastUpdated').textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
  renderReady(o,previousStatus);
  lastRenderedStatus=o.status;
}
async function refreshTracking(orderNo,phone){try{const d=await fetchTrackedOrder(orderNo,phone);renderLive(d.order);return d.order}catch(e){console.error(e);$('#lastUpdated').textContent='Could not refresh · tap Refresh status';throw e}}
function startPolling(orderNo,phone){clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden)refreshTracking(orderNo,phone).catch(()=>{})},5000);$('#manualRefresh').onclick=()=>refreshTracking(orderNo,phone).catch(e=>alert(e.message));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTracking(orderNo,phone).catch(()=>{})},{passive:true})}
function showRecovery(orderNo){hideLoading();document.body.classList.add('recovery-mode');document.body.classList.remove('review-mode','tracking-mode');$('#trackingRecovery').hidden=false;$('#recoveryBtn').onclick=async()=>{const phone=$('#recoveryPhone').value.trim(),msg=$('#recoveryMsg');msg.textContent='';if(!phone){msg.textContent='Enter the phone number used for this order.';return}try{const d=await fetchTrackedOrder(orderNo,phone);saveTracking(orderNo,phone);renderLive(d.order);startPolling(orderNo,phone)}catch(e){msg.textContent=e.message}}}
async function loadTracking(orderNo){const saved=getTracking(orderNo);if(!saved?.phone){showRecovery(orderNo);return}try{const d=await fetchTrackedOrder(orderNo,saved.phone);renderLive(d.order);startPolling(orderNo,saved.phone)}catch{showRecovery(orderNo)}}

// Prime browser audio on the customer's first deliberate interaction so the
// READY chime has the best chance of playing later without another tap.
document.addEventListener('pointerdown',()=>{if(!alertUnlocked)unlockReadyAudio().catch(()=>{})},{once:true,passive:true});

$('#confirmOrderBtn')?.addEventListener('click',confirmDraft);
$('#ackReadySound')?.addEventListener('click',async()=>{
  if(!activeOrder?.orderNo)return;sessionStorage.setItem(`vietNomNomReadyAck:${activeOrder.orderNo}`,'1');stopReadyAudio();const btn=$('#ackReadySound');btn.disabled=true;btn.textContent='Sending pickup confirmation…';
  try{const r=await fetch('/api/public/order-coming',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},cache:'no-store',body:JSON.stringify({orderNo:activeOrder.orderNo,phone:activeOrder.customer?.phone||''})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not notify staff.');activeOrder.customerComingAt=d.customerComingAt;$('#readyCelebration').classList.add('acknowledged');btn.textContent="✓ I'm Coming · Staff notified"}catch(e){btn.disabled=false;btn.textContent="Got it · stop sound · I'm Coming";alert(e.message||'Could not notify staff.')}
});
$('#enableReadyAlert')?.addEventListener('click',async()=>{await unlockReadyAudio();if(activeOrder?.status==='ready')startReadyAudio(activeOrder.orderNo)});

(async function init(){
  const params=new URLSearchParams(location.search),orderNo=params.get('order');
  if(orderNo){await loadTracking(orderNo);return}
  const draft=getDraft();
  if(draft?.items?.length){showDraft();return}
  let last='';try{last=localStorage.getItem('vietNomNomLastTrackedOrderV1')||''}catch{}
  if(last){history.replaceState({},'',`checkout.html?order=${encodeURIComponent(last)}`);await loadTracking(last);return}
  showDraft();
})().catch(e=>{hideLoading();document.body.classList.add('recovery-mode');$('#trackingRecovery').hidden=false;$('#recoveryMsg').textContent=e.message||'Could not load checkout.'});
