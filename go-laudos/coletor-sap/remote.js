// The device creates its own signing key locally. No upload credential is
// distributed with the extension or exposed to the public dashboard.
const ROBOT_ENDPOINT='https://zdqugqdpnadubfxvefme.supabase.co/functions/v1/robo-recebimentos';
const ROBOT_PUBLIC_KEY='sb_publishable_qtnkABSZUNzC5x3LB2c38w_mb0-fBb6';
let remoteFlight=null;
let identityFlight=null;
function deviceIdentity(){if(!identityFlight)identityFlight=loadDeviceIdentity().catch(e=>{identityFlight=null;throw e;});return identityFlight;}
async function loadDeviceIdentity(){
 let {remoteIdentity}=await chrome.storage.local.get('remoteIdentity');
 if(!remoteIdentity){
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  remoteIdentity={id:crypto.randomUUID(),privateKey:await crypto.subtle.exportKey('jwk',keys.privateKey),publicKey:await crypto.subtle.exportKey('jwk',keys.publicKey)};
  await chrome.storage.local.set({remoteIdentity});
 }
 return remoteIdentity;
}
async function remoteCall(action,payload={}){
 const identity=await deviceIdentity();
 const body=JSON.stringify({time:Date.now(),nonce:crypto.randomUUID(),action,payload});
 const key=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(body)))));
 const res=await fetch(ROBOT_ENDPOINT,{method:'POST',headers:{apikey:ROBOT_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({device:identity.id,body,signature}),signal:AbortSignal.timeout(30000)});
 const json=await res.json();if(!res.ok||!json.ok)throw Error(json.error||'Falha na conexão remota ('+res.status+').');return json;
}
function remoteTick(){if(remoteFlight)return remoteFlight;remoteFlight=remoteTickRun().finally(()=>remoteFlight=null);return remoteFlight;}
async function remoteTickRun(){
 const {remoteEnabled}=await chrome.storage.local.get('remoteEnabled');if(!remoteEnabled)return;
 try{
  const polled=await remoteCall('poll');
  await chrome.storage.local.set({remoteConnection:'Conectado. Aguardando pedidos do painel.'});
  if(!polled.command)return;
  const id=polled.command.id;
  const {remoteRequest,remoteStarted}=await chrome.storage.local.get(['remoteRequest','remoteStarted']);
  if(remoteRequest!==id||remoteStarted!==id){
   // Persist before starting so a service-worker restart cannot duplicate a run.
   await chrome.storage.local.set({remoteRequest:id});
   try{await beginPanelRobot();await chrome.storage.local.set({remoteStarted:id});}catch(e){await remoteCall('status',{id,status:{phase:'attention',error:e.message,message:e.message,busy:false}});return;}
  }
  await remoteCall('status',{id,status:await panelRobotStatus()});
 }catch(e){await chrome.storage.local.set({remoteConnection:e.message});}
}
async function armRemote(){await chrome.alarms.create('sap-remote',{periodInMinutes:0.5});}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='sap-remote')remoteTick();});
chrome.runtime.onStartup.addListener(()=>{armRemote();remoteTick();});
chrome.runtime.onInstalled.addListener(async()=>{await armRemote();await remoteTick();});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!['remote-setup','remote-enable','remote-info'].includes(msg.type))return;
 if(sender.tab||sender.id!==chrome.runtime.id)return;
 (async()=>{
  if(msg.type==='remote-setup'){const d=await deviceIdentity();return {pairing:JSON.stringify({id:d.id,publicKey:d.publicKey})};}
  if(msg.type==='remote-enable'){await chrome.storage.local.set({remoteEnabled:!!msg.enabled});await armRemote();if(msg.enabled)await remoteTick();}
  return await chrome.storage.local.get(['remoteEnabled','remoteConnection']);
 })().then(reply).catch(e=>reply({error:e.message}));return true;
});

chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!['panel-schedule-info','panel-schedule-set','panel-sync-wake'].includes(msg.type))return;
 if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.tab||!sender.url?.startsWith('https://go-laudos.netlify.app/'))return;
 (async()=>{
  const {remoteIdentity,remoteEnabled}=await chrome.storage.local.get(['remoteIdentity','remoteEnabled']);
  if(!remoteIdentity||!remoteEnabled)return {ok:false,error:'Ative Receber pedidos do painel na extensão do computador vinculado.'};
  if(msg.type==='panel-sync-wake'){await remoteTick();return {ok:true};}
  if(msg.type==='panel-schedule-info')return {ok:true};
  return await remoteCall('schedule',{hora:msg.hora,marcado:msg.marcado});
 })().then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
});
