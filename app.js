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
document.getElementById('bookTruckBtnTop')?.addEventListener('click', ()=> showScreen('trucks'));
document.getElementById('bookTruckBtnDrawer')?.addEventListener('click', ()=>{ closeDrawer(); showScreen('trucks'); });
document.getElementById('heroEmptyPost')?.addEventListener('click', ()=> openModal('loadModal'));

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
  update: async (id, patch)=>{
    if(!USE_API){
      const list = LocalDB.get('trucks', []);
      const idx = list.findIndex(t=>t.id===id);
      if(idx>-1) list[idx] = {...list[idx], ...patch};
      LocalDB.set('trucks', list);
      return list[idx];
    }
    const r = await fetch(API_BASE + '/api/trucks/'+id, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch)});
    if(!r.ok) throw new Error('Could not update truck');
    return r.json();
  },
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
  ping: async (truckId, lat, lng)=>{
    if(!USE_API) throw new Error('Connect a backend first (see config.js) — positions need a server to store them.');
    const r = await fetch(API_BASE + '/api/fleet/ping', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ truckId, lat, lng, ts: Date.now() })
    });
    if(!r.ok){ const d = await r.json().catch(()=>({})); throw new Error(d.error || 'Could not update position'); }
    return r.json();
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
  get: async ()=> {
    const cached = LocalDB.get('profile', null);
    const phone = cached && cached.phone ? cached.phone : '';
    const path = '/api/profile' + (phone ? ('?phone=' + encodeURIComponent(phone)) : '');
    const result = await apiGet(path, 'profile', {name:'', role:'Transporter', city:'', phone:'', gst:'', drivers:[]});
    if(result && result.phone) LocalDB.set('profile', result);
    return result;
  },
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

// ---------- Demo route displays ----------
// Keep the home page useful while the shared board is empty. These are display-only
// fallbacks; real listings and all board filters continue to use CACHE unchanged.
function makeDemoRouteMocks(){
  return {
    loads: [
      {id:cid(), from:'Ahmedabad', to:'Indore', material:'Cotton Bales', weight:14, truckType:'Open Body', rate:38000, date:'2026-07-18', poster:'[Sample] Patel Roadlines', phone:'9825000001', ts:Date.now()-3600e3, sample:true},
      {id:cid(), from:'Surat', to:'Pune', material:'Textile Rolls', weight:9, truckType:'Container', rate:29500, date:'2026-07-17', poster:'[Sample] Shree Ganesh Transport', phone:'9825000002', ts:Date.now()-7200e3, sample:true},
      {id:cid(), from:'Rajkot', to:'Delhi', material:'Ceramic Tiles', weight:18, truckType:'Trailer', rate:64000, date:'2026-07-19', poster:'[Sample] Om Logistics', phone:'9825000003', ts:Date.now()-10800e3, sample:true},
      {id:cid(), from:'Vadodara', to:'Nagpur', material:'Chemicals (Drums)', weight:12, truckType:'Tanker', rate:41000, date:'2026-07-20', poster:'[Sample] Narmada Carriers', phone:'9825000004', ts:Date.now()-5400e3, sample:true},
    ],
    trucks: [
      {id:cid(), from:'Ahmedabad', to:'Anywhere Mumbai side', truckType:'Open Body', capacity:16, date:'2026-07-17', poster:'[Sample] Desai Fleet Owners', phone:'9825000011', ts:Date.now()-4000e3, sample:true},
      {id:cid(), from:'Indore', to:'Ahmedabad / Rajkot', truckType:'Container', capacity:10, date:'2026-07-18', poster:'[Sample] Malwa Transport Co.', phone:'9825000012', ts:Date.now()-9000e3, sample:true},
      {id:cid(), from:'Jaipur', to:'Anywhere North', truckType:'Trailer', capacity:20, date:'2026-07-19', poster:'[Sample] Rajputana Roadways', phone:'9825000013', ts:Date.now()-2000e3, sample:true},
    ],
  };
}
const HOME_ROUTE_MOCKS = makeDemoRouteMocks();

