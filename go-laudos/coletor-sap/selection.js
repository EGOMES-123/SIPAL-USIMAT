function sapYesterday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=k=>Number(parts.find(p=>p.type===k).value);const d=new Date(Date.UTC(get('year'),get('month')-1,get('day')-1));
 return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${d.getUTCFullYear()}`;
}
async function sapFillSelection(){
 if(location.hostname!=='s4.sipal.com.br')return {ok:false,message:'Abra a seleção do monitor SAP.'};
 const permit=await chrome.runtime.sendMessage({type:'tab-authorize'}).catch(()=>null);
 if(permit?.allowed&&permit.mode==='login')return {ok:false,message:'Teste de login: consulta bloqueada.'};
 if(!permit?.allowed)return {ok:false,message:'Aba de conferência: preenchimento e execução bloqueados. Selecione uma única aba pela extensão.'};
 const run=await chrome.runtime.sendMessage({type:'robot-config'}).catch(()=>null);
 if(run?.active&&run.mode==='login')return {ok:false,message:'Teste de login: nenhum filtro será alterado e nenhuma consulta será executada.'};
 const fields=[...document.querySelectorAll('input[type="text"],input:not([type])')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'});
 const find=(sid)=>fields.filter(e=>{try{const has=value=>value&&typeof value==='object'&&(value.SID===sid||Object.values(value).some(v=>typeof v==='object'&&has(v)));return has(JSON.parse(e.getAttribute('lsdata')||'{}'))}catch{return false}});
 const definitions=[
 ['wnd[0]/usr/ctxtS_WERKS-LOW','1301'],
 ['wnd[0]/usr/ctxtS_WERKS-HIGH',''],
 ['wnd[0]/usr/ctxtS_DATA-LOW','01.01.2026'],
 ['wnd[0]/usr/ctxtS_DATA-HIGH',sapYesterday()],
 ['wnd[0]/usr/ctxtP_VAR','EGOMES']
 ];
 const targets=[];
 for(const [sid,value]of definitions){const matches=find(sid);if(matches.length!==1||matches[0].disabled||matches[0].readOnly)return {ok:false,message:'Campo SAP não encontrado ou indisponível: '+sid+'. Nenhum filtro foi preenchido.'};targets.push([matches[0],value]);}
 if(new Set(targets.map(x=>x[0])).size!==5)return {ok:false,message:'Campos ambíguos. Nenhum filtro foi preenchido.'};
 if(!(await chrome.runtime.sendMessage({type:'tab-authorize'}))?.allowed)return {ok:false,message:'Reserva da aba liberada. Operação cancelada.'};
 const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
 const signature=definitions.map(x=>x.join('=')).join('|');
 const pending=targets.filter(([field,value])=>field.value.replace(/[./-]/g,'')!==value.replace(/[./-]/g,''));
 for(const [field,value]of pending){field.focus();set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.blur();}
 if(pending.length||globalThis.sapCommittedFilters?.signature!==signature){globalThis.sapCommittedFilters={signature,at:Date.now()};return {ok:false,retryable:true,message:'Filtros preenchidos. Aguardando o SAP confirmar os campos antes de Executar.'};}
 if(Date.now()-globalThis.sapCommittedFilters.at<1800)return {ok:false,retryable:true,message:'Aguardando estabilização dos filtros no SAP.'};
 const ok=targets.every(([field,value])=>field.value.replace(/[./-]/g,'')===value.replace(/[./-]/g,''));
 if(!ok)return {ok:false,message:'O SAP não confirmou todos os valores. A consulta não foi executada.'};
 try{
  const result=await chrome.runtime.sendMessage({type:'execute-query'});
  return {ok:result?.clicked===true,clicked:result?.clicked===true,retryable:result?.retryable!==false,message:result?.message||'Aguardando confirmação do botão Executar.'};
 }catch{return {ok:false,retryable:true,message:'Filtros preenchidos. Aguardando confirmação do Executar.'};}

}
globalThis.sapFillSelection=sapFillSelection;
if(typeof module!=='undefined')module.exports={sapYesterday,sapFillSelection};
if(typeof document!=='undefined'&&location.hostname==='s4.sipal.com.br'){
 globalThis.sapSelectionStop?.();
 let done=false,busy=false,readySince=null,lastMessage='',timer;
 const stop=()=>{done=true;clearInterval(timer);};
 const tryFill=async()=>{
  if(done||busy)return;busy=true;
  try{
   const run=await chrome.runtime.sendMessage({type:'robot-config'}).catch(()=>null);
   if(!run?.active||run.mode==='login')return;
   if(['sent','confirmed','dispatching'].includes(run.queryExecuteState)){
    const evidence=await chrome.runtime.sendMessage({type:'check-query'});
    if(evidence?.tableReady){stop();return;}
    if(evidence?.fatal){await chrome.runtime.sendMessage({type:'robot-progress',sessionId:run.sessionId,phase:'attention',message:evidence.message});stop();return;}
    if(evidence?.message!==lastMessage){lastMessage=evidence?.message;await chrome.runtime.sendMessage({type:'robot-progress',sessionId:run.sessionId,phase:'waiting',message:evidence.message});}
    return;
   }
   // Retry only before dispatch. Never click again while a confirmed query loads.
   const result=await sapFillSelection();
   if(result.ok){await chrome.runtime.sendMessage({type:'robot-progress',sessionId:run.sessionId,phase:'waiting',message:result.message});return;}
   if(result.retryable===undefined)return; // Selection screen has not loaded yet.
   readySince??=Date.now();
   const fatal=result.retryable===false||Date.now()-readySince>120000;
   if(result.message!==lastMessage||fatal){lastMessage=result.message;await chrome.runtime.sendMessage({type:'robot-progress',sessionId:run.sessionId,phase:fatal?'attention':'waiting',message:fatal?result.message+' A execução automática foi pausada; confira o botão no SAP.':result.message});}
   if(fatal)stop();
  }finally{busy=false;}
 };
 globalThis.sapSelectionTick=tryFill;globalThis.sapSelectionStop=stop;
 timer=setInterval(()=>tryFill().catch(()=>{}),2000);setTimeout(()=>tryFill().catch(()=>{}),1000);
}
