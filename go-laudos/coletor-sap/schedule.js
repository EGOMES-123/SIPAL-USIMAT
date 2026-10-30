const SAP_URL='https://s4.sipal.com.br/sap/bc/ui2/flp#SPROAGBL_MONITOR_RECEBIMENTO-display';
const PANEL_URL='https://go-laudos.netlify.app';
function nextRobotTime(now=Date.now()){
 for(let t=Math.floor(now/60000)*60000+60000;t<=now+26*3600000;t+=60000){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Cuiaba',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));
  const h=Number(p.find(x=>x.type==='hour').value),m=Number(p.find(x=>x.type==='minute').value);
  if(m===0&&[7,9,13,15].includes(h))return t;
 }throw Error('Não foi possível calcular o próximo horário.');
}
async function armRobot(){await chrome.alarms.create('sap-watchdog',{periodInMinutes:1});await chrome.alarms.create('sap-relay',{periodInMinutes:1});await chrome.alarms.clear('sap-receipts');}
async function beginRobot(tabId=null,mode='collect',expectedTotal=null){return withLeaseLock(()=>beginRobotLocked(tabId,mode,expectedTotal));}
async function beginRobotLocked(tabId=null,mode='collect',expectedTotal=null){
 const {robotRun:prior}=await chrome.storage.local.get('robotRun');
 if(mode==='collect'&&prior?.sessionMaintenance&&!['done','attention','stopped'].includes(prior.phase)){
  prior.phase='stopped';prior.message='Manutenção de sessão suspensa para iniciar a coleta.';
  await chrome.storage.local.set({robotRun:prior});
  const held=await getSapLease();if(held?.tabId===prior.tabId)await chrome.storage.session.remove('sapLease');
 }
 let lease=await getSapLease();
 if(lease&&lease.tabId!==tabId&&prior?.tabId===lease.tabId&&(['done','attention','stopped'].includes(prior.phase)||Date.now()-prior.startedAt>=90*60000)){
  const key='capture:'+prior.tabId;const capture=(await chrome.storage.local.get(key))[key];
  if(capture?.state&&Object.keys(capture.pending||{}).length){await relay(capture,prior.tabId,key,true);if(Object.keys(capture.pending||{}).length)throw Error('O envio anterior ainda tem dados pendentes. Mantenha o painel aberto.');}
  await chrome.storage.session.remove('sapLease');lease=null;
 }
 if(lease&&lease.tabId!==tabId){try{await chrome.tabs.get(lease.tabId);}catch{await chrome.storage.session.remove('sapLease');}if(await getSapLease())throw Error('Outra aba já está reservada. Use Parar robô / liberar aba antes de iniciar.');}
 if(prior&&!['done','attention','stopped'].includes(prior.phase)&&Date.now()-prior.startedAt<90*60000)throw Error('Já existe uma execução em andamento. Use Parar robô antes de iniciar outra.');
 const panels=await chrome.tabs.query({url:PANEL_URL+'/*'});if(!panels.length)await chrome.tabs.create({url:PANEL_URL,active:false});
 let tab;if(tabId!==null){tab=await chrome.tabs.get(tabId);if(!tab.url?.startsWith('https://s4.sipal.com.br/'))throw Error('Abra a tabela do SAP para usar esta opção.');}else tab=await chrome.tabs.create({url:SAP_URL,active:mode==='login'});
 try{await chrome.tabs.update(tab.id,{autoDiscardable:false});}catch{}
 const owner={mode,tabId:tab.id,token:crypto.randomUUID(),createdAt:Date.now()};await chrome.storage.session.set({sapLease:owner});
 const run={expectedTotal:Number.isInteger(expectedTotal)&&expectedTotal>0&&expectedTotal<=1000000?expectedTotal:null,mode,leaseToken:owner.token,tabId:tab.id,owned:tabId===null,sessionId:crypto.randomUUID(),startedAt:Date.now(),phase:'waiting',message:'Aguardando login e carregamento da consulta.'};
 await chrome.storage.local.set({robotRun:run,['capture:'+tab.id]:{sessionId:run.sessionId,state:null,pending:{}}});
 // A newly created tab may have finished loading before its run was registered.
 try{await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>{globalThis.sapStopRobotRunner?.();globalThis.sapReceiptTracker?.stop();}});await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['selection.js','collector.js','auto-scroll.js','runner.js']});}catch{}
 return run;
}
chrome.alarms.onAlarm.addListener(async alarm=>{
 if(alarm.name==='sap-watchdog'){await monitorRobotSession().catch(()=>{});}
 if(alarm.name==='sap-receipts'){
  try{const {robotEnabled}=await chrome.storage.local.get('robotEnabled');if(robotEnabled)await beginRobot();}catch(e){await chrome.storage.local.set({robotScheduleMessage:e.message});}finally{await armRobot();}
 }
 if(alarm.name==='sap-relay'){
  queue=queue.catch(()=>{}).then(async()=>{const {robotRun}=await chrome.storage.local.get('robotRun');if(!robotRun)return;const key='capture:'+robotRun.tabId;const current=(await chrome.storage.local.get(key))[key];if(current?.state)await relay(current,robotRun.tabId,key,true);});
 }
});
chrome.runtime.onStartup.addListener(armRobot);
chrome.runtime.onInstalled.addListener(()=>{armRobot();chrome.alarms.create('sap-relay',{periodInMinutes:1});});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!['robot-config','robot-progress','robot-status','robot-enable','robot-start','robot-current','robot-stop','robot-login-test'].includes(msg.type))return;
 (async()=>{
  const state=await chrome.storage.local.get(['robotRun','robotEnabled','robotScheduleMessage']);const run=state.robotRun;
  if(msg.type==='robot-config')return { ...run,account:(await chrome.storage.local.get('sessionAccount')).sessionAccount||'eduardo.gomes@sipal.com.br',active:run?.tabId===sender.tab?.id&&!['done','attention','stopped'].includes(run?.phase)&&await ownsSapTab(sender.tab?.id,run?.leaseToken)};
  if(msg.type==='robot-progress'){
   if(run?.tabId!==sender.tab?.id||!await ownsSapTab(sender.tab?.id,run?.leaseToken)||!/^https:\/\/(s4\.sipal\.com\.br|login\.microsoftonline\.com)\//.test(sender.url||''))return {ignored:true};
   if(msg.phase==='waiting'&&run.phase==='reading')return {ignored:true};
   if(['done','attention','stopped'].includes(run.phase))return {ignored:true};
   if(msg.sessionId&&msg.sessionId!==run.sessionId)return {ignored:true};
   run.phase=msg.phase;run.message=String(msg.message||'').slice(0,330);run.updatedAt=Date.now();await chrome.storage.local.set({robotRun:run});return {ok:true};
  }
  // Control commands come only from the extension's own popup, never a web page.
  if(sender.tab)return {error:'Comando indisponível nesta página.'};
  if(msg.type==='robot-enable')return {error:'Selecione os horários no painel GO - LAUDOS.'};
  if(msg.type==='robot-login-test')return await beginRobot(null,'login');
  if(msg.type==='robot-start'||msg.type==='robot-current')return await beginRobot(msg.type==='robot-current'?msg.tabId:null,'collect',msg.type==='robot-current'?msg.expectedTotal:null);
  if(msg.type==='robot-stop'){await releaseSapTab();if(run){run.phase='stopped';run.message='Robô parado. Dados já lidos foram preservados.';await chrome.storage.local.set({robotRun:run});}return {ok:true};}
  return {...state,lease:await getSapLease(),next:(await chrome.alarms.get('sap-receipts'))?.scheduledTime};
 })().then(reply).catch(e=>reply({error:e.message}));return true;
});
if(typeof module!=='undefined')module.exports={nextRobotTime};

