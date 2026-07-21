/* ===========================================================
   MAALWALA — app logic (API-backed, localStorage fallback)

   If window.MAALWALA_API_BASE is set (see config.js) and reachable,
   all reads/writes go through the backend in /server so data is
   shared across devices. If it's empty or unreachable, everything
   falls back to this browser's local storage, same as the
   standalone demo — the app never breaks either way.
=========================================================== */

const API_BASE = (window.MAALWALA_API_BASE || '').replace(/\/$/, '');
const USE_API = Boolean(API_BASE);

function cid(){ return 'id' + Math.random().toString(36).slice(2,10); }

// ---------- Theme (dark/light) ----------
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('mw_theme', theme);
}
(function initTheme(){
  const saved = localStorage.getItem('mw_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
})();
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ---------- Mobile drawer menu ----------
const menuToggle = document.getElementById('menuToggle');
const mobileDrawer = document.getElementById('mobileDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
function openDrawer(){
  mobileDrawer.classList.add('open'); drawerBackdrop.classList.add('open'); menuToggle.classList.add('open');
}
function closeDrawer(){
  mobileDrawer.classList.remove('open'); drawerBackdrop.classList.remove('open'); menuToggle.classList.remove('open');
}
menuToggle.addEventListener('click', ()=> mobileDrawer.classList.contains('open') ? closeDrawer() : openDrawer());
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
mobileDrawer.querySelectorAll('.nav-tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{ showScreen(btn.dataset.screen); closeDrawer(); });
});
document.getElementById('postLoadBtnDrawer').addEventListener('click', ()=>{ closeDrawer(); openModal('loadModal'); });
document.getElementById('bookTruckBtnTop').addEventListener('click', ()=> showScreen('trucks'));
document.getElementById('bookTruckBtnDrawer').addEventListener('click', ()=>{ closeDrawer(); showScreen('trucks'); });

// ---------- Topbar scroll shadow ----------
const topbarEl = document.getElementById('topbar');
window.addEventListener('scroll', ()=>{
  topbarEl.classList.toggle('scrolled', window.scrollY > 8);
}, {passive:true});

// ---------- Trust section tabs (timeline / gallery / achievements) ----------
document.getElementById('trustTabs').addEventListener('click', e=>{
  const btn = e.target.closest('.trust-tab');
  if(!btn) return;
  document.querySelectorAll('.trust-tab').forEach(t=>t.classList.toggle('active', t===btn));
  ['timeline','gallery','achievements'].forEach(k=>{
    document.getElementById('trust-'+k).classList.toggle('hidden', k!==btn.dataset.trust);
  });
});

// ---------- Hero stat count-up ----------
function animateCount(el, target){
  const duration = 900; const start = performance.now(); const from = 0;
  target = Number(target) || 0;
  function step(now){
    const p = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- Local storage layer (fallback / offline mode) ----------
const LocalDB = {
  get(key, fallback){
    try{ const v = localStorage.getItem('mw_'+key); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  },
  set(key, val){ localStorage.setItem('mw_'+key, JSON.stringify(val)); }
};

// ---------- Unified async data layer ----------
async function apiGet(path, fallbackKey, fallbackDefault){
  if(USE_API){
    try{
      const r = await fetch(API_BASE + path);
      if(r.ok) return await r.json();
    }catch(e){ /* fall through to local */ }
  }
  return LocalDB.get(fallbackKey, fallbackDefault);
}
async function apiPost(path, body, fallbackKey){
  if(USE_API){
    try{
      const r = await fetch(API_BASE + path, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      if(r.ok) return await r.json();
    }catch(e){ /* fall through to local */ }
  }
  if(fallbackKey){
    const item = {...body, id: cid(), ts: Date.now()};
    const list = LocalDB.get(fallbackKey, []);
    list.unshift(item);
    LocalDB.set(fallbackKey, list);
    return item;
  }
  return body;
}
async function apiDelete(path, fallbackKey, id){
  if(USE_API){
    try{
      const r = await fetch(API_BASE + path, {method:'DELETE'});
      if(r.ok || r.status===204) return true;
    }catch(e){ /* fall through to local */ }
  }
  if(fallbackKey){
    LocalDB.set(fallbackKey, LocalDB.get(fallbackKey, []).filter(i=>i.id!==id));
  }
  return true;
}

const Loads = {
  all: ()=> apiGet('/api/loads', 'loads', []),
  create: (item)=> apiPost('/api/loads', item, 'loads'),
};
const Trucks = {
  all: ()=> apiGet('/api/trucks', 'trucks', []),
  create: (item)=> apiPost('/api/trucks', item, 'trucks'),
};
const Groups = {
  all: ()=> apiGet('/api/groups', 'groups', []),
  create: (item)=> apiPost('/api/groups', item, 'groups'),
  remove: (id)=> apiDelete('/api/groups/'+id, 'groups', id),
};
const Contacts = {
  all: ()=> apiGet('/api/contacts', 'contacts', []),
};
const SavedSearches = {
  all: ()=> apiGet('/api/saved-searches', 'savedSearches', []),
  create: (item)=> apiPost('/api/saved-searches', item, 'savedSearches'),
  remove: (id)=> apiDelete('/api/saved-searches/'+id, 'savedSearches', id),
};
const FleetPositions = {
  latest: async ()=>{
    if(!USE_API) return [];
    try{
      const r = await fetch(API_BASE + '/api/fleet/positions');
      if(r.ok) return await r.json();
    }catch(e){}
    return [];
  },
};
const Records = {
  all: async (kind)=>{
    if(!USE_API) return LocalDB.get('records_'+kind, []);
    try{
      const r = await fetch(API_BASE + '/api/records?kind=' + encodeURIComponent(kind));
      if(r.ok) return await r.json();
    }catch(e){}
    return LocalDB.get('records_'+kind, []);
  },
  create: async (kind, item)=>{
    const payload = {...item, kind};
    if(!USE_API){
      const full = {...payload, id: cid(), ts: Date.now()};
      const list = LocalDB.get('records_'+kind, []); list.unshift(full); LocalDB.set('records_'+kind, list);
      return full;
    }
    try{
      const r = await fetch(API_BASE + '/api/records', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      if(r.ok) return await r.json();
    }catch(e){}
    return null;
  },
  update: async (id, patch, kind)=>{
    if(!USE_API){
      const list = LocalDB.get('records_'+kind, []);
      const idx = list.findIndex(r=>r.id===id);
      if(idx>-1) list[idx] = {...list[idx], ...patch};
      LocalDB.set('records_'+kind, list);
      return;
    }
    try{ await fetch(API_BASE + '/api/records/'+id, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch)}); }catch(e){}
  },
  remove: async (id, kind)=>{
    if(!USE_API){
      LocalDB.set('records_'+kind, LocalDB.get('records_'+kind, []).filter(r=>r.id!==id));
      return;
    }
    try{ await fetch(API_BASE + '/api/records/'+id, {method:'DELETE'}); }catch(e){}
  },
};
const Auth = {
  getToken: ()=> localStorage.getItem('mw_token'),
  getUser: ()=> { try{ return JSON.parse(localStorage.getItem('mw_user')||'null'); }catch(e){ return null; } },
  setSession: (token, user)=>{ localStorage.setItem('mw_token', token); localStorage.setItem('mw_user', JSON.stringify(user)); },
  clearSession: ()=>{ localStorage.removeItem('mw_token'); localStorage.removeItem('mw_user'); },
  signup: async (businessName, email, password)=>{
    if(!USE_API) throw new Error('Connect a backend first (see config.js) — accounts need a server to store them.');
    const r = await fetch(API_BASE + '/api/auth/signup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({businessName, email, password})});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Sign up failed');
    return data;
  },
  login: async (email, password)=>{
    if(!USE_API) throw new Error('Connect a backend first (see config.js) — accounts need a server to store them.');
    const r = await fetch(API_BASE + '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Sign in failed');
    return data;
  },
  logout: async ()=>{
    const token = Auth.getToken();
    if(USE_API && token){ try{ await fetch(API_BASE + '/api/auth/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token})}); }catch(e){} }
    Auth.clearSession();
  },
};
const Profile = {
  get: ()=> apiGet('/api/profile', 'profile', {name:'', role:'Transporter', city:'', phone:'', gst:'', drivers:[]}),
  save: (p)=> apiPost('/api/profile', p).then(res=>{ LocalDB.set('profile', p); return res; }),
};
async function whatsappStatus(){
  if(!USE_API) return {configured:false};
  try{
    const r = await fetch(API_BASE + '/api/whatsapp/status');
    if(r.ok) return await r.json();
  }catch(e){}
  return {configured:false};
}
async function officialBroadcast(message){
  const r = await fetch(API_BASE + '/api/whatsapp/broadcast', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message})
  });
  return r.json();
}

// ---------- Seed local demo data (only used when running without a backend, first run) ----------
function seedLocalIfEmpty(){
  if(USE_API) return;
  if(LocalDB.get('loads', null) === null){
    LocalDB.set('loads', [
      {id:cid(), from:'Ahmedabad', to:'Indore', material:'Cotton Bales', weight:14, truckType:'Open Body', rate:38000, date:'2026-07-18', poster:'Patel Roadlines', phone:'9825000001', ts:Date.now()-3600e3},
      {id:cid(), from:'Surat', to:'Pune', material:'Textile Rolls', weight:9, truckType:'Container', rate:29500, date:'2026-07-17', poster:'Shree Ganesh Transport', phone:'9825000002', ts:Date.now()-7200e3},
      {id:cid(), from:'Rajkot', to:'Delhi', material:'Ceramic Tiles', weight:18, truckType:'Trailer', rate:64000, date:'2026-07-19', poster:'Om Logistics', phone:'9825000003', ts:Date.now()-10800e3},
      {id:cid(), from:'Vadodara', to:'Nagpur', material:'Chemicals (Drums)', weight:12, truckType:'Tanker', rate:41000, date:'2026-07-20', poster:'Narmada Carriers', phone:'9825000004', ts:Date.now()-5400e3},
    ]);
  }
  if(LocalDB.get('trucks', null) === null){
    LocalDB.set('trucks', [
      {id:cid(), from:'Ahmedabad', to:'Anywhere Mumbai side', truckType:'Open Body', capacity:16, date:'2026-07-17', poster:'Desai Fleet Owners', phone:'9825000011', ts:Date.now()-4000e3},
      {id:cid(), from:'Indore', to:'Ahmedabad / Rajkot', truckType:'Container', capacity:10, date:'2026-07-18', poster:'Malwa Transport Co.', phone:'9825000012', ts:Date.now()-9000e3},
      {id:cid(), from:'Jaipur', to:'Anywhere North', truckType:'Trailer', capacity:20, date:'2026-07-19', poster:'Rajputana Roadways', phone:'9825000013', ts:Date.now()-2000e3},
    ]);
  }
  if(LocalDB.get('groups', null) === null){ LocalDB.set('groups', []); }
  if(LocalDB.get('profile', null) === null){ LocalDB.set('profile', {name:'', role:'Transporter', city:'', phone:'', gst:'', drivers:[]}); }
}

// ---------- Background slideshows ----------
const SLIDESHOW_IMAGES = ['slide-1.jpg', 'slide-2.jpg'];

function initSlideshow(containerId, intervalMs, startDelayMs){
  const el = document.getElementById(containerId);
  if(!el || !SLIDESHOW_IMAGES.length) return;
  el.innerHTML = SLIDESHOW_IMAGES.map((src,i)=>
    `<div class="slide${i===0?' active':''}" style="background-image:url('${src}')"></div>`
  ).join('');
  const slides = el.querySelectorAll('.slide');
  if(slides.length < 2) return;
  let current = 0;
  setTimeout(()=>{
    setInterval(()=>{
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, intervalMs);
  }, startDelayMs);
}
initSlideshow('heroSlideshow', 6000, 0);
initSlideshow('siteBg', 6000, 3000); // offset so the two don't crossfade in perfect sync

// ---------- Navigation ----------
const screens = ['home','loads','trucks','fleet','records','broadcast','profile','terms','payment','signin','signup'];
document.getElementById('footerYear').textContent = new Date().getFullYear();
function showScreen(name){
  screens.forEach(s=>{
    document.getElementById('screen-'+s).classList.toggle('hidden', s!==name);
  });
  document.querySelectorAll('.nav-tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.screen===name);
  });
  window.scrollTo({top:0, behavior:'smooth'});
  if(name === 'fleet') setTimeout(renderFleetMap, 50); // let the container become visible first
  if(name === 'records') renderActiveRecordTab();
}
document.getElementById('navTabs').addEventListener('click', e=>{
  const btn = e.target.closest('.nav-tab');
  if(btn) showScreen(btn.dataset.screen);
});
document.querySelectorAll('[data-goto]').forEach(el=>{
  el.addEventListener('click', (e)=>{ e.preventDefault(); showScreen(el.dataset.goto); });
});
document.getElementById('brandLogo').addEventListener('click', ()=> showScreen('home'));
document.getElementById('brandLogo').addEventListener('keypress', (e)=>{ if(e.key==='Enter') showScreen('home'); });

// ---------- Nav dropdowns (My Business, Account) ----------
function setupDropdown(wrapperId, triggerId){
  const wrapper = document.getElementById(wrapperId);
  const trigger = document.getElementById(triggerId);
  if(!wrapper || !trigger) return;
  trigger.addEventListener('click', (e)=>{
    e.stopPropagation();
    const wasOpen = wrapper.classList.contains('open');
    document.querySelectorAll('.nav-dropdown.open').forEach(d=>d.classList.remove('open'));
    if(!wasOpen) wrapper.classList.add('open');
  });
}
setupDropdown('businessDropdown', 'businessDropdownBtn');
setupDropdown('accountDropdown', 'accountDropdownBtn');
document.addEventListener('click', ()=>{
  document.querySelectorAll('.nav-dropdown.open').forEach(d=>d.classList.remove('open'));
});
document.querySelectorAll('.nav-dropdown-item[data-screen]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    showScreen(btn.dataset.screen);
    document.querySelectorAll('.nav-dropdown.open').forEach(d=>d.classList.remove('open'));
  });
});

// ---------- Account / session state ----------
function renderAccountState(){
  const user = Auth.getUser();
  const label = document.getElementById('accountLabel');
  const authButtons = document.getElementById('authButtons');
  const accountDropdown = document.getElementById('accountDropdown');
  const drawerSignIn = document.getElementById('drawerSignInBtn');
  const drawerSignUp = document.getElementById('drawerSignUpBtn');
  const drawerSignOut = document.getElementById('drawerSignOutBtn');
  if(user){
    label.textContent = user.businessName;
    authButtons.classList.add('hidden');
    accountDropdown.classList.remove('hidden');
    drawerSignIn.classList.add('hidden');
    drawerSignUp.classList.add('hidden');
    drawerSignOut.classList.remove('hidden');
  } else {
    authButtons.classList.remove('hidden');
    accountDropdown.classList.add('hidden');
    drawerSignIn.classList.remove('hidden');
    drawerSignUp.classList.remove('hidden');
    drawerSignOut.classList.add('hidden');
  }
}
[['accountSignInBtn'],['drawerSignInBtn']].forEach(([id])=>{
  document.getElementById(id).addEventListener('click', ()=>{ showScreen('signin'); closeDrawer(); });
});
[['accountSignUpBtn'],['drawerSignUpBtn']].forEach(([id])=>{
  document.getElementById(id).addEventListener('click', ()=>{ showScreen('signup'); closeDrawer(); });
});
[['accountSignOutBtn'],['drawerSignOutBtn']].forEach(([id])=>{
  document.getElementById(id).addEventListener('click', async ()=>{
    await Auth.logout();
    renderAccountState();
    closeDrawer();
    toast('Signed out.');
    showScreen('home');
  });
});

function showAuthError(elId, message){
  const el = document.getElementById(elId);
  el.textContent = message;
  el.classList.remove('hidden');
}
document.getElementById('signinSubmitBtn').addEventListener('click', async ()=>{
  const email = document.getElementById('signinEmail').value.trim();
  const password = document.getElementById('signinPassword').value;
  document.getElementById('signinError').classList.add('hidden');
  if(!email || !password){ showAuthError('signinError', 'Enter your email and password.'); return; }
  try{
    const {token, user} = await Auth.login(email, password);
    Auth.setSession(token, user);
    renderAccountState();
    toast(`Welcome back, ${user.businessName}.`);
    showScreen('home');
  }catch(e){ showAuthError('signinError', e.message); }
});
document.getElementById('signupSubmitBtn').addEventListener('click', async ()=>{
  const businessName = document.getElementById('signupBusinessName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  document.getElementById('signupError').classList.add('hidden');
  if(!businessName || !email || !password){ showAuthError('signupError', 'Fill in all fields.'); return; }
  if(password.length < 6){ showAuthError('signupError', 'Password must be at least 6 characters.'); return; }
  try{
    const {token, user} = await Auth.signup(businessName, email, password);
    Auth.setSession(token, user);
    renderAccountState();
    toast(`Welcome to Maalwala, ${user.businessName}.`);
    showScreen('home');
  }catch(e){ showAuthError('signupError', e.message); }
});
renderAccountState();

// ---------- Modals ----------
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-close').forEach(b=>{
  b.addEventListener('click', ()=> closeModal(b.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(m=>{
  m.addEventListener('click', e=>{ if(e.target===m) m.classList.add('hidden'); });
});
['postLoadBtnTop','heroPostLoad','postLoadBtnLoads'].forEach(id=>{
  document.getElementById(id).addEventListener('click', ()=> openModal('loadModal'));
});
['heroPostTruck','postTruckBtnTrucks'].forEach(id=>{
  document.getElementById(id).addEventListener('click', ()=> openModal('truckModal'));
});

// ---------- Toast ----------
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 3200);
}

// ---------- Rendering: cards ----------
function routeCardHTML(item, type){
  const meta = type==='load'
    ? `<div class="route-meta">
         <span><b>${escapeHtml(item.material)}</b></span>
         <span>${item.weight ?? '—'} T</span>
         <span>${escapeHtml(item.truckType)}</span>
         <span>${fmtDate(item.date)}</span>
       </div>`
    : `<div class="route-meta">
         <span>${escapeHtml(item.truckType)}</span>
         <span>${item.capacity ?? '—'} T capacity</span>
         <span>${fmtDate(item.date)}</span>
       </div>`;
  const rate = type==='load' && item.rate ? `<span class="route-rate">₹${Number(item.rate).toLocaleString('en-IN')}</span>` : '';
  const verifiedBadge = item.verified ? `<span class="verified-badge" title="This business had GST and contact details on file when they posted">✅ Verified profile</span>` : '';
  const driverLine = (type==='truck' && item.driverName)
    ? `<div class="route-meta"><span>🧑‍✈️ Driver: <b>${escapeHtml(item.driverName)}</b>${item.driverPhone ? ' · '+escapeHtml(item.driverPhone) : ''}</span></div>`
    : '';
  const trackingBtn = type==='truck'
    ? `<button class="btn btn-ghost" onclick="shareTrackingLink('${item.id}')" title="Send your driver a link to share live location">📍 Get tracking link</button>`
    : '';
  return `
  <div class="route-card">
    <div class="route-card-top">
      <div class="route-line">
        <span class="route-dot"></span>${escapeHtml(item.from)}
        <span class="route-dash"></span>
        <span class="route-dot end"></span>${escapeHtml(item.to)}
      </div>
      <span class="tag">${type==='load' ? 'Load' : 'Truck'}</span>
    </div>
    ${meta}
    ${driverLine}
    <div class="route-meta"><span>Posted by <b>${escapeHtml(item.poster)}</b></span> ${verifiedBadge}</div>
    <div class="route-card-actions">
      ${rate}
      <button class="btn btn-ghost" onclick="callPoster('${item.phone}')">Call / Bid</button>
      ${trackingBtn}
      <button class="btn btn-primary" onclick="openSendForItem('${item.id}','${type}')">Share to WhatsApp</button>
    </div>
  </div>`;
}
function fmtDate(d){ if(!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
window.callPoster = function(phone){
  if(!phone){ toast('No phone number on file for this listing.'); return; }
  toast(`Calling ${phone}… if nothing opens, dial it manually.`);
  navigator.clipboard && navigator.clipboard.writeText(phone).catch(()=>{});
  window.location.href = 'tel:'+phone;
};
window.shareTrackingLink = function(truckId){
  const url = new URL('driver.html', window.location.href);
  url.searchParams.set('truckId', truckId);
  navigator.clipboard && navigator.clipboard.writeText(url.toString()).catch(()=>{});
  if(navigator.share){
    navigator.share({ title: 'Share your location for Maalwala', url: url.toString() }).catch(()=>{});
  } else {
    toast('Tracking link copied — send it to your driver on WhatsApp.');
  }
};
function emptyState(msg){ return `<div class="empty-state">${msg}</div>`; }

// ---------- Main render ----------
let CACHE = { loads:[], trucks:[], groups:[], contacts:[], savedSearches:[] };

async function renderAll(){
  const [loads, trucks, groups, contacts, savedSearches] = await Promise.all([
    Loads.all(), Trucks.all(), Groups.all(), Contacts.all(), SavedSearches.all()
  ]);
  CACHE = { loads, trucks, groups, contacts, savedSearches };

  animateCount(document.getElementById('statLoads'), loads.length);
  animateCount(document.getElementById('statTrucks'), trucks.length);
  animateCount(document.getElementById('statGroups'), groups.length);

  document.getElementById('homeLoadsPreview').innerHTML = loads.slice(0,3).map(l=>routeCardHTML(l,'load')).join('') || emptyState('No loads posted yet.');
  document.getElementById('homeTrucksPreview').innerHTML = trucks.slice(0,3).map(t=>routeCardHTML(t,'truck')).join('') || emptyState('No trucks posted yet.');

  renderLoadsList();
  renderTrucksList();
  renderGroups();
  renderContacts();
  renderTicker(loads);
  renderApiStatus();
  renderCityDatalists();
  renderPopularRoutes();
  renderSavedSearches();
}

function renderCityDatalists(){
  const cities = new Set();
  [...CACHE.loads, ...CACHE.trucks].forEach(i=>{ if(i.from) cities.add(i.from); if(i.to) cities.add(i.to); });
  const opts = [...cities].sort().map(c=>`<option value="${escapeHtml(c)}">`).join('');
  ['cityList'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.innerHTML = opts;
  });
}

function renderPopularRoutes(){
  const el = document.getElementById('popularRoutes');
  if(!el) return;
  const counts = {};
  CACHE.loads.forEach(l=>{
    const key = `${l.from} → ${l.to}`;
    counts[key] = (counts[key]||0) + 1;
  });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!top.length){ el.innerHTML = ''; return; }
  el.innerHTML = `<span class="popular-label">Popular routes:</span>` + top.map(([route])=>{
    const [from,to] = route.split(' → ');
    return `<button class="route-chip" onclick="applyQuickRoute('${escapeHtml(from)}','${escapeHtml(to)}')">${escapeHtml(route)}</button>`;
  }).join('');
}
window.applyQuickRoute = function(from, to){
  document.getElementById('filterFromLoads').value = from;
  document.getElementById('filterToLoads').value = to;
  renderLoadsList();
  showScreen('loads');
};

function sortItems(items, sortBy){
  const arr = [...items];
  if(sortBy === 'rate-high') arr.sort((a,b)=>(b.rate||0)-(a.rate||0));
  else if(sortBy === 'rate-low') arr.sort((a,b)=>(a.rate||0)-(b.rate||0));
  else if(sortBy === 'weight') arr.sort((a,b)=>(b.weight||b.capacity||0)-(a.weight||a.capacity||0));
  else arr.sort((a,b)=>b.ts-a.ts); // newest
  return arr;
}

function renderLoadsList(){
  let loads = sortItems(CACHE.loads, document.getElementById('sortLoads')?.value);
  const q = (document.getElementById('searchLoads')?.value || '').trim().toLowerCase();
  const f = document.getElementById('filterFromLoads').value.trim().toLowerCase();
  const t = document.getElementById('filterToLoads').value.trim().toLowerCase();
  const tt = document.getElementById('filterTruckType').value;
  if(q) loads = loads.filter(l=> [l.from,l.to,l.material,l.poster].join(' ').toLowerCase().includes(q));
  if(f) loads = loads.filter(l=>l.from.toLowerCase().includes(f));
  if(t) loads = loads.filter(l=>l.to.toLowerCase().includes(t));
  if(tt) loads = loads.filter(l=>l.truckType===tt);
  document.getElementById('loadsList').innerHTML = loads.map(l=>routeCardHTML(l,'load')).join('') || emptyState('No loads match your search.');
}
function renderTrucksList(){
  let trucks = sortItems(CACHE.trucks, document.getElementById('sortTrucks')?.value);
  const q = (document.getElementById('searchTrucks')?.value || '').trim().toLowerCase();
  const f = document.getElementById('filterFromTrucks').value.trim().toLowerCase();
  const t = document.getElementById('filterToTrucks').value.trim().toLowerCase();
  const tt = document.getElementById('filterTruckType2').value;
  if(q) trucks = trucks.filter(l=> [l.from,l.to,l.poster,l.driverName].join(' ').toLowerCase().includes(q));
  if(f) trucks = trucks.filter(l=>l.from.toLowerCase().includes(f));
  if(t) trucks = trucks.filter(l=>(l.to||'').toLowerCase().includes(t));
  if(tt) trucks = trucks.filter(l=>l.truckType===tt);
  document.getElementById('trucksList').innerHTML = trucks.map(t=>routeCardHTML(t,'truck')).join('') || emptyState('No trucks match your search.');
}
document.getElementById('applyLoadFilter').addEventListener('click', renderLoadsList);
document.getElementById('applyTruckFilter').addEventListener('click', renderTrucksList);
document.getElementById('searchLoads')?.addEventListener('input', renderLoadsList);
document.getElementById('searchTrucks')?.addEventListener('input', renderTrucksList);
document.getElementById('sortLoads')?.addEventListener('change', renderLoadsList);
document.getElementById('sortTrucks')?.addEventListener('change', renderTrucksList);

// ---------- Saved searches ----------
function renderSavedSearches(){
  ['loads','trucks'].forEach(kind=>{
    const type = kind === 'loads' ? 'load' : 'truck';
    const el = document.getElementById('savedSearches-'+kind);
    if(!el) return;
    const items = CACHE.savedSearches.filter(s=>s.type===type);
    el.innerHTML = items.length ? items.map(s=>`
      <div class="saved-search-chip">
        <button onclick="applySavedSearch('${s.id}')">${escapeHtml(s.label)}</button>
        <span class="ss-remove" onclick="removeSavedSearch('${s.id}')" title="Remove">✕</span>
      </div>
    `).join('') : '';
  });
}
window.applySavedSearch = function(id){
  const s = CACHE.savedSearches.find(x=>x.id===id);
  if(!s) return;
  if(s.type === 'load'){
    document.getElementById('filterFromLoads').value = s.from;
    document.getElementById('filterToLoads').value = s.to;
    document.getElementById('filterTruckType').value = s.truckType;
    renderLoadsList(); showScreen('loads');
  } else {
    document.getElementById('filterFromTrucks').value = s.from;
    document.getElementById('filterToTrucks').value = s.to;
    document.getElementById('filterTruckType2').value = s.truckType;
    renderTrucksList(); showScreen('trucks');
  }
};
window.removeSavedSearch = async function(id){
  await SavedSearches.remove(id);
  await renderAll();
};
async function saveCurrentSearch(kind){
  const type = kind === 'loads' ? 'load' : 'truck';
  const from = document.getElementById(kind==='loads'?'filterFromLoads':'filterFromTrucks').value.trim();
  const to = document.getElementById(kind==='loads'?'filterToLoads':'filterToTrucks').value.trim();
  const truckType = document.getElementById(kind==='loads'?'filterTruckType':'filterTruckType2').value;
  if(!from && !to && !truckType){ toast('Set at least one filter before saving.'); return; }
  await SavedSearches.create({type, from, to, truckType});
  await renderAll();
  toast('Search saved.');
}
document.getElementById('saveSearchLoads')?.addEventListener('click', ()=>saveCurrentSearch('loads'));
document.getElementById('saveSearchTrucks')?.addEventListener('click', ()=>saveCurrentSearch('trucks'));

function renderTicker(loads){
  const strip = loads.map(l=>`${escapeHtml(l.from)} <span class="dash">✈</span> ${escapeHtml(l.to)}`).join('    •    ');
  const full = strip ? (strip + '    •    ' + strip) : 'Post your first load to see it here    •    Post your first load to see it here';
  document.getElementById('routeTicker').innerHTML = full;
}

function renderGroups(){
  const groups = CACHE.groups;
  document.getElementById('groupCount').textContent = groups.length;
  document.getElementById('groupsList').innerHTML = groups.map(g=>`
    <div class="group-chip">
      <div>
        <div class="g-name">${escapeHtml(g.name)}</div>
        <div class="g-link">${escapeHtml(g.link)}</div>
      </div>
      <button class="remove-btn" onclick="removeGroup('${g.id}')" title="Remove">✕</button>
    </div>
  `).join('') || emptyState('No groups linked yet — add your first WhatsApp group.');
}
window.removeGroup = async function(id){
  await Groups.remove(id);
  await renderAll();
};
document.getElementById('addGroupBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('groupName').value.trim();
  const link = document.getElementById('groupLink').value.trim();
  if(!name || !link){ toast('Add a group name and a link or phone number.'); return; }
  await Groups.create({name, link});
  document.getElementById('groupName').value='';
  document.getElementById('groupLink').value='';
  await renderAll();
  toast('Group linked.');
});

function renderContacts(){
  const contacts = CACHE.contacts;
  const list = document.getElementById('contactsList');
  if(!list) return;
  list.innerHTML = contacts.length
    ? contacts.map(c=>`<div class="group-chip"><div class="g-name">${escapeHtml(c.number)}</div><div class="g-link">Opted in ${fmtDate(new Date(c.optedInAt).toISOString())}</div></div>`).join('')
    : emptyState('Nobody has opted in yet. Share your WhatsApp Business number and ask people to text "JOIN".');
}
async function renderApiStatus(){
  const tag = document.getElementById('apiStatusTag');
  if(!tag) return;
  if(!USE_API){
    tag.textContent = 'backend not connected';
    tag.classList.add('off');
    return;
  }
  const status = await whatsappStatus();
  tag.textContent = status.configured ? 'connected' : 'backend connected, WhatsApp not configured';
  tag.classList.toggle('off', !status.configured);
}

// ---------- Profile ----------
let currentDrivers = [];
async function loadProfileForm(){
  const p = await Profile.get();
  document.getElementById('profName').value = p.name||'';
  document.getElementById('profRole').value = p.role||'Transporter';
  document.getElementById('profCity').value = p.city||'';
  document.getElementById('profPhone').value = p.phone||'';
  document.getElementById('profGST').value = p.gst||'';
  currentDrivers = p.drivers || [];
  renderDriverList();
  renderVerificationStatus(p);
  renderTruckDriverSelect();
  renderSalaryDriverSelect();
}
function renderVerificationStatus(p){
  const el = document.getElementById('verificationStatus');
  if(!el) return;
  const complete = Boolean(p.name && p.phone && p.gst);
  el.innerHTML = complete
    ? `<span class="verified-badge">✅ Verified profile</span> <span class="hint" style="margin:0;">Name, phone and GST are on file — your posts show this badge. This means your details are on record, not that Maalwala has confirmed them with GSTN.</span>`
    : `<span class="unverified-badge">○ Not yet verified</span> <span class="hint" style="margin:0;">Add your GST number and phone above to get the verified badge on your posts.</span>`;
}
async function persistProfile(){
  const p = {
    name: document.getElementById('profName').value.trim(),
    role: document.getElementById('profRole').value,
    city: document.getElementById('profCity').value.trim(),
    phone: document.getElementById('profPhone').value.trim(),
    gst: document.getElementById('profGST').value.trim(),
    drivers: currentDrivers,
  };
  await Profile.save(p);
  renderVerificationStatus(p);
  return p;
}
document.getElementById('saveProfileBtn').addEventListener('click', async ()=>{
  await persistProfile();
  toast('Business profile saved.');
});

// ---------- Driver profiles ----------
function renderDriverList(){
  const el = document.getElementById('driversList');
  if(!el) return;
  el.innerHTML = currentDrivers.length ? currentDrivers.map((d,i)=>`
    <div class="group-chip">
      <div><div class="g-name">${escapeHtml(d.name)}</div><div class="g-link">${escapeHtml(d.phone||'')}${d.license ? ' · '+escapeHtml(d.license) : ''}</div></div>
      <button class="remove-btn" onclick="removeDriver(${i})" title="Remove">✕</button>
    </div>
  `).join('') : emptyState('No drivers added yet.');
}
window.removeDriver = async function(index){
  currentDrivers.splice(index, 1);
  await persistProfile();
  renderDriverList();
  renderTruckDriverSelect();
  renderSalaryDriverSelect();
};
document.getElementById('addDriverBtn')?.addEventListener('click', async ()=>{
  const name = document.getElementById('driverName').value.trim();
  const phone = document.getElementById('driverPhone').value.trim();
  const license = document.getElementById('driverLicense').value.trim();
  if(!name){ toast('Enter a driver name.'); return; }
  currentDrivers.push({name, phone, license});
  await persistProfile();
  document.getElementById('driverName').value = '';
  document.getElementById('driverPhone').value = '';
  document.getElementById('driverLicense').value = '';
  renderDriverList();
  renderTruckDriverSelect();
  renderSalaryDriverSelect();
  toast('Driver added.');
});

function renderTruckDriverSelect(){
  const sel = document.getElementById('truckDriverSelect');
  if(!sel) return;
  sel.innerHTML = `<option value="">— Enter manually —</option>` +
    currentDrivers.map((d,i)=>`<option value="${i}">${escapeHtml(d.name)}</option>`).join('');
}
document.getElementById('truckDriverSelect')?.addEventListener('change', e=>{
  const i = e.target.value;
  if(i === ''){ return; }
  const d = currentDrivers[Number(i)];
  if(d){
    document.getElementById('truckDriverName').value = d.name;
    document.getElementById('truckDriverPhone').value = d.phone || '';
  }
});

// ---------- Post Load ----------
document.getElementById('loadForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const profile = await Profile.get();
  const payload = {
    from: val('loadFrom'), to: val('loadTo'), material: val('loadMaterial'),
    weight: val('loadWeight'), truckType: val('loadTruckType'), rate: val('loadRate'),
    date: val('loadDate'), poster: profile.name || 'You', phone: profile.phone || '',
    verified: Boolean(profile.name && profile.phone && profile.gst),
  };
  const doBroadcast = document.getElementById('loadBroadcast').checked;
  const item = await Loads.create(payload);
  closeModal('loadModal'); e.target.reset(); document.getElementById('loadBroadcast').checked = true;
  await renderAll();
  toast('Load posted.');
  if(doBroadcast) openSendForItem(item.id, 'load');
  showScreen('loads');
});

