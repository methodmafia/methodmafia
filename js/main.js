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
  document.querySelectorAll('[data-t]').forEach(el=>{
    const k = el.getAttribute('data-t');
    const val = t(k);
    if(!val) return;
    if(val.indexOf('<') !== -1) el.innerHTML = val; else el.textContent = val;
  });
  document.querySelectorAll('[data-tp]').forEach(el=>{
    const val = t(el.getAttribute('data-tp'));
    if(val) el.placeholder = val;
  });
  document.querySelectorAll('[data-p]').forEach(el=>{
    const val = tp(el.getAttribute('data-p'));
    if(val) el.innerHTML = val;
  });
  document.querySelectorAll('[data-pp]').forEach(el=>{
    const val = tp(el.getAttribute('data-pp'));
    if(val) el.placeholder = val;
  });
  const lbl = document.getElementById('langLabel');
  if(lbl) lbl.textContent = LANG.toUpperCase();
  document.querySelectorAll('.lang-item').forEach(b=>{
    b.classList.toggle('active', b.dataset.lang === LANG);
  });
  if(document.getElementById('tab-ai')) renderVault();
  if(document.getElementById('reviewGrid')) renderReviews();
  if(document.getElementById('payBadges')) renderPayments();
  updateLocalPrice();
  updateOrderBox();
  updatePlanOptions();
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

