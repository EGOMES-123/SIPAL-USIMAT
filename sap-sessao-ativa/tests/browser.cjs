const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.testState={settings:{account:'',enabled:false},run:null,refresh:null};window.chrome={runtime:{getManifest:()=>({version:'1.0.0'}),sendMessage:async msg=>{
   const s=window.testState;
   if(msg.type==='session-info')return s;
   if(msg.type==='settings-save'){s.settings={account:msg.account,enabled:msg.enabled};return {ok:true}}
   if(msg.type==='session-start'){s.run={message:'Sessão em verificação.'};return {ok:true}}
   if(msg.type==='refresh-start'){s.refresh={message:'Programado.',enabled:true,options:msg.options,count:0,changes:0};return s.refresh}
   if(msg.type==='pause-all'){s.settings.enabled=false;s.run={message:'Tudo pausado.'};s.refresh={message:'Atualização pausada.',enabled:false};return {ok:true}}
   return {ok:true};
  }},tabs:{query:async()=>[{id:7}]}}});
  await page.route('https://fixture.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1)||'popup.html';if(!['popup.html','popup.js','style.css'].includes(name))return route.abort();return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,name),'utf8')})});
  await page.goto('https://fixture.test/popup.html');await page.locator('#account').fill('test@example.com');await page.locator('#enabled').check();await page.locator('#verify').click();await page.waitForFunction(()=>document.getElementById('sessionStatus').textContent.includes('em verificação'));
  await page.locator('#min').fill('60');await page.locator('#max').fill('120');await page.locator('#startRefresh').click();await page.waitForFunction(()=>document.getElementById('refreshStatus').textContent.includes('Programado'));
  assert.equal(await page.evaluate(()=>testState.refresh.options.maxSeconds),120);
  await page.locator('#pauseAll').click();await page.waitForFunction(()=>document.getElementById('sessionStatus').textContent.includes('Tudo pausado'));assert.equal(await page.locator('#enabled').isChecked(),false);assert.equal(await page.evaluate(()=>testState.refresh.enabled),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(root,'preview.png'),fullPage:true});
  // Real Microsoft-like DOM; all runtime APIs simulated, no authentication request.
  const login=await context.newPage();await login.route('https://login.microsoftonline.com/**',route=>route.fulfill({contentType:'text/html',body:'<div id="displayName">test@example.com</div><input id="i0118" type="password" value="fixture-only"><input id="idSIButton9" type="submit" value="Entrar"><script>window.clicks=0;document.getElementById("idSIButton9").onclick=e=>{e.preventDefault();window.clicks++}</script>'}));
  await login.goto('https://login.microsoftonline.com/fixture');await login.evaluate(()=>{window.chrome.runtime={sendMessage:async msg=>msg.type==='session-config'?{active:true,account:'test@example.com',sessionId:'fixture'}:{ok:true}}});await login.addScriptTag({path:path.join(root,'login.js')});await login.waitForFunction(()=>window.clicks===1,{},{timeout:8000});await login.waitForTimeout(1500);assert.equal(await login.evaluate(()=>window.clicks),1);
  console.log('PASS: popup standalone configura sessão, inicia atualização e pausa os dois motores; login em DOM simulado envia Entrar uma única vez. Nenhum SAP ou Microsoft real acessado.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
