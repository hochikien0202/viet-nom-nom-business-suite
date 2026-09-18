let PIN=sessionStorage.getItem('vietNomNomManagerPin')||'',DATA={menu:[],promotions:[],inventory:[],recipes:[],employees:[],payroll:[],sales:[],orders:[],analytics:{},settings:{},storeStatus:{}},cart=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], money=n=>'$'+(Number(n)||0).toFixed(2), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function requestJson(path,opt={},timeoutMs=8000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(path,{...opt,cache:'no-store',signal:c.signal});const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||('Request failed ('+r.status+')'));e.status=r.status;throw e}return d}finally{clearTimeout(t)}}
async function api(path,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json','x-admin-pin':PIN};return requestJson(path,opt)}
async function login(){const pin=$('#pin').value.trim(),btn=$('#login button');if(!pin)return $('#loginMsg').textContent='Enter the manager PIN.';btn.disabled=true;btn.textContent='Opening…';$('#loginMsg').textContent='';try{await requestJson('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});PIN=pin;sessionStorage.setItem('vietNomNomManagerPin',pin);showApp();await loadAll()}catch(e){if(e.status===401)sessionStorage.removeItem('vietNomNomManagerPin');PIN=e.status===401?'':PIN;$('#loginMsg').textContent=e.name==='AbortError'?'Server did not respond. Make sure npm start is still running.':e.message;if(!PIN){$('#app').classList.add('hidden');$('#login').classList.remove('hidden')}}finally{btn.disabled=false;btn.textContent='Open Dashboard'}}
function logout(){sessionStorage.removeItem('vietNomNomManagerPin');location.reload()}
function showApp(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden')}
function go(name){$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$$('.page').forEach(p=>p.classList.toggle('active',p.id===name));const map={dashboard:['Dashboard',"Viet Nom Nom operations overview"],store:['Website / Store','Opening hours, ordering availability and live website controls'],pos:['New Sale / POS','Enter each sale, discount and final amount'],sales:['Sales History','Revenue and transaction records'],menu:['Menu Management','Add, remove and update dishes and pricing'],promos:['Promotions','Create and enable discounts'],inventory:['Inventory','Track stock and reorder levels'],recipes:['Recipe Book','Kitchen recipes, ingredients and preparation methods'],staff:['Staff / CRM','Employee profiles, employment details and payroll defaults'],payroll:['Payroll','Pay periods, hours, cheque/cash records and payroll history'],orders:['Online Orders','Clean order history across website, dine-in, pickup and staff POS']};$('#pageTitle').textContent=map[name][0];$('#pageSub').textContent=map[name][1];if(name==='pos'){renderPOSMenu();renderCart()}if(name==='payroll')renderPayroll();if(name==='recipes')renderRecipes()}
$$('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));
async function loadAll(){try{const [m,p,i,r,e,pr,s,o,a,st]=await Promise.all([...['menu','promotions','inventory','recipes','employees','payroll','sales'].map(k=>api('/api/admin/'+k)),api('/api/admin/orders'),api('/api/admin/analytics'),api('/api/admin/settings')]);DATA={menu:m.menu||[],promotions:p.promotions||[],inventory:i.inventory||[],recipes:r.recipes||[],employees:e.employees||[],payroll:pr.payroll||[],sales:s.sales||[],orders:o.orders||[],analytics:a||{},settings:st.settings||{},storeStatus:st.status||{}};renderAll();$('#loginMsg').textContent=''}catch(e){console.error(e);if(e.status===401){sessionStorage.removeItem('vietNomNomManagerPin');PIN='';$('#app').classList.add('hidden');$('#login').classList.remove('hidden');$('#loginMsg').textContent='Session expired or PIN is incorrect. Enter 2468 again.'}else{const msg=e.name==='AbortError'?'Connection timed out. Keep the Terminal server running and press Refresh.':e.message;const appMsg=document.getElementById('appStatus');if(appMsg)appMsg.textContent='Connection issue: '+msg;else alert('Dashboard connection issue: '+msg)}}}
function renderAll(){renderDashboard();renderManagerStore();renderPOSFilters();renderMenu();renderPromos();renderInventory();renderRecipes();renderStaff();renderPayroll();renderSales();renderOrders();}
function renderDashboard(){const a=DATA.analytics;$('#metrics').innerHTML=[['Today Sales',money(a.todaySales)],['Today Orders',a.todayOrders||0],['This Month',money(a.monthSales)],['Low Stock',a.lowStock||0],['All Recorded Sales',money(a.allSales)],['Active Staff',a.activeEmployees||0]].map(x=>`<div class="metric"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');$('#topItems').innerHTML=(a.topItems||[]).length?(a.topItems||[]).map((x,i)=>`<div class="cart-row"><span>${i+1}. <b>${esc(x.name)}</b></span><strong>${x.qty} sold</strong></div>`).join(''):'<p class="muted">No sales entered yet.</p>'}
function renderManagerStore(){if(!$('#managerStoreOverride'))return;const s=DATA.settings||{},st=DATA.storeStatus||{};$('#managerStoreOverride').value=s.storeOverride||'auto';$('#managerOnlineOrdering').value=String(!!s.onlineOrderingEnabled);if($('#managerDeliveryEnabled'))$('#managerDeliveryEnabled').value=String(s.deliveryEnabled!==false);$('#managerNotice').value=s.notice||'';$('#managerStoreStatus').innerHTML=`<b>${st.open?'🟢 OPEN':'🔴 CLOSED'}</b> · ${esc(st.reason||'')}`;const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];$('#managerHours').innerHTML='<h3>Weekly opening hours</h3>'+days.map(d=>{const h=s.hours?.[d]||{open:'10:00',close:'20:00',closed:false};return `<div class="formrow"><label style="text-transform:capitalize">${d}<select data-mday="${d}" data-mk="closed"><option value="false" ${!h.closed?'selected':''}>Open</option><option value="true" ${h.closed?'selected':''}>Closed</option></select></label><label>Open<input type="time" data-mday="${d}" data-mk="open" value="${h.open||'10:00'}"></label><label>Close<input type="time" data-mday="${d}" data-mk="close" value="${h.close||'20:00'}"></label></div>`}).join('')}
async function saveManagerStore(){const hours={};$$('[data-mday]').forEach(el=>{const d=el.dataset.mday;hours[d]=hours[d]||{};hours[d][el.dataset.mk]=el.dataset.mk==='closed'?el.value==='true':el.value});await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify({storeOverride:$('#managerStoreOverride').value,onlineOrderingEnabled:$('#managerOnlineOrdering').value==='true',deliveryEnabled:$('#managerDeliveryEnabled')?$('#managerDeliveryEnabled').value==='true':true,notice:$('#managerNotice').value,hours})});await loadAll();alert('Website and Staff Admin updated.')}
function promoStatus(p){const now=Date.now(),st=p.startAt?new Date(p.startAt).getTime():0,en=p.endAt?new Date(p.endAt).getTime():0;if(!p.active)return ['OFF','bad'];if(st&&now<st)return ['SCHEDULED','warn'];if(en&&now>en)return ['EXPIRED','bad'];return ['ACTIVE','good']}
function promoEligible(p,channel='pos',subtotal=0){if(!p||!p.active)return false;const now=Date.now();if(p.startAt&&now<new Date(p.startAt).getTime())return false;if(p.endAt&&now>new Date(p.endAt).getTime())return false;if(Array.isArray(p.channels)&&p.channels.length&&!p.channels.includes(channel))return false;const f=String($('#saleChannel')?.value||'').toLowerCase();if(Array.isArray(p.allowedFulfillments)&&p.allowedFulfillments.length&&f&&!p.allowedFulfillments.map(x=>String(x).toLowerCase()).includes(f))return false;if(Number(p.minSpend||0)>subtotal)return false;return true}
function renderPOSFilters(){const catOld=$('#posCategory')?.value||'All',promoOld=$('#salePromo')?.value||'',cats=['All',...new Set(DATA.menu.filter(x=>x.active&&!x.soldOut).map(x=>x.category))];$('#posCategory').innerHTML=cats.map(c=>`<option ${c===catOld?'selected':''}>${esc(c)}</option>`).join('');const sub=cart.reduce((s,x)=>s+x.price*x.qty,0);$('#salePromo').innerHTML='<option value="">No promotion</option>'+DATA.promotions.filter(p=>promoEligible(p,'pos',sub)).map(x=>`<option value="${x.id}" ${x.id===promoOld?'selected':''}>${esc(x.name)} (${x.type==='percent'?x.value+'%':'$'+Number(x.value).toFixed(2)})</option>`).join('');renderPOSMenu();renderCart()}
function renderPOSMenu(){if(!$('#posMenu'))return;const q=$('#posSearch').value.toLowerCase(),cat=$('#posCategory').value;const list=DATA.menu.filter(x=>x.active&&!x.soldOut&&(cat==='All'||!cat||x.category===cat)&&(!q||x.name.toLowerCase().includes(q)));$('#posMenu').innerHTML=list.map(x=>`<button class="menu-btn" onclick="addCart('${x.id}')"><b>${esc(x.name)}</b><small>${esc(x.category)}</small><strong>${money(x.price)}</strong></button>`).join('')||'<p class="muted">No matching items.</p>'}
function addCart(id){const x=DATA.menu.find(m=>m.id===id),c=cart.find(m=>m.id===id);if(c)c.qty++;else cart.push({...x,qty:1});renderPOSFilters()}
function qCart(id,d){const c=cart.find(x=>x.id===id);if(!c)return;c.qty+=d;if(c.qty<=0)cart=cart.filter(x=>x.id!==id);renderPOSFilters()}
function renderCart(){if(!$('#cart'))return;$('#cart').innerHTML=cart.length?cart.map(x=>`<div class="cart-row"><div><b>${esc(x.name)}</b><div class="muted">${money(x.price)} each</div></div><div class="qty"><button onclick="qCart('${x.id}',-1)">−</button><b>${x.qty}</b><button onclick="qCart('${x.id}',1)">+</button><strong>${money(x.price*x.qty)}</strong></div></div>`).join(''):'<p class="muted">No items yet. Select items from the menu.</p>';const sub=cart.reduce((s,x)=>s+x.price*x.qty,0),pid=$('#salePromo')?.value,p=DATA.promotions.find(x=>x.id===pid),eligible=promoEligible(p,'pos',sub);let pd=eligible?(p.type==='percent'?sub*p.value/100:p.value):0;if(eligible&&Number(p.maxDiscount||0)>0)pd=Math.min(pd,Number(p.maxDiscount));const md=Number($('#manualDiscount')?.value)||0,disc=Math.min(sub,pd+md),tax=(sub-disc)*.13,total=sub-disc+tax;$('#totals').innerHTML=`<div><span>Subtotal</span><b>${money(sub)}</b></div><div><span>Discount</span><b>−${money(disc)}</b></div><div><span>HST 13%</span><b>${money(tax)}</b></div><div class="grand"><span>Total</span><b>${money(total)}</b></div>`}
async function completeSale(){if(!cart.length)return alert('Add at least one item.');const payload={items:cart.map(x=>({id:x.id,qty:x.qty})),promotionId:$('#salePromo').value,manualDiscount:Number($('#manualDiscount').value)||0,payment:$('#salePayment').value,channel:$('#saleChannel').value,customerName:$('#customerName').value,notes:$('#saleNotes').value};try{const d=await api('/api/admin/sales',{method:'POST',body:JSON.stringify(payload)});$('#saleMsg').innerHTML=`<p class="good badge">Saved ${esc(d.sale.saleNo)} • Final total ${money(d.sale.total)}</p>`;cart=[];$('#manualDiscount').value=0;$('#customerName').value='';$('#saleNotes').value='';await loadAll();renderCart()}catch(e){alert(e.message)}}
function renderSales(){$('#salesTable').innerHTML=DATA.sales.map(s=>`<tr><td><b>${esc(s.saleNo)}</b></td><td>${new Date(s.createdAt).toLocaleString()}</td><td>${s.items.map(i=>`${i.qty}× ${esc(i.name)}`).join('<br>')}</td><td>${s.promotion?esc(s.promotion)+'<br>':''}${s.discount?'-'+money(s.discount):'—'}</td><td>${esc(s.payment)}<br><span class="muted">${esc(s.channel)}</span></td><td><b>${money(s.total)}</b></td></tr>`).join('')||'<tr><td colspan="6">No sales recorded.</td></tr>'}
function showMenuForm(){$('#menuForm').classList.remove('hidden');$('#menuForm').innerHTML='<input id="mn" placeholder="Dish name"><input id="mc" placeholder="Category"><input id="mp" type="number" step=".01" placeholder="Price"><input id="mco" type="number" step=".01" placeholder="Cost"><input id="md" placeholder="Description"><button onclick="addMenu()">Save Item</button>'}
async function addMenu(){await api('/api/admin/menu',{method:'POST',body:JSON.stringify({name:$('#mn').value,category:$('#mc').value,price:$('#mp').value,cost:$('#mco').value,description:$('#md')?.value||''})});$('#menuForm').classList.add('hidden');await loadAll()}
async function patchMenu(id,k,v){await api('/api/admin/menu/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});await loadAll()}
async function delMenu(id){if(confirm('Remove this menu item?')){await api('/api/admin/menu/'+id,{method:'DELETE'});await loadAll()}}
function renderMenu(){$('#menuTable').innerHTML=DATA.menu.map(x=>`<article class="manager-menu-card"><div class="manager-menu-head"><div><span>${esc(x.category)}</span><h3>${esc(x.name)}</h3></div><button class="stock-btn ${x.soldOut?'sold':'in'}" onclick="patchMenu('${x.id}','soldOut',${!x.soldOut})">${x.soldOut?'SOLD OUT':'IN STOCK'}</button></div><div class="manager-menu-fields"><label>Dish name<input value="${esc(x.name)}" onchange="patchMenu('${x.id}','name',this.value)"></label><label>Category<input value="${esc(x.category)}" onchange="patchMenu('${x.id}','category',this.value)"></label><label>Price ($)<input type="number" step=".01" value="${x.price}" onchange="patchMenu('${x.id}','price',this.value)"></label><label>Food cost ($)<input type="number" step=".01" value="${x.cost||0}" onchange="patchMenu('${x.id}','cost',this.value)"></label><label>Website<select onchange="patchMenu('${x.id}','active',this.value==='true')"><option value="true" ${x.active?'selected':''}>Visible</option><option value="false" ${!x.active?'selected':''}>Hidden</option></select></label></div><label>Description<textarea rows="2" onchange="patchMenu('${x.id}','description',this.value)">${esc(x.description||'')}</textarea></label><div class="manager-menu-actions"><span class="muted">Website sync: ${x.active?'Visible':'Hidden'}</span><button class="danger-btn" onclick="delMenu('${x.id}')">Delete item</button></div></article>`).join('')}
function toLocalInput(v){if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function showPromoForm(){$('#promoForm').classList.remove('hidden');$('#promoForm').innerHTML=`<div class="promo-editor"><label>Promotion name<input id="pn" placeholder="e.g. Student 10% Off"></label><label>Discount type<select id="pt"><option value="percent">Percent %</option><option value="fixed">Fixed amount $</option></select></label><label>Discount value<input id="pv" type="number" min="0" step=".01" placeholder="10"></label><label>Promo code (optional)<input id="pc" placeholder="STUDENT10"></label><label>Starts<input id="ps" type="datetime-local"></label><label>Ends<input id="pe" type="datetime-local"></label><label>Minimum spend<input id="pmin" type="number" min="0" step=".01" value="0"></label><label>Maximum discount<input id="pmax" type="number" min="0" step=".01" value="0"><small>0 = no cap</small></label><label class="checkline"><input id="ppos" type="checkbox" checked> POS / Staff</label><label class="checkline"><input id="pweb" type="checkbox"> Website</label><label class="wide">Internal notes<textarea id="pnotes" rows="2" placeholder="ID required, cannot combine with other offers..."></textarea></label><button class="primary wide" onclick="addPromo()">Save Promotion</button></div>`}
async function addPromo(){const channels=[];if($('#ppos').checked)channels.push('pos');if($('#pweb').checked)channels.push('website');await api('/api/admin/promotions',{method:'POST',body:JSON.stringify({name:$('#pn').value,type:$('#pt').value,value:$('#pv').value,code:$('#pc').value,startAt:$('#ps').value,endAt:$('#pe').value,minSpend:$('#pmin').value,maxDiscount:$('#pmax').value,channels,websiteVisible:$('#pweb').checked,notes:$('#pnotes').value})});$('#promoForm').classList.add('hidden');await loadAll()}
async function patchPromo(id,k,v){await api('/api/admin/promotions/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});await loadAll()}
async function togglePromo(id,active){await patchPromo(id,'active',active)}
async function delPromo(id){if(confirm('Delete promotion?')){await api('/api/admin/promotions/'+id,{method:'DELETE'});await loadAll()}}
function renderPromos(){$('#promoCards').innerHTML=DATA.promotions.map(p=>{const [label,cls]=promoStatus(p),channels=(p.channels||[]).map(x=>x==='pos'?'POS':'Website').join(' • ')||'No channel';return `<div class="card promo-card"><div class="topline"><div><h3>${esc(p.name)}</h3><div class="promo-value">${p.type==='percent'?p.value+'% OFF':money(p.value)+' OFF'}</div></div><span class="badge ${cls}">${label}</span></div><div class="promo-meta"><span><b>Runs</b>${p.startAt?new Date(p.startAt).toLocaleString():'Immediately'} → ${p.endAt?new Date(p.endAt).toLocaleString():'No end date'}</span><span><b>Channels</b>${esc(channels)}</span><span><b>Minimum</b>${money(p.minSpend||0)}</span><span><b>Max discount</b>${Number(p.maxDiscount||0)>0?money(p.maxDiscount):'No cap'}</span>${p.code?`<span><b>Code</b>${esc(p.code)}</span>`:''}</div>${p.notes?`<p class="muted">${esc(p.notes)}</p>`:''}<div class="card-actions"><button onclick="togglePromo('${p.id}',${!p.active})">${p.active?'Disable':'Enable'}</button><button onclick="patchPromo('${p.id}','websiteVisible',${!p.websiteVisible})">${p.websiteVisible?'Hide from website':'Show on website'}</button><button class="danger-btn" onclick="delPromo('${p.id}')">Delete</button></div></div>`}).join('')||'<p>No promotions.</p>'}
function showInventoryForm(){$('#inventoryForm').classList.remove('hidden');$('#inventoryForm').innerHTML='<input id="in" placeholder="Ingredient / item"><input id="iu" placeholder="Unit e.g. kg"><input id="iq" type="number" step=".01" placeholder="Current qty"><input id="ir" type="number" step=".01" placeholder="Reorder at"><button onclick="addInventory()">Save Stock Item</button>'}
async function addInventory(){await api('/api/admin/inventory',{method:'POST',body:JSON.stringify({name:$('#in').value,unit:$('#iu').value,qty:$('#iq').value,reorder:$('#ir').value})});$('#inventoryForm').classList.add('hidden');await loadAll()}
async function patchInv(id,k,v){await api('/api/admin/inventory/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});await loadAll()}
async function delInv(id){if(confirm('Delete inventory item?')){await api('/api/admin/inventory/'+id,{method:'DELETE'});await loadAll()}}
function invStatus(x){if(x.statusOverride==='reorder')return 'NEEDS STOCKING';if(x.statusOverride==='ok')return 'STOCKED';return Number(x.qty)<=Number(x.reorder)?'NEEDS STOCKING':'STOCKED'}
function renderInventory(){$('#inventoryTable').innerHTML=DATA.inventory.map(x=>{const st=invStatus(x),needs=st==='NEEDS STOCKING';return `<tr><td><b>${esc(x.name)}</b></td><td><div class="inventory-number"><input type="number" step=".01" value="${x.qty}" onchange="patchInv('${x.id}','qty',this.value)"><span>${esc(x.unit)}</span></div></td><td><input type="number" step=".01" value="${x.reorder}" onchange="patchInv('${x.id}','reorder',this.value)"></td><td><input type="number" step=".01" value="${x.targetQty||0}" onchange="patchInv('${x.id}','targetQty',this.value)"></td><td><input value="${esc(x.usageNote||'')}" placeholder="e.g. 2 kg/day" onchange="patchInv('${x.id}','usageNote',this.value)"></td><td><div class="money-input"><span>$</span><input type="number" step=".01" value="${x.cost||0}" onchange="patchInv('${x.id}','cost',this.value)"></div></td><td><input value="${esc(x.supplier||'')}" placeholder="Supplier" onchange="patchInv('${x.id}','supplier',this.value)"></td><td><select class="stock-status-select" onchange="patchInv('${x.id}','statusOverride',this.value)"><option value="auto" ${!x.statusOverride||x.statusOverride==='auto'?'selected':''}>Auto · ${st}</option><option value="ok" ${x.statusOverride==='ok'?'selected':''}>STOCKED</option><option value="reorder" ${x.statusOverride==='reorder'?'selected':''}>NEEDS STOCKING</option></select><div class="stock-badge-wrap"><span class="badge ${needs?'bad':'good'}">${st}</span></div></td><td><button class="danger-btn" onclick="delInv('${x.id}')">Delete</button></td></tr>`}).join('')}
async function sendReorderList(){const list=DATA.inventory.filter(x=>invStatus(x)==='NEEDS STOCKING');if(!list.length)return alert('No items are marked NEEDS STOCKING.');if(!confirm(`Send ${list.length} item(s) that need stocking to the owner at 382-342-2566?`))return;try{const d=await api('/api/admin/inventory/send-reorder',{method:'POST',body:JSON.stringify({})});$('#inventorySendMsg').textContent=d.live?'Reorder list sent by SMS.':'Reorder list saved in SMS simulation mode. Configure Twilio to send live.';alert(d.message||'Reorder list processed.')}catch(e){alert(e.message)}}
function showStaffForm(){
  $('#staffForm').classList.remove('hidden');
  $('#staffForm').innerHTML=`<div class="employee-editor">
  <label>Legal name<input id="sn" placeholder="Full legal name"></label><label>Preferred name<input id="sPreferred" placeholder="Optional"></label><label>Role / Position<input id="sr" placeholder="Server, Cook, Manager..."></label><label>Employment type<select id="sType"><option>Part-time</option><option>Full-time</option><option>Temporary</option><option>Seasonal</option></select></label>
  <label>Phone<input id="sp" placeholder="519-555-0000"></label><label>Email<input id="se" type="email" placeholder="employee@example.com"></label><label>Date of birth<input id="sdob" type="date"></label><label>SIN<input id="ssin" inputmode="numeric" maxlength="11" placeholder="Private"></label>
  <label class="wide">Home address<input id="saddr" placeholder="Street address"></label><label>City<input id="scity" value="Windsor"></label><label>Province<input id="sprov" value="ON"></label><label>Postal code<input id="spostal"></label><label>Hire date<input id="shire" type="date"></label>
  <label>Emergency contact<input id="semname"></label><label>Emergency phone<input id="semphone"></label><label>Hourly rate ($)<input id="sw" type="number" step=".01" min="0"></label><label>Pay frequency<select id="sfreq"><option>Bi-weekly</option><option>Weekly</option><option>Daily</option></select></label><label>Default payment<select id="smethod"><option>Cheque</option><option>Cash</option><option>E-transfer</option><option>Direct Deposit</option></select></label>
  <label class="wide">Notes<textarea id="snotes" rows="2"></textarea></label><button class="primary wide" onclick="addStaff()">Save Employee Profile</button></div>`
}
async function addStaff(){await api('/api/admin/employees',{method:'POST',body:JSON.stringify({name:$('#sn').value,preferredName:$('#sPreferred').value,role:$('#sr').value,employmentType:$('#sType').value,phone:$('#sp').value,email:$('#se').value,dateOfBirth:$('#sdob').value,sin:$('#ssin').value,address:$('#saddr').value,city:$('#scity').value,province:$('#sprov').value,postalCode:$('#spostal').value,hireDate:$('#shire').value,emergencyName:$('#semname').value,emergencyPhone:$('#semphone').value,hourlyRate:$('#sw').value,payFrequency:$('#sfreq').value,defaultPaymentMethod:$('#smethod').value,notes:$('#snotes').value,status:'Active'})});$('#staffForm').classList.add('hidden');await loadAll()}
async function patchStaff(id,k,v){await api('/api/admin/employees/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});await loadAll()}
async function delStaff(id){if(confirm('Delete employee record? Payroll history will remain as a separate record.')){await api('/api/admin/employees/'+id,{method:'DELETE'});await loadAll()}}
function maskSin(v){const d=String(v||'').replace(/\D/g,'');return d?`••• ••• ${d.slice(-3)}`:'Not entered'}
function renderStaff(){$('#staffCards').innerHTML=DATA.employees.map(e=>`<article class="card employee-card"><div class="topline"><div><h3>${esc(e.preferredName||e.name)}</h3><small>${esc(e.name)}</small></div><span class="badge ${e.status==='Active'?'good':'bad'}">${esc(e.status)}</span></div><div class="employee-summary"><span><b>${esc(e.role||'Staff')}</b>${esc(e.employmentType||'')}</span><span><b>${esc(e.phone||'No phone')}</b>${esc(e.email||'')}</span><span><b>${money(e.hourlyRate||0)}/hr</b>${esc(e.payFrequency||'Bi-weekly')} · ${esc(e.defaultPaymentMethod||'Cheque')}</span><span><b>SIN</b>${esc(maskSin(e.sin))}</span></div><details><summary>Edit private employee information</summary><div class="employee-edit-grid"><label>Legal name<input value="${esc(e.name)}" onchange="patchStaff('${e.id}','name',this.value)"></label><label>Preferred name<input value="${esc(e.preferredName||'')}" onchange="patchStaff('${e.id}','preferredName',this.value)"></label><label>Role<input value="${esc(e.role||'')}" onchange="patchStaff('${e.id}','role',this.value)"></label><label>Employment type<select onchange="patchStaff('${e.id}','employmentType',this.value)">${['Part-time','Full-time','Temporary','Seasonal'].map(v=>`<option ${e.employmentType===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Phone<input value="${esc(e.phone||'')}" onchange="patchStaff('${e.id}','phone',this.value)"></label><label>Email<input value="${esc(e.email||'')}" onchange="patchStaff('${e.id}','email',this.value)"></label><label>Date of birth<input type="date" value="${esc(e.dateOfBirth||'')}" onchange="patchStaff('${e.id}','dateOfBirth',this.value)"></label><label>SIN<input value="${esc(e.sin||'')}" onchange="patchStaff('${e.id}','sin',this.value)"></label><label class="wide">Address<input value="${esc(e.address||'')}" onchange="patchStaff('${e.id}','address',this.value)"></label><label>City<input value="${esc(e.city||'')}" onchange="patchStaff('${e.id}','city',this.value)"></label><label>Province<input value="${esc(e.province||'')}" onchange="patchStaff('${e.id}','province',this.value)"></label><label>Postal code<input value="${esc(e.postalCode||'')}" onchange="patchStaff('${e.id}','postalCode',this.value)"></label><label>Hire date<input type="date" value="${esc(e.hireDate||'')}" onchange="patchStaff('${e.id}','hireDate',this.value)"></label><label>Emergency contact<input value="${esc(e.emergencyName||'')}" onchange="patchStaff('${e.id}','emergencyName',this.value)"></label><label>Emergency phone<input value="${esc(e.emergencyPhone||'')}" onchange="patchStaff('${e.id}','emergencyPhone',this.value)"></label><label>Hourly rate<input type="number" step=".01" value="${e.hourlyRate||0}" onchange="patchStaff('${e.id}','hourlyRate',this.value)"></label><label>Hours this week<input type="number" step=".25" value="${e.hoursThisWeek||0}" onchange="patchStaff('${e.id}','hoursThisWeek',this.value)"></label><label>Pay frequency<select onchange="patchStaff('${e.id}','payFrequency',this.value)">${['Daily','Weekly','Bi-weekly'].map(v=>`<option ${e.payFrequency===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Default payment<select onchange="patchStaff('${e.id}','defaultPaymentMethod',this.value)">${['Cheque','Cash','E-transfer','Direct Deposit'].map(v=>`<option ${e.defaultPaymentMethod===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="wide">Notes<textarea rows="2" onchange="patchStaff('${e.id}','notes',this.value)">${esc(e.notes||'')}</textarea></label></div></details><div class="employee-pay-preview"><span>Current hours</span><b>${Number(e.hoursThisWeek||0).toFixed(2)} h</b><span>Estimated gross</span><b>${money((e.hourlyRate||0)*(e.hoursThisWeek||0))}</b></div><div class="card-actions"><button class="primary" onclick="goPayrollFor('${e.id}')">Run Payroll</button><button onclick="patchStaff('${e.id}','status','${e.status==='Active'?'Inactive':'Active'}')">${e.status==='Active'?'Set inactive':'Activate'}</button><button class="danger-btn" onclick="delStaff('${e.id}')">Delete</button></div></article>`).join('')||'<p>No employees yet.</p>'}
function payrollEmployee(){return DATA.employees.find(e=>e.id===$('#payEmployee')?.value)}
function setPayrollDefaults(){const e=payrollEmployee();if(!e)return;$('#payRate').value=Number(e.hourlyRate||0).toFixed(2);$('#payFrequency').value=e.payFrequency||'Bi-weekly';$('#payMethod').value=e.defaultPaymentMethod||'Cheque';$('#payRegularHours').value=Number(e.hoursThisWeek||0);calcPayrollPreview()}
function calcPayrollPreview(){const r=Number($('#payRate')?.value)||0,h=Number($('#payRegularHours')?.value)||0,oh=Number($('#payOvertimeHours')?.value)||0,m=Number($('#payOtMultiplier')?.value)||1.5,gross=h*r+oh*r*m,d=(Number($('#payTax')?.value)||0)+(Number($('#payCpp')?.value)||0)+(Number($('#payEi')?.value)||0)+(Number($('#payOther')?.value)||0),net=Math.max(0,gross-d);if($('#payPreview'))$('#payPreview').innerHTML=`<div><span>Regular pay</span><b>${money(h*r)}</b></div><div><span>Overtime pay</span><b>${money(oh*r*m)}</b></div><div><span>Gross pay</span><b>${money(gross)}</b></div><div><span>Deductions entered</span><b>−${money(d)}</b></div><div class="grand"><span>Net payment</span><b>${money(net)}</b></div>`}
function renderPayroll(){if(!$('#payrollForm'))return;const current=$('#payEmployee')?.value||DATA.employees[0]?.id||'';$('#payrollForm').innerHTML=`<div class="payroll-form"><label class="wide">Employee<select id="payEmployee" onchange="setPayrollDefaults()">${DATA.employees.map(e=>`<option value="${e.id}" ${e.id===current?'selected':''}>${esc(e.name)} · ${esc(e.role||'Staff')}</option>`).join('')}</select></label><label>Pay frequency<select id="payFrequency"><option>Daily</option><option>Weekly</option><option>Bi-weekly</option></select></label><label>Pay date<input id="payDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Period start<input id="payStart" type="date"></label><label>Period end<input id="payEnd" type="date"></label><label>Hourly rate ($)<input id="payRate" type="number" step=".01" oninput="calcPayrollPreview()"></label><label>Regular hours<input id="payRegularHours" type="number" step=".25" min="0" oninput="calcPayrollPreview()"></label><label>Overtime hours<input id="payOvertimeHours" type="number" step=".25" min="0" value="0" oninput="calcPayrollPreview()"></label><label>OT multiplier<input id="payOtMultiplier" type="number" step=".1" min="1" value="1.5" oninput="calcPayrollPreview()"></label><div class="payroll-divider wide"><b>Deductions (manual record)</b><span>Enter actual payroll deductions from your payroll calculation/provider.</span></div><label>Income tax ($)<input id="payTax" type="number" step=".01" min="0" value="0" oninput="calcPayrollPreview()"></label><label>CPP ($)<input id="payCpp" type="number" step=".01" min="0" value="0" oninput="calcPayrollPreview()"></label><label>EI ($)<input id="payEi" type="number" step=".01" min="0" value="0" oninput="calcPayrollPreview()"></label><label>Other deductions ($)<input id="payOther" type="number" step=".01" min="0" value="0" oninput="calcPayrollPreview()"></label><label>Payment method<select id="payMethod"><option>Cheque</option><option>Cash</option><option>E-transfer</option><option>Direct Deposit</option></select></label><label>Cheque / reference #<input id="payRef" placeholder="Optional"></label><label class="wide">Payment notes<textarea id="payNotes" rows="2" placeholder="Cash envelope, cheque memo, etc."></textarea></label><div id="payPreview" class="pay-preview wide"></div><div class="payroll-warning wide">This module records payroll. It does not automatically determine CRA tax, CPP or EI obligations.</div><button class="primary big wide" onclick="recordPayroll()">Record Payroll Payment</button></div>`;if(current)setTimeout(setPayrollDefaults,0);renderPayrollTable()}
function goPayrollFor(id){go('payroll');setTimeout(()=>{if($('#payEmployee')){$('#payEmployee').value=id;setPayrollDefaults()}},0)}
async function recordPayroll(){const e=payrollEmployee();if(!e)return alert('Select an employee.');if(!$('#payStart').value||!$('#payEnd').value)return alert('Enter the pay period start and end dates.');if(!confirm(`Record payroll for ${e.name}?`))return;const body={employeeId:e.id,payFrequency:$('#payFrequency').value,payDate:$('#payDate').value,periodStart:$('#payStart').value,periodEnd:$('#payEnd').value,hourlyRate:$('#payRate').value,regularHours:$('#payRegularHours').value,overtimeHours:$('#payOvertimeHours').value,overtimeMultiplier:$('#payOtMultiplier').value,incomeTax:$('#payTax').value,cpp:$('#payCpp').value,ei:$('#payEi').value,otherDeductions:$('#payOther').value,paymentMethod:$('#payMethod').value,referenceNo:$('#payRef').value,notes:$('#payNotes').value};const d=await api('/api/admin/payroll',{method:'POST',body:JSON.stringify(body)});alert(`${d.payroll.payrollNo} recorded · Net ${money(d.payroll.netPay)}`);await loadAll();go('payroll')}
async function delPayroll(id){if(confirm('Delete this payroll record?')){await api('/api/admin/payroll/'+id,{method:'DELETE'});await loadAll();go('payroll')}}
function renderPayrollTable(){if(!$('#payrollTable'))return;$('#payrollTable').innerHTML=DATA.payroll.map(p=>`<tr><td><b>${esc(p.payrollNo)}</b><br><small>${esc(p.payDate||'')}</small></td><td>${esc(p.employeeName)}</td><td>${esc(p.periodStart)} → ${esc(p.periodEnd)}<br><small>${esc(p.payFrequency)}</small></td><td>${Number(p.regularHours||0).toFixed(2)} reg<br>${Number(p.overtimeHours||0).toFixed(2)} OT</td><td>${esc(p.paymentMethod)}${p.referenceNo?`<br><small>${esc(p.referenceNo)}</small>`:''}</td><td>${money(p.grossPay)}</td><td><b>${money(p.netPay)}</b></td><td><button class="danger-btn" onclick="delPayroll('${p.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="8">No payroll payments recorded.</td></tr>'}
function renderOrders(){$('#orderCards').innerHTML=DATA.orders.slice(0,30).map(o=>`<div class="card"><div class="topline"><h3>${esc(o.orderNo)}</h3><span class="badge">${esc(o.status)}</span></div><p><b>${esc(o.customer?.name)}</b> • ${esc(o.customer?.phone)}</p><div class="order-items">${o.items.map(i=>`${i.qty}× ${esc(i.name)}`).join('<br>')}</div><p>${esc(o.fulfillment)} • ${esc(o.payment)} • <b>${money(o.total)}</b></p><p class="muted">${new Date(o.createdAt).toLocaleString()}</p></div>`).join('')||'<p>No online orders yet.</p>'}
$('#today').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
if(PIN){showApp();loadAll()}
$('#pin')?.addEventListener('keydown',e=>{if(e.key==='Enter')login()});

// ---------------- V8 enhancements ----------------
DATA.shifts=DATA.shifts||[];
loadAll=async function(){try{const [m,p,i,e,pr,sh,s,o,a,st]=await Promise.all([...['menu','promotions','inventory','employees','payroll','shifts','sales'].map(k=>api('/api/admin/'+k)),api('/api/admin/orders'),api('/api/admin/analytics'),api('/api/admin/settings')]);DATA={menu:m.menu||[],promotions:p.promotions||[],inventory:i.inventory||[],employees:e.employees||[],payroll:pr.payroll||[],shifts:sh.shifts||[],sales:s.sales||[],orders:o.orders||[],analytics:a||{},settings:st.settings||{},storeStatus:st.status||{}};renderAll();$('#loginMsg').textContent=''}catch(e){console.error(e);if(e.status===401){sessionStorage.removeItem('vietNomNomManagerPin');PIN='';$('#app').classList.add('hidden');$('#login').classList.remove('hidden');$('#loginMsg').textContent='Session expired or PIN is incorrect.'}else alert('Dashboard connection issue: '+e.message)}};
function localDateKey(d=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
renderSales=function(){
  $('#salesTable').innerHTML=DATA.sales.map(s=>`<tr><td><b>${esc(s.saleNo)}</b></td><td>${new Date(s.createdAt).toLocaleString()}</td><td>${s.items.map(i=>`${i.qty}× ${esc(i.name)}`).join('<br>')}</td><td>${s.promotion?esc(s.promotion)+'<br>':''}${s.discount?'-'+money(s.discount):'—'}</td><td>${esc(s.payment)}<br><span class="muted">${esc(s.channel)}</span></td><td><b>${money(s.total)}</b></td></tr>`).join('')||'<tr><td colspan="6">No sales recorded.</td></tr>';
  const today=localDateKey(),rows=DATA.sales.filter(x=>localDateKey(new Date(x.createdAt))===today),subtotal=rows.reduce((a,x)=>a+Number(x.subtotal||0),0),discount=rows.reduce((a,x)=>a+Number(x.discount||0),0),tax=rows.reduce((a,x)=>a+Number(x.tax||0),0),total=rows.reduce((a,x)=>a+Number(x.total||0),0),payments={};rows.forEach(x=>payments[x.payment]=(payments[x.payment]||0)+Number(x.total||0));
  const el=$('#dailySalesSummary');if(el)el.innerHTML=[['Today orders',rows.length],['Before tax',money(subtotal-discount)],['HST collected',money(tax)],['Total sales',money(total)]].map(x=>`<article class="summary-card"><small>${x[0]}</small><strong>${x[1]}</strong></article>`).join('')+`<article class="summary-card" style="grid-column:1/-1"><small>Payment mix</small><strong style="font-size:17px">${Object.entries(payments).map(([k,v])=>`${esc(k)} ${money(v)}`).join(' · ')||'No sales today'}</strong></article>`;
};
showInventoryForm=function(){$('#inventoryForm').classList.remove('hidden');$('#inventoryForm').innerHTML='<input id="in" placeholder="Ingredient / item"><input id="iu" placeholder="Unit e.g. kg"><input id="iq" type="number" step=".01" placeholder="Current qty"><input id="ir" type="number" step=".01" placeholder="Reorder at"><input id="itarget" type="number" step=".01" placeholder="Target stock"><input id="iusage" placeholder="Usage / par note"><button class="primary" onclick="addInventoryV8()">Save Stock Item</button>'};
async function addInventoryV8(){await api('/api/admin/inventory',{method:'POST',body:JSON.stringify({name:$('#in').value,unit:$('#iu').value,qty:$('#iq').value,reorder:$('#ir').value,targetQty:$('#itarget').value,usageNote:$('#iusage').value})});$('#inventoryForm').classList.add('hidden');await loadAll()}
renderInventory=function(){$('#inventoryTable').innerHTML=DATA.inventory.map(x=>{const st=invStatus(x),low=st==='REORDER';return `<tr><td><b>${esc(x.name)}</b><br><small class="muted">Updated ${x.updatedAt?new Date(x.updatedAt).toLocaleDateString():'—'}</small></td><td><input type="number" step=".01" value="${x.qty}" onchange="patchInv('${x.id}','qty',this.value)"> ${esc(x.unit)}</td><td><input type="number" step=".01" value="${x.reorder}" onchange="patchInv('${x.id}','reorder',this.value)"></td><td><input type="number" step=".01" value="${x.targetQty||0}" onchange="patchInv('${x.id}','targetQty',this.value)"></td><td><input value="${esc(x.usageNote||'')}" placeholder="e.g. 2 kg/day" onchange="patchInv('${x.id}','usageNote',this.value)"></td><td>$ <input type="number" step=".01" value="${x.cost||0}" onchange="patchInv('${x.id}','cost',this.value)"></td><td><input value="${esc(x.supplier||'')}" placeholder="Supplier" onchange="patchInv('${x.id}','supplier',this.value)"></td><td><select onchange="patchInv('${x.id}','statusOverride',this.value)"><option value="auto" ${!x.statusOverride||x.statusOverride==='auto'?'selected':''}>Auto · ${st}</option><option value="ok" ${x.statusOverride==='ok'?'selected':''}>OK</option><option value="reorder" ${x.statusOverride==='reorder'?'selected':''}>REORDER</option></select><div style="margin-top:6px"><span class="badge ${low?'bad':'good'}">${st}</span></div></td><td><button class="danger-btn" onclick="delInv('${x.id}')">Delete</button></td></tr>`}).join('')};
function promoFormFields(p={}){return `<div class="promo-edit-grid"><label>Name<input id="epn" value="${esc(p.name||'')}"></label><label>Type<select id="ept"><option value="percent" ${p.type!=='fixed'?'selected':''}>Percent %</option><option value="fixed" ${p.type==='fixed'?'selected':''}>Fixed $</option></select></label><label>Value<input id="epv" type="number" step=".01" value="${Number(p.value||0)}"></label><label>Starts<input id="eps" type="datetime-local" value="${esc(p.startAt||'')}"></label><label>Ends<input id="epe" type="datetime-local" value="${esc(p.endAt||'')}"></label><label>Minimum spend<input id="epmin" type="number" step=".01" value="${Number(p.minSpend||0)}"></label><label>Maximum discount<input id="epmax" type="number" step=".01" value="${Number(p.maxDiscount||0)}"></label><label>Code<input id="epcode" value="${esc(p.code||'')}"></label><label><input id="eppos" type="checkbox" ${(p.channels||[]).includes('pos')?'checked':''}> POS / Staff</label><label><input id="epweb" type="checkbox" ${(p.channels||[]).includes('website')?'checked':''}> Website</label><label class="wide">Notes<textarea id="epnotes">${esc(p.notes||'')}</textarea></label></div>`}
function adjustPromo(id){const p=DATA.promotions.find(x=>x.id===id);if(!p)return;$('#promoForm').classList.remove('hidden');$('#promoForm').innerHTML=`<h3>Adjust Promotion</h3>${promoFormFields(p)}<div class="card-actions"><button class="primary" onclick="savePromoAdjust('${id}')">Save changes</button><button class="secondary-btn" onclick="$('#promoForm').classList.add('hidden')">Cancel</button></div>`;$('#promoForm').scrollIntoView({behavior:'smooth',block:'center'})}
async function savePromoAdjust(id){const channels=[];if($('#eppos').checked)channels.push('pos');if($('#epweb').checked)channels.push('website');await api('/api/admin/promotions/'+id,{method:'PATCH',body:JSON.stringify({name:$('#epn').value,type:$('#ept').value,value:$('#epv').value,startAt:$('#eps').value,endAt:$('#epe').value,minSpend:$('#epmin').value,maxDiscount:$('#epmax').value,code:$('#epcode').value,channels,websiteVisible:$('#epweb').checked,notes:$('#epnotes').value})});$('#promoForm').classList.add('hidden');await loadAll();go('promos')}
renderPromos=function(){$('#promoCards').innerHTML=DATA.promotions.map(p=>{const [label,cls]=promoStatus(p),channels=(p.channels||[]).map(x=>x==='pos'?'POS':'Website').join(' • ')||'No channel';return `<div class="card promo-card"><div class="topline"><div><h3>${esc(p.name)}</h3><div class="promo-value">${p.type==='percent'?p.value+'% OFF':money(p.value)+' OFF'}</div></div><span class="badge ${cls}">${label}</span></div><div class="promo-meta"><span><b>Runs</b>${p.startAt?new Date(p.startAt).toLocaleString():'Immediately'} → ${p.endAt?new Date(p.endAt).toLocaleString():'No end date'}</span><span><b>Channels</b>${esc(channels)}</span><span><b>Minimum</b>${money(p.minSpend||0)}</span><span><b>Max discount</b>${Number(p.maxDiscount||0)>0?money(p.maxDiscount):'No cap'}</span></div>${p.notes?`<p class="muted">${esc(p.notes)}</p>`:''}<div class="card-actions"><button class="primary" onclick="adjustPromo('${p.id}')">Adjust</button><button class="secondary-btn" onclick="togglePromo('${p.id}',${!p.active})">${p.active?'Disable':'Enable'}</button><button class="secondary-btn" onclick="patchPromo('${p.id}','websiteVisible',${!p.websiteVisible})">${p.websiteVisible?'Hide website':'Show website'}</button><button class="danger-btn" onclick="delPromo('${p.id}')">Delete</button></div></div>`}).join('')||'<p>No promotions.</p>'};
function calcShiftDue(date,frequency){const d=new Date(date+'T12:00:00'),anchor=DATA.settings.biweeklyAnchorDate?new Date(DATA.settings.biweeklyAnchorDate+'T12:00:00'):new Date('2026-09-11T12:00:00');if(frequency==='Daily'){d.setDate(d.getDate()+1);return d}if(frequency==='Weekly'){d.setDate(d.getDate()+(7-d.getDay()+5)%7);return d}const diff=Math.floor((d-anchor)/86400000),cycle=Math.ceil(diff/14);const due=new Date(anchor);due.setDate(anchor.getDate()+cycle*14);if(due<d)due.setDate(due.getDate()+14);return due}
function shiftIsPaid(sh){return DATA.payroll.some(p=>p.employeeId===sh.employeeId&&p.periodStart&&p.periodEnd&&sh.date>=p.periodStart&&sh.date<=p.periodEnd)}
function renderShiftPlanner(){const board=$('#payrollStatusBoard'),ledger=$('#shiftLedger');if(!board||!ledger)return;const now=new Date(),unpaid=DATA.shifts.filter(s=>!shiftIsPaid(s)),overdue=unpaid.filter(s=>{const e=DATA.employees.find(x=>x.id===s.employeeId);return calcShiftDue(s.date,e?.payFrequency||'Bi-weekly')<now}),gross=unpaid.reduce((a,s)=>a+Number(s.gross||0),0);board.innerHTML=[['Unpaid shifts',unpaid.length,''],['Outstanding wages',money(gross),unpaid.length?'warn':''],['Overdue shifts',overdue.length,overdue.length?'bad':''],['Bi-weekly payday',DATA.settings.biweeklyAnchorDate||'Not set','']].map(x=>`<article class="summary-card ${x[2]}"><small>${x[0]}</small><strong>${x[1]}</strong></article>`).join('')+`<article class="summary-card" style="grid-column:1/-1"><small>Common bi-weekly payday</small><div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap"><input id="biweeklyAnchor" type="date" value="${esc(DATA.settings.biweeklyAnchorDate||'2026-09-11')}"><button class="primary" onclick="saveBiweeklyAnchor()">Set for all bi-weekly staff</button></div></article>`;
  const monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));monday.setHours(0,0,0,0);const sunday=new Date(monday);sunday.setDate(monday.getDate()+6),weekRows=DATA.shifts.filter(s=>{const d=new Date(s.date+'T12:00:00');return d>=monday&&d<=sunday});const empCards=DATA.employees.filter(e=>e.status==='Active').map(e=>{const rows=weekRows.filter(s=>s.employeeId===e.id),hours=rows.reduce((a,s)=>a+Number(s.hours||0),0),wgross=rows.reduce((a,s)=>a+Number(s.gross||0),0),wunpaid=rows.filter(s=>!shiftIsPaid(s)).reduce((a,s)=>a+Number(s.gross||0),0);return `<article class="summary-card"><small>${esc(e.name)} · this week</small><strong>${hours.toFixed(2)} h · ${money(wgross)}</strong><span class="muted">Unpaid: ${money(wunpaid)}</span></article>`}).join('');
  ledger.innerHTML=(empCards?`<div class="summary-grid" style="margin-top:14px">${empCards}</div><h3 style="margin:18px 0 10px">Shift ledger</h3>`:'')+DATA.shifts.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{const e=DATA.employees.find(x=>x.id===s.employeeId),paid=shiftIsPaid(s),due=calcShiftDue(s.date,e?.payFrequency||'Bi-weekly'),daysLate=Math.max(0,Math.floor((now-due)/86400000)),state=paid?['PAID','paid']:due<now?[`OWED ${daysLate} DAY${daysLate===1?'':'S'}`,'overdue']:[`DUE ${due.toLocaleDateString()}`,'due'];return `<div class="shift-row"><b>${esc(s.date)}</b><span><b>${esc(s.employeeName)}</b><br><small>${esc(s.shiftType)} · ${esc(s.startTime)}–${esc(s.endTime)}</small></span><span>${Number(s.hours).toFixed(2)} h</span><span>${money(s.gross)}</span><span class="pay-status ${state[1]}">${state[0]}</span><button class="danger-btn" onclick="deleteShift('${s.id}')">Delete</button></div>`}).join('')||'<p class="muted">No shifts recorded yet.</p>'}
async function saveBiweeklyAnchor(){await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify({biweeklyAnchorDate:$('#biweeklyAnchor').value})});await loadAll();go('payroll')}
function showShiftForm(){const el=$('#shiftForm');el.classList.remove('hidden');el.innerHTML=`<div class="promo-edit-grid"><label>Employee<select id="shEmp">${DATA.employees.filter(e=>e.status==='Active').map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label><label>Date<input id="shDate" type="date"></label><label>Shift<select id="shType" onchange="setShiftPreset()"><option>Morning</option><option>Evening</option><option>Custom</option></select></label><label>Start<input id="shStart" type="time" value="10:00"></label><label>End<input id="shEnd" type="time" value="15:00"></label><label>Unpaid break minutes<input id="shBreak" type="number" value="0"></label><label class="wide">Notes<input id="shNotes" placeholder="Optional"></label><button class="primary" onclick="addShift()">Save Shift</button></div>`}
function setShiftPreset(){const t=$('#shType').value;if(t==='Morning'){$('#shStart').value='10:00';$('#shEnd').value='15:00'}if(t==='Evening'){$('#shStart').value='15:00';$('#shEnd').value='20:00'}}
async function addShift(){if(!$('#shDate').value)return alert('Choose a shift date.');await api('/api/admin/shifts',{method:'POST',body:JSON.stringify({employeeId:$('#shEmp').value,date:$('#shDate').value,shiftType:$('#shType').value,startTime:$('#shStart').value,endTime:$('#shEnd').value,breakMinutes:$('#shBreak').value,notes:$('#shNotes').value})});$('#shiftForm').classList.add('hidden');await loadAll();go('payroll')}
async function deleteShift(id){if(confirm('Delete this shift?')){await api('/api/admin/shifts/'+id,{method:'DELETE'});await loadAll();go('payroll')}}
function estimateCppEi(){const gross=(Number($('#payRate')?.value)||0)*(Number($('#payRegularHours')?.value)||0)+(Number($('#payRate')?.value)||0)*(Number($('#payOvertimeHours')?.value)||0)*(Number($('#payOtMultiplier')?.value)||1.5),freq=$('#payFrequency')?.value||'Bi-weekly',periods=freq==='Weekly'?52:freq==='Daily'?260:26,periodExemption=3500/periods,cpp=Math.max(0,(gross-periodExemption)*.0595),ei=gross*.0163;$('#payCpp').value=cpp.toFixed(2);$('#payEi').value=ei.toFixed(2);calcPayrollPreview();alert('CPP/EI are rough 2026 estimates only. Use CRA PDOC/payroll software for the actual payroll deductions and income tax.')}
const oldRenderPayroll=renderPayroll;renderPayroll=function(){oldRenderPayroll();const warning=$('.payroll-warning');if(warning)warning.innerHTML=`<b>Payroll deduction helper:</b> CPP/EI can be roughly estimated for planning; income tax depends on employee TD1/tax circumstances. Verify final payroll using CRA PDOC or payroll software.<div class="deduction-helper"><button class="primary" onclick="estimateCppEi()">Estimate 2026 CPP + EI</button> <span>CPP 5.95% after allocated basic exemption; EI 1.63% of insurable pay, subject to annual limits.</span></div>`;renderShiftPlanner()};

function ingredientRows(items=[]){return (items.length?items:[{qty:'',unit:'',item:'',note:''}]).map((x,i)=>`<div class="ingredient-row" data-ing-row><input class="ri-qty" value="${esc(x.qty||'')}" placeholder="Qty"><input class="ri-unit" value="${esc(x.unit||'')}" placeholder="Unit"><input class="ri-item" value="${esc(x.item||'')}" placeholder="Ingredient"><input class="ri-note" value="${esc(x.note||'')}" placeholder="Note"><button type="button" class="danger-btn compact" onclick="this.closest('[data-ing-row]').remove()">×</button></div>`).join('')}
function addIngredientRow(){const box=$('#recipeIngredients');if(box)box.insertAdjacentHTML('beforeend',ingredientRows([]))}
function collectIngredients(){return [...document.querySelectorAll('#recipeIngredients [data-ing-row]')].map(r=>({qty:r.querySelector('.ri-qty').value.trim(),unit:r.querySelector('.ri-unit').value.trim(),item:r.querySelector('.ri-item').value.trim(),note:r.querySelector('.ri-note').value.trim()})).filter(x=>x.item)}
function recipeFields(r={}){return `<div class="recipe-form-grid"><label>Recipe name<input id="rName" value="${esc(r.name||'')}"></label><label>Category<input id="rCategory" value="${esc(r.category||'')}" placeholder="Phở, Bánh Mì, Prep / Sides..."></label><label>Related menu item<input id="rMenuItem" value="${esc(r.menuItemName||'')}" list="recipeMenuList" placeholder="Optional"></label><datalist id="recipeMenuList">${DATA.menu.map(m=>`<option value="${esc(m.name)}"></option>`).join('')}</datalist><label>Batch / Yield<input id="rYield" value="${esc(r.yield||'')}" placeholder="e.g. 1 batch, 20 portions"></label><label class="wide recipe-active"><input id="rActive" type="checkbox" ${r.active===false?'':'checked'}> Active kitchen recipe</label><div class="wide"><div class="recipe-subhead"><b>Ingredients</b><button type="button" class="secondary-btn" onclick="addIngredientRow()">＋ Ingredient</button></div><div id="recipeIngredients" class="ingredient-editor">${ingredientRows(r.ingredients||[])}</div></div><label class="wide">Preparation / Method<textarea id="rInstructions" rows="9" placeholder="Enter step-by-step preparation instructions...">${esc(r.instructions||'')}</textarea></label><label class="wide">Manager notes / food-safety notes<textarea id="rNotes" rows="4" placeholder="Batch notes, storage, prep reminders...">${esc(r.notes||'')}</textarea></label><label class="wide">Reference image path<input id="rImage" value="${esc(r.referenceImage||'')}" placeholder="/assets/... (optional)"></label></div>`}
function showRecipeForm(){const el=$('#recipeForm');el.classList.remove('hidden');el.innerHTML=`<h3>New Recipe</h3>${recipeFields({})}<div class="card-actions"><button class="primary" onclick="saveRecipe()">Save Recipe</button><button class="secondary-btn" onclick="elHideRecipeForm()">Cancel</button></div>`;el.scrollIntoView({behavior:'smooth',block:'start'})}
function elHideRecipeForm(){$('#recipeForm').classList.add('hidden');$('#recipeForm').innerHTML=''}
async function saveRecipe(id=''){const payload={name:$('#rName').value.trim(),category:$('#rCategory').value.trim(),menuItemName:$('#rMenuItem').value.trim(),yield:$('#rYield').value.trim(),active:$('#rActive').checked,ingredients:collectIngredients(),instructions:$('#rInstructions').value.trim(),notes:$('#rNotes').value.trim(),referenceImage:$('#rImage').value.trim()};if(!payload.name)return alert('Enter a recipe name.');await api('/api/admin/recipes'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify(payload)});elHideRecipeForm();await loadAll();go('recipes')}
function editRecipe(id){const r=DATA.recipes.find(x=>x.id===id);if(!r)return;const el=$('#recipeForm');el.classList.remove('hidden');el.innerHTML=`<h3>Adjust Recipe</h3>${recipeFields(r)}<div class="card-actions"><button class="primary" onclick="saveRecipe('${id}')">Save Changes</button><button class="secondary-btn" onclick="elHideRecipeForm()">Cancel</button></div>`;el.scrollIntoView({behavior:'smooth',block:'start'})}
async function deleteRecipe(id){if(!confirm('Delete this recipe?'))return;await api('/api/admin/recipes/'+id,{method:'DELETE'});await loadAll();go('recipes')}
async function toggleRecipe(id,active){await api('/api/admin/recipes/'+id,{method:'PATCH',body:JSON.stringify({active})});await loadAll();go('recipes')}
function renderRecipes(){const box=$('#recipeCards');if(!box)return;box.innerHTML=DATA.recipes.map(r=>`<article class="recipe-card"><div class="recipe-card-head"><div><span class="eyebrow">${esc(r.category||'Kitchen Recipe')}</span><h3>${esc(r.name)}</h3>${r.menuItemName?`<p class="muted">Menu link: ${esc(r.menuItemName)}</p>`:''}</div><span class="badge ${r.active===false?'bad':'good'}">${r.active===false?'INACTIVE':'ACTIVE'}</span></div><div class="recipe-meta"><span><b>Yield</b>${esc(r.yield||'Not specified')}</span><span><b>Ingredients</b>${(r.ingredients||[]).length}</span></div>${r.referenceImage?`<img class="recipe-reference" src="${esc(r.referenceImage)}" alt="${esc(r.name)} recipe reference">`:''}<div class="recipe-columns"><div><h4>Ingredients</h4><ul class="ingredient-list">${(r.ingredients||[]).map(x=>`<li><b>${esc([x.qty,x.unit].filter(Boolean).join(' '))}</b> ${esc(x.item)}${x.note?` <small>— ${esc(x.note)}</small>`:''}</li>`).join('')||'<li>No ingredients entered.</li>'}</ul></div><div><h4>Preparation</h4><div class="recipe-method">${esc(r.instructions||'No method entered.').replace(/\n/g,'<br>')}</div>${r.notes?`<div class="recipe-note"><b>Notes</b><br>${esc(r.notes).replace(/\n/g,'<br>')}</div>`:''}</div></div><div class="card-actions"><button class="primary" onclick="editRecipe('${r.id}')">Adjust Recipe</button><button class="secondary-btn" onclick="toggleRecipe('${r.id}',${r.active===false?'true':'false'})">${r.active===false?'Activate':'Set inactive'}</button><button class="danger-btn" onclick="deleteRecipe('${r.id}')">Delete</button></div></article>`).join('')||'<div class="empty-state"><h3>No recipes yet</h3><p>Add your first kitchen recipe.</p></div>'}

const _renderAll=renderAll;renderAll=function(){_renderAll();renderShiftPlanner()};

// V11 production stability layer: one snapshot request instead of 10 parallel
// Vercel function calls. Includes automatic retry for transient DB congestion.
requestJson=async function(path,opt={},timeoutMs=15000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(path,{...opt,cache:'no-store',signal:c.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){const e=Error(d.error||('Request failed ('+r.status+')'));e.status=r.status;e.retryable=!!d.retryable;throw e}
    return d;
  }finally{clearTimeout(t)}
};
loadAll=async function(){
  const status=document.getElementById('appStatus');
  if(status)status.textContent='Syncing live data…';
  let lastErr;
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const d=await api('/api/admin/snapshot?view=manager');
      DATA={
        menu:d.menu||[],promotions:d.promotions||[],inventory:d.inventory||[],recipes:d.recipes||[],
        employees:d.employees||[],payroll:d.payroll||[],shifts:d.shifts||[],sales:d.sales||[],orders:d.orders||[],revenueLedger:d.revenueLedger||[],
        analytics:d.analytics||{},settings:d.settings||{},storeStatus:d.status||{}
      };
      renderAll();
      if(status)status.textContent='';
      const lm=document.getElementById('loginMsg');if(lm)lm.textContent='';
      return;
    }catch(e){
      lastErr=e;console.error('Manager snapshot attempt',attempt,e);
      if(e.status===401){
        sessionStorage.removeItem('vietNomNomManagerPin');PIN='';
        $('#app').classList.add('hidden');$('#login').classList.remove('hidden');
        $('#loginMsg').textContent='Session expired or PIN is incorrect.';return;
      }
      if(attempt<2&&(e.retryable||e.name==='AbortError'||e.status===503))await new Promise(r=>setTimeout(r,900));
    }
  }
  const msg=lastErr?.name==='AbortError'?'Database response timed out. Press Refresh to try again.':(lastErr?.message||'Could not sync live data.');
  if(status)status.textContent='Connection issue: '+msg+' Existing screen data was kept.';
};

// V11.3 inventory intelligence + recipe pack
const INVENTORY_TEMPLATE_V113=[
{name:'French Bread / Baguette',unit:'pcs',qty:0,reorder:12,targetQty:40,usageNote:'Bánh mì',supplier:''},
{name:'Pâté',unit:'tub',qty:0,reorder:1,targetQty:4,usageNote:'Bánh mì',supplier:''},
{name:'Cilantro',unit:'bunch',qty:0,reorder:4,targetQty:12,usageNote:'Bánh mì / phở / vermicelli',supplier:''},
{name:'Pickled Carrots',unit:'container',qty:0,reorder:2,targetQty:8,usageNote:'Bánh mì / vermicelli / rice',supplier:''},
{name:'Cucumber',unit:'kg',qty:0,reorder:3,targetQty:10,usageNote:'Bánh mì / vermicelli / rice',supplier:''},
{name:'Green Onion',unit:'bunch',qty:0,reorder:3,targetQty:10,usageNote:'Phở / rice',supplier:''},
{name:'White Onion',unit:'kg',qty:0,reorder:2,targetQty:8,usageNote:'Phở / rice',supplier:''},
{name:'Bean Sprouts',unit:'kg',qty:0,reorder:2,targetQty:8,usageNote:'Phở / summer rolls',supplier:''},
{name:'Thai Basil',unit:'bunch',qty:0,reorder:3,targetQty:10,usageNote:'Phở garnish',supplier:''},
{name:'Mint',unit:'bunch',qty:0,reorder:2,targetQty:8,usageNote:'Summer rolls',supplier:''},
{name:'Lemon / Lime',unit:'kg',qty:0,reorder:2,targetQty:6,usageNote:'Phở garnish',supplier:''},
{name:'Chicken',unit:'kg',qty:0,reorder:4,targetQty:15,usageNote:'Bánh mì / rice / vermicelli / phở',supplier:''},
{name:'Pork',unit:'kg',qty:0,reorder:4,targetQty:15,usageNote:'Bánh mì / rice / vermicelli',supplier:''},
{name:'Beef',unit:'kg',qty:0,reorder:4,targetQty:15,usageNote:'Bánh mì / rice',supplier:''},
{name:'Rare Beef',unit:'kg',qty:0,reorder:3,targetQty:10,usageNote:'Phở',supplier:''},
{name:'Well-done Brisket',unit:'kg',qty:0,reorder:3,targetQty:10,usageNote:'Phở',supplier:''},
{name:'Beef Balls',unit:'bag',qty:0,reorder:2,targetQty:8,usageNote:'Phở',supplier:''},
{name:'Pork Sausage',unit:'kg',qty:0,reorder:2,targetQty:8,usageNote:'Bánh mì / summer rolls / vermicelli',supplier:''},
{name:'Shrimp',unit:'kg',qty:0,reorder:3,targetQty:10,usageNote:'Rice / summer rolls',supplier:''},
{name:'Tofu',unit:'pack',qty:0,reorder:3,targetQty:12,usageNote:'Vegetarian Vietnamese items',supplier:''},
{name:'Pork Chop',unit:'pcs',qty:0,reorder:6,targetQty:20,usageNote:'Rice plates',supplier:''},
{name:'Rice Noodles',unit:'pack',qty:0,reorder:5,targetQty:20,usageNote:'Vermicelli',supplier:''},
{name:'Phở Noodles',unit:'pack',qty:0,reorder:5,targetQty:20,usageNote:'Phở',supplier:''},
{name:'Rice Paper',unit:'pack',qty:0,reorder:3,targetQty:12,usageNote:'Summer rolls',supplier:''},
{name:'White Rice',unit:'bag',qty:0,reorder:2,targetQty:8,usageNote:'Rice plates / combo',supplier:''},
{name:'Fish Sauce',unit:'bottle',qty:0,reorder:1,targetQty:4,usageNote:'Vietnamese sauce',supplier:''},
{name:'Hoisin Sauce',unit:'bottle',qty:0,reorder:1,targetQty:4,usageNote:'Phở / dipping',supplier:''},
{name:'Sriracha',unit:'bottle',qty:0,reorder:1,targetQty:4,usageNote:'Phở / dipping',supplier:''},
{name:'Peanut Sauce',unit:'container',qty:0,reorder:1,targetQty:4,usageNote:'Summer rolls',supplier:''},
{name:'Takeout Rice Containers',unit:'bag',qty:0,reorder:2,targetQty:8,usageNote:'Packaging & Takeout',supplier:''},
{name:'Phở Containers',unit:'case',qty:0,reorder:1,targetQty:4,usageNote:'Packaging & Takeout',supplier:''},
{name:'Bánh Mì Paper',unit:'pack',qty:0,reorder:2,targetQty:8,usageNote:'Packaging & Takeout',supplier:''}
];
const RECIPE_LIBRARY_V113=[];

function normInvName(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function inventoryMissingTemplates(){const have=new Set((DATA.inventory||[]).map(x=>normInvName(x.name)));return INVENTORY_TEMPLATE_V113.filter(x=>!have.has(normInvName(x.name)))}
function inventoryRestockItems(){return (DATA.inventory||[]).filter(x=>invStatus(x)==='NEEDS STOCKING')}
async function importMissingInventoryTemplates(){const missing=inventoryMissingTemplates();if(!missing.length){alert('Master inventory checklist is already complete.');return}if(!confirm(`Import ${missing.length} missing master checklist item(s) into Inventory?`))return;for(const item of missing){await api('/api/admin/inventory',{method:'POST',body:JSON.stringify(item)})}await loadAll();go('inventory');alert(`Imported ${missing.length} checklist item(s). Manager can now track them directly.`)}
async function importRecipePack(){alert('No preset recipe pack is included. Add Viet Nom Nom recipes manually so only this restaurant’s Vietnamese recipes are stored.')}
function ensureInventoryInsights(){const host=document.querySelector('#inventory .panel');if(host&&!$('#inventoryInsights')){$('#inventoryForm').insertAdjacentHTML('afterend','<div id="inventoryInsights" class="inventory-insights"></div>')}}
function inventoryMetricCard(label,value){return `<div class="inventory-metric"><span>${esc(label)}</span><strong>${esc(String(value))}</strong></div>`}
renderInventory=function(){ensureInventoryInsights();const low=inventoryRestockItems(),missing=inventoryMissingTemplates(),okCount=(DATA.inventory||[]).filter(x=>invStatus(x)==='STOCKED').length;const insights=$('#inventoryInsights');if(insights)insights.innerHTML=`<div class="inventory-metrics">${inventoryMetricCard('Tracked items',(DATA.inventory||[]).length)}${inventoryMetricCard('Need stocking',low.length)}${inventoryMetricCard('Checklist missing',missing.length)}${inventoryMetricCard('Stocked / healthy',okCount)}</div><div class="inventory-panels"><div class="inventory-panel-card"><h3>Reverse checklist for manager</h3><p>This is the master list view: instead of waiting to notice something is missing, the manager can instantly see which expected items are still missing from the system.</p><div class="inventory-list-badges">${missing.length?missing.slice(0,18).map(x=>`<span>＋ ${esc(x.name)}</span>`).join(''):`<span>✔ All expected checklist items are already loaded</span>`}</div><div class="inventory-actions"><button class="primary" onclick="importMissingInventoryTemplates()">Import Missing Checklist Items</button><button class="secondary" onclick="sendReorderList()">Send Restock SMS to 382-342-2566</button></div></div><div class="inventory-panel-card"><h3>Restock now</h3><p>Items below reorder level or marked as <b>Needs Stocking</b> appear here automatically.</p><div class="inventory-list-badges">${low.length?low.slice(0,18).map(x=>`<span>⚠ ${esc(x.name)} · on hand ${Number(x.qty||0)} / reorder ${Number(x.reorder||0)}</span>`).join(''):`<span>✔ Nothing urgent right now</span>`}</div><div class="inventory-actions"><button class="secondary" onclick="loadAll()">Refresh inventory</button></div></div></div>`;$('#inventoryTable').innerHTML=(DATA.inventory||[]).sort((a,b)=>{const sa=invStatus(a),sb=invStatus(b);if(sa===sb)return (a.name||'').localeCompare(b.name||'');return sa==='NEEDS STOCKING'?-1:1}).map(x=>{const s=invStatus(x),cls=s==='NEEDS STOCKING'?'inventory-row-low':'';const tone=s==='STOCKED'?'ok':s==='NEEDS STOCKING'?'danger':'warn';return `<tr class="${cls}"><td><b>${esc(x.name)}</b><div class="muted">${esc(x.usageNote||'')}</div></td><td>${Number(x.qty||0)} ${esc(x.unit||'')}</td><td>${Number(x.reorder||0)} ${esc(x.unit||'')}</td><td>${Number(x.targetQty||0)||'—'}</td><td>${esc(x.usageNote||'—')}</td><td>${money(x.cost||0)}</td><td>${esc(x.supplier||'—')}</td><td><span class="inline-status ${tone}">${esc(s)}</span><div style="margin-top:8px"><select onchange="patchInv('${x.id}','statusOverride',this.value)"><option value="auto" ${x.statusOverride==='auto'?'selected':''}>Auto</option><option value="stocked" ${x.statusOverride==='stocked'?'selected':''}>Already stocked</option><option value="need" ${x.statusOverride==='need'?'selected':''}>Needs stocking</option></select></div></td><td><div class="inventory-actions"><button onclick="showInventoryForm('${x.id}')">Edit</button><button onclick="delInv('${x.id}')">Delete</button></div></td></tr>`}).join('')||'<tr><td colspan="9" class="muted">No inventory items yet.</td></tr>'};
const _sendReorderListV113=sendReorderList;sendReorderList=async function(){const list=inventoryRestockItems();if(!list.length){alert('No items currently need stocking.');return}if(!confirm(`Send ${list.length} item(s) that need stocking to the owner at 382-342-2566?`))return;await _sendReorderListV113()};
function ensureRecipeToolbarBoost(){const toolbar=document.querySelector('#recipes .toolbar');if(toolbar&&!$('#recipeSearchBoost')){const wrap=document.createElement('div');wrap.className='recipe-toolbar-boost';wrap.innerHTML='<input id="recipeSearchBoost" placeholder="Search Vietnamese recipe, menu item or ingredient...">';toolbar.appendChild(wrap);$('#recipeSearchBoost').addEventListener('input',renderRecipes)}}
renderRecipes=function(){ensureRecipeToolbarBoost();const q=($('#recipeSearchBoost')?.value||'').toLowerCase().trim();const list=(DATA.recipes||[]).filter(r=>!q||[r.name,r.category,r.menuItemName,r.instructions,r.notes,(r.ingredients||[]).map(x=>x.item).join(' ')].join(' ').toLowerCase().includes(q)).sort((a,b)=>(a.category||'').localeCompare(b.category||'')||(a.name||'').localeCompare(b.name||''));$('#recipeCards').innerHTML=list.map(r=>`<article class="recipe-card"><div class="recipe-top"><div><span class="recipe-tag">${esc(r.category||'Recipe')}</span><h3>${esc(r.name)}</h3><div class="muted">${esc(r.menuItemName||'')}${r.yield?` · Yield: ${esc(r.yield)}`:''}</div></div><div class="inventory-actions"><button onclick="showRecipeForm('${r.id}')">Edit</button><button onclick="delRecipe('${r.id}')">Delete</button></div></div><ul>${(r.ingredients||[]).map(i=>`<li>${esc([i.qty,i.unit,i.item].filter(Boolean).join(' '))}${i.note?` — ${esc(i.note)}`:''}</li>`).join('')}</ul><p style="white-space:pre-wrap">${esc(r.instructions||'')}</p>${r.notes?`<div class="muted">${esc(r.notes)}</div>`:''}</article>`).join('')||'<div class="muted">No recipes yet.</div>';const toolbar=document.querySelector('#recipes .toolbar > div');if(toolbar){let countEl=$('#recipeCountBanner');if(!countEl){countEl=document.createElement('div');countEl.id='recipeCountBanner';countEl.className='recipe-count-banner';toolbar.appendChild(countEl)}countEl.textContent=`${list.length} Viet Nom Nom recipe(s) shown • Add recipes manually as needed.`}};

// V11.4 — section-based physical stock check
// Goal: inventory should feel like walking the restaurant section-by-section,
// not like maintaining a database table.
const INVENTORY_SECTION_ORDER_V114=[
  'Bread & Bakery',
  'Vietnamese Proteins',
  'Fresh Produce & Herbs',
  'Noodles, Rice & Dry Goods',
  'Sauces & Condiments',
  'Packaging & Takeout',
  'Other / Unassigned'
];
const INVENTORY_SECTION_NAMES_V114={
  'Bread & Bakery':['french bread baguette'],
  'Vietnamese Proteins':['chicken','pork','beef','rare beef','well done brisket','beef balls','pork sausage','shrimp','tofu','pork chop'],
  'Fresh Produce & Herbs':['cilantro','pickled carrots','cucumber','green onion','white onion','bean sprouts','thai basil','mint','lemon lime'],
  'Noodles, Rice & Dry Goods':['rice noodles','pho noodles','rice paper','white rice'],
  'Sauces & Condiments':['pate','fish sauce','hoisin sauce','sriracha','peanut sauce'],
  'Packaging & Takeout':['takeout rice containers','pho containers','banh mi paper']
};
function invSectionKey(s){return normInvName(s).replace(/\bph[oở]\b/g,'pho')}
function inventorySection(x){
  const n=invSectionKey(x?.name||'');
  for(const [section,names] of Object.entries(INVENTORY_SECTION_NAMES_V114)){
    if(names.includes(n)) return section;
  }
  const note=String(x?.usageNote||'').toLowerCase();
  if(/beverage|coffee|drink/.test(note)) return 'Beverages';
  if(/packag|takeout|container|paper bag/.test(note)) return 'Packaging & Takeout';
  if(/sauce|dipping|dressing|condiment/.test(note)) return 'Sauces & Condiments';
  if(/noodle|rice|dry/.test(note)) return 'Noodles, Rice & Dry Goods';
  
  return 'Other / Unassigned';
}
function inventoryOrderQty(x){return Math.max(0,(Number(x.targetQty)||0)-(Number(x.qty)||0))}
function stockSectionGroups(){
  const groups={}; INVENTORY_SECTION_ORDER_V114.forEach(s=>groups[s]=[]);
  (DATA.inventory||[]).forEach(x=>{const section=inventorySection(x);(groups[section]||(groups[section]=[])).push(x)});
  return groups;
}
function renderStockItemV114(x){
  const st=invStatus(x),needs=st==='NEEDS STOCKING',buy=inventoryOrderQty(x);
  return `<div class="stock-item ${needs?'needs-stock':''}">
    <div class="stock-item-name"><b>${esc(x.name)}</b><small>${esc(x.usageNote||'')}</small></div>
    <label><span>On hand</span><div class="inventory-number"><input type="number" step=".01" value="${Number(x.qty||0)}" onchange="patchInv('${x.id}','qty',this.value)"><em>${esc(x.unit||'unit')}</em></div></label>
    <label><span>Reorder at</span><input type="number" step=".01" value="${Number(x.reorder||0)}" onchange="patchInv('${x.id}','reorder',this.value)"></label>
    <label><span>Target</span><input type="number" step=".01" value="${Number(x.targetQty||0)}" onchange="patchInv('${x.id}','targetQty',this.value)"></label>
    <label><span>Status</span><select onchange="patchInv('${x.id}','statusOverride',this.value)">
      <option value="auto" ${!x.statusOverride||x.statusOverride==='auto'?'selected':''}>Auto · ${st}</option>
      <option value="ok" ${x.statusOverride==='ok'?'selected':''}>✓ Stocked</option>
      <option value="reorder" ${x.statusOverride==='reorder'?'selected':''}>⚠ Need to order</option>
    </select></label>
    <div class="stock-buy"><span>${needs?'BUY / PREPARE':'OK'}</span><b>${needs?(buy?`${buy} ${esc(x.unit||'unit')}`:'Check quantity'):'No order'}</b></div>
    <button class="stock-delete" title="Delete item" onclick="delInv('${x.id}')">×</button>
  </div>`;
}
function inventoryMetricCard114(label,value,sub=''){return `<div class="inventory-metric"><span>${esc(label)}</span><strong>${esc(String(value))}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function renderInventory(){
  const all=DATA.inventory||[], low=inventoryRestockItems(), groups=stockSectionGroups(), ok=all.length-low.length;
  const insights=$('#inventoryInsights');
  if(insights){
    const preview=INVENTORY_SECTION_ORDER_V114.map(section=>{
      const items=(groups[section]||[]).filter(x=>invStatus(x)==='NEEDS STOCKING');
      if(!items.length)return '';
      return `<div class="order-preview-group"><b>${esc(section)}</b>${items.map(x=>`<span>• ${esc(x.name)}${inventoryOrderQty(x)?` — buy ${inventoryOrderQty(x)} ${esc(x.unit||'unit')}`:''}</span>`).join('')}</div>`
    }).join('');
    insights.innerHTML=`<div class="inventory-metrics">
      ${inventoryMetricCard114('Tracked',all.length,'items in the system')}
      ${inventoryMetricCard114('Need to order',low.length,'today')}
      ${inventoryMetricCard114('Stocked',ok,'no action')}
      ${inventoryMetricCard114('Sections',INVENTORY_SECTION_ORDER_V114.filter(s=>(groups[s]||[]).length).length,'physical check zones')}
    </div>
    <div class="inventory-guide-card"><div><b>Daily workflow</b><span>1. Open a section → 2. Count “On hand” → 3. Leave Status on Auto. If On hand ≤ Reorder at, the item enters Today's Order List automatically. Use “Need to order” only when you want to force an item onto the list.</span></div><button onclick="sendReorderList()">Send order list</button></div>
    <div class="today-order-preview"><div class="today-order-head"><div><b>Today's Order List</b><span>${low.length?`${low.length} item(s), grouped by section`:'Nothing needs ordering right now'}</span></div></div>${preview||'<div class="stock-empty">✓ All checked items are above their reorder level.</div>'}</div>`;
  }
  const host=$('#inventorySections'); if(!host)return;
  host.innerHTML=INVENTORY_SECTION_ORDER_V114.map(section=>{
    const items=(groups[section]||[]).sort((a,b)=>{const na=invStatus(a)==='NEEDS STOCKING',nb=invStatus(b)==='NEEDS STOCKING';return na===nb?String(a.name).localeCompare(String(b.name)):na?-1:1});
    if(!items.length)return '';
    const need=items.filter(x=>invStatus(x)==='NEEDS STOCKING').length;
    return `<details class="stock-section" ${need?'open':''}>
      <summary><span><b>${esc(section)}</b><small>${items.length} item(s)</small></span><span class="section-count ${need?'warn':'good'}">${need?`${need} need order`:'All good'}</span></summary>
      <div class="stock-section-head"><span>Item</span><span>On hand</span><span>Reorder</span><span>Target</span><span>Status</span><span>Suggested order</span><span></span></div>
      <div class="stock-section-body">${items.map(renderStockItemV114).join('')}</div>
    </details>`;
  }).join('')||'<div class="stock-empty">No inventory items yet. Use “Add Stock Item” or import the master checklist.</div>';
}

// V11.4 restores a real editable Add Stock Item form. Section is auto-assigned
// from item name / usage note, so this upgrade does not require a database migration.
showInventoryForm=function(){
  const el=$('#inventoryForm'); el.classList.remove('hidden');
  el.innerHTML=`<div class="inventory-add-grid">
    <label>Item name<input id="in" placeholder="e.g. Sprite"></label>
    <label>Unit<input id="iu" placeholder="can, bottle, kg, pack..."></label>
    <label>On hand<input id="iq" type="number" step=".01" value="0"></label>
    <label>Reorder at<input id="ir" type="number" step=".01" value="0"></label>
    <label>Target stock<input id="itarget" type="number" step=".01" value="0"></label>
    <label>Usage / section hint<input id="inote" placeholder="e.g. Beverage, Packaging, Phở"></label>
    <label>Supplier<input id="isupplier" placeholder="Supplier"></label>
    <label>Cost<input id="icost" type="number" step=".01" value="0"></label>
    <div class="wide inventory-actions"><button class="primary" onclick="addInventoryV114()">Save Stock Item</button><button class="secondary-btn" onclick="$('#inventoryForm').classList.add('hidden')">Cancel</button></div>
  </div>`;
};
async function addInventoryV114(){
  const payload={name:$('#in').value.trim(),unit:$('#iu').value.trim(),qty:$('#iq').value,reorder:$('#ir').value,targetQty:$('#itarget').value,usageNote:$('#inote').value.trim(),supplier:$('#isupplier').value.trim(),cost:$('#icost').value};
  if(!payload.name)return alert('Enter an inventory item name.');
  await api('/api/admin/inventory',{method:'POST',body:JSON.stringify(payload)});$('#inventoryForm').classList.add('hidden');await loadAll();go('inventory');
}

// Fix V11.3 Recipe Book action regression.
renderRecipes=function(){
  ensureRecipeToolbarBoost();const q=($('#recipeSearchBoost')?.value||'').toLowerCase().trim();const list=(DATA.recipes||[]).filter(r=>!q||[r.name,r.category,r.menuItemName,r.instructions,r.notes,(r.ingredients||[]).map(x=>x.item).join(' ')].join(' ').toLowerCase().includes(q)).sort((a,b)=>(a.category||'').localeCompare(b.category||'')||(a.name||'').localeCompare(b.name||''));
  $('#recipeCards').innerHTML=list.map(r=>`<article class="recipe-card"><div class="recipe-top"><div><span class="recipe-tag">${esc(r.category||'Recipe')}</span><h3>${esc(r.name)}</h3><div class="muted">${esc(r.menuItemName||'')}${r.yield?` · Yield: ${esc(r.yield)}`:''}</div></div><div class="inventory-actions"><button onclick="editRecipe('${r.id}')">Edit</button><button onclick="deleteRecipe('${r.id}')">Delete</button></div></div><ul>${(r.ingredients||[]).map(i=>`<li>${esc([i.qty,i.unit,i.item].filter(Boolean).join(' '))}${i.note?` — ${esc(i.note)}`:''}</li>`).join('')}</ul><p style="white-space:pre-wrap">${esc(r.instructions||'')}</p>${r.notes?`<div class="muted">${esc(r.notes)}</div>`:''}</article>`).join('')||'<div class="muted">No recipes yet.</div>';
  const toolbar=document.querySelector('#recipes .toolbar > div');if(toolbar){let countEl=$('#recipeCountBanner');if(!countEl){countEl=document.createElement('div');countEl.id='recipeCountBanner';countEl.className='recipe-count-banner';toolbar.appendChild(countEl)}countEl.textContent=`${list.length} Viet Nom Nom recipe(s) shown • Add Vietnamese recipes manually as needed.`}
};

// V11.5 — inventory is a physical stock-check workflow, not a database table.
// Sections are stored backward-compatibly inside usageNote so no DB migration is required.
const INVENTORY_SECTION_ORDER_V115=[
  'Bread & Bakery','Vietnamese Proteins','Fresh Produce & Herbs','Noodles, Rice & Dry Goods',
  'Sauces & Condiments','Packaging & Takeout','Kitchen Consumables','Cleaning & Sanitation',
  'Paper & Washroom','Gloves & Food Safety','Waste & Trash','Office & Front Counter','Other / Unassigned'
];
function explicitInventorySectionV115(note){
  const m=String(note||'').match(/^\[SECTION:([^\]]+)\]/i);
  if(!m)return '';
  const found=INVENTORY_SECTION_ORDER_V115.find(s=>s.toLowerCase()===m[1].trim().toLowerCase());
  return found||'';
}
function cleanInventoryNoteV115(note){
  return String(note||'').replace(/^\[SECTION:[^\]]+\]\s*(?:\|\s*)?/i,'').trim();
}
function encodeInventoryNoteV115(section,note){
  const safe=INVENTORY_SECTION_ORDER_V115.includes(section)?section:'Other / Unassigned';
  const clean=cleanInventoryNoteV115(note);
  return `[SECTION:${safe}]${clean?` | ${clean}`:''}`;
}
const inventorySectionV114Fallback=inventorySection;
inventorySection=function(x){return explicitInventorySectionV115(x?.usageNote)||inventorySectionV114Fallback(x)};
function inventorySectionOptionsV115(selected){return INVENTORY_SECTION_ORDER_V115.map(s=>`<option value="${esc(s)}" ${s===selected?'selected':''}>${esc(s)}</option>`).join('')}
function inventoryCheckedTodayV115(x){
  if(!x.lastStockedAt)return false;
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:DATA.settings?.timezone||'America/Toronto'}).format(new Date(x.lastStockedAt))===new Intl.DateTimeFormat('en-CA',{timeZone:DATA.settings?.timezone||'America/Toronto'}).format(new Date())}catch{return false}
}
function inventoryCheckedLabelV115(x){
  if(!x.lastStockedAt)return 'Not checked yet';
  try{return `Checked ${new Date(x.lastStockedAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`}catch{return 'Checked'}
}
async function patchInvSectionV115(id,section){
  const x=(DATA.inventory||[]).find(i=>i.id===id);if(!x)return;
  return patchInv(id,'usageNote',encodeInventoryNoteV115(section,cleanInventoryNoteV115(x.usageNote)));
}
patchInv=async function(id,k,v){
  const body={};
  body[k]=['qty','reorder','targetQty','cost'].includes(k)?(Number(v)||0):v;
  const current=(DATA.inventory||[]).find(x=>x.id===id);
  if(k==='qty'){
    body.lastStockedAt=new Date().toISOString();
    if(current?.statusOverride==='ok' && cleanInventoryNoteV115(current?.usageNote).toLowerCase().includes('new supply checklist')) body.statusOverride='auto';
  }
  const d=await api('/api/admin/inventory/'+id,{method:'PATCH',body:JSON.stringify(body)});
  const idx=(DATA.inventory||[]).findIndex(x=>x.id===id);
  if(idx>=0)DATA.inventory[idx]=d.item||{...DATA.inventory[idx],...body};
  renderInventory();
};
function renderStockItemV115(x){
  const st=invStatus(x),needs=st==='NEEDS STOCKING',buy=inventoryOrderQty(x),section=inventorySection(x),note=cleanInventoryNoteV115(x.usageNote),checked=inventoryCheckedTodayV115(x);
  return `<div class="stock-item ${needs?'needs-stock':''}">
    <div class="stock-item-name"><b>${esc(x.name)}</b><small>${esc(note||inventoryCheckedLabelV115(x))}</small><select class="stock-section-select" onchange="patchInvSectionV115('${x.id}',this.value)">${inventorySectionOptionsV115(section)}</select><span class="stock-checked ${checked?'today':''}">${checked?'✓ Checked today':esc(inventoryCheckedLabelV115(x))}</span></div>
    <label><span>On hand</span><div class="inventory-number"><input class="on-hand-input" type="number" step=".01" value="${Number(x.qty||0)}" onchange="patchInv('${x.id}','qty',this.value)"><em>${esc(x.unit||'unit')}</em></div></label>
    <label><span>Reorder at</span><input type="number" step=".01" value="${Number(x.reorder||0)}" onchange="patchInv('${x.id}','reorder',this.value)"></label>
    <label><span>Target</span><input type="number" step=".01" value="${Number(x.targetQty||0)}" onchange="patchInv('${x.id}','targetQty',this.value)"></label>
    <label><span>Status</span><select onchange="patchInv('${x.id}','statusOverride',this.value)"><option value="auto" ${!x.statusOverride||x.statusOverride==='auto'?'selected':''}>Auto · ${st}</option><option value="ok" ${x.statusOverride==='ok'?'selected':''}>✓ Stocked</option><option value="reorder" ${x.statusOverride==='reorder'?'selected':''}>⚠ Need to order</option></select></label>
    <div class="stock-buy"><span>${needs?'BUY / PREPARE':'OK'}</span><b>${needs?(buy?`${buy} ${esc(x.unit||'unit')}`:'Set target quantity'):'No order'}</b></div>
    <button class="stock-delete" title="Delete item" onclick="delInv('${x.id}')">×</button>
  </div>`;
}
function inventorySearchMatchV116(x,q){
  if(!q)return true;
  const hay=[x.name,inventorySection(x),x.unit,x.supplier,cleanInventoryNoteV115(x.usageNote)].join(' ').toLowerCase();
  return hay.includes(q);
}
function inventoryToggleSections(open){document.querySelectorAll('#inventorySections details.stock-section').forEach(d=>d.open=!!open)}
function inventoryJumpToSection(section){
  if(!section)return;
  const el=[...document.querySelectorAll('#inventorySections details.stock-section')].find(d=>d.dataset.section===section);
  if(el){el.open=true;el.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>el.querySelector('.on-hand-input')?.focus(),250)}
}
renderInventory=function(){
  const all=DATA.inventory||[],low=inventoryRestockItems(),groups=stockSectionGroups(),ok=all.length-low.length,checkedToday=all.filter(inventoryCheckedTodayV115).length;
  const q=($('#inventorySearch')?.value||'').trim().toLowerCase();
  const jump=$('#inventorySectionJump');
  if(jump){
    const old=jump.value;
    jump.innerHTML='<option value="">Choose a section…</option>'+INVENTORY_SECTION_ORDER_V115.filter(s=>(groups[s]||[]).length).map(s=>`<option value="${esc(s)}">${esc(s)} (${(groups[s]||[]).length})</option>`).join('');
    if([...jump.options].some(o=>o.value===old))jump.value=old;
  }
  const insights=$('#inventoryInsights');
  if(insights){
    const preview=INVENTORY_SECTION_ORDER_V115.map(section=>{
      const items=(groups[section]||[]).filter(x=>invStatus(x)==='NEEDS STOCKING');if(!items.length)return '';
      return `<div class="order-preview-group"><b>${esc(section)}</b>${items.map(x=>{const buy=inventoryOrderQty(x);return `<span><i>•</i><strong>${esc(x.name)}</strong><em>${buy?`Buy ${buy} ${esc(x.unit||'unit')}`:'Set target'}</em></span>`}).join('')}</div>`;
    }).join('');
    insights.innerHTML=`<div class="inventory-metrics">${inventoryMetricCard114('Checked today',checkedToday,`${all.length-checkedToday} still to count`)}${inventoryMetricCard114('Need to order',low.length,'automatic order list')}${inventoryMetricCard114('Stocked',ok,'no action needed')}${inventoryMetricCard114('Sections',INVENTORY_SECTION_ORDER_V115.filter(s=>(groups[s]||[]).length).length,'organized stock zones')}</div>
    <div class="inventory-workflow-strip"><div class="workflow-step"><b>1</b><span><strong>Open section</strong><small>Beverages, produce, packaging…</small></span></div><div class="workflow-arrow">→</div><div class="workflow-step"><b>2</b><span><strong>Count On hand</strong><small>Enter what is physically left</small></span></div><div class="workflow-arrow">→</div><div class="workflow-step"><b>3</b><span><strong>Auto reorder</strong><small>On hand ≤ Reorder at</small></span></div><div class="workflow-arrow">→</div><div class="workflow-step"><b>4</b><span><strong>Send order list</strong><small>Target − On hand</small></span></div></div>
    <div class="today-order-preview"><div class="today-order-head"><div><span class="eyebrow">AUTO-GENERATED</span><b>Today's Order List</b><small>${low.length?`${low.length} item(s) currently need buying / preparation`:'Everything is above reorder level'}</small></div><button onclick="sendReorderList()" ${low.length?'':'disabled'}>📲 Send List</button></div>${preview||'<div class="stock-empty">✓ Nothing needs ordering right now.</div>'}</div>`;
  }
  const host=$('#inventorySections');if(!host)return;
  const previouslyOpen=new Set([...host.querySelectorAll('details[open]')].map(d=>d.dataset.section));
  const sections=INVENTORY_SECTION_ORDER_V115.map(section=>{
    const raw=(groups[section]||[]).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const items=raw.filter(x=>inventorySearchMatchV116(x,q));
    if(!items.length)return '';
    const need=raw.filter(x=>invStatus(x)==='NEEDS STOCKING').length,checked=raw.filter(inventoryCheckedTodayV115).length;
    const shouldOpen=q||previouslyOpen.has(section);
    return `<details class="stock-section" data-section="${esc(section)}" ${shouldOpen?'open':''}><summary><span class="section-main"><span class="section-icon">${section==='Beverages'?'🥤':section.includes('Produce')?'🥬':section.includes('Packaging')?'📦':section.includes('Kitchen Consumables')?'🧻':section.includes('Cleaning')?'🧼':section.includes('Washroom')?'🧻':section.includes('Gloves')?'🧤':section.includes('Waste')?'🗑️':section.includes('Office')?'🗂️':section.includes('Sauces')?'🥫':section.includes('Proteins')?'🥩':section.includes('Bread')?'🥖':section.includes('Frozen')?'❄️':'▤'}</span><span><b>${esc(section)}</b><small>${checked}/${raw.length} checked today · ${raw.length} item${raw.length===1?'':'s'}</small></span></span><span class="section-count ${need?'warn':'good'}">${need?`${need} need order`:'✓ All good'}</span></summary><div class="stock-section-head"><span>Item</span><span>On hand</span><span>Reorder at</span><span>Target stock</span><span>Status</span><span>Suggested order</span><span></span></div><div class="stock-section-body">${items.map(renderStockItemV115).join('')}</div></details>`;
  }).join('');
  host.innerHTML=sections||(q?`<div class="stock-empty inventory-search-empty">No inventory item matches “${esc(q)}”.</div>`:'<div class="stock-empty">No inventory items yet. Add your first stock item.</div>');
};
showInventoryForm=function(){
  const el=$('#inventoryForm');el.classList.remove('hidden');
  el.innerHTML=`<div class="inventory-add-grid"><label>Item name<input id="in" placeholder="e.g. Sprite"></label><label>Section<select id="isection">${inventorySectionOptionsV115('Beverages')}</select></label><label>Unit<input id="iu" placeholder="can, bottle, kg, pack..."></label><label>On hand<input id="iq" type="number" step=".01" value="0"></label><label>Reorder at<input id="ir" type="number" step=".01" value="0"></label><label>Target stock<input id="itarget" type="number" step=".01" value="0"></label><label>Supplier<input id="isupplier" placeholder="Supplier"></label><label>Cost<input id="icost" type="number" step=".01" value="0"></label><label class="wide">Used for / note<input id="inote" placeholder="e.g. fountain drinks, dining room fridge"></label><div class="wide inventory-actions"><button class="primary" onclick="addInventoryV115()">Save Stock Item</button><button class="secondary-btn" onclick="$('#inventoryForm').classList.add('hidden')">Cancel</button></div></div>`;
};
async function addInventoryV115(){
  const section=$('#isection').value,payload={name:$('#in').value.trim(),unit:$('#iu').value.trim(),qty:Number($('#iq').value)||0,reorder:Number($('#ir').value)||0,targetQty:Number($('#itarget').value)||0,usageNote:encodeInventoryNoteV115(section,$('#inote').value.trim()),supplier:$('#isupplier').value.trim(),cost:Number($('#icost').value)||0,statusOverride:'auto',lastStockedAt:new Date().toISOString()};
  if(!payload.name)return alert('Enter an inventory item name.');
  await api('/api/admin/inventory',{method:'POST',body:JSON.stringify(payload)});$('#inventoryForm').classList.add('hidden');await loadAll();go('inventory');
}
importMissingInventoryTemplates=async function(){
  const missing=inventoryMissingTemplates();if(!missing.length){alert('Viet Nom Nom master stock list is already loaded.');return}
  if(!confirm(`Add ${missing.length} missing Viet Nom Nom stock item(s)?`))return;
  for(const item of missing){const section=inventorySection(item);await api('/api/admin/inventory',{method:'POST',body:JSON.stringify({...item,usageNote:encodeInventoryNoteV115(section,item.usageNote),statusOverride:'auto'})})}
  await loadAll();go('inventory');alert(`Added ${missing.length} stock item(s), already organized by section.`);
};
sendReorderList=async function(){
  const list=inventoryRestockItems();if(!list.length)return alert("Today's Order List is empty.");
  if(!confirm(`Send Today's Order List (${list.length} item(s)) to 382-342-2566?`))return;
  const sectionById=Object.fromEntries(list.map(x=>[x.id,inventorySection(x)]));
  try{const d=await api('/api/admin/inventory/send-reorder',{method:'POST',body:JSON.stringify({sectionById})});$('#inventorySendMsg').textContent=d.live?"Today's Order List sent by SMS.":"Today's Order List saved in SMS simulation mode. Configure Twilio for live SMS.";alert(d.message||'Order list processed.')}catch(e){alert(e.message)}
};


