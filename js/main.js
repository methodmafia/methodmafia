/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — MAIN SCRIPT
   ═══════════════════════════════════════════════════════════ */

/* ─── ভাষা ব্যবস্থাপনা ─── */
let LANG = (function(){
  try{
    const saved = localStorage.getItem('mm_lang');
    if(saved && TRANSLATIONS[saved]) return saved;
  }catch(e){}
  return CONFIG.DEFAULT_LANG;
})();

function t(key){
  return (TRANSLATIONS[LANG] && TRANSLATIONS[LANG][key]) || TRANSLATIONS.en[key] || '';
}

/* ভেতরের পেজের অনুবাদ */
function tp(key){
  if(typeof PAGES === 'undefined') return '';
  return (PAGES[LANG] && PAGES[LANG][key]) || PAGES.en[key] || '';
}

function setLang(code){
  if(!TRANSLATIONS[code]) return;
  LANG = code;
  try{ localStorage.setItem('mm_lang', code); }catch(e){}
  document.documentElement.lang = code;
  applyLang();
  closeLangMenu();
}

function applyLang(){
  document.documentElement.lang = LANG;
  // সব [data-t] element এ text বসাও
  document.querySelectorAll('[data-t]').forEach(el=>{
    const k = el.getAttribute('data-t');
    const val = t(k);
    if(val) el.textContent = val;
  });
  // placeholder
  document.querySelectorAll('[data-tp]').forEach(el=>{
    const val = t(el.getAttribute('data-tp'));
    if(val) el.placeholder = val;
  });
  // ভেতরের পেজ (HTML সহ)
  document.querySelectorAll('[data-p]').forEach(el=>{
    const val = tp(el.getAttribute('data-p'));
    if(val) el.innerHTML = val;
  });
  document.querySelectorAll('[data-pp]').forEach(el=>{
    const val = tp(el.getAttribute('data-pp'));
    if(val) el.placeholder = val;
  });
  // ভাষার নাম বাটনে
  const lbl = document.getElementById('langLabel');
  if(lbl) lbl.textContent = LANG.toUpperCase();
  document.querySelectorAll('.lang-item').forEach(b=>{
    b.classList.toggle('active', b.dataset.lang === LANG);
  });
  // ডাইনামিক অংশ
  if(document.getElementById('tab-ai')) renderVault();
  if(document.getElementById('reviewGrid')) renderReviews();
  if(document.getElementById('payBadges')) renderPayments();
  updateLocalPrice();
  updateOrderBox();
}

/* ─── ভাষা মেনু ─── */
function toggleLangMenu(){
  const m = document.getElementById('langMenu');
  if(m) m.classList.toggle('open');
}
function closeLangMenu(){
  const m = document.getElementById('langMenu');
  if(m) m.classList.remove('open');
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.lang-wrap')) closeLangMenu();
});

/* ─── CONFIG থেকে মান বসানো ─── */
function applyConfig(){
  document.querySelectorAll('[data-cfg]').forEach(el=>{
    const v = CONFIG[el.getAttribute('data-cfg')];
    if(v !== undefined) el.textContent = v;
  });
  document.querySelectorAll('[data-href]').forEach(el=>{
    const v = CONFIG[el.getAttribute('data-href')];
    if(v) el.href = v;
  });
}