// Seed local demo data only when running without a backend, preserving the original
// standalone demo while keeping API-backed boards honest.
function seedLocalIfEmpty(){
  if(USE_API) return;
  const demo = makeDemoRouteMocks();
  if(LocalDB.get('loads', null) === null) LocalDB.set('loads', demo.loads);
  if(LocalDB.get('trucks', null) === null) LocalDB.set('trucks', demo.trucks);
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
const screens = ['home','loads','trucks','fleet','records','broadcast','profile','terms','payment','fastag','signin','signup','bookings'];
document.getElementById('footerYear').textContent = new Date().getFullYear();
function showScreen(name){
  screens.forEach(s=>{
    document.getElementById('screen-'+s).classList.toggle('hidden', s!==name);
  });
  document.querySelectorAll('.nav-tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.screen===name);
  });
  window.scrollTo({top:0, behavior:'smooth'});
  if(name === 'fleet'){ setTimeout(renderFleetMap, 50); checkAditiStatus(); startAditiAutoSync(); } // let the container become visible first
  else{ stopAditiAutoSync(); }
  if(name === 'records') renderActiveRecordTab();
  if(name === 'bookings') renderBookings();
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

// ---------- Account / session state (now driven by the OTP gate) ----------
function renderAccountState(){
  const user = AuthGate.getUser();
  const label = document.getElementById('accountLabel');
  if(user) label.textContent = user.businessName || ('+91 ' + user.phone);
  const drawerSignOut = document.getElementById('drawerSignOutBtn');
  if(drawerSignOut) drawerSignOut.classList.remove('hidden');
}
[['accountSignOutBtn'],['drawerSignOutBtn']].forEach(([id])=>{
  document.getElementById(id)?.addEventListener('click', async ()=>{
    AuthGate.clearSession();
    closeDrawer();
    toast('Signed out.');
    window.location.reload(); // simplest reliable way back to the gate with a clean app state
  });
});

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
function timeAgo(ts){
  if(!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - Number(ts)) / 60000));
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if(hrs < 48) return hrs + 'h ago';
  const days = Math.round(hrs / 24);
  return days + 'd ago';
}
function maskPhone(phone){
  const p = String(phone||'').replace(/\D/g,'');
  if(p.length < 6) return '';
  return p.slice(0,2) + '******' + p.slice(-2);
}
function counterpartyHTML(item){
  const city = item.city || item.posterCity || '';
  const trips = item.completedTrips != null ? `${item.completedTrips} trips` : '';
  const last = item.lastActive ? timeAgo(item.lastActive) : (item.ts ? timeAgo(item.ts) : '');
  const phoneMasked = maskPhone(item.phone);
  const profileBadge = item.verified
    ? `<span class="verified-badge" title="Name and phone were on file when posting — not independently verified">Profile complete</span>`
    : '';
  return `<div class="counterparty-card">
    <div class="cp-main">
      <strong>${escapeHtml(item.poster || 'Business')}</strong>
      <span class="cp-hint">on Maalwala${city ? ' · ' + escapeHtml(city) : ''}</span>
      ${profileBadge}
    </div>
    <div class="cp-meta">
      ${trips ? `<span>${escapeHtml(String(trips))}</span>` : ''}
      ${last ? `<span>Active ${escapeHtml(last)}</span>` : ''}
      ${phoneMasked ? `<span class="cp-phone" title="Full number after interest / login">📞 ${escapeHtml(phoneMasked)}</span>` : ''}
    </div>
  </div>`;
}
function routeCardHTML(item, type){
  const mt = type==='load' ? (item.weight ?? '—') : (item.capacity ?? '—');
  const material = type==='load' ? escapeHtml(item.material||'—') : '—';
  const rateVal = item.rate ? Number(item.rate) : 0;
  const rate = rateVal ? `<span class="route-rate">₹${rateVal.toLocaleString('en-IN')}</span>` : `<span class="route-rate muted">Rate on ask</span>`;
  const age = timeAgo(item.ts);
  const bids = getBidsForItem(item.id);
  const pending = bids.filter(b=>b.status==='pending').length;
  const accepted = bids.filter(b=>b.status==='accepted').length;
  const bidState = bids.length
    ? `<span class="bid-chip">${bids.length} bid${bids.length>1?'s':''}${pending?` · ${pending} pending`:''}${accepted?` · ${accepted} accepted`:''}</span>`
    : '';
  const myPhone = (LocalDB.get('profile',{})||{}).phone || '';
  const isMine = myPhone && item.phone && String(myPhone)===String(item.phone);
  const bidManage = (isMine && pending)
    ? `<div class="bid-manage">${bids.filter(b=>b.status==='pending').slice(0,3).map(b=>`
        <div class="bid-row">
          <span>₹${Number(b.amount).toLocaleString('en-IN')} · ${escapeHtml(b.name)} · ${escapeHtml(b.status)}</span>
          <button class="btn btn-ghost" onclick="updateBidStatus('${b.id}','accepted')">Accept</button>
          <button class="btn btn-ghost" onclick="updateBidStatus('${b.id}','countered')">Counter</button>
        </div>`).join('')}</div>`
    : (bids.filter(b=>b.phone===myPhone).length
        ? `<div class="bid-manage"><span class="hint" style="margin:0;">Your bid: ${escapeHtml(bids.filter(b=>b.phone===myPhone)[0].status)}</span></div>`
        : '');
  const driverLine = (type==='truck' && item.driverName)
    ? `<div class="route-meta"><span>🧑‍✈️ ${escapeHtml(item.driverName)}${item.driverPhone ? ' · '+escapeHtml(maskPhone(item.driverPhone)||item.driverPhone) : ''}</span></div>`
    : '';
  const vehicleLine = (type==='truck' && item.vehicleNumber)
    ? `<div class="route-meta"><span>🚚 ${escapeHtml(item.vehicleNumber)}</span></div>`
    : '';
  const trackingBtn = type==='truck'
    ? `<button class="btn btn-ghost" onclick="shareTrackingLink('${item.id}')" title="Send your driver a link to share live location">📍 Tracking link</button>`
    : '';
  const editVehicleBtn = type==='truck'
    ? `<button class="btn btn-ghost" onclick="editVehicleNumber('${item.id}','${escapeHtml(item.vehicleNumber||'')}')">✏️ ${item.vehicleNumber ? 'Edit' : 'Add'} vehicle #</button>`
    : '';
  const backhaulBtn = type==='load'
    ? `<button class="btn btn-ghost" onclick="findBackhaulNear('${escapeHtml(item.to||'')}','load')" title="Loads near unload city">↩ Backhaul near ${escapeHtml(item.to||'')}</button>`
    : `<button class="btn btn-ghost" onclick="findBackhaulNear('${escapeHtml(item.from||'')}','truck')" title="Loads from this city">📦 Loads from ${escapeHtml(item.from||'')}</button>`;
  return `
  <div class="route-card board-row">
    <div class="route-card-top">
      <div class="route-line">
        <span class="route-dot"></span><b>${escapeHtml(item.from)}</b>
        <span class="route-dash"></span>
        <span class="route-dot end"></span><b>${escapeHtml(item.to||'Anywhere')}</b>
      </div>
      <div class="board-tags">
        <span class="tag">${type==='load' ? 'Load' : 'Truck'}</span>
        ${item.featured ? '<span class="tag featured-tag">⭐ Featured</span>' : ''}
        ${(item.sample || String(item.poster||'').startsWith('[Sample]')) ? '<span class="tag sample-tag">Sample</span>' : ''}
        ${age ? `<span class="tag age-tag">${escapeHtml(age)}</span>` : ''}
        ${bidState}
      </div>
    </div>
    <div class="board-grid">
      <span><em>MT</em> ${escapeHtml(String(mt))}</span>
      <span><em>Type</em> ${escapeHtml(item.truckType||'—')}</span>
      ${type==='load' ? `<span><em>Material</em> ${material}</span>` : ''}
      <span><em>Date</em> ${fmtDate(item.date)}</span>
      <span class="board-rate-cell">${rate}</span>
    </div>
    ${driverLine}
    ${vehicleLine}
    ${counterpartyHTML(item)}
    ${bidManage}
    <div class="route-card-actions-primary">
      <button class="btn btn-accent" onclick="openBookingModal('${item.id}','${type}')">${type==='load' ? '📦 Book' : '🚚 Book'}</button>
      <button class="btn btn-primary" onclick="openBidModal('${item.id}','${type}')">💬 Bid / Interest</button>
    </div>
    ${(trackingBtn || editVehicleBtn) ? `<div class="route-card-actions-manage">${trackingBtn}${editVehicleBtn}</div>` : ''}
    <div class="route-card-actions-secondary">
      ${backhaulBtn}
      <button class="btn btn-ghost" onclick="toggleFeatured('${item.id}','${type}',${!item.featured})">${item.featured ? '☆ Unfeature' : '⭐ Feature'}</button>
      <button class="btn btn-ghost" onclick="openSendForItem('${item.id}','${type}')">📣 WhatsApp</button>
    </div>
  </div>`;
}
function fmtDate(d){ if(!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
window.toggleFeatured = async function(id, type, newVal){
  try{
    const profile = await Profile.get();
    const r = await fetch(API_BASE + '/api/' + (type==='load'?'loads':'trucks') + '/' + id + '/feature', {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({featured:newVal, requesterPhone: profile.phone||''})
    });
    const d = await r.json().catch(()=>({}));
    if(r.ok && d.paymentRequired){
      toast(`Featuring costs ₹${d.fee} — opening the payment page. It'll show as featured once paid.`);
      if(d.paymentLinkUrl) window.open(d.paymentLinkUrl, '_blank');
    } else if(r.ok){
      await renderAll();
      toast(newVal ? 'Featured — this listing now shows at the top.' : 'Unfeatured.');
    } else {
      toast(d.error || 'Could not update.');
    }
  }catch(e){ toast('Could not reach the server.'); }
};
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
window.editVehicleNumber = async function(truckId, current){
  const value = prompt('Vehicle number (must match Aditi Tracking exactly, e.g. GJ01KT0057):', current || '');
  if(value === null) return; // cancelled
  try{
    await Trucks.update(truckId, { vehicleNumber: value.trim().toUpperCase() });
    toast('Vehicle number updated.');
    await renderAll();
  }catch(e){
    toast('Could not update — try again.');
  }
};
function emptyState(msg, cta){
  const action = cta || '';
  return `<div class="empty-state empty-state-rich">
    <p>${msg}</p>
    ${action}
  </div>`;
}
function emptyBoardCTA(kind){
  if(kind==='loads'){
    return emptyState(t('emptyLoads'), `<button class="btn btn-primary" onclick="openModal('loadModal')">${t('ctaPostLoad')}</button>`);
  }
  return emptyState(t('emptyTrucks'), `<button class="btn btn-primary" onclick="openModal('truckModal')">${t('ctaPostTruck')}</button>`);
}

// ---------- Main render ----------
let CACHE = { loads:[], trucks:[], groups:[], contacts:[], savedSearches:[] };

async function renderAll(){
  const [loads, trucks, groups, contacts, savedSearches] = await Promise.all([
    Loads.all(), Trucks.all(), Groups.all(), Contacts.all(), SavedSearches.all()
  ]);
  CACHE = { loads, trucks, groups, contacts, savedSearches };

  // Restore the pre-empty-marketplace home experience without seeding the real board.
  // A populated API/local board wins; mocks appear only for an empty home-side preview.
  const homeLoads = loads.length ? loads : HOME_ROUTE_MOCKS.loads;
  const homeTrucks = trucks.length ? trucks : HOME_ROUTE_MOCKS.trucks;
  updateHeroStats(homeLoads.length, homeTrucks.length, groups.length);
  checkLaneAlerts(loads, trucks);

  document.getElementById('homeLoadsPreview').innerHTML = homeLoads.slice(0,3).map(l=>routeCardHTML(l,'load')).join('');
  document.getElementById('homeTrucksPreview').innerHTML = homeTrucks.slice(0,3).map(t=>routeCardHTML(t,'truck')).join('');

  renderLoadsList();
  renderTrucksList();
  renderGroups();
  renderContacts();
  renderTicker(homeLoads);
  renderApiStatus();
  renderCityDatalists();
  renderPopularRoutes();
  renderSavedSearches();
  renderLaneAlertsUI();
}
function updateHeroStats(nLoads, nTrucks, nGroups){
  const hasAny = (nLoads + nTrucks) > 0;
  const emptyCta = document.getElementById('heroEmptyCta');
  const stats = document.getElementById('heroStats');
  if(emptyCta) emptyCta.classList.toggle('hidden', hasAny);
  if(stats) stats.classList.toggle('soft-empty', !hasAny);
  const pairs = [['statLoads', nLoads], ['statTrucks', nTrucks], ['statGroups', nGroups]];
  pairs.forEach(([id, n])=>{
    const el = document.getElementById(id);
    const wrap = document.getElementById(id+'Wrap');
    if(!el) return;
    if(n > 0){ animateCount(el, n); if(wrap) wrap.classList.remove('is-zero'); }
    else { el.textContent = '—'; if(wrap) wrap.classList.add('is-zero'); }
  });
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

function withinFreshness(item, hours){
  if(!hours) return true;
  if(!item.ts) return true;
  return (Date.now() - Number(item.ts)) <= (Number(hours) * 3600000);
}
function renderFilterChips(kind){
  const el = document.getElementById(kind==='loads' ? 'loadFilterChips' : 'truckFilterChips');
  if(!el) return;
  const chips = [];
  if(kind==='loads'){
    const f = document.getElementById('filterFromLoads').value.trim();
    const t = document.getElementById('filterToLoads').value.trim();
    const tt = document.getElementById('filterTruckType').value;
    const mt = document.getElementById('filterMinMtLoads').value;
    const mat = document.getElementById('filterMaterialLoads').value.trim();
    const fr = document.getElementById('filterFreshLoads').value;
    if(f) chips.push('From: '+f);
    if(t) chips.push('To: '+t);
    if(tt) chips.push(tt);
    if(mt) chips.push('≥ '+mt+' MT');
    if(mat) chips.push(mat);
    if(fr) chips.push('<'+fr+'h');
  } else {
    const f = document.getElementById('filterFromTrucks').value.trim();
    const t = document.getElementById('filterToTrucks').value.trim();
    const tt = document.getElementById('filterTruckType2').value;
    const mt = document.getElementById('filterMinMtTrucks').value;
    const fr = document.getElementById('filterFreshTrucks').value;
    if(f) chips.push('From: '+f);
    if(t) chips.push('To: '+t);
    if(tt) chips.push(tt);
    if(mt) chips.push('≥ '+mt+' MT');
    if(fr) chips.push('<'+fr+'h');
  }
  el.innerHTML = chips.map(c=>`<span class="filter-chip">${escapeHtml(c)}</span>`).join('');
}
function renderLoadsList(){
  let loads = sortItems(CACHE.loads, document.getElementById('sortLoads')?.value);
  const q = (document.getElementById('searchLoads')?.value || '').trim().toLowerCase();
  const f = document.getElementById('filterFromLoads').value.trim().toLowerCase();
  const t = document.getElementById('filterToLoads').value.trim().toLowerCase();
  const tt = document.getElementById('filterTruckType').value;
  const minMt = Number(document.getElementById('filterMinMtLoads')?.value) || 0;
  const mat = (document.getElementById('filterMaterialLoads')?.value || '').trim().toLowerCase();
  const fresh = document.getElementById('filterFreshLoads')?.value || '';
  if(q) loads = loads.filter(l=> [l.from,l.to,l.material,l.poster].join(' ').toLowerCase().includes(q));
  if(f) loads = loads.filter(l=>(l.from||'').toLowerCase().includes(f));
  if(t) loads = loads.filter(l=>(l.to||'').toLowerCase().includes(t));
  if(tt) loads = loads.filter(l=>l.truckType===tt);
  if(minMt) loads = loads.filter(l=> Number(l.weight||0) >= minMt);
  if(mat) loads = loads.filter(l=> (l.material||'').toLowerCase().includes(mat));
  if(fresh) loads = loads.filter(l=> withinFreshness(l, fresh));
  renderFilterChips('loads');
  const emptyMsg = (CACHE.loads.length === 0)
    ? emptyBoardCTA('loads')
    : emptyState(t('emptyNoMatch'), `<button class="btn btn-ghost" onclick="clearLoadFilters()">${t('btnClearFilters')}</button>`);
  document.getElementById('loadsList').innerHTML = loads.map(l=>routeCardHTML(l,'load')).join('') || emptyMsg;
}
function renderTrucksList(){
  let trucks = sortItems(CACHE.trucks, document.getElementById('sortTrucks')?.value);
  const q = (document.getElementById('searchTrucks')?.value || '').trim().toLowerCase();
  const f = document.getElementById('filterFromTrucks').value.trim().toLowerCase();
  const t = document.getElementById('filterToTrucks').value.trim().toLowerCase();
  const tt = document.getElementById('filterTruckType2').value;
  const minMt = Number(document.getElementById('filterMinMtTrucks')?.value) || 0;
  const fresh = document.getElementById('filterFreshTrucks')?.value || '';
  if(q) trucks = trucks.filter(l=> [l.from,l.to,l.poster,l.driverName].join(' ').toLowerCase().includes(q));
  if(f) trucks = trucks.filter(l=>(l.from||'').toLowerCase().includes(f));
  if(t) trucks = trucks.filter(l=>(l.to||'').toLowerCase().includes(t));
  if(tt) trucks = trucks.filter(l=>l.truckType===tt);
  if(minMt) trucks = trucks.filter(l=> Number(l.capacity||0) >= minMt);
  if(fresh) trucks = trucks.filter(l=> withinFreshness(l, fresh));
  renderFilterChips('trucks');
  const emptyMsg = (CACHE.trucks.length === 0)
    ? emptyBoardCTA('trucks')
    : emptyState(t('emptyNoMatch'), `<button class="btn btn-ghost" onclick="clearTruckFilters()">${t('btnClearFilters')}</button>`);
  document.getElementById('trucksList').innerHTML = trucks.map(tr=>routeCardHTML(tr,'truck')).join('') || emptyMsg;
}
window.clearLoadFilters = function(){
  ['filterFromLoads','filterToLoads','filterTruckType','filterMinMtLoads','filterMaterialLoads','filterFreshLoads','searchLoads'].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value = '';
  });
  renderLoadsList();
};
window.clearTruckFilters = function(){
  ['filterFromTrucks','filterToTrucks','filterTruckType2','filterMinMtTrucks','filterFreshTrucks','searchTrucks'].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value = '';
  });
  renderTrucksList();
};
document.getElementById('applyLoadFilter').addEventListener('click', renderLoadsList);
document.getElementById('applyTruckFilter').addEventListener('click', renderTrucksList);
document.getElementById('searchLoads')?.addEventListener('input', renderLoadsList);
document.getElementById('searchTrucks')?.addEventListener('input', renderTrucksList);
document.getElementById('sortLoads')?.addEventListener('change', renderLoadsList);
document.getElementById('sortTrucks')?.addEventListener('change', renderTrucksList);
['filterMinMtLoads','filterMaterialLoads','filterFreshLoads','filterMinMtTrucks','filterFreshTrucks'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', id.includes('Truck') ? renderTrucksList : renderLoadsList);
  document.getElementById(id)?.addEventListener('input', id.includes('Truck') ? renderTrucksList : renderLoadsList);
});
document.getElementById('swapLoadRoute')?.addEventListener('click', ()=>{
  const a = document.getElementById('filterFromLoads');
  const b = document.getElementById('filterToLoads');
  const tmp = a.value; a.value = b.value; b.value = tmp;
  renderLoadsList();
  toast(t('swappedRoute'));
});
document.getElementById('swapTruckRoute')?.addEventListener('click', ()=>{
  const a = document.getElementById('filterFromTrucks');
  const b = document.getElementById('filterToTrucks');
  const tmp = a.value; a.value = b.value; b.value = tmp;
  renderTrucksList();
  toast(t('swappedRoute'));
});
window.findBackhaulNear = function(city, mode){
  if(!city){ toast('No city on this listing.'); return; }
  if(mode === 'load'){
    // After a load to CITY, find loads FROM that unload city (backhaul)
    showScreen('loads');
    document.getElementById('filterFromLoads').value = city;
    document.getElementById('filterToLoads').value = '';
    renderLoadsList();
    toast('Showing loads from ' + city);
  } else {
    showScreen('loads');
    document.getElementById('filterFromLoads').value = city;
    document.getElementById('filterToLoads').value = '';
    renderLoadsList();
    toast('Showing loads from ' + city);
  }
};

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