/* ─── Plan option labels — config থেকে price টানে (D5) ─── */
function updatePlanOptions(){
  const showBDT = (LANG === 'bn');
  document.querySelectorAll('[data-t="optEntry"]').forEach(el=>{
    el.innerHTML = showBDT
      ? `${t('planEntryName')} <s class="plan-old">${CONFIG.ENTRY_REGULAR_BDT}</s> ${CONFIG.ENTRY_BDT}`
      : `${t('planEntryName')} <s class="plan-old">${CONFIG.ENTRY_REGULAR_USD}</s> ${CONFIG.ENTRY_USD}`;
  });
  document.querySelectorAll('[data-t="optMonthly"]').forEach(el=>{
    el.textContent = `${t('planMonthlyName')} ${showBDT ? CONFIG.MONTHLY_BDT : CONFIG.MONTHLY_USD}`;
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

/* ─── রিভিউ রেন্ডার (প্রগ্রেসিভ reveal) ─── */
const TESTI_INITIAL = 10;
const TESTI_BATCH   = 12;
const TESTI_COLORS  = [
  'linear-gradient(135deg,#FFD700,#FFA500)',
  'linear-gradient(135deg,#ef4444,#f59e0b)',
  'linear-gradient(135deg,#10b981,#3b82f6)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)'
];
let _testiShown = 0;
let _testiList  = [];

function _testiCardHtml(item, absIdx){
  const [ini,name,date,text,stars] = item;
  const s = (stars === 4) ? '★★★★<span class="t-star-dim">★</span>' : '★★★★★';
  return `<div class="t-card">
    <div class="t-head">
      <div class="t-av" style="background:${TESTI_COLORS[absIdx%4]}">${ini}</div>
      <div><div class="t-name">${name}</div><div class="t-date">${date}</div></div>
    </div>
    <div class="t-stars">${s}</div>
    <div class="t-text">${text}</div>
  </div>`;
}

function _updateTestiBtn(){
  const btn = document.getElementById('testiMoreBtn');
  if(!btn) return;
  if(_testiShown >= _testiList.length){
    btn.textContent = t('testiAllShown');
    btn.disabled = true;
  } else {
    btn.textContent = t('testiSeeMore');
    btn.disabled = false;
  }
}

function renderReviews(){
  const box = document.getElementById('reviewGrid');
  if(!box) return;
  _testiList  = REVIEWS[LANG] || REVIEWS.en;
  _testiShown = 0;
  box.innerHTML = '';
  const first = Math.min(TESTI_INITIAL, _testiList.length);
  let html = '';
  for(let i = 0; i < first; i++) html += _testiCardHtml(_testiList[i], i);
  box.innerHTML = html;
  _testiShown = first;
  _updateTestiBtn();
}

function loadMoreReviews(){
  const box = document.getElementById('reviewGrid');
  if(!box || _testiShown >= _testiList.length) return;
  const end = Math.min(_testiShown + TESTI_BATCH, _testiList.length);
  let html = '';
  for(let i = _testiShown; i < end; i++) html += _testiCardHtml(_testiList[i], i);
  box.insertAdjacentHTML('beforeend', html);
  _testiShown = end;
  _updateTestiBtn();
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
  if(window.MMPixels && typeof MMPixels.fireViewContent === 'function'){
    MMPixels.fireViewContent();
  }
}
function updateOrderBox(){
  const lbl = document.getElementById('oPlan');
  const amt = document.getElementById('oAmount');
  const tot = document.getElementById('oTotal');
  const thn = document.getElementById('oThen');
  const thnRow = document.getElementById('oThenRow');
  if(!lbl) return;

  const showBDT = (LANG === 'bn');

  if(SELECTED_PLAN === 'entry'){
    lbl.textContent = t('planEntryName');
    const amountText = showBDT
      ? CONFIG.ENTRY_USD + ' / ' + CONFIG.ENTRY_BDT
      : CONFIG.ENTRY_USD;
    const oldText = showBDT ? CONFIG.ENTRY_REGULAR_USD + ' / ' + CONFIG.ENTRY_REGULAR_BDT : CONFIG.ENTRY_REGULAR_USD;
    amt.innerHTML = '<s class="price-old">'+oldText+'</s> '+amountText;
    /* Pay today: just the discounted price — no repeated strike on total row */
    tot.textContent = CONFIG.ENTRY_USD;
    /* "From month 2" row: show with /mo suffix so it's clear it's not added today */
    if(thnRow) thnRow.style.display = '';
    if(thn) thn.textContent = CONFIG.MONTHLY_USD + t('planPerMonth');
  } else {
    lbl.textContent = t('planMonthlyName');
    amt.textContent = showBDT
      ? CONFIG.MONTHLY_USD + ' / ' + CONFIG.MONTHLY_BDT
      : CONFIG.MONTHLY_USD;
    tot.textContent = CONFIG.MONTHLY_USD;
    /* Hide the "From month 2" row — irrelevant for monthly plan */
    if(thnRow) thnRow.style.display = 'none';
  }
}

/* ─── Order ID তৈরি ─── */
function makeOrderId(){
  const d = new Date();
  const y = d.getFullYear();
  const rnd = Math.floor(1000 + Math.random()*9000);
  return `MM-${y}-${rnd}`;
}

/* ─── UTM + click IDs (fbclid / ttclid) ─── */
function getUtmData(){
  try{
    if(typeof MMTracking !== 'undefined'){
      const attr = MMTracking.getAttribution(location.search, sessionStorage, localStorage);
      return {
        utm_source: attr.utm_source,
        utm_medium: attr.utm_medium,
        utm_campaign: attr.utm_campaign,
        fbclid: attr.fbclid || '',
        ttclid: attr.ttclid || ''
      };
    }
    const p = new URLSearchParams(location.search);
    const src = p.get('utm_source');
    const med = p.get('utm_medium');
    const cam = p.get('utm_campaign');
    const fbclid = p.get('fbclid');
    const ttclid = p.get('ttclid');
    if(src) sessionStorage.setItem('mm_utm_source', src);
    if(med) sessionStorage.setItem('mm_utm_medium', med);
    if(cam) sessionStorage.setItem('mm_utm_campaign', cam);
    if(fbclid){ sessionStorage.setItem('mm_fbclid', fbclid); localStorage.setItem('mm_fbclid', fbclid); }
    if(ttclid){ sessionStorage.setItem('mm_ttclid', ttclid); localStorage.setItem('mm_ttclid', ttclid); }
    return {
      utm_source: sessionStorage.getItem('mm_utm_source') || 'direct',
      utm_medium: sessionStorage.getItem('mm_utm_medium') || '',
      utm_campaign: sessionStorage.getItem('mm_utm_campaign') || '',
      fbclid: sessionStorage.getItem('mm_fbclid') || localStorage.getItem('mm_fbclid') || '',
      ttclid: sessionStorage.getItem('mm_ttclid') || localStorage.getItem('mm_ttclid') || ''
    };
  }catch(e){ return {utm_source:'direct', utm_medium:'', utm_campaign:'', fbclid:'', ttclid:''}; }
}

/* legacy wrapper */
function getSource(){
  return getUtmData().utm_source;
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
  const nameVal = name.value.trim();
  if(nameVal.length < 2 || !/[\p{L}]/u.test(nameVal)){
    name.classList.add('error');
    return toast(t('errName'), true);
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())){
    email.classList.add('error');
    return toast(t('errEmail'), true);
  }
  let handle = tg.value.trim().replace(/^@+/, '').replace(/\s+/g,'');
  if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle)){
    tg.classList.add('error');
    return toast(t('errTgFormat'), true);
  }
  handle = '@' + handle;
  if(!SELECTED_PAY){
    const pb = document.getElementById('payBadges');
    if(pb){ pb.classList.add('error'); pb.scrollIntoView({behavior:'smooth',block:'center'}); }
    return toast(t('errPay'), true);
  }

  const orderId = makeOrderId();
  const utmData = getUtmData();
  const track = (typeof MMTracking !== 'undefined')
    ? MMTracking.buildSheetTrackingFields(utmData)
    : {source:utmData.utm_source, medium:utmData.utm_medium, campaign:utmData.utm_campaign, fbclid:utmData.fbclid||'', ttclid:utmData.ttclid||''};
  const payload = {
    orderId: orderId,
    name: name.value.trim(),
    email: email.value.trim(),
    telegram: handle,
    plan: SELECTED_PLAN === 'entry' ? 'Entry' : 'Monthly',
    amount: SELECTED_PLAN === 'entry' ? CONFIG.ENTRY_USD : CONFIG.MONTHLY_USD,
    payment: SELECTED_PAY,
    source: track.source,
    medium: track.medium,
    campaign: track.campaign,
    fbclid: track.fbclid,
    ttclid: track.ttclid
  };

  btn.disabled = true;

  /* ── Pixel / Analytics events — Lead + InitiateCheckout ── */
  const ev = (typeof MMTracking !== 'undefined')
    ? MMTracking.checkoutEventValue(payload.plan)
    : {value: SELECTED_PLAN === 'entry' ? 30 : 15, contentName: payload.plan, currency:'USD'};
  if(typeof MMTracking !== 'undefined'){
    const am = MMTracking.advancedMatching(payload.email, payload.telegram);
    if(typeof fbq !== 'undefined' && CONFIG.META_PIXEL){
      fbq('init', CONFIG.META_PIXEL, am);
    }
    if(typeof ttq !== 'undefined' && typeof ttq.identify === 'function'){
      ttq.identify({email: am.em, external_id: am.external_id});
    }
  }
  if(typeof fbq !== 'undefined'){
    fbq('track','Lead',{currency:ev.currency,value:ev.value,content_name:ev.contentName},{eventID:orderId+'_lead'});
    fbq('track','InitiateCheckout',{currency:ev.currency,value:ev.value,content_name:ev.contentName},{eventID:orderId+'_ic'});
  }
  if(typeof ttq !== 'undefined'){
    ttq.track('SubmitForm',{value:ev.value,currency:ev.currency,content_name:ev.contentName});
    ttq.track('InitiateCheckout',{value:ev.value,currency:ev.currency,content_name:ev.contentName});
  }
  if(typeof gtag !== 'undefined'){
    gtag('event','generate_lead',{currency:ev.currency,value:ev.value,plan:payload.plan});
    gtag('event','begin_checkout',{
      currency:ev.currency,value:ev.value,
      items:[{item_id:SELECTED_PLAN,item_name:payload.plan,price:ev.value,quantity:1}]
    });
  }

  /* Sheet write: CORS + readable JSON only. Opaque no-cors used to
     look like success even when Apps Script / Sheet write failed. */
  const sheetOpts = (typeof MMSheet !== 'undefined')
    ? MMSheet.writeFetchOptions(payload)
    : {
        method:'POST',
        mode:'cors',
        redirect:'follow',
        credentials:'omit',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(payload)
      };

  fetch(CONFIG.SHEET_URL, sheetOpts)
    .then(function(res){
      return (typeof MMSheet !== 'undefined')
        ? MMSheet.readResponse(res)
        : res.text().then(function(text){
            var json = null;
            try{ json = JSON.parse(text); }catch(e){}
            return { type: res.type, ok: !!res.ok, status: res.status, json: json, text: text };
          });
    })
    .then(function(parsed){
      const ok = (typeof MMSheet !== 'undefined')
        ? MMSheet.isWriteSuccess(parsed)
        : !!(parsed && parsed.ok && parsed.json && parsed.json.ok === true);
      if(!ok) throw new Error('sheet_write_failed');

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
        'I have placed my order. Please send me the payment details.'
      );
      setTimeout(()=>{
        window.open(CONFIG.SUPPORT + '?text=' + msg, '_blank');
        btn.disabled = false;
      }, 900);
    })
    .catch(function(){
      toast(t('toastSheetFail'), true);
      btn.disabled = false;
    });
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
  const sticky = document.getElementById('stickyCta');
  addEventListener('scroll', ()=>{
    if(bar){
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (scrollY/h)*100 : 0) + '%';
    }
    if(top) top.classList.toggle('show', scrollY > 420);

    /* ── Mobile sticky CTA (A3) — show after hero, hide near order form ── */
    if(sticky){
      const orderSec = document.getElementById('order');
      let isVisible;
      if(orderSec){
        const ot = orderSec.getBoundingClientRect().top;
        const pastHero = scrollY > 300;
        const nearOrder = ot < 200 && ot > -orderSec.offsetHeight;
        isVisible = pastHero && !nearOrder;
      } else {
        isVisible = scrollY > 300;
      }
      sticky.classList.toggle('show', isVisible);
      document.body.classList.toggle('sticky-visible', isVisible);
    }
  }, {passive:true});
}

