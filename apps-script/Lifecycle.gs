/**
 * THE METHOD MAFIA — Phase 2A lifecycle (Pending nudge / Auto Expired / Renew / customer mail)
 * ==========================================================================================
 * Bound to the same Apps Script project as OrderProcessor.gs + SheetOrganize.gs + CapiPurchase.gs.
 *
 * Jobs:
 *   pendingNudgeTrigger         Pending rows older than 24h → admin email (DIGEST_EMAIL)
 *   expiryLifecycleTrigger      customer 3/2/1 renew mail → Auto Expired → admin expiry digest
 *   renewOrder(orderId)         Active/Expired → Expiry +30 from max(today, expiry), Status Active
 *
 * Notes markers (dedupe, never wipe PURCHASE_SENT):
 *   PENDING_NUDGED, RENEW_MAIL_3, RENEW_MAIL_2, RENEW_MAIL_1
 *
 * Customer 3/2/1 renew copy is locked to RENEW_COPY_PREMIUM_VIP.md (tone B,
 * Premium VIP, $15). Language from Sheet column Language (en|bn|hi);
 * default EN if blank. Telegram path uses the same pack (RENEW_TG_3/_2/_1).
 *
 * Email path only in this file. After customer mail + Auto Expired, OrderProcessor
 * expiryReminderTrigger calls runTelegramLifecycleHook_ if present (pay/renew/kick).
 * Customer renew From is info@themethodmafia.com (never HQ Gmail). Digest / pending
 * nudge / admin expiry stay TO methodmafia.hq@gmail.com with default From.
 * CAPI Purchase is NOT sent on renew (Entry $30 stays first Active only).
 * See GUIDE.md → PART 12 + PART 13.
 */

var LIFECYCLE_ADMIN_EMAIL = (typeof DIGEST_EMAIL !== 'undefined')
  ? DIGEST_EMAIL
  : 'methodmafia.hq@gmail.com';
var CUSTOMER_MAIL_FROM = 'info@themethodmafia.com';
var CUSTOMER_MAIL_FROM_NAME = 'Method Mafia';
var PENDING_NUDGE_MS = 24 * 60 * 60 * 1000;
var PENDING_NUDGED_MARKER = 'PENDING_NUDGED';
var RENEW_MARKERS = { 3: 'RENEW_MAIL_3', 2: 'RENEW_MAIL_2', 1: 'RENEW_MAIL_1' };
var LIFECYCLE_TZ = (typeof ORGANIZE_TZ !== 'undefined') ? ORGANIZE_TZ : 'Asia/Dhaka';
var LIFECYCLE_TZ_OFFSET_MS = (typeof ORGANIZE_TZ_OFFSET_MS !== 'undefined')
  ? ORGANIZE_TZ_OFFSET_MS
  : (6 * 60 * 60 * 1000); // Asia/Dhaka, no DST — same as SheetOrganize

function lifecycleStatus_(status) {
  return String(status || '').trim().toLowerCase();
}

function notesHasMarker_(notes, marker) {
  var hay = String(notes || '').toUpperCase();
  var needle = String(marker || '').toUpperCase();
  if (!needle) return false;
  return hay.indexOf(needle) !== -1;
}

function notesAppendMarker_(notes, marker) {
  var mark = String(marker || '').trim();
  if (!mark) return String(notes == null ? '' : notes);
  if (notesHasMarker_(notes, mark)) return String(notes == null ? '' : notes);
  var cur = String(notes == null ? '' : notes).trim();
  return cur ? (cur + ' | ' + mark) : mark;
}

function lifecycleParseDate_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function lifecyclePad2_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

function lifecycleDhakaYmd_(date) {
  if (typeof dhakaYmd_ === 'function') return dhakaYmd_(date);
  var shifted = new Date(date.getTime() + LIFECYCLE_TZ_OFFSET_MS);
  return shifted.getUTCFullYear() + '-' + lifecyclePad2_(shifted.getUTCMonth() + 1) + '-' + lifecyclePad2_(shifted.getUTCDate());
}

function lifecycleYmdAddDays_(ymd, days) {
  var p = String(ymd || '').split('-');
  if (p.length < 3) return '';
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.getUTCFullYear() + '-' + lifecyclePad2_(d.getUTCMonth() + 1) + '-' + lifecyclePad2_(d.getUTCDate());
}

