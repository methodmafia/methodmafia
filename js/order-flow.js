/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — Post-order Support + duplicate helpers
   Browser + Node. No VIP invite links. No payment-address wipe.
   ═══════════════════════════════════════════════════════════ */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.MMOrderFlow = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  var DEFAULT_SUPPORT = 'https://t.me/MMHQ_Support';
  var COL = { telegram: 4, email: 3, status: 11, orderId: 1 };

  function trimSlash(url){
    return String(url || '').replace(/\/+$/, '');
  }

  function buildSupportTelegramUrl(supportBase, text){
    var base = trimSlash(supportBase) || DEFAULT_SUPPORT;
    if(!text) return base;
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    return base + sep + 'text=' + encodeURIComponent(String(text));
  }

  function buildPaymentProofMessage(opts){
    opts = opts || {};
    return [
      'Hi, I placed an order.',
      '',
      'Order ID : ' + (opts.orderId || ''),
      'Plan     : ' + (opts.plan || ''),
      'Amount   : ' + (opts.amount || ''),
      'Payment  : ' + (opts.payment || ''),
      '',
      'I will send my payment screenshot here.'
    ].join('\n');
  }

  function wasPopupBlocked(win){
    try{
      return !win || win.closed === true;
    }catch(e){
      return true;
    }
  }

  function openSupportTelegram(supportBase, text, openFn){
    var url = buildSupportTelegramUrl(supportBase, text);
    var opener = openFn;
    if(!opener && typeof window !== 'undefined' && typeof window.open === 'function'){
      opener = function(href, target){ return window.open(href, target); };
    }
    var win = null;
    if(typeof opener === 'function'){
      try{ win = opener(url, '_blank'); }catch(e){ win = null; }
    }
    return { url: url, blocked: wasPopupBlocked(win) };
  }

  function normalizeHandle(value){
    return String(value == null ? '' : value).trim().toLowerCase().replace(/^@+/, '');
  }

  function normalizeEmail(value){
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function isPendingStatus(status){
    var s = String(status == null ? '' : status).trim().toLowerCase();
    return s === 'pending' || s === 'submitted';
  }

  function findContactMatch(rows, telegram, email, cols){
    cols = cols || COL;
    if(!rows || !rows.length) return null;
    var tg = normalizeHandle(telegram);
    var eml = normalizeEmail(email);
    var match = null;
    for(var i = 1; i < rows.length; i++){
      var row = rows[i] || [];
      var rowTg = normalizeHandle(row[cols.telegram]);
      var rowEml = normalizeEmail(row[cols.email]);
      if((tg && rowTg === tg) || (eml && rowEml === eml)){
        match = {
          orderId: String(row[cols.orderId] || ''),
          status: String(row[cols.status] || ''),
          pending: isPendingStatus(row[cols.status])
        };
      }
    }
    return match;
  }

  return {
    DEFAULT_SUPPORT: DEFAULT_SUPPORT,
    COL: COL,
    buildSupportTelegramUrl: buildSupportTelegramUrl,
    buildPaymentProofMessage: buildPaymentProofMessage,
    wasPopupBlocked: wasPopupBlocked,
    openSupportTelegram: openSupportTelegram,
    normalizeHandle: normalizeHandle,
    isPendingStatus: isPendingStatus,
    findContactMatch: findContactMatch
  };
});
