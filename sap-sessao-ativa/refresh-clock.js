// Page timer supplies sub-30s scheduling; Chrome alarms remain a recovery fallback.
(()=>{
 if(window!==window.top)return;
 globalThis.sapRefreshClockStop?.();let stopped=false,timer;
 globalThis.sapRefreshClockStop=()=>{stopped=true;clearTimeout(timer)};
 const arm=async()=>{
  if(stopped)return;
  try{
   const state=await chrome.runtime.sendMessage({type:'refresh-clock-config'});
   if(stopped||!state?.enabled)return;
   timer=setTimeout(async()=>{
    if(stopped)return;
    if(Date.now()>=state.nextAt)try{await chrome.runtime.sendMessage({type:'refresh-due'})}catch{}
    if(!stopped)await arm();
   },Math.max(250,Math.min(1000,state.nextAt-Date.now())));
  }catch{}
 };
 void arm();
})();
