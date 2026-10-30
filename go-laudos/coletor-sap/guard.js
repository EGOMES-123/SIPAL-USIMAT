// A single Chrome-session lease protects all SAP mutations and collection.
let leaseQueue=Promise.resolve();
function withLeaseLock(fn){const result=leaseQueue.catch(()=>{}).then(fn);leaseQueue=result.catch(()=>{});return result;}
async function getSapLease(){const {sapLease}=await chrome.storage.session.get('sapLease');return sapLease||null;}
async function claimSapTab(tabId){return withLeaseLock(async()=>{
 const old=await getSapLease();
 if(old&&old.tabId!==tabId){try{await chrome.tabs.get(old.tabId);throw Error('Outra aba está reservada para o robô. Use Parar robô / liberar aba antes de trocar.');}catch(e){if(e.message.startsWith('Outra aba'))throw e;}}
 const lease=old?.tabId===tabId?old:{tabId,mode:'manual',token:crypto.randomUUID(),createdAt:Date.now()};
 await chrome.storage.session.set({sapLease:lease});return lease;
});}
async function ownsSapTab(tabId,token){const lease=await getSapLease();return !!lease&&lease.tabId===tabId&&(!token||lease.token===token);}
async function releaseSapTab(tabId){return withLeaseLock(async()=>{const lease=await getSapLease();if(lease&&(!Number.isInteger(tabId)||lease.tabId===tabId))await chrome.storage.session.remove('sapLease');});}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!['tab-authorize','tab-claim'].includes(msg.type))return;
 (async()=>{
  if(msg.type==='tab-authorize'){const lease=await getSapLease();return {allowed:!!sender.tab&&!!lease&&lease.tabId===sender.tab.id&&(!msg.token||lease.token===msg.token),mode:lease?.mode};}
  if(sender.tab)throw Error('Selecione a aba pela extensão.');
  const tab=await chrome.tabs.get(msg.tabId);if(!tab.url?.startsWith('https://s4.sipal.com.br/'))throw Error('Abra o monitor SAP antes de selecionar a aba.');
  return {ok:true,...await claimSapTab(tab.id)};
 })().then(reply).catch(e=>reply({error:e.message}));return true;
});
chrome.tabs.onRemoved.addListener(async tabId=>{await releaseSapTab(tabId);const {robotRun}=await chrome.storage.local.get('robotRun');if(robotRun?.tabId===tabId){robotRun.phase='stopped';robotRun.message='Aba do robô fechada. Reserva liberada.';await chrome.storage.local.set({robotRun});}});
