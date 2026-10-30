'use strict';
const $=id=>document.getElementById(id);
const send=async message=>{const response=await chrome.runtime.sendMessage(message);if(response?.error)throw Error(response.error);return response};
let loaded=false,loading=false;
$('version').textContent='v'+chrome.runtime.getManifest().version;
async function render(){
 if(loading)return;loading=true;
 try{
  const info=await send({type:'session-info'});
  if(!loaded){loaded=true;$('account').value=info.settings.account;$('enabled').checked=info.settings.enabled;
   if(info.refresh?.options){const o=info.refresh.options;$('min').value=o.minSeconds;$('max').value=o.maxSeconds;$('limit').value=o.limit;$('cache').checked=o.bypassCache;$('monitor').checked=o.monitor;$('stopChange').checked=o.stopOnChange;}}
  $('sessionStatus').textContent=(info.run?.message||'Salve o e-mail e clique em Verificar sessão.')+'\nVerificação periódica: '+(info.settings.enabled?'ativada':'desativada');
  const r=info.refresh;$('refreshStatus').textContent=r?(r.message||'Atualização desativada.')+'\n'+(r.count||0)+' recargas · '+(r.changes||0)+' mudanças'+(r.enabled&&r.nextAt?'\nPróxima verificação: '+new Date(r.nextAt).toLocaleTimeString('pt-BR'):''):'Atualização desativada.';
 }catch(error){$('feedback').textContent=error.message}finally{loading=false}
}
function action(id,fn){$(id).onclick=async()=>{const button=$(id);button.disabled=true;$('feedback').textContent='';try{await fn();await render()}catch(error){$('feedback').textContent=error.message}finally{button.disabled=false}}}
const save=()=>send({type:'settings-save',account:$('account').value,enabled:$('enabled').checked});
action('save',async()=>{await save();$('feedback').textContent='Configuração salva.'});
action('verify',async()=>{await save();await send({type:'session-start'})});
action('open',()=>send({type:'session-open'}));
action('pauseAll',async()=>{await send({type:'pause-all'});$('enabled').checked=false;$('feedback').textContent='Todas as automações pausadas.'});
action('startRefresh',async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await send({type:'refresh-start',tabId:tab.id,options:{minSeconds:Number($('min').value),maxSeconds:Number($('max').value),limit:Number($('limit').value),bypassCache:$('cache').checked,monitor:$('monitor').checked,stopOnChange:$('stopChange').checked}})});
action('stopRefresh',()=>send({type:'refresh-stop'}));
action('export',async()=>{const data=await send({type:'diagnostics'});const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='SAP-sessao-ativa-diagnostico.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)});
render();setInterval(render,1000);