/* ─── লাইভ অ্যাক্টিভিটি পপআপ (A6 — polished) ─── */
function initLiveActivity(){
  if(!CONFIG.SHOW_LIVE_ACTIVITY) return;
  const pop = document.getElementById('livePop');
  if(!pop) return;
  const recent = [];
  const MAX_RECENT = 40;

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  /* action variants — 70% join, 15% renew, 15% downloaded */
  const actionWeights = ['join','join','join','join','join','join','join','renew','download'];

  function show(){
    const data = LIVE_NAMES[LANG] || LIVE_NAMES.en;
    let nm, city;
    if(Array.isArray(data)){
      const p = pick(data); nm = p[0]; city = p[1];
    } else {
      let combo;
      for(let tries=0; tries<12; tries++){
        nm = pick(data.names); city = pick(data.cities);
        combo = nm+'|'+city;
        if(recent.indexOf(combo) === -1) break;
      }
      recent.push(combo);
      if(recent.length > MAX_RECENT) recent.shift();
    }

    const action = pick(actionWeights);
    const mins = 1 + Math.floor(Math.random()*28);
    let icon, actionText;
    if(action === 'renew'){
      icon = '🔄'; actionText = t('laRenewed');
    } else if(action === 'download'){
      icon = '📥'; actionText = t('laDownloaded');
    } else {
      icon = '🔒'; actionText = t('laJoined');
    }

    pop.innerHTML = `
      <div class="live-av">${nm.charAt(0)}</div>
      <div>
        <div class="live-tx"><b>${nm}</b> <span class="live-city">— ${city}</span> ${actionText}</div>
        <div class="live-time">${icon} ${mins} ${t('laAgo')}</div>
      </div>`;
    pop.classList.add('show');
    setTimeout(()=>pop.classList.remove('show'), 6000);
  }

  /* first popup at 8s, then every 18s (tighter, feels more active) */
  setTimeout(()=>{ show(); setInterval(show, 18000); }, 8000);
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

/* ─── Order status — public Sheet lookup (no admin token) ─── */
function statusTone(kind, status){
  if(kind === 'found' && status === 'active') return 'var(--green)';
  if(kind === 'found' && (status === 'reject' || status === 'expired')) return 'var(--red)';
  if(kind === 'lookup_failed' || kind === 'not_found') return 'var(--red)';
  return 'var(--gold)';
}

function statusLabel(status, raw){
  if(status === 'active') return tp('ordLblActive') || 'Active';
  if(status === 'pending') return tp('ordLblPending') || 'Pending';
  if(status === 'verifying') return tp('ordLblVerifying') || 'Verifying';
  if(status === 'expired') return tp('ordLblExpired') || 'Expired';
  if(status === 'reject') return tp('ordLblReject') || 'Rejected';
  return raw || tp('ordUnknownLbl') || 'Unknown';
}

function statusMessage(status){
  if(status === 'active') return tp('ordActiveMsg');
  if(status === 'pending') return tp('ordPendingMsg') || tp('ordFoundMsg');
  if(status === 'verifying') return tp('ordVerifyingMsg');
  if(status === 'expired') return tp('ordExpiredMsg');
  if(status === 'reject') return tp('ordRejectMsg');
  return tp('ordUnknownMsg') || tp('ordFoundMsg');
}

function renderOrderStatusHtml(result, typedId, opts){
  opts = opts || {};
  const rawId = (result && result.orderId) || typedId || '';
  const id = (typeof MMSheet !== 'undefined' && MMSheet.escapeHtml)
    ? MMSheet.escapeHtml(rawId)
    : String(rawId).replace(/[<>&"'`]/g, '');
  if(!result || result.kind === 'lookup_failed'){
    if(opts.confirmedBackup){
      return '<div class="next-steps-box">'+
        '<div class="next-steps-title">'+tp('ordConfirmTitle')+'</div>'+
        '<div class="next-step">'+tp('ordConfirmBackup')+' <strong>'+id+'</strong></div>'+
        '<div class="next-steps-note">'+tp('ordConfirmNote')+'</div></div>';
    }
    return '<div class="info-box" style="border-left-color:var(--red)">'+
      '<p>'+tp('ordLookupFail')+'</p>'+
      '<p style="margin-top:8px">'+tp('ordLookupFail2')+'</p></div>';
  }
  if(result.kind === 'not_found'){
    return '<div class="info-box" style="border-left-color:var(--red)">'+
      '<p>'+tp('ordNotFound')+'</p>'+
      '<p style="margin-top:8px">'+tp('ordNotFound2')+'</p></div>';
  }
  const tone = statusTone(result.kind, result.status);
  const label = (typeof MMSheet !== 'undefined' && MMSheet.escapeHtml)
    ? MMSheet.escapeHtml(statusLabel(result.status, result.statusRaw))
    : statusLabel(result.status, result.statusRaw);
  return '<div class="info-box" style="border-left-color:'+tone+'">'+
    '<p><strong>'+tp('ordFound')+' '+id+'</strong></p>'+
    '<p style="margin-top:8px">'+tp('ordStatus')+' <strong style="color:'+tone+'">'+label+'</strong></p>'+
    '<p style="margin-top:8px">'+statusMessage(result.status)+'</p></div>';
}

function lookupOrderStatus(orderId){
  if(typeof MMSheet === 'undefined' || !CONFIG.SHEET_URL){
    return Promise.resolve({ kind: 'lookup_failed' });
  }
  const url = MMSheet.buildStatusLookupUrl(CONFIG.SHEET_URL, orderId);
  if(!url) return Promise.resolve({ kind: 'lookup_failed' });
  return fetch(url, MMSheet.statusFetchOptions())
    .then(function(res){ return MMSheet.readResponse(res); })
    .then(function(parsed){ return MMSheet.interpretStatusResult(parsed); })
    .catch(function(){ return { kind: 'lookup_failed' }; });
}

function checkOrder(){
  const inp = document.getElementById('iOrderId');
  const box = document.getElementById('statusResult');
  if(!inp || !box) return;
  const v = inp.value.trim().toUpperCase();
  if(!v){
    box.innerHTML = '<div class="info-box" style="border-left-color:var(--red)"><p>'+tp('ordErr')+'</p></div>';
    return;
  }
  box.innerHTML = '<div class="info-box"><p>'+(tp('ordChecking') || 'Checking…')+'</p></div>';
  let confirmedBackup = false;
  try{ confirmedBackup = new URLSearchParams(location.search).get('confirmed') === '1'; }catch(e){}
  lookupOrderStatus(v).then(function(result){
    box.innerHTML = renderOrderStatusHtml(result, v, { confirmedBackup: confirmedBackup });
  });
}

function initOrderStatusPage(){
  if(!document.getElementById('statusResult')) return;
  try{
    const p = new URLSearchParams(location.search);
    const oid = p.get('orderId');
    if(!oid) return;
    const inp = document.getElementById('iOrderId');
    if(inp) inp.value = oid;
    checkOrder();
  }catch(e){}
}

/* ─── Purchase backup on confirmed=1 — Entry only, value $30.
   Primary Purchase is Apps Script CAPI when Status → Active. ─── */
function initPurchaseConfirm(){
  try{
    const p = new URLSearchParams(location.search);
    const decision = (typeof MMTracking !== 'undefined')
      ? MMTracking.purchaseBackupEvent({
          confirmed: p.get('confirmed'),
          plan: p.get('plan') || 'Entry',
          orderId: p.get('orderId') || ''
        })
      : {fire: p.get('confirmed')==='1' && (p.get('plan')||'Entry') !== 'Monthly',
         eventName:'Purchase', tiktokEvent:'CompletePayment',
         value:30, currency:'USD', contentName:'Entry', eventId: p.get('orderId')||''};
    if(!decision.fire) return;
    const extra = {currency:decision.currency, value:decision.value, content_name:decision.contentName};
    if(typeof fbq !== 'undefined'){
      fbq('track', decision.eventName, extra, decision.eventId ? {eventID: decision.eventId} : undefined);
    }
    if(typeof ttq !== 'undefined'){
      var ttExtra = {currency:decision.currency, value:decision.value, content_name:decision.contentName};
      if(decision.eventId) ttExtra.event_id = decision.eventId;
      ttq.track(decision.tiktokEvent, ttExtra);
    }
    if(typeof gtag !== 'undefined') gtag('event','purchase',{
      transaction_id: decision.eventId,
      currency:decision.currency, value:decision.value,
      items:[{item_id:'entry',item_name:'Method Mafia Entry',price:decision.value,quantity:1}]
    });
  }catch(e){}
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
  initPurchaseConfirm();
  initOrderStatusPage();
  getUtmData();
});
