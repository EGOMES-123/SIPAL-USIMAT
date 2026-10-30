(()=>{
 if(globalThis.sapRobotRunner)return;globalThis.sapRobotRunner=true;
 let busy=false,stopped=false,lastSignature='',lastProgress=Date.now(),lastSend=0,reset=false,atEnd=0;
 const seen=new Set(),started=Date.now();let expectedAtStart=null;let timer,runSession=null;
 const report=async(message,phase='reading',extra={})=>chrome.runtime.sendMessage({type:'robot-progress',sessionId:runSession,phase,message,...extra});
 const finish=async(message,phase)=>{stopped=true;clearInterval(timer);globalThis.sapRobotRunner=false;globalThis.sapRobotTick=null;await report(message,phase)};
 const tick=async()=>{
  if(stopped||busy)return;busy=true;
  try{
   const run=await chrome.runtime.sendMessage({type:'robot-config'});if(!run?.active){stopped=true;clearInterval(timer);globalThis.sapRobotRunner=false;return;}
   runSession=run.sessionId;
   if(Date.now()-run.startedAt>90*60*1000){await finish('Limite de 90 minutos atingido. Captura parcial preservada; confira o SAP.','attention');return;}
   const snap=globalThis.sapReceiptCollect?.();
   if(run.mode==='login'){
    const ready=[...document.querySelectorAll('input[type="text"]')].some(e=>{try{return JSON.parse(e.getAttribute('lsdata')||'{}')['21']?.SID==='wnd[0]/usr/ctxtS_WERKS-LOW'}catch{return false}});
    if(ready||snap){await finish('Acesso ao Monitor de Recebimento confirmado. Teste encerrado sem executar consulta. Se a sessão já estava aberta, o login por senha não foi testado.','done');return;}
    await report('Teste de login: aguardando acesso à tela do monitor.','waiting');return;
   }
   if(!snap?.rows?.length){if(['sent','confirmed'].includes(run.queryExecuteState)&&(snap?.expectedRows===0||run.emptyConfirmed===true)){const ack=await chrome.runtime.sendMessage({type:'month-empty',sessionId:run.sessionId});if(ack?.ok)await finish('SAP confirmou período sem pesagens.','done');return;}globalThis.sapSelectionTick?.().catch(()=>{});return;}
   const signature=JSON.stringify(snap.rows);if(signature!==lastSignature){lastSignature=signature;lastProgress=Date.now();atEnd=0;}
   for(const r of snap.rows)seen.add(JSON.stringify([r.Centro||'',r.Pesagem,r.Item||'',r['ID EDC']||'']));
   if(expectedAtStart===null&&Number.isInteger(snap.expectedRows))expectedAtStart=snap.expectedRows;
   if(Date.now()-lastSend>1200){const result=await chrome.runtime.sendMessage({type:'snapshot',sessionId:run.sessionId,snapshot:snap});if(result?.error)throw Error(result.error);lastSend=Date.now();}
   // A new run starts from the top, retaining already observed rows.
   if(!reset){if(!(await chrome.runtime.sendMessage({type:'tab-authorize',token:run.leaseToken}))?.allowed)return;const initial=globalThis.sapGridScroll(snap,true);reset=true;await report('Tabela carregada. '+(initial.reason||'Iniciando rolagem da tabela.')+' '+seen.size+' registros lidos.');return;}
   if(!(await chrome.runtime.sendMessage({type:'tab-authorize',token:run.leaseToken}))?.allowed)return;
   const scroll=globalThis.sapGridScroll(snap);
   if(scroll.atEnd&&!scroll.moved)atEnd++;else atEnd=0;
   const expected=run.expectedTotal||snap.expectedRows;const stable=run.expectedTotal?true:expectedAtStart===snap.expectedRows;
   if(atEnd>=5){
    const coverage=Number.isInteger(expected)&&expected>0&&seen.size===expected&&stable;
    await chrome.runtime.sendMessage({type:'flush'});
    await finish(coverage?'Contagem conferida: '+seen.size+' registros lidos de '+expected+'. Confira o envio no painel.':'Captura INCOMPLETA: '+seen.size+' registros lidos'+(Number.isInteger(expected)?' de '+expected:'; total SAP não identificado')+'. A barra chegou ao fim antes de confirmar a cobertura.',coverage?'done':'attention');return;
   }
   if(!scroll.moved&&!scroll.atEnd&&Date.now()-lastProgress>30000){await finish(scroll.reason||'A tabela não avançou. Captura parcial preservada.','attention');return;}
   if(Date.now()-lastProgress>120000){await finish('Sem novas linhas por 2 minutos. Confira a tabela; captura parcial preservada.','attention');return;}
   await report('Leitura automática em andamento. '+seen.size+' registros únicos lidos'+(Number.isInteger(expected)?' de '+expected+' informadas pelo SAP.':'.'));
  }catch(e){await finish('Falha na leitura: '+e.message,'attention').catch(()=>{});}finally{busy=false;}
 };
 globalThis.sapStopRobotRunner=()=>{stopped=true;clearInterval(timer);globalThis.sapRobotRunner=false;globalThis.sapRobotTick=null};
 globalThis.sapRobotTick=tick;timer=setInterval(tick,2000);tick();
})();
