const SUPABASE_URL = "https://htpjpdagmbkkoqotdgzt.supabase.co";
const SUPABASE_KEY = "sb_publishable_ov9YvLEofcISee8BcKoc5g_EqZSOxvm";
const SESSION_KEY = "youtubeseal-web-auth-v1";
let authSession = readSession();
let profile = null, planet = null, sessions = [];

function $(id){ return document.getElementById(id); }
function readSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null");}catch{return null;} }
function saveSession(session){
  authSession = {...session, expires_at:Date.now()+(session.expires_in||3600)*1000};
  localStorage.setItem(SESSION_KEY,JSON.stringify(authSession));
}
function clearSession(){ authSession=null; localStorage.removeItem(SESSION_KEY); }
async function api(path, options={}, token=null){
  const response=await fetch(SUPABASE_URL+path,{
    ...options,
    headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+(token||SUPABASE_KEY),"Content-Type":"application/json",...(options.headers||{})}
  });
  const raw=await response.text(); let data=null;
  try{data=raw?JSON.parse(raw):null;}catch{}
  if(!response.ok) throw new Error(data?.msg||data?.message||data?.error_description||data?.error||raw||("HTTP "+response.status));
  return data;
}
async function accessToken(){
  if(!authSession?.refresh_token) return null;
  if(authSession.expires_at>Date.now()+60000) return authSession.access_token;
  const refreshed=await api("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:authSession.refresh_token})});
  saveSession(refreshed);
  return authSession.access_token;
}
async function signIn(email,password){
  const result=await api("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});
  saveSession(result);
}
async function signUp(email,password){
  const result=await api("/auth/v1/signup",{method:"POST",body:JSON.stringify({email,password})});
  if(result?.access_token) saveSession(result);
  else return {confirmation:true};
  return {confirmation:false};
}
async function signOut(){
  try{const token=await accessToken();if(token) await api("/auth/v1/logout",{method:"POST"},token);}finally{clearSession();}
}
async function loadData(){
  const token=await accessToken();
  if(!token) throw new Error("Please log in again.");
  const user=authSession.user;
  if(!user?.id) throw new Error("The login session has no user ID. Please log in again.");
  const uid=encodeURIComponent(user.id);
  const [profiles,planets,rows]=await Promise.all([
    api("/rest/v1/ys_profiles?select=user_id,display_name,created_at&user_id=eq."+uid,{},token),
    api("/rest/v1/ys_planets?select=user_id,growth_points,level,updated_at&user_id=eq."+uid,{},token),
    api("/rest/v1/ys_seal_sessions?select=id,started_at,ended_at,planned_duration_minutes,status,created_at,is_test&user_id=eq."+uid+"&order=started_at.desc&limit=100",{},token)
  ]);
  profile=profiles?.[0]||null; planet=planets?.[0]||null; sessions=rows||[];
  if(!profile){
    await api("/rest/v1/ys_profiles",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({user_id:user.id})},token);
    profile={user_id:user.id,display_name:null};
  }
  if(!planet){
    await api("/rest/v1/ys_planets",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({user_id:user.id})},token);
    planet={growth_points:0,level:1};
  }
  renderData();
}
function durationMinutes(row){
  if(!row.started_at||!row.ended_at) return 0;
  const elapsed=Math.max(0,(new Date(row.ended_at)-new Date(row.started_at))/60000);
  const planned=Number(row.planned_duration_minutes)||elapsed;
  return Math.min(elapsed,planned);
}
function formatDuration(minutes){
  const total=Math.round(minutes),h=Math.floor(total/60),m=total%60;
  if(h===0)return m+"m";
  if(m===0)return h+"h";
  return h+"h "+m+"m";
}
function safe(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function formatDate(value){return value?new Date(value).toLocaleString():"—";}
function statusLabel(status){return ({active:"Active",paused:"Paused",completed:"Completed",cancelled:"Cancelled"})[status]||status||"Unknown";}
function sessionMarkup(row){
  const mins=durationMinutes(row);
  const testTag=row.is_test?'<span class="test-tag">TEST</span>':'';
  return `<div class="session-row"><div class="session-icon">${row.status==="completed"?"✦":row.status==="active"?"◷":"○"}</div><div class="session-main"><strong>${safe(statusLabel(row.status))} commitment ${testTag}</strong><small>Started: ${safe(formatDate(row.started_at))}</small><small>${row.ended_at?"Ended: "+safe(formatDate(row.ended_at)):"Not ended yet"}</small></div><div class="session-meta"><b>${formatDuration(mins)}</b><small>of ${Number(row.planned_duration_minutes)||0} min planned</small></div></div>`;
}
function renderData(){
  const email=authSession.user?.email||"Signed in";
  const displayName=profile?.display_name||email.split("@")[0];
  $("user-name").textContent=displayName;
  $("user-email").textContent=email;
  $("avatar").textContent=(displayName[0]||"?").toUpperCase();
  $("welcome-title").textContent="Welcome back, "+displayName+".";
  $("planet-name").textContent=displayName+"'s planet";
  $("planet-level").textContent="Level "+(planet?.level??1);
  $("level-number").textContent=planet?.level??1;
  $("growth-points").textContent=planet?.growth_points??0;
  $("growth-note").textContent=(planet?.growth_points??0)===0?"Your planet is at its starting point. Growth points are not being awarded by the extension yet.":"Your current growth points are read from Planetube.";
  const completed=sessions.filter(s=>s.status==="completed");
  const active=sessions.filter(s=>s.status==="active"||s.status==="paused");
  const minutes=completed.reduce((sum,s)=>sum+durationMinutes(s),0);
  $("protected-time").textContent=formatDuration(minutes);
  $("completed-count").textContent=completed.length;
  $("active-count").textContent=active.length;
  $("total-count").textContent=sessions.length;
  $("recent-list").innerHTML=sessions.slice(0,5).map(sessionMarkup).join("")||'<p class="empty">No seal sessions have been synced to this account yet. Start a new seal in the extension while logged in, then refresh this page.</p>';
  $("history-list").innerHTML=sessions.map(sessionMarkup).join("")||'<p class="empty">No session records yet.</p>';
  $("history-count").textContent=sessions.length+" records";
}
function showSignedIn(){
  $("auth-panel").hidden=true;$("dashboard").hidden=false;
  $("logout").hidden=false;$("refresh").hidden=false;
  $("connection").textContent="Connected to Planetube";$("connection").classList.add("online");
}
function showSignedOut(){
  $("auth-panel").hidden=false;$("dashboard").hidden=true;
  $("logout").hidden=true;$("refresh").hidden=true;
  $("connection").textContent="Not connected";$("connection").classList.remove("online");
  $("user-name").textContent="Not signed in";$("user-email").textContent="Connect your account";$("avatar").textContent="?";
}
async function connectExistingSession(){
  if(!authSession?.refresh_token){showSignedOut();return;}
  try{await loadData();showSignedIn();}catch(error){clearSession();showSignedOut();$("auth-message").textContent="Could not load account data: "+error.message;}
}
$("auth-form").addEventListener("submit",async event=>{
  event.preventDefault();$("auth-message").textContent="Signing in…";
  try{await signIn($("email").value.trim(),$("password").value);await loadData();showSignedIn();$("password").value="";}
  catch(error){$("auth-message").textContent="Login or data loading failed: "+error.message;}
});
$("signup").addEventListener("click",async()=>{
  $("auth-message").textContent="Creating account…";
  try{const result=await signUp($("email").value.trim(),$("password").value);if(result.confirmation){$("auth-message").textContent="Account created. Check your email for the confirmation link, then log in here and in the extension.";}else{await loadData();showSignedIn();$("auth-message").textContent="Account created and connected.";$("password").value="";}}
  catch(error){$("auth-message").textContent="Account creation failed: "+error.message;}
});
$("logout").addEventListener("click",async()=>{try{await signOut();}catch(error){console.warn(error);}showSignedOut();});
$("refresh").addEventListener("click",async()=>{const btn=$("refresh");btn.disabled=true;try{await loadData();}catch(error){$("connection").textContent="Sync error";$("auth-message").textContent=error.message;}finally{btn.disabled=false;}});
document.querySelectorAll(".nav").forEach(button=>button.addEventListener("click",()=>go(button.dataset.page)));
document.querySelectorAll("[data-go]").forEach(button=>button.addEventListener("click",()=>go(button.dataset.go)));
function go(page){
  document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
  document.querySelectorAll(".nav").forEach(el=>el.classList.toggle("active",el.dataset.page===page));
  $("page-title").textContent=({home:"Your planet",history:"Seal history",friends:"Friends"})[page]||"YoutubeSeal";
}
connectExistingSession();
