// Runs only for the currently leased, active robot tab. Never focuses a tab/window.
// No fake mouse/key activity, arbitrary requests or guessed SAP keepalive endpoints.
function inspectRobotSession(){
 if(location.hostname!=='s4.sipal.com.br')return {ignored:true};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const expired=t=>/sessao (?:foi )?(?:encerrada|expirada)|sessao (?:do usuario )?expirou|session (?:has )?(?:timed out|expired)|service session has timed out/.test(t);
 const warning=t=>/sessao|session/.test(t)&&/inatividade|inactivity|expirar|expira em|will expire|about to expire|tempo limite/.test(t);
 const dialogs=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open]')].filter(visible);
 let renewal=null;
 for(const dialog of dialogs){const text=norm(dialog.innerText);if(expired(text))return {expired:true};if(!warning(text))continue;
  const candidates=[...dialog.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&/^(continuar|continuar conectado|manter conectado|renovar sessao|estender sessao|continue|stay signed in|extend session)$/.test(norm(e.getAttribute('aria-label')||e.value||e.textContent)));
  const leaves=candidates.filter(e=>!candidates.some(child=>child!==e&&e.contains(child)));
  if(leaves.length===1){if(renewal)return {ambiguous:true};renewal=leaves[0];}
 }
 if(renewal){renewal.click();return {continued:true};}
 // Match explicit error banners/pages, not arbitrary business data in receipt rows.
 const alerts=[...document.querySelectorAll('[role="alert"],.sapMMessagePage,.sapUiMessageBox')].filter(visible);
 const text=norm(document.body?.innerText||'');
 if(alerts.some(e=>expired(norm(e.innerText)))||(text.length<2500&&expired(text)))return {expired:true};
 globalThis.sapSelectionTick?.().catch(()=>{});
 globalThis.sapRobotTick?.();
 return {checked:true};
}
let sessionWatchdogBusy=false;
async function monitorRobotSession(){
 if(sessionWatchdogBusy)return;sessionWatchdogBusy=true;
 try{
  const {robotRun:run}=await chrome.storage.local.get('robotRun');
  if(!run||run.mode!=='collect'||['done','attention','stopped'].includes(run.phase))return;
  if(Date.now()-run.startedAt>=90*60000){run.phase='attention';run.message='Limite de 90 minutos atingido. Dados parciais preservados.';await chrome.storage.local.set({robotRun:run});return;}
  if(!await ownsSapTab(run.tabId,run.leaseToken))return;
  const tab=await chrome.tabs.get(run.tabId);if(!tab.url?.startsWith('https://s4.sipal.com.br/'))return;
  const results=await chrome.scripting.executeScript({target:{tabId:run.tabId,allFrames:true},func:inspectRobotSession});
  if(!results.some(r=>r.result?.expired))return;
  await withLeaseLock(async()=>{
   const {robotRun:latest}=await chrome.storage.local.get('robotRun');
   if(!latest||latest.sessionId!==run.sessionId||['done','attention','stopped'].includes(latest.phase)||!await ownsSapTab(run.tabId,run.leaseToken))return;
   const key='capture:'+run.tabId;const capture=(await chrome.storage.local.get(key))[key];
   // Serialize with the existing upload queue to avoid overwriting capture/sent state.
   if(capture?.state&&Object.keys(capture.pending||{}).length){
    await (queue=queue.catch(()=>{}).then(async()=>{const current=(await chrome.storage.local.get(key))[key];if(current?.state)await relay(current,run.tabId,key,true);}));
    const after=(await chrome.storage.local.get(key))[key];if(Object.keys(after?.pending||{}).length){latest.message='Sessão SAP encerrada. Aguardando envio dos dados pendentes antes de reconectar.';await chrome.storage.local.set({robotRun:latest});return;}
   }
   if((latest.sessionRecoveries||0)>=2){latest.phase='attention';latest.message='O SAP encerrou a sessão novamente. Duas reconexões já foram tentadas. Dados preservados; confira a aba reservada.';await chrome.storage.local.set({robotRun:latest});return;}
   delete latest.queryExecuteState;delete latest.queryExecutedAt;delete latest.queryConfirmedBy;delete latest.emptyConfirmed;
   latest.sessionRecoveries=(latest.sessionRecoveries||0)+1;latest.phase='waiting';latest.message='Sessão SAP encerrada. Reconectando em segundo plano ('+latest.sessionRecoveries+'/2).';latest.updatedAt=Date.now();
   await chrome.storage.local.set({robotRun:latest});
   await chrome.tabs.update(run.tabId,{url:SAP_URL,autoDiscardable:false});
  });
 }finally{sessionWatchdogBusy=false;}
}
if(typeof module!=='undefined')module.exports={inspectRobotSession,monitorRobotSession};
