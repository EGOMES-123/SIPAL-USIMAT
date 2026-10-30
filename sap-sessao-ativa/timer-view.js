function refreshTimerView(state,run,now=Date.now()){
 if(run?.active)return {text:'Login em andamento',badge:'LOGIN',color:'#ac6b19',title:'Aguardando a assistência de login terminar.'};
 if(!state?.enabled)return {text:'Pausado',badge:state?'II':'',color:'#66796f',title:'Atualização desativada.'};
 const seconds=Math.max(0,Math.ceil(((state.nextAt||now)-now)/1000));
 const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
 const text=(hours?hours+':':'')+String(minutes).padStart(2,'0')+':'+String(rest).padStart(2,'0');
 const waiting=/^Aguardando/.test(state.message||'');
 return {text,badge:waiting?'ESP':hours?hours+'h':text,color:waiting?'#ac6b19':'#008c63',title:(waiting?'Aguardando condição segura. Nova verificação em ':'Próxima atualização em ')+text,seconds};
}
if(typeof module!=='undefined')module.exports={refreshTimerView};
