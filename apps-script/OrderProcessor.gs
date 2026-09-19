/**
 * THE METHOD MAFIA — Google Apps Script
 * =========================================
 * Drop this entire file into a new Apps Script project bound to
 * the same Google Sheet that receives orders from the website.
 *
 * SETUP (see GUIDE.md → PART 8 + PART 11 + PART 12):
 *  1. Extensions → Apps Script → paste this code
 *  2. Project Settings → Script properties → ADMIN_TOKEN (long random secret)
 *     or run setupAdminToken_("your-long-random-secret")
 *  3. Deploy → New deployment → Web App → Execute as: Me, Access: Anyone
 *  4. Copy the Web App URL into config.js → SHEET_URL
 *  5. Optional: run installDailyDigestTrigger (9am Asia/Dhaka)
 *
 * ── FEATURES ──────────────────────────────────────────────────
 *  • Accepts POST from website → writes new order row          (existing)
 *  • C2: Duplicate detection (same Telegram or Email)
 *  • C1: GET ?action=activate&orderId=MM-XXXX&token=<Script Properties>
 *        marks order Active + logs timestamp
 *  • Public GET ?action=status&orderId=MM-XXXX (no token, no PII)
 *  • C3: Daily digest email to DIGEST_EMAIL
 *  • C4: Expiry reminder email (members expiring in ≤3 days)
 *  • Phase 2A: Pending 24h nudge, Auto Expired, renew +30, customer 3/2/1 mail
 *    (Lifecycle.gs — pendingNudgeTrigger / expiryLifecycleTrigger / renewOrder)
 *  • CAPI: Status → Active (Entry) sends Purchase via CapiPurchase.gs
 *  • Organize: doPost also upserts Master + current YYYY-MM (SheetOrganize.gs)
 * ──────────────────────────────────────────────────────────────
 *
 * CRITICAL: Column order MUST match the LIVE Google Sheet CSV header:
 *   Timestamp,Order ID,Name,Email,Telegram,Plan,Amount,Source,Status,Expiry,Days Left,Payment,Notes,FBclid,TTclid
 * Medium/Campaign omitted (optional far-right append only). Do not scramble existing cells.
 * SheetOrganize.gs re-reads headers at runtime.
 */

/* ── CONFIG ───────────────────────────────────────────────── */
const SHEET_NAME   = 'Orders';          // Tab name in Google Sheet
/* PLACEHOLDER ONLY — not a live secret. getAdminToken_() ignores this value.
   Set Project Settings → Script properties → ADMIN_TOKEN, or run setupAdminToken_(). */
const ADMIN_TOKEN  = 'CHANGE_ME_NOW';
const DIGEST_EMAIL = 'methodmafia.hq@gmail.com';

/* Column indices (0-based) — LIVE production layout (2026-09-19).
   Medium/Campaign are optional and stay -1 unless those headers exist. */
const COL = {
  TIMESTAMP  : 0,   // A
  ORDER_ID   : 1,   // B
  NAME       : 2,   // C
  EMAIL      : 3,   // D
  TELEGRAM   : 4,   // E
  PLAN       : 5,   // F
  AMOUNT     : 6,   // G
  SOURCE     : 7,   // H  ← live (NOT Payment)
  STATUS     : 8,   // I
  EXPIRY     : 9,   // J
  DAYS_LEFT  : 10,  // K  ← formula-driven
  PAYMENT    : 11,  // L  ← live (after Days Left)
  NOTES      : 12,  // M
  FBCLID     : 13,  // N  ← Facebook click id (ads)
  TTCLID     : 14,  // O  ← TikTok click id (ads)
  MEDIUM     : -1,  // optional
  CAMPAIGN   : -1   // optional
};

/* ────────────────────────────────────────────────────────────
   ADMIN_TOKEN — Script Properties only (fail closed)
   ──────────────────────────────────────────────────────────── */
function isUsableAdminToken_(token) {
  var t = String(token == null ? '' : token).trim();
  if (!t) return false;
  if (t.toUpperCase() === 'CHANGE_ME_NOW') return false;
  return true;
}

