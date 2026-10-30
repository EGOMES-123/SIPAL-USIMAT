let tabId,capture;const $=id=>document.getElementById(id);
async function refresh(){if(!tabId)return;const saved=await chrome.runtime.sendMessage({type:'get',tabId,summary:true});capture=saved?.state;const n=capture?.rowCount||0;$('download').hidden=!n;if(n)$('result').textContent=`${n} registros únicos acumulados. Última leitura: ${capture.lastVisibleCount} linhas. Captura parcial: completude não verificada. Registros fora da tela permanecem. ${saved.sync?.ok?'Último envio: '+new Date(saved.sync.receivedAt).toLocaleTimeString('pt-BR'):saved.sync?.message||'Aguardando envio à nuvem.'}`;}
(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab.id;await refresh()})();
$('read').onclick=async()=>{try{const reservation=await chrome.runtime.sendMessage({type:'tab-claim',tabId});if(reservation?.error)throw Error(reservation.error);if(capture&&!confirm('Iniciar nova captura? Baixe a anterior antes se precisar conservá-la.'))return;const sessionId=crypto.randomUUID();await chrome.runtime.sendMessage({type:'new',tabId,sessionId});await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['collector.js','tracker.js']});await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:(id)=>globalThis.sapStartReceiptTracker(id),args:[sessionId]});capture=null;$('download').hidden=true;$('result').textContent='Leitura iniciada. Role a tabela lentamente. Se nenhuma linha aparecer, confirme que o monitor está visível.';await refresh()}catch(e){$('result').textContent=e.message}};
$('stop').onclick=async()=>{try{await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>globalThis.sapReceiptTracker?.stop()});await refresh();$('result').textContent+=' Leitura pausada.'}catch(e){$('result').textContent=e.message}};
$('download').onclick=async()=>{capture=(await chrome.runtime.sendMessage({type:'get',tabId}))?.state;if(!capture?.rowsByKey)return;const {rowsByKey,...meta}=capture;const payload={...meta,rows:Object.values(rowsByKey).map(x=>x.data),recordMetadata:Object.entries(rowsByKey).map(([key,x])=>({key,firstSeenAt:x.firstSeenAt,lastSeenAt:x.lastSeenAt})),notice:'Captura acumulada parcial. Não substitui base completa nem comprova remoções.'};const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.href=url;a.download='captura-recebimentos-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
setInterval(()=>refresh().catch(()=>{}),1500);

$('fill').onclick=async()=>{try{const reservation=await chrome.runtime.sendMessage({type:'tab-claim',tabId});if(reservation?.error)throw Error(reservation.error);await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['selection.js']});const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>globalThis.sapFillSelection?.()});const ok=results.find(r=>r.result?.ok);$('result').textContent=ok?.result.message||'Não identifiquei a tela de seleção. Abra os filtros do monitor e tente novamente.'}catch(e){$('result').textContent=e.message}};

async function robotRefresh(){const r=await chrome.runtime.sendMessage({type:'robot-status'});$('schedule').checked=!!r.robotEnabled;let message=r.robotRun?.message||'Robô ainda não iniciado.';if(r.robotRun?.tabId){const c=await chrome.runtime.sendMessage({type:'get',tabId:r.robotRun.tabId,summary:true});if(c?.state)message+='\n'+c.state.rowCount+' registros únicos; '+(c.pendingCount||0)+' aguardando envio.\n'+(c.sync?.ok?'Último envio: '+new Date(c.sync.receivedAt).toLocaleTimeString('pt-BR'):c.sync?.message||'Aguardando envio.');}if(r.lease)message+='\nAba reservada nº '+r.lease.tabId+'. Demais abas do SAP protegidas.';if(r.next)message+='\nPróximo horário: '+new Date(r.next).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'});$('robotStatus').textContent=message;}
for(const [id,type]of [['loginTest','robot-login-test'],['auto','robot-current'],['robotStart','robot-start'],['robotStop','robot-stop']])$(id).onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type,tabId,expectedTotal:Number($('expectedTotal').value)||null});if(r.error)throw Error(r.error);await robotRefresh();}catch(e){$('robotStatus').textContent=e.message}};
$('schedule').onchange=async()=>{const r=await chrome.runtime.sendMessage({type:'robot-enable',enabled:$('schedule').checked});if(r?.error)$('robotStatus').textContent=r.error;else await robotRefresh();};
robotRefresh().catch(()=>{});setInterval(()=>robotRefresh().catch(()=>{}),2000);