function renderTickerInto(id, loads){
  const el = document.getElementById(id);
  if(!el) return;
  const list = Array.isArray(loads) ? loads : [];
  const strip = list.map(l=>`${escapeHtml(l.from)} <span class="dash">✈</span> ${escapeHtml(l.to)}`).join('    •    ');
  const full = strip ? (strip + '    •    ' + strip) : 'Post your first load to see it here    •    Post your first load to see it here';
  el.innerHTML = full;
}
function renderTicker(loads){
  renderTickerInto('routeTicker', loads);
}
function renderLiveRoutesTicker(loads){
  // The public gate always has a useful demo strip; authenticated home prefers API data.
  const demoLoads = HOME_ROUTE_MOCKS.loads;
  renderTickerInto('gateRouteTicker', demoLoads);
  renderTickerInto('routeTicker', loads && loads.length ? loads : demoLoads);
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
  document.getElementById('profPayoutUpi').value = p.payoutUpiId||'';
  currentDrivers = p.drivers || [];
  renderDriverList();
  renderVerificationStatus(p);
  renderTruckDriverSelect();
  renderSalaryDriverSelect();
}
function renderVerificationStatus(p){
  const el = document.getElementById('verificationStatus');
  if(!el) return;
  const complete = Boolean(p.name && p.phone);
  el.innerHTML = complete
    ? `<span class="verified-badge">Profile complete</span> <span class="hint" style="margin:0;">Name and phone are on file — your posts show this badge. Details on record only — not independently verified.</span>`
    : `<span class="unverified-badge">○ Profile incomplete</span> <span class="hint" style="margin:0;">Add your name and phone above to show "Profile complete" on your posts.</span>`;
}
async function persistProfile(){
  const p = {
    name: document.getElementById('profName').value.trim(),
    role: document.getElementById('profRole').value,
    city: document.getElementById('profCity').value.trim(),
    phone: document.getElementById('profPhone').value.trim(),
    gst: document.getElementById('profGST').value.trim(),
    payoutUpiId: document.getElementById('profPayoutUpi').value.trim(),
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
    verified: Boolean(profile.name && profile.phone),
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
    rate: val('truckRate') || '',
    poster: profile.name || 'You', phone: profile.phone || '',
    driverName: val('truckDriverName'), driverPhone: val('truckDriverPhone'),
    vehicleNumber: val('truckVehicleNumber').trim().toUpperCase(),
    payoutUpiId: val('truckPayoutUpi').trim(),
    verified: Boolean(profile.name && profile.phone),
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
window.checkRateEstimate = async function(){
  const from = val('loadFrom').trim();
  const to = val('loadTo').trim();
  const truckType = val('loadTruckType');
  const resultEl = document.getElementById('rateEstimateResult');
  if(!from || !to){ resultEl.textContent = 'Enter both From and To city first.'; return; }
  resultEl.textContent = 'Checking...';
  try{
    const r = await fetch(API_BASE + '/api/rate-estimate?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&truckType=' + encodeURIComponent(truckType||''));
    const d = await r.json();
    if(d.available){
      resultEl.textContent = `Typical rate for this route: ₹${d.avgRate.toLocaleString('en-IN')} (from ${d.sampleSize} recent load${d.sampleSize>1?'s':''}, ₹${d.minRate.toLocaleString('en-IN')}–₹${d.maxRate.toLocaleString('en-IN')})`;
    } else {
      resultEl.textContent = d.message || 'No pricing history yet for this route.';
    }
  }catch(e){ resultEl.textContent = 'Could not reach the server.'; }
};

// ---------- Broadcast / Send modal ----------
let currentSendMessage = '';
window.openBookingModal = async function(id, type){
  const list = type==='load' ? CACHE.loads : CACHE.trucks;
  let item = list.find(i=>i.id===id);
  if(!item){
    const fresh = type==='load' ? await Loads.all() : await Trucks.all();
    item = fresh.find(i=>i.id===id);
  }
  if(!item) return;

  document.getElementById('bookingItemId').value = id;
  document.getElementById('bookingItemType').value = type;
  document.getElementById('bookingSummary').textContent =
    `${item.from} → ${item.to||'Anywhere'} · ${item.truckType||''} · Posted by ${item.poster}`;
  document.getElementById('bookingTotalAmount').value = item.rate || '';
  document.getElementById('bookingResult').textContent = '';

  const profile = await Profile.get();
  document.getElementById('bookingMyName').value = profile.name || '';
  document.getElementById('bookingMyPhone').value = profile.phone || '';

  // Booking a truck: the truck's own listed payout UPI is used automatically.
  // Booking a load: you (the transporter) need to supply your own payout UPI.
  const payoutRow = document.getElementById('bookingPayoutRow');
  if(type === 'truck'){
         document.getElementById('bookingTermsAccept').closest('label').style.display = '';
    payoutRow.innerHTML = item.payoutUpiId
      ? `<p class="hint" style="margin-top:0;">Transporter UPI on file: <b>${escapeHtml(item.payoutUpiId)}</b> — use this when you settle freight directly. Online checkout (if any) is only a booking confirmation / platform fee.</p>`
      : `<div class="legal-notice">This truck has no UPI on file — you can still confirm interest and settle freight directly once you agree terms. Add UPI on the listing for faster coordination.</div>`;
  } else {
    payoutRow.innerHTML = `<label>Your payout UPI ID <span style="font-weight:400;color:var(--text-muted);">(where you'll receive payment as the transporter)</span>
      <input required type="text" id="bookingMyUpi" placeholder="yourname@upi" value="${escapeHtml(profile.payoutUpiId||'')}"></label>`;
       if (type !== 'truck') {
              payoutRow.innerHTML += `<label>Your vehicle number <input required type="text" id="bookingVehicleNumber" placeholder="e.g. GJ01KT0057"></label>
                  <label>Driver name <input required type="text" id="bookingDriverName" placeholder="Driver's full name"></label>
                      <label>Driver phone <input required type="text" id="bookingDriverPhone" placeholder="10-digit mobile"></label>
                          <p class="hint">Confirm the booking here. Freight is settled directly with the shipper (UPI / NEFT / cash) after loading — Maalwala does not hold freight in escrow. Any online checkout is only a booking confirmation / platform fee if enabled.</p>`;
              document.getElementById('bookingTermsAccept').closest('label').style.display = 'none';
       }
  }

  updateEscrowPreview();
  document.getElementById('bookingTotalAmount').oninput = updateEscrowPreview;

  const status = await (async ()=>{ try{ const r = await fetch(API_BASE + '/api/payments/status'); return r.ok ? r.json() : {paymentsConfigured:false}; }catch(e){ return {paymentsConfigured:false}; } })();
  document.getElementById('bookingConfigWarning').style.display = status.paymentsConfigured ? 'none' : 'block';

  openModal('bookingModal');
};
function updateEscrowPreview(){
  const total = Number(document.getElementById('bookingTotalAmount').value) || 0;
  const el = document.getElementById('escrowSplitPreview');
  if(!el) return;
  el.innerHTML = total
    ? `<span>Agreed freight: <b>₹${total.toLocaleString('en-IN')}</b> — settle directly (UPI / NEFT / cash)</span>
       <span class="hint" style="margin:0;display:block;">Not freight escrow. Online pay (if shown) = booking confirmation / platform fee only.</span>`
    : `<span class="hint" style="margin:0;">Enter the freight you agreed — it is paid off-platform between you and the counterparty.</span>`;
}
document.getElementById('bookingForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const id = document.getElementById('bookingItemId').value;
  const type = document.getElementById('bookingItemType').value;
  const list = type==='load' ? CACHE.loads : CACHE.trucks;
  const item = list.find(i=>i.id===id);
  if(!item) return;

  const totalAmount = Number(document.getElementById('bookingTotalAmount').value);
  const myName = document.getElementById('bookingMyName').value.trim();
  const myPhone = document.getElementById('bookingMyPhone').value.trim();
  const resultEl = document.getElementById('bookingResult');

  let payload;
  if(type === 'truck'){
    payload = {
      truckId: id, route: `${item.from} → ${item.to||'Anywhere'}`, totalAmount,
      shipperName: myName, shipperPhone: myPhone,
      transporterName: item.poster, transporterPhone: item.phone, transporterUpiId: item.payoutUpiId || '',
      termsAccepted: document.getElementById('bookingTermsAccept').checked,
    };
  } else {
    const myUpi = document.getElementById('bookingMyUpi').value.trim();
    if(!myUpi){ resultEl.textContent = 'Enter your payout UPI ID.'; return; }
    payload = {
      loadId: id, route: `${item.from} → ${item.to||'Anywhere'}`, totalAmount,
      shipperName: item.poster, shipperPhone: item.phone,
      transporterName: myName, transporterPhone: myPhone, transporterUpiId: myUpi,
      termsAccepted: document.getElementById('bookingTermsAccept').checked,
    };
  }
   if (type !== 'truck') {
        payload.vehicleNumber = document.getElementById('bookingVehicleNumber').value.trim().toUpperCase();
        payload.driverName = document.getElementById('bookingDriverName').value.trim();
        payload.driverPhone = document.getElementById('bookingDriverPhone').value.trim();
   }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Confirming…';
  try{
    const r = await fetch(API_BASE + '/api/bookings', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    const data = await r.json();
    if(!r.ok){ resultEl.textContent = data.error || 'Could not create booking.'; }
    else{
       if (!data.paymentLinkUrl) {
            closeModal('bookingModal');
            toast(`Load booked! Contact ${data.shipperName || 'the shipper'}${data.shipperPhone ? ' (' + data.shipperPhone + ')' : ''} to coordinate pickup.`);
            showScreen('bookings');
            btn.disabled = false; btn.textContent = 'Confirm Booking';
            return;
       }
      resultEl.textContent = 'Booking created — opening payment page…';
      window.open(data.paymentLinkUrl, '_blank');
      closeModal('bookingModal');
      toast('Booking created. Check "My Bookings" for status.');
      showScreen('bookings');
    }
  }catch(err){
    resultEl.textContent = 'Could not reach the server.';
  }
  btn.disabled = false; btn.textContent = 'Confirm Booking';
});

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
async function initApp(){
  seedLocalIfEmpty();
  await renderAll();
  await loadProfileForm();
  renderAccountState();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

// ---------- Auth gate (mandatory OTP login before anything else loads) ----------
const AuthGate = {
  getToken: ()=> localStorage.getItem('mw_token'),
  getUser: ()=> { try{ return JSON.parse(localStorage.getItem('mw_user')||'null'); }catch(e){ return null; } },
  setSession: (token, user)=>{ localStorage.setItem('mw_token', token); localStorage.setItem('mw_user', JSON.stringify(user)); },
  clearSession: ()=>{ localStorage.removeItem('mw_token'); localStorage.removeItem('mw_user'); },
};
async function checkExistingSession(){
  const token = AuthGate.getToken();
  if(!token || !USE_API) return false;
  try{
    const r = await fetch(API_BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if(r.ok) return true;
  }catch(e){}
  AuthGate.clearSession();
  return false;
}
function hideAuthGate(){
  document.getElementById('authGate').style.display = 'none';
  setTimeout(maybeShowRolePicker, 500);
  document.body.style.overflow = '';
}
function showAuthGate(){
  document.getElementById('authGate').style.display = '';
  document.getElementById('gateFooterYear').textContent = new Date().getFullYear();
}

document.getElementById('gateGetStartedBtn')?.addEventListener('click', ()=>{
  document.getElementById('gateLoginCard').scrollIntoView({behavior:'smooth', block:'center'});
});
document.getElementById('gateThemeToggle')?.addEventListener('click', ()=>{
  document.getElementById('themeToggle').click(); // reuse the same theme logic
});

// Firebase Phone Auth (replaces MSG91 /api/auth/request-otp + verify-otp)
let lastOtpPhone = '';
let gateConfirmationResult = null;
let gateRecaptchaVerifier = null;
let firebaseAppReady = false;

function isFirebaseConfigured(){
  const cfg = window.MAALWALA_FIREBASE || {};
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

function ensureFirebaseApp(){
  if(firebaseAppReady) return true;
  if(typeof firebase === 'undefined') throw new Error('Firebase SDK failed to load. Check your network and refresh.');
  if(!isFirebaseConfigured()) return false;
  if(!firebase.apps.length){
    firebase.initializeApp(window.MAALWALA_FIREBASE);
  }
  firebaseAppReady = true;
  return true;
}

function clearGateRecaptcha(){
  try{
    if(gateRecaptchaVerifier){
      gateRecaptchaVerifier.clear();
      gateRecaptchaVerifier = null;
    }
  }catch(e){}
  const el = document.getElementById('gateRecaptcha');
  if(el) el.innerHTML = '';
}

function friendlyFirebaseError(err){
  const code = (err && err.code) || '';
  const msg = (err && err.message) || '';
  if(code === 'auth/invalid-phone-number') return 'That mobile number looks invalid. Use a 10-digit Indian number.';
  if(code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and try again.';
  if(code === 'auth/captcha-check-failed' || code === 'auth/invalid-app-credential')
    return 'Security check failed. Refresh the page and try again.';
  if(code === 'auth/quota-exceeded') return 'SMS quota exceeded. Please try again later.';
  if(code === 'auth/invalid-verification-code') return 'Incorrect code. Check the SMS and try again.';
  if(code === 'auth/code-expired' || code === 'auth/session-expired')
    return 'That code has expired. Go back and request a new one.';
  if(code === 'auth/missing-verification-code') return 'Enter the 6-digit code from your SMS.';
  if(code === 'auth/network-request-failed') return 'Network error talking to Firebase. Check your connection.';
  if(msg) return msg;
  return 'Something went wrong. Please try again.';
}

document.getElementById('gateSendOtpBtn')?.addEventListener('click', async ()=>{
  const phone = document.getElementById('gatePhoneInput').value.replace(/\D/g,'');
  const errEl = document.getElementById('gatePhoneError');
  errEl.classList.add('hidden');
  if(phone.length !== 10){ errEl.textContent = 'Enter a valid 10-digit mobile number.'; errEl.classList.remove('hidden'); return; }
  if(!USE_API){ errEl.textContent = 'Backend not connected — see config.js. Login needs a server.'; errEl.classList.remove('hidden'); return; }
  if(!isFirebaseConfigured()){
    errEl.textContent = 'Firebase is not configured yet — see config.js';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('gateSendOtpBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try{
    ensureFirebaseApp();
    clearGateRecaptcha();
    gateRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('gateRecaptcha', { size: 'invisible' });
    const confirmation = await firebase.auth().signInWithPhoneNumber('+91' + phone, gateRecaptchaVerifier);
    gateConfirmationResult = confirmation;
    lastOtpPhone = phone;
    document.getElementById('gatePhoneStep').classList.add('hidden');
    document.getElementById('gateOtpStep').classList.remove('hidden');
    document.getElementById('gateOtpSentTo').textContent = `Code sent by SMS to +91 ${phone}`;
    const devNotice = document.getElementById('gateDevCodeNotice');
    if(devNotice) devNotice.classList.add('hidden');
  }catch(e){
    clearGateRecaptcha();
    errEl.textContent = friendlyFirebaseError(e);
    errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = 'Send OTP';
});

document.getElementById('gateBackToPhoneBtn')?.addEventListener('click', ()=>{
  document.getElementById('gateOtpStep').classList.add('hidden');
  document.getElementById('gatePhoneStep').classList.remove('hidden');
  document.getElementById('gateOtpInput').value = '';
  gateConfirmationResult = null;
  lastOtpPhone = '';
  clearGateRecaptcha();
  document.getElementById('gatePhoneError').classList.add('hidden');
});

document.getElementById('gateVerifyOtpBtn')?.addEventListener('click', async ()=>{
  const code = document.getElementById('gateOtpInput').value.trim();
  const errEl = document.getElementById('gatePhoneError');
  errEl.classList.add('hidden');
  if(code.length !== 6){ errEl.textContent = 'Enter the 6-digit code.'; errEl.classList.remove('hidden'); return; }
  if(!gateConfirmationResult){
    errEl.textContent = 'Session expired. Go back and request a new code.';
    errEl.classList.remove('hidden');
    return;
  }
  if(!USE_API){ errEl.textContent = 'Backend not connected — see config.js. Login needs a server.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('gateVerifyOtpBtn');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try{
    const cred = await gateConfirmationResult.confirm(code);
    const idToken = await cred.user.getIdToken();
    const r = await fetch(API_BASE + '/api/auth/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    let data = {};
    try{ data = await r.json(); }catch(_){}
    if(!r.ok){
      if(r.status === 503){
        errEl.textContent = data.error || 'Phone login is not configured on the server yet (FIREBASE_SERVICE_ACCOUNT_JSON).';
      } else {
        errEl.textContent = data.error || 'Could not complete login.';
      }
      errEl.classList.remove('hidden');
    } else {
      AuthGate.setSession(data.token, data.user);
      gateConfirmationResult = null;
      clearGateRecaptcha();
      hideAuthGate();
      await initApp();
      toast('Welcome to Maalwala.');
    }
  }catch(e){
    errEl.textContent = friendlyFirebaseError(e);
    errEl.classList.remove('hidden');
  }
  btn.disabled = false; btn.textContent = 'Verify & Continue';
});

(async function boot(){
  // Render the public preview before the async session check or auth gate decision.
  renderLiveRoutesTicker();
  const loggedIn = await checkExistingSession();
  if(loggedIn){
    hideAuthGate();
    await initApp();
  } else {
    showAuthGate();
  }
})();

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
let truckMarkers = {}; // truckId -> Leaflet marker, so the vehicle list panel can locate/open them
const reverseGeocodeCache = {}; // avoid repeat lookups for the same rounded coordinate
async function reverseGeocodeInto(elId, lat, lng){
  const el = document.getElementById(elId);
  if(!el) return;
  const key = lat.toFixed(3) + ',' + lng.toFixed(3); // ~100m precision is plenty, and lets nearby re-syncs reuse the cache
  if(reverseGeocodeCache[key]){
    el.textContent = '📍 Near ' + reverseGeocodeCache[key];
    return;
  }
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12`, {
      headers: { 'Accept-Language': 'en' } // Nominatim is free/keyless but asks for identifiable, non-hammering usage
    });
    const data = await r.json();
    const a = data.address || {};
    const place = a.city || a.town || a.village || a.county || a.state_district || a.state || 'Unknown area';
    reverseGeocodeCache[key] = place;
    if(document.getElementById(elId)) el.textContent = '📍 Near ' + place; // guard: popup may have closed by the time this resolves
  }catch(e){
    if(document.getElementById(elId)) el.textContent = `📍 (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
  }
}
async function renderFleetMap(){
  const trucks = CACHE.trucks || [];
  document.getElementById('fleetTotalTrucks').textContent = trucks.length;
  document.getElementById('fleetOnRoute').textContent = trucks.filter(t=>t.to && t.to.toLowerCase() !== 'anywhere').length;
  const cities = new Set(trucks.map(t=>t.from).filter(Boolean));
  document.getElementById('fleetCities').textContent = cities.size;

  const pingSelect = document.getElementById('manualPingTruck');
  if(pingSelect){
    const current = pingSelect.value;
    pingSelect.innerHTML = '<option value="">— Select a posted truck —</option>' +
      trucks.map(t=>`<option value="${t.id}">${escapeHtml(t.from)} → ${escapeHtml(t.to||'Anywhere')} (${escapeHtml(t.poster)})</option>`).join('');
    if(current) pingSelect.value = current;
  }

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
  truckMarkers = {};
  const STATUS_COLORS = { Running:'#1b7a41', Idle:'#c98a00', Stopped:'#b23', Inactive:'#6b7280' };
  function iconFor(status){
    const color = status ? (STATUS_COLORS[status] || 'var(--orange)') : 'var(--orange)'; // no status yet (estimated) = brand orange
    return L.divIcon({ className: '', html: `<div class="truck-map-marker" style="background:${color};">🚚</div>`, iconSize: [26,26] });
  }

  // Real GPS pings take priority the moment any exist — this is what
  // flips the dashboard from demo to live, with zero other changes needed.
  const realPositions = await FleetPositions.latest();
  const realByTruck = {};
  realPositions.forEach(p => { realByTruck[p.truckId] = p; });

  let liveCount = 0;
  const sosTrucks = [];
  const idleStoppedTrucks = [];
  const vehicleListItems = [];
  trucks.forEach(t=>{
    const real = realByTruck[t.id];
    let lat, lng, popupNote, isLive = false;
    if(real){
      lat = real.lat; lng = real.lng;
      popupNote = `<span style="color:#1b7a41;font-size:11px;">🟢 Live GPS position</span>`;
      isLive = true;
      liveCount++;
      if(real.sos) sosTrucks.push(t);
      if(real.status === 'Idle' || real.status === 'Stopped') idleStoppedTrucks.push({ truck: t, status: real.status });
    } else {
      const c = coordsFor(t.from);
      if(!c) return;
      const jitter = () => (Math.random() - 0.5) * 0.15;
      lat = c[0] + jitter(); lng = c[1] + jitter();
      popupNote = `<span style="color:#8a96ab;font-size:11px;">Estimated position — based on listed city</span>`;
    }
    const marker = L.marker([lat, lng], { icon: iconFor(real?.status) }).addTo(fleetMarkersLayer);
    truckMarkers[t.id] = marker;
    vehicleListItems.push({ truckId: t.id, label: t.vehicleNumber || t.poster, status: real?.status || (isLive ? null : 'Not connected') });
    const vehicleLine = t.vehicleNumber ? `<br>🚚 ${escapeHtml(t.vehicleNumber)}` : '';
    const popupId = 'popup-loc-' + t.id;
    const locationLine = isLive
      ? `<br><span id="${popupId}">📍 Looking up current location…</span>`
      : `<br>📍 Near ${escapeHtml(t.from)} (estimated)`;

    let statusLine = '';
    if(isLive && real){
      const statusColors = {Running:'#1b7a41', Idle:'#a66a00', Stopped:'#b23', Inactive:'#8a96ab'};
      const statusColor = statusColors[real.status] || '#8a96ab';
      const bits = [];
      if(real.status) bits.push(`<span style="color:${statusColor};font-weight:700;">● ${escapeHtml(real.status)}</span>`);
      if(real.ignition !== null && real.ignition !== undefined) bits.push(`🔑 ${real.ignition ? 'ON' : 'OFF'}`);
      if(real.speed != null) bits.push(`${Math.round(real.speed)} km/h`);
      if(bits.length) statusLine = `<br>${bits.join(' · ')}`;
      if(real.driverName) statusLine += `<br>🧑‍✈️ ${escapeHtml(real.driverName)}`;
      if(real.odometer != null) statusLine += `<br>🛣️ ${Math.round(real.odometer).toLocaleString('en-IN')} km total`;
      if(real.sos) statusLine += `<br><span style="color:#b23;font-weight:700;">🚨 SOS ALERT ACTIVE</span>`;
    }

    marker.bindPopup(`<b>${escapeHtml(t.poster)}</b>${vehicleLine}<br>${escapeHtml(t.truckType)}, ${t.capacity} T${locationLine}${statusLine}<br>${popupNote}`);
    if(isLive){
      marker.on('popupopen', ()=> reverseGeocodeInto(popupId, lat, lng));
    }
  });

  const sosBanner = document.getElementById('fleetSosBanner');
  if(sosBanner){
    if(sosTrucks.length){
      sosBanner.classList.remove('hidden');
      sosBanner.innerHTML = `🚨 <b>SOS alert</b> — ${sosTrucks.map(t=>escapeHtml(t.vehicleNumber||t.poster)).join(', ')}. Check on ${sosTrucks.length>1?'these vehicles':'this vehicle'} immediately.`;
    } else {
      sosBanner.classList.add('hidden');
    }
  }

  const idleEl = document.getElementById('fleetIdleAlerts');
  if(idleEl){
    idleEl.innerHTML = idleStoppedTrucks.length
      ? idleStoppedTrucks.map(({truck, status})=>{
          const dotClass = status === 'Stopped' ? 'geofence' : 'idle';
          return `<div class="alert-row"><span class="alert-dot ${dotClass}"></span> ${escapeHtml(truck.vehicleNumber||truck.poster)} — ${escapeHtml(status)}</div>`;
        }).join('')
      : (liveCount > 0
          ? '<div class="empty-state">All connected trucks are running.</div>'
          : '<div class="empty-state">No status data yet — sync from Aditi Tracking above.</div>');
  }

  // Status summary bar (Running/Idle/Stopped/Inactive/Total) — Aditi-dashboard style
  const counts = { Running:0, Idle:0, Stopped:0, other:0 };
  vehicleListItems.forEach(v=>{
    if(v.status === 'Running') counts.Running++;
    else if(v.status === 'Idle') counts.Idle++;
    else if(v.status === 'Stopped') counts.Stopped++;
    else counts.other++;
  });
  const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  setText('statusRunning', counts.Running);
  setText('statusIdle', counts.Idle);
  setText('statusStopped', counts.Stopped);
  setText('statusInactive', counts.other);
  setText('statusTotal', vehicleListItems.length);

  // Clickable vehicle list panel — Aditi-dashboard style
  const listEl = document.getElementById('fleetVehicleList');
  if(listEl){
    const dotColor = (status) => ({Running:'#1b7a41', Idle:'#c98a00', Stopped:'#b23'}[status] || '#6b7280');
    listEl.innerHTML = vehicleListItems.length
      ? vehicleListItems.map(v=>`
          <div class="fleet-vehicle-row" onclick="focusFleetVehicle('${v.truckId}')">
            <span class="v-dot" style="background:${dotColor(v.status)};"></span>
            <div class="v-info">
              <div class="v-name">${escapeHtml(v.label)}</div>
              <div class="v-status">${escapeHtml(v.status || 'Not connected')}</div>
            </div>
          </div>`).join('')
      : '<div class="empty-state">No trucks posted yet.</div>';
  }

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

// ---------- Bulk fleet add ----------
document.getElementById('bulkAddBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('bulkAddBtn');
  const resultEl = document.getElementById('bulkAddResult');
  const from = document.getElementById('bulkFrom').value.trim();
  const truckType = document.getElementById('bulkTruckType').value;
  const capacity = document.getElementById('bulkCapacity').value;
  const vehicleNumbers = document.getElementById('bulkVehicleNumbers').value
    .split('\n').map(v=>v.trim().toUpperCase()).filter(Boolean);

  if(!from || !capacity){ resultEl.textContent = 'Fill in the shared From city and Capacity first.'; return; }
  if(!vehicleNumbers.length){ resultEl.textContent = 'Add at least one vehicle number.'; return; }

  btn.disabled = true;
  const profile = await Profile.get();
  let created = 0, failed = 0;
  for(let i=0; i<vehicleNumbers.length; i++){
    btn.textContent = `Posting ${i+1} of ${vehicleNumbers.length}…`;
    try{
      await Trucks.create({
        from, to: 'Anywhere', truckType, capacity,
        poster: profile.name || 'You', phone: profile.phone || '',
        vehicleNumber: vehicleNumbers[i],
        verified: Boolean(profile.name && profile.phone),
      });
      created++;
    }catch(e){ failed++; }
  }
  btn.disabled = false; btn.textContent = 'Post All Vehicles';
  resultEl.textContent = `Posted ${created} truck(s)${failed ? `, ${failed} failed` : ''}. Head to the Aditi sync box above to pull their live positions.`;
  await renderAll();
});

window.focusFleetVehicle = function(truckId){
  const marker = truckMarkers[truckId];
  if(!marker || !fleetMapInstance) return;
  fleetMapInstance.setView(marker.getLatLng(), 8, { animate: true });
  marker.openPopup();
};

// ---------- Aditi Tracking sync (pull API) ----------
async function checkAditiStatus(){
  const tag = document.getElementById('aditiStatusTag');
  if(!tag || !USE_API) return;
  try{
    const r = await fetch(API_BASE + '/api/fleet/aditi-status');
    const data = await r.json();
    tag.textContent = data.configured ? 'connected' : 'not configured yet';
    tag.classList.toggle('off', !data.configured);
  }catch(e){
    tag.textContent = 'not configured yet';
    tag.classList.add('off');
  }
}
let aditiAutoSyncInterval = null;
async function runAditiSync(silent){
  const btn = document.getElementById('aditiSyncBtn');
  const resultEl = document.getElementById('aditiSyncResult');
  if(!silent){ btn.disabled = true; btn.textContent = 'Syncing…'; }
  try{
    const r = await fetch(API_BASE + '/api/fleet/sync-aditi', { method:'POST' });
    const data = await r.json();
    if(!r.ok){ resultEl.textContent = data.error || 'Sync failed.'; }
    else if(data.note){ resultEl.textContent = data.note; }
    else{
      const when = new Date().toLocaleTimeString('en-IN');
      resultEl.textContent = `Synced ${data.synced} of ${data.requested} truck(s) at ${when}. Aditi returned ${data.rowsReturned ?? '?'} vehicle row(s) total.` +
        (data.notFound && data.notFound.length ? ` No match for: ${data.notFound.join(', ')}.` : '');
      await renderFleetMap();
    }
  }catch(e){
    resultEl.textContent = 'Could not reach the sync endpoint.';
  }
  if(!silent){ btn.disabled = false; btn.textContent = '🔄 Sync positions from Aditi Tracking'; }
}
function startAditiAutoSync(){
  stopAditiAutoSync(); // avoid stacking multiple intervals
  runAditiSync(true); // sync right away instead of waiting for the first interval
  aditiAutoSyncInterval = setInterval(()=> runAditiSync(true), 120000); // every 2 minutes
}
function stopAditiAutoSync(){
  if(aditiAutoSyncInterval){ clearInterval(aditiAutoSyncInterval); aditiAutoSyncInterval = null; }
}
document.getElementById('aditiSyncBtn')?.addEventListener('click', ()=> runAditiSync(false));

// ---------- Manual position update (for GPS apps without API access) ----------
function parseMapsLink(url){
  // Handles common Google Maps URL shapes: ?q=lat,lng  /@lat,lng,zoom  or a bare "lat,lng" pasted directly
  const patterns = [
    /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/,
  ];
  for(const p of patterns){
    const m = url.match(p);
    if(m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}
document.getElementById('manualPingBtn')?.addEventListener('click', async ()=>{
  const truckId = document.getElementById('manualPingTruck').value;
  const resultEl = document.getElementById('manualPingResult');
  if(!truckId){ resultEl.textContent = 'Select which truck this is for.'; return; }

  let lat = parseFloat(document.getElementById('manualPingLat').value);
  let lng = parseFloat(document.getElementById('manualPingLng').value);

  const link = document.getElementById('manualPingMapsLink').value.trim();
  if(link && (isNaN(lat) || isNaN(lng))){
    const parsed = parseMapsLink(link);
    if(parsed){ lat = parsed.lat; lng = parsed.lng; }
  }

  if(isNaN(lat) || isNaN(lng)){
    resultEl.textContent = "Couldn't read a location — paste a Google Maps link with coordinates, or fill in latitude/longitude directly.";
    return;
  }

  try{
    await FleetPositions.ping(truckId, lat, lng);
    resultEl.textContent = 'Position updated — check the map above.';
    document.getElementById('manualPingMapsLink').value = '';
    document.getElementById('manualPingLat').value = '';
    document.getElementById('manualPingLng').value = '';
    await renderFleetMap();
  }catch(e){
    resultEl.textContent = e.message;
  }
});

// ---------- Bookings ----------
const BOOKING_STATUS_LABEL = {
  booked: { text: 'Booked — awaiting loading', color: '#8a96ab' },
  awaiting_payment: { text: 'Awaiting payment', color: '#8a96ab' },
  cancelled: { text: 'Cancelled', color: '#8a96ab' },
  funded: { text: 'Confirmation paid — coordinate with counterparty', color: '#c98a00' },
  in_transit: { text: 'In transit — settle freight directly', color: '#1565C0' },
  delivered_pending_confirmation: { text: 'Delivered — confirm remaining settlement', color: '#c98a00' },
  disputed: { text: '⚠️ Disputed', color: '#b23' },
  completed: { text: '✅ Completed', color: '#1b7a41' },
  refund_pending_manual: { text: 'Refund pending (manual)', color: '#b23' },
};
async function renderBookings(){
  // Ask the server to release anything past its window first, so the list is current.
  try{ await fetch(API_BASE + '/api/bookings/check-releases', {method:'POST'}); }catch(e){}

  const el = document.getElementById('bookingsList');
  const profile = await Profile.get();
  let bookings = [];
  try{
    const r = await fetch(API_BASE + '/api/bookings?phone=' + encodeURIComponent(profile.phone||''));
    if(r.ok) bookings = await r.json();
  }catch(e){}

  if(!bookings.length){ el.innerHTML = emptyState('No bookings yet — book a load or truck to see it here.'); return; }
  el.innerHTML = bookings.sort((a,b)=>b.ts-a.ts).map(bk=>{
    const status = BOOKING_STATUS_LABEL[bk.status] || { text: bk.status, color: '#8a96ab' };
    const isTransporter = bk.transporterPhone && bk.transporterPhone === profile.phone;
    const isShipper = bk.shipperPhone && bk.shipperPhone === profile.phone;

    let actions = '';
    if(isTransporter && bk.status==='booked'){
      actions = `<button class="btn btn-ghost" onclick="cancelBooking('${bk.id}','transporter')">✖ Cancel Booking</button>`;
    }
    if(isShipper && bk.status==='booked' && bk.loadId){
      actions = `<button class="btn btn-accent" onclick="markLoadedAndRequestPayment('${bk.id}')">📦 Mark Loaded & Request Payment</button>`;
    }
    if(isTransporter && ['funded','in_transit'].includes(bk.status)){
      actions = `<button class="btn btn-primary" onclick="markBookingDelivered('${bk.id}')">📦 Mark Delivered</button>`;
    }
    if(isTransporter && bk.status==='delivered_pending_confirmation'){
      actions = `<button class="btn btn-primary" onclick="requestEarlyPayout('${bk.id}')">⚡ Get Balance Now (2% fee)</button>`;
    }
    if(isShipper && bk.status==='awaiting_payment' && bk.truckId){
      actions = `<button class="btn btn-ghost" onclick="cancelBooking('${bk.id}','shipper')">✖ Cancel Booking</button>`;
    }
    if(isShipper && bk.status === 'delivered_pending_confirmation'){
      const hoursLeft = Math.max(0, Math.round(48 - (Date.now()-bk.deliveryConfirmedAt)/3600000));
      actions = `<span class="hint" style="margin:0;">Auto-releases in ~${hoursLeft}h unless disputed</span>
        <button class="btn btn-ghost" onclick="disputeBooking('${bk.id}')">⚠️ Raise Dispute</button>`;
    }
    if(bk.status === 'disputed'){
      actions = `<span class="hint" style="margin:0;">Reason: ${escapeHtml(bk.disputeReason||'')}</span>`;
    }

    return `
    <div class="route-card">
      <div class="route-card-top">
        <div class="route-line"><span class="route-dot"></span>${escapeHtml(bk.route||'Booking')}</div>
        <span class="tag" style="background:${status.color}22; color:${status.color};">${escapeHtml(status.text)}</span>
      </div>
      <div class="route-meta">
        <span>Shipper: <b>${escapeHtml(bk.shipperName)}</b></span>
        <span>Transporter: <b>${escapeHtml(bk.transporterName)}</b></span>
      </div>
      <div class="route-meta">
        <span>Total: <b>₹${Number(bk.totalAmount).toLocaleString('en-IN')}</b></span>
        ${bk.advanceAmount!=null ? `<span>Recorded advance: ₹${Number(bk.advanceAmount).toLocaleString('en-IN')}</span>` : ''}
        ${bk.balanceAmount!=null ? `<span>Recorded balance: ₹${Number(bk.balanceAmount).toLocaleString('en-IN')}</span>` : ''}
        <span class="hint" style="margin:0;">Freight settlement is between parties</span>
      </div>
      <div class="route-card-actions">${actions}</div>
    </div>`;
  }).join('');
}
window.markBookingDelivered = async function(bookingId){
  const podFile = document.createElement('input');
  podFile.type = 'file'; podFile.accept = 'image/*';
  podFile.onchange = async ()=>{
    let podPhoto = null;
    if(podFile.files[0]){
      if(podFile.files[0].size > 4*1024*1024){ toast('Photo too large — use one under 4MB.'); return; }
      podPhoto = await fileToBase64(podFile.files[0]);
    }
    try{
      const r = await fetch(API_BASE + '/api/bookings/'+bookingId+'/mark-delivered', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({podPhoto})
      });
      if(r.ok){ toast('Marked delivered — settle any remaining balance directly with the shipper unless your booking used a platform fee flow.'); renderBookings(); }
      else{ const d = await r.json().catch(()=>({})); toast(d.error || 'Could not update booking.'); }
    }catch(e){ toast('Could not reach the server.'); }
  };
  podFile.click();
};
window.disputeBooking = async function(bookingId){
  const reason = prompt('Reason for the dispute (required):');
  if(!reason) return;
  try{
    const r = await fetch(API_BASE + '/api/bookings/'+bookingId+'/dispute', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({reason})
    });
    if(r.ok){ toast('Dispute raised — the balance payout is frozen pending review.'); renderBookings(); }
    else{ const d = await r.json().catch(()=>({})); toast(d.error || 'Could not raise dispute.'); }
  }catch(e){ toast('Could not reach the server.'); }
};

window.cancelBooking = async function(bookingId, cancelledBy){
  if(!confirm('Cancel this booking? A cancellation fee may apply.')) return;
  const reason = prompt('Reason for cancelling (optional):') || '';
  try{
    const r = await fetch(API_BASE + '/api/bookings/'+bookingId+'/cancel', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cancelledBy, reason})
    });
    const d = await r.json().catch(()=>({}));
    if(r.ok){
      toast(d.cancellationFeeLinkUrl ? 'Booking cancelled — a cancellation fee link has been generated.' : 'Booking cancelled.');
      renderBookings();
    } else { toast(d.error || 'Could not cancel booking.'); }
  }catch(e){ toast('Could not reach the server.'); }
};

window.markLoadedAndRequestPayment = async function(bookingId){
  const ewayBillNumber = prompt('Enter the e-way bill number for this shipment:');
  if(!ewayBillNumber) return;
  try{
    const r = await fetch(API_BASE + '/api/bookings/'+bookingId+'/mark-loaded', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ewayBillNumber})
    });
    const d = await r.json().catch(()=>({}));
    if(r.ok){
      toast('Loaded — payment requested from the shipper.');
      if(d.paymentLinkUrl) window.open(d.paymentLinkUrl, '_blank');
      renderBookings();
    } else { toast(d.error || 'Could not mark this booking as loaded.'); }
  }catch(e){ toast('Could not reach the server.'); }
};

window.requestEarlyPayout = async function(bookingId){
  if(!confirm("Request early payout of any platform-held balance? A 2% fee may apply if this booking used online checkout.")) return;
  try{
    const r = await fetch(API_BASE + '/api/bookings/'+bookingId+'/early-payout', { method:'POST' });
    const d = await r.json().catch(()=>({}));
    if(r.ok){
      toast('Early payout requested — the balance (minus the 2% fee) is on its way.');
      renderBookings();
    } else { toast(d.error || 'Could not process early payout.'); }
  }catch(e){ toast('Could not reach the server.'); }
};


// ---------- i18n (EN / HI chrome) ----------
const I18N = {
  en: {
    navHome:'Home', navLoads:'Find Loads', navTrucks:'Find Trucks', navFleet:'Fleet',
    navBookings:'Bookings', navBroadcast:'Broadcast', navMore:'More', navPost:'Post',
    heroSub:'Load & truck marketplace for Indian transporters, brokers and consignors — plus one-tap WhatsApp broadcast and optional escrow payments for eligible bookings.',
    heroTrust:'Optional escrow for eligible bookings when enabled · Verify identity, RC & relevant documents before advances',
    agHeroSub:'Load & truck marketplace for brokers and fleet owners — post a load, find a truck, track your fleet, and broadcast to your WhatsApp groups. Optional escrow payments are available for eligible bookings when configured. Verify identity, RC & relevant documents before advances.',
    ctaPostLoad:'+ Post a Load', ctaPostTruck:'+ Post Truck Availability', ctaFindTrucks:'Find Trucks',
    emptyBoardLead:'Be the first on this lane — post a load or truck and broadcast to your groups.',
    emptyLoads:'No loads on the board yet. Be the first on this lane.',
    emptyTrucks:'No trucks listed yet. Post availability and broadcast to your groups.',
    emptyNoMatch:'No listings match your filters.',
    btnClearFilters:'Clear filters', btnSearch:'Search', swappedRoute:'Route swapped (backhaul)',
    statLoads:'live loads', statTrucks:'trucks available', statGroups:'WhatsApp groups linked',
    roleTitle:'How do you use Maalwala?', roleSub:"We'll tailor the home shortcuts. You can change this anytime in Profile.",
    roleShipper:'Shipper', roleShipperDesc:'I post loads that need trucks',
    roleBroker:'Broker', roleBrokerDesc:'I match loads and trucks',
    roleFleet:'Fleet owner', roleFleetDesc:'I run trucks and want backhauls',
  },
  hi: {
    navHome:'होम', navLoads:'लोड खोजें', navTrucks:'ट्रक खोजें', navFleet:'फ्लीट',
    navBookings:'बुकिंग', navBroadcast:'प्रसारण', navMore:'और', navPost:'पोस्ट',
    heroSub:'भारतीय ट्रांसपोर्टर, ब्रोकर और कंसाइनर के लिए लोड और ट्रक मार्केटप्लेस — WhatsApp ग्रुप पर एक टैप प्रसारण और योग्य बुकिंग के लिए वैकल्पिक एस्क्रो भुगतान।',
    heroTrust:'योग्य बुकिंग के लिए एस्क्रो उपलब्ध होने पर · एडवांस से पहले पहचान, RC और ज़रूरी दस्तावेज़ जाँचें',
    agHeroSub:'ब्रोकर और फ्लीट के लिए लोड और ट्रक मार्केटप्लेस — लोड पोस्ट करें, ट्रक खोजें, फ्लीट ट्रैक करें, WhatsApp पर प्रसारण करें। योग्य बुकिंग के लिए, सेटअप होने पर वैकल्पिक एस्क्रो भुगतान उपलब्ध है। एडवांस से पहले पहचान, RC और ज़रूरी दस्तावेज़ जाँचें।',
    ctaPostLoad:'+ लोड पोस्ट करें', ctaPostTruck:'+ ट्रक उपलब्धता', ctaFindTrucks:'ट्रक खोजें',
    emptyBoardLead:'इस लेन पर पहले बनें — लोड या ट्रक पोस्ट करें और अपने ग्रुप पर भेजें।',
    emptyLoads:'अभी कोई लोड नहीं। इस लेन पर पहले पोस्ट करें।',
    emptyTrucks:'अभी कोई ट्रक नहीं। उपलब्धता पोस्ट करें।',
    emptyNoMatch:'फ़िल्टर से कोई लिस्टिंग नहीं मिली।',
    btnClearFilters:'फ़िल्टर हटाएँ', btnSearch:'खोजें', swappedRoute:'रूट बदला (बैकहॉल)',
    statLoads:'लाइव लोड', statTrucks:'उपलब्ध ट्रक', statGroups:'लिंक किए WhatsApp ग्रुप',
    roleTitle:'आप Maalwala कैसे इस्तेमाल करते हैं?', roleSub:'होम शॉर्टकट आपके रोल के हिसाब से सेट होंगे। प्रोफ़ाइल से कभी भी बदल सकते हैं।',
    roleShipper:'शिपर', roleShipperDesc:'मुझे ट्रक चाहिए — लोड पोस्ट करता/करती हूँ',
    roleBroker:'ब्रोकर', roleBrokerDesc:'लोड और ट्रक मिलाता/मिलाती हूँ',
    roleFleet:'फ्लीट ओनर', roleFleetDesc:'मेरे ट्रक हैं — बैकहॉल चाहिए',
  }
};
let currentLang = localStorage.getItem('mw_lang') || 'en';
function t(key){
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.en[key]) || key;
}
function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if(val) el.textContent = val;
  });
  const btn = document.getElementById('langToggle');
  if(btn) btn.textContent = 'Language';
  localStorage.setItem('mw_lang', currentLang);
}
function toggleLang(){
  currentLang = currentLang === 'en' ? 'hi' : 'en';
  applyI18n();
  renderLoadsList();
  renderTrucksList();
}
document.getElementById('langToggle')?.addEventListener('click', toggleLang);
document.getElementById('drawerLangToggle')?.addEventListener('click', ()=>{ toggleLang(); closeDrawer(); });
applyI18n();