function resolveAdminToken_(scriptPropValue) {
  var stored = String(scriptPropValue == null ? '' : scriptPropValue).trim();
  if (!isUsableAdminToken_(stored)) return '';
  return stored;
}

function getAdminToken_() {
  var stored = '';
  try {
    stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  } catch (err) {
    stored = '';
  }
  return resolveAdminToken_(stored);
}

function adminTokenMatches_(provided, stored) {
  if (!isUsableAdminToken_(stored)) return false;
  return String(provided || '') === stored;
}

function setupAdminToken_(token) {
  var value = String(arguments.length ? token : '').trim();
  if (!isUsableAdminToken_(value)) {
    throw new Error(
      'ADMIN_TOKEN missing or placeholder. Set Project Settings → Script properties → ADMIN_TOKEN ' +
      'to a long random string, or run setupAdminToken_("your-long-random-secret").'
    );
  }
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN', value);
  Logger.log('ADMIN_TOKEN stored in Script Properties. Do not paste it into GitHub or frontend JS.');
}

function classifyDoGetRequest_(params, storedToken) {
  params = params || {};
  var action = String(params.action || '').trim().toLowerCase();
  var orderId = String(params.orderId || '').trim().toUpperCase();
  if (action === 'status') {
    return { kind: 'status', orderId: orderId };
  }
  if (!adminTokenMatches_(params.token, storedToken)) {
    return { kind: 'unauthorized' };
  }
  if (action === 'activate' && orderId) return { kind: 'activate', orderId: orderId };
  if (action === 'digest') return { kind: 'digest' };
  if (action === 'expiry') return { kind: 'expiry' };
  if (action === 'renew' && orderId) return { kind: 'renew', orderId: orderId };
  if (action === 'pendingnudge' || action === 'pending_nudge') return { kind: 'pendingNudge' };
  if (action === 'autoexpire' || action === 'auto_expire') return { kind: 'autoExpire' };
  return { kind: 'help' };
}

function publicStatusSheetNames_() {
  var orders = (typeof SHEET_NAME !== 'undefined') ? SHEET_NAME : 'Orders';
  var master = (typeof TAB_MASTER !== 'undefined') ? TAB_MASTER : 'Master';
  var archive = (typeof TAB_ARCHIVE_REJECTED !== 'undefined') ? TAB_ARCHIVE_REJECTED : 'Archive_Rejected';
  return [orders, master, archive];
}

function buildPublicStatusPayload_(orderId, found, status, plan) {
  return {
    ok: true,
    found: !!found,
    orderId: String(orderId || '').toUpperCase(),
    status: found ? String(status == null ? '' : status) : '',
    plan: found ? String(plan == null ? '' : plan) : ''
  };
}

function publicStatusHasOnlySafeKeys_(payload) {
  var allowed = { ok: 1, found: 1, orderId: 1, status: 1, plan: 1 };
  var keys = Object.keys(payload || {});
  for (var i = 0; i < keys.length; i++) {
    if (!allowed[keys[i]]) return false;
  }
  return true;
}

function handlePublicStatus_(orderId) {
  var oid = String(orderId || '').toUpperCase();
  if (!oid) return buildPublicStatusPayload_('', false, '', '');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = publicStatusSheetNames_();
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (!sheet) continue;
    if (typeof applyColMapFromSheet_ === 'function') {
      try { applyColMapFromSheet_(sheet); } catch (mapErr) {
        Logger.log('public status colmap ' + names[i] + ': ' + mapErr.message);
      }
    }
    var row = findOrderRow(sheet, oid);
    if (!row) continue;
    var status = sheet.getRange(row, COL.STATUS + 1).getValue();
    var plan = sheet.getRange(row, COL.PLAN + 1).getValue();
    return buildPublicStatusPayload_(oid, true, status, plan);
  }
  return buildPublicStatusPayload_(oid, false, '', '');
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildActivateLink_(baseUrl, orderId, token) {
  if (!baseUrl || !orderId || !isUsableAdminToken_(token)) return '';
  return String(baseUrl) + '?action=activate&orderId=' +
    encodeURIComponent(orderId) + '&token=' + encodeURIComponent(token);
}

