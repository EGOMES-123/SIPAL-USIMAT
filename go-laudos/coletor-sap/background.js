importScripts('merge.js','execute.js','guard.js');
const executeLocks=new Map();
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg.type==='execute-query'){
  if(!sender.tab||!sender.url?.startsWith('https://s4.sipal.com.br/')){reply({clicked:false,retryable:false,message:'Origem da execução inválida.'});return;}
  const id=sender.tab.id;
  withLeaseLock(async()=>{
   const lease=await getSapLease();
   if(!lease||lease.tabId!==id||lease.mode==='login')return {clicked:false,retryable:false,message:'Esta aba não está autorizada para executar a consulta.'};
   const {robotRun:run}=await chrome.storage.local.get('robotRun');
   const active=run?.tabId===id&&run.mode==='collect'&&!['done','attention','stopped'].includes(run.phase);
   if(active&&['sent','confirmed'].includes(run.queryExecuteState))return {clicked:true,alreadySent:true,message:run.queryExecuteState==='confirmed'?'Consulta confirmada pelo SAP. Aguardando pesagens.':'Clique já enviado. Aguardando confirmação do SAP.'};
   if(active&&run.queryExecuteState==='dispatching')return {clicked:false,retryable:false,message:'O envio anterior do Executar ficou sem confirmação. Confira a aba reservada antes de iniciar novamente.'};
   if(Date.now()-(executeLocks.get(id)||0)<3000)return {clicked:false,retryable:true,message:'Aguardando o botão Executar ficar disponível.'};
   executeLocks.set(id,Date.now());
   const results=await chrome.scripting.executeScript({target:{tabId:id,allFrames:true},func:sapExecuteButton,args:[false]});
   const matches=results.filter(x=>x.result?.count);
   if(results.some(x=>x.result?.busy))return {clicked:false,retryable:true,message:'SAP ocupado. Aguardando o carregamento terminar antes de clicar em Executar.'};
   if(!matches.length)return {clicked:false,retryable:true,message:'Filtros preenchidos. Aguardando o botão Executar habilitado no SAP.'};
   if(matches.length!==1||matches[0].result.count!==1)return {clicked:false,retryable:false,message:'Mais de um botão Executar encontrado. Confira a aba reservada; nenhum clique foi enviado.'};
   if(!await ownsSapTab(id,lease.token))return {clicked:false,retryable:false,message:'A reserva da aba foi liberada. Execução cancelada.'};
   await chrome.scripting.executeScript({target:{tabId:id,allFrames:true},func:sapQueryEvidence,args:[true]});
   if(active){run.queryExecuteState='dispatching';run.queryExecutedAt=Date.now();run.message='Acionando Executar no SAP.';await chrome.storage.local.set({robotRun:run});}
   let done;
   try{done=await chrome.scripting.executeScript({target:{tabId:id,frameIds:[matches[0].frameId]},func:sapExecuteButton,args:[true]});}
   catch{return {clicked:false,retryable:false,message:'Não foi possível confirmar o clique em Executar. Confira a aba reservada para evitar repetir a consulta.'};}
   const clicked=!!done[0]?.result?.clicked;
   if(active){const {robotRun:latest}=await chrome.storage.local.get('robotRun');if(latest?.sessionId===run.sessionId){latest.queryExecuteState=clicked?'sent':null;latest.queryExecutedAt=clicked?Date.now():null;latest.message=clicked?'Clique enviado. Aguardando a mensagem Buscando contratos ou a tabela de pesagens.':'O botão Executar mudou antes do clique. Aguardando disponibilidade.';await chrome.storage.local.set({robotRun:latest});}}
   return {clicked,retryable:!clicked,message:clicked?'Clique enviado. Aguardando a mensagem Buscando contratos ou a tabela de pesagens.':'O botão mudou antes do clique. Tentando novamente quando estiver disponível.'};
  }).then(reply).catch(e=>reply({clicked:false,retryable:true,message:'Falha ao localizar Executar: '+e.message}));return true;
 }

 if(msg.type==='check-query'){
  const id=sender.tab?.id;
  (async()=>{
   if(!id||!sender.url?.startsWith('https://s4.sipal.com.br/')||!await ownsSapTab(id))return {fatal:true,message:'Aba não autorizada.'};
   const {robotRun:run}=await chrome.storage.local.get('robotRun');if(run?.tabId!==id)return {fatal:true,message:'Execução encerrada.'};
   const evidence=await chrome.scripting.executeScript({target:{tabId:id,allFrames:true},func:sapQueryEvidence,args:[false]});
   const searching=evidence.some(x=>x.result?.searching||x.result?.searchSeen),table=evidence.some(x=>x.result?.rows>0),busy=evidence.some(x=>x.result?.busy);
   const waiting=Date.now()-(run.queryExecutedAt||Date.now());
   if(!table&&waiting>10*60000)return {fatal:true,message:'O SAP não disponibilizou pesagens legíveis em 10 minutos. Confira a aba reservada e envie o Diagnóstico. A consulta não será repetida automaticamente.'};
   if(searching||table||run.queryExecuteState==='confirmed'){
    const message=table?'Tabela de pesagens recebida. Iniciando captura.':'Consulta recebida pelo SAP; aguardando pesagens legíveis ('+Math.floor(waiting/1000)+' s).';
    const {robotRun:latest}=await chrome.storage.local.get('robotRun');
    if(latest?.sessionId===run.sessionId&&!['done','attention','stopped'].includes(latest.phase)){latest.queryExecuteState='confirmed';latest.queryConfirmedBy=table?'pesagens':'buscando-contratos';latest.message=message;await chrome.storage.local.set({robotRun:latest});}
    return {confirmed:true,tableReady:table,message};
   }
   const elapsed=Date.now()-(run.queryExecutedAt||Date.now());
   if(elapsed>45000&&!busy)return {fatal:true,message:'O clique foi enviado, mas o SAP não confirmou Buscando contratos nem gerou a tabela. Abra Diagnóstico na extensão; a consulta não será repetida automaticamente.'};
   return {confirmed:false,message:busy?'SAP ocupado após o clique. Aguardando confirmação da consulta.':'Clique enviado. Aguardando confirmação real do SAP.'};
  })().then(reply).catch(e=>reply({confirmed:false,message:'Verificando resposta do SAP: '+e.message}));return true;
 }
 if(msg.type==='execute-diagnostics'){
  if(sender.tab||sender.id!==chrome.runtime.id)return;
  (async()=>{const {robotRun:run}=await chrome.storage.local.get('robotRun');if(!run||!await ownsSapTab(run.tabId))return {error:'Inicie o robô e mantenha a aba reservada aberta.'};const candidates=await chrome.scripting.executeScript({target:{tabId:run.tabId,allFrames:true},func:sapExecuteButton,args:[false]});const evidence=await chrome.scripting.executeScript({target:{tabId:run.tabId,allFrames:true},func:sapQueryEvidence,args:[false]});return {version:chrome.runtime.getManifest().version,phase:run.phase,message:run.message,executeState:run.queryExecuteState||'not-sent',frames:candidates.map(x=>({frameId:x.frameId,...x.result})),evidence:evidence.map(x=>({frameId:x.frameId,...x.result}))};})().then(reply).catch(e=>reply({error:e.message}));return true;
 }

 if(msg.type==='month-empty'){
  (async()=>{const {robotRun:run}=await chrome.storage.local.get('robotRun');if(run?.sessionId!==msg.sessionId||run.tabId!==sender.tab?.id||!await ownsSapTab(run.tabId,run.leaseToken))return {ignored:true};const evidence=await chrome.scripting.executeScript({target:{tabId:run.tabId,allFrames:true},func:()=>({empty:globalThis.sapReceiptCollect?.()?.expectedRows===0})});if(!evidence.some(x=>x.result?.empty))return {error:'SAP não confirmou período vazio.'};run.emptyConfirmed=true;await chrome.storage.local.set({robotRun:run});return {ok:true};})().then(reply).catch(e=>reply({error:e.message}));return true;
 }

