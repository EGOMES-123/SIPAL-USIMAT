const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../refresh-clock.js'),'utf8');
test('page clock updates every second but reload wake happens only at the deadline',async()=>{
 const timers=[],messages=[];let enabled=true,now=1000;const window={};window.top=window;
 const context={window,Date:{now:()=>now},setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length},clearTimeout(){},chrome:{runtime:{sendMessage:async msg=>{messages.push(msg.type);if(msg.type==='refresh-due')enabled=false;return msg.type==='refresh-clock-config'?{enabled,nextAt:16000}:{ok:true}}}}};
 vm.runInNewContext(code,context);await new Promise(resolve=>setImmediate(resolve));assert.equal(timers[0].delay,1000);
 for(let i=0;i<15;i++){now+=1000;await timers[i].callback();if(i<14)assert.equal(messages.includes('refresh-due'),false)}
 assert.equal(messages.filter(m=>m==='refresh-due').length,1);assert.equal(timers.length,15);
});
