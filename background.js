const COOLDOWN_MS = 48 * 60 * 60 * 1000;
const SUPABASE_URL = "https://htpjpdagmbkkoqotdgzt.supabase.co";
const SUPABASE_KEY = "sb_publishable_ov9YvLEofcISee8BcKoc5g_EqZSOxvm";

async function getState() {
  return chrome.storage.local.get(["lockEndDate","codeHash","pendingUnlock","setupDone","sessionStartedAt","plannedDurationMinutes","cloudSessionId","authSession"]);
}
async function setState(patch) { return chrome.storage.local.set(patch); }
function msLeft(end) { return end ? Math.max(0, end - Date.now()) : 0; }

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(15))).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function updateBadge() {
  const {lockEndDate}=await getState(), left=msLeft(lockEndDate);
  if(left<=0){chrome.action.setBadgeText({text:""});return;}
  chrome.action.setBadgeText({text:String(Math.ceil(left/86400000))});
  chrome.action.setBadgeBackgroundColor({color:"#c0392b"});
}

async function sbRequest(path, options={}, token=null) {
  const response=await fetch(SUPABASE_URL+path,{
    ...options,
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:"Bearer "+(token||SUPABASE_KEY),
      "Content-Type":"application/json",
      ...(options.headers||{})
    }
  });
  const raw=await response.text();
  let data=null; try{data=raw?JSON.parse(raw):null;}catch{}
  if(!response.ok) throw new Error(data?.msg||data?.message||data?.error_description||data?.error||raw||("Supabase error "+response.status));
  return data;
}

async function currentToken() {
  const {authSession}=await getState();
  if(!authSession?.refresh_token) return null;
  if(authSession.expires_at && authSession.expires_at>Date.now()+60000) return authSession.access_token;
  const refreshed=await sbRequest("/auth/v1/token?grant_type=refresh_token",{
    method:"POST",body:JSON.stringify({refresh_token:authSession.refresh_token})
  });
  await setState({authSession:{...refreshed,expires_at:Date.now()+(refreshed.expires_in||3600)*1000}});
  return refreshed.access_token;
}
async function saveAuthSession(session) {
  if(!session?.access_token) return {needsEmailConfirmation:true};
  await setState({authSession:{...session,expires_at:Date.now()+(session.expires_in||3600)*1000}});
  const token=session.access_token, userId=session.user?.id;
  if(userId){
    await sbRequest("/rest/v1/ys_profiles",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates"},body:JSON.stringify({user_id:userId})},token);
    await sbRequest("/rest/v1/ys_planets",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates"},body:JSON.stringify({user_id:userId})},token);
  }
  return {ok:true,email:session.user?.email};
}
async function syncSessionStart(startedAt, durationMinutes) {
  const token=await currentToken();
  if(!token) return {synced:false};
  const {authSession}=await getState();
  const rows=await sbRequest("/rest/v1/ys_seal_sessions",{
    method:"POST",headers:{"Prefer":"return=representation"},
    body:JSON.stringify({user_id:authSession.user.id,started_at:new Date(startedAt).toISOString(),planned_duration_minutes:durationMinutes,status:"active"})
  },token);
  await setState({cloudSessionId:rows?.[0]?.id||null});
  return {synced:true};
}
async function syncSessionUpdate(patch) {
  const {cloudSessionId}=await getState();
  if(!cloudSessionId) return;
  const token=await currentToken(); if(!token) return;
  await sbRequest("/rest/v1/ys_seal_sessions?id=eq."+encodeURIComponent(cloudSessionId),{
    method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(patch)
  },token);
}
async function getAuthState() {
  const {authSession}=await getState();
  return {signedIn:!!authSession?.access_token,email:authSession?.user?.email||null};
}

chrome.runtime.onInstalled.addListener(async()=>{
  const {setupDone}=await getState();
  if(!setupDone) chrome.tabs.create({url:chrome.runtime.getURL("options.html?first=1")});
  chrome.alarms.create("tick",{periodInMinutes:30}); updateBadge();
});
chrome.runtime.onStartup.addListener(updateBadge);
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(alarm.name!=="tick") return;
  const s=await getState();
  if(s.lockEndDate && s.lockEndDate<=Date.now() && s.cloudSessionId){
    try{await syncSessionUpdate({ended_at:new Date(s.lockEndDate).toISOString(),status:"completed"});await setState({cloudSessionId:null});}catch(e){console.warn("Session sync pending",e);}
  }
  updateBadge();
});