if(!['new','snapshot','get','flush'].includes(msg.type))return;
const tabId=sender.tab?.id??msg.tabId;if(!Number.isInteger(tabId))return;const key='capture:'+tabId;queue=queue.catch(()=>{}).then(async()=>{const current=(await chrome.storage.local.get(key))[key];if(msg.type==='new'){if(sender.tab||!await ownsSapTab(tabId)){reply({error:'Esta aba não está reservada para a extensão.'});return;}await chrome.storage.local.set({[key]:{sessionId:msg.sessionId,state:null,pending:{}}});reply({ok:true});}else if(msg.type==='snapshot'){if(!sender.tab||!sender.url?.startsWith('https://s4.sipal.com.br/')||current?.sessionId!==msg.sessionId||!await ownsSapTab(tabId)){reply({ignored:true});return;}current.state=mergeCapture(current.state,msg.snapshot,new Date().toISOString());current.pending ||= {};for(const raw of msg.snapshot.rows||[]){const r={...raw};if(r.ContrComercial!==undefined){r['Contrato comercial']=r.ContrComercial;delete r.ContrComercial;}if(!/^\d+$/.test(r.Pesagem||''))continue;const k=JSON.stringify([r.Centro||'',r.Pesagem,r.Item||'',r['ID EDC']||'']);if(current.sent?.[k]!==JSON.stringify(r))current.pending[k]=r;}await chrome.storage.local.set({[key]:current});await relay(current,tabId,key);reply({ok:true});}else if(msg.type==='flush'){if(current?.state)await relay(current,tabId,key,true);reply({ok:true});}else if(msg.type==='get'){if(!current){reply(null);return;}const {pending,sent,...view}=current;if(msg.summary&&view.state){view.state={rowCount:Object.keys(view.state.rowsByKey).length,lastVisibleCount:view.state.lastVisibleCount,capturedAt:view.state.capturedAt};}view.pendingCount=Object.keys(current.pending||{}).length;reply(view);}}).catch(e=>reply({error:e.message}));return true;});

