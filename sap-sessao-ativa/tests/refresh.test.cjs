const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {webcrypto}=require('node:crypto');
const code=fs.readFileSync(path.join(__dirname,'../refresh.js'),'utf8');
function setup({lease=null,run=null,url='https://s4.sipal.com.br/sap/bc/ui2/flp#Shell-home',probe={ready:true,text:'Home'},options={},failure=false}={}){
 const state={sessionRun:run,refreshState:{enabled:true,tabId:1,count:0,changes:0,options:{minSeconds:30,maxSeconds:30,limit:10,monitor:true,stopOnChange:true,...options}}};const calls=[],badges=[];const event={addListener(){}};
 const ctx={URL,TextEncoder,crypto:webcrypto,serial:fn=>fn(),chrome:{action:{setBadgeText:async value=>badges.push(value.text),setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},runtime:{onMessage:event},tabs:{onRemoved:event,get:async()=>({id:1,url,status:'complete'}),reload:async(...args)=>calls.push(args)},storage:{session:{get:async()=>state,set:async val=>Object.assign(state,val)},local:{get:async()=>({robotRun:run})}},alarms:{onAlarm:event,create:async()=>{},clear:async()=>{}},scripting:{executeScript:async()=>{if(failure)throw Error('blocked');return [{result:probe}]}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../timer-view.js'),'utf8'),ctx);vm.runInContext(code,ctx);return {ctx,state,calls,badges,tick:()=>ctx.refreshTick()};
}
test('invalid intervals and cycle limits are rejected',()=>{const {ctx}=setup();for(const raw of [{minSeconds:0,maxSeconds:30,limit:1},{minSeconds:60,maxSeconds:30,limit:1},{minSeconds:30,maxSeconds:30,limit:-1}])assert.throws(()=>ctx.refreshOptions(raw))});
test('fixed and randomized delays remain in configured bounds',()=>{const {ctx}=setup();assert.equal(ctx.refreshDelay({minSeconds:30,maxSeconds:30}),30000);for(let i=0;i<100;i++){const delay=ctx.refreshDelay({minSeconds:30,maxSeconds:50});assert.ok(delay>=30000&&delay<=50000)}});
test('only the exact SAP home route is allowed',()=>{const {ctx}=setup();for(const url of ['https://example.com/#Shell-home','https://s4.sipal.com.br/sap/bc/ui2/flp#Monitor','https://login.microsoftonline.com/','https://s4.sipal.com.br/other#Shell-home'])assert.equal(ctx.refreshHome(url),false)});
test('active login assistance prevents all reloads',async()=>{for(const cfg of [{run:{active:true,phase:'login'}},{run:{active:true,phase:'waiting'}}]){const app=setup(cfg);await app.tick();assert.equal(app.calls.length,0);assert.equal(app.state.refreshState.enabled,true)}});
test('leaving SAP home pauses the job',async()=>{const app=setup({url:'https://s4.sipal.com.br/sap/bc/ui2/flp#Monitor'});await app.tick();assert.equal(app.calls.length,0);assert.equal(app.state.refreshState.enabled,false)});
test('visible SAP failure pauses without reload',async()=>{const app=setup({probe:{ready:true,failed:true}});await app.tick();assert.equal(app.calls.length,0);assert.equal(app.state.refreshState.enabled,false)});
test('busy page or editing defers the reload',async()=>{const app=setup({probe:{ready:true,blocked:true}});await app.tick();assert.equal(app.calls.length,0);assert.equal(app.state.refreshState.enabled,true)});
test('limit and bypass-cache option are enforced',async()=>{const app=setup({options:{limit:1,bypassCache:true}});await app.tick();assert.equal(app.calls.length,1);assert.equal(app.calls[0][1].bypassCache,true);assert.equal(app.state.refreshState.enabled,false);await app.tick();assert.equal(app.calls.length,1)});
test('changed text pauses monitoring, only its hash is stored',async()=>{const probe={ready:true,text:'initial'};const app=setup({probe});await app.tick();assert.equal(app.calls.length,1);assert.equal(app.state.refreshState.hash.length,64);probe.text='changed';app.state.refreshState.nextAt=0;await app.tick();assert.equal(app.calls.length,1);assert.equal(app.state.refreshState.changes,1);assert.equal(app.state.refreshState.enabled,false);assert.equal(JSON.stringify(app.state).includes('initial'),false)});
test('three inspection failures stop automatic retries',async()=>{const app=setup({failure:true});await app.tick();app.state.refreshState.nextAt=0;await app.tick();app.state.refreshState.nextAt=0;await app.tick();assert.equal(app.state.refreshState.enabled,false);assert.equal(app.calls.length,0)});

test('15 seconds and unlimited reloads are accepted',async()=>{const app=setup({options:{minSeconds:15,maxSeconds:15,limit:0,monitor:false}});assert.equal(app.ctx.refreshOptions({minSeconds:15,maxSeconds:15,limit:0}).limit,0);for(let i=0;i<12;i++){app.state.refreshState.nextAt=0;await app.tick()}assert.equal(app.calls.length,12);assert.equal(app.state.refreshState.enabled,true)});
test('early wake cannot cause premature reload',async()=>{const app=setup();app.state.refreshState.nextAt=Date.now()+15000;await app.tick();assert.equal(app.calls.length,0)});

test('toolbar badge switches from countdown to paused',async()=>{const app=setup();await app.tick();assert.match(app.badges.at(-1),/^00:30$/);await app.ctx.refreshPause(app.state.refreshState,'Pausado');assert.equal(app.badges.at(-1),'II')});
test('first countdown delay applies once; repeats use the regular interval',async()=>{const app=setup();const before=Date.now();await app.ctx.refreshSchedule(app.state.refreshState,60);assert.ok(app.state.refreshState.nextAt>=before+60000);app.state.refreshState.nextAt=0;await app.tick();assert.ok(app.state.refreshState.nextAt<=Date.now()+30000)});
test('a matching phrase pauses without sending another reload',async()=>{const probe={ready:true,text:'Inicial'};const app=setup({probe,options:{monitorText:'serviço disponível'}});await app.tick();probe.text='SERVIÇO DISPONÍVEL';app.state.refreshState.nextAt=0;await app.tick();assert.equal(app.calls.length,1);assert.equal(app.state.refreshState.enabled,false);assert.equal(app.state.refreshState.changes,1)});
test('countdown bounds and monitor phrase length are checked',()=>{const app=setup();for(const extra of [{firstDelaySeconds:-1},{firstDelaySeconds:604801},{monitorText:'x'.repeat(201)}])assert.throws(()=>app.ctx.refreshOptions({minSeconds:15,maxSeconds:15,limit:0,...extra}));assert.equal(app.ctx.refreshOptions({minSeconds:5,maxSeconds:5,limit:0,firstDelaySeconds:3}).firstDelaySeconds,3)});
test('100 refresh configurations respect busy states, limits and stop',async()=>{
 for(let i=0;i<100;i++){
  const limit=i%8,probe={ready:true,text:'inicial'},app=setup({probe,options:{minSeconds:1+i%30,maxSeconds:31+i%30,limit,monitor:false}});
  for(let step=0;step<20;step++){
   probe.blocked=step%5===0;const before=app.calls.length;app.state.refreshState.nextAt=0;
   await app.tick();if(probe.blocked)assert.equal(app.calls.length,before);
   if(limit>0)assert.ok(app.calls.length<=limit);
  }
  await app.ctx.refreshPause(app.state.refreshState,'Pausado');const before=app.calls.length;await app.tick();assert.equal(app.calls.length,before);
 }
});