function lifecycleYmdToUtcMs_(ymd) {
  var p = String(ymd || '').split('-');
  if (p.length < 3) return NaN;
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function calendarDaysUntil_(expiry, today) {
  var e = lifecycleParseDate_(expiry);
  var t = lifecycleParseDate_(today);
  if (!e || !t) return null;
  var eYmd = lifecycleDhakaYmd_(e);
  var tYmd = lifecycleDhakaYmd_(t);
  return Math.round((lifecycleYmdToUtcMs_(eYmd) - lifecycleYmdToUtcMs_(tYmd)) / 86400000);
}

function daysLeftFormulaUsesExpiryColumn_(formula, col) {
  var letter = String.fromCharCode(65 + col.EXPIRY);
  var f = String(formula || '');
  return f.indexOf(letter) !== -1 && f.indexOf('TODAY()') !== -1;
}

function shouldNudgePending_(status, timestamp, notes, now) {
  if (lifecycleStatus_(status) !== 'pending') return false;
  if (notesHasMarker_(notes, PENDING_NUDGED_MARKER)) return false;
  var ts = lifecycleParseDate_(timestamp);
  var n = lifecycleParseDate_(now);
  if (!ts || !n) return false;
  return (n.getTime() - ts.getTime()) >= PENDING_NUDGE_MS;
}

function planPendingNudges_(rows, col, now) {
  var out = [];
  now = now || new Date();
  for (var i = 1; i < rows.length; i++) {
    var status = rows[i][col.STATUS];
    var ts = rows[i][col.TIMESTAMP];
    var notes = col.NOTES >= 0 ? rows[i][col.NOTES] : '';
    if (!shouldNudgePending_(status, ts, notes, now)) continue;
    var tsDate = lifecycleParseDate_(ts);
    out.push({
      rowIndex0: i,
      orderId: String(rows[i][col.ORDER_ID] || ''),
      name: String(rows[i][col.NAME] || ''),
      telegram: String(rows[i][col.TELEGRAM] || ''),
      email: String(rows[i][col.EMAIL] || ''),
      hoursOld: tsDate ? Math.floor((lifecycleParseDate_(now).getTime() - tsDate.getTime()) / 3600000) : 0
    });
  }
  return out;
}

function lifecycleEscape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildPendingNudgeMessage_(items, activateLinks) {
  items = items || [];
  activateLinks = activateLinks || {};
  var html = '<h2>Method Mafia — Pending 24h nudge</h2>';
  html += '<p>These Pending orders are older than 24 hours and still waiting for payment confirmation.</p><ul>';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    html += '<li><strong>' + lifecycleEscape_(it.orderId) + '</strong> — '
      + lifecycleEscape_(it.name) + ' (' + lifecycleEscape_(it.telegram) + ') — ~'
      + lifecycleEscape_(it.hoursOld) + 'h old';
    var url = activateLinks[it.orderId];
    if (url) {
      html += ' — <a href="' + String(url).replace(/"/g, '') + '">Activate '
        + lifecycleEscape_(it.orderId) + '</a>';
    }
    html += '</li>';
  }
  html += '</ul>';
  html += '<p style="color:#555;font-size:13px">Activate links use Script Properties ADMIN_TOKEN. '
    + 'This list was emailed to the admin inbox only.</p>';
  return {
    to: LIFECYCLE_ADMIN_EMAIL,
    subject: '[Method Mafia] Pending orders older than 24h (' + items.length + ')',
    htmlBody: html
  };
}

function applyPendingNudgeMarkers_(rows, col, now) {
  var copy = [];
  var i;
  for (i = 0; i < rows.length; i++) copy.push(rows[i].slice());
  var planned = planPendingNudges_(copy, col, now);
  var nudged = [];
  for (i = 0; i < planned.length; i++) {
    var idx = planned[i].rowIndex0;
    copy[idx][col.NOTES] = notesAppendMarker_(copy[idx][col.NOTES], PENDING_NUDGED_MARKER);
    nudged.push(planned[i].orderId);
  }
  return { rows: copy, nudged: nudged };
}

function shouldExpire_(status, expiry, today) {
  if (lifecycleStatus_(status) !== 'active') return false;
  var days = calendarDaysUntil_(expiry, today);
  return days !== null && days < 0;
}

function planAutoExpires_(rows, col, today) {
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (shouldExpire_(rows[i][col.STATUS], rows[i][col.EXPIRY], today)) {
      out.push({
        rowIndex0: i,
        orderId: String(rows[i][col.ORDER_ID] || '')
      });
    }
  }
  return out;
}

function applyAutoExpiresToRows_(rows, col, today) {
  var copy = [];
  var i;
  for (i = 0; i < rows.length; i++) copy.push(rows[i].slice());
  var planned = planAutoExpires_(copy, col, today);
  var expired = [];
  for (i = 0; i < planned.length; i++) {
    copy[planned[i].rowIndex0][col.STATUS] = 'Expired';
    expired.push(planned[i].orderId);
  }
  return { rows: copy, expired: expired };
}

function computeRenewedExpiry_(currentExpiry, today) {
  var t = lifecycleParseDate_(today) || new Date();
  var tYmd = lifecycleDhakaYmd_(t);
  var e = lifecycleParseDate_(currentExpiry);
  var eYmd = e ? lifecycleDhakaYmd_(e) : '';
  var base = (!eYmd || eYmd < tYmd) ? tYmd : eYmd;
  return lifecycleYmdAddDays_(base, 30);
}

function planRenewOrder_(status, expiry, today) {
  var n = lifecycleStatus_(status);
  if (n !== 'active' && n !== 'expired') {
    return { ok: false, reason: 'not-renewable', status: status };
  }
  return {
    ok: true,
    newStatus: 'Active',
    newExpiry: computeRenewedExpiry_(expiry, today)
  };
}