async function relay(current,tabId,key,force=false){
 const now=Date.now();if(!force&&now-(current.lastAttempt||0)<15000)return;
 const pending=Object.entries(current.pending||{});if(!pending.length)return;current.lastAttempt=now;
 try{
  
  for(let offset=0;offset<pending.length;offset+=500){
   const batch=pending.slice(offset,offset+500);
   const response=await remoteCall('upload',{rows:normalizeCloudRows(batch.map(x=>x[1])),capturedAt:current.state.capturedAt});
   if(!response?.ok)throw Error(response?.error||'Painel não confirmou o envio.');
   current.sent ||= {};for(const [k,r] of batch){current.sent[k]=JSON.stringify(r);delete current.pending[k];}
   current.sync={ok:true,message:'Enviado à nuvem',receivedAt:response.receivedAt,count:response.received};
   await chrome.storage.local.set({[key]:current});
  }
 }catch(e){current.sync={ok:false,message:e.message};}
 await chrome.storage.local.set({[key]:current});
}
importScripts('session-watchdog.js','schedule.js');

importScripts('remote.js','session-auto.js');
function normalizeCloudRows(rows){return rows.map(row=>{const r={...row};for(const k of ['Peso Origem','Peso Entrada','Peso Saída','Peso após Desc','Valor Nota Fiscal'])if(typeof r[k]==='string'&&r[k].includes(',')){const n=Number(r[k].replace(/\./g,'').replace(',','.'));if(!Number.isFinite(n))throw Error('Peso ou valor inválido');r[k]=String(n);}return r;});}