// ---------- Post Truck ----------
document.getElementById('truckForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const profile = await Profile.get();
  const payload = {
    from: val('truckFrom'), to: val('truckTo'), truckType: val('truckType'),
    capacity: val('truckCapacity'), date: val('truckDate'),
    poster: profile.name || 'You', phone: profile.phone || '',
    driverName: val('truckDriverName'), driverPhone: val('truckDriverPhone'),
    verified: Boolean(profile.name && profile.phone && profile.gst),
  };
  const doBroadcast = document.getElementById('truckBroadcast').checked;
  const item = await Trucks.create(payload);
  closeModal('truckModal'); e.target.reset(); document.getElementById('truckBroadcast').checked = true;
  await renderAll();
  toast('Truck posted.');
  if(doBroadcast) openSendForItem(item.id, 'truck');
  showScreen('trucks');
});
function val(id){ return document.getElementById(id).value; }

// ---------- Broadcast / Send modal ----------
let currentSendMessage = '';
window.openSendForItem = async function(id, type){
  const list = type==='load' ? CACHE.loads : CACHE.trucks;
  let item = list.find(i=>i.id===id);
  if(!item){
    const fresh = type==='load' ? await Loads.all() : await Trucks.all();
    item = fresh.find(i=>i.id===id);
  }
  if(!item) return;
  const msg = type==='load'
    ? `🚛 *LOAD AVAILABLE* — Maalwala\n📍 ${item.from} ➜ ${item.to}\n📦 ${item.material}, ${item.weight} T\n🚚 Truck needed: ${item.truckType}\n💰 Rate: ${item.rate ? '₹'+Number(item.rate).toLocaleString('en-IN') : 'Negotiable'}\n📅 Loading: ${fmtDate(item.date)}\n☎️ ${item.poster}${item.phone ? ', '+item.phone : ''}`
    : `🚛 *TRUCK AVAILABLE* — Maalwala\n📍 ${item.from} ➜ ${item.to||'Any route'}\n🚚 ${item.truckType}, ${item.capacity} T capacity\n📅 Available: ${fmtDate(item.date)}\n☎️ ${item.poster}${item.phone ? ', '+item.phone : ''}`;
  currentSendMessage = msg;
  document.getElementById('sendPreviewText').textContent = msg;

  // Official API block
  const officialBlock = document.getElementById('officialSendBlock');
  const status = await whatsappStatus();
  const contacts = CACHE.contacts;
  document.getElementById('officialContactCount').textContent = contacts.length;
  document.getElementById('officialSendResult').textContent = '';
  officialBlock.classList.toggle('hidden', !status.configured);

  const groups = CACHE.groups;
  const box = document.getElementById('sendGroupButtons');
  if(!groups.length){
    box.innerHTML = emptyState('No WhatsApp groups linked yet.');
    document.getElementById('sendHint').innerHTML = `Go to <b>Broadcast</b> to add your first group, then come back and share.`;
  } else {
    box.innerHTML = groups.map(g=>`
      <button class="send-group-btn" onclick="sendToGroup('${g.id}')">
        ${escapeHtml(g.name)} <span class="arrow">Open in WhatsApp →</span>
      </button>
    `).join('');
    document.getElementById('sendHint').textContent = 'Tap each group to open it in WhatsApp with the message ready — the text is also copied to your clipboard as a backup, so you can just paste and send.';
  }
  openModal('sendModal');
};