function applyRenewToRow_(rows, col, rowIndex0, today) {
  var copy = [];
  for (var i = 0; i < rows.length; i++) copy.push(rows[i].slice());
  var plan = planRenewOrder_(copy[rowIndex0][col.STATUS], copy[rowIndex0][col.EXPIRY], today);
  if (!plan.ok) {
    return { ok: false, reason: plan.reason, rows: copy, sendCapi: false };
  }
  copy[rowIndex0][col.STATUS] = plan.newStatus;
  copy[rowIndex0][col.EXPIRY] = plan.newExpiry;
  copy[rowIndex0][col.NOTES] = notesAppendMarker_(copy[rowIndex0][col.NOTES], 'Renewed: ' + plan.newExpiry);
  return { ok: true, rows: copy, newExpiry: plan.newExpiry, sendCapi: false };
}

function renewMailMarker_(daysLeft) {
  return RENEW_MARKERS[daysLeft] || '';
}

function planCustomerRenewMails_(rows, col, today) {
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (lifecycleStatus_(rows[i][col.STATUS]) !== 'active') continue;
    var days = calendarDaysUntil_(rows[i][col.EXPIRY], today);
    var marker = renewMailMarker_(days);
    if (!marker) continue;
    var email = String(rows[i][col.EMAIL] || '').trim();
    if (!email) continue;
    if (notesHasMarker_(rows[i][col.NOTES], marker)) continue;
    out.push({
      rowIndex0: i,
      orderId: String(rows[i][col.ORDER_ID] || ''),
      name: String(rows[i][col.NAME] || ''),
      email: email,
      daysLeft: days,
      expiry: rows[i][col.EXPIRY],
      notes: rows[i][col.NOTES],
      language: (col.LANGUAGE >= 0) ? rows[i][col.LANGUAGE] : '',
      marker: marker
    });
  }
  return out;
}

function formatExpiryLabel_(expiry) {
  var d = lifecycleParseDate_(expiry);
  if (!d) return String(expiry || '');
  return lifecycleDhakaYmd_(d);
}

function resolveCustomerCopyLang_(notes, locale) {
  var loc = String(locale || '').trim().toLowerCase();
  if (loc === 'en' || loc === 'english') return 'en';
  if (loc === 'bn' || loc === 'bangla' || loc === 'bengali' || loc === 'bd') return 'bn';
  if (loc === 'hi' || loc === 'hindi' || loc === 'hn') return 'hi';
  var blob = String(notes || '').toUpperCase();
  if (blob.indexOf('LANG_EN') !== -1) return 'en';
  if (blob.indexOf('LANG_HI') !== -1) return 'hi';
  if (blob.indexOf('LANG_BN') !== -1) return 'bn';
  return 'en';
}

var DEFAULT_RENEW_LINK = 'Pay, then send Order ID + screenshot to @MMHQ_Support';

function fillRenewPlaceholders_(text, item) {
  item = item || {};
  var name = String(item.name || '').trim() || 'there';
  var link = String(item.renewLink || item.renew_link || '').trim() || DEFAULT_RENEW_LINK;
  return String(text || '').replace(/\{name\}/g, name).replace(/\{renew_link\}/g, link);
}

function premiumVipRenewPack_() {
  return {
    en: {
      3: {
        subject: "Your Premium VIP access ends in 3 days",
        body:
          "Hey {name} 👋\n\nYour Premium VIP access ends in **3 days**.\n\nInside you still get the daily edge, private signals, and the circle that keeps compounding.\n\nRenew for **$15** and stay in — don’t let the streak break.\n\n→ {renew_link}\n\n— Method Mafia"
      },
      2: {
        subject: "2 days left in Premium VIP",
        body:
          "{name}, quick reminder ⚡\n\nOnly **2 days** left on your Premium VIP.\n\nPeople who stay usually keep the gains stacking. Stepping out now means missing the next moves.\n\nLock **$15** renew today and keep your seat.\n\n→ {renew_link}"
      },
      1: {
        subject: "Last day — Premium VIP closes tonight",
        body:
          "{name} — this is your last day 🔥\n\nPremium VIP access ends **tonight**. After that, the door closes and you’ll miss what’s coming next.\n\nOne small step: renew **$15** and stay inside.\n\n→ {renew_link}\n\nDon’t sleep on this."
      }
    },
    bn: {
      3: {
        subject: "Premium VIP আর ৩ দিন বাকি",
        body:
          "হ্যালো {name} 👋\n\nতোমার Premium VIP এক্সেস আর **৩ দিন** পরে শেষ।\n\nভিতরে এখনো আছে ডেইলি এজ, প্রাইভেট সিগন্যাল, আর যে সার্কেল তোমার লাভ বাড়াচ্ছে।\n\nমাত্র **$15** রিনিউ করে ভিতরে থাকো — স্ট্রিক ভাঙতে দিও না।\n\n→ {renew_link}\n\n— Method Mafia"
      },
      2: {
        subject: "Premium VIP — আর মাত্র ২ দিন",
        body:
          "{name}, ছোট রিমাইন্ডার ⚡\n\nPremium VIP-তে আর মাত্র **২ দিন**।\n\nযারা থাকেন, তারা সাধারণত গেইন স্ট্যাক করতে থাকেন। এখন বের হলে পরের মুভগুলো মিস।\n\nআজই **$15** রিনিউ করে সিট লক করো।\n\n→ {renew_link}"
      },
      1: {
        subject: "শেষ দিন — আজ রাত Premium VIP বন্ধ",
        body:
          "{name} — এটা তোমার শেষ দিন 🔥\n\nPremium VIP এক্সেস **আজ রাতে** শেষ। এরপর দরজা বন্ধ — পরের সুযোগগুলো হাতছাড়া।\n\nএকটা ছোট স্টেপ: **$15** রিনিউ করে ভিতরে থাকো।\n\n→ {renew_link}\n\nএটা স্লিপ করো না।"
      }
    },
    hi: {
      3: {
        subject: "Premium VIP में सिर्फ 3 दिन बाकी",
        body:
          "नमस्ते {name} 👋\n\nतुम्हारा Premium VIP एक्सेस **3 दिन** में खत्म हो रहा है।\n\nअंदर अभी भी डेली एज, प्राइवेट सिग्नल्स, और वो सर्कल है जो तुम्हारा फायदा बढ़ा रहा है।\n\nसिर्फ **$15** रिन्यू करके अंदर रहो — स्ट्रीक मत तोड़ो।\n\n→ {renew_link}\n\n— Method Mafia"
      },
      2: {
        subject: "Premium VIP — सिर्फ 2 दिन बचे",
        body:
          "{name}, छोटा रिमाइंडर ⚡\n\nPremium VIP में सिर्फ **2 दिन** बचे हैं।\n\nजो लोग रहते हैं, वो आमतौर पर गेन स्टैक करते रहते हैं। अब बाहर निकले तो अगले मूव्स मिस।\n\nआज ही **$15** रिन्यू करके सीट लॉक करो।\n\n→ {renew_link}"
      },
      1: {
        subject: "आखिरी दिन — आज रात Premium VIP बंद",
        body:
          "{name} — ये तुम्हारा आखिरी दिन है 🔥\n\nPremium VIP एक्सेस **आज रात** खत्म। उसके बाद दरवाज़ा बंद — आगे के मौके हाथ से निकल जाएंगे।\n\nएक छोटा स्टेप: **$15** रिन्यू करके अंदर रहो।\n\n→ {renew_link}\n\nइसको स्लीप मत करो।"
      }
    }
  };
}

function buildPremiumVipRenewCopy_(lang, daysLeft, item) {
  var pack = premiumVipRenewPack_();
  var code = String(lang || 'en').toLowerCase();
  if (code !== 'bn' && code !== 'hi') code = 'en';
  var n = Number(daysLeft);
  if (n !== 1 && n !== 2 && n !== 3) n = 3;
  var entry = pack[code][n];
  return {
    subject: fillRenewPlaceholders_(entry.subject, item),
    body: fillRenewPlaceholders_(entry.body, item)
  };
}

function buildToneBRenewCopy_(lang, daysLeft, item) {
  return buildPremiumVipRenewCopy_(lang, daysLeft, item);
}

function lifecycleTextToHtml_(text) {
  var blocks = String(text || '').split(/\n\n+/);
  var html = '';
  var i;
  for (i = 0; i < blocks.length; i++) {
    html += '<p>' + lifecycleEscape_(blocks[i])
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>') + '</p>';
  }
  return html;
}

function buildCustomerRenewMessage_(item) {
  item = item || {};
  var lang = resolveCustomerCopyLang_(item.notes, item.locale || item.lang || item.language);
  var copy = buildPremiumVipRenewCopy_(lang, item.daysLeft, item);
  return {
    to: String(item.email || '').trim(),
    subject: copy.subject,
    textBody: copy.body + '\n',
    htmlBody: lifecycleTextToHtml_(copy.body)
  };
}

function buildCustomerRenewMailOptions_(msg) {
  msg = msg || {};
  return {
    to: String(msg.to || '').trim(),
    subject: String(msg.subject || ''),
    htmlBody: msg.htmlBody || '',
    body: msg.textBody || msg.body || '',
    from: CUSTOMER_MAIL_FROM,
    name: CUSTOMER_MAIL_FROM_NAME
  };
}

function customerRenewMailLog_(line, adapters) {
  if (adapters && typeof adapters.log === 'function') {
    adapters.log(line);
    return;
  }
  if (typeof Logger !== 'undefined' && Logger && typeof Logger.log === 'function') {
    Logger.log(line);
  }
}

function resolveCustomerMailService_(adapters, key, globalObj) {
  adapters = adapters || {};
  if (Object.prototype.hasOwnProperty.call(adapters, key)) return adapters[key];
  if (typeof globalObj !== 'undefined') return globalObj;
  return null;
}

function sendCustomerRenewEmail_(msg, adapters) {
  adapters = adapters || {};
  var opts = buildCustomerRenewMailOptions_(msg);
  var gmail = resolveCustomerMailService_(adapters, 'GmailApp', typeof GmailApp !== 'undefined' ? GmailApp : undefined);
  var mail = resolveCustomerMailService_(adapters, 'MailApp', typeof MailApp !== 'undefined' ? MailApp : undefined);
  try {
    if (gmail && typeof gmail.sendEmail === 'function') {
      gmail.sendEmail(opts.to, opts.subject, opts.body, {
        htmlBody: opts.htmlBody,
        from: opts.from,
        name: opts.name
      });
      return { ok: true, via: 'GmailApp', retryWithoutFrom: false };
    }
    if (mail && typeof mail.sendEmail === 'function') {
      mail.sendEmail({
        to: opts.to,
        subject: opts.subject,
        htmlBody: opts.htmlBody,
        body: opts.body,
        from: opts.from,
        name: opts.name
      });
      return { ok: true, via: 'MailApp', retryWithoutFrom: false };
    }
    throw new Error('no mail service');
  } catch (err) {
    var detail = err && err.message ? err.message : String(err);
    customerRenewMailLog_(
      'customer renew mail FROM ' + CUSTOMER_MAIL_FROM +
        ' failed (alias missing?). Do not silently send from HQ. Error: ' + detail,
      adapters
    );
    return {
      ok: false,
      via: '',
      reason: 'from-alias-failed',
      retryWithoutFrom: false,
      error: detail
    };
  }
}

function applyCustomerRenewMarkers_(rows, col, planned) {
  var copy = [];
  var i;
  for (i = 0; i < rows.length; i++) copy.push(rows[i].slice());
  planned = planned || [];
  for (i = 0; i < planned.length; i++) {
    var idx = planned[i].rowIndex0;
    copy[idx][col.NOTES] = notesAppendMarker_(copy[idx][col.NOTES], planned[i].marker);
  }
  return { rows: copy };
}

/* ── Spreadsheet jobs (Apps Script runtime) ───────────── */

function lifecycleOrdersSheet_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = opts.ordersName || (typeof SHEET_NAME !== 'undefined' ? SHEET_NAME : 'Orders');
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet ' + name);
  return sheet;
}

function syncLifecycleRow_(ordersSheet, row1, opts) {
  opts = opts || {};
  if (typeof applyColMapFromSheet_ !== 'function' || typeof readHeaders_ !== 'function') return;
  var col = applyColMapFromSheet_(ordersSheet);
  var headers = readHeaders_(ordersSheet);
  var rowValues = ordersSheet.getRange(row1, 1, 1, headers.length).getValues()[0];
  if (opts.masterName && typeof getOrCreateSheetWithHeaders_ === 'function'
      && typeof upsertRowByOrderIdOnSheet_ === 'function') {
    var master = getOrCreateSheetWithHeaders_(ordersSheet.getParent(), opts.masterName, headers);
    upsertRowByOrderIdOnSheet_(master, rowValues, col);
    return;
  }
  if (typeof isOrganizeTestSheetName_ === 'function' && isOrganizeTestSheetName_(ordersSheet.getName())) {
    return;
  }
  if (typeof syncOrderRowToOrganizeTabs_ === 'function') {
    syncOrderRowToOrganizeTabs_(ordersSheet, row1);
  }
}

function reapplyDaysLeft_(sheet, row1, col) {
  if (typeof applyDaysLeftFormulaOnSheet_ === 'function') {
    applyDaysLeftFormulaOnSheet_(sheet, row1, col);
  }
}

function pendingNudgeTrigger() {
  runPendingNudgeJob_({});
}

function runPendingNudgeJob_(opts) {
  opts = opts || {};
  var sheet = lifecycleOrdersSheet_(opts);
  var col = applyColMapFromSheet_(sheet);
  var data = sheet.getDataRange().getValues();
  var now = opts.now || new Date();
  var planned = planPendingNudges_(data, col, now);
  if (!planned.length) {
    Logger.log('pending nudge: none');
    return { nudged: [], emailed: false };
  }
  var links = {};
  var token = (typeof getAdminToken_ === 'function') ? getAdminToken_() : '';
  var baseUrl = '';
  try { baseUrl = ScriptApp.getService().getUrl(); } catch (err) { baseUrl = ''; }
  var i;
  for (i = 0; i < planned.length; i++) {
    if (typeof buildActivateLink_ === 'function') {
      links[planned[i].orderId] = buildActivateLink_(baseUrl, planned[i].orderId, token);
    }
  }
  var msg = buildPendingNudgeMessage_(planned, links);
  var emailed = false;
  if (!opts.dryRun) {
    try {
      MailApp.sendEmail({ to: msg.to, subject: msg.subject, htmlBody: msg.htmlBody });
      emailed = true;
    } catch (err) {
      Logger.log('pending nudge email: ' + err.message);
    }
    if (emailed) {
      for (i = 0; i < planned.length; i++) {
        var row1 = planned[i].rowIndex0 + 1;
        var notes = sheet.getRange(row1, col.NOTES + 1).getValue();
        sheet.getRange(row1, col.NOTES + 1).setValue(notesAppendMarker_(notes, PENDING_NUDGED_MARKER));
        syncLifecycleRow_(sheet, row1, opts);
      }
    }
  }
  Logger.log('pending nudge: ' + planned.map(function(p) { return p.orderId; }).join(', ') + ' emailed=' + emailed);
  return { nudged: planned.map(function(p) { return p.orderId; }), emailed: emailed };
}

function installPendingNudgeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pendingNudgeTrigger') {
      Logger.log('pendingNudgeTrigger already installed');
      return;
    }
  }
  ScriptApp.newTrigger('pendingNudgeTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(11)
    .inTimezone(LIFECYCLE_TZ)
    .create();
  Logger.log('Installed pendingNudgeTrigger at 11:00 ' + LIFECYCLE_TZ);
}

function autoExpireActiveOrders() {
  return runAutoExpireJob_({});
}

function runAutoExpireJob_(opts) {
  opts = opts || {};
  var sheet = lifecycleOrdersSheet_(opts);
  var col = applyColMapFromSheet_(sheet);
  var today = opts.today || new Date();
  var planned = planAutoExpires_(sheet.getDataRange().getValues(), col, today);
  var expired = [];
  for (var i = 0; i < planned.length; i++) {
    var row1 = planned[i].rowIndex0 + 1;
    sheet.getRange(row1, col.STATUS + 1).setValue('Expired');
    reapplyDaysLeft_(sheet, row1, col);
    syncLifecycleRow_(sheet, row1, opts);
    expired.push(planned[i].orderId);
  }
  Logger.log('autoExpire: ' + expired.join(', '));
  return { expired: expired };
}

function renewOrder(orderId) {
  return runRenewOrder_(orderId, {});
}

function runRenewOrder_(orderId, opts) {
  opts = opts || {};
  var oid = String(orderId || '').trim().toUpperCase();
  if (!oid) return { ok: false, reason: 'missing-order-id', sendCapi: false };
  var sheet = lifecycleOrdersSheet_(opts);
  var col = applyColMapFromSheet_(sheet);
  var row1 = (typeof findOrderRow === 'function') ? findOrderRow(sheet, oid, col) : null;
  if (!row1 && !opts.ordersName) {
    var masterName = (typeof TAB_MASTER !== 'undefined') ? TAB_MASTER : 'Master';
    var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(masterName);
    if (master) {
      col = applyColMapFromSheet_(master);
      row1 = findOrderRow(master, oid, col);
      if (row1) sheet = master;
    }
  }
  if (!row1) return { ok: false, reason: 'not-found', orderId: oid, sendCapi: false };
  var status = sheet.getRange(row1, col.STATUS + 1).getValue();
  var expiry = sheet.getRange(row1, col.EXPIRY + 1).getValue();
  var today = opts.today || new Date();
  var plan = planRenewOrder_(status, expiry, today);
  if (!plan.ok) return { ok: false, reason: plan.reason, orderId: oid, sendCapi: false };
  var notes = sheet.getRange(row1, col.NOTES + 1).getValue();
  sheet.getRange(row1, col.STATUS + 1).setValue(plan.newStatus);
  sheet.getRange(row1, col.EXPIRY + 1).setValue(plan.newExpiry);
  sheet.getRange(row1, col.NOTES + 1).setValue(notesAppendMarker_(notes, 'Renewed: ' + plan.newExpiry));
  reapplyDaysLeft_(sheet, row1, col);
  syncLifecycleRow_(sheet, row1, opts);
  return {
    ok: true,
    orderId: oid,
    newExpiry: plan.newExpiry,
    newStatus: plan.newStatus,
    sendCapi: false
  };
}

function sendCustomerRenewEmails() {
  return runCustomerRenewMailJob_({});
}

function runCustomerRenewMailJob_(opts) {
  opts = opts || {};
  var sheet = lifecycleOrdersSheet_(opts);
  var col = applyColMapFromSheet_(sheet);
  var today = opts.today || new Date();
  var planned = planCustomerRenewMails_(sheet.getDataRange().getValues(), col, today);
  var sent = [];
  if (opts.dryRun) {
    return { sent: [], planned: planned.map(function(p) { return p.orderId; }) };
  }
  for (var i = 0; i < planned.length; i++) {
    var item = planned[i];
    var msg = buildCustomerRenewMessage_(item);
    try {
      var sentOk = sendCustomerRenewEmail_(msg);
      if (!sentOk.ok) {
        throw new Error(sentOk.error || sentOk.reason || 'from-alias-failed');
      }
      var row1 = item.rowIndex0 + 1;
      var notes = sheet.getRange(row1, col.NOTES + 1).getValue();
      sheet.getRange(row1, col.NOTES + 1).setValue(notesAppendMarker_(notes, item.marker));
      syncLifecycleRow_(sheet, row1, opts);
      sent.push(item.orderId);
    } catch (err) {
      Logger.log('customer renew mail ' + item.orderId + ': ' + err.message);
    }
  }
  Logger.log('customer renew mail sent: ' + sent.join(', '));
  return { sent: sent, planned: planned.map(function(p) { return p.orderId; }) };
}

function expiryLifecycleTrigger() {
  try { sendCustomerRenewEmails(); } catch (err) {
    Logger.log('expiryLifecycle customer mail: ' + err.message);
  }
  try { autoExpireActiveOrders(); } catch (err2) {
    Logger.log('expiryLifecycle autoExpire: ' + err2.message);
  }
  try {
    if (typeof sendExpiryReminders === 'function') sendExpiryReminders();
  } catch (err3) {
    Logger.log('expiryLifecycle admin digest: ' + err3.message);
  }
  try {
    if (typeof runTelegramLifecycleHook_ === 'function') runTelegramLifecycleHook_();
  } catch (err4) {
    Logger.log('expiryLifecycle telegram: ' + err4.message);
  }
}

function installExpiryLifecycleTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'expiryLifecycleTrigger' || fn === 'expiryReminderTrigger') {
      Logger.log(fn + ' already installed (covers auto-expire + customer 3/2/1 + admin digest)');
      return;
    }
  }
  ScriptApp.newTrigger('expiryLifecycleTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .inTimezone(LIFECYCLE_TZ)
    .create();
  Logger.log('Installed expiryLifecycleTrigger at 10:00 ' + LIFECYCLE_TZ);
}

/* ── Safe self-checks (TEST_ tabs / TEST- order IDs only) ── */

function lifecycleResetTestSheet_(ss, name, headers) {
  if (typeof resetOrganizeTestSheet_ === 'function') {
    return resetOrganizeTestSheet_(ss, name, headers);
  }
  var sh = ss.getSheetByName(name);
  if (sh) {
    if (ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      sh = null;
    } else {
      sh.clear();
    }
  }
  return getOrCreateSheetWithHeaders_(ss, name, headers);
}

function testPendingNudge_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var orders = lifecycleResetTestSheet_(ss, 'TEST_Orders', headers);
  lifecycleResetTestSheet_(ss, 'TEST_Master', headers);
  var col = buildColMapFromHeaders_(headers);
  var old = new Date(Date.now() - 30 * 3600 * 1000);
  var r = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-NUDGE-1',
    name: 'Nudge Me',
    email: 'nudge@example.com',
    telegram: '@test_nudge',
    plan: 'Entry',
    amount: '$30',
    payment: 'Other',
    source: 'direct'
  }, old, false);
  r[col.STATUS] = 'Pending';
  r[col.TIMESTAMP] = old.toISOString();
  orders.appendRow(r);
  var planned = planPendingNudges_(orders.getDataRange().getValues(), col, new Date());
  if (planned.length !== 1 || planned[0].orderId !== 'TEST-MM-NUDGE-1') {
    throw new Error('FAIL pending nudge plan ' + JSON.stringify(planned));
  }
  var dry = runPendingNudgeJob_({
    ordersName: 'TEST_Orders',
    masterName: 'TEST_Master',
    dryRun: true,
    now: new Date()
  });
  if (dry.nudged.indexOf('TEST-MM-NUDGE-1') === -1) throw new Error('FAIL dry-run missed TEST-MM-NUDGE-1');
  Logger.log('PASS testPendingNudge_');
}

function testAutoExpire_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var orders = lifecycleResetTestSheet_(ss, 'TEST_Orders', headers);
  var master = lifecycleResetTestSheet_(ss, 'TEST_Master', headers);
  var col = buildColMapFromHeaders_(headers);
  var past = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-EXP-1',
    name: 'Past Active',
    email: 'past@example.com',
    telegram: '@test_past',
    plan: 'Entry',
    amount: '$30',
    payment: 'Other',
    source: 'direct'
  }, new Date(), false);
  past[col.STATUS] = 'Active';
  past[col.EXPIRY] = '2000-01-01';
  past[col.NOTES] = 'PURCHASE_SENT';
  orders.appendRow(past);
  upsertRowByOrderIdOnSheet_(master, past, col);
  var result = runAutoExpireJob_({
    ordersName: 'TEST_Orders',
    masterName: 'TEST_Master',
    today: new Date()
  });
  if (result.expired.indexOf('TEST-MM-EXP-1') === -1) throw new Error('FAIL did not expire TEST-MM-EXP-1');
  if (!findOrderRow(orders, 'TEST-MM-EXP-1')) throw new Error('FAIL auto-expire deleted the row');
  var st = orders.getRange(findOrderRow(orders, 'TEST-MM-EXP-1'), col.STATUS + 1).getValue();
  if (String(st) !== 'Expired') throw new Error('FAIL status ' + st);
  var mst = master.getRange(findOrderRow(master, 'TEST-MM-EXP-1'), col.STATUS + 1).getValue();
  if (String(mst) !== 'Expired') throw new Error('FAIL Master status ' + mst);
  var notes = orders.getRange(findOrderRow(orders, 'TEST-MM-EXP-1'), col.NOTES + 1).getValue();
  if (String(notes).indexOf('PURCHASE_SENT') === -1) throw new Error('FAIL PURCHASE_SENT lost');
  Logger.log('PASS testAutoExpire_');
}