// ---------- Role picker (first run) ----------
function maybeShowRolePicker(){
  if(localStorage.getItem('mw_role_pref')) return;
  // Only after auth gate is hidden
  const gate = document.getElementById('authGate');
  if(gate && gate.style.display !== 'none') return;
  openModal('rolePickerModal');
}
document.querySelectorAll('.role-pick-card').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const role = btn.dataset.role;
    localStorage.setItem('mw_role_pref', role);
    try{
      const p = await Profile.get();
      p.role = role === 'Fleet Owner' ? 'Fleet Owner' : role;
      await Profile.save(p);
      const sel = document.getElementById('profRole');
      if(sel){
        // map to existing select options if present
        const opts = [...sel.options].map(o=>o.value);
        if(opts.includes(role)) sel.value = role;
        else if(role === 'Fleet Owner' && opts.includes('Fleet Owner')) sel.value = 'Fleet Owner';
        else if(opts.includes('Transporter')) sel.value = 'Transporter';
      }
    }catch(e){}
    closeModal('rolePickerModal');
    toast('Saved as ' + role);
    if(role === 'Shipper') openModal('loadModal');
    else if(role === 'Fleet Owner') showScreen('trucks');
    else showScreen('loads');
  });
});

// ---------- Bids (client-side MVP + best-effort API) ----------
function getAllBids(){ return LocalDB.get('bids', []); }
function saveAllBids(list){ LocalDB.set('bids', list); }
function getBidsForItem(itemId){ return getAllBids().filter(b=>b.itemId===itemId); }
window.openBidModal = async function(id, type){
  const list = type==='load' ? CACHE.loads : CACHE.trucks;
  const item = list.find(i=>i.id===id);
  if(!item) return;
  document.getElementById('bidItemId').value = id;
  document.getElementById('bidItemType').value = type;
  document.getElementById('bidSummary').textContent =
    `${item.from} → ${item.to||'Anywhere'} · posted ₹${item.rate?Number(item.rate).toLocaleString('en-IN'):'on ask'} · ${item.poster}`;
  document.getElementById('bidAmount').value = item.rate || '';
  document.getElementById('bidNote').value = '';
  document.getElementById('bidResult').textContent = '';
  const profile = await Profile.get();
  document.getElementById('bidMyName').value = profile.name || '';
  document.getElementById('bidMyPhone').value = profile.phone || '';
  openModal('bidModal');
};
document.getElementById('bidForm')?.addEventListener('submit', async e=>{
  e.preventDefault();
  const itemId = document.getElementById('bidItemId').value;
  const itemType = document.getElementById('bidItemType').value;
  const amount = Number(document.getElementById('bidAmount').value);
  const note = document.getElementById('bidNote').value.trim();
  const name = document.getElementById('bidMyName').value.trim();
  const phone = document.getElementById('bidMyPhone').value.trim();
  const resultEl = document.getElementById('bidResult');
  if(!amount || !name || !phone){ resultEl.textContent = 'Fill offer, name and phone.'; return; }
  const bid = {
    id: cid(), itemId, itemType, amount, note, name, phone,
    status: 'pending', ts: Date.now()
  };
  // Best-effort API (ignore if missing)
  if(USE_API){
    try{
      const r = await fetch(API_BASE + '/api/bids', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bid)
      });
      if(r.ok){
        const serverBid = await r.json().catch(()=>null);
        if(serverBid && serverBid.id) Object.assign(bid, serverBid);
      }
    }catch(err){ /* local only */ }
  }
  const all = getAllBids();
  all.unshift(bid);
  saveAllBids(all);
  // WhatsApp share to poster if phone known
  const item = (itemType==='load'?CACHE.loads:CACHE.trucks).find(i=>i.id===itemId);
  resultEl.textContent = 'Bid sent (pending).';
  toast('Bid sent — status: pending');
  closeModal('bidModal');
  renderLoadsList(); renderTrucksList();
  if(item && item.phone){
    const text = encodeURIComponent(`Maalwala bid on ${item.from}→${item.to||'Anywhere'}: ₹${amount.toLocaleString('en-IN')}${note?'. '+note:''} — ${name} (${phone})`);
    // optional open
  }
});
window.updateBidStatus = function(bidId, status){
  const all = getAllBids();
  const b = all.find(x=>x.id===bidId);
  if(!b) return;
  b.status = status; // pending | accepted | countered
  saveAllBids(all);
  toast('Bid ' + status);
  renderLoadsList(); renderTrucksList();
};