/* ─── পার্টিকেল ব্যাকগ্রাউন্ড ─── */
function initParticles(){
  const c = document.getElementById('bg-canvas');
  if(!c) return;
  const ctx = c.getContext('2d');
  let W, H, parts = [];
  const isMobile = window.innerWidth < 700;
  const COUNT = isMobile ? 90 : 200;

  function resize(){ W = c.width = innerWidth; H = c.height = innerHeight; }
  resize();
  addEventListener('resize', resize);

  const rnd = (a,b)=> a + Math.random()*(b-a);
  for(let i=0;i<COUNT;i++){
    parts.push({
      x: Math.random()*innerWidth,
      y: Math.random()*innerHeight,
      r: rnd(.4,2),
      vx: rnd(-.14,.14),
      vy: rnd(-.32,-.06),
      a: rnd(.2,.75),
      gold: Math.random() > .35
    });
  }

  let mx = innerWidth/2, my = innerHeight/2;
  if(!isMobile){
    addEventListener('mousemove', e=>{ mx = e.clientX; my = e.clientY; });
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

    const g = ctx.createRadialGradient(W/2,H*.35,0,W/2,H*.35,W*.45);
    g.addColorStop(0,'rgba(255,140,0,.035)');
    g.addColorStop(.5,'rgba(255,215,0,.018)');
    g.addColorStop(1,'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    if(!isMobile){
      const mg = ctx.createRadialGradient(mx,my,0,mx,my,190);
      mg.addColorStop(0,'rgba(255,215,0,.045)');
      mg.addColorStop(1,'transparent');
      ctx.fillStyle = mg;
      ctx.fillRect(0,0,W,H);
    }

    const now = Date.now()*.001;
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy;
      if(p.y < -5) p.y = H+5;
      if(p.x < -5) p.x = W+5;
      if(p.x > W+5) p.x = -5;
      ctx.globalAlpha = p.a * (.6 + .4*Math.sin(now + p.x*.01));
      ctx.fillStyle = p.gold ? '#FFD700' : '#FFA500';
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,6.283);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

/* ─── লোগো টিল্ট ─── */
function initLogoTilt(){
  const wrap = document.getElementById('logoWrap');
  const img = document.getElementById('logoImg');
  if(!wrap || !img || window.innerWidth < 700) return;
  wrap.addEventListener('mousemove', e=>{
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width/2)/(r.width/2);
    const y = (e.clientY - r.top - r.height/2)/(r.height/2);
    img.style.transform = `perspective(420px) rotateY(${x*16}deg) rotateX(${-y*16}deg) scale(1.04)`;
    img.style.animation = 'none';
  });
  wrap.addEventListener('mouseleave', ()=>{
    img.style.transform = '';
    img.style.animation = 'float 5s ease-in-out infinite';
  });
}

/* ─── কাউন্টডাউন ─── */
function initCountdown(){
  const h = document.getElementById('cdH');
  if(!h) return;
  const m = document.getElementById('cdM'), s = document.getElementById('cdS');
  const span = (CONFIG.COUNTDOWN_HOURS || 24) * 3600 * 1000;

  let end;
  try{
    const saved = localStorage.getItem('mm_cd');
    end = saved ? parseInt(saved,10) : 0;
    if(!end || end < Date.now()){
      end = Date.now() + span;
      localStorage.setItem('mm_cd', end);
    }
  }catch(e){ end = Date.now() + span; }

  (function tick(){
    let d = Math.max(0, Math.floor((end - Date.now())/1000));
    if(d <= 0){
      end = Date.now() + span;
      try{ localStorage.setItem('mm_cd', end); }catch(e){}
      d = Math.floor(span/1000);
    }
    h.textContent = String(Math.floor(d/3600)).padStart(2,'0');
    m.textContent = String(Math.floor(d%3600/60)).padStart(2,'0');
    s.textContent = String(d%60).padStart(2,'0');
    setTimeout(tick,1000);
  })();
}

/* ─── স্ট্যাট কাউন্টার ─── */
function initStats(){
  const map = [['sVip','STAT_VIP'],['sComm','STAT_COMMUNITY'],['sMeth','STAT_METHODS'],['sUpd','STAT_UPDATES']];
  if(!document.getElementById('sVip')) return;
  let fired = false;
  function run(){
    if(fired) return; fired = true;
    map.forEach(([id,key])=>{
      const el = document.getElementById(id);
      const raw = CONFIG[key];
      // যদি টেক্সট হয় (যেমন "50-70+") তাহলে সরাসরি দেখাও
      if(typeof raw === 'string'){ el.textContent = raw; return; }
      const target = raw || 0;
      let v = 0;
      const step = Math.max(1, Math.ceil(target/65));
      const timer = setInterval(()=>{
        v = Math.min(v+step, target);
        el.textContent = v.toLocaleString() + '+';
        if(v >= target) clearInterval(timer);
      }, 20);
    });
  }
  const hero = document.querySelector('.stats');
  if('IntersectionObserver' in window){
    new IntersectionObserver((en,ob)=>{
      en.forEach(x=>{ if(x.isIntersecting){ run(); ob.disconnect(); } });
    },{threshold:.3}).observe(hero);
  } else run();
}