// The panel can start the fixed, authorized SAP workflow and read sanitized progress only.
async function panelRobotStatus(){
 const {robotRun:run}=await chrome.storage.local.get('robotRun');
 if(!run)return {ok:true,phase:'idle',message:'Pronto para sincronizar.',count:0,pending:0};
 // Finalize stale jobs even if the tab or session lease was lost.
 if(!['done','attention','stopped'].includes(run.phase)&&Date.now()-run.startedAt>=90*60000){run.phase='attention';run.message='Execução encerrada após 90 minutos sem conclusão. Dados preservados. Clique em Sincronizar para tentar novamente.';await chrome.storage.local.set({robotRun:run});}
 const key='capture:'+run.tabId;const capture=(await chrome.storage.local.get(key))[key];const count=Object.keys(capture?.state?.rowsByKey||{}).length,pending=Object.keys(capture?.pending||{}).length;
 const busy=(!['done','attention','stopped'].includes(run.phase))&&Date.now()-run.startedAt<90*60000;
 if(run.mode==='login')return {ok:true,phase:busy?'busy':'idle',message:busy?'Há um teste de login em andamento. Aguarde ou pare pela extensão.':'Teste de login encerrado. Pronto para iniciar a sincronização.',count:0,pending:0,busy};
 return {ok:true,phase:run.phase,busy,background:true,startedAt:run.startedAt,message:run.message,count,pending,lastReceivedAt:capture?.sync?.receivedAt||null,syncError:capture?.sync?.ok===false?capture.sync.message:null,complete:run.phase==='done'&&pending===0&&(run.emptyConfirmed===true||count>0&&capture?.sync?.ok===true)};
}
async function beginPanelRobot(){return withLeaseLock(async()=>{
 const {robotRun:prior}=await chrome.storage.local.get('robotRun');let lease=await getSapLease();
 if(prior?.sessionMaintenance&&!['done','attention','stopped'].includes(prior.phase)){
  prior.phase='stopped';prior.message='Manutenção suspensa para iniciar sincronização.';await chrome.storage.local.set({robotRun:prior});
  if(lease?.tabId===prior.tabId){await chrome.storage.session.remove('sapLease');lease=null;}
 }
 if(prior&&!['done','attention','stopped'].includes(prior.phase)&&Date.now()-prior.startedAt<90*60000)return panelRobotStatus();
 if(lease&&prior?.tabId===lease.tabId){
  const key='capture:'+prior.tabId;const capture=(await chrome.storage.local.get(key))[key];
  if(capture?.state&&Object.keys(capture.pending||{}).length){await relay(capture,prior.tabId,key,true);if(Object.keys(capture.pending||{}).length)throw Error('O envio anterior ainda tem dados pendentes. Mantenha o painel conectado e tente novamente.');}
  await chrome.storage.session.remove('sapLease');
 }
 await beginRobotLocked(null,'collect');
 // The panel stays in front: never activate or focus the robot tab.
 return panelRobotStatus();
});}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!['panel-start','panel-status'].includes(msg.type))return;
 if(sender.id!==chrome.runtime.id||!sender.tab||sender.frameId!==0||!sender.url?.startsWith(PANEL_URL+'/')){reply({error:'Comando recusado: origem diferente do painel autorizado.'});return;}
 (msg.type==='panel-start'?beginPanelRobot():panelRobotStatus()).then(reply).catch(e=>reply({error:e.message}));return true;
});

chrome.runtime.onInstalled.addListener(async()=>{
 const {robotRun:run}=await chrome.storage.local.get('robotRun');
 if(run?.monthly){run.phase='stopped';run.message='Consulta mensal encerrada. Próxima sincronização: 01.01.2026 até ontem. Dados preservados.';delete run.monthly;await chrome.storage.local.set({robotRun:run});}
});