// ---------- Saved lane alerts (localStorage MVP) ----------
function getLaneAlerts(){ return LocalDB.get('laneAlerts', []); }
function saveLaneAlerts(list){ LocalDB.set('laneAlerts', list); }
function laneKey(a){ return [a.type, (a.from||'').toLowerCase(), (a.to||'').toLowerCase(), a.truckType||''].join('|'); }
function saveLaneAlert(kind){
  const type = kind === 'loads' ? 'load' : 'truck';
  const from = document.getElementById(kind==='loads'?'filterFromLoads':'filterFromTrucks').value.trim();
  const to = document.getElementById(kind==='loads'?'filterToLoads':'filterToTrucks').value.trim();
  const truckType = document.getElementById(kind==='loads'?'filterTruckType':'filterTruckType2').value;
  if(!from && !to){ toast('Set From and/or To before saving a lane alert.'); return; }
  const alert = { id: cid(), type, from, to, truckType, createdAt: Date.now(), seenIds: [] };
  const list = getLaneAlerts().filter(a=> laneKey(a) !== laneKey(alert));
  // seed seen with current matches so we only toast on NEW ones
  const pool = type==='load' ? CACHE.loads : CACHE.trucks;
  alert.seenIds = pool.filter(i=> laneMatches(alert, i)).map(i=>i.id);
  list.unshift(alert);
  saveLaneAlerts(list);
  renderLaneAlertsUI();
  toast('Lane alert saved — we will toast when a new match appears.');
}
function laneMatches(alert, item){
  if(alert.from && !(item.from||'').toLowerCase().includes(alert.from.toLowerCase())) return false;
  if(alert.to && !(item.to||'').toLowerCase().includes(alert.to.toLowerCase())) return false;
  if(alert.truckType && item.truckType !== alert.truckType) return false;
  return true;
}
function checkLaneAlerts(loads, trucks){
  const alerts = getLaneAlerts();
  if(!alerts.length) return;
  let changed = false;
  alerts.forEach(alert=>{
    const pool = alert.type==='load' ? loads : trucks;
    const matches = pool.filter(i=> laneMatches(alert, i));
    const seen = new Set(alert.seenIds || []);
    const fresh = matches.filter(i=> !seen.has(i.id));
    if(fresh.length){
      fresh.forEach(i=> seen.add(i.id));
      alert.seenIds = [...seen];
      changed = true;
      const sample = fresh[0];
      const msg = `New ${alert.type} on ${sample.from} → ${sample.to||'Anywhere'}`;
      showLaneAlertToast(msg, sample);
    }
  });
  if(changed) saveLaneAlerts(alerts);
}
function showLaneAlertToast(msg, item){
  const el = document.getElementById('laneAlertToast');
  if(!el){ toast(msg); return; }
  const wa = `https://wa.me/?text=${encodeURIComponent(msg + ' — via Maalwala')}`;
  el.innerHTML = `<span>${escapeHtml(msg)}</span> <a href="${wa}" target="_blank" rel="noopener">Share WhatsApp</a>`;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(()=>{ el.classList.remove('show'); el.classList.add('hidden'); }, 8000);
  toast(msg);
}
function renderLaneAlertsUI(){
  const alerts = getLaneAlerts();
  ['loads','trucks'].forEach(kind=>{
    const type = kind==='loads'?'load':'truck';
    const el = document.getElementById('laneAlerts-'+kind);
    if(!el) return;
    const items = alerts.filter(a=>a.type===type);
    el.innerHTML = items.length ? `<span class="popular-label">Lane alerts:</span>` + items.map(a=>`
      <div class="saved-search-chip lane-alert-chip">
        <button onclick="applyLaneAlert('${a.id}')">🔔 ${escapeHtml(a.from||'*')} → ${escapeHtml(a.to||'*')}${a.truckType?' · '+escapeHtml(a.truckType):''}</button>
        <span class="ss-remove" onclick="removeLaneAlert('${a.id}')" title="Remove">✕</span>
      </div>`).join('') : '';
  });
}
window.applyLaneAlert = function(id){
  const a = getLaneAlerts().find(x=>x.id===id);
  if(!a) return;
  if(a.type==='load'){
    document.getElementById('filterFromLoads').value = a.from||'';
    document.getElementById('filterToLoads').value = a.to||'';
    document.getElementById('filterTruckType').value = a.truckType||'';
    renderLoadsList(); showScreen('loads');
  } else {
    document.getElementById('filterFromTrucks').value = a.from||'';
    document.getElementById('filterToTrucks').value = a.to||'';
    document.getElementById('filterTruckType2').value = a.truckType||'';
    renderTrucksList(); showScreen('trucks');
  }
};
window.removeLaneAlert = function(id){
  saveLaneAlerts(getLaneAlerts().filter(a=>a.id!==id));
  renderLaneAlertsUI();
};
document.getElementById('saveLaneAlertLoads')?.addEventListener('click', ()=>saveLaneAlert('loads'));
document.getElementById('saveLaneAlertTrucks')?.addEventListener('click', ()=>saveLaneAlert('trucks'));

