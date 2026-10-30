// Browser DOM checks. Does not install the extension or authenticate to SAP.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
(async()=>{
 const extension=path.resolve(__dirname,'../coletor-sap');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();
  await context.route('https://s4.sipal.com.br/**',route=>route.fulfill({contentType:'text/html',body:'<button id="execute" lsdata=\'{"17":{"SID":"wnd[0]/tbar[1]/btn[8]"}}\' style="width:50px;height:30px">▶</button><script>window.clicks=0;document.getElementById("execute").onclick=()=>window.clicks++;</script>'}));
  const page=await context.newPage();await page.goto('https://s4.sipal.com.br/test');
  await page.addScriptTag({path:path.join(extension,'execute.js')});
  assert.equal((await page.evaluate(()=>sapExecuteButton(true))).clicked,true);assert.equal(await page.evaluate(()=>window.clicks),1);
  await page.evaluate(()=>{
   document.body.innerHTML='';
   for(const sid of ['ctxtS_WERKS-LOW','ctxtS_WERKS-HIGH','ctxtS_DATA-LOW','ctxtS_DATA-HIGH','ctxtP_VAR']){
    const input=document.createElement('input');input.type='text';input.setAttribute('lsdata',JSON.stringify({99:{SID:'wnd[0]/usr/'+sid}}));document.body.append(input);
   }
   window.executeRequests=0;window.chrome.runtime={sendMessage:async msg=>{
    if(msg.type==='tab-authorize')return {allowed:true,mode:'collect'};
    if(msg.type==='robot-config')return {active:true,mode:'collect'};
    if(msg.type==='execute-query'){window.executeRequests++;return {clicked:true}};
   }};
  });
  await page.addScriptTag({path:path.join(extension,'selection.js')});
  assert.equal((await page.evaluate(()=>sapFillSelection())).retryable,true);
  await page.evaluate(()=>{sapCommittedFilters.at=Date.now()-5000});
  assert.equal((await page.evaluate(()=>sapFillSelection())).clicked,true);
  assert.equal(await page.evaluate(()=>window.executeRequests),1);
  assert.equal(await page.locator('input').first().inputValue(),'1301');
  // Actual HTML and JS, with Chrome APIs mocked: this is not an extension installation test.
  const popup=await context.newPage();const errors=[];popup.on('pageerror',e=>errors.push(e.message));
  await popup.addInitScript(()=>{
   window.chrome={runtime:{getManifest:()=>({version:'0.33.0'}),sendMessage:async msg=>{
    if(msg.type==='session-settings'){window.savedAccount=msg.account;return {sessionAccount:msg.account,sessionEnabled:msg.enabled}}
    if(msg.type==='session-info')return {sessionAccount:window.savedAccount||'',sessionEnabled:false};
    if(msg.type==='get')return null;return {};
   }},tabs:{query:async()=>[{id:1}]}};
  });
  await popup.route('https://fixture.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1)||'popup.html';if(!['popup.html','popup.js'].includes(name))return route.abort();return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(extension,name),'utf8')})});
  await popup.goto('https://fixture.test/popup.html');await popup.locator('#sessionAccount').fill('test@example.com');await popup.locator('#sessionSave').click();await popup.waitForFunction(()=>document.getElementById('sessionStatus').textContent.includes('Configuração salva'));
  assert.equal(await popup.locator('#extensionVersion').textContent(),'v0.33.0');assert.deepEqual(errors,[]);
  console.log('PASS: botão SAP por SID recebeu clique; filtros SAP foram preenchidos e solicitaram Executar; popup salvou configuração sem erros com APIs Chrome simuladas.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