// V11.7 — Excel inventory export with timestamped filename.
async function exportInventoryExcel(){
  try{
    const r=await fetch('/api/admin/inventory/export-excel',{headers:{'x-admin-pin':PIN}});
    if(!r.ok){let msg='Could not export inventory.';try{const d=await r.json();msg=d.error||msg}catch{}throw new Error(msg)}
    const blob=await r.blob();
    const cd=r.headers.get('content-disposition')||'';
    const m=cd.match(/filename="?([^";]+)"?/i);
    const name=m?.[1]||`VietNomNom_Inventory_${new Date().toISOString().replace(/[:.]/g,'-')}.xls`;
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    const msg=$('#inventorySendMsg');if(msg)msg.textContent=`Excel exported: ${name}`;
  }catch(e){alert(e.message)}
}

// V11.12 — reliable sold-out toggle, grouped menu variants, product chart and clean order history.
function managerVM(){return window.VietNomNomMenuVariants||null}
patchMenu=async function(id,k,v){const row=DATA.menu.find(x=>x.id===id),before=row?row[k]:undefined;if(row)row[k]=v;renderMenu();renderPOSFilters();try{await api('/api/admin/menu/'+id,{method:'PATCH',body:JSON.stringify({[k]:v})});await loadAll()}catch(e){if(row)row[k]=before;renderMenu();renderPOSFilters();alert('Could not update menu: '+e.message)}};
renderDashboard=function(){
  const a=DATA.analytics||{};$('#metrics').innerHTML=[['Today Sales',money(a.todaySales)],['Today Orders',a.todayOrders||0],['This Month',money(a.monthSales)],['Low Stock',a.lowStock||0],['All Recorded Sales',money(a.allSales)],['Active Staff',a.activeEmployees||0]].map(x=>`<div class="metric"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
  const rows=(a.topItems||[]).slice(0,7),max=Math.max(1,...rows.map(x=>Number(x.qty||0)));$('#topItems').innerHTML=rows.length?`<div class="top-product-chart"><div class="chart-scale"><span>${max}</span><span>${Math.round(max/2)}</span><span>0</span></div><div class="chart-columns">${rows.map((x,i)=>{const h=Math.max(8,Math.round(Number(x.qty||0)/max*100));return `<div class="chart-product" title="${esc(x.name)} · ${Number(x.qty||0)} sold"><div class="chart-value">${Number(x.qty||0)}</div><div class="chart-bar-track"><div class="chart-bar" style="height:${h}%"></div></div><div class="chart-label"><b>${i+1}</b><span>${esc(x.name)}</span></div></div>`}).join('')}</div></div>`:'<p class="muted">No sales entered yet.</p>'
};
function managerVariantSelections(card){const out={};card.querySelectorAll('[data-manager-variant-control]').forEach(s=>out[s.dataset.managerVariantControl]=s.value);return out}
function syncManagerVariantCard(card){const vm=managerVM(),key=card.dataset.managerFamilyKey,f=vm?.family(key);if(!vm||!f)return null;const sel=managerVariantSelections(card);let r=vm.resolveAvailable(DATA.menu,key,sel);if(r){f.controls.forEach(c=>{const s=card.querySelector(`[data-manager-variant-control="${c.key}"]`);if(s&&r.variant.values[c.key]!=null)s.value=r.variant.values[c.key]})}const p=card.querySelector('[data-manager-variant-price]'),sm=card.querySelector('[data-manager-variant-summary]'),desc=card.querySelector('[data-manager-variant-desc]'),btn=card.querySelector('[data-manager-variant-add]');if(p)p.textContent=r?money(r.item.price):'—';if(sm)sm.textContent=r?r.displayName:'Unavailable';if(desc)desc.textContent=r?(r.description||r.item.description||f.description):f.description;if(btn)btn.disabled=!r||r.item.soldOut||!r.item.active;return r}
function addManagerResolved(r){if(!r)return;const key=r.cartKey||r.item.id,c=cart.find(x=>(x._key||x.id)===key);if(c)c.qty++;else cart.push({id:r.item.id,_key:key,name:r.displayName||r.item.name,price:Number(r.item.price||0),qty:1});renderPOSFilters()}
addCart=function(id){const x=DATA.menu.find(m=>m.id===id);if(x)addManagerResolved({item:x,displayName:x.name,cartKey:x.id})};
qCart=function(key,d){const c=cart.find(x=>(x._key||x.id)===key);if(!c)return;c.qty+=d;if(c.qty<=0)cart=cart.filter(x=>(x._key||x.id)!==key);renderPOSFilters()};
renderPOSMenu=function(){if(!$('#posMenu'))return;const vm=managerVM(),q=($('#posSearch').value||'').trim().toLowerCase(),cat=$('#posCategory').value||'All';let entries=vm?vm.build(DATA.menu):DATA.menu.map((item,index)=>({kind:'item',item,index,category:item.category,searchText:`${item.name} ${item.category}`.toLowerCase()}));entries=entries.filter(e=>(cat==='All'||!cat||e.category===cat)&&(!q||e.searchText.includes(q)));$('#posMenu').innerHTML=entries.map(e=>{if(e.kind==='item'){const x=e.item;return `<button class="menu-btn ${x.soldOut||!x.active?'menu-soldout':''}" data-manager-add="${esc(x.id)}" ${x.soldOut||!x.active?'disabled':''}><b>${esc(x.name)}</b><small>${esc(x.category)}</small><strong>${x.soldOut?'SOLD OUT':money(x.price)}</strong></button>`}const f=vm.family(e.key),d=vm.defaults(DATA.menu,e.key);return `<div class="menu-btn manager-variant-card" data-manager-family-key="${esc(e.key)}"><div class="manager-variant-head"><span><b>${esc(e.title)}</b><small>${esc(e.category)}</small></span><strong data-manager-variant-price>${esc(vm.priceLabel(e))}</strong></div><small class="variant-live-desc" data-manager-variant-desc>${esc(e.description||f.description||'Choose options')}</small><div class="manager-variant-controls">${f.controls.map(c=>`<label><span>${esc(c.label)}</span><select data-manager-variant-control="${esc(c.key)}">${c.options.map(o=>`<option value="${esc(o.value)}" ${String(d[c.key])===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}</div><small data-manager-variant-summary></small><button type="button" data-manager-variant-add>Add selected</button></div>`}).join('')||'<p class="muted">No matching items.</p>';$('#posMenu').querySelectorAll('[data-manager-add]').forEach(b=>b.onclick=()=>addCart(b.dataset.managerAdd));$('#posMenu').querySelectorAll('[data-manager-family-key]').forEach(card=>{card.querySelectorAll('[data-manager-variant-control]').forEach(s=>s.onchange=()=>syncManagerVariantCard(card));card.querySelector('[data-manager-variant-add]').onclick=()=>addManagerResolved(syncManagerVariantCard(card));syncManagerVariantCard(card)})};
renderPOSFilters=function(){const catOld=$('#posCategory')?.value||'All',promoOld=$('#salePromo')?.value||'',cats=['All',...new Set(DATA.menu.filter(x=>x.active).map(x=>x.category))];$('#posCategory').innerHTML=cats.map(c=>`<option ${c===catOld?'selected':''}>${esc(c)}</option>`).join('');const sub=cart.reduce((s,x)=>s+x.price*x.qty,0);$('#salePromo').innerHTML='<option value="">No promotion</option>'+DATA.promotions.filter(p=>promoEligible(p,'pos',sub)).map(x=>`<option value="${x.id}" ${x.id===promoOld?'selected':''}>${esc(x.name)} (${x.type==='percent'?x.value+'%':'$'+Number(x.value).toFixed(2)})</option>`).join('');renderPOSMenu();renderCart()};
renderCart=function(){if(!$('#cart'))return;$('#cart').innerHTML=cart.length?cart.map(x=>{const key=x._key||x.id;return `<div class="cart-row"><div><b>${esc(x.name)}</b><div class="muted">${money(x.price)} each</div></div><div class="qty"><button data-manager-qty="${esc(key)}" data-delta="-1">−</button><b>${x.qty}</b><button data-manager-qty="${esc(key)}" data-delta="1">+</button><strong>${money(x.price*x.qty)}</strong></div></div>`}).join(''):'<p class="muted">No items yet. Select items from the menu.</p>';$('#cart').querySelectorAll('[data-manager-qty]').forEach(b=>b.onclick=()=>qCart(b.dataset.managerQty,Number(b.dataset.delta)));const sub=cart.reduce((s,x)=>s+x.price*x.qty,0),pid=$('#salePromo')?.value,p=DATA.promotions.find(x=>x.id===pid),eligible=promoEligible(p,'pos',sub);let pd=eligible?(p.type==='percent'?sub*p.value/100:p.value):0;if(eligible&&Number(p.maxDiscount||0)>0)pd=Math.min(pd,Number(p.maxDiscount));const md=Number($('#manualDiscount')?.value)||0,disc=Math.min(sub,pd+md),tax=(sub-disc)*.13,total=sub-disc+tax;$('#totals').innerHTML=`<div><span>Subtotal</span><b>${money(sub)}</b></div><div><span>Discount</span><b>−${money(disc)}</b></div><div><span>HST 13%</span><b>${money(tax)}</b></div><div class="grand"><span>Total</span><b>${money(total)}</b></div>`};
completeSale=async function(){if(!cart.length)return alert('Add at least one item.');const payload={items:cart.map(x=>({id:x.id,qty:x.qty,displayName:x.name,priceOverride:x.price})),promotionId:$('#salePromo').value,manualDiscount:Number($('#manualDiscount').value)||0,payment:$('#salePayment').value,channel:$('#saleChannel').value,customerName:$('#customerName').value,notes:$('#saleNotes').value};try{const d=await api('/api/admin/sales',{method:'POST',body:JSON.stringify(payload)});$('#saleMsg').innerHTML=`<p class="good badge">Saved ${esc(d.sale.saleNo)} • Final total ${money(d.sale.total)}</p>`;cart=[];$('#manualDiscount').value=0;$('#customerName').value='';$('#saleNotes').value='';await loadAll();renderCart()}catch(e){alert(e.message)}};

let managerOrderFilter={q:'',status:'all',fulfillment:'all',source:'all',date:''};
function ensureManagerOrderChrome(){const root=$('#orderCards');if(!root||$('#managerOrderFilters'))return;root.insertAdjacentHTML('beforebegin',`<div id="managerOrderFilters" class="manager-order-filters"><label class="order-date-filter"><span>Date</span><input id="managerOrderDate" type="date"></label><label class="order-search-filter"><span>Search</span><input id="managerOrderSearch" placeholder="Order #, customer, phone or item"></label><label><span>Status</span><select id="managerOrderStatus"><option value="all">All statuses</option><option value="new">New</option><option value="accepted">Accepted</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label><span>Order type</span><select id="managerOrderFulfillment"><option value="all">All types</option><option value="dine-in">Dine-in</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option><option value="walk-in">Walk-in</option><option value="phone">Phone</option></select></label><label><span>Source</span><select id="managerOrderSource"><option value="all">All sources</option><option value="website">Website</option><option value="pos">POS / Staff</option></select></label><button id="managerOrderClear" type="button">Clear filters</button></div><div id="managerOrderSummary" class="manager-order-summary"></div>`);const rerender=()=>renderOrders();$('#managerOrderSearch').oninput=e=>{managerOrderFilter.q=e.target.value.trim().toLowerCase();rerender()};$('#managerOrderStatus').onchange=e=>{managerOrderFilter.status=e.target.value;rerender()};$('#managerOrderFulfillment').onchange=e=>{managerOrderFilter.fulfillment=e.target.value;rerender()};$('#managerOrderSource').onchange=e=>{managerOrderFilter.source=e.target.value;rerender()};$('#managerOrderDate').onchange=e=>{managerOrderFilter.date=e.target.value;rerender()};$('#managerOrderClear').onclick=()=>{managerOrderFilter={q:'',status:'all',fulfillment:'all',source:'all',date:''};['managerOrderSearch','managerOrderDate'].forEach(id=>$('#'+id).value='');['managerOrderStatus','managerOrderFulfillment','managerOrderSource'].forEach(id=>$('#'+id).value='all');rerender()}}
function orderDateLocalKey(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return'';const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function managerOrderStatusClass(status){return ['new','accepted','preparing','ready','completed','cancelled'].includes(status)?status:'other'}
renderOrders=function(){ensureManagerOrderChrome();let rows=(DATA.orders||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const f=managerOrderFilter,q=f.q;rows=rows.filter(o=>(f.status==='all'||o.status===f.status)&&(f.fulfillment==='all'||o.fulfillment===f.fulfillment)&&(f.source==='all'||o.source===f.source)&&(!f.date||orderDateLocalKey(o.createdAt)===f.date)&&(!q||[o.orderNo,o.customer?.name,o.customer?.phone,o.customer?.email,o.fulfillment,o.payment,...(o.items||[]).map(i=>i.name)].join(' ').toLowerCase().includes(q)));const summary=$('#managerOrderSummary'),total=rows.reduce((s,o)=>s+Number(o.total||0),0),active=rows.filter(o=>!['completed','cancelled'].includes(o.status)).length;if(summary)summary.innerHTML=`<span><b>${rows.length}</b> orders</span><span><b>${active}</b> active</span><span><b>${money(total)}</b> filtered total</span>`;const root=$('#orderCards');root.className='manager-order-list';root.innerHTML=rows.map(o=>`<article class="manager-order-row"><div class="manager-order-main"><div class="manager-order-id"><b>${esc(o.orderNo)}</b><span>${new Date(o.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span></div><div class="manager-order-customer"><b>${esc(o.customer?.name||'Guest')}</b><span>${esc(o.customer?.phone||'No phone')}</span></div><div class="manager-order-items">${(o.items||[]).map(i=>`<span>${Number(i.qty||1)}× ${esc(i.name)}${Array.isArray(i.modifiers)&&i.modifiers.length?`<small>${i.modifiers.map(esc).join(' · ')}</small>`:''}</span>`).join('')}</div><div class="manager-order-type"><b>${esc(String(o.fulfillment||'').replaceAll('-',' '))}</b><span>${esc(o.payment||'')}</span></div><div class="manager-order-total"><b>${money(o.total)}</b><span>${esc(o.source==='website'?'Website':'POS / Staff')}</span></div><span class="manager-order-status ${managerOrderStatusClass(o.status)}">${esc(String(o.status||'').replaceAll('-',' '))}</span></div><details class="manager-order-detail"><summary>View details</summary><div><span><b>Email</b>${esc(o.customer?.email||'—')}</span><span><b>Subtotal</b>${money(o.subtotal)}</span><span><b>Discount</b>−${money(o.discount)}</span><span><b>HST</b>${money(o.tax)}</span>${o.notes?`<span class="wide"><b>Notes</b>${esc(o.notes)}</span>`:''}</div></details></article>`).join('')||'<div class="manager-order-empty"><b>No orders match these filters.</b><span>Try clearing the date, status or search filters.</span></div>'};

// V11.13 — clean pie chart dashboard for top sellers.
function topSellerPieV113(rows){
  const data=(rows||[]).slice(0,6).map(x=>({name:String(x.name||'Item'),qty:Number(x.qty||0)})).filter(x=>x.qty>0);
  if(!data.length)return '<div class="top-pie-empty"><b>No sales yet</b><span>Top sellers will appear here after completed sales are recorded.</span></div>';
  const palette=['#0a6770','#ef6657','#e8ab34','#519368','#6f78b8','#b56a9e'];
  const total=data.reduce((s,x)=>s+x.qty,0)||1;let cursor=0;const stops=[];
  data.forEach((x,i)=>{const start=cursor,end=cursor+(x.qty/total*100);stops.push(`${palette[i%palette.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`);cursor=end});
  const leader=data[0],legend=data.map((x,i)=>{const pct=x.qty/total*100;return `<div class="top-pie-legend-row"><i style="background:${palette[i%palette.length]}"></i><span><b>${esc(x.name)}</b><small>${x.qty} sold · ${pct.toFixed(pct>=10?0:1)}%</small></span></div>`}).join('');
  return `<div class="top-pie-layout"><div class="top-pie-wrap"><div class="top-pie" style="background:conic-gradient(${stops.join(',')})"><div class="top-pie-center"><small>Top seller</small><b>${esc(leader.name)}</b><strong>${leader.qty}</strong><span>sold</span></div></div></div><div class="top-pie-legend">${legend}<div class="top-pie-total"><span>Top ${data.length} items</span><b>${total} sold</b></div></div></div>`;
}
renderDashboard=function(){
  const a=DATA.analytics||{};
  $('#metrics').innerHTML=[['Today Sales',money(a.todaySales)],['Today Orders',a.todayOrders||0],['This Month',money(a.monthSales)],['Low Stock',a.lowStock||0],['All Recorded Sales',money(a.allSales)],['Active Staff',a.activeEmployees||0]].map(x=>`<div class="metric"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
  $('#topItems').innerHTML=topSellerPieV113(a.topItems||[]);
};

// V11.16 — surface scheduled orders and allergy alerts clearly in Manager order history.
function managerAllergyAlertsV116(o){const a=[];(o?.items||[]).forEach(i=>(i.modifiers||[]).forEach(m=>{if(/allergy|gluten|no msg|canola/i.test(String(m)))a.push(`${i.name}: ${String(m).replace(/^⚠\s*/, '')}`)}));return [...new Set(a)]}
function managerScheduleLabelV116(o){const v=String(o?.requestedTime||'ASAP');return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)?`Pre-order · ${v.replace('T',' ')}`:'ASAP'}
const renderOrdersV1115Base=renderOrders;
renderOrders=function(){
  renderOrdersV1115Base();
  const rows=$$('#orderCards .manager-order-row');rows.forEach((row,idx)=>{
    const filtered=(DATA.orders||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const orderNo=row.querySelector('.manager-order-id b')?.textContent;const o=filtered.find(x=>x.orderNo===orderNo);if(!o)return;
    const main=row.querySelector('.manager-order-main');if(main&&!row.querySelector('.manager-schedule-chip'))main.insertAdjacentHTML('afterbegin',`<span class="manager-schedule-chip">${esc(managerScheduleLabelV116(o))}</span>`);
    const alerts=managerAllergyAlertsV116(o);if(alerts.length&&!row.querySelector('.manager-allergy-alert'))row.insertAdjacentHTML('afterbegin',`<div class="manager-allergy-alert"><b>⚠ ALLERGY ALERT</b>${alerts.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`);
  });
};

// V11.22 — surface customer pickup acknowledgement in Manager order history.
function managerCustomerComingAtV1122(o){const m=String(o?.staffNote||'').match(/\[\[CUSTOMER_COMING:([^\]]+)\]\]/);return m?m[1]:''}
const _renderOrdersManagerV1122=renderOrders;
renderOrders=function(){
  _renderOrdersManagerV1122();
  $$('#orderCards .manager-order-row').forEach(row=>{const orderNo=row.querySelector('.manager-order-id b')?.textContent?.trim(),o=(DATA.orders||[]).find(x=>x.orderNo===orderNo),at=managerCustomerComingAtV1122(o);if(!at)return;let when='';try{when=new Date(at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}catch{}const main=row.querySelector('.manager-order-main');if(main&&!row.querySelector('.manager-customer-coming'))main.insertAdjacentHTML('beforeend',`<span class="manager-customer-coming">🚶 Customer coming${when?` · ${esc(when)}`:''}</span>`)});
};

// V11.25 — Canadian cash rounding for Manager POS preview.
function cashNickelManagerV1125(n){return Math.round((Number(n)||0)*20)/20}
function isCashManagerV1125(v){return /cash/i.test(String(v||''))}
const _renderCartV1125=renderCart;
renderCart=function(){
  _renderCartV1125();
  const root=$('#totals');if(!root)return;
  root.querySelectorAll('.cash-rounding-v1125').forEach(x=>x.remove());
  const grand=root.querySelector('.grand');if(!grand)return;
  const totalNode=grand.querySelector('b,strong');const exact=Number(String(totalNode?.textContent||'').replace(/[^0-9.-]/g,''))||0;
  if(isCashManagerV1125($('#salePayment')?.value)){
    const rounded=cashNickelManagerV1125(exact),adj=Math.round((rounded-exact)*100)/100;
    grand.insertAdjacentHTML('beforebegin',`<div class="cash-rounding-v1125"><span>Cash rounding <small>nearest $0.05</small></span><b>${adj>0?'+':''}${money(adj)}</b></div>`);
    if(totalNode)totalNode.textContent=money(rounded);const label=grand.querySelector('span');if(label)label.textContent='Final cash total';
  }
};
if($('#salePayment'))$('#salePayment').onchange=()=>renderCart();

// V11.28 — Manager-only UI for permanently deleting test/duplicate orders.
async function deleteManagerOrderV1128(id,orderNo){
  const o=(DATA.orders||[]).find(x=>x.id===id);
  if(!o)return;
  const active=!['completed','cancelled'].includes(o.status);
  const message=`Permanently delete ${orderNo}?\n\nThis removes the order from Manager history${o.saleId||o.status==='completed'?', linked sales/analytics':''} and notification records. This cannot be undone.${active?'\n\nWARNING: This order is still active. The customer live tracker will stop working for it.':''}`;
  if(!confirm(message))return;
  try{
    await api('/api/admin/orders/'+encodeURIComponent(id),{method:'DELETE'});
    await loadAll();
    alert(`${orderNo} was permanently deleted.`);
  }catch(e){
    alert('Could not delete order: '+e.message);
  }
}
const _renderOrdersManagerV1128=renderOrders;
renderOrders=function(){
  _renderOrdersManagerV1128();
  $$('#orderCards .manager-order-row').forEach(row=>{
    const orderNo=row.querySelector('.manager-order-id b')?.textContent?.trim();
    const o=(DATA.orders||[]).find(x=>x.orderNo===orderNo);
    const details=row.querySelector('.manager-order-detail');
    if(!o||!details||details.querySelector('[data-delete-manager-order]'))return;
    const actions=document.createElement('div');
    actions.className='manager-order-danger-zone';
    actions.innerHTML=`<div><b>Test / duplicate order?</b><span>Permanent deletion also removes linked sale history and notifications.</span></div><button type="button" class="manager-delete-order" data-delete-manager-order="${esc(o.id)}">Delete order</button>`;
    details.appendChild(actions);
    actions.querySelector('button').onclick=()=>deleteManagerOrderV1128(o.id,o.orderNo);
  });
};


// ===== V11.40 MANAGER DAILY REVENUE + CASH CLOSE =====
DATA.revenueLedger=DATA.revenueLedger||[];
function revenueNumV1140(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function revenueValueV1140(r){
  const over=revenueNumV1140(r?.revenueOverride);if(over!==null)return over;
  const debit=revenueNumV1140(r?.debitTotal),cash=revenueNumV1140(r?.cashDrawerTotal);
  if(debit===null||cash===null)return null;
  return debit-(revenueNumV1140(r?.debitTips)||0)+cash-(revenueNumV1140(r?.beginCash)||0)-(revenueNumV1140(r?.otherCashOut)||0);
}
function nextBeginCashV1140(r){const cash=revenueNumV1140(r?.cashDrawerTotal);if(cash===null)return null;return Math.max(0,cash-(revenueNumV1140(r?.debitTips)||0)-(revenueNumV1140(r?.ownerCashOut)||0)-(revenueNumV1140(r?.otherCashOut)||0))}
function tipsTotalV1140(r){return (revenueNumV1140(r?.debitTips)||0)+(revenueNumV1140(r?.cashTips)||0)}
function closeCompleteV1140(r){return revenueValueV1140(r)!==null}
function localDateV1140(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function prettyDateV1140(v){try{return new Date(v+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}catch{return v}}
function moneyNullableV1140(v){return v===null||v===undefined?'—':money(v)}
function previousRevenueRowV1140(date){return (DATA.revenueLedger||[]).filter(x=>x.date<date).sort((a,b)=>b.date.localeCompare(a.date))[0]||null}
function fieldValueV1140(v){return v===null||v===undefined?'':String(v)}
function revenueFormHtmlV1140(r={}){
  const date=r.date||localDateV1140();
  return `<div class="revenue-form-grid-v1140">
    <label>Business date<input id="revDateV1140" type="date" value="${esc(date)}" onchange="revenueDateChangedV1140()"></label>
    <label>Begin cash from previous day ($)<input id="revBeginV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.beginCash)}" oninput="previewRevenueFormulaV1140()"></label>
    <label>Debit terminal total ($)<small>Include debit tips in this number</small><input id="revDebitV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.debitTotal)}" oninput="previewRevenueFormulaV1140()"></label>
    <label>Cash currently in till ($)<small>Physical total before paying tips / owner</small><input id="revCashV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.cashDrawerTotal)}" oninput="previewRevenueFormulaV1140()"></label>
    <label>Debit tips ($)<small>Tips inside the debit terminal total</small><input id="revDebitTipsV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.debitTips)}" oninput="previewRevenueFormulaV1140()"></label>
    <label>Cash tips from tip jar ($)<small>Separate cash tip jar</small><input id="revCashTipsV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.cashTips)}" oninput="previewRevenueFormulaV1140()"></label>
    <label>Cash given to owner ($)<input id="revOwnerOutV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.ownerCashOut)}" oninput="previewRevenueFormulaV1140()"></label>
    <label>Other cash out / expense ($)<input id="revOtherOutV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.otherCashOut)}" oninput="previewRevenueFormulaV1140()"></label>
    <label class="wide revenue-override-v1140">Recorded revenue override ($)<small>Optional. Historical notebook totals use this so the chart matches your written records exactly.</small><input id="revOverrideV1140" type="number" step="0.01" min="0" value="${fieldValueV1140(r.revenueOverride)}" oninput="previewRevenueFormulaV1140()"></label>
    <label class="wide">Manager note<textarea id="revNotesV1140" rows="3" placeholder="Cash payout, Costco, correction, reason for unusual day...">${esc(r.notes||'')}</textarea></label>
    <input id="revIdV1140" type="hidden" value="${esc(r.id||'')}">
    <input id="revSourceV1140" type="hidden" value="${esc(r.source||'Manager entry')}">
    <div class="wide revenue-form-actions-v1140"><button class="primary big" onclick="saveRevenueEntryV1140()">Save Daily Close</button><button class="secondary-btn" onclick="usePreviousCarryV1140()">Use previous Next Begin</button><button class="secondary-btn" onclick="newRevenueEntryV1140(true)">Clear form</button></div>
  </div>`;
}
function currentFormRevenueRowV1140(){
  const n=id=>revenueNumV1140($(id)?.value);
  return {id:$('#revIdV1140')?.value||'',date:$('#revDateV1140')?.value||'',beginCash:n('#revBeginV1140'),debitTotal:n('#revDebitV1140'),cashDrawerTotal:n('#revCashV1140'),debitTips:n('#revDebitTipsV1140'),cashTips:n('#revCashTipsV1140'),ownerCashOut:n('#revOwnerOutV1140'),otherCashOut:n('#revOtherOutV1140'),revenueOverride:n('#revOverrideV1140'),notes:$('#revNotesV1140')?.value?.trim()||'',source:$('#revSourceV1140')?.value||'Manager entry'};
}
function previewRevenueFormulaV1140(){
  const box=$('#revenueFormulaV1140');if(!box)return;const r=currentFormRevenueRowV1140(),auto=(revenueNumV1140(r.debitTotal)!==null&&revenueNumV1140(r.cashDrawerTotal)!==null)?(Number(r.debitTotal||0)-Number(r.debitTips||0)+Number(r.cashDrawerTotal||0)-Number(r.beginCash||0)-Number(r.otherCashOut||0)):null,recorded=revenueValueV1140(r),next=nextBeginCashV1140(r),tips=tipsTotalV1140(r),cashSales=revenueNumV1140(r.cashDrawerTotal)===null?null:Number(r.cashDrawerTotal||0)-Number(r.beginCash||0);
  box.innerHTML=`<div class="revenue-formula-cards-v1140"><article><small>Daily revenue</small><strong>${moneyNullableV1140(recorded)}</strong>${r.revenueOverride!==null?'<span>using recorded override</span>':'<span>automatic calculation</span>'}</article><article><small>Net debit sales</small><strong>${r.debitTotal===null?'—':money(Number(r.debitTotal||0)-Number(r.debitTips||0))}</strong><span>Debit − debit tips</span></article><article><small>Cash increase</small><strong>${cashSales===null?'—':money(cashSales)}</strong><span>Cash in till − begin cash</span></article><article class="carry"><small>Next begin cash</small><strong>${moneyNullableV1140(next)}</strong><span>Use this for the next opening day</span></article><article><small>Total tips</small><strong>${money(tips)}</strong><span>Debit tips + tip jar</span></article>${auto!==null&&r.revenueOverride!==null?`<article><small>Auto revenue check</small><strong>${money(auto)}</strong><span>${Math.abs(auto-r.revenueOverride)>.009?'differs from recorded total':'matches recorded total'}</span></article>`:''}</div>`;
}
function setRevenueFormV1140(r={}){const box=$('#revenueFormV1140');if(!box)return;box.innerHTML=revenueFormHtmlV1140(r);previewRevenueFormulaV1140()}
function newRevenueEntryV1140(forceBlank=false){
  const date=localDateV1140(),existing=!forceBlank?(DATA.revenueLedger||[]).find(x=>x.date===date):null;
  if(existing)return setRevenueFormV1140(existing);
  const prev=previousRevenueRowV1140(date),carry=prev?nextBeginCashV1140(prev):null;
  setRevenueFormV1140({date,beginCash:carry,source:'Manager entry'});
}
function revenueDateChangedV1140(){const date=$('#revDateV1140')?.value;if(!date)return;const existing=(DATA.revenueLedger||[]).find(x=>x.date===date);if(existing)return setRevenueFormV1140(existing);const prev=previousRevenueRowV1140(date),carry=prev?nextBeginCashV1140(prev):null;const r=currentFormRevenueRowV1140();setRevenueFormV1140({...r,id:'',date,beginCash:carry,revenueOverride:null,notes:'',source:'Manager entry'})}
function usePreviousCarryV1140(){const date=$('#revDateV1140')?.value||localDateV1140(),prev=previousRevenueRowV1140(date),carry=prev?nextBeginCashV1140(prev):null;if(carry===null)return alert('No previous closing cash is available.');$('#revBeginV1140').value=carry.toFixed(2);previewRevenueFormulaV1140()}
async function saveRevenueEntryV1140(){
  const r=currentFormRevenueRowV1140();if(!r.date)return alert('Choose the business date.');
  if(r.debitTotal!==null&&r.debitTips!==null&&r.debitTips>r.debitTotal)return alert('Debit tips cannot be greater than the debit terminal total.');
  try{await api('/api/admin/revenue-ledger',{method:'POST',body:JSON.stringify(r)});await loadAll();go('revenue');const saved=(DATA.revenueLedger||[]).find(x=>x.date===r.date);if(saved)setRevenueFormV1140(saved)}catch(e){alert('Could not save daily close: '+e.message)}
}
function editRevenueEntryV1140(id){const r=(DATA.revenueLedger||[]).find(x=>x.id===id);if(!r)return;setRevenueFormV1140(r);$('#revenueFormV1140')?.scrollIntoView({behavior:'smooth',block:'center'})}
async function deleteRevenueEntryV1140(id,date){if(!confirm(`Delete revenue close for ${date}?`))return;try{await api('/api/admin/revenue-ledger/'+encodeURIComponent(id),{method:'DELETE'});await loadAll();go('revenue')}catch(e){alert(e.message)}}
function revenueChartSvgV1140(rows){
  const data=rows.filter(closeCompleteV1140).slice().sort((a,b)=>a.date.localeCompare(b.date));if(!data.length)return '<div class="revenue-empty-v1140">No completed daily close yet.</div>';
  const W=Math.max(760,data.length*82),H=300,P={l:58,r:24,t:24,b:52},vals=data.map(revenueValueV1140),max=Math.max(...vals,1),top=Math.ceil(max/100)*100||100,plotW=W-P.l-P.r,plotH=H-P.t-P.b;
  const x=i=>P.l+(data.length===1?plotW/2:i*plotW/(data.length-1)),y=v=>P.t+plotH-(v/top)*plotH;
  const grid=[0,.25,.5,.75,1].map(f=>{const yy=P.t+plotH-f*plotH,val=top*f;return `<line x1="${P.l}" y1="${yy}" x2="${W-P.r}" y2="${yy}" class="rev-grid-v1140"/><text x="${P.l-10}" y="${yy+4}" text-anchor="end" class="rev-axis-v1140">$${Math.round(val)}</text>`}).join('');
  const points=data.map((r,i)=>`${x(i)},${y(revenueValueV1140(r))}`).join(' '),dots=data.map((r,i)=>`<g><circle cx="${x(i)}" cy="${y(revenueValueV1140(r))}" r="5" class="rev-dot-v1140"><title>${prettyDateV1140(r.date)} · ${money(revenueValueV1140(r))}</title></circle><text x="${x(i)}" y="${H-20}" text-anchor="middle" class="rev-date-v1140">${new Date(r.date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</text></g>`).join('');
  return `<div class="revenue-svg-scroll-v1140"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Daily revenue trend">${grid}<polyline points="${points}" class="rev-line-v1140"/>${dots}</svg></div>`;
}
function renderRevenueLedgerV1140(){
  if(!$('#revenueChartV1140'))return;const rows=(DATA.revenueLedger||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)),complete=rows.filter(closeCompleteV1140),range=$('#revenueRangeV1140')?.value||'all',chartRows=range==='all'?complete:complete.slice(0,Number(range));$('#revenueChartV1140').innerHTML=revenueChartSvgV1140(chartRows);
  const latest=complete[0],prev=complete[1],latestRev=latest?revenueValueV1140(latest):null,prevRev=prev?revenueValueV1140(prev):null,change=latestRev!==null&&prevRev!==null?latestRev-prevRev:null,last7=complete.slice(0,7),avg7=last7.length?last7.reduce((s,x)=>s+revenueValueV1140(x),0)/last7.length:null,high=complete.length?complete.reduce((a,b)=>revenueValueV1140(a)>=revenueValueV1140(b)?a:b):null,today=rows.find(x=>x.date===localDateV1140())||null;
  $('#revenueSummaryV1140').innerHTML=[['Latest revenue',moneyNullableV1140(latestRev),latest?prettyDateV1140(latest.date):'No close'],['Change vs previous',change===null?'—':`${change>=0?'+':''}${money(change)}`,change===null?'Need 2 days':change>=0?'Revenue increased':'Revenue decreased'],['7-entry average',moneyNullableV1140(avg7),`${last7.length} completed day${last7.length===1?'':'s'}`],['Highest recorded day',high?money(revenueValueV1140(high)):'—',high?prettyDateV1140(high.date):'—'],['Today begin cash',today?moneyNullableV1140(revenueNumV1140(today.beginCash)):'—',today?'Opening till balance':'No entry today'],['Next begin cash',today?moneyNullableV1140(nextBeginCashV1140(today)):'—',today&&nextBeginCashV1140(today)!==null?'Calculated from today close':'Complete today close first']].map(x=>`<article class="summary-card"><small>${x[0]}</small><strong>${x[1]}</strong><span class="muted">${x[2]}</span></article>`).join('');
  const asc=complete.slice().sort((a,b)=>a.date.localeCompare(b.date)),prevByDate=new Map();asc.forEach((r,i)=>prevByDate.set(r.date,i?asc[i-1]:null));
  $('#revenueTableV1140').innerHTML=rows.map(r=>{const rev=revenueValueV1140(r),previous=prevByDate.get(r.date),delta=rev!==null&&previous?rev-revenueValueV1140(previous):null,cashOut=(revenueNumV1140(r.ownerCashOut)||0)+(revenueNumV1140(r.otherCashOut)||0),next=nextBeginCashV1140(r),source=r.source?`<small>${esc(r.source)}</small>`:'';return `<tr class="${rev===null?'revenue-open-row-v1140':''}"><td><b>${prettyDateV1140(r.date)}</b>${source}</td><td><b>${moneyNullableV1140(rev)}</b>${r.revenueOverride!==null?'<small>recorded total</small>':'<small>auto</small>'}</td><td>${moneyNullableV1140(revenueNumV1140(r.debitTotal))}</td><td>${moneyNullableV1140(revenueNumV1140(r.cashDrawerTotal))}</td><td>${money(tipsTotalV1140(r))}<small>${r.debitTips?`Debit ${money(r.debitTips)}`:''}${r.cashTips?`${r.debitTips?' · ':''}Jar ${money(r.cashTips)}`:''}</small></td><td>${moneyNullableV1140(revenueNumV1140(r.beginCash))}</td><td>${money(cashOut)}<small>${r.ownerCashOut?`Owner ${money(r.ownerCashOut)}`:''}${r.otherCashOut?`${r.ownerCashOut?' · ':''}Other ${money(r.otherCashOut)}`:''}</small></td><td><b>${moneyNullableV1140(next)}</b></td><td>${delta===null?'—':`<span class="revenue-trend-chip-v1140 ${delta>=0?'up':'down'}">${delta>=0?'▲':'▼'} ${money(Math.abs(delta))}</span>`}</td><td><div class="revenue-row-actions-v1140"><button onclick="editRevenueEntryV1140('${esc(r.id)}')">Edit</button><button class="danger-btn" onclick="deleteRevenueEntryV1140('${esc(r.id)}','${esc(r.date)}')">Delete</button></div></td></tr>`}).join('')||'<tr><td colspan="10">No revenue entries yet.</td></tr>';
  const form=$('#revenueFormV1140');if(form&&!form.innerHTML.trim()){const todayRow=rows.find(x=>x.date===localDateV1140());if(todayRow)setRevenueFormV1140(todayRow);else newRevenueEntryV1140()}
}
const _renderAllV1140=renderAll;renderAll=function(){_renderAllV1140();renderRevenueLedgerV1140()};
const _goV1140=go;go=function(name){if(name!=='revenue')return _goV1140(name);$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$$('.page').forEach(p=>p.classList.toggle('active',p.id===name));$('#pageTitle').textContent='Revenue / Cash';$('#pageSub').textContent='Daily revenue, tips, till close and next-day begin cash';renderRevenueLedgerV1140()};
if(PIN)setTimeout(()=>loadAll(),0);
