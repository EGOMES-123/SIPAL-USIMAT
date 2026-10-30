// Runs only in the owned Microsoft login tab; passwords never enter storage or messages.
(()=>{
 if(location.hostname!=='login.microsoftonline.com')return;
 globalThis.goLoginStop?.();let stopped=false;globalThis.goLoginStop=()=>{stopped=true;clearInterval(timer)};
 const acted=new Set();let busy=false,lastPassword=null,readySince=null,lastStage='';
 const visible=e=>{
  if(!e?.isConnected||!e.getBoundingClientRect().width||!e.getBoundingClientRect().height)return false;
  const css=getComputedStyle(e);return css.visibility!=='hidden'&&css.display!=='none';
 };
 const enabled=e=>visible(e)&&!e.disabled&&!e.matches(':disabled')&&e.getAttribute('aria-disabled')!=='true';
 const label=e=>String(e?.value||e?.textContent||'').trim();
 const signIn=e=>/^(?:Entrar|Sign in|Iniciar sessão|Iniciar sesión)$/i.test(label(e));
 const submit=()=>document.getElementById('idSIButton9');
 function passwordField(){
  const fields=[...document.querySelectorAll('input[type="password"]')].filter(visible);
  const known=fields.find(e=>e.id==='i0118'||e.name==='passwd');
  return known||(fields.length===1?fields[0]:null);
 }
 function exactAccount(account){
  const visibleEmails=[...document.querySelectorAll('#displayName,#userDisplayName,[data-test-id="displayName"]')].filter(visible).filter(e=>e.textContent.includes('@'));
  if(visibleEmails.length)return visibleEmails.some(e=>e.textContent.trim().toLowerCase()===account);
  const emails=(document.body.innerText||'').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[];
  return emails.some(email=>email.toLowerCase()===account);
 }
 function autofilled(input){for(const selector of [':autofill',':-webkit-autofill']){try{if(input.matches(selector))return true;}catch{}}return false;}
 async function stage(code,message){
  if(code===lastStage)return;lastStage=code;
  await chrome.runtime.sendMessage({type:'robot-progress',phase:'login',code,message});
 }
 // Wait again after a person or Chrome updates the field; never keep a password copy.
 for(const type of ['input','change'])document.addEventListener(type,event=>{
  if(event.isTrusted&&event.target===lastPassword)readySince=null;
 },true);
 const timer=setInterval(async()=>{
  if(stopped||busy)return;busy=true;
  try{
   // The worker bounds maintenance attempts; an active collection retains its own deadline.
   const run=await chrome.runtime.sendMessage({type:'robot-config'});
   if(!run?.active){readySince=null;return;}
   const account=String(run.account||'').trim().toLowerCase();if(!account){readySince=null;return;}
   const text=document.body.innerText||'',button=submit(),sameAccount=exactAccount(account);
   const error=document.getElementById('passwordError');
   if(visible(error)&&String(error.textContent||'').trim()){
    acted.add('signin');readySince=null;
    await stage('microsoft-error','A Microsoft informou um erro de senha/login. Confira a credencial salva; não serão feitas novas submissões nesta página.');return;
   }
   if(/(?:Continuar conectado\?|Stay signed in\?)/i.test(text)&&sameAccount&&enabled(button)&&/^(?:Sim|Yes)$/i.test(label(button))&&!acted.has('stay')){
    acted.add('stay');button.click();await stage('stay','Continuar conectado confirmado para a conta configurada.');return;
   }
   if(/(?:Escolha uma conta|Pick an account)/i.test(text)&&!acted.has('account')){
    const labels=[...document.querySelectorAll('span,div,p,a,button')].filter(e=>visible(e)&&e.textContent.trim().toLowerCase()===account);
    const leaves=labels.filter(e=>!labels.some(child=>child!==e&&e.contains(child)));
    const targets=[...new Set(leaves.map(e=>e.closest('[data-test-id="userTile"],.tile,.table,[role="button"],button,a,[tabindex]')||e))].filter(visible);
    if(targets.length===1){acted.add('account');targets[0].click();await stage('account-selected','Conta configurada selecionada. Aguardando a senha.');return;}
   }
   const password=passwordField();
   if(password){
    if(acted.has('signin')){await stage('submitted','Entrar já foi acionado uma vez. Aguardando a resposta da Microsoft.');return;}
    if(lastPassword!==password){lastPassword=password;readySince=null;}
    if(!sameAccount){readySince=null;await stage('account-mismatch','A conta exibida não corresponde exatamente ao e-mail configurado. Confira a janela de login.');return;}
    if(!enabled(password)){readySince=null;await stage('password-disabled','O campo de senha está desabilitado pela página. Aguardando liberação.');return;}
    if(!password.value){
     readySince=null;
     await stage(autofilled(password)?'password-preview':'password-empty',autofilled(password)?'O Chrome mostra a senha, mas ainda não liberou o valor para envio. Abra a aba Microsoft do robô e confirme o preenchimento salvo.':'Aguardando senha salva no Chrome. Abra a aba Microsoft do robô para conferir o preenchimento.');return;
    }
    if(!visible(button)||!signIn(button)){readySince=null;await stage('button-missing','Senha disponível, mas o botão Entrar não foi identificado. Confira a janela de login.');return;}
    if(!enabled(button)){readySince=null;await stage('button-disabled','Senha disponível, mas o botão Entrar está desabilitado. Aguardando a página.');return;}
    if(readySince===null)readySince=Date.now();
    await stage('password-ready','Senha disponível no campo. Aguardando pelo menos 2 segundos antes de Entrar.');
    if(Date.now()-readySince>=2000){
     password.dispatchEvent(new Event('input',{bubbles:true,composed:true}));password.dispatchEvent(new Event('change',{bubbles:true}));
     if(passwordField()!==password||!enabled(password)||!password.value||!enabled(button)||!signIn(button)||!exactAccount(account)){readySince=null;return;}
     acted.add('signin');button.click();await stage('submitted','Entrar acionado uma vez. Aguardando resposta da Microsoft; o clique não confirma o login.');
    }
    return;
   }
   const email=document.getElementById('i0116')||document.querySelector('input[type="email"]');
   if(enabled(email)&&enabled(button)&&/^(?:Avançar|Seguinte|Next)$/i.test(label(button))&&!acted.has('email')){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(email,account);email.dispatchEvent(new Event('input',{bubbles:true}));email.dispatchEvent(new Event('change',{bubbles:true}));
    if(!enabled(email)||email.value.trim().toLowerCase()!==account||!enabled(button)||!/^(?:Avançar|Seguinte|Next)$/i.test(label(button)))return;
    acted.add('email');button.click();await stage('email-entered','E-mail configurado preenchido. Aguardando a próxima etapa da Microsoft.');return;
   }
   await stage('mfa-or-unknown','Aguardando a próxima etapa do login. MFA ou uma tela não reconhecida exige conferência na janela auxiliar.');
  }catch(error){
   readySince=null;
   // Worker wake-up failures can recover; an invalidated extension context cannot.
   if(/Extension context invalidated/i.test(String(error?.message||error)))clearInterval(timer);
  }finally{busy=false;}
 },1000);
})();