/* ─── ভল্ট আইটেম রেন্ডার ─── */
function renderVault(){
  Object.keys(VAULT_ITEMS).forEach(cat=>{
    const box = document.getElementById('tab-'+cat);
    if(!box) return;
    box.innerHTML = '<div class="items-grid">' +
      VAULT_ITEMS[cat].map(([ic,txt,tag])=>{
        const tg = tag ? `<span class="tag tag-${tag}">${tag}</span>` : '';
        return `<div class="item"><span class="item-ic">${ic}</span><span class="item-tx">${txt}${tg}</span></div>`;
      }).join('') + '</div>';
  });
}

function switchTab(btn, cat){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('tab-'+cat);
  if(panel) panel.classList.add('active');
  btn.classList.add('active');
}

/* ─── রিভিউ রেন্ডার ─── */
function renderReviews(){
  const box = document.getElementById('reviewGrid');
  if(!box) return;
  const list = REVIEWS[LANG] || REVIEWS.en;
  const colors = [
    'linear-gradient(135deg,#FFD700,#FFA500)',
    'linear-gradient(135deg,#ef4444,#f59e0b)',
    'linear-gradient(135deg,#10b981,#3b82f6)',
    'linear-gradient(135deg,#8b5cf6,#ec4899)'
  ];
  box.innerHTML = list.map(([ini,name,date,text],i)=>`
    <div class="t-card">
      <div class="t-head">
        <div class="t-av" style="background:${colors[i%4]}">${ini}</div>
        <div><div class="t-name">${name}</div><div class="t-date">${date}</div></div>
      </div>
      <div class="t-stars">★★★★★</div>
      <div class="t-text">${text}</div>
    </div>`).join('');
}

/* ─── স্থানীয় মুদ্রা (৳) শুধু বাংলায় দেখাবে ─── */
function updateLocalPrice(){
  const show = (LANG === 'bn');
  document.querySelectorAll('.local-price').forEach(el=>{
    el.style.display = show ? '' : 'none';
  });
  const pe = document.getElementById('pEntryPrice');
  const pm = document.getElementById('pMonthlyPrice');
  if(pe) pe.textContent = CONFIG.ENTRY_USD;
  if(pm) pm.textContent = CONFIG.MONTHLY_USD;
}

/* ─── পেমেন্ট মেথড সিলেক্টর (ভাষা অনুযায়ী) ─── */
let SELECTED_PAY = '';
function renderPayments(){
  const box = document.getElementById('payBadges');
  if(!box) return;
  const list = (typeof PAYMENTS !== 'undefined' && PAYMENTS[LANG]) ? PAYMENTS[LANG] : PAYMENTS.en;
  box.classList.remove('error');
  box.innerHTML = list.map(([ic,name])=>
    `<button type="button" class="pay-opt" data-pay="${name}" onclick="selectPay(this)">
       <span class="pay-opt-ic">${ic}</span>${name}
     </button>`
  ).join('');
  // আগের সিলেকশন ধরে রাখো (ভাষা বদলালে index অনুযায়ী)
  if(SELECTED_PAY_INDEX !== null && box.children[SELECTED_PAY_INDEX]){
    box.children[SELECTED_PAY_INDEX].classList.add('sel');
    SELECTED_PAY = box.children[SELECTED_PAY_INDEX].dataset.pay;
  }
}
let SELECTED_PAY_INDEX = null;
function selectPay(el){
  const box = document.getElementById('payBadges');
  box.classList.remove('error');
  [...box.children].forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
  SELECTED_PAY = el.dataset.pay;
  SELECTED_PAY_INDEX = [...box.children].indexOf(el);
}

/* ─── FAQ ─── */
function toggleFaq(btn){
  const item = btn.parentElement;
  const open = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(f=>f.classList.remove('open'));
  if(!open) item.classList.add('open');
}

