/**
 * THE METHOD MAFIA — Google Apps Script
 * =========================================
 * Drop this entire file into a new Apps Script project bound to
 * the same Google Sheet that receives orders from the website.
 *
 * SETUP (see GUIDE.md → Apps Script):
 *  1. Extensions → Apps Script → paste this code
 *  2. Set SHEET_NAME, ADMIN_TOKEN, DIGEST_EMAIL constants below
 *  3. Deploy → New deployment → Web App → Execute as: Me, Access: Anyone
 *  4. Copy the Web App URL into config.js → SHEET_URL
 *  5. For digest/expiry triggers: Triggers → Add → Time-driven
 *
 * ── FEATURES ──────────────────────────────────────────────────
 *  • Accepts POST from website → writes new order row          (existing)
 *  • C2: Duplicate detection (same Telegram or Email)
 *  • C1: GET ?action=activate&orderId=MM-XXXX&token=ADMIN_TOKEN
 *        marks order Active + logs timestamp
 *  • C3: Daily digest email to DIGEST_EMAIL
 *  • C4: Expiry reminder email (members expiring in ≤3 days)
 *  • CAPI: Status → Active (Entry) sends Purchase via CapiPurchase.gs
 *  • Organize: doPost also upserts Master + current YYYY-MM (SheetOrganize.gs)
 * ──────────────────────────────────────────────────────────────
 *
 * CRITICAL: Column order MUST match the LIVE Google Sheet header:
 *   Timestamp, Order ID, Name, Email, Telegram, Plan, Amount,
 *   Source, Status, Expiry, Days Left, Payment, Notes, FBclid, TTclid
 * Wrong indices scramble rows. SheetOrganize.gs re-reads headers at runtime.
 */

/* ── CONFIG ───────────────────────────────────────────────── */
const SHEET_NAME   = 'Orders';          // Tab name in Google Sheet
const ADMIN_TOKEN  = 'CHANGE_ME_NOW';   // Replace with a long random string (e.g. from random.org)
const DIGEST_EMAIL = 'info@themethodmafia.com';

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
   doPost — receives order form submission from website
   ──────────────────────────────────────────────────────────── */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
                  || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    var headers = readHeaders_(sheet);
    var headerDecision = planHeaderWrite_(headers, LIVE_HEADERS, sheet.getLastRow() > 1);
    if (headerDecision.write) {
      sheet.getRange(1, 1, 1, LIVE_HEADERS.length).setValues([LIVE_HEADERS]);
      sheet.setFrozenRows(1);
      headers = LIVE_HEADERS.slice();
    }
    const col = applyColMapFromSheet_(sheet);

    /* C2: Duplicate detection (Orders + Master so archived rejects still flag) */
    const isDupe = checkDuplicate(sheet, data.telegram, data.email);

    const now = new Date();
    const row = buildOrderRowValues_(headers, col, data, now, isDupe);

    sheet.appendRow(row);
    const newRowNum = sheet.getLastRow();
    applyDaysLeftFormulaOnSheet_(sheet, newRowNum, col);

    /* Master + current YYYY-MM. CAPI still only fires on Active/Entry. */
    try { upsertNewOrderToOrganizeTabs_(sheet, newRowNum); } catch (orgErr) {
      Logger.log('doPost organize: ' + orgErr.message);
    }

    return ContentService.createTextOutput(JSON.stringify({ok: true, dupe: isDupe}))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: err.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ────────────────────────────────────────────────────────────
   doGet — admin actions via URL
   Usage: GET ?action=activate&orderId=MM-2026-1234&token=ADMIN_TOKEN
          GET ?action=confirm&orderId=MM-2026-1234&plan=Entry&token=ADMIN_TOKEN
   ──────────────────────────────────────────────────────────── */
function doGet(e) {
  const params  = e.parameter;
  const token   = params.token || '';
  const action  = params.action || '';
  const orderId = (params.orderId || '').toUpperCase();

  /* Security: reject wrong token */
  if (token !== ADMIN_TOKEN) {
    return htmlResponse('<h2>❌ Unauthorized</h2><p>Wrong token.</p>');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
                || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  applyColMapFromSheet_(sheet);

  /* ── C1: Mark order Active ── */
  if (action === 'activate' && orderId) {
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
  if (action === 'digest') {
    sendDailyDigest();
    return htmlResponse('<h2>✅ Digest sent to ' + DIGEST_EMAIL + '</h2>');
  }

  /* ── Expiry check on demand ── */
  if (action === 'expiry') {
    sendExpiryReminders();
    return htmlResponse('<h2>✅ Expiry reminders sent</h2>');
  }

  return htmlResponse('<h2>Method Mafia Admin</h2><p>Available actions: activate, digest, expiry</p>');
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
  return checkDuplicateInTables_(tables, col, telegram, email);
}

/* ────────────────────────────────────────────────────────────
   C3: Daily Order Digest
   Set up a time-driven trigger: Triggers → dailyDigestTrigger → Time-driven → Day timer → 9am
   ──────────────────────────────────────────────────────────── */
function dailyDigestTrigger() {
  sendDailyDigest();
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

    /* C1: Include 1-click activation links */
    const baseUrl = ScriptApp.getService().getUrl();
    body += '<h3>1-Click Activate</h3>';
    body += '<p>Click to mark an order Active and get the customer confirmation URL:</p><ul>';
    pendingOrders.slice(0, 10).forEach(r => {
      const url = baseUrl + '?action=activate&orderId=' + encodeURIComponent(r[COL.ORDER_ID]) + '&token=' + ADMIN_TOKEN;
      body += '<li><a href="' + url + '">Activate ' + r[COL.ORDER_ID] + ' — ' + r[COL.NAME] + '</a></li>';
    });
    body += '</ul>';
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
function findOrderRow(sheet, orderId) {
  const want = String(orderId || '').toUpperCase();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][COL.ORDER_ID] || '').toString().toUpperCase() === want) return i + 1;
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
