importScripts('timer-view.js');
const HOME='https://s4.sipal.com.br/sap/bc/ui2/flp#Shell-home';
let taskQueue=Promise.resolve();
function serial(fn){const result=taskQueue.catch(()=>{}).then(fn);taskQueue=result.catch(()=>{});return result;}
const allowedUrl=url=>/^https:\/\/(s4\.sipal\.com\.br|login\.microsoftonline\.com)\//.test(url||'');
const accountValid=account=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account);
async function settings(){return {account:'',enabled:false,reconnect:true,...await chrome.storage.local.get(['account','enabled','reconnect'])}}
async function saveRun(run){
 const {events=[]}=await chrome.storage.session.get('events');
 if(events[0]?.message!==run.message)events.unshift({time:Date.now(),phase:run.phase,message:run.message});
 await chrome.storage.session.set({sessionRun:run,events:events.slice(0,30)});
 if(typeof updateRefreshBadge==='function')await updateRefreshBadge();return run;
}
async function expireRun(){
 const {sessionRun:run}=await chrome.storage.session.get('sessionRun');
 if(run?.active&&Date.now()-run.startedAt>=180000){run.active=false;run.phase='attention';run.message='Login não concluído em 3 minutos. Confira a aba auxiliar e clique em Verificar sessão para retomar.';await saveRun(run);}
 return run;
}
async function sessionStart(manual=false){return serial(()=>sessionStartLocked(manual));}
async function sessionStartLocked(manual){
 const cfg=await settings();if(!cfg.enabled&&!manual)return {ok:true};
 if(!accountValid(cfg.account))throw Error('Salve um e-mail Microsoft válido antes de verificar a sessão.');
 const prior=await expireRun();
 if(prior?.active)return {ok:true,message:'Verificação já em andamento.'};
 if(prior?.phase==='attention'&&!manual)return {ok:false,error:prior.message};
 const {helperTabId}=await chrome.storage.session.get('helperTabId');let tab;
 if(Number.isInteger(helperTabId)){try{tab=await chrome.tabs.get(helperTabId)}catch{}}
 if(tab&&!allowedUrl(tab.url)){
  await saveRun({active:false,phase:'attention',message:'A aba auxiliar foi usada para outro site. Ela foi preservada. Feche essa aba e clique em Verificar sessão.'});return {ok:false,error:'A aba auxiliar foi alterada e foi preservada.'};
 }
 if(!tab)tab=await chrome.tabs.create({url:HOME,active:false});
 const run={active:true,startRefreshOnReady:manual,mode:'login',sessionMaintenance:true,sessionId:crypto.randomUUID(),tabId:tab.id,startedAt:Date.now(),phase:'waiting',message:'Verificando acesso ao SAP na aba auxiliar.'};
 await chrome.storage.session.set({helperTabId:tab.id});await saveRun(run);
 try{
  if(tab.url?.startsWith('https://login.microsoftonline.com/'))await chrome.scripting.executeScript({target:{tabId:tab.id},files:['login.js']});
  else {await chrome.tabs.update(tab.id,{url:HOME,autoDiscardable:false});try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['home-search.js']});}catch{}}
 }catch{run.active=false;run.phase='attention';run.message='Não foi possível preparar a aba auxiliar. Confira a aba e clique em Verificar sessão.';await saveRun(run);return {ok:false,error:run.message};}
 return {ok:true};
}
async function pauseEverything(){return serial(async()=>{
 await chrome.storage.local.set({enabled:false});const run=await expireRun();
 if(run){run.active=false;run.phase='stopped';run.message='Todas as automações foram pausadas por você.';await saveRun(run);}
 const {refreshState:state}=await chrome.storage.session.get('refreshState');await refreshPause(state||{},'Todas as automações foram pausadas por você.');return {ok:true};
});}
chrome.alarms.onAlarm.addListener(alarm=>{
 if(alarm.name==='sap-session-check')sessionStart().catch(()=>{});
 if(alarm.name==='sap-session-watch')serial(expireRun).catch(()=>{});
});
async function arm(){await chrome.alarms.create('sap-session-check',{periodInMinutes:4});await chrome.alarms.create('sap-session-watch',{periodInMinutes:1});await updateRefreshBadge();}
chrome.runtime.onInstalled.addListener(arm);
chrome.runtime.onStartup.addListener(async()=>{await chrome.storage.local.set({enabled:false});await arm()});
chrome.tabs.onRemoved.addListener(tabId=>{serial(async()=>{const {sessionRun:run}=await chrome.storage.session.get('sessionRun');if(run?.tabId===tabId){run.active=false;run.phase='stopped';run.message='Aba auxiliar fechada. Abra uma nova verificação pelo popup.';await saveRun(run);}}).catch(()=>{});});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(['session-config','session-progress','session-home-done','login-background-click'].includes(msg.type)){
  serial(async()=>{
   const run=await expireRun();
   if(sender.id!==chrome.runtime.id||sender.frameId!==0||!allowedUrl(sender.url)||!run?.active||sender.tab?.id!==run.tabId)return {active:false};
   if(msg.type==='login-background-click')return loginBackgroundClick(msg,sender,run);
   if(msg.type==='session-config')return {...run,account:(await settings()).account};
   if(msg.sessionId&&msg.sessionId!==run.sessionId)return {ok:false};
   if(msg.type==='session-home-done'){
    if(!sender.url.startsWith('https://s4.sipal.com.br/'))return {ok:false};
    run.active=false;run.phase='done';run.message='SAP acessível; lupa acionada uma vez. Renovação no servidor não comprovada.';
   }else{run.phase=msg.phase==='login'?'login':'waiting';run.message=String(msg.message||'').slice(0,330);}
   await saveRun(run);
   if(msg.type==='session-home-done'&&run.startRefreshOnReady)await startRefreshAfterLogin(run);
   return {ok:true};
  }).then(reply).catch(()=>reply({active:false}));return true;
 }
 if(!['settings-save','session-info','session-start','session-open','pause-all','diagnostics'].includes(msg.type))return;
 if(sender.tab||sender.id!==chrome.runtime.id)return;
 (async()=>{
  if(msg.type==='settings-save')return serial(async()=>{const account=String(msg.account||'').trim().toLowerCase();if(!accountValid(account))throw Error('Informe um e-mail válido.');await chrome.storage.local.set({account,enabled:msg.enabled===true,reconnect:msg.reconnect!==false});return {ok:true};});
  if(msg.type==='session-start')return sessionStart(true);
  if(msg.type==='pause-all')return pauseEverything();
  if(msg.type==='session-open'){
   let {helperTabId,sessionRun}=await chrome.storage.session.get(['helperTabId','sessionRun']);if(sessionRun?.reconnect){
    try{const current=await chrome.tabs.get(sessionRun.tabId);if(allowedUrl(current.url)){
     helperTabId=sessionRun.tabId;
     if(!sessionRun.active&&current.url.startsWith('https://login.microsoftonline.com/'))await serial(async()=>{
      sessionRun.active=true;sessionRun.startedAt=Date.now();sessionRun.sessionId=crypto.randomUUID();sessionRun.phase='login';sessionRun.message='Retomando o login solicitado por você.';await saveRun(sessionRun);
      const {refreshState:state}=await chrome.storage.session.get('refreshState');if(state?.tabId===sessionRun.tabId){state.enabled=true;state.recovering=true;await refreshSchedule(state);}
      await chrome.scripting.executeScript({target:{tabId:sessionRun.tabId},files:['login.js']});
     });
    }}catch{}
   }
   if(!Number.isInteger(helperTabId)){await sessionStart(true);helperTabId=(await chrome.storage.session.get('helperTabId')).helperTabId;}
   if(!Number.isInteger(helperTabId))throw Error('Salve o e-mail na aba Sessão para abrir o login.');
   const tab=await chrome.tabs.get(helperTabId);if(!allowedUrl(tab.url))throw Error('A aba auxiliar foi alterada; ela foi preservada.');await chrome.tabs.update(helperTabId,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};
  }
  const run=await serial(expireRun);const cfg=await settings();const {refreshState}=await chrome.storage.session.get('refreshState');
  if(msg.type==='diagnostics')return {version:chrome.runtime.getManifest().version,exportedAt:new Date().toISOString(),automatic:cfg.enabled,accountConfigured:accountValid(cfg.account),reconnectEnabled:cfg.reconnect,session:run?{phase:run.phase,active:run.active,message:run.message,startedAt:run.startedAt}:null,events:(await chrome.storage.session.get('events')).events||[],refresh:refreshState?{enabled:refreshState.enabled,count:refreshState.count,changes:refreshState.changes,nextAt:refreshState.nextAt,message:refreshState.message,tabId:refreshState.tabId,lastProbe:refreshState.lastProbe||null}:null};
  return {settings:cfg,run,refresh:refreshState};
 })().then(reply).catch(error=>reply({error:error.message}));return true;
});
async function recoverSelectedLoginLocked(state,tab){
 const cfg=await settings();
 if(!cfg.reconnect)return refreshPause(state,'Aba redirecionada ao login. Ative Recuperar login na aba Sessão.');
 if(!accountValid(cfg.account))return refreshPause(state,'Login necessário. Clique em Configurar login e salve seu e-mail Microsoft.');
 const prior=await expireRun();
 if(prior?.reconnect&&prior.tabId===tab.id){
  if(!prior.active){state.recovering=false;return refreshPause(state,'Login exige conferência. Clique em Abrir login para continuar e depois em Iniciar.');}
  state.message='Aguardando login Microsoft na própria aba selecionada.';return refreshSchedule(state);
 }
 const run={active:true,reconnect:true,mode:'login',sessionMaintenance:false,sessionId:crypto.randomUUID(),tabId:tab.id,startedAt:Date.now(),phase:'login',message:'Sessão desconectada. Recuperando o login na aba selecionada.'};
 await saveRun(run);state.recovering=true;state.message=run.message;await refreshSchedule(state);
 try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['login.js']});}catch{state.message='Abra o login para concluir a autenticação Microsoft.';await refreshSave(state);}
 return state;
}
async function startRefreshAfterLogin(run){
 const {refreshState:prior}=await chrome.storage.session.get('refreshState');
 if(prior?.enabled)return; // Keep an already selected refresh tab and its running schedule.
 const tab=await chrome.tabs.get(run.tabId);if(!tab.url?.startsWith('https://s4.sipal.com.br/'))return;
 const options=refreshOptions({...prior?.options,minSeconds:prior?.options?.minSeconds||15,maxSeconds:prior?.options?.maxSeconds||15,limit:prior?.options?.limit??0,firstDelaySeconds:0,stopOnChange:prior?.options?.stopOnChange??false});
 const state={enabled:true,tabId:run.tabId,targetUrl:HOME,options,count:0,changes:0,failures:0,hash:null,startedAt:Date.now(),message:'Login concluído. Contagem e atualização iniciadas automaticamente.'};
 await refreshSave(state);
 if(!refreshHome(tab.url))await chrome.tabs.update(run.tabId,{url:HOME});
 try{await chrome.scripting.executeScript({target:{tabId:run.tabId},files:['interaction-guard.js']});}catch{}
 await refreshSchedule(state);
}
importScripts('refresh.js','background-click.js');