function testRenewPlus30_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var orders = lifecycleResetTestSheet_(ss, 'TEST_Orders', headers);
  var master = lifecycleResetTestSheet_(ss, 'TEST_Master', headers);
  var col = buildColMapFromHeaders_(headers);
  var expired = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-REN-1',
    name: 'Renew Me',
    email: 'renew@example.com',
    telegram: '@test_ren',
    plan: 'Monthly',
    amount: '$15',
    payment: 'Other',
    source: 'direct'
  }, new Date(), false);
  expired[col.STATUS] = 'Expired';
  expired[col.EXPIRY] = '2000-01-01';
  expired[col.NOTES] = 'PURCHASE_SENT';
  orders.appendRow(expired);
  upsertRowByOrderIdOnSheet_(master, expired, col);
  var today = new Date();
  var result = runRenewOrder_('TEST-MM-REN-1', {
    ordersName: 'TEST_Orders',
    masterName: 'TEST_Master',
    today: today
  });
  if (!result.ok) throw new Error('FAIL renew ' + result.reason);
  if (result.sendCapi) throw new Error('FAIL renew must not send CAPI');
  var expect = computeRenewedExpiry_('2000-01-01', today);
  if (result.newExpiry !== expect) throw new Error('FAIL expiry ' + result.newExpiry + ' != ' + expect);
  var st = orders.getRange(findOrderRow(orders, 'TEST-MM-REN-1'), col.STATUS + 1).getValue();
  if (String(st) !== 'Active') throw new Error('FAIL renew status ' + st);
  var mst = master.getRange(findOrderRow(master, 'TEST-MM-REN-1'), col.STATUS + 1).getValue();
  if (String(mst) !== 'Active') throw new Error('FAIL Master not synced');
  Logger.log('PASS testRenewPlus30_ expiry=' + result.newExpiry);
}

function testCustomerRenewMail_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var orders = lifecycleResetTestSheet_(ss, 'TEST_Orders', headers);
  var col = buildColMapFromHeaders_(headers);
  var today = new Date();
  var in3 = lifecycleYmdAddDays_(lifecycleDhakaYmd_(today), 3);
  var r = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-MAIL-1',
    name: 'Mail Me',
    email: 'mailme@example.com',
    telegram: '@test_mail',
    plan: 'Entry',
    amount: '$30',
    payment: 'Other',
    source: 'direct'
  }, new Date(), false);
  r[col.STATUS] = 'Active';
  r[col.EXPIRY] = in3;
  r[col.NOTES] = 'PURCHASE_SENT';
  orders.appendRow(r);
  var planned = planCustomerRenewMails_(orders.getDataRange().getValues(), col, today);
  if (planned.length !== 1 || planned[0].marker !== 'RENEW_MAIL_3') {
    throw new Error('FAIL customer mail plan ' + JSON.stringify(planned));
  }
  var dry = runCustomerRenewMailJob_({
    ordersName: 'TEST_Orders',
    dryRun: true,
    today: today
  });
  if (dry.planned.indexOf('TEST-MM-MAIL-1') === -1) throw new Error('FAIL dry-run missed mail row');
  Logger.log('PASS testCustomerRenewMail_ (dry-run, no MailApp)');
}

function cleanupLifecycleTests_() {
  if (typeof cleanupOrganizeTests_ === 'function') {
    cleanupOrganizeTests_();
    return;
  }
  Logger.log('cleanupOrganizeTests_ missing — delete TEST_ tabs manually');
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    LIFECYCLE_ADMIN_EMAIL: LIFECYCLE_ADMIN_EMAIL,
    CUSTOMER_MAIL_FROM: CUSTOMER_MAIL_FROM,
    CUSTOMER_MAIL_FROM_NAME: CUSTOMER_MAIL_FROM_NAME,
    PENDING_NUDGED_MARKER: PENDING_NUDGED_MARKER,
    notesHasMarker_: notesHasMarker_,
    notesAppendMarker_: notesAppendMarker_,
    calendarDaysUntil_: calendarDaysUntil_,
    daysLeftFormulaUsesExpiryColumn_: daysLeftFormulaUsesExpiryColumn_,
    shouldNudgePending_: shouldNudgePending_,
    planPendingNudges_: planPendingNudges_,
    buildPendingNudgeMessage_: buildPendingNudgeMessage_,
    applyPendingNudgeMarkers_: applyPendingNudgeMarkers_,
    shouldExpire_: shouldExpire_,
    planAutoExpires_: planAutoExpires_,
    applyAutoExpiresToRows_: applyAutoExpiresToRows_,
    computeRenewedExpiry_: computeRenewedExpiry_,
    planRenewOrder_: planRenewOrder_,
    applyRenewToRow_: applyRenewToRow_,
    planCustomerRenewMails_: planCustomerRenewMails_,
    buildCustomerRenewMessage_: buildCustomerRenewMessage_,
    buildCustomerRenewMailOptions_: buildCustomerRenewMailOptions_,
    sendCustomerRenewEmail_: sendCustomerRenewEmail_,
    resolveCustomerCopyLang_: resolveCustomerCopyLang_,
    buildPremiumVipRenewCopy_: buildPremiumVipRenewCopy_,
    buildToneBRenewCopy_: buildToneBRenewCopy_,
    applyCustomerRenewMarkers_: applyCustomerRenewMarkers_
  };
}