// Hook role picker after successful gate hide — patch enterApp if present
(function patchEnterApp(){
  const origHide = document.getElementById('authGate');
  // After initial load, if already past gate, show role picker
  const obs = new MutationObserver(()=>{
    if(origHide && origHide.style.display === 'none'){
      setTimeout(maybeShowRolePicker, 600);
    }
  });
  if(origHide) obs.observe(origHide, { attributes:true, attributeFilter:['style','class'] });
  setTimeout(maybeShowRolePicker, 1800);
})();

// ---------- Onboarding tour ----------
const TOUR_STEPS = [
  { target: '.brand', title: 'Welcome to Maalwala', text: 'A quick 30-second tour of what you can do here — post loads, find trucks, and broadcast to WhatsApp.' },
  { target: '[data-tour="post-load"]', title: 'Post a Load', text: 'Got goods to move? Post a load here with route, material, and rate — it goes straight onto the marketplace.' },
  { target: '[data-tour="nav-loads"]', title: 'Find Loads', text: 'Browse the load board, filter by route, truck type, MT or freshness, then bid or book — freight settles off-platform.' },
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


let gateAuthMode = 'login';
function updateGateAuthMode(){
  const signup = gateAuthMode === 'signup';
  document.getElementById('gateBusinessNameLabel').classList.toggle('hidden', !signup);
  document.getElementById('gateBusinessName').required = signup;
  document.getElementById('gatePasswordInput').autocomplete = signup ? 'new-password' : 'current-password';
  document.getElementById('gateAuthSubtitle').textContent = signup ? 'Create a Maalwala account with your email and a password.' : 'Sign in with your email and password. Create an account if you are new.';
  document.getElementById('gateEmailSubmitBtn').textContent = signup ? 'Create Account' : 'Sign In';
  document.getElementById('gateAuthModePrompt').textContent = signup ? 'Already have an account?' : 'Need an account?';
  document.getElementById('gateAuthModeToggle').textContent = signup ? 'Sign in' : 'Create account';
  document.getElementById('gateAuthError').classList.add('hidden');
}
document.getElementById('gateAuthModeToggle')?.addEventListener('click', ()=>{
  gateAuthMode = gateAuthMode === 'login' ? 'signup' : 'login'; updateGateAuthMode();
});
document.getElementById('gateEmailForm')?.addEventListener('submit', async (event)=>{
  event.preventDefault();
  const errorEl = document.getElementById('gateAuthError');
  const button = document.getElementById('gateEmailSubmitBtn');
  const modeToggle = document.getElementById('gateAuthModeToggle');
  const isSignup = gateAuthMode === 'signup';
  errorEl.classList.add('hidden');
  if(!USE_API){ errorEl.textContent = 'Login service is unavailable. Please try again later.'; errorEl.classList.remove('hidden'); return; }
  const email = document.getElementById('gateEmailInput').value.trim().toLowerCase();
  const password = document.getElementById('gatePasswordInput').value;
  const businessName = document.getElementById('gateBusinessName').value.trim();
  button.disabled = true; modeToggle.disabled = true;
  button.textContent = isSignup ? 'Creating account…' : 'Signing in…';
  try{
    const data = isSignup ? await Auth.signup(businessName, email, password) : await Auth.login(email, password);
    AuthGate.setSession(data.token, data.user); hideAuthGate(); await initApp();
    toast(isSignup ? 'Your account is ready.' : 'Welcome to Maalwala.');
  }catch(e){
    errorEl.textContent = e.message || 'Could not sign in. Please try again.'; errorEl.classList.remove('hidden');
  }
  button.disabled = false; modeToggle.disabled = false;
  button.textContent = isSignup ? 'Create Account' : 'Sign In';
});