/* ────────────────────────────────────────────────────────────
   doPost — receives order form submission from website
   ──────────────────────────────────────────────────────────── */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
                  || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    var headers;
    var col;
    if (typeof readHeaders_ === 'function' && typeof LIVE_HEADERS !== 'undefined') {
      headers = readHeaders_(sheet);
      var headerDecision = planHeaderWrite_(headers, LIVE_HEADERS, sheet.getLastRow() > 1);
      if (headerDecision.write) {
        sheet.getRange(1, 1, 1, LIVE_HEADERS.length).setValues([LIVE_HEADERS]);
        sheet.setFrozenRows(1);
        headers = LIVE_HEADERS.slice();
      }
      col = applyColMapFromSheet_(sheet);
    } else {
      headers = [
        'Timestamp','Order ID','Name','Email','Telegram',
        'Plan','Amount','Source','Status','Expiry','Days Left',
        'Payment','Notes','FBclid','TTclid'
      ];
      col = COL;
    }

    /* C2: Duplicate detection (Orders + Master so archived rejects still flag) */
    const isDupe = checkDuplicate(sheet, data.telegram, data.email);

    const now = new Date();
    const row = (typeof buildOrderRowValues_ === 'function')
      ? buildOrderRowValues_(headers, col, data, now, isDupe)
      : fallbackLiveOrderRow_(data, now, isDupe);

    sheet.appendRow(row);
    const newRowNum = sheet.getLastRow();
    if (typeof applyDaysLeftFormulaOnSheet_ === 'function') {
      applyDaysLeftFormulaOnSheet_(sheet, newRowNum, col);
    } else if (col.DAYS_LEFT >= 0 && col.EXPIRY >= 0) {
      var expLetter = String.fromCharCode(65 + col.EXPIRY);
      sheet.getRange(newRowNum, col.DAYS_LEFT + 1)
           .setFormula('=IF(' + expLetter + newRowNum + '="","",' + expLetter + newRowNum + '-TODAY())');
    }

    var organizeOk = true;
    var organizeError = '';
    try {
      if (typeof upsertNewOrderToOrganizeTabs_ === 'function') {
        upsertNewOrderToOrganizeTabs_(sheet, newRowNum);
      } else {
        organizeOk = false;
        organizeError = 'SheetOrganize.gs missing';
      }
    } catch (orgErr) {
      organizeOk = false;
      organizeError = orgErr.message;
      Logger.log('doPost organize: ' + orgErr.message);
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      dupe: isDupe,
      organize: organizeOk,
      organizeError: organizeError || undefined
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: err.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function fallbackLiveOrderRow_(data, now, isDupe) {
  data = data || {};
  now = now || new Date();
  var expiry = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  return [
    now.toISOString(),
    data.orderId || '',
    data.name || '',
    data.email || '',
    data.telegram || '',
    data.plan || '',
    data.amount || '',
    data.source || 'direct',
    'Pending',
    expiry.toISOString().split('T')[0],
    '',
    data.payment || '',
    isDupe ? '⚠️ DUPLICATE' : '',
    data.fbclid || '',
    data.ttclid || ''
  ];
}

/* ────────────────────────────────────────────────────────────
   doGet — public status (no token) + admin actions (Script Properties token)
   Usage: GET ?action=status&orderId=MM-2026-1234
          GET ?action=activate&orderId=MM-2026-1234&token=<Script Properties ADMIN_TOKEN>
   ──────────────────────────────────────────────────────────── */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const stored = getAdminToken_();
  const route  = classifyDoGetRequest_(params, stored);

  /* Public order status for the website — BEFORE any admin token check.
     JSON only: {ok, found, orderId, status, plan}. No email/Telegram/PII. */
  if (route.kind === 'status') {
    try {
      return jsonResponse_(handlePublicStatus_(route.orderId));
    } catch (err) {
      Logger.log('public status: ' + err.message);
      return jsonResponse_({
        ok: false,
        found: false,
        orderId: String(route.orderId || '').toUpperCase(),
        status: '',
        plan: ''
      });
    }
  }

  if (route.kind === 'unauthorized') {
    return htmlResponse('<h2>❌ Unauthorized</h2><p>Wrong token.</p>');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
                || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  applyColMapFromSheet_(sheet);
  const orderId = route.orderId || '';

  /* ── C1: Mark order Active ── */
  if (route.kind === 'activate' && orderId) {
    const row = findOrderRow(sheet, orderId);
    if (!row) {
      return htmlResponse('<h2>❌ Not Found</h2><p>Order ID <strong>' + orderId + '</strong> not found.</p>');
    }
    sheet.getRange(row, COL.STATUS + 1).setValue('Active');
    var prevNotes = sheet.getRange(row, COL.NOTES + 1).getValue();
    var activated = 'Activated: ' + new Date().toLocaleString();
    sheet.getRange(row, COL.NOTES + 1).setValue(
      prevNotes ? (String(prevNotes) + ' | ' + activated) : activated
    );

    /* Primary Purchase: Meta CAPI + TikTok Events API (Entry only, $30) */
    try { trySendPurchaseForRow_(sheet, row); } catch (err) {
      Logger.log('activate CAPI: ' + err.message);
    }
    try { syncOrderRowToOrganizeTabs_(sheet, row); } catch (orgErr) {
      Logger.log('activate organize: ' + orgErr.message);
    }

    /* Optional backup: confirmed URL still fires browser Purchase if the customer opens it */
    const plan     = sheet.getRange(row, COL.PLAN + 1).getValue();
    const confirmUrl = 'https://themethodmafia.com/order-status.html?orderId='
                     + encodeURIComponent(orderId)
                     + '&confirmed=1&plan='
                     + encodeURIComponent(plan);

    return htmlResponse(
      '<h2>✅ Order Activated</h2>' +
      '<p>Order <strong>' + orderId + '</strong> is now <strong>Active</strong>.</p>' +
      '<hr>' +
      '<h3>📤 Send this link to the customer:</h3>' +
      '<p style="word-break:break-all;background:#f5f5f5;padding:12px;border-radius:6px;">' +
        '<a href="' + confirmUrl + '">' + confirmUrl + '</a>' +
      '</p>' +
      '<p style="color:#555;font-size:13px">Purchase is already sent from this sheet (Status → Active). The link below is only an optional backup if you also want the customer browser pixel to fire.</p>'
    );
  }

  /* ── Digest on demand ── */
  if (route.kind === 'digest') {
    sendDailyDigest();
    return htmlResponse('<h2>✅ Digest sent to ' + DIGEST_EMAIL + '</h2>');
  }

  /* ── Expiry check on demand (customer 3/2/1 + auto-expire + admin digest) ── */
  if (route.kind === 'expiry') {
    if (typeof expiryLifecycleTrigger === 'function') {
      expiryLifecycleTrigger();
    } else {
      sendExpiryReminders();
    }
    return htmlResponse('<h2>✅ Expiry lifecycle ran (customer mail + auto-expire + admin digest)</h2>');
  }

  /* ── Renew +30 (Active/Expired only). Does NOT send CAPI Purchase. ── */
  if (route.kind === 'renew' && orderId) {
    if (typeof renewOrder !== 'function') {
      return htmlResponse('<h2>❌ Lifecycle.gs missing</h2><p>Paste <code>apps-script/Lifecycle.gs</code> then Deploy → New version.</p>');
    }
    var renewed = renewOrder(orderId);
    if (!renewed.ok) {
      if (renewed.reason === 'not-found') {
        return htmlResponse('<h2>❌ Not Found</h2><p>Order ID <strong>' + orderId + '</strong> not found.</p>');
      }
      return htmlResponse(
        '<h2>❌ Cannot renew</h2><p>Order <strong>' + orderId +
        '</strong> must be Active or Expired (reason: ' + (renewed.reason || 'not-renewable') + ').</p>'
      );
    }
    return htmlResponse(
      '<h2>✅ Renewed +30</h2>' +
      '<p>Order <strong>' + orderId + '</strong> is <strong>Active</strong> until <strong>' +
      renewed.newExpiry + '</strong>.</p>' +
      '<p style="color:#555;font-size:13px">No ads Purchase was sent (renew is not a new Entry $30).</p>'
    );
  }

  if (route.kind === 'pendingNudge') {
    if (typeof runPendingNudgeJob_ !== 'function') {
      return htmlResponse('<h2>❌ Lifecycle.gs missing</h2>');
    }
    var nudge = runPendingNudgeJob_({});
    var ids = (nudge.nudged || []).join(', ');
    if (!nudge.nudged || !nudge.nudged.length) {
      return htmlResponse('<h2>Pending 24h nudge</h2><p>No Pending rows older than 24 hours.</p>');
    }
    if (!nudge.emailed) {
      return htmlResponse(
        '<h2>⚠️ Pending nudge email failed</h2>' +
        '<p>Would have nudged: <strong>' + ids + '</strong>.</p>' +
        '<p>Notes were <em>not</em> stamped with PENDING_NUDGED. Check MailApp quota / authorization.</p>'
      );
    }
    return htmlResponse('<h2>✅ Pending 24h nudge</h2><p>Emailed ' + DIGEST_EMAIL + '. Nudged: ' + ids + '</p>');
  }

  if (route.kind === 'autoExpire') {
    if (typeof autoExpireActiveOrders !== 'function') {
      return htmlResponse('<h2>❌ Lifecycle.gs missing</h2>');
    }
    var expired = autoExpireActiveOrders();
    return htmlResponse('<h2>✅ Auto Expired</h2><p>Expired: ' + (expired.expired || []).join(', ') + '</p>');
  }

  return htmlResponse('<h2>Method Mafia Admin</h2><p>Available actions: activate, digest, expiry, renew, pendingNudge, autoExpire</p>');
}

/* ────────────────────────────────────────────────────────────
   C2: Duplicate detection
   ──────────────────────────────────────────────────────────── */
function checkDuplicate(sheet, telegram, email) {
  const tables = [sheet.getDataRange().getValues()];
  try {
    const master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_MASTER);
    if (master && master.getSheetId() !== sheet.getSheetId()) {
      tables.push(master.getDataRange().getValues());
    }
  } catch (err) {
    Logger.log('checkDuplicate Master: ' + err.message);
  }
  const col = (typeof applyColMapFromSheet_ === 'function') ? applyColMapFromSheet_(sheet) : COL;
  if (typeof checkDuplicateInTables_ === 'function') {
    return checkDuplicateInTables_(tables, col, telegram, email);
  }
  const tgLower = String(telegram || '').toLowerCase().replace(/^@/, '');
  const emlLower = String(email || '').toLowerCase();
  for (let t = 0; t < tables.length; t++) {
    const data = tables[t] || [];
    for (let i = 1; i < data.length; i++) {
      const rowTg = String(data[i][col.TELEGRAM] || '').toLowerCase().replace(/^@/, '');
      const rowEml = String(data[i][col.EMAIL] || '').toLowerCase();
      if ((tgLower && rowTg === tgLower) || (emlLower && rowEml === emlLower)) return true;
    }
  }
  return false;
}

