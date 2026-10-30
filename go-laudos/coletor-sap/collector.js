function collect(){
 if(location.hostname!=='s4.sipal.com.br')return null;
 const headers=[...document.querySelectorAll('[role="columnheader"]')].filter(e=>/^grid#.+#0,\d+$/.test(e.id));
 const groups=new Map();
 for(const h of headers){const m=h.id.match(/^(grid#.+)#0,(\d+)$/);if(!groups.has(m[1]))groups.set(m[1],[]);groups.get(m[1]).push([Number(m[2]),h]);}
 for(const [prefix,cols]of groups){
  const map=cols.map(([c,h])=>{let meta={};try{meta=JSON.parse(h.getAttribute('lsdata')||'{}')}catch{}let name=h.querySelector('[id$="#cp1"]')?.textContent?.trim()||h.textContent.trim().split('\n')[0];const sid=meta['17']?.SID||'';return {c,name,sid}});
  const weighing=map.find(x=>x.sid.endsWith('/colNR_PESAGEM')||/^Pesagem$/i.test(x.name));if(!weighing)continue;
  const rows=new Map();
  for(const cell of document.querySelectorAll('[role="gridcell"]')){if(!cell.id.startsWith(prefix+'#'))continue;const m=cell.id.slice(prefix.length).match(/^#(\d+),(\d+)$/);if(!m)continue;const r=Number(m[1]),c=Number(m[2]);if(!r)continue;if(!rows.has(r))rows.set(r,{});const col=map.find(x=>x.c===c);if(!col)continue;const field=cell.querySelector('[id$="#if"]');let meta={};try{meta=JSON.parse(field?.getAttribute('lsdata')||'{}')}catch{}let value=meta['5']??field?.value??field?.textContent?.trim()??cell.textContent.trim();const image=cell.querySelector('[role="img"][title], [title]');if(col.name.toLowerCase().startsWith('stat'))value=image?.getAttribute('title')||value;rows.get(r)[col.name||`Coluna ${c}`]=String(value);}
  const records=[...rows.values()].filter(r=>/^\d+$/.test(r[weighing.name]||''));
  return {schemaVersion:1,gridId:prefix.slice(5),expectedRows:(()=>{try{const m=JSON.parse(document.getElementById(prefix.slice(5))?.getAttribute('lsdata')||'{}');const n=Object.values(m).find(x=>x&&typeof x==='object'&&x.Type==='GuiGridView')?.totalRows;return Number.isInteger(n)&&n>=0?n:null}catch{return null}})(),gridMeta:(()=>{try{const m=JSON.parse(document.getElementById(prefix.slice(5))?.getAttribute('lsdata')||'{}');const g=Object.values(m).find(x=>x&&typeof x==='object'&&x.Type==='GuiGridView')||{};return {firstVisibleRow:g.firstVisibleRow,visibleRows:g.visibleRows}}catch{return {}}})(),rowPositions:[...rows.entries()].filter(([pos,row])=>/^\d+$/.test(row[weighing.name]||'')).map(([pos])=>pos),capturedAt:new Date().toISOString(),source:'Monitor de recebimento',scope:'rendered_rows_only',completeness:'unverified',columns:map.map(x=>({name:x.name,field:x.sid.split('/col')[1]||null})),rows:records};
 }
 return null;
}

globalThis.sapReceiptCollect = collect;
