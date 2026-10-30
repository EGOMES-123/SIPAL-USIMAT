(()=>{
 const ORIGIN='https://go-laudos.netlify.app';
 if(location.origin!==ORIGIN||window!==window.top)return;
 const post=(kind,data)=>window.postMessage({source:'sap-receipts-extension',version:'0.18',kind,data},ORIGIN);
 async function request(type){try{const response=await chrome.runtime.sendMessage({type});post('status',response);}catch{post('status',{error:'A extensão foi atualizada ou desconectada. Recarregue o painel.'});}}
 // Only a real click on the panel button can start a run. postMessage only exposes read-only status.
 document.addEventListener('click',e=>{if(!e.isTrusted||!e.target.closest?.('#syncNow'))return;request('panel-start');},true);
 window.addEventListener('message',e=>{if(e.source!==window||e.origin!==ORIGIN||e.data?.source!=='sap-receipts-panel'||e.data?.kind!=='status-request')return;request('panel-status');});
 post('ready',{});
 chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||msg.type!=='upload-capture')return;
  const id=crypto.randomUUID();let finished=false;
  const response=e=>{if(e.source!==window||e.origin!==ORIGIN||e.data?.source!=='sap-receipts-panel'||e.data?.kind!=='capture-response'||e.data.id!==id)return;finished=true;clearTimeout(timeout);window.removeEventListener('message',response);reply(e.data.result);if(e.data.result?.ok)post('uploaded',{receivedAt:e.data.result.receivedAt,received:e.data.result.received});};
  const timeout=setTimeout(()=>{if(finished)return;window.removeEventListener('message',response);reply({ok:false,error:'O painel não confirmou o envio. Entre como administrador e mantenha a aba aberta.'});},45000);
  window.addEventListener('message',response);
  window.postMessage({source:'sap-receipts-extension',kind:'capture-request',id,payload:msg.payload},ORIGIN);return true;
 });
})();