/* ────────────────────────────────────────────────────────────
   C3: Daily Order Digest
   Set up a time-driven trigger: Triggers → dailyDigestTrigger → Time-driven → Day timer → 9am
   ──────────────────────────────────────────────────────────── */
function dailyDigestTrigger() {
  sendDailyDigest();
}

/** Optional installer: 9:00 Asia/Dhaka daily. Safe to run more than once. */
function installDailyDigestTrigger() {
  var tz = (typeof ORGANIZE_TZ !== 'undefined') ? ORGANIZE_TZ : 'Asia/Dhaka';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyDigestTrigger') {
      Logger.log('dailyDigestTrigger already installed');
      return;
    }
  }
  ScriptApp.newTrigger('dailyDigestTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone(tz)
    .create();
  Logger.log('Installed dailyDigestTrigger at 09:00 ' + tz);
}

function sendDailyDigest() {
  const sheet    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
                   || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  applyColMapFromSheet_(sheet);
  const data     = sheet.getDataRange().getValues();
  const today    = new Date();
  today.setHours(0,0,0,0);
  const yesterday = new Date(today.getTime() - 86400000);

  const todayOrders    = [];
  const pendingOrders  = [];
  let   activeCount    = 0;

  for (let i = 1; i < data.length; i++) {
    const rowDate  = new Date(data[i][COL.TIMESTAMP]);
    const status   = (data[i][COL.STATUS] || '').toString();
    if (rowDate >= yesterday && rowDate < today) {
      todayOrders.push(data[i]);
    }
    if (status === 'Pending') pendingOrders.push(data[i]);
    if (status === 'Active')  activeCount++;
  }

  const subject = '[Method Mafia] Daily Digest — ' + today.toDateString();
  let body = '<h2>Method Mafia Daily Digest</h2>';
  body += '<p><strong>Date:</strong> ' + today.toDateString() + '</p>';
  body += '<p><strong>Active members:</strong> ' + activeCount + '</p>';
  body += '<p><strong>New orders (last 24h):</strong> ' + todayOrders.length + '</p>';
  body += '<p><strong>Pending (awaiting payment):</strong> ' + pendingOrders.length + '</p>';

  if (todayOrders.length > 0) {
    body += '<h3>New Orders</h3><table border="1" cellpadding="6" style="border-collapse:collapse">';
    body += '<tr><th>Order ID</th><th>Name</th><th>Telegram</th><th>Plan</th><th>Payment</th><th>Source</th><th>Medium</th><th>Campaign</th></tr>';
    todayOrders.forEach(r => {
      body += '<tr><td>' + r[COL.ORDER_ID] + '</td><td>' + r[COL.NAME] + '</td>'
            + '<td>' + r[COL.TELEGRAM] + '</td><td>' + r[COL.PLAN] + '</td>'
            + '<td>' + r[COL.PAYMENT] + '</td><td>' + (r[COL.SOURCE]||'direct') + '</td>'
            + '<td>' + (COL.MEDIUM >= 0 ? (r[COL.MEDIUM]||'') : '') + '</td>'
            + '<td>' + (COL.CAMPAIGN >= 0 ? (r[COL.CAMPAIGN]||'') : '') + '</td></tr>';
    });
    body += '</table>';
  }

  if (pendingOrders.length > 0) {
    body += '<h3>⏳ Pending — Action Required</h3>';
    body += '<p>These orders are waiting for payment confirmation:</p>';
    body += '<ul>';
    pendingOrders.slice(0, 20).forEach(r => {
      body += '<li><strong>' + r[COL.ORDER_ID] + '</strong> — ' + r[COL.NAME]
            + ' (' + r[COL.TELEGRAM] + ') — ' + r[COL.PLAN] + '</li>';
    });
    body += '</ul>';

    /* C1: Include 1-click activation links (Script Properties token) */
    const adminToken = getAdminToken_();
    if (isUsableAdminToken_(adminToken)) {
      const baseUrl = ScriptApp.getService().getUrl();
      body += '<h3>1-Click Activate</h3>';
      body += '<p>Click to mark an order Active and get the customer confirmation URL:</p><ul>';
      pendingOrders.slice(0, 10).forEach(r => {
        const url = buildActivateLink_(baseUrl, r[COL.ORDER_ID], adminToken);
        if (url) {
          body += '<li><a href="' + url + '">Activate ' + r[COL.ORDER_ID] + ' — ' + r[COL.NAME] + '</a></li>';
        }
      });
      body += '</ul>';
    } else {
      body += '<p><em>Activate links omitted — set Script properties ADMIN_TOKEN (or run setupAdminToken_).</em></p>';
    }
  }

  try {
    MailApp.sendEmail({ to: DIGEST_EMAIL, subject: subject, htmlBody: body });
  } catch (err) {
    Logger.log('Digest email error: ' + err.message);
  }
}