window.sendToGroup = function(groupId){
  const g = CACHE.groups.find(g=>g.id===groupId);
  if(!g) return;
  navigator.clipboard && navigator.clipboard.writeText(currentSendMessage).catch(()=>{});
  const isPhone = /^[+\d][\d\s-]{7,}$/.test(g.link.trim());
  if(isPhone){
    const num = g.link.replace(/[^\d]/g,'');
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(currentSendMessage)}`, '_blank');
  } else {
    window.open(g.link, '_blank');
  }
  toast(`Message copied — paste it in "${g.name}" and hit send.`);
};

document.getElementById('officialBroadcastBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('officialBroadcastBtn');
  const resultEl = document.getElementById('officialSendResult');
  btn.disabled = true; btn.textContent = 'Sending…';
  try{
    const res = await officialBroadcast(currentSendMessage);
    resultEl.textContent = res.error ? res.error : `Sent to ${res.sent} contact(s)${res.failed ? `, ${res.failed} failed` : ''}.`;
  }catch(e){
    resultEl.textContent = 'Could not reach the broadcast API.';
  }
  btn.disabled = false;
  const c = CACHE.contacts.length;
  btn.innerHTML = `Send to all opted-in contacts (<span id="officialContactCount">${c}</span>) — official API`;
});

document.getElementById('copyMsgBtn').addEventListener('click', ()=>{
  navigator.clipboard && navigator.clipboard.writeText(currentSendMessage);
  toast('Message copied to clipboard.');
});

// ---------- Init ----------
(async function init(){
  seedLocalIfEmpty();
  await renderAll();
  await loadProfileForm();
})();

// Register service worker for installability (best-effort, ignore failures)
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

// ---------- Fleet dashboard (Sprint 3) ----------
// Approximate coordinates for major Indian logistics hubs used in demo data.
// This is a lookup table, not a geocoder — cities not listed here are simply skipped on the map.
const CITY_COORDS = {
  'ahmedabad': [23.0225, 72.5714], 'surat': [21.1702, 72.8311], 'hazira': [21.1167, 72.6500],
  'vadodara': [22.3072, 73.1812], 'rajkot': [22.3039, 70.8022], 'indore': [22.7196, 75.8577],
  'pune': [18.5204, 73.8567], 'mumbai': [19.0760, 72.8777], 'delhi': [28.7041, 77.1025],
  'jaipur': [26.9124, 75.7873], 'nagpur': [21.1458, 79.0882], 'bangalore': [12.9716, 77.5946],
  'bengaluru': [12.9716, 77.5946], 'chennai': [13.0827, 80.2707], 'hyderabad': [17.3850, 78.4867],
  'kolkata': [22.5726, 88.3639], 'lucknow': [26.8467, 80.9462], 'chandigarh': [30.7333, 76.7794],
  'kanpur': [26.4499, 80.3319], 'nashik': [19.9975, 73.7898], 'coimbatore': [11.0168, 76.9558],
  'kochi': [9.9312, 76.2673], 'visakhapatnam': [17.6868, 83.2185], 'bhopal': [23.2599, 77.4126],
  'patna': [25.5941, 85.1376], 'ludhiana': [30.9010, 75.8573], 'agra': [27.1767, 78.0081],
  'guwahati': [26.1445, 91.7362], 'goa': [15.2993, 74.1240],
};
function coordsFor(city){
  if(!city) return null;
  const key = city.trim().toLowerCase().split(',')[0].split('/')[0].trim();
  return CITY_COORDS[key] || null;
}

let fleetMapInstance = null;
let fleetMarkersLayer = null;
async function renderFleetMap(){
  const trucks = CACHE.trucks || [];
  document.getElementById('fleetTotalTrucks').textContent = trucks.length;
  document.getElementById('fleetOnRoute').textContent = trucks.filter(t=>t.to && t.to.toLowerCase() !== 'anywhere').length;
  const cities = new Set(trucks.map(t=>t.from).filter(Boolean));
  document.getElementById('fleetCities').textContent = cities.size;

  if(typeof L === 'undefined'){
    document.getElementById('fleetMap').innerHTML = '<div class="empty-state">Map library failed to load — check your internet connection.</div>';
    return;
  }

  if(!fleetMapInstance){
    fleetMapInstance = L.map('fleetMap', { scrollWheelZoom: false }).setView([22.5, 78.9], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(fleetMapInstance);
    fleetMarkersLayer = L.layerGroup().addTo(fleetMapInstance);
  }

  fleetMarkersLayer.clearLayers();
  const icon = L.divIcon({ className: '', html: '<div class="truck-map-marker">🚚</div>', iconSize: [26,26] });

  // Real GPS pings take priority the moment any exist — this is what
  // flips the dashboard from demo to live, with zero other changes needed.
  const realPositions = await FleetPositions.latest();
  const realByTruck = {};
  realPositions.forEach(p => { realByTruck[p.truckId] = p; });

  let liveCount = 0;
  trucks.forEach(t=>{
    const real = realByTruck[t.id];
    let lat, lng, popupNote;
    if(real){
      lat = real.lat; lng = real.lng;
      popupNote = `<span style="color:#1b7a41;font-size:11px;">🟢 Live GPS position</span>`;
      liveCount++;
    } else {
      const c = coordsFor(t.from);
      if(!c) return;
      const jitter = () => (Math.random() - 0.5) * 0.15;
      lat = c[0] + jitter(); lng = c[1] + jitter();
      popupNote = `<span style="color:#8a96ab;font-size:11px;">Estimated position — based on listed city</span>`;
    }
    const marker = L.marker([lat, lng], { icon }).addTo(fleetMarkersLayer);
    marker.bindPopup(`<b>${escapeHtml(t.poster)}</b><br>${escapeHtml(t.from)} → ${escapeHtml(t.to||'Anywhere')}<br>${escapeHtml(t.truckType)}, ${t.capacity} T<br>${popupNote}`);
  });

  const banner = document.querySelector('#screen-fleet .legal-notice');
  if(banner && liveCount > 0){
    banner.innerHTML = `<strong>${liveCount} truck(s) showing live GPS positions.</strong> The rest show estimated positions until they're connected too.`;
  }
  setTimeout(()=> fleetMapInstance.invalidateSize(), 100);
}

