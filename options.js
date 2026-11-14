const COOLDOWN_MS=48*60*60*1000;
function send(msg){return new Promise(resolve=>chrome.runtime.sendMessage(msg,resolve));}
function show(id){["setupView","codeView","activeView","freeView"].forEach(v=>document.getElementById(v).style.display=v===id?"block":"none");}
function fmtLeft(ms){const n=Math.floor(ms/60000),d=Math.floor(n/1440),h=Math.floor((n%1440)/60);return `あと ${d}日 ${h}時間`;}

async function renderPlanetTheme(){
  const state=await send({type:"GET_PLANET_STATE"});
  if(window.YoutubeSealPlanetTheme) window.YoutubeSealPlanetTheme.apply(state?.level||1);
}
async function renderAuth(){
  const state=await send({type:"GET_AUTH_STATE"});
  document.getElementById("authStatus").textContent=state.signedIn?`ログイン中：${state.email}`:"未ログイン（封印機能はローカルで動作します）";
  document.getElementById("authForm").style.display=state.signedIn?"none":"block";
  document.getElementById("logoutBtn").style.display=state.signedIn?"inline-block":"none";
}
async function authAction(type){
  const email=document.getElementById("authEmail").value.trim(),password=document.getElementById("authPassword").value;
  const message=document.getElementById("authMessage");message.textContent="処理中…";
  const result=await send({type,email,password});
  if(result?.ok){message.textContent=result.needsEmailConfirmation?"確認メールを送信しました。メール内のリンクを開いてからログインしてください。":"認証しました。セッション記録が同期されます。";}
  else message.textContent=result?.error||"認証に失敗しました。";
  await renderAuth();
  await renderCheat();
}
document.getElementById("loginBtn").addEventListener("click",()=>authAction("AUTH_LOGIN"));
document.getElementById("signupBtn").addEventListener("click",()=>authAction("AUTH_SIGNUP"));
document.getElementById("logoutBtn").addEventListener("click",async()=>{const r=await send({type:"AUTH_LOGOUT"});document.getElementById("authMessage").textContent=r?.ok?"ログアウトしました。":r?.error;await renderAuth();await renderCheat();});

async function renderCheat(){
  const panel=document.getElementById("cheatPanel");
  const status=await send({type:"GET_CHEAT_STATUS"});
  panel.hidden=!status?.authorized;
  if(!status?.authorized) return;
  document.getElementById("cheatStatus").textContent=
    "現在の惑星："+status.growthPoints+" Growth points / Level "+status.level+
    (status.activeTestSessionId?" ／ テストセッション進行中":" ／ テストセッションなし");
  document.getElementById("completeTestBtn").disabled=!status.activeTestSessionId;
  document.getElementById("cancelTestBtn").disabled=!status.activeTestSessionId;
  document.getElementById("startTestBtn").disabled=!!status.activeTestSessionId;
}
async function cheatAction(type,extra={}){
  const message=document.getElementById("cheatMessage");
  message.textContent="処理中…";
  const result=await send({type,...extra});
  message.textContent=result?.ok?"更新しました。ダッシュボードを再読み込みすると反映されます。":(result?.error||"処理に失敗しました。");
  await renderCheat();
}
document.getElementById("createCompletedTestBtn").addEventListener("click",()=>cheatAction("CHEAT_CREATE_COMPLETED",{minutes:document.getElementById("cheatMinutes").value}));
document.getElementById("startTestBtn").addEventListener("click",()=>cheatAction("CHEAT_START_SESSION",{minutes:document.getElementById("cheatMinutes").value}));
document.getElementById("completeTestBtn").addEventListener("click",()=>cheatAction("CHEAT_FINISH_SESSION",{status:"completed"}));
document.getElementById("cancelTestBtn").addEventListener("click",()=>cheatAction("CHEAT_FINISH_SESSION",{status:"cancelled"}));
document.getElementById("setGrowthBtn").addEventListener("click",()=>cheatAction("CHEAT_SET_GROWTH_POINTS",{value:document.getElementById("cheatGrowthPoints").value}));
document.getElementById("setLevelBtn").addEventListener("click",()=>cheatAction("CHEAT_SET_LEVEL",{value:document.getElementById("cheatLevel").value}));

async function render(){
  const state=await send({type:"GET_STATE"});
  if(!state.setupDone){show("setupView");return;}
  const left=state.lockEndDate?state.lockEndDate-Date.now():0;
  if(left>0){
    show("activeView");
    document.getElementById("statusText").textContent="解除予定日時: "+new Date(state.lockEndDate).toLocaleString("ja-JP");
    document.getElementById("countdownText").textContent=fmtLeft(left);
    const pending=state.pendingUnlock;
    if(pending){
      document.getElementById("noRequestView").style.display="none";document.getElementById("pendingView").style.display="block";
      const remaining=COOLDOWN_MS-(Date.now()-pending.requestedAt);
      if(remaining>0){document.getElementById("cooldownText").textContent="クールダウン中: "+fmtLeft(remaining)+" 待つとコード入力が可能になります。";document.getElementById("codeEntry").style.display="none";}
      else{document.getElementById("cooldownText").textContent="クールダウン終了。コードを入力すると解除できます。";document.getElementById("codeEntry").style.display="block";}
    }else{document.getElementById("noRequestView").style.display="block";document.getElementById("pendingView").style.display="none";}
  }else show("freeView");
}
async function start(daysInputId){
  const days=parseInt(document.getElementById(daysInputId).value,10)||14;
  const res=await send({type:"SETUP",days});
  if(!res?.code){document.getElementById("authMessage").textContent=res?.error||"封印を開始できませんでした。";return;}
  document.getElementById("codeBox").textContent=res.code;
  document.getElementById("syncMessage").textContent=res.sync?.synced?"Planetubeにセッションを同期しました。":res.sync?.error?"ローカルで開始しました。同期エラー："+res.sync.error:"ローカルで開始しました。ログインすると次のセッションから同期されます。";
  show("codeView");
}
document.getElementById("startBtn").addEventListener("click",()=>start("daysInput"));
document.getElementById("restartBtn").addEventListener("click",()=>start("restartDays"));
document.getElementById("codeDoneBtn").addEventListener("click",render);
document.getElementById("extendBtn").addEventListener("click",async()=>{const days=parseInt(document.getElementById("extendDays").value,10)||7;await send({type:"EXTEND",days});render();});
document.getElementById("requestUnlockBtn").addEventListener("click",async()=>{await send({type:"REQUEST_UNLOCK"});render();});
document.getElementById("cancelRequestBtn").addEventListener("click",async()=>{await send({type:"CANCEL_UNLOCK_REQUEST"});render();});
document.getElementById("confirmUnlockBtn").addEventListener("click",async()=>{const code=document.getElementById("unlockCodeInput").value.trim(),res=await send({type:"CONFIRM_UNLOCK",code});if(!res.ok)document.getElementById("unlockError").textContent=res.error;else render();});
renderAuth();renderCheat();renderPlanetTheme();render();setInterval(render,30000);