// Mouse input is restricted to the owned Microsoft document and a blank point.
function loginBackgroundPointValid(point,account){
 if(location.hostname!=='login.microsoftonline.com')return false;
 const card=document.getElementById('lightbox')||document.querySelector('.lightbox,.sign-in-box');if(!card)return false;
 const rect=card.getBoundingClientRect();
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<rect.right+24||point.x>innerWidth-20||point.y<20||point.y>innerHeight-20)return false;
 const emails=[...document.querySelectorAll('#displayName,#userDisplayName,[data-test-id="displayName"]')].map(e=>e.textContent.trim().toLowerCase());
 if(!emails.includes(account))return false;
 const password=document.querySelector('input[type="password"]');if(!password||password.getBoundingClientRect().width===0)return false;
 const hit=document.elementFromPoint(point.x,point.y);
 return !!hit&&!card.contains(hit)&&!hit.closest('a,button,input,select,textarea,[role="button"],[role="link"],[contenteditable="true"]');
}
async function loginBackgroundClick(msg,sender,run){
 const fail=error=>({ok:false,error});
 if(!sender.documentId||sender.frameId!==0||sender.tab?.id!==run.tabId||!sender.url?.startsWith('https://login.microsoftonline.com/')||msg.sessionId!==run.sessionId)return fail('Página de login não autorizada.');
 if(run.backgroundClick?.documentId===sender.documentId)return run.backgroundClick.ok?{ok:true,cached:true}:fail('Clique já tentado nesta página. Confira a aba Microsoft.');
 const cfg=await settings();const target={tabId:run.tabId};let attached=false,down=false,ok=false,error='';
 // Persist before attempting input: a worker restart must not repeat the click.
 run.backgroundClick={documentId:sender.documentId,ok:false};await saveRun(run);
 async function check(){
  const tab=await chrome.tabs.get(run.tabId);if(tab.url!==sender.url)throw Error('A página mudou durante a preparação.');
  const results=await chrome.scripting.executeScript({target:{tabId:run.tabId,documentIds:[sender.documentId]},func:loginBackgroundPointValid,args:[msg.point,cfg.account]});
  if(results[0]?.result!==true)throw Error('O ponto não está livre à direita do cartão Microsoft.');
 }
 try{
  await check();if(!chrome.debugger?.attach)throw Error('Permissão de depuração indisponível.');
  await chrome.debugger.attach(target,'1.3');attached=true;
  // The user requested this interaction; foreground only the owned login tab.
  const tab=await chrome.tabs.get(run.tabId);await chrome.tabs.update(run.tabId,{active:true});await chrome.windows.update(tab.windowId,{focused:true});
  await check();
  await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x:msg.point.x,y:msg.point.y,button:'none',buttons:0});
  down=true;await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',x:msg.point.x,y:msg.point.y,button:'left',buttons:1,clickCount:1});
  await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x:msg.point.x,y:msg.point.y,button:'left',buttons:0,clickCount:1});down=false;ok=true;
 }catch(e){error=String(e?.message||e).slice(0,180)}finally{
  if(attached){
   if(down)try{await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x:msg.point.x,y:msg.point.y,button:'left',buttons:0,clickCount:1})}catch{}
   try{await chrome.debugger.detach(target)}catch{error=error||'Não foi possível confirmar o encerramento da depuração.';ok=false}
  }
  run.backgroundClick={documentId:sender.documentId,ok};await saveRun(run);
 }
 return ok?{ok:true}:{ok:false,error:'Não foi possível preparar o preenchimento: '+error+' Clique manualmente no fundo à direita do cartão.'};
}