/* ─── প্ল্যান সিলেক্ট ─── */
let SELECTED_PLAN = 'entry';
function selectPlan(el, plan){
  document.querySelectorAll('.plan-opt').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
  SELECTED_PLAN = plan;
  updateOrderBox();
}
function updateOrderBox(){
  const lbl = document.getElementById('oPlan');
  const amt = document.getElementById('oAmount');
  const tot = document.getElementById('oTotal');
  const thn = document.getElementById('oThen');
  if(!lbl) return;

  // ৳ শুধু বাংলা ভাষায় দেখাবে
  const showBDT = (LANG === 'bn');

  if(SELECTED_PLAN === 'entry'){
    lbl.textContent = t('planEntryName');
    amt.textContent = showBDT
      ? CONFIG.ENTRY_USD + ' / ' + CONFIG.ENTRY_BDT
      : CONFIG.ENTRY_USD;
    tot.textContent = CONFIG.ENTRY_USD;
  } else {
    lbl.textContent = t('planMonthlyName');
    amt.textContent = showBDT
      ? CONFIG.MONTHLY_USD + ' / ' + CONFIG.MONTHLY_BDT
      : CONFIG.MONTHLY_USD;
    tot.textContent = CONFIG.MONTHLY_USD;
  }

  if(thn) thn.textContent = CONFIG.MONTHLY_USD;
}

/* ─── Order ID তৈরি ─── */
function makeOrderId(){
  const d = new Date();
  const y = d.getFullYear();
  const rnd = Math.floor(1000 + Math.random()*9000);
  return `MM-${y}-${rnd}`;
}

/* ─── UTM ধরে রাখা ─── */
function getSource(){
  try{
    const p = new URLSearchParams(location.search);
    const s = p.get('utm_source');
    if(s){ sessionStorage.setItem('mm_src', s); return s; }
    return sessionStorage.getItem('mm_src') || 'direct';
  }catch(e){ return 'direct'; }
}

/* ─── টোস্ট ─── */
function toast(msg, isErr){
  const el = document.getElementById('toast');
  if(!el) return alert(msg);
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(()=>el.classList.remove('show'), 4200);
}

/* ─── অর্ডার সাবমিট ─── */
function submitOrder(){
  const name = document.getElementById('iName');
  const email = document.getElementById('iEmail');
  const tg = document.getElementById('iTelegram');
  const btn = document.getElementById('submitBtn');

  [name,email,tg].forEach(f=>f.classList.remove('error'));

  if(!name.value.trim() || !email.value.trim() || !tg.value.trim()){
    [name,email,tg].forEach(f=>{ if(!f.value.trim()) f.classList.add('error'); });
    return toast(t('errFill'), true);
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())){
    email.classList.add('error');
    return toast(t('errEmail'), true);
  }
  if(!SELECTED_PAY){
    const pb = document.getElementById('payBadges');
    if(pb){ pb.classList.add('error'); pb.scrollIntoView({behavior:'smooth',block:'center'}); }
    return toast(t('errPay'), true);
  }

  let handle = tg.value.trim();
  if(handle[0] !== '@') handle = '@' + handle;

  const orderId = makeOrderId();
  const payload = {
    orderId: orderId,
    name: name.value.trim(),
    email: email.value.trim(),
    telegram: handle,
    plan: SELECTED_PLAN === 'entry' ? 'Entry' : 'Monthly',
    amount: SELECTED_PLAN === 'entry' ? CONFIG.ENTRY_USD : CONFIG.MONTHLY_USD,
    payment: SELECTED_PAY,
    source: getSource()
  };

  btn.disabled = true;

  // Pixel events
  const value = SELECTED_PLAN === 'entry' ? 30 : 15;
  if(typeof fbq !== 'undefined') fbq('track','InitiateCheckout',{currency:'USD',value:value});
  if(typeof ttq !== 'undefined') ttq.track('InitiateCheckout',{value:value,currency:'USD'});
  if(typeof gtag !== 'undefined') gtag('event','begin_checkout',{currency:'USD',value:value});

  // Google Sheets এ পাঠাও
  fetch(CONFIG.SHEET_URL, {
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(payload)
  }).catch(()=>{});

  try{ localStorage.setItem('mm_last_order', orderId); }catch(e){}

  toast(t('toastOk'));

  const localLine = (LANG === 'bn')
    ? '\nAmount (BDT): ' + (SELECTED_PLAN === 'entry' ? CONFIG.ENTRY_BDT : CONFIG.MONTHLY_BDT)
    : '';

  const msg = encodeURIComponent(
    '🧾 NEW ORDER\n' +
    '━━━━━━━━━━━━━━\n' +
    'Order ID : ' + orderId + '\n' +
    'Name     : ' + payload.name + '\n' +
    'Email    : ' + payload.email + '\n' +
    'Telegram : ' + handle + '\n' +
    '━━━━━━━━━━━━━━\n' +
    'Plan     : ' + payload.plan + '\n' +
    'Amount   : ' + payload.amount + localLine + '\n' +
    'Payment  : ' + SELECTED_PAY + '\n' +
    '━━━━━━━━━━━━━━\n\n' +
    'I would like to complete my payment. Please send me the payment details.'
  );
  setTimeout(()=>{
    window.open(CONFIG.SUPPORT + '?text=' + msg, '_blank');
    btn.disabled = false;
  }, 900);
}

/* ─── স্ক্রল রিভিল + প্রোগ্রেস ─── */
function initScroll(){
  if('IntersectionObserver' in window){
    const ob = new IntersectionObserver(en=>{
      en.forEach(x=>{ if(x.isIntersecting){ x.target.classList.add('vis'); ob.unobserve(x.target); } });
    },{threshold:.08});
    document.querySelectorAll('.reveal').forEach(el=>ob.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el=>el.classList.add('vis'));
  }

  const bar = document.getElementById('progressBar');
  const top = document.getElementById('scrollTop');
  addEventListener('scroll', ()=>{
    if(bar){
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (scrollY/h)*100 : 0) + '%';
    }
    if(top) top.classList.toggle('show', scrollY > 420);
  }, {passive:true});
}

/* ─── লাইভ অ্যাক্টিভিটি পপআপ ─── */
function initLiveActivity(){
  if(!CONFIG.SHOW_LIVE_ACTIVITY) return;
  const pop = document.getElementById('livePop');
  if(!pop) return;
  let idx = 0;

  function show(){
    const names = LIVE_NAMES[LANG] || LIVE_NAMES.en;
    const [nm, city] = names[idx % names.length];
    idx++;
    const mins = 2 + Math.floor(Math.random()*24);
    pop.innerHTML = `
      <div class="live-av">${nm.charAt(0)}</div>
      <div>
        <div class="live-tx"><b>${nm}</b> — ${city} ${t('laJoined')}</div>
        <div class="live-time">${mins} ${t('laAgo')}</div>
      </div>`;
    pop.classList.add('show');
    setTimeout(()=>pop.classList.remove('show'), 5000);
  }

  setTimeout(()=>{ show(); setInterval(show, 22000); }, 12000);
}

/* ─── এক্সিট পপআপ ─── */
function initExitPopup(){
  const ov = document.getElementById('exitPop');
  if(!ov) return;
  let shown = false;
  try{ if(sessionStorage.getItem('mm_exit')) shown = true; }catch(e){}

  function open(){
    if(shown) return;
    shown = true;
    try{ sessionStorage.setItem('mm_exit','1'); }catch(e){}
    ov.classList.add('show');
  }
  window.closeExit = function(){ ov.classList.remove('show'); };

  if(window.innerWidth > 700){
    document.addEventListener('mouseout', e=>{
      if(!e.relatedTarget && e.clientY < 10) open();
    });
  } else {
    setTimeout(()=>{ if(scrollY > 300) open(); }, 42000);
  }
  ov.addEventListener('click', e=>{ if(e.target === ov) closeExit(); });
}

/* ─── স্ক্রল টু টপ ─── */
function scrollToTop(){ scrollTo({top:0,behavior:'smooth'}); }

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', ()=>{
  applyConfig();
  applyLang();
  initParticles();
  initLogoTilt();
  initCountdown();
  initStats();
  initScroll();
  initLiveActivity();
  initExitPopup();
  getSource();
});
