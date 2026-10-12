/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — Pay now (flag off by default)
   Public links only. The browser never sends the charge.
   Apps Script re-derives Entry $30 from the sheet plan when
   POST exec?pay=create runs. Only plans in PAY_NOW.plans
   (default "entry") get a panel. Monthly stays on Telegram.
   ═══════════════════════════════════════════════════════════ */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.MMPay = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  var ORDER_QUERY = {
    nowpayments: 'order_id',
    plisio: 'order_number',
    whop: 'orderId'
  };

  function isEnabled(config){
    return !!(config && config.PAY_NOW && config.PAY_NOW.enabled === true);
  }

  /* Allowlist is case-insensitive. An empty or missing list shows nothing. */
  function planAllowed(config, plan){
    var key = String(plan || '').trim().toLowerCase();
    var list = config && config.PAY_NOW && config.PAY_NOW.plans;
    if(!key || !list || !list.length) return false;
    for(var i = 0; i < list.length; i++){
      if(String(list[i] || '').trim().toLowerCase() === key) return true;
    }
    return false;
  }

  function cryptoProvider(config){
    var name = config && config.PAY_NOW && String(config.PAY_NOW.crypto || '').toLowerCase();
    return name === 'plisio' ? 'plisio' : 'nowpayments';
  }

  function cardProvider(config){
    var whop = config && config.PAY_NOW && config.PAY_NOW.whop;
    if(whop && whop.enabled === true) return 'whop';
    return 'nowpayments';
  }

  function isMonthlyPlan(plan){
    return String(plan || '').trim().toLowerCase() === 'monthly';
  }

  function publicLink(config, provider, plan){
    var block = (config && config.PAY_NOW && config.PAY_NOW[provider]) || {};
    var monthlyLink = String(block.monthlyLink || '').trim();
    var mainLink = String(block.hostedLink || block.productLink || '').trim();
    var link = (isMonthlyPlan(plan) && monthlyLink) ? monthlyLink : mainLink;
    if(!/^https:\/\//i.test(link)) return '';
    return link;
  }

  function hostedFallbackUrl(config, provider, orderId, plan){
    var name = String(provider || '').toLowerCase();
    var key = ORDER_QUERY[name];
    var link = publicLink(config, name, plan);
    var id = String(orderId || '').trim();
    if(!key || !link || !id) return '';
    try{
      var u = new URL(link);
      u.searchParams.set(key, id);
      if(name === 'whop') u.searchParams.set('metadata[order_id]', id);
      return u.toString();
    }catch(e){
      return '';
    }
  }

  /* POST ?pay=create. Order id and provider travel in the body, never the price. */
  function buildCreatePaymentUrl(sheetUrl){
    var base = String(sheetUrl || '').trim();
    if(!base) return '';
    try{
      var u = new URL(base);
      u.searchParams.delete('token');
      u.searchParams.delete('action');
      u.searchParams.delete('orderId');
      u.searchParams.delete('provider');
      u.searchParams.delete('amount');
      u.searchParams.delete('price');
      u.searchParams.set('pay', 'create');
      return u.toString();
    }catch(e){
      return '';
    }
  }

  function createPaymentBody(orderId, provider){
    return {
      orderId: String(orderId || ''),
      provider: String(provider || '').toLowerCase()
    };
  }

  function createPaymentFetchOptions(orderId, provider){
    return {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(createPaymentBody(orderId, provider))
    };
  }

  function startCheckout(opts){
    opts = opts || {};
    if(!planAllowed(opts.config, opts.plan)) return Promise.resolve('');
    var provider = String(opts.provider || '').toLowerCase();
    var orderId = String(opts.orderId || '');
    var fallback = hostedFallbackUrl(opts.config, provider, orderId, opts.plan);
    var requestUrl = buildCreatePaymentUrl(opts.config && opts.config.SHEET_URL);
    function go(url){
      if(!url || !/^https:\/\//i.test(url)){
        if(typeof opts.onFail === 'function') opts.onFail();
        return '';
      }
      if(typeof opts.navigate === 'function') opts.navigate(url);
      return url;
    }
    if(!requestUrl || typeof opts.fetch !== 'function') return Promise.resolve(go(fallback));
    return Promise.resolve()
      .then(function(){
        return opts.fetch(requestUrl, createPaymentFetchOptions(orderId, provider));
      })
      .then(function(res){
        if(typeof opts.readJson === 'function') return opts.readJson(res);
        if(res && typeof res.json === 'function') return res.json();
        return null;
      })
      .then(function(json){
        if(json && json.ok === false && json.error === 'plan_not_allowed'){
          if(typeof opts.onFail === 'function') opts.onFail();
          return '';
        }
        var apiUrl = '';
        if(json && json.ok === true && typeof json.url === 'string' && /^https:\/\//i.test(json.url)){
          apiUrl = json.url;
        }
        return go(apiUrl || fallback);
      })
      .catch(function(){
        return go(fallback);
      });
  }

  function clearChildren(el){
    if(!el) return;
    while(el.firstChild) el.removeChild(el.firstChild);
  }

  function makeEl(doc, tag, className, text){
    var node = doc.createElement(tag);
    if(className) node.className = className;
    if(text != null) node.textContent = text;
    return node;
  }

  function makePayLink(doc, opts){
    var a = makeEl(doc, 'a', opts.className, opts.text);
    a.id = opts.id;
    a.href = opts.href || '#';
    if(a.setAttribute){
      a.setAttribute('data-provider', opts.provider);
      a.setAttribute('data-order-id', opts.orderId);
    }
    a.addEventListener('click', function(ev){
      if(ev && ev.preventDefault) ev.preventDefault();
      if(typeof opts.onChoose === 'function') return opts.onChoose(opts.provider);
    });
    return a;
  }

  function mount(doc, opts){
    if(!doc || !opts) return;
    var box = doc.getElementById('payNow');
    if(!box) return;
    if(!isEnabled(opts.config) || !planAllowed(opts.config, opts.plan)){
      box.hidden = true;
      clearChildren(box);
      return;
    }
    var labels = opts.labels || {};
    var orderId = String(opts.orderId || '');
    var plan = opts.plan || '';
    var crypto = cryptoProvider(opts.config);
    var card = cardProvider(opts.config);
    box.className = 'pay-now show';
    box.hidden = false;
    if(box.removeAttribute) box.removeAttribute('hidden');
    if(box.setAttribute) box.setAttribute('aria-label', labels.title || 'Pay now');
    clearChildren(box);

    box.appendChild(makeEl(doc, 'div', 'pay-now-title', labels.title || 'Pay now'));
    box.appendChild(makeEl(doc, 'p', 'pay-now-note', labels.note || ''));
    var idLine = makeEl(doc, 'p', 'pay-now-id', (labels.order || 'Order') + ' ' + orderId);
    if(idLine.setAttribute) idLine.setAttribute('data-order-id', orderId);
    box.appendChild(idLine);
    box.appendChild(makePayLink(doc, {
      id: 'payCrypto',
      className: 'pay-now-btn pay-now-crypto',
      text: labels.crypto || 'Pay with Crypto',
      provider: crypto,
      orderId: orderId,
      href: hostedFallbackUrl(opts.config, crypto, orderId, plan),
      onChoose: opts.onChoose
    }));
    box.appendChild(makePayLink(doc, {
      id: 'payCard',
      className: 'pay-now-btn pay-now-card',
      text: labels.card || 'Pay with Card',
      provider: card,
      orderId: orderId,
      href: hostedFallbackUrl(opts.config, card, orderId, plan),
      onChoose: opts.onChoose
    }));
    var status = makeEl(doc, 'p', 'pay-now-status', '');
    status.id = 'payNowStatus';
    status.hidden = true;
    box.appendChild(status);
  }

  function relabel(doc, labels){
    if(!doc || !labels) return;
    var box = doc.getElementById('payNow');
    if(!box || box.hidden) return;
    var kids = box.children || [];
    for(var i = 0; i < kids.length; i++){
      var el = kids[i];
      var cls = String(el.className || '');
      if(cls === 'pay-now-title') el.textContent = labels.title || el.textContent;
      else if(cls === 'pay-now-note') el.textContent = labels.note || el.textContent;
      else if(cls.indexOf('pay-now-crypto') !== -1) el.textContent = labels.crypto || el.textContent;
      else if(cls.indexOf('pay-now-card') !== -1) el.textContent = labels.card || el.textContent;
      else if(cls === 'pay-now-id'){
        var id = el.getAttribute ? (el.getAttribute('data-order-id') || '') : '';
        el.textContent = (labels.order || 'Order') + ' ' + id;
      }
    }
  }

  return {
    isEnabled: isEnabled,
    planAllowed: planAllowed,
    cryptoProvider: cryptoProvider,
    cardProvider: cardProvider,
    hostedFallbackUrl: hostedFallbackUrl,
    buildCreatePaymentUrl: buildCreatePaymentUrl,
    createPaymentFetchOptions: createPaymentFetchOptions,
    startCheckout: startCheckout,
    mount: mount,
    relabel: relabel
  };
});
