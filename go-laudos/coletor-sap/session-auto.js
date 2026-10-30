// Session maintenance shares the collector's lease and never rotates windows.
const SESSION_HOME='https://s4.sipal.com.br/sap/bc/ui2/flp#Shell-home';
let sessionFlight=null;
async function sessionConfig(){
 const {sessionEnabled=false,sessionAccount=''}=await chrome.storage.local.get(['sessionEnabled','sessionAccount']);
 return {sessionEnabled,sessionAccount};
}
function sessionTick(manual=false){
 if(sessionFlight)return sessionFlight;
 sessionFlight=withLeaseLock(()=>sessionTickLocked(manual)).finally(()=>{sessionFlight=null});return sessionFlight;
}
async function sessionTickLocked(manual){
 const cfg=await sessionConfig();
 if(!cfg.sessionEnabled&&!manual)return;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.sessionAccount))throw Error('Salve o e-mail Microsoft antes de iniciar a sessão automática.');
 const {robotRun:prior,sessionTabId,sessionBlocked}=await chrome.storage.local.get(['robotRun','sessionTabId','sessionBlocked']);
 if(sessionBlocked&&!manual)return;
 if(prior&&!['done','attention','stopped'].includes(prior.phase)){
  if(prior.mode==='login'&&prior.sessionMaintenance&&Date.now()-prior.startedAt>180000){
   prior.phase='attention';prior.message='Login não concluído em 3 minutos. Confira a aba Microsoft e use Verificar sessão para retomar.';
   await chrome.storage.local.set({robotRun:prior,sessionBlocked:true,sessionStatus:prior.message});
   if(!manual)return {ok:false,error:prior.message};
  }else return {ok:false,error:'Há uma execução em andamento. A manutenção não interrompe a coleta.'};
 }
 if(prior?.tabId){
  const key='capture:'+prior.tabId;const capture=(await chrome.storage.local.get(key))[key];
  if(Object.keys(capture?.pending||{}).length)return {ok:false,error:'Há dados de coleta aguardando envio. A sessão auxiliar aguardará o envio terminar.'};
 }
 const lease=await getSapLease();
 if(lease&&lease.tabId!==sessionTabId)return {ok:false,error:'Aba de coleta reservada. Pare o robô antes de verificar a sessão separadamente.'};
 let tab;
 if(Number.isInteger(sessionTabId)){try{tab=await chrome.tabs.get(sessionTabId);}catch{}}
 if(tab&&!/^https:\/\/(s4\.sipal\.com\.br|login\.microsoftonline\.com)\//.test(tab.url||'')){
  await chrome.storage.local.set({sessionBlocked:true,sessionStatus:'A aba de sessão foi usada para outra página. Nenhuma navegação foi feita.'});
  return {ok:false,error:'A aba de sessão foi alterada. Feche essa aba e tente novamente.'};
 }
 if(!tab)tab=await chrome.tabs.create({url:SESSION_HOME,active:false});
 const owner={mode:'login',tabId:tab.id,token:crypto.randomUUID(),createdAt:Date.now()};
 const run={mode:'login',sessionMaintenance:true,leaseToken:owner.token,tabId:tab.id,sessionId:crypto.randomUUID(),startedAt:Date.now(),phase:'waiting',message:'Verificando sessão SAP na aba auxiliar.'};
 await chrome.storage.session.set({sapLease:owner});
 await chrome.storage.local.set({robotRun:run,sessionTabId:tab.id,sessionBlocked:false,sessionStatus:run.message});
 // Resume a pending Microsoft page rather than abandoning MFA or account selection.
 if(tab.url?.startsWith('https://login.microsoftonline.com/')){
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['login.js']});
 }else {await chrome.tabs.update(tab.id,{url:SESSION_HOME,autoDiscardable:false});
  try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['home-search.js']});}catch{}
 }
 return {ok:true};
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='go-session-auto')sessionTick().catch(async error=>{await chrome.storage.local.set({sessionStatus:error.message,sessionBlocked:true});});});
async function armSession(){await chrome.alarms.create('go-session-auto',{periodInMinutes:4});}
chrome.runtime.onStartup.addListener(armSession);chrome.runtime.onInstalled.addListener(armSession);
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg.type==='session-home-done'){
  (async()=>{
   const {robotRun:run}=await chrome.storage.local.get('robotRun');
   if(sender.frameId!==0||!sender.url?.startsWith('https://s4.sipal.com.br/')||!run?.sessionMaintenance||run.tabId!==sender.tab?.id||run.sessionId!==msg.sessionId||!await ownsSapTab(run.tabId,run.leaseToken)||['done','attention','stopped'].includes(run.phase))return {ok:false};
   run.phase='done';run.message='SAP acessível; lupa acionada uma vez. Renovação da sessão no servidor não comprovada.';
   await chrome.storage.local.set({robotRun:run,sessionStatus:run.message});await releaseSapTab(run.tabId);return {ok:true};
  })().then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
 }
 if(!['session-settings','session-check','session-info'].includes(msg.type))return;
 if(sender.tab||sender.id!==chrome.runtime.id)return;
 (async()=>{
  if(msg.type==='session-settings'){
   const account=String(msg.account||'').trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account))throw Error('Informe um e-mail válido.');
   await chrome.storage.local.set({sessionAccount:account,sessionEnabled:msg.enabled===true,sessionBlocked:false});await armSession();
  }
  if(msg.type==='session-check')return sessionTick(true);
  return {...await sessionConfig(),...await chrome.storage.local.get(['sessionStatus','sessionBlocked'])};
 })().then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
});
