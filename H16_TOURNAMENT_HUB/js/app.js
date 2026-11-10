(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const cfg = window.H16_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let session = null, profile = null, tournamentFilter = "all", guildCache = [], tournamentCache = [];

  const toast = (msg) => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3000); };
  const esc = (v="") => String(v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const empty = (msg) => `<div class="empty-state">${esc(msg)}</div>`;
  const date = (v) => v ? new Date(v).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "Date TBA";

  function showView(name) {
    $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
    $$("[data-view]").forEach(a=>a.classList.toggle("active",a.dataset.view===name));
    $("#mainNav").classList.remove("open");
    if(name==="guilds") loadGuilds();
    if(name==="tournaments") loadTournaments();
    if(name==="leaderboard") loadLeaderboard();
    if(name==="hall") loadHall();
    if(name==="dashboard") loadDashboard();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  $$("[data-view]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();showView(el.dataset.view)}));
  $("#mobileMenu").addEventListener("click",()=>$("#mainNav").classList.toggle("open"));

  function openModal(mode) {
    const titles={login:"WELCOME BACK",signup:"JOIN THE ARENA",guild:"REGISTER YOUR GUILD",tournament:"CREATE TOURNAMENT"};
    const descriptions={login:"Log in to your H16 account.",signup:"Create your player account and enter the competition.",guild:"Submit your guild for H16 approval.",tournament:"Publish a new competition for registered guilds."};
    $("#modalTitle").textContent=titles[mode]; $("#modalDesc").textContent=descriptions[mode];
    $("#formMessage").textContent=""; $("#modalForm").dataset.mode=mode;
    let fields="";
    const input=(name,label,type="text",placeholder="")=>`<div class="form-group"><label>${label}</label><input class="field" name="${name}" type="${type}" placeholder="${placeholder}" ${name==="email"||name==="password"||name==="name"?"required":""}></div>`;
    if(mode==="login"||mode==="signup"){fields=input("email","EMAIL ADDRESS","email","you@example.com")+input("password","PASSWORD","password","At least 8 characters");if(mode==="signup")fields=input("name","DISPLAY NAME","text","Your player name")+fields;}
    if(mode==="guild")fields=input("guild_name","GUILD NAME","text","Your guild name")+input("tag","GUILD TAG","text","Short tag")+input("game","GAME / TITLE","text","Game name")+`<div class="form-group"><label>DESCRIPTION</label><textarea class="field" name="description" rows="3" placeholder="Tell the community about your guild"></textarea></div>`;
    if(mode==="tournament")fields=input("title","TOURNAMENT TITLE","text","H16 Championship")+input("game","GAME","text","Game title")+`<div class="form-group"><label>START DATE</label><input class="field" name="starts_at" type="datetime-local" required></div>`+input("prize","PRIZE / REWARD","text","Optional") ;
    $("#modalFields").innerHTML=fields; $("#modalSubmit").textContent=mode==="login"?"LOG IN ↗":mode==="signup"?"CREATE ACCOUNT ↗":mode==="guild"?"SUBMIT GUILD ↗":"CREATE TOURNAMENT ↗";
    $("#modalFoot").innerHTML=mode==="login"?'New to H16? <button type="button" data-switch="signup">Create an account</button>':mode==="signup"?'Already registered? <button type="button" data-switch="login">Log in</button>':"Your submission will be stored in the H16 database.";
    $("#modalBackdrop").classList.remove("hidden");
    $("#modalFoot").querySelector("[data-switch]")?.addEventListener("click",()=>openModal(mode==="login"?"signup":"login"));
  }
  function closeModal(){$("#modalBackdrop").classList.add("hidden")}
  $("#modalClose").addEventListener("click",closeModal);
  $("#modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal()});
  $("#loginBtn").addEventListener("click",()=>openModal("login"));
  $("#signupBtn").addEventListener("click",()=>openModal("signup"));
  $("#logoutBtn").addEventListener("click",async()=>{if(db)await db.auth.signOut();session=null;profile=null;updateAuthUI();showView("home");toast("You have logged out.");});
  $$("[data-action]").forEach(el=>el.addEventListener("click",()=>{const mode=el.dataset.action;if(!session){openModal("signup");return;}if(mode==="join")showView("dashboard");else openModal(mode)}));

  $("#modalForm").addEventListener("submit",async e=>{
    e.preventDefault(); const mode=e.currentTarget.dataset.mode; const data=Object.fromEntries(new FormData(e.currentTarget).entries());
    $("#formMessage").textContent="";
    if(!db){$("#formMessage").textContent="Supabase is not configured yet. Add your project URL and anon key in js/config.js, then reload.";return;}
    const btn=$("#modalSubmit");btn.disabled=true;btn.textContent="PLEASE WAIT...";
    try{
      if(mode==="signup"){
        const {data:res,error}=await db.auth.signUp({email:data.email,password:data.password,options:{data:{display_name:data.name}}});if(error)throw error;
        if(res.session){session=res.session;await fetchProfile();}else toast("Check your email to confirm your account.");
      } else if(mode==="login"){
        const {data:res,error}=await db.auth.signInWithPassword({email:data.email,password:data.password});if(error)throw error;session=res.session;await fetchProfile();
      } else if(mode==="guild"){
        if(!profile)throw new Error("Your profile is still loading. Please try again.");
        const {error}=await db.from("guilds").insert({name:data.guild_name,tag:data.tag.toUpperCase(),game:data.game,description:data.description,leader_id:session.user.id,status:"pending"});if(error)throw error;
        toast("Guild submitted for admin approval.");closeModal();loadGuilds();loadDashboard();
      } else if(mode==="tournament"){
        const {error}=await db.from("tournaments").insert({title:data.title,game:data.game,starts_at:new Date(data.starts_at).toISOString(),prize:data.prize,status:"upcoming",created_by:session.user.id});if(error)throw error;
        toast("Tournament created.");closeModal();loadTournaments();
      }
      if(mode==="signup"||mode==="login"){closeModal();updateAuthUI();showView("dashboard");toast("Welcome to H16 Tournament Hub.");}
    }catch(err){$("#formMessage").textContent=err.message||"Something went wrong.";}
    finally{btn.disabled=false;btn.textContent=mode==="login"?"LOG IN ↗":mode==="signup"?"CREATE ACCOUNT ↗":mode==="guild"?"SUBMIT GUILD ↗":"CREATE TOURNAMENT ↗";}
  });

  async function fetchProfile(){
    if(!db||!session)return;
    let {data,error}=await db.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
    if(error)throw error;
    if(!data){const name=session.user.user_metadata?.display_name||session.user.email.split("@")[0];const ins=await db.from("profiles").insert({id:session.user.id,display_name:name}).select().single();if(ins.error)throw ins.error;data=ins.data;}
    profile=data;
  }
  function updateAuthUI(){
    const logged=!!session;$("#loginBtn").classList.toggle("hidden",logged);$("#signupBtn").classList.toggle("hidden",logged);$("#logoutBtn").classList.toggle("hidden",!logged);$("#userLabel").textContent=logged?(profile?.display_name||session.user.email.split("@")[0]):"";
  }
  async function init(){
    $("#year").textContent=new Date().getFullYear();
    if(!db){toast("Add Supabase keys in js/config.js to activate live data.");renderDemo();}
    else{
      const {data}=await db.auth.getSession();session=data.session;
      if(session){try{await fetchProfile()}catch(e){toast(e.message)}}
      db.auth.onAuthStateChange(async(_event,s)=>{session=s;if(s){setTimeout(async()=>{try{await fetchProfile()}catch(e){}updateAuthUI()},0)}else{profile=null;updateAuthUI()}});
      await Promise.all([loadStats(),loadGuilds(),loadTournaments()]);
    }
    updateAuthUI();
  }
  function renderDemo(){
    $("#statGuilds").textContent="—";$("#statTournaments").textContent="—";$("#statMatches").textContent="—";
    $("#homeTournaments").innerHTML=empty("Connect your Supabase project to display live tournament data.");
    $("#guildList").innerHTML=empty("Guild directory will appear after Supabase setup.");
    $("#tournamentList").innerHTML=empty("Tournament listings will appear after Supabase setup.");
    $("#leaderboardRows").innerHTML='<tr><td colspan="5">Connect Supabase to load rankings.</td></tr>';
    $("#hallList").innerHTML=empty("Hall of Fame entries will appear here.");
  }
  async function loadStats(){
    if(!db)return;
    const count=async(table,column,value)=>{let q=db.from(table).select("*",{count:"exact",head:true});if(column)q=q.eq(column,value);const r=await q;return r.count??0};
    const [g,t,m]=await Promise.all([count("guilds","status","approved"),count("tournaments"),count("matches","status","approved")]);
    $("#statGuilds").textContent=g;$("#statTournaments").textContent=t;$("#statMatches").textContent=m;
  }
  async function loadGuilds(){
    if(!db)return;
    const {data,error}=await db.from("guilds").select("id,name,tag,game,description,status,points,wins,losses").eq("status","approved").order("points",{ascending:false}).limit(60);
    if(error){$("#guildList").innerHTML=empty(error.message);return;}guildCache=data||[];renderGuilds();
  }
  function renderGuilds(){
    const q=($("#guildSearch")?.value||"").toLowerCase();const list=guildCache.filter(g=>(g.name+" "+g.tag+" "+g.game).toLowerCase().includes(q));
    $("#guildList").innerHTML=list.length?list.map(g=>`<article class="guild-card"><div class="card-top"><div class="game-icon">${esc((g.tag||"H16").slice(0,4))}</div><span class="status">APPROVED</span></div><h3>${esc(g.name)}</h3><p>${esc(g.description||g.game||"H16 registered guild")}</p><div class="card-meta"><span>${esc(g.game||"Gaming")}</span><span>${g.wins||0} WINS</span><span>${g.points||0} PTS</span></div></article>`).join(""):empty("No approved guilds found yet.");
  }
  $("#guildSearch").addEventListener("input",renderGuilds);
  async function loadTournaments(){
    if(!db)return;
    const {data,error}=await db.from("tournaments").select("*").order("starts_at",{ascending:true}).limit(60);
    if(error){$("#tournamentList").innerHTML=empty(error.message);return;}tournamentCache=data||[];renderTournaments();
    $("#homeTournaments").innerHTML=tournamentCache.slice(0,3).map(eventCard).join("")||empty("No tournaments published yet.");
    $("#createTournamentBtn").classList.toggle("hidden",!["admin","moderator"].includes(profile?.role));
  }
  function eventCard(t){return `<article class="event-card"><div class="card-top"><div class="game-icon">H16</div><span class="status ${t.status==="completed"?"completed":t.status==="pending"?"pending":""}">${esc((t.status||"upcoming").toUpperCase())}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.game||"Tournament")} ${t.prize?"· "+esc(t.prize):""}</p><div class="card-meta"><span>◷ ${date(t.starts_at)}</span><span>${esc(t.format||"Guild event")}</span></div></article>`}
  function renderTournaments(){const list=tournamentFilter==="all"?tournamentCache:tournamentCache.filter(t=>t.status===tournamentFilter);$("#tournamentList").innerHTML=list.map(eventCard).join("")||empty("No tournaments in this category.");}
  $$(".filter").forEach(b=>b.addEventListener("click",()=>{$$(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");tournamentFilter=b.dataset.filter;renderTournaments()}));
  async function loadLeaderboard(){
    if(!db)return;const {data,error}=await db.from("guilds").select("id,name,tag,wins,losses,points").eq("status","approved").order("points",{ascending:false}).limit(50);
    $("#leaderboardRows").innerHTML=error?`<tr><td colspan="5">${esc(error.message)}</td></tr>`:(data||[]).map((g,i)=>`<tr><td>#${i+1}</td><td class="guild-name-cell">${esc(g.name)} <span class="muted">[${esc(g.tag)}]</span></td><td>${g.wins||0}</td><td>${g.losses||0}</td><td><strong>${g.points||0}</strong></td></tr>`).join("")||'<tr><td colspan="5">No approved guilds yet.</td></tr>';
  }
  async function loadHall(){
    if(!db)return;const {data,error}=await db.from("hall_of_fame").select("*").order("created_at",{ascending:false}).limit(30);
    $("#hallList").innerHTML=error?empty(error.message):(data||[]).map(h=>`<article class="guild-card"><div class="card-top"><div class="game-icon">★</div><span class="status">CHAMPION</span></div><h3>${esc(h.title)}</h3><p>${esc(h.description||"H16 Hall of Fame")}</p><div class="card-meta"><span>${date(h.created_at)}</span></div></article>`).join("")||empty("Champions will be featured here.");
  }
  async function loadDashboard(){
    if(!db||!session){return;}
    if(!profile)await fetchProfile();
    $("#profileName").textContent=profile.display_name;$("#profileEmail").textContent=session.user.email;$("#profileRole").textContent=(profile.role||"member").toUpperCase();$("#profileAvatar").textContent=(profile.display_name||"H16").slice(0,3).toUpperCase();
    $("#adminPanel").classList.toggle("hidden",!["admin","moderator"].includes(profile.role));
    const {data:guilds}=await db.from("guilds").select("*").eq("leader_id",session.user.id).order("created_at",{ascending:false});
    $("#myGuildCount").textContent=(guilds||[]).length;$("#myGuilds").innerHTML=(guilds||[]).map(g=>`<div class="stack-item"><span>${esc(g.name)} <small class="muted">[${esc(g.tag)}]</small></span><span class="status ${g.status==="approved"?"":"pending"}">${esc(g.status.toUpperCase())}</span></div>`).join("")||"No guilds registered yet.";
    const {data:matches}=await db.from("matches").select("*").or(`submitted_by.eq.${session.user.id}`).order("created_at",{ascending:false}).limit(10);
    $("#myMatches").textContent=(matches||[]).length;$("#myWins").textContent=(matches||[]).filter(m=>m.status==="approved"&&m.winner_id).length;
    $("#myMatchList").innerHTML=(matches||[]).map(m=>`<div class="stack-item"><span>${esc(m.title||"Match submission")}</span><span class="status ${m.status==="approved"?"":"pending"}">${esc(m.status.toUpperCase())}</span></div>`).join("")||"No match activity yet.";
    if(["admin","moderator"].includes(profile.role))loadAdminQueue();
  }
  async function loadAdminQueue(){
    const {data,error}=await db.from("guilds").select("id,name,tag,status").eq("status","pending").limit(20);
    $("#adminQueue").innerHTML=error?esc(error.message):(data||[]).map(g=>`<div class="stack-item"><span>${esc(g.name)} [${esc(g.tag)}]</span><span><button class="btn btn-primary" data-approve="${g.id}">APPROVE</button> <button class="btn btn-ghost" data-reject="${g.id}">REJECT</button></span></div>`).join("")||"No pending guild approvals.";
    $$("[data-approve]").forEach(b=>b.addEventListener("click",()=>moderateGuild(b.dataset.approve,"approved")));
    $$("[data-reject]").forEach(b=>b.addEventListener("click",()=>moderateGuild(b.dataset.reject,"rejected")));
  }
  async function moderateGuild(id,status){const {error}=await db.from("guilds").update({status}).eq("id",id);if(error)toast(error.message);else{toast("Guild "+status+".");loadAdminQueue();loadGuilds();}}
  init();
})();