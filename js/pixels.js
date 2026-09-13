/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — Shared Meta + TikTok pixel loader
   Load after config.js (and js/tracking-lib.js when present).
   One file maintains both snippets + PageView / ttq.page.
   ═══════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(typeof window === 'undefined' || typeof CONFIG === 'undefined') return;

  var T = window.MMTracking;
  var store, session;
  try{ store = window.localStorage; }catch(e){ store = null; }
  try{ session = window.sessionStorage; }catch(e){ session = null; }

  /* Persist click IDs + UTM as soon as the pixel file runs */
  if(T){
    try{ T.getAttribution(location.search, session || store, store); }
    catch(e){}
  }

  /* ── Meta Pixel ── */
  if(CONFIG.META_PIXEL && !window.fbq){
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', CONFIG.META_PIXEL);
    fbq('track', 'PageView');
  } else if(CONFIG.META_PIXEL && window.fbq){
    fbq('track', 'PageView');
  }

  /* ── TikTok Pixel ── */
  if(CONFIG.TIKTOK_PIXEL && !window.ttq){
    !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
    ttq.load(CONFIG.TIKTOK_PIXEL);
    ttq.page();
    }(window, document, 'ttq');
  } else if(CONFIG.TIKTOK_PIXEL && window.ttq && typeof window.ttq.page === 'function'){
    window.ttq.page();
  }

  function fireViewContent(){
    if(!T) return;
    var flagStore = session || store;
    if(!T.shouldFireViewContent(flagStore)) return;
    T.markViewContentFired(flagStore);
    if(typeof fbq !== 'undefined'){
      fbq('track', 'ViewContent', {content_name:'Entry', currency:'USD', value:30});
    }
    if(typeof ttq !== 'undefined'){
      ttq.track('ViewContent', {content_name:'Entry', currency:'USD', value:30});
    }
    if(typeof gtag !== 'undefined'){
      gtag('event', 'view_item', {currency:'USD', value:30, items:[{item_id:'entry', item_name:'Entry', price:30, quantity:1}]});
    }
  }

  function fireContact(){
    if(typeof fbq !== 'undefined') fbq('track', 'Contact');
    if(typeof ttq !== 'undefined') ttq.track('Contact');
    if(typeof gtag !== 'undefined') gtag('event', 'contact');
  }

  function watchViewContent(){
    var targets = ['pricing', 'order'].map(function(id){ return document.getElementById(id); }).filter(Boolean);
    if(!targets.length){
      var join = document.querySelector('a[href="#order"], a[href$="#order"]');
      if(join) targets = [join];
    }
    if(!targets.length) return;

    function onIntersect(entries, ob){
      entries.forEach(function(x){
        if(x.isIntersecting){
          fireViewContent();
          if(ob) ob.disconnect();
        }
      });
    }

    if('IntersectionObserver' in window){
      var ob = new IntersectionObserver(onIntersect, {threshold: 0.25});
      targets.forEach(function(el){ ob.observe(el); });
    }
  }

  function watchContactClicks(){
    document.addEventListener('click', function(e){
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if(!a) return;
      var href = a.getAttribute('href') || '';
      var key = a.getAttribute('data-href') || '';
      var isSupport = key === 'SUPPORT' || key === 'PUBLIC_CHANNEL';
      if(!isSupport && T && T.isContactHref(href, CONFIG)) isSupport = true;
      if(isSupport) fireContact();
    }, true);
  }

  window.MMPixels = {
    fireViewContent: fireViewContent,
    fireContact: fireContact
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      watchViewContent();
      watchContactClicks();
    });
  } else {
    watchViewContent();
    watchContactClicks();
  }
})();
