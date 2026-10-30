function mergeCapture(state,snapshot,now){
 state ||= {schemaVersion:2,source:'Monitor de recebimento',scope:'accumulated_rendered_rows',completeness:'unverified',complete:false,mode:'upsert_only',rowsByKey:{},columns:[],startedAt:now};
 const fields=new Map(state.columns.map(c=>[c.field||c.name,c]));for(const c of snapshot.columns||[])if(c.field)fields.set(c.field,c);state.columns=[...fields.values()];
 for(const raw of snapshot.rows||[]){const r={...raw};if(r.ContrComercial!==undefined){r['Contrato comercial']=r.ContrComercial;delete r.ContrComercial;}if(!/^\d+$/.test(r.Pesagem||''))continue;const key=JSON.stringify([r.Centro||'',r.Pesagem,r.Item||'',r['ID EDC']||'']);const prev=state.rowsByKey[key];state.rowsByKey[key]={data:{...(prev?.data||{}),...r},firstSeenAt:prev?.firstSeenAt||now,lastSeenAt:now};}
 state.capturedAt=now;state.lastVisibleCount=snapshot.rows.length;return state;
}
if(typeof module!=='undefined')module.exports={mergeCapture};
