const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.testState={settings:{account:'',enabled:false},run:null,refresh:null};window.chrome={runtime:{getManifest:()=>({version:'1.8.0'}),sendMessage:async msg=>{
   const s=window.testState;
   if(msg.type==='session-info')return s;
   if(msg.type==='settings-save'){s.settings={account:msg.account,enabled:msg.enabled};return {ok:true}}
   if(msg.type==='session-start'){s.run={message:'Sessão em verificação.'};return {ok:true}}
   if(msg.type==='refresh-start'){s.refresh={message:'Programado.',enabled:true,nextAt:Date.now()+15000,options:msg.options,count:0,changes:0};return s.refresh}
   if(msg.type==='refresh-stop'){s.refresh.enabled=false;s.refresh.message='Atualização pausada.';return s.refresh}
   if(msg.type==='pause-all'){s.settings.enabled=false;s.run={message:'Tudo pausado.'};s.refresh={message:'Atualização pausada.',enabled:false};return {ok:true}}
   return {ok:true};
  }},tabs:{query:async()=>[{id:7}]}}});
  await page.route('https://fixture.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1)||'popup.html';if(!['popup.html','popup.js','timer-view.js','style.css'].includes(name))return route.abort();return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,name),'utf8')})});
  await page.goto('https://fixture.test/popup.html');await page.locator('#tab-session').click();await page.locator('#account').fill('test@example.com');await page.locator('#enabled').check();await page.locator('#verify').click();await page.waitForFunction(()=>document.getElementById('sessionStatus').textContent.includes('em verificação'));
  await page.locator('#tab-interval').click();await page.locator('[data-mode=random]').click();await page.locator('#min').fill('60');await page.locator('#max').fill('120');await page.locator('#startRefresh').click();await page.waitForFunction(()=>document.getElementById('refreshStatus').textContent.includes('Programado'));
  assert.equal(await page.evaluate(()=>testState.refresh.options.maxSeconds),120);
  assert.match(await page.locator('#countdown').textContent(),/^00:1[45]$/);
  await page.waitForFunction(()=>Number(document.getElementById('countdown').textContent.split(':')[1])<=14,{},{timeout:5000});
  await page.locator('#pauseAll').click();await page.locator('#tab-session').click();await page.waitForFunction(()=>document.getElementById('sessionStatus').textContent.includes('Tudo pausado'));assert.equal(await page.locator('#enabled').isChecked(),false);assert.equal(await page.evaluate(()=>testState.refresh.enabled),false);assert.equal(await page.locator('#countdown').textContent(),'Pausado');assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(13, 28, 24)');assert.equal(await page.locator('.watermark').textContent(),'USIMAT - ADM');
  await page.locator('#tab-timer').click();await page.locator('#timerSeconds').fill('3');await page.locator('#startRefresh').click();
  assert.equal(await page.evaluate(()=>testState.refresh.options.firstDelaySeconds),3);assert.equal(await page.evaluate(()=>testState.refresh.options.limit),1);
  await page.locator('#startRefresh').click();assert.equal(await page.evaluate(()=>testState.refresh.enabled),false);
  await page.locator('#tab-monitor').click();await page.locator('#monitorText').fill('Serviço disponível');await page.locator('#stopChange').check();await page.locator('#tab-interval').click();await page.locator('#startRefresh').click();
  assert.equal(await page.evaluate(()=>testState.refresh.options.monitorText),'Serviço disponível');await page.locator('#startRefresh').click();

  await page.screenshot({path:path.join(root,'preview.png'),fullPage:true});
  const probePage=await context.newPage();await probePage.setContent('<input id="check" type="checkbox" checked><input id="text" type="text" value="Valor padrão SAP">');
  const source=fs.readFileSync(path.join(root,'refresh.js'),'utf8');await probePage.addScriptTag({content:source.slice(source.indexOf('function refreshProbe(){'),source.indexOf('\nlet refreshFlight'))});
  await probePage.addScriptTag({path:path.join(root,'interaction-guard.js')});
  assert.equal((await probePage.evaluate(()=>refreshProbe())).blocked,false);
  await probePage.locator('#text').fill('Digitado pelo usuário');assert.equal((await probePage.evaluate(()=>refreshProbe())).summary.editedFields,1);
  await probePage.locator('#text').fill('');assert.equal((await probePage.evaluate(()=>refreshProbe())).blocked,false);
  // Real Microsoft-like DOM; all runtime APIs simulated, no authentication request.
  const login=await context.newPage();await login.route('https://login.microsoftonline.com/**',route=>route.fulfill({contentType:'text/html',body:'<div id="lightbox" style="position:absolute;left:100px;top:200px;width:400px;height:300px"><div id="displayName">test@example.com</div><input id="i0118" type="password" value="fixture-only"><input id="idSIButton9" type="submit" value="Entrar"></div><script>window.clicks=0;document.getElementById("idSIButton9").onclick=e=>{e.preventDefault();window.clicks++}</script>'}));
  await login.goto('https://login.microsoftonline.com/fixture');await login.evaluate(()=>{window.backgroundClicks=0;window.chrome.runtime={sendMessage:async msg=>{if(msg.type==='login-background-click'){window.backgroundClicks++;return {ok:true}}return msg.type==='session-config'?{active:true,account:'test@example.com',sessionId:'fixture'}:{ok:true}}}});await login.addScriptTag({path:path.join(root,'login.js')});await login.waitForFunction(()=>window.clicks===1,{},{timeout:8000});await login.waitForTimeout(1500);assert.equal(await login.evaluate(()=>window.clicks),1);assert.equal(await login.evaluate(()=>window.backgroundClicks),1);
  console.log('PASS: popup standalone configura sessão, inicia atualização e pausa os dois motores; login em DOM simulado envia Entrar uma única vez. Nenhum SAP ou Microsoft real acessado.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
