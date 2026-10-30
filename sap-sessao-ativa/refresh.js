async function updateRefreshBadge(){
 try{
  const {refreshState,sessionRun}=await chrome.storage.session.get(['refreshState','sessionRun']);
  const view=refreshTimerView(refreshState,sessionRun);
  await chrome.action.setBadgeBackgroundColor({color:view.color});
  await chrome.action.setBadgeText({text:view.badge});
  await chrome.action.setTitle({title:'SAP Sessão Ativa · '+view.title});
 }catch{}
}
// Original implementation inspired by refresh/monitor workflows; no third-party extension code.
const REFRESH_ALARM='sap-session-refresh';
function refreshOptions(raw){
 const min=Number(raw.minSeconds),max=Number(raw.maxSeconds),limit=Number(raw.limit);
 if(!Number.isInteger(min)||min<1||min>86400||!Number.isInteger(max)||max<min||max>86400)throw Error('Use intervalos inteiros de 1 a 86400 segundos; máximo maior ou igual ao mínimo.');
 if(!Number.isInteger(limit)||limit<0||limit>1000)throw Error('Use um limite de 0 a 1000 recargas (0 = sem limite).');
 const firstDelaySeconds=Number(raw.firstDelaySeconds||0);if(!Number.isInteger(firstDelaySeconds)||firstDelaySeconds<0||firstDelaySeconds>604800)throw Error('O início deve estar entre agora e 7 dias.');
 const monitorText=String(raw.monitorText||'').trim();if(monitorText.length>200)throw Error('Use um texto de monitoramento de até 200 caracteres.');
 return {firstDelaySeconds,monitorText,minSeconds:min,maxSeconds:max,limit,bypassCache:raw.bypassCache===true,monitor:raw.monitor===true,stopOnChange:raw.stopOnChange!==false};
}
function refreshDelay(options){return (options.minSeconds+Math.floor(Math.random()*(options.maxSeconds-options.minSeconds+1)))*1000;}
function refreshHome(url){try{const parsed=new URL(url);return parsed.origin==='https://s4.sipal.com.br'&&/^\/sap\/bc\/ui2\/flp\/?$/.test(parsed.pathname)&&parsed.hash==='#Shell-home'}catch{return false}}
function refreshProbe(){
 const visible=e=>{const rect=e.getBoundingClientRect();return rect.width>0&&rect.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const blocked=[...document.querySelectorAll('[aria-busy="true"],[role="progressbar"],[role="dialog"],[role="alertdialog"],input[type="password"]')].some(visible);
 const editing=[...document.querySelectorAll('input,textarea,[contenteditable="true"]')].some(e=>visible(e)&&!e.disabled&&(e===document.activeElement||e.value||e.isContentEditable));
 const failure=/erro de back.end|encerramento da aplica[cç][aã]o|HTTP\s*0\b|sess[aã]o (?:expirada|encerrada)/i.test(document.body?.innerText||'');
 // Text stays local and is immediately hashed. It is never logged or uploaded.
 return {blocked:blocked||editing,failed:failure,ready:document.readyState==='complete',text:(document.body?.innerText||'').slice(0,250000)};
}
let refreshFlight=null;
async function refreshSave(state){await chrome.storage.session.set({refreshState:state});await updateRefreshBadge();return state;}
async function refreshSchedule(state,firstDelaySeconds=0){
 if(!state.enabled){await chrome.alarms.clear(REFRESH_ALARM);return refreshSave(state)}
 state.nextAt=Date.now()+(firstDelaySeconds>0?firstDelaySeconds*1000:refreshDelay(state.options));await refreshSave(state);await chrome.alarms.create(REFRESH_ALARM,{when:Math.max(state.nextAt,Date.now()+30000)});
 try{await chrome.scripting.executeScript({target:{tabId:state.tabId,frameIds:[0]},files:['refresh-clock.js']});}catch{}
 return state;
}
async function refreshPause(state,message){state.enabled=false;state.nextAt=null;state.message=message;await chrome.alarms.clear(REFRESH_ALARM);return refreshSave(state)}
function refreshTick(){if(refreshFlight)return refreshFlight;refreshFlight=serial(refreshTickLocked).finally(()=>{refreshFlight=null});return refreshFlight;}
async function refreshTickLocked(){
 const {refreshState:state}=await chrome.storage.session.get('refreshState');if(!state?.enabled||state.nextAt>Date.now())return;
 try{
  const {sessionRun:run}=await chrome.storage.session.get('sessionRun');
  if(run?.active){
   state.message='Aguardando a assistência de login terminar.';return refreshSchedule(state);
  }
  const tab=await chrome.tabs.get(state.tabId);
  if(!refreshHome(tab.url))return refreshPause(state,'Pausado: a aba saiu da página inicial SAP. Consultas e login não são recarregados.');
  if(tab.status==='loading'){state.message='Aguardando carregamento da página.';return refreshSchedule(state)}
  const results=await chrome.scripting.executeScript({target:{tabId:state.tabId,frameIds:[0]},func:refreshProbe});
  const probe=results[0]?.result;if(!probe)throw Error('Não foi possível verificar a página.');
  if(probe.failed)return refreshPause(state,'Pausado: a página SAP informou erro. Nenhuma nova recarga será enviada.');
  if(probe.blocked||!probe.ready){state.message='Aguardando: SAP ocupado, diálogo aberto ou campo em uso.';return refreshSchedule(state)}
  if(state.options.monitor&&state.options.monitorText){
   const found=(probe.text||'').toLocaleLowerCase('pt-BR').includes(state.options.monitorText.toLocaleLowerCase('pt-BR'));
   if(found&&!state.lastMatched){state.changes++;state.lastChangeAt=Date.now();if(state.options.stopOnChange)return refreshPause(state,'Texto procurado encontrado. Atualização pausada para você conferir.');}
   state.lastMatched=found;
  }
  if(state.options.monitor&&!state.options.monitorText){
   const bytes=new TextEncoder().encode(probe.text||'');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(state.hash&&state.hash!==hash){state.changes++;state.lastChangeAt=Date.now();if(state.options.stopOnChange)return refreshPause(state,'Mudança detectada. Atualização pausada para você conferir a página.');}
   state.hash=hash;
  }
  if(state.options.limit>0&&state.count>=state.options.limit)return refreshPause(state,'Limite de recargas atingido.');
  // Recheck the selected URL after inspection to avoid navigating an unrelated page.
  const current=await chrome.tabs.get(state.tabId);if(!refreshHome(current.url))return refreshPause(state,'Pausado: a aba mudou durante a verificação.');
  await chrome.tabs.reload(state.tabId,{bypassCache:state.options.bypassCache});
  state.count++;state.failures=0;state.lastReloadAt=Date.now();state.message='Página inicial atualizada. '+state.count+(state.options.limit>0?'/'+state.options.limit:' · sem limite')+' recargas.';
  if(state.options.limit>0&&state.count>=state.options.limit)return refreshPause(state,state.message+' Limite atingido.');
  return refreshSchedule(state);
 }catch(error){state.failures=(state.failures||0)+1;state.message='Falha ao verificar/atualizar a aba ('+state.failures+'/3).';if(state.failures>=3)return refreshPause(state,state.message+' Pausado; confira a aba.');return refreshSchedule(state)}
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===REFRESH_ALARM)refreshTick().catch(()=>{});});
chrome.tabs.onRemoved.addListener(tabId=>{serial(async()=>{const {refreshState:state}=await chrome.storage.session.get('refreshState');if(state?.tabId===tabId)await refreshPause(state,'Aba fechada. Atualização encerrada.');}).catch(()=>{});});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(['refresh-clock-config','refresh-due'].includes(msg.type)){
  (async()=>{
   const {refreshState:state}=await chrome.storage.session.get('refreshState');
   if(sender.id!==chrome.runtime.id||sender.frameId!==0||sender.tab?.id!==state?.tabId||!refreshHome(sender.url))return {enabled:false};
   if(msg.type==='refresh-clock-config'){await updateRefreshBadge();return {enabled:state.enabled,nextAt:state.nextAt};}
   await refreshTick();return {ok:true};
  })().then(reply).catch(()=>reply({enabled:false}));return true;
 }

 if(!['refresh-start','refresh-stop','refresh-info'].includes(msg.type))return;
 if(sender.tab||sender.id!==chrome.runtime.id)return;
 (async()=>{
  if(msg.type==='refresh-info')return (await chrome.storage.session.get('refreshState')).refreshState||{enabled:false,message:'Selecione a página inicial SAP para configurar.'};
  return serial(async()=>{
   const {refreshState:state}=await chrome.storage.session.get('refreshState');
   if(msg.type==='refresh-stop')return refreshPause(state||{},'Atualização pausada por você.');
   const options=refreshOptions(msg.options||{});const tab=await chrome.tabs.get(msg.tabId);
   if(!refreshHome(tab.url))throw Error('Abra a página inicial SAP (#Shell-home). A atualização não atua em consultas nem no login.');
   const next={enabled:true,tabId:tab.id,options,count:0,changes:0,failures:0,hash:null,startedAt:Date.now(),message:'Programado. Primeira atualização após o intervalo escolhido.'};
   return refreshSchedule(next,options.firstDelaySeconds);
  });
 })().then(reply).catch(error=>reply({error:error.message}));return true;
});

chrome.tabs.onUpdated?.addListener((tabId,change)=>{if(change.url&&!refreshHome(change.url))serial(async()=>{const {refreshState:state}=await chrome.storage.session.get('refreshState');if(state?.enabled&&state.tabId===tabId)await refreshPause(state,'Pausado: a aba saiu da página inicial SAP.');}).catch(()=>{});});
