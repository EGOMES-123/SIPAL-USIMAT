// Detect a usable home page without clicking the search button or changing focus.
(()=>{
 if(window.top!==window)return;
 globalThis.sapSessionSearchStop?.();let stopped=false,busy=false,readyAt=null;
 const started=Date.now();
 globalThis.sapSessionSearchStop=()=>{stopped=true;clearInterval(timer)};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const timer=setInterval(async()=>{
  if(stopped||busy)return;busy=true;
  try{
   if(Date.now()-started>180000){globalThis.sapSessionSearchStop();return;}
   const run=await chrome.runtime.sendMessage({type:'session-config'});
   if(!run?.active||!run.sessionMaintenance||run.mode!=='login')return;
   if(location.hash!=='#Shell-home'||document.readyState!=='complete'){readyAt=null;return;}
   const text=(document.body?.innerText||'').trim();
   const waiting=!text||(text.length<100&&/carregando|loading|aguarde/i.test(text))||/erro de back.end|encerramento da aplica[cç][aã]o|HTTP\s*0\b|sess[aã]o (?:expirada|encerrada)/i.test(text)||[...document.querySelectorAll('[aria-busy="true"],[role="progressbar"],input[type="password"]')].some(visible);
   if(waiting){readyAt=null;return;}
   readyAt??=Date.now();if(Date.now()-readyAt<1000)return;
   const response=await chrome.runtime.sendMessage({type:'session-home-done',sessionId:run.sessionId,readiness:'home-loaded'});
   if(response?.ok)globalThis.sapSessionSearchStop();
  }catch(error){if(/context invalidated/i.test(error.message||''))globalThis.sapSessionSearchStop()}finally{busy=false}
 },1000);
})();