// ---------- Records / ERP (Sprint 4) ----------
let activeRecordKind = 'invoice';
document.getElementById('recordTabs')?.addEventListener('click', e=>{
  const btn = e.target.closest('.trust-tab');
  if(!btn) return;
  activeRecordKind = btn.dataset.recordKind;
  document.querySelectorAll('#recordTabs .trust-tab').forEach(t=>t.classList.toggle('active', t===btn));
  document.querySelectorAll('.record-panel').forEach(p=>{
    p.classList.toggle('hidden', p.id !== 'record-'+activeRecordKind);
  });
  renderActiveRecordTab();
});
function renderActiveRecordTab(){
  if(activeRecordKind === 'reports') renderReports();
  else renderRecordList(activeRecordKind);
}
function fmtMoney(n){ return '₹' + Number(n||0).toLocaleString('en-IN'); }

async function renderRecordList(kind){
  const items = await Records.all(kind);
  const el = document.getElementById({
    invoice:'invoiceList', expense:'expenseList', fuel:'fuelList',
    maintenance:'maintList', salary:'salaryList', pod:'podList'
  }[kind]);
  if(!el) return;
  if(!items.length){ el.innerHTML = emptyState('Nothing here yet.'); return; }

  if(kind === 'invoice'){
    el.innerHTML = items.map(i=>`
      <div class="record-row">
        <div><div class="r-main">${escapeHtml(i.client)}</div><div class="r-sub">${escapeHtml(i.route||'')} ${i.due?'· Due '+fmtDate(i.due):''}</div></div>
        <span class="status-pill ${i.paid?'done':'pending'}" style="cursor:pointer;" onclick="toggleRecordFlag('${i.id}','invoice','paid',${!i.paid})">${i.paid?'Paid':'Mark paid'}</span>
        <div class="r-amount">${fmtMoney(i.amount)}</div>
        <div class="r-actions"><button class="remove-btn" onclick="deleteRecord('${i.id}','invoice')">✕</button></div>
      </div>`).join('');
  } else if(kind === 'expense'){
    el.innerHTML = items.map(i=>`
      <div class="record-row">
        <div><div class="r-main">${escapeHtml(i.category)}</div><div class="r-sub">${fmtDate(i.date)} ${i.note?'· '+escapeHtml(i.note):''}</div></div>
        <div class="r-amount">${fmtMoney(i.amount)}</div>
        <div class="r-actions"><button class="remove-btn" onclick="deleteRecord('${i.id}','expense')">✕</button></div>
      </div>`).join('');
  } else if(kind === 'fuel'){
    el.innerHTML = items.map(i=>`
      <div class="record-row">
        <div><div class="r-main">${escapeHtml(i.vehicle||'—')}</div><div class="r-sub">${i.liters||'—'} L ${i.odometer?'· '+i.odometer+' km':''} · ${fmtDate(i.date)}</div></div>
        <div class="r-amount">${fmtMoney(i.amount)}</div>
        <div class="r-actions"><button class="remove-btn" onclick="deleteRecord('${i.id}','fuel')">✕</button></div>
      </div>`).join('');
  } else if(kind === 'maintenance'){
    el.innerHTML = items.map(i=>`
      <div class="record-row">
        <div><div class="r-main">${escapeHtml(i.vehicle||'—')}</div><div class="r-sub">${escapeHtml(i.serviceType)} · Due ${fmtDate(i.due)}</div></div>
        <span class="status-pill ${i.done?'done':'pending'}" style="cursor:pointer;" onclick="toggleRecordFlag('${i.id}','maintenance','done',${!i.done})">${i.done?'Done':'Mark done'}</span>
        <div class="r-actions"><button class="remove-btn" onclick="deleteRecord('${i.id}','maintenance')">✕</button></div>
      </div>`).join('');
  } else if(kind === 'salary'){
    el.innerHTML = items.map(i=>`
      <div class="record-row">
        <div><div class="r-main">${escapeHtml(i.driverName)}</div><div class="r-sub">${escapeHtml(i.month||'')}</div></div>
        <span class="status-pill ${i.paid?'done':'pending'}" style="cursor:pointer;" onclick="toggleRecordFlag('${i.id}','salary','paid',${!i.paid})">${i.paid?'Paid':'Mark paid'}</span>
        <div class="r-amount">${fmtMoney(i.amount)}</div>
        <div class="r-actions"><button class="remove-btn" onclick="deleteRecord('${i.id}','salary')">✕</button></div>
      </div>`).join('');
  } else if(kind === 'pod'){
    el.innerHTML = items.map(i=>`
      <div class="record-row">
        ${i.photo ? `<img class="pod-thumb" src="${i.photo}" alt="POD photo">` : ''}
        <div style="flex:1;"><div class="r-main">${escapeHtml(i.route||'—')}</div><div class="r-sub">${i.ref?'Ref: '+escapeHtml(i.ref)+' · ':''}${fmtDate(i.date)}</div></div>
        <div class="r-actions"><button class="remove-btn" onclick="deleteRecord('${i.id}','pod')">✕</button></div>
      </div>`).join('');
  }
}
window.toggleRecordFlag = async function(id, kind, field, value){
  await Records.update(id, {[field]: value}, kind);
  renderRecordList(kind);
};
window.deleteRecord = async function(id, kind){
  await Records.remove(id, kind);
  renderRecordList(kind);
};

