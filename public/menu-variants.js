(function(){
  'use strict';
  const one=(key,title,category,description,options,label='Choose option')=>({
    key,title,category,description,
    controls:[{key:'choice',label,options:options.map(([value,text,id,displayName])=>({value,label:text,id,displayName:displayName||text}))}],
    variants:options.map(([value,text,id,displayName])=>({values:{choice:value},id,displayName:displayName||text}))
  });
  const families=[
    one('pho','Phở','Phở','Choose your preferred Vietnamese phở bowl.',[
      ['special','Viet Nom Nom Special','pho-special','P1. Viet Nom Nom Special Phở'],['rare','Rare Beef','pho-rare-beef','P2. Phở – Rare Beef'],['brisket','Well Done Brisket','pho-well-done-brisket','P3. Phở – Well Done Brisket'],['balls','Beef Balls','pho-beef-balls','P4. Phở – Beef Balls'],['rare-balls','Rare Beef & Beef Balls','pho-rare-beef-balls','P5. Phở – Rare Beef & Beef Balls'],['tofu-veg','Tofu & Vegetable','pho-tofu-vegetable','P6. Phở – Tofu & Vegetable'],['chicken','Chicken','pho-chicken','P7. Phở – Chicken']
    ],'Phở option'),
    one('vermicelli','Vermicelli','Vermicelli','Choose your Vietnamese vermicelli combination.',[
      ['chicken-pork','Chicken, Pork & Spring Roll','vermicelli-chicken-pork-spring','V1. Vermicelli – Chicken, Pork & Spring Roll'],['chicken-beef','Chicken, Beef & Spring Roll','vermicelli-chicken-beef-spring','V2. Vermicelli – Chicken, Beef & Spring Roll'],['chicken-sausage','Chicken, Pork Sausage & Spring Roll','vermicelli-chicken-pork-sausage-spring','V3. Vermicelli – Chicken, Pork Sausage & Spring Roll'],['veg-tofu','Tofu, Vegetable & Veg Spring Roll','vermicelli-tofu-vegetable','V4. Vermicelli – Tofu, Vegetable & Veg Spring Roll']
    ],'Vermicelli option'),
    one('rice','Rice Plates','Rice','Choose your Vietnamese rice plate.',[
      ['chicken-pork','Chicken & Pork','rice-chicken-pork','R1. Rice – Chicken & Pork'],['chicken-beef','Chicken & Beef','rice-chicken-beef','R2. Rice – Chicken & Beef'],['chicken-pork-chop','Chicken & Pork Chop','rice-chicken-pork-chop','R3. Rice – Chicken & Pork Chop'],['beef-pork-chop','Beef & Pork Chop','rice-beef-pork-chop','R4. Rice – Beef & Pork Chop'],['shrimp-pork-chop','Shrimp & Pork Chop','rice-shrimp-pork-chop','R5. Rice – Shrimp & Pork Chop'],['crispy-chicken','Crispy Chicken Leg','rice-crispy-chicken-leg','R6. Rice – Crispy Chicken Leg']
    ],'Rice plate'),
    one('summer-rolls','Summer Rolls','Summer Rolls','Choose the filling for your Vietnamese summer rolls.',[
      ['chicken','Chicken','summer-chicken','S1. Summer Rolls – Chicken'],['pork','Pork','summer-pork','S2. Summer Rolls – Pork'],['beef','Beef','summer-beef','S3. Summer Rolls – Beef'],['pork-sausage','Pork Sausage','summer-pork-sausage','S4. Summer Rolls – Pork Sausage'],['shrimp','Shrimp','summer-shrimp','S5. Summer Rolls – Shrimp'],['shrimp-pork','Shrimp & Pork','summer-shrimp-pork','S6. Summer Rolls – Shrimp & Pork'],['veg-tofu','Tofu & Vegetable','summer-tofu-veg','S7. Summer Rolls – Tofu & Vegetable']
    ],'Filling'),
    one('banh-mi','Bánh Mì','Bánh Mì','Choose your Vietnamese bánh mì filling.',[
      ['special','Viet Nom Nom Special','banhmi-special','B1. Bánh Mì – Viet Nom Nom Special'],['chicken','Chicken','banhmi-chicken','B2. Bánh Mì – Chicken'],['pork','Pork','banhmi-pork','B3. Bánh Mì – Pork'],['beef','Beef','banhmi-beef','B4. Bánh Mì – Beef'],['pork-sausage','Pork Sausage','banhmi-pork-sausage','B5. Bánh Mì – Pork Sausage'],['veg-tofu','Tofu & Vegetable','banhmi-tofu-veg','B6. Bánh Mì – Tofu & Vegetable']
    ],'Bánh Mì filling')
  ];
  const byKey=Object.fromEntries(families.map(f=>[f.key,f]));
  const consumed=new Set(families.flatMap(f=>f.variants.map(v=>v.id)));
  const menuMap=menu=>new Map((menu||[]).map(x=>[String(x.id),x]));
  const itemAvailable=x=>!!(x&&x.active!==false&&!x.soldOut);
  function exactVariant(f,selections={}){return f.variants.find(v=>f.controls.every(c=>String(v.values[c.key])===String(selections[c.key])))||null}
  function decorate(f,v,item){if(!v||!item)return null;return {family:f,variant:v,item:{...item},sourceItem:item,displayName:v.displayName||item.name,description:item.description||f.description,surcharge:0,cartKey:`${item.id}::${v.displayName||item.name}`}}
  function resolve(menu,key,selections={}){const f=byKey[key];if(!f)return null;const mm=menuMap(menu),v=exactVariant(f,selections)||f.variants.find(v=>mm.has(v.id))||f.variants[0];return v&&mm.get(v.id)?decorate(f,v,mm.get(v.id)):null}
  function defaults(menu,key){const f=byKey[key];if(!f)return{};const mm=menuMap(menu),v=f.variants.find(v=>itemAvailable(mm.get(v.id)))||f.variants.find(v=>mm.has(v.id))||f.variants[0];return v?{...v.values}:{}}
  function resolveAvailable(menu,key,selections={}){const f=byKey[key];if(!f)return null;const mm=menuMap(menu),v=exactVariant(f,selections);if(v&&mm.get(v.id))return decorate(f,v,mm.get(v.id));const fallback=f.variants.find(v=>itemAvailable(mm.get(v.id)))||f.variants.find(v=>mm.has(v.id));return fallback&&mm.get(fallback.id)?decorate(f,fallback,mm.get(fallback.id)):null}
  function optionState(menu,key,controlKey,selections={}){const f=byKey[key],mm=menuMap(menu);if(!f)return[];const control=f.controls.find(c=>c.key===controlKey);if(!control)return[];return control.options.map(o=>{const v=f.variants.find(v=>String(v.values[controlKey])===String(o.value));return {...o,disabled:!(v&&itemAvailable(mm.get(v.id)))}})}
  function build(menu){const mm=menuMap(menu),index=new Map((menu||[]).map((x,i)=>[String(x.id),i])),entries=[];for(const f of families){const present=f.variants.filter(v=>mm.has(v.id));if(!present.length)continue;const idx=Math.min(...present.map(v=>index.get(v.id)??99999)),available=present.map(v=>mm.get(v.id)).filter(x=>x&&x.active!==false),prices=available.map(x=>Number(x.price||0));entries.push({kind:'family',key:f.key,title:f.title,category:f.category,description:f.description,index:idx,soldOut:available.length===0||available.every(x=>x.soldOut),priceMin:prices.length?Math.min(...prices):0,priceMax:prices.length?Math.max(...prices):0,searchText:[f.title,f.category,f.description,...f.controls.flatMap(c=>c.options.map(o=>o.label))].join(' ').toLowerCase()})}(menu||[]).forEach((x,i)=>{if(!consumed.has(String(x.id)))entries.push({kind:'item',item:x,index:i,title:x.name,category:x.category,description:x.description||'',soldOut:!!x.soldOut,searchText:`${x.name} ${x.category} ${x.description||''}`.toLowerCase()})});return entries.sort((a,b)=>a.index-b.index)}
  function family(key){return byKey[key]||null}
  function priceLabel(entry){if(!entry||entry.kind!=='family')return'';const a=Number(entry.priceMin||0),b=Number(entry.priceMax||0);return Math.abs(a-b)<.001?`$${a.toFixed(2)}`:`$${a.toFixed(2)}–$${b.toFixed(2)}`}
  window.VietNomNomMenuVariants={families,family,build,resolve,resolveAvailable,defaults,optionState,priceLabel,consumedIds:consumed};
})();
