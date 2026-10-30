function sapExecuteButton(click=false){
 if(location.hostname!=='s4.sipal.com.br')return {count:0};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const blocked=[...document.querySelectorAll('[aria-busy="true"],.sapUiLocalBusyIndicator,.sapUiBusy,.sapUiBlockLayer,[role="progressbar"]')].some(visible);
 if(blocked)return {count:0,busy:true,clicked:false};
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
 const found=[...document.querySelectorAll('button,[role="button"],a[title],a[aria-label],[ct="B"],input[type="submit"],input[type="button"]')].filter(e=>{
  if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true')return false;
  // SAP GUI for HTML can expose Execute only through toolbar metadata.
  let meta={};try{meta=JSON.parse(e.getAttribute('lsdata')||'{}')}catch{}
  const executeSid=value=>value&&typeof value==='object'&&Object.values(value).some(v=>
   typeof v==='string'?/^wnd\[0\]\/tbar\[1\]\/btn\[8\]$/.test(v):executeSid(v));
  const labels=[e.getAttribute('title'),e.getAttribute('aria-label'),e.querySelector('[id$="-caption"]')?.textContent,e.textContent,e.value];
  return executeSid(meta)||labels.some(v=>/^(?:Executar|Execute)(?:\s*(?:\(\s*F8\s*\)|\[\s*F8\s*\]|-?\s*F8))?$/i.test(norm(v)));
 });
 const buttons=found.filter(parent=>!found.some(child=>child!==parent&&parent.contains(child)));
 if(click&&buttons.length===1){buttons[0].focus?.({preventScroll:true});buttons[0].click();}
 return {count:buttons.length,clicked:click&&buttons.length===1};
}

if(typeof module!=='undefined')module.exports={sapExecuteButton};

// Read progress evidence, never infer a successful SAP request from .click().
function sapQueryEvidence(arm=false){
 if(location.hostname!=='s4.sipal.com.br')return {};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const searching=()=>/buscando\s+contratos?/i.test(document.body?.innerText||'');
 if(arm){
  globalThis.sapQueryEvidenceObserver?.disconnect();
  globalThis.sapQuerySearchSeen=false;
  const observer=new MutationObserver(()=>{if(searching()){globalThis.sapQuerySearchSeen=true;observer.disconnect();}});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  globalThis.sapQueryEvidenceObserver=observer;
 }
 const progress=searching()||globalThis.sapQuerySearchSeen===true;
 const rows=globalThis.sapReceiptCollect?.()?.rows?.length||0;
 if(rows>0)globalThis.sapQueryEvidenceObserver?.disconnect();
 const busy=[...document.querySelectorAll('[aria-busy="true"],.sapUiLocalBusyIndicator,.sapUiBusy,.sapUiBlockLayer,[role="progressbar"]')].some(visible);
 return {searching:searching(),searchSeen:progress,rows,busy,collectorAvailable:typeof globalThis.sapReceiptCollect==='function',gridHeaders:document.querySelectorAll('[role="columnheader"]').length,gridCells:document.querySelectorAll('[role="gridcell"]').length};
}
if(typeof module!=='undefined')module.exports.sapQueryEvidence=sapQueryEvidence;