async function remoteRefresh(){const r=await chrome.runtime.sendMessage({type:'remote-info'});$('remoteEnabled').checked=!!r.remoteEnabled;$('remoteStatus').textContent=r.remoteConnection||'Vincule este computador para receber pedidos e enviar dados.';}
$('pairDevice').onclick=async()=>{const r=await chrome.runtime.sendMessage({type:'remote-setup'});$('pairingCode').hidden=false;$('pairingCode').value=r.pairing||r.error;$('pairingCode').select();$('remoteStatus').textContent='Copie este código público e envie ao Eduardo para autorizar este computador. Nenhuma senha está incluída.';};
$('remoteEnabled').onchange=async()=>{await chrome.runtime.sendMessage({type:'remote-enable',enabled:$('remoteEnabled').checked});await remoteRefresh();};
remoteRefresh().catch(()=>{});setInterval(()=>remoteRefresh().catch(()=>{}),3000);

$('diagnose').onclick=async()=>{const el=$('diagnosticResult');el.hidden=false;el.textContent='Verificando o Executar na aba reservada…';try{const r=await chrome.runtime.sendMessage({type:'execute-diagnostics'});el.textContent=JSON.stringify(r,null,2);}catch(e){el.textContent=e.message;}};

$('extensionVersion').textContent = 'v' + chrome.runtime.getManifest().version;

async function sessionRefresh(){
 const r=await chrome.runtime.sendMessage({type:'session-info'});
 if(document.activeElement!==$('sessionAccount'))$('sessionAccount').value=r.sessionAccount||'';
 $('sessionEnabled').checked=!!r.sessionEnabled;
 $('sessionStatus').textContent=r.sessionStatus||'Configure o e-mail para usar a sessão automática.';
}
$('sessionSave').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'session-settings',account:$('sessionAccount').value,enabled:$('sessionEnabled').checked});if(r.error)throw Error(r.error);await sessionRefresh();$('sessionStatus').textContent='Configuração salva. '+($('sessionEnabled').checked?'Verificação a cada 4 minutos ativada.':'Verificação periódica desativada.');}catch(e){$('sessionStatus').textContent=e.message}};
$('sessionCheck').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'session-check'});if(r?.error)throw Error(r.error);await sessionRefresh()}catch(e){$('sessionStatus').textContent=e.message}};
sessionRefresh().catch(()=>{});

let refreshLoaded=false;
async function refreshPanel(){
 const r=await chrome.runtime.sendMessage({type:'refresh-info'});
 if(!refreshLoaded&&r.options){refreshLoaded=true;$('refreshMin').value=r.options.minSeconds;$('refreshMax').value=r.options.maxSeconds;$('refreshLimit').value=r.options.limit;$('refreshCache').checked=!!r.options.bypassCache;$('refreshMonitor').checked=!!r.options.monitor;$('refreshStopChange').checked=!!r.options.stopOnChange;}
 $('refreshStatus').textContent=(r.message||'Atualização desativada.')+(r.enabled&&r.nextAt?'\nPróxima verificação: '+new Date(r.nextAt).toLocaleTimeString('pt-BR'):'')+(r.tabId?'\nAba '+r.tabId+' · '+(r.changes||0)+' mudanças detectadas.':'');
}
$('refreshStart').onclick=async()=>{try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 const r=await chrome.runtime.sendMessage({type:'refresh-start',tabId:tab.id,options:{minSeconds:Number($('refreshMin').value),maxSeconds:Number($('refreshMax').value),limit:Number($('refreshLimit').value),bypassCache:$('refreshCache').checked,monitor:$('refreshMonitor').checked,stopOnChange:$('refreshStopChange').checked}});
 if(r.error)throw Error(r.error);await refreshPanel();
}catch(e){$('refreshStatus').textContent=e.message}};
$('refreshStop').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'refresh-stop'});if(r.error)throw Error(r.error);await refreshPanel()}catch(e){$('refreshStatus').textContent=e.message}};
refreshPanel().catch(()=>{});setInterval(()=>refreshPanel().catch(()=>{}),1000);
