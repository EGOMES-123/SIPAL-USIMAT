const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../coletor-sap/session-auto.js'),'utf8');
function setup(initial={},tabs={}){
 const state={sessionEnabled:true,sessionAccount:'user@example.com',...initial};let lease=null,created=0,navigated=0;
 const noop={addListener(){}};
 const context={crypto:{randomUUID:()=> 'id'},withLeaseLock:fn=>fn(),getSapLease:async()=>lease,ownsSapTab:async()=>true,releaseSapTab:async()=>{lease=null},chrome:{runtime:{onStartup:noop,onInstalled:noop,onMessage:noop},alarms:{onAlarm:noop,create:async()=>{}},storage:{local:{get:async()=>state,set:async value=>Object.assign(state,value)},session:{set:async value=>{lease=value.sapLease}}},tabs:{get:async id=>{if(!tabs[id])throw Error('missing');return tabs[id]},create:async()=>{created++;return {id:1,url:'https://s4.sipal.com.br/'}},update:async()=>{navigated++}},scripting:{executeScript:async()=>{}}}};
 vm.runInNewContext(code,context);return {state,run:manual=>context.sessionTick(manual),counts:()=>({created,navigated})};
}
test('maintenance leaves active collection untouched',async()=>{const app=setup({robotRun:{mode:'collect',phase:'reading',startedAt:Date.now()}});const result=await app.run();assert.equal(result.ok,false);assert.equal(app.counts().created,0)});
test('stale helper is paused and blocked instead of endlessly retried',async()=>{const app=setup({robotRun:{mode:'login',sessionMaintenance:true,phase:'waiting',startedAt:Date.now()-181000}});await app.run();assert.equal(app.state.sessionBlocked,true);assert.equal(app.state.robotRun.phase,'attention');await app.run();assert.equal(app.counts().created,0)});
test('changed helper tab is preserved without navigation',async()=>{const app=setup({sessionTabId:2},{2:{id:2,url:'https://example.com'}});assert.equal((await app.run()).ok,false);assert.equal(app.counts().navigated,0);assert.equal(app.state.sessionBlocked,true)});
test('Microsoft redirect resumes same tab instead of creating a window',async()=>{const app=setup({sessionTabId:2},{2:{id:2,url:'https://login.microsoftonline.com/tenant'}});assert.equal((await app.run()).ok,true);assert.equal(app.counts().created,0);assert.equal(app.counts().navigated,0);assert.equal(app.state.robotRun.sessionMaintenance,true)});