/* ────────────────────────────────────────────────────────────
   C4: Expiry Reminders
   Set up a time-driven trigger: Triggers → expiryReminderTrigger → Time-driven → Day timer → 10am
   ──────────────────────────────────────────────────────────── */
function expiryReminderTrigger() {
  if (typeof expiryLifecycleTrigger === 'function') {
    expiryLifecycleTrigger();
    return;
  }
  sendExpiryReminders();
}

function sendExpiryReminders() {
  const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
                 || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  applyColMapFromSheet_(sheet);
  const data   = sheet.getDataRange().getValues();
  const today  = new Date();
  today.setHours(0,0,0,0);

  let expiringSoon  = [];
  let expiredToday  = [];

  for (let i = 1; i < data.length; i++) {
    const status  = (data[i][COL.STATUS] || '').toString();
    const expiry  = data[i][COL.EXPIRY];
    if (status !== 'Active' || !expiry) continue;

    const expiryDate = new Date(expiry);
    expiryDate.setHours(0,0,0,0);
    const daysLeft = Math.round((expiryDate - today) / 86400000);

    if (daysLeft === 3) expiringSoon.push({ row: i+1, data: data[i], daysLeft: 3 });
    if (daysLeft === 0) expiredToday.push({ row: i+1, data: data[i], daysLeft: 0 });
  }

  if (expiringSoon.length === 0 && expiredToday.length === 0) return;

  let body = '<h2>Method Mafia — Expiry Reminders</h2>';
  body += '<p><strong>Date:</strong> ' + today.toDateString() + '</p>';

  if (expiringSoon.length > 0) {
    body += '<h3>⚠️ Expiring in 3 days (' + expiringSoon.length + ')</h3>';
    body += '<p>Send renewal reminders to these members:</p><ul>';
    expiringSoon.forEach(m => {
      body += '<li><strong>' + m.data[COL.TELEGRAM] + '</strong> — ' + m.data[COL.NAME]
            + ' (expires ' + m.data[COL.EXPIRY] + ')</li>';
    });
    body += '</ul>';
  }

  if (expiredToday.length > 0) {
    body += '<h3>🔴 Expired today (' + expiredToday.length + ')</h3>';
    body += '<p>Remove from VIP channel and update status:</p><ul>';
    expiredToday.forEach(m => {
      body += '<li><strong>' + m.data[COL.TELEGRAM] + '</strong> — ' + m.data[COL.NAME] + '</li>';
    });
    body += '</ul>';
  }

  try {
    MailApp.sendEmail({ to: DIGEST_EMAIL, subject: '[Method Mafia] Expiry Reminders — ' + today.toDateString(), htmlBody: body });
  } catch (err) {
    Logger.log('Expiry email error: ' + err.message);
  }
}