document.getElementById('addInvoiceBtn')?.addEventListener('click', async ()=>{
  const client = document.getElementById('invClient').value.trim();
  const amount = document.getElementById('invAmount').value;
  if(!client || !amount){ toast('Enter client name and amount.'); return; }
  await Records.create('invoice', { client, amount: Number(amount), route: document.getElementById('invRoute').value.trim(), due: document.getElementById('invDue').value, paid:false });
  document.getElementById('invClient').value=''; document.getElementById('invAmount').value=''; document.getElementById('invRoute').value=''; document.getElementById('invDue').value='';
  renderRecordList('invoice'); toast('Invoice added.');
});
document.getElementById('addExpenseBtn')?.addEventListener('click', async ()=>{
  const amount = document.getElementById('expAmount').value;
  if(!amount){ toast('Enter an amount.'); return; }
  await Records.create('expense', { category: document.getElementById('expCategory').value, amount: Number(amount), date: document.getElementById('expDate').value, note: document.getElementById('expNote').value.trim() });
  document.getElementById('expAmount').value=''; document.getElementById('expNote').value='';
  renderRecordList('expense'); toast('Expense added.');
});
document.getElementById('addFuelBtn')?.addEventListener('click', async ()=>{
  const amount = document.getElementById('fuelAmount').value;
  if(!amount){ toast('Enter an amount.'); return; }
  await Records.create('fuel', {
    vehicle: document.getElementById('fuelVehicle').value.trim(), liters: Number(document.getElementById('fuelLiters').value)||null,
    amount: Number(amount), odometer: Number(document.getElementById('fuelOdometer').value)||null, date: document.getElementById('fuelDate').value,
  });
  ['fuelVehicle','fuelLiters','fuelAmount','fuelOdometer'].forEach(id=>document.getElementById(id).value='');
  renderRecordList('fuel'); toast('Fuel record added.');
});
document.getElementById('addMaintBtn')?.addEventListener('click', async ()=>{
  const serviceType = document.getElementById('maintType').value.trim();
  if(!serviceType){ toast('Enter a service type.'); return; }
  await Records.create('maintenance', { vehicle: document.getElementById('maintVehicle').value.trim(), serviceType, due: document.getElementById('maintDue').value, done:false });
  document.getElementById('maintVehicle').value=''; document.getElementById('maintType').value=''; document.getElementById('maintDue').value='';
  renderRecordList('maintenance'); toast('Reminder added.');
});
document.getElementById('addSalaryBtn')?.addEventListener('click', async ()=>{
  const sel = document.getElementById('salaryDriver').value;
  const driverName = sel !== '' ? currentDrivers[Number(sel)]?.name : document.getElementById('salaryDriverName').value.trim();
  const amount = document.getElementById('salaryAmount').value;
  if(!driverName || !amount){ toast('Enter driver name and amount.'); return; }
  await Records.create('salary', { driverName, month: document.getElementById('salaryMonth').value, amount: Number(amount), paid:false });
  document.getElementById('salaryDriverName').value=''; document.getElementById('salaryAmount').value='';
  renderRecordList('salary'); toast('Salary record added.');
});
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
document.getElementById('addPodBtn')?.addEventListener('click', async ()=>{
  const route = document.getElementById('podRoute').value.trim();
  if(!route){ toast('Enter the related route.'); return; }
  const fileInput = document.getElementById('podPhoto');
  let photo = null;
  if(fileInput.files[0]){
    if(fileInput.files[0].size > 4 * 1024 * 1024){ toast('Photo too large — please use one under 4MB.'); return; }
    photo = await fileToBase64(fileInput.files[0]);
  }
  await Records.create('pod', { route, date: document.getElementById('podDate').value, ref: document.getElementById('podRef').value.trim(), photo });
  document.getElementById('podRoute').value=''; document.getElementById('podRef').value=''; fileInput.value='';
  renderRecordList('pod'); toast('POD record saved.');
});

