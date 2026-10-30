const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../refresh-clock.js'),'utf8');
test('page clock schedules a 15-second wake and stops after pause',async()=>{
 const timers=[],messages=[];let enabled=true;const window={};window.top=window;
 const context={window,Date:{now:()=>1000},setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length},clearTimeout(){},chrome:{runtime:{sendMessage:async msg=>{messages.push(msg.type);return msg.type==='refresh-clock-config'?{enabled,nextAt:16000}:{ok:true}}}}};
 vm.runInNewContext(code,context);await new Promise(resolve=>setImmediate(resolve));assert.equal(timers[0].delay,15000);enabled=false;await timers[0].callback();assert.ok(messages.includes('refresh-due'));assert.equal(timers.length,1);
});