chrome.webNavigation.onBeforeNavigate.addListener(async details=>{
  if(details.frameId!==0)return;
  const {lockEndDate,setupDone}=await getState();
  if(!setupDone||msLeft(lockEndDate)<=0)return;
  const blockedUrl=chrome.runtime.getURL(`blocked.html?until=${lockEndDate}`);
  chrome.tabs.update(details.tabId,{url:blockedUrl});
},{url:[{hostSuffix:"youtube.com"},{hostSuffix:"youtu.be"},{hostSuffix:"youtube-nocookie.com"}]});

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  (async()=>{
    try{
      switch(msg.type){
        case "GET_STATE": sendResponse(await getState()); break;
        case "GET_AUTH_STATE": sendResponse(await getAuthState()); break;
        case "AUTH_SIGNUP": {
          const data=await sbRequest("/auth/v1/signup",{method:"POST",body:JSON.stringify({email:msg.email,password:msg.password})});
          sendResponse(data?.access_token?await saveAuthSession(data):{ok:true,needsEmailConfirmation:true}); break;
        }
        case "AUTH_LOGIN": {
          const data=await sbRequest("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:msg.email,password:msg.password})});
          sendResponse(await saveAuthSession(data)); break;
        }
        case "AUTH_LOGOUT": {
          const token=await currentToken();
          if(token) await sbRequest("/auth/v1/logout",{method:"POST"},token);
          await setState({authSession:null}); sendResponse({ok:true}); break;
        }
        case "SETUP": {
          const days=Math.max(1,Math.min(3650,Number(msg.days)||14));
          const code=randomCode(), codeHash=await sha256(code), startedAt=Date.now(), duration=days*1440;
          const lockEndDate=startedAt+duration*60000;
          await setState({lockEndDate,codeHash,setupDone:true,pendingUnlock:null,sessionStartedAt:startedAt,plannedDurationMinutes:duration,cloudSessionId:null});
          let sync={synced:false};
          try{sync=await syncSessionStart(startedAt,duration);}catch(e){sync={synced:false,error:e.message};}
          updateBadge(); sendResponse({code,lockEndDate,sync}); break;
        }
        case "EXTEND": {
          const s=await getState(), days=Math.max(1,Math.min(3650,Number(msg.days)||7));
          const base=Math.max(s.lockEndDate||Date.now(),Date.now()), newEnd=base+days*86400000;
          const duration=Math.ceil((newEnd-(s.sessionStartedAt||Date.now()))/60000);
          await setState({lockEndDate:newEnd,plannedDurationMinutes:duration});
          try{await syncSessionUpdate({planned_duration_minutes:duration});}catch(e){console.warn("Session extension sync failed",e);}
          updateBadge(); sendResponse({ok:true,lockEndDate:newEnd}); break;
        }
        case "REQUEST_UNLOCK": await setState({pendingUnlock:{requestedAt:Date.now()}});sendResponse({ok:true});break;
        case "CANCEL_UNLOCK_REQUEST": await setState({pendingUnlock:null});sendResponse({ok:true});break;
        case "CONFIRM_UNLOCK": {
          const s=await getState();
          if(!s.pendingUnlock){sendResponse({ok:false,error:"先に解除リクエストをしてください。"});break;}
          if(Date.now()-s.pendingUnlock.requestedAt<COOLDOWN_MS){sendResponse({ok:false,error:"まだクールダウン期間中です。"});break;}
          if(await sha256(msg.code||"")!==s.codeHash){sendResponse({ok:false,error:"コードが一致しません。"});break;}
          await setState({lockEndDate:Date.now(),pendingUnlock:null});
          try{await syncSessionUpdate({ended_at:new Date().toISOString(),status:"cancelled"});await setState({cloudSessionId:null});}catch(e){console.warn("Unlock sync failed",e);}
          updateBadge();sendResponse({ok:true});break;
        }
        default: sendResponse({ok:false,error:"unknown message"});
      }
    }catch(error){sendResponse({ok:false,error:error.message||"処理に失敗しました。"});}
  })();
  return true;
});
