const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../coletor-sap/background.js'),'utf8');
async function check(age,evidence){
 let listener;
 const run={tabId:1,sessionId:'run',phase:'waiting',queryExecuteState:'confirmed',queryExecutedAt:Date.now()-age};
 const context={importScripts(){},sapQueryEvidence(){},ownsSapTab:async()=>true,chrome:{runtime:{onMessage:{addListener(fn){listener=fn}}},storage:{local:{get:async()=>({robotRun:run}),set:async()=>{}}},scripting:{executeScript:async()=>evidence.map(result=>({result}))}}};
 vm.runInNewContext(code,context);
 return new Promise(resolve=>listener({type:'check-query'},{tab:{id:1},url:'https://s4.sipal.com.br/'},resolve));
}
test('search acknowledgement does not mean table ready',async()=>{
 const result=await check(3000,[{searchSeen:true,searching:false,rows:0}]);
 assert.equal(result.confirmed,true);assert.equal(result.tableReady,false);assert.match(result.message,/aguardando/);
});
test('actual rows mark table ready',async()=>{assert.equal((await check(3000,[{rows:4}])).tableReady,true)});
test('confirmed query without rows times out even when SAP stays busy',async()=>{
 const result=await check(601000,[{searchSeen:true,rows:0,busy:true}]);
 assert.equal(result.fatal,true);assert.match(result.message,/10 minutos/);
});