/* ────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────── */
function findOrderRow(sheet, orderId, col) {
  col = col || COL;
  const want = String(orderId || '').toUpperCase();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][col.ORDER_ID] || '').toString().toUpperCase() === want) return i + 1;
  }
  return null;
}

function htmlResponse(html) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 20px}' +
    'a{color:#e67e00}hr{margin:20px 0}h3{margin-top:22px}' +
    '</style></head><body>' + html + '</body></html>'
  );
}

/* ────────────────────────────────────────────────────────────
   One-time setup: create sheet headers if empty
   Run manually from the Apps Script editor once.
   ──────────────────────────────────────────────────────────── */
function setupSheetHeaders() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  const headers = (typeof LIVE_HEADERS !== 'undefined') ? LIVE_HEADERS.slice() : [
    'Timestamp','Order ID','Name','Email','Telegram',
    'Plan','Amount','Source','Status','Expiry','Days Left',
    'Payment','Notes','FBclid','TTclid'
  ];

  const existing = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  const hasData = sheet.getLastRow() > 1;
  const decision = planHeaderWrite_(existing, headers, hasData);
  if (!decision.write) {
    Logger.log('setupSheetHeaders skipped (' + decision.reason + '). Live header order kept.');
    return;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
       .setBackground('#2c2c2c')
       .setFontColor('#FFD700')
       .setFontWeight('bold');

  Logger.log('Headers set up on sheet: ' + SHEET_NAME);
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    SHEET_NAME: SHEET_NAME,
    ADMIN_TOKEN: ADMIN_TOKEN,
    DIGEST_EMAIL: DIGEST_EMAIL,
    COL: COL,
    isUsableAdminToken_: isUsableAdminToken_,
    resolveAdminToken_: resolveAdminToken_,
    adminTokenMatches_: adminTokenMatches_,
    classifyDoGetRequest_: classifyDoGetRequest_,
    publicStatusSheetNames_: publicStatusSheetNames_,
    buildPublicStatusPayload_: buildPublicStatusPayload_,
    publicStatusHasOnlySafeKeys_: publicStatusHasOnlySafeKeys_,
    buildActivateLink_: buildActivateLink_
  };
}
