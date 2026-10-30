// Scroll only controls associated with the receipt grid, never a page ancestor.
function sapGridScroll(snapshot,reset=false){
 const root=document.getElementById(snapshot?.gridId);if(!root)return {moved:false,reason:'Tabela indisponível.'};
 const meta=snapshot.gridMeta||{};
 const bars=[...document.querySelectorAll('[ct="SCB"]')].filter(e=>{try{const m=JSON.parse(e.getAttribute('lsdata')||'{}');const linked=m['6']===snapshot.gridId||root.contains(e);const r=e.getBoundingClientRect();return linked&&(m['5']==='VERTICAL'||e.getAttribute('scd')==='VERTICAL')&&r.width>0&&r.height>0}catch{return false}});
 if(bars.length===1){
  const bar=bars[0];
  if(reset){root.focus();const o={key:'Home',code:'Home',keyCode:36,which:36,ctrlKey:true,bubbles:true};root.dispatchEvent(new KeyboardEvent('keydown',o));root.dispatchEvent(new KeyboardEvent('keyup',o));return {moved:false,reset:true,strategy:'SAP',reason:'Retorno ao início solicitado ao controle SAP; cobertura será conferida.'};}
  if(Number.isInteger(meta.firstVisibleRow)&&Number.isInteger(meta.visibleRows)&&Number.isInteger(snapshot.expectedRows)&&meta.firstVisibleRow+meta.visibleRows>=snapshot.expectedRows)return {moved:false,atEnd:true,strategy:'SAP'};
  const track=bar.querySelector('[acf="PNext"]'),next=bar.querySelector('[acf="Nxt"]');
  const target=track||next;if(target&&target.getAttribute('aria-disabled')!=='true'){
   const r=target.getBoundingClientRect();if(r.width&&r.height){const o={bubbles:true,clientX:r.x+r.width/2,clientY:track?r.bottom-2:r.y+r.height/2,button:0};target.dispatchEvent(new MouseEvent('mousedown',o));target.dispatchEvent(new MouseEvent('mouseup',o));target.dispatchEvent(new MouseEvent('click',o));return {moved:true,attempted:true,strategy:'SAP'};}
  }
  return {moved:false,strategy:'SAP',reason:'Controle vertical SAP identificado, mas não avançou. Captura incompleta.'};
 }
 const candidates=[root,...root.querySelectorAll('div')];
 const viable=candidates.filter(e=>{const r=e.getBoundingClientRect();return r.width>30&&r.height>30&&e.scrollHeight>e.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&!!e.querySelector('[role="gridcell"]')});
 viable.sort((a,b)=>a.clientHeight-b.clientHeight);const el=viable[0];
 if(!el){if(Number.isInteger(snapshot.expectedRows)&&snapshot.expectedRows<=snapshot.rows.length)return {moved:false,atEnd:true,strategy:'tabela sem rolagem'};return {moved:false,reason:'Não identifiquei a barra vertical da tabela. A rolagem da página não será usada.'};}
 const before=el.scrollTop;el.scrollTop=reset?0:Math.min(el.scrollHeight-el.clientHeight,before+Math.max(25,Math.floor(el.clientHeight*.65)));el.dispatchEvent(new Event('scroll',{bubbles:true}));
 return {moved:Math.abs(el.scrollTop-before)>1,atEnd:el.scrollTop+el.clientHeight>=el.scrollHeight-3,reset,strategy:'tabela nativa'};
}
globalThis.sapGridScroll=sapGridScroll;
if(typeof module!=='undefined')module.exports={sapGridScroll};