async function renderReports(){
  const [invoices, expenses, fuel, salary, maintenance] = await Promise.all([
    Records.all('invoice'), Records.all('expense'), Records.all('fuel'), Records.all('salary'), Records.all('maintenance')
  ]);
  const sum = (arr) => arr.reduce((s,i)=>s+(Number(i.amount)||0), 0);
  document.getElementById('repInvoiced').textContent = fmtMoney(sum(invoices));
  document.getElementById('repExpenses').textContent = fmtMoney(sum(expenses));
  document.getElementById('repFuel').textContent = fmtMoney(sum(fuel));
  document.getElementById('repSalary').textContent = fmtMoney(sum(salary.filter(s=>s.paid)));
  const upcoming = maintenance.filter(m=>!m.done).sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,5);
  document.getElementById('repMaintenance').innerHTML = upcoming.length
    ? upcoming.map(m=>`<div class="alert-row"><span class="alert-dot idle"></span> ${escapeHtml(m.vehicle||'—')} — ${escapeHtml(m.serviceType)} <span class="alert-time">Due ${fmtDate(m.due)}</span></div>`).join('')
    : emptyState('No pending maintenance.');
}

// Populate the salary driver dropdown from saved drivers whenever Records screen loads
function renderSalaryDriverSelect(){
  const sel = document.getElementById('salaryDriver');
  if(!sel) return;
  sel.innerHTML = `<option value="">— Type manually —</option>` + currentDrivers.map((d,i)=>`<option value="${i}">${escapeHtml(d.name)}</option>`).join('');
}

