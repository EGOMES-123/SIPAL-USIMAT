(()=>{
 if(window.top!==window)return;
 globalThis.sapSessionSearchStop?.();globalThis.sapSessionSearchStop=()=>clearInterval(timer);
 const start=Date.now();let busy=false,clicked=false,reported=false;
 const visible=e=>!!e&&e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
 function findSearch(){
 // Restrict to the Fiori shell header to avoid unrelated application buttons.
 const direct=['searchFieldInShell-search','shell-header-search','shellSearchButton'];
 for(const id of direct){const e=document.getElementById(id);if(visible(e))return e.closest('button,[role=button]')||e;}
 const root=document.getElementById('shell-header')||document.querySelector('header,[role=banner],.sapUshellShellHead');
 if(!root)return null;
 const candidates=[...root.querySelectorAll('button,[role=button]')].filter(visible).filter(e=>{
 const label=[e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-sap-ui-icon-content'),e.textContent].filter(Boolean).join(' ').trim();
 return /(?:^|\b)(?:procurar|pesquisar|pesquisa|buscar|busca|search)(?:\b|$)/i.test(label)&&!/avançad|advanced/i.test(label);
 });
 return candidates.length===1?candidates[0]:null;
 }
 const timer=setInterval(async()=>{
 if(busy)return;busy=true;
 try{
 if(Date.now()-start>180000){clearInterval(timer);return;}
 const c=await chrome.runtime.sendMessage({type:'session-config'});if(!c?.active||!c.sessionMaintenance||c.mode!=='login')return;
 if(!location.hash.startsWith('#Shell-home'))return;
 if(clicked)return;
 const button=findSearch();
 if(!button){if(!reported&&Date.now()-start>20000){reported=true;await chrome.runtime.sendMessage({type:'session-progress',sessionId:c.sessionId,phase:'waiting',message:'Página aberta, mas lupa do cabeçalho ainda não identificada de forma única.'});}return;}
 // Mark before clicking so no later timer tick can click a second time.
 clicked=true;clearInterval(timer);
 button.click();
 await chrome.runtime.sendMessage({type:'session-progress',sessionId:c.sessionId,phase:'waiting',message:'Clique único acionado na lupa Procurar.'});
 await chrome.runtime.sendMessage({type:'session-home-done',sessionId:c.sessionId});
 }catch{clearInterval(timer);}finally{busy=false;}
 },1000);
})();