'use strict';
const $=id=>document.getElementById(id);
const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(r?.error)throw Error(r.error);return r};
let loaded=false,loading=false,running=false,selectedTab='interval',intervalMode='fixed',timerMode='duration';
$('version').textContent='v'+chrome.runtime.getManifest().version;
function selectTab(name){selectedTab=name;for(const button of document.querySelectorAll('[data-tab]')){const selected=button.dataset.tab===name;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;$('panel-'+button.dataset.tab).hidden=!selected;}}
for(const button of document.querySelectorAll('[data-tab]')){
 button.onclick=()=>selectTab(button.dataset.tab);
 button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-tab]')],index=tabs.indexOf(button);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[next].dataset.tab);tabs[next].focus()};
}
function setIntervalMode(mode){intervalMode=mode;for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('selected',b.dataset.mode===mode);$('standardInterval').hidden=mode==='custom';$('customInterval').hidden=mode!=='custom';$('randomRange').hidden=mode!=='random';}
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>setIntervalMode(b.dataset.mode);
for(const b of document.querySelectorAll('[data-seconds]'))b.onclick=()=>{setIntervalMode('fixed');$('min').value=b.dataset.seconds;$('max').value=b.dataset.seconds;for(const chip of document.querySelectorAll('[data-seconds]'))chip.classList.toggle('selected',chip===b)};
$('minus').onclick=()=>{$('min').value=Math.max(1,Number($('min').value)-1)};
$('plus').onclick=()=>{$('min').value=Math.min(86400,Number($('min').value)+1)};
$('useLimit').onchange=()=>{$('limitRow').hidden=!$('useLimit').checked};
function setTimerMode(mode){timerMode=mode;$('durationFields').hidden=mode!=='duration';$('dateFields').hidden=mode!=='date';$('durationMode').classList.toggle('selected',mode==='duration');$('dateMode').classList.toggle('selected',mode==='date')}
$('durationMode').onclick=()=>setTimerMode('duration');$('dateMode').onclick=()=>setTimerMode('date');
function timeValue(prefix){const fields=['Hours','Minutes','Seconds'].map(suffix=>$(prefix+suffix));for(const field of fields)if(!field.checkValidity()||field.value==='')throw Error('Informe uma duração válida.');return Number(fields[0].value)*3600+Number(fields[1].value)*60+Number(fields[2].value)}
async function render(){
 if(loading)return;loading=true;
 try{
  const info=await send({type:'session-info'}),r=info.refresh;
  if(!loaded){loaded=true;$('account').value=info.settings.account;$('enabled').checked=info.settings.enabled;
   if(r?.options){const o=r.options;$('min').value=o.minSeconds;$('max').value=o.maxSeconds;$('limit').value=o.limit||10;$('useLimit').checked=o.limit>0;$('limitRow').hidden=!$('useLimit').checked;$('cache').checked=o.bypassCache;$('monitor').checked=o.monitor;$('monitorText').value=o.monitorText||'';$('stopChange').checked=o.stopOnChange;setIntervalMode(o.minSeconds===o.maxSeconds?'fixed':'random');}}
  running=!!r?.enabled;$('startRefresh').textContent=running?'■ Parar':'▶ Iniciar';$('startRefresh').classList.toggle('danger',running);$('startRefresh').setAttribute('aria-pressed',String(running));
  $('sessionStatus').textContent=(info.run?.message||'Salve o e-mail e clique em Verificar sessão.')+'\nVerificação periódica: '+(info.settings.enabled?'ativada':'desativada');
  const view=refreshTimerView(r,info.run);$('countdown').textContent=view.text;$('countdownLabel').textContent=view.title;
  $('refreshStatus').textContent=r?(r.message||'Atualização desativada.')+'\n'+(r.count||0)+' recargas · '+(r.changes||0)+' mudanças':'Atualização desativada.';
  $('tabCount').textContent=running?'1':'0';$('targetState').textContent=r?.tabId?'Aba '+r.tabId+' · '+(running?'em execução':'parada')+'\n'+(r.count||0)+' recargas · '+(r.options?.limit?'limite '+r.options.limit:'sem limite'):'Nenhuma aba programada.';
 }catch(e){$('feedback').textContent=e.message}finally{loading=false}
}
function action(id,fn){$(id).onclick=async()=>{const b=$(id);b.disabled=true;$('feedback').textContent='';try{await fn();await render()}catch(e){$('feedback').textContent=e.message}finally{b.disabled=false}}}
const save=()=>send({type:'settings-save',account:$('account').value,enabled:$('enabled').checked});
action('save',async()=>{await save();$('feedback').textContent='Configuração salva.'});
action('verify',async()=>{await save();await send({type:'session-start'})});
action('open',()=>send({type:'session-open'}));
action('pauseAll',async()=>{await send({type:'pause-all'});$('enabled').checked=false;$('feedback').textContent='Todas as automações pausadas.'});
action('startRefresh',async()=>{
 if(running){await send({type:'refresh-stop'});return;}
 const minSeconds=intervalMode==='custom'?timeValue('custom'):Number($('min').value),maxSeconds=intervalMode==='random'?Number($('max').value):minSeconds;
 let firstDelaySeconds=0,limit=$('useLimit').checked?Number($('limit').value):0;
 if(selectedTab==='timer'){
  firstDelaySeconds=timerMode==='duration'?timeValue('timer'):Math.ceil((new Date($('timerDate').value).getTime()-Date.now())/1000);
  if(!Number.isInteger(firstDelaySeconds)||firstDelaySeconds<1||firstDelaySeconds>604800)throw Error('Escolha um início futuro entre 1 segundo e 7 dias.');
  if($('timerOnce').checked)limit=1;
 }
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 await send({type:'refresh-start',tabId:tab.id,options:{minSeconds,maxSeconds,limit,firstDelaySeconds,bypassCache:$('cache').checked,monitor:$('monitor').checked,monitorText:$('monitorText').value,stopOnChange:$('stopChange').checked}});
});
action('stopRefresh',()=>send({type:'refresh-stop'}));
action('export',async()=>{const data=await send({type:'diagnostics'});const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='SAP-sessao-ativa-diagnostico.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)});
selectTab('interval');render();setInterval(render,1000);