// ---------- Onboarding tour ----------
const TOUR_STEPS = [
  { target: '.brand', title: 'Welcome to Maalwala', text: 'A quick 30-second tour of what you can do here — post loads, find trucks, and broadcast to WhatsApp.' },
  { target: '[data-tour="post-load"]', title: 'Post a Load', text: 'Got goods to move? Post a load here with route, material, and rate — it goes straight onto the marketplace.' },
  { target: '[data-tour="nav-loads"]', title: 'Find Loads', text: 'Browse every load posted, filter by route or truck type, and call or bid directly.' },
  { target: '[data-tour="nav-trucks"]', title: 'Find Trucks', text: 'The same, but for truck availability — see who has space heading your way.' },
  { target: '[data-tour="nav-business"]', title: 'My Business', text: 'Your Profile, Fleet map, Records (invoices, expenses, salary), and WhatsApp Broadcast all live under this menu.' },
];
let tourIndex = 0;

function tourElFor(step){
  const el = document.querySelector(step.target);
  if(!el) return null;
  // skip elements hidden on this screen size (e.g. desktop-only nav on mobile)
  if(el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return null;
  return el;
}
function findNextVisibleStep(fromIndex){
  for(let i = fromIndex; i < TOUR_STEPS.length; i++){
    if(tourElFor(TOUR_STEPS[i])) return i;
  }
  return -1;
}
function showTourStep(i){
  const idx = findNextVisibleStep(i);
  if(idx === -1){ endTour(); return; }
  tourIndex = idx;
  const step = TOUR_STEPS[idx];
  const el = tourElFor(step);
  const rect = el.getBoundingClientRect();
  const ring = document.getElementById('tourRing');
  const pad = 8;
  ring.style.top = (rect.top - pad) + 'px';
  ring.style.left = (rect.left - pad) + 'px';
  ring.style.width = (rect.width + pad*2) + 'px';
  ring.style.height = (rect.height + pad*2) + 'px';

  const tooltip = document.getElementById('tourTooltip');
  document.getElementById('tourTitle').textContent = step.title;
  document.getElementById('tourText').textContent = step.text;
  document.getElementById('tourStepCount').textContent = `${idx+1} of ${TOUR_STEPS.length}`;
  document.getElementById('tourNext').textContent = idx === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

  // position tooltip below the target, flip above if it would overflow
  const tw = 300;
  let top = rect.bottom + 16;
  let left = Math.min(Math.max(rect.left, 12), window.innerWidth - tw - 12);
  if(top + 160 > window.innerHeight){ top = Math.max(12, rect.top - 170); }
  tooltip.style.top = top + 'px';
  tooltip.style.left = left + 'px';
}
function startTour(){
  document.getElementById('tourOverlay').classList.remove('hidden');
  showTourStep(0);
}
function endTour(){
  document.getElementById('tourOverlay').classList.add('hidden');
  localStorage.setItem('mw_tour_seen', '1');
}
document.getElementById('tourTriggerBtn').addEventListener('click', startTour);
document.getElementById('tourSkip').addEventListener('click', endTour);
document.getElementById('tourNext').addEventListener('click', ()=>{
  if(tourIndex >= TOUR_STEPS.length - 1){ endTour(); return; }
  showTourStep(tourIndex + 1);
});
window.addEventListener('resize', ()=>{
  if(!document.getElementById('tourOverlay').classList.contains('hidden')) showTourStep(tourIndex);
});

// Auto-start for first-time visitors, after content has rendered
if(!localStorage.getItem('mw_tour_seen')){
  setTimeout(startTour, 1200);
}
