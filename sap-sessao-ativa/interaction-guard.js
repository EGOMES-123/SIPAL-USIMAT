(()=>{
 if(window!==window.top||globalThis.sapSessionInteractionGuard)return;
 globalThis.sapSessionInteractionGuard=true;globalThis.sapSessionDirtyInputs=new Set();
 document.addEventListener('input',event=>{
  if(!event.isTrusted)return;
  const e=event.target;if(!e?.matches?.('textarea,input:not([type]),input[type="text"],input[type="search"],input[type="email"],[contenteditable="true"]'))return;
  if(String(e.value??e.textContent??'').trim())globalThis.sapSessionDirtyInputs.add(e);else globalThis.sapSessionDirtyInputs.delete(e);
 },true);
})();
