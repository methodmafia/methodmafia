/**
 * THE METHOD MAFIA — @MM_OrdersBot (Option A, Swa locked)
 * ========================================================
 * ONE bot only. Bound to the same Apps Script project as OrderProcessor.gs
 * + CapiPurchase.gs (and Lifecycle.gs / SheetOrganize.gs when those are pasted).
 *
 * Token: Script Properties TELEGRAM_BOT_TOKEN only (or process env in tests).
 *        Never hardcode. Run setupAdminBotToken_("token-from-BotFather").
 *
 * Admin confirm chat: 7581392046 (bot DMs this chat). @MMHQ_Support is human
 * support — humans verify the payment screenshot, then tap bot ✅.
 *
 * Flows:
 *   1) New Pending order → admin DM with ✅. Confirm → Status Active
 *      + trySendPurchaseForRow_ (Entry $30 CAPI) + one-time VIP invite
 *      (createChatInviteLink member_limit=1). NEVER post the link in VIP/public.
 *   2) Pay/renew reminders → customer Telegram (email path stays in Lifecycle.gs).
 *      Copy is LOCKED 2026-09-21 Premium VIP pack ($15). Language column
 *      en|bn|hi, default EN. Telegram shorts are compressed from the locked
 *      email bodies only (no new FOMO lines). Dedupe RENEW_TG_3/_2/_1.
 *      Pending-pay is Entry-only (no $15). Legacy ~3100 VIP members are never
 *      messaged by kick jobs.
 *   3) Kick jobs apply ONLY to members who entered via this new system
 *      (website order → pay → admin ✅ → Active + CAPI $30 + one-time VIP
 *      invite) and are now Sheet Expired. ALWAYS a confirm list, then admin ✅
 *      before any banChatMember. Never auto-kick.
 *      ALL existing VIP members (~3000 social-proof) stay untouched forever.
 *      Blind sync is FORBIDDEN forever. Never mass-sync / never kick legacy.
 *      Optional gated path: post-VIP_BASELINE_DATE unpaid joiners — default OFF
 *      (VIP_KICK_UNPAID_JOINERS). Never touch pre-baseline members.
 *      Default VIP_BASELINE_DATE = 2026-09-19 (Asia/Dhaka go-live); Swa can change.
 *
 * See GUIDE.md → PART 13. Run setupVipBaselineDate_("2026-09-19").
 */

var TELEGRAM_ADMIN_CHAT_ID = '7581392046';
var TELEGRAM_BOT_USERNAME = 'MM_OrdersBot';
var TELEGRAM_API = 'https://api.telegram.org/bot';
var PAY_TG_MARKER = 'PAY_TG_SENT';
var RENEW_TG_MARKERS = { 3: 'RENEW_TG_3', 2: 'RENEW_TG_2', 1: 'RENEW_TG_1' };
var KICK_ASKED_MARKER = 'KICK_ASKED';
var KICKED_MARKER = 'KICKED';
var VIP_SENT_MARKER = 'VIP_INVITE_SENT';
var BOT_CONFIRMED_MARKER = 'BOT_CONFIRMED';
var PAY_TG_MS = 24 * 60 * 60 * 1000;
var TG_JOIN_LOG_PROP = 'TG_VIP_JOIN_LOG';
var TG_PENDING_KICK_PROP = 'TG_PENDING_KICK_LIST';
var DEFAULT_VIP_BASELINE_DATE = '2026-09-19';

var TG_HEADER_ALIASES = {
  'timestamp': 'TIMESTAMP',
  'order id': 'ORDER_ID',
  'orderid': 'ORDER_ID',
  'name': 'NAME',
  'email': 'EMAIL',
  'telegram': 'TELEGRAM',
  'plan': 'PLAN',
  'amount': 'AMOUNT',
  'source': 'SOURCE',
  'status': 'STATUS',
  'expiry': 'EXPIRY',
  'days left': 'DAYS_LEFT',
  'payment': 'PAYMENT',
  'notes': 'NOTES',
  'fbclid': 'FBCLID',
  'ttclid': 'TTCLID',
  'medium': 'MEDIUM',
  'campaign': 'CAMPAIGN',
  'language': 'LANGUAGE'
};

/* ── Token (never hardcode) ─────────────────────────────── */

function isUsableTelegramToken_(token) {
  var t = String(token == null ? '' : token).trim();
  if (!t) return false;
  if (/change[_-]?me/i.test(t)) return false;
  return true;
}

function resolveTelegramBotToken_(scriptPropValue, envValue) {
  if (isUsableTelegramToken_(scriptPropValue)) return String(scriptPropValue).trim();
  if (isUsableTelegramToken_(envValue)) return String(envValue).trim();
  return '';
}

function getTelegramBotTokenFromSources_(props, env) {
  props = props || {};
  env = env || {};
  return resolveTelegramBotToken_(props.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_TOKEN);
}

function getTelegramBotToken_() {
  var stored = '';
  try {
    stored = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  } catch (err) {
    stored = '';
  }
  var env = {};
  try {
    if (typeof process === 'object' && process && process.env) env = process.env;
  } catch (envErr) {
    env = {};
  }
  return getTelegramBotTokenFromSources_({ TELEGRAM_BOT_TOKEN: stored }, env);
}

function setupAdminBotToken_(token) {
  var value = String(arguments.length ? token : '').trim();
  if (!isUsableTelegramToken_(value)) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN missing or placeholder. Set Project Settings → Script properties → TELEGRAM_BOT_TOKEN ' +
      'to the BotFather token for @MM_OrdersBot, or run setupAdminBotToken_("token-from-BotFather"). ' +
      'Never commit the token to GitHub.'
    );
  }
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_BOT_TOKEN', value);
  Logger.log('TELEGRAM_BOT_TOKEN stored in Script Properties. Do not paste it into GitHub or frontend JS.');
}

function getTelegramProp_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (err) {
    return '';
  }
}

function getTelegramWebhookSecret_() {
  return String(getTelegramProp_('TELEGRAM_WEBHOOK_SECRET') || '').trim();
}

function getTelegramVipChatId_() {
  return String(getTelegramProp_('TELEGRAM_VIP_CHAT_ID') || '').trim();
}

function parseVipBaselineDate_(value) {
  var s = String(value == null ? '' : value).trim();
  if (!s) return { ok: false, reason: 'missing-baseline' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, reason: 'invalid-baseline' };
  var y = Number(s.slice(0, 4));
  var mo = Number(s.slice(5, 7));
  var d = Number(s.slice(8, 10));
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, reason: 'invalid-baseline' };
  }
  return { ok: true, ymd: s };
}

function resolveVipBaselineYmd_(value) {
  var parsed = parseVipBaselineDate_(value);
  if (parsed.ok) return parsed.ymd;
  return DEFAULT_VIP_BASELINE_DATE;
}

function parseKickUnpaidJoinersFlag_(value) {
  var s = String(value == null ? '' : value).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function setupVipBaselineDate_(ymd) {
  var parsed = parseVipBaselineDate_(ymd);
  if (!parsed.ok) {
    throw new Error(
      'VIP_BASELINE_DATE must be ISO YYYY-MM-DD on the Asia/Dhaka calendar, e.g. 2026-09-19. ' +
      'Default go-live is 2026-09-19. Legacy VIP members are never mass-kicked. Reason: ' + parsed.reason
    );
  }
  PropertiesService.getScriptProperties().setProperty('VIP_BASELINE_DATE', parsed.ymd);
  Logger.log(
    'VIP_BASELINE_DATE=' + parsed.ymd +
    ' (Asia/Dhaka). Blind sync is forbidden forever — existing VIP members stay untouched.'
  );
  return parsed.ymd;
}

function getVipBaselineDate_() {
  return resolveVipBaselineYmd_(getTelegramProp_('VIP_BASELINE_DATE'));
}

function getVipKickUnpaidJoiners_() {
  return parseKickUnpaidJoinersFlag_(getTelegramProp_('VIP_KICK_UNPAID_JOINERS'));
}

function telegramWebhookAuthorized_(providedSecret, storedSecret) {
  var stored = String(storedSecret == null ? '' : storedSecret).trim();
  if (!stored) return true;
  return String(providedSecret == null ? '' : providedSecret) === stored;
}

function telegramSecretFromEvent_(e) {
  e = e || {};
  var headers = e.headers || {};
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === 'x-telegram-bot-api-secret-token') {
      return headers[keys[i]];
    }
  }
  if (e.parameter && e.parameter.tg_secret) return e.parameter.tg_secret;
  return '';
}

/* ── Identity / parsing ─────────────────────────────────── */

function isTelegramUpdate_(body) {
  return !!(body && typeof body === 'object' && body.update_id != null);
}

function isTelegramAdminChat_(id) {
  return String(id == null ? '' : id) === String(TELEGRAM_ADMIN_CHAT_ID);
}

function authorizeAdminCallback_(ids) {
  ids = ids || {};
  if (isTelegramAdminChat_(ids.fromId) || isTelegramAdminChat_(ids.chatId)) {
    return { ok: true };
  }
  return { ok: false, reason: 'not-admin' };
}

function parseCallbackData_(data) {
  var s = String(data || '');
  var list = /^L:(ok|no)$/.exec(s);
  if (list) {
    return {
      action: list[1] === 'ok' ? 'kick-list-confirm' : 'kick-list-cancel',
      orderId: ''
    };
  }
  var m = /^(c|x|k|n):([A-Za-z0-9_-]+)$/.exec(s);
  if (!m) return null;
  var names = { c: 'confirm', x: 'dismiss', k: 'kick', n: 'kick-cancel' };
  return { action: names[m[1]], orderId: m[2].toUpperCase() };
}

function parseStartCommand_(text) {
  var m = /^\/start(?:@\w+)?(?:\s+(.+))?$/i.exec(String(text || '').trim());
  if (!m) return null;
  var payload = String(m[1] || '').trim().replace(/_/g, '-').toUpperCase();
  return { orderId: payload };
}

function tgNotesHasMarker_(notes, marker) {
  var hay = String(notes || '').toUpperCase();
  var needle = String(marker || '').toUpperCase();
  if (!needle) return false;
  return hay.indexOf(needle) !== -1;
}

function tgNotesAppendMarker_(notes, marker) {
  var mark = String(marker || '').trim();
  if (!mark) return String(notes == null ? '' : notes);
  if (tgNotesHasMarker_(notes, mark)) return String(notes == null ? '' : notes);
  var cur = String(notes == null ? '' : notes).trim();
  return cur ? (cur + ' | ' + mark) : mark;
}

function telegramBuildColMap_(headers) {
  var map = {
    TIMESTAMP: -1, ORDER_ID: -1, NAME: -1, EMAIL: -1, TELEGRAM: -1,
    PLAN: -1, AMOUNT: -1, SOURCE: -1, STATUS: -1, EXPIRY: -1,
    DAYS_LEFT: -1, PAYMENT: -1, NOTES: -1, FBCLID: -1, TTCLID: -1,
    MEDIUM: -1, CAMPAIGN: -1, LANGUAGE: -1
  };
  headers = headers || [];
  for (var i = 0; i < headers.length; i++) {
    var key = TG_HEADER_ALIASES[String(headers[i] || '').replace(/\s+/g, ' ').trim().toLowerCase()];
    if (key) map[key] = i;
  }
  return map;
}

function applyTelegramColToGlobal_(map) {
  if (typeof COL === 'undefined' || !map) return map;
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    if (map[keys[i]] >= 0) COL[keys[i]] = map[keys[i]];
  }
  return map;
}

function resolveCustomerChatId_(telegramField, notes, usernameMap) {
  var t = String(telegramField || '').trim();
  if (/^-?\d{3,}$/.test(t)) return t;
  var m = String(notes || '').match(/TG_CHAT:(-?\d+)/i);
  if (m) return m[1];
  var uname = t.replace(/^@/, '').toLowerCase();
  if (uname && usernameMap && usernameMap[uname]) return String(usernameMap[uname]);
  return '';
}

function telegramIdentityKey_(value) {
  var s = String(value == null ? '' : value).trim();
  if (!s) return '';
  if (/^-?\d{3,}$/.test(s)) return s;
  return s.replace(/^@/, '').toLowerCase();
}

function sheetHasActiveRowForIdentity_(rows, col, identity) {
  var key = telegramIdentityKey_(identity);
  if (!key || !rows || !col) return false;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col.STATUS] || '').trim().toLowerCase() !== 'active') continue;
    var tgField = col.TELEGRAM >= 0 ? String(rows[i][col.TELEGRAM] || '') : '';
    var notes = col.NOTES >= 0 ? String(rows[i][col.NOTES] || '') : '';
    if (telegramIdentityKey_(tgField) === key) return true;
    var chat = resolveCustomerChatId_(tgField, notes, null);
    if (chat && telegramIdentityKey_(chat) === key) return true;
  }
  return false;
}

function isGrandfatheredByBaseline_(joinYmd, baselineYmd) {
  var join = parseVipBaselineDate_(joinYmd);
  var base = parseVipBaselineDate_(baselineYmd);
  if (!join.ok) return true;
  if (!base.ok) return true;
  return join.ymd < base.ymd;
}

function isNewSystemMember_(opts) {
  opts = opts || {};
  if (tgNotesHasMarker_(opts.notes, BOT_CONFIRMED_MARKER)) return true;
  if (tgNotesHasMarker_(opts.notes, VIP_SENT_MARKER)) return true;
  if (tgNotesHasMarker_(opts.notes, 'VIP_INVITE_ADMIN')) return true;
  var baseline = resolveVipBaselineYmd_(opts.baselineYmd);
  var ts = tgParseDate_(opts.timestamp);
  if (!ts) return false;
  return tgDhakaYmd_(ts) >= baseline;
}

/* ── Confirm / VIP / kick plans ─────────────────────────── */

function planActivateFromBotConfirm_(row) {
  row = row || {};
  var st = String(row.status || '').trim().toLowerCase();
  if (st === 'active') {
    return { ok: false, reason: 'already-active', callCapi: false, createVipInvite: false };
  }
  if (st !== 'pending' && st !== 'verifying') {
    return { ok: false, reason: 'not-pending', callCapi: false, createVipInvite: false };
  }
  return { ok: true, newStatus: 'Active', callCapi: true, createVipInvite: true };
}

function buildCreateChatInviteLinkPayload_(vipChatId, orderId) {
  return {
    chat_id: vipChatId,
    name: String(orderId || '').slice(0, 32),
    member_limit: 1
  };
}

function isPublicOrVipChat_(chatId, vipChatId, publicChannelId) {
  var c = String(chatId || '');
  if (!c) return false;
  if (vipChatId && c === String(vipChatId)) return true;
  var pub = String(publicChannelId || '');
  if (pub && c === pub) return true;
  var pubName = pub.replace(/^@/, '').toLowerCase();
  if (pubName && c.replace(/^@/, '').toLowerCase() === pubName) return true;
  return false;
}

function buildCustomerVipTelegramMessage_(name, inviteLink) {
  var who = String(name || 'there').trim() || 'there';
  return 'Hi ' + who + ',\n\n' +
    'Your Method Mafia VIP access is ready. This invite works once — do not share it.\n\n' +
    inviteLink + '\n\n' +
    'আপনার VIP ইনভাইট রেডি। লিংক একবারই কাজ করবে — শেয়ার করবেন না।\n\n' +
    '— Method Mafia / @' + TELEGRAM_BOT_USERNAME;
}

function planVipInviteDelivery_(opts) {
  opts = opts || {};
  var invite = String(opts.inviteLink || '');
  var customer = String(opts.customerChatId || '');
  var admin = String(opts.adminChatId || TELEGRAM_ADMIN_CHAT_ID);
  var vip = String(opts.vipChatId || '');
  var pub = String(opts.publicChannelId || '');
  var chatId = customer || admin;
  if (!invite) return { ok: false, reason: 'missing-invite' };
  if (isPublicOrVipChat_(chatId, vip, pub)) {
    return { ok: false, reason: 'refused-public-vip' };
  }
  var text = customer
    ? buildCustomerVipTelegramMessage_(opts.name, invite)
    : ('One-time VIP invite (member_limit=1) for the customer. Forward privately — do NOT post in VIP or the public channel.\n' +
       'Customer should tap /start @' + TELEGRAM_BOT_USERNAME + ' so the next invite can be DMed.\n\n' +
       invite);
  return { ok: true, chatId: chatId, text: text };
}

function formatVipInviteFailure_(err) {
  err = err || {};
  var desc = err.description || err.message || String(err);
  return 'VIP invite failed: ' + desc +
    ' — @' + TELEGRAM_BOT_USERNAME + ' is not an admin of the VIP channel (or missing Invite users via link). ' +
    'Manager/Swa: VIP channel → Administrators → Add @' + TELEGRAM_BOT_USERNAME +
    ' → enable Invite users via link + Ban users. Then retry the ✅ confirm.';
}

function planKickExecute_(row) {
  row = row || {};
  var st = String(row.status || '').trim().toLowerCase();
  if (st !== 'expired') {
    return { ok: false, reason: 'not-expired' };
  }
  if (!tgNotesHasMarker_(row.notes, KICK_ASKED_MARKER)) {
    return { ok: false, reason: 'confirm-first' };
  }
  var uid = String(row.telegramUserId || '');
  if (!/^-?\d{3,}$/.test(uid)) {
    return { ok: false, reason: 'missing-telegram-user-id' };
  }
  return { ok: true, method: 'banChatMember', userId: uid };
}

function planKickConfirmList_(opts) {
  opts = opts || {};
  var rows = opts.rows || [];
  var col = opts.col || {};
  var items = [];
  var seen = {};
  var i;
  var baselineYmd = resolveVipBaselineYmd_(opts.baselineYmd);
  var unpaidOn = opts.kickUnpaidJoiners === true;

  for (i = 1; i < rows.length; i++) {
    var st = String(rows[i][col.STATUS] || '').trim().toLowerCase();
    if (st !== 'expired') continue;
    var notes = col.NOTES >= 0 ? rows[i][col.NOTES] : '';
    if (tgNotesHasMarker_(notes, KICKED_MARKER) || tgNotesHasMarker_(notes, KICK_ASKED_MARKER)) continue;
    var telegram = col.TELEGRAM >= 0 ? String(rows[i][col.TELEGRAM] || '') : '';
    var uid = resolveCustomerChatId_(telegram, notes, null);
    var ident = telegramIdentityKey_(uid || telegram);
    if (ident) seen[ident] = true;
    var ts = col.TIMESTAMP >= 0 ? rows[i][col.TIMESTAMP] : '';
    if (!isNewSystemMember_({ notes: notes, timestamp: ts, baselineYmd: baselineYmd })) continue;
    items.push({
      reason: 'expired',
      orderId: col.ORDER_ID >= 0 ? String(rows[i][col.ORDER_ID] || '') : '',
      name: col.NAME >= 0 ? String(rows[i][col.NAME] || '') : '',
      telegram: telegram,
      userId: uid,
      notes: notes,
      rowIndex0: i,
      executeKick: false
    });
  }

  var joinLog = opts.joinLog || [];
  if (unpaidOn) {
    for (i = 0; i < joinLog.length; i++) {
      var j = joinLog[i] || {};
      if (isGrandfatheredByBaseline_(j.joinYmd, baselineYmd)) continue;
      var uname = String(j.username || '').replace(/^@/, '');
      if (sheetHasActiveRowForIdentity_(rows, col, j.userId)) continue;
      if (uname && sheetHasActiveRowForIdentity_(rows, col, '@' + uname)) continue;
      var identB = telegramIdentityKey_(j.userId || uname);
      if (identB && seen[identB]) continue;
      if (identB) seen[identB] = true;
      items.push({
        reason: 'post-baseline-no-active',
        orderId: '',
        name: String(j.name || ''),
        telegram: uname ? ('@' + uname) : '',
        username: uname,
        userId: String(j.userId || ''),
        joinYmd: j.joinYmd,
        executeKick: false
      });
    }
  }

  return {
    items: items,
    requiresAdminConfirm: true,
    executeKick: false,
    kickUnpaidJoiners: unpaidOn,
    channelScanRefused: !unpaidOn,
    channelScanReason: unpaidOn ? '' : 'unpaid-joiners-off',
    reason: unpaidOn ? '' : 'unpaid-joiners-off',
    baselineYmd: baselineYmd
  };
}

function planKickBatchExecute_(opts) {
  opts = opts || {};
  if (!opts.adminConfirmed) {
    return { ok: false, reason: 'confirm-first', bans: [] };
  }
  var items = opts.items || [];
  if (!items.length) {
    return { ok: false, reason: 'empty-list', bans: [] };
  }
  var bans = [];
  for (var i = 0; i < items.length; i++) {
    var uid = String(items[i].userId || '');
    if (!/^-?\d{3,}$/.test(uid)) continue;
    var row1 = items[i].row1;
    if (!row1 && items[i].rowIndex0 != null) row1 = items[i].rowIndex0 + 1;
    bans.push({
      method: 'banChatMember',
      userId: uid,
      orderId: items[i].orderId || '',
      reason: items[i].reason || '',
      name: items[i].name || '',
      telegram: items[i].telegram || items[i].username || '',
      row1: row1 || 0
    });
  }
  if (!bans.length) return { ok: false, reason: 'missing-telegram-user-id', bans: [] };
  return { ok: true, bans: bans };
}

function planJoinLogEntry_(opts) {
  opts = opts || {};
  var newSt = String(opts.newStatus || '').toLowerCase();
  var oldSt = String(opts.oldStatus || '').toLowerCase();
  var joined = (newSt === 'member' || newSt === 'restricted') &&
    oldSt !== 'member' && oldSt !== 'restricted' &&
    oldSt !== 'administrator' && oldSt !== 'creator';
  if (!joined) return { ok: true, record: false, reason: 'not-a-join' };
  var baseline = parseVipBaselineDate_(resolveVipBaselineYmd_(opts.baselineYmd));
  if (!baseline.ok) return { ok: false, record: false, reason: baseline.reason || 'missing-baseline' };
  if (isGrandfatheredByBaseline_(opts.joinYmd, baseline.ymd)) {
    return { ok: true, record: false, reason: 'pre-baseline' };
  }
  var join = parseVipBaselineDate_(opts.joinYmd);
  return {
    ok: true,
    record: true,
    entry: {
      userId: String(opts.userId || ''),
      username: String(opts.username || '').replace(/^@/, ''),
      name: String(opts.name || ''),
      joinYmd: join.ok ? join.ymd : ''
    }
  };
}

function buildKickConfirmListKeyboard_() {
  return {
    inline_keyboard: [[
      { text: '✅ Confirm list kick', callback_data: 'L:ok' },
      { text: 'Cancel', callback_data: 'L:no' }
    ]]
  };
}

function buildKickConfirmListMessage_(list) {
  list = list || {};
  var items = list.items || [];
  var lines = [
    '⚠️ Kick confirm list — @' + TELEGRAM_BOT_USERNAME,
    'Legacy VIP members stay untouched. Blind sync is FORBIDDEN forever.',
    'Only new-system Expired (website order → bot ✅ → one-time invite). Tap ✅ to banChatMember the people below, or Cancel. Confirm-first — bot will not kick until you tap.',
    '━━━━━━━━━━━━━━'
  ];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var handle = it.telegram || (it.username ? ('@' + String(it.username).replace(/^@/, '')) : '');
    var who = (it.name || '') + ' / ' + handle + ' / id ' + (it.userId || 'unknown');
    var why = it.reason === 'expired'
      ? ('Expired order ' + (it.orderId || ''))
      : ('joined ' + (it.joinYmd || '') + ' — no Active Sheet row');
    lines.push((i + 1) + ') ' + who + ' — ' + why);
  }
  if (!items.length) lines.push('(empty — nobody to kick)');
  return lines.join('\n');
}

function buildPendingConfirmKeyboard_(orderId) {
  var oid = String(orderId || '').toUpperCase();
  return {
    inline_keyboard: [[
      { text: '✅ Confirm (SS verified)', callback_data: 'c:' + oid },
      { text: 'Skip', callback_data: 'x:' + oid }
    ]]
  };
}

function buildKickConfirmKeyboard_(orderId) {
  var oid = String(orderId || '').toUpperCase();
  return {
    inline_keyboard: [[
      { text: '✅ Confirm kick', callback_data: 'k:' + oid },
      { text: 'Cancel', callback_data: 'n:' + oid }
    ]]
  };
}

function buildAdminPendingOrderMessage_(item) {
  item = item || {};
  return '🧾 NEW ORDER — @' + TELEGRAM_BOT_USERNAME + '\n' +
    '━━━━━━━━━━━━━━\n' +
    'Order ID : ' + (item.orderId || '') + '\n' +
    'Name     : ' + (item.name || '') + '\n' +
    'Email    : ' + (item.email || '') + '\n' +
    'Telegram : ' + (item.telegram || '') + '\n' +
    '━━━━━━━━━━━━━━\n' +
    'Plan     : ' + (item.plan || '') + '\n' +
    'Amount   : ' + (item.amount || '') + '\n' +
    'Payment  : ' + (item.payment || '') + '\n' +
    '━━━━━━━━━━━━━━\n' +
    'Human: verify the payment screenshot with @MMHQ_Support first.\n' +
    'Bot ✅ (after SS verified) sets Status Active + Entry $30 CAPI + one-time VIP invite.\n' +
    'Do not post a public VIP link.';
}

function buildAdminKickAskMessage_(item) {
  item = item || {};
  return '⚠️ Kick confirm — @' + TELEGRAM_BOT_USERNAME + '\n' +
    'Order ' + (item.orderId || '') + ' is Expired (' + (item.telegram || '') +
    ' / ' + (item.name || '') + ' / id ' + (item.userId || item.telegramUserId || 'unknown') + ').\n' +
    'Tap ✅ to banChatMember from VIP, or Cancel. Confirm-first — bot will not kick until you tap.';
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
        subject: "{name}, you still have a little time ⏳",
        body:
          "Hey {name} 👋\n\nYour first month in Premium VIP is almost over. 3 days left.\n\nWhat you are using now — tools, methods, support — would cost a lot more per month if you bought each one separately outside. Here, one small renew keeps everything in one place. Some members use the methods and AI tools for personal work. Some use them for business. Some even earn by selling on marketplaces.\n\nWant to stay in the premium group? Lock your seat now:\n{renew_link}\n\nJust $15. Small step, keep the big advantage 💛\n— Method Mafia",
        tg:
          "Hey {name} 👋\n\nYour first month in Premium VIP is almost over. 3 days left.\n\nWant to stay in the premium group? Lock your seat now:\n{renew_link}\n\nJust $15. Small step, keep the big advantage 💛\n— Method Mafia"
      },
      2: {
        subject: "{name}, do the quick math ⚡",
        body:
          "{name},\n\n2 days left.\n\nOutside, one solid AI tool subscription alone often runs about $20+. Here, $15 keeps tools through support in one package. A lot of members also find their own income path from here.\n\nIf this advantage cuts off, you start paying piece by piece again. Stay inside and keep everything in one place.\n\nRenew and keep your seat:\n{renew_link}\n\nYou are already inside. Do not give it up lightly 👀",
        tg:
          "{name},\n\n2 days left.\n\nOutside, one solid AI tool subscription alone often runs about $20+. Here, $15 keeps tools through support in one package. A lot of members also find their own income path from here.\n\nRenew and keep your seat:\n{renew_link}\n\nYou are already inside. Do not give it up lightly 👀"
      },
      1: {
        subject: "Last email, {name} — access ends tonight 🔥",
        body:
          "Hey {name} 👋\n\nThis is your last renew message. Premium VIP access ends tonight. You will not get another email on this after that.\n\nQuick reminder — outside, one AI tool subscription alone is often about $20+. Here, $15 kept tools, methods, and support in one place. Some members use it for personal work, some for business, some even earn by selling on marketplaces. After tonight, that one-place advantage goes away.\n\nIf this month helped you move forward, lock your seat today. Do it now — before tomorrow morning feels like “I should have renewed.”\n\nJust $15:\n{renew_link}\n\nDoor closes tonight. Keep your seat 💛\n— Method Mafia",
        tg:
          "Hey {name} 👋\n\nThis is your last renew message. Premium VIP access ends tonight. You will not get another email on this after that.\n\nJust $15:\n{renew_link}\n\nDoor closes tonight. Keep your seat 💛\n— Method Mafia"
      }
    },
    bn: {
      3: {
        subject: "{name}, আর একটু সময় আছে ⏳",
        body:
          "{name} ভাই 👋\n\nPremium VIP তে তোমার এক মাস প্রায় শেষ। আর ৩ দিন।\n\nএই সময়টায় তুমি যা ব্যবহার করছো — টুলস, মেথড, সাপোর্ট — বাইরে আলাদা আলাদা কিনলে মাসে অনেক বেশি টাকা খরচ হবে। এখানে একটা ছোট রিনিউতেই সব একসাথে থাকে। কেউ মেথড ব্যবহার করে বিভিন্ন AI আর টুলস নিজের পার্সোনাল কাজে লাগায়। আবার কেউ ব্যবসার কাজে ব্যবহার করে। আবার কেউ বিভিন্ন মার্কেটপ্লেসে সেল করে ইনকামও করে।\n\nপ্রিমিয়াম গ্রুপে থাকতে চাইলে এখন থেকেই সিট লক করে রাখো:\n{renew_link}\n\n$15। ছোট পদক্ষেপ, বড় সুবিধা ধরে রাখা 💛\n— Method Mafia",
        tg:
          "{name} ভাই 👋\n\nPremium VIP তে তোমার এক মাস প্রায় শেষ। আর ৩ দিন।\n\nপ্রিমিয়াম গ্রুপে থাকতে চাইলে এখন থেকেই সিট লক করে রাখো:\n{renew_link}\n\n$15। ছোট পদক্ষেপ, বড় সুবিধা ধরে রাখা 💛\n— Method Mafia"
      },
      2: {
        subject: "{name}, হিসাব মিলিয়ে নাও ⚡",
        body:
          "{name},\n\nআর ২ দিন বাকি।\n\nবাইরে শুধু একটা ভালো AI টুলের সাবস্ক্রিপশনেই প্রায় $20+ চলে যায়। এখানে $15 এ টুলস থেকে সাপোর্ট পর্যন্ত এক প্যাকেজেই আছে। অনেকে এখান থেকে নিজের ইনকামের রাস্তাও খুঁজে নেয়।\n\nএই সুবিধা কেটে গেলে আবার টুকরো টুকরো খরচ শুরু। ভিতরে থাকলে এক জায়গায় সব।\n\nরিনিউ করে সিট রাখো:\n{renew_link}\n\nতুমি ইতিমধ্যে ভিতরে। হালকা মনে করে ছেড়ে দিও না 👀",
        tg:
          "{name},\n\nআর ২ দিন বাকি।\n\nবাইরে শুধু একটা ভালো AI টুলের সাবস্ক্রিপশনেই প্রায় $20+ চলে যায়। এখানে $15 এ টুলস থেকে সাপোর্ট পর্যন্ত এক প্যাকেজেই আছে। অনেকে এখান থেকে নিজের ইনকামের রাস্তাও খুঁজে নেয়।\n\nরিনিউ করে সিট রাখো:\n{renew_link}\n\nতুমি ইতিমধ্যে ভিতরে। হালকা মনে করে ছেড়ে দিও না 👀"
      },
      1: {
        subject: "শেষ ইমেইল, {name} — আজ রাত কেটে যাচ্ছে 🔥",
        body:
          "{name} ভাই 👋\n\nএটা তোমার শেষ রিনিউ মেসেজ। আজ রাত Premium VIP এক্সেস বন্ধ হয়ে যাচ্ছে। এর পর এই টপিকে আর মেইল আসবে না।\n\nএকটু মনে করো — বাইরে শুধু একটা AI টুলের সাবস্ক্রিপশনেই প্রায় $20+ চলে যায়। এখানে $15 এ টুলস, মেথড, সাপোর্ট একসাথে ছিল। কেউ এটা দিয়ে নিজের কাজ চালায়, কেউ ব্যবসা, কেউ মার্কেটপ্লেসে সেল করে ইনকামও করে। আজ রাতের পর সেই এক জায়গার সুবিধাটা থাকবে না।\n\nযদি মনে হয় এই এক মাসে তোমার কিছু এগিয়েছে, তাহলে আজই সিট লক করো। কাল সকালে “করে রাখতাম” ভাবার আগে আজ সেরে ফেলো।\n\nমাত্র $15:\n{renew_link}\n\nদরজা আজ রাত বন্ধ। তোমার সিট তোমারই রাখো 💛\n— Method Mafia",
        tg:
          "{name} ভাই 👋\n\nএটা তোমার শেষ রিনিউ মেসেজ। আজ রাত Premium VIP এক্সেস বন্ধ হয়ে যাচ্ছে। এর পর এই টপিকে আর মেইল আসবে না।\n\nমাত্র $15:\n{renew_link}\n\nদরজা আজ রাত বন্ধ। তোমার সিট তোমারই রাখো 💛\n— Method Mafia"
      }
    },
    hi: {
      3: {
        subject: "{name}, थोड़ा समय और बचा है ⏳",
        body:
          "{name} भाई 👋\n\nPremium VIP में तुम्हारा एक महीना लगभग खत्म। बस 3 दिन बचे हैं।\n\nजो तुम अभी यूज़ कर रहे हो — टूल्स, मेथड्स, सपोर्ट — बाहर अलग-अलग खरीदोगे तो महीने का खarcha बहुत बढ़ जाएगा। यहाँ एक छोटे रिन्यू में सब एक साथ रहता है। कोई मेथड और AI टूल्स पर्सनल काम में लगाता है। कोई बिज़नेस में यूज़ करता है। कोई मार्केटप्लेस पर सेल करके इनकम भी करता है।\n\nप्रीमियम ग्रुप में रहना है तो अभी से सीट लॉक कर लो:\n{renew_link}\n\nसिर्फ $15। छोटा कदम, बड़ा फायदा बचा के रखना 💛\n— Method Mafia",
        tg:
          "{name} भाई 👋\n\nPremium VIP में तुम्हारा एक महीना लगभग खत्म। बस 3 दिन बचे हैं।\n\nप्रीमियम ग्रुप में रहना है तो अभी से सीट लॉक कर लो:\n{renew_link}\n\nसिर्फ $15। छोटा कदम, बड़ा फायदा बचा के रखना 💛\n— Method Mafia"
      },
      2: {
        subject: "{name}, हिसाब मिला लो ⚡",
        body:
          "{name},\n\n2 दिन बचे हैं।\n\nबाहर सिर्फ एक अच्छे AI टूल का सब्सक्रिप्शन ही लगभग $20+ बैठ जाता है। यहाँ $15 में टूल्स से सपोर्ट तक एक पैकेज में है। बहुत लोग यहाँ से अपनी इनकम की राह भी बनाते हैं।\n\nये सुविधा कट गई तो फिर टुकड़ों-टुकड़ों में खर्चा शुरू। अंदर रहोगे तो सब एक जगह।\n\nरिन्यू करके सीट रखो:\n{renew_link}\n\nतुम पहले से अंदर हो। हल्के में छोड़ मत देना 👀",
        tg:
          "{name},\n\n2 दिन बचे हैं।\n\nबाहर सिर्फ एक अच्छे AI टूल का सब्सक्रिप्शन ही लगभग $20+ बैठ जाता है। यहाँ $15 में टूल्स से सपोर्ट तक एक पैकेज में है। बहुत लोग यहाँ से अपनी इनकम की राह भी बनाते हैं।\n\nरिन्यू करके सीट रखो:\n{renew_link}\n\nतुम पहले से अंदर हो। हल्के में छोड़ मत देना 👀"
      },
      1: {
        subject: "आखिरी ईमेल, {name} — आज रात कट जाएगा 🔥",
        body:
          "{name} भाई 👋\n\nये तुम्हारा आखिरी रिन्यू मैसेज है। आज रात Premium VIP एक्सेस बंद हो जाएगा। इसके बाद इस टॉपिक पर और मेल नहीं आएगा।\n\nथोड़ा याद रखो — बाहर सिर्फ एक AI टूल के सब्सक्रिप्शन में ही लगभग $20+ लग जाते हैं। यहाँ $15 में टूल्स, मेथड्स, सपोर्ट एक साथ थे। कोई अपना काम चलाता है, कोई बिज़नेस, कोई मार्केटप्लेस पर सेल करके इनकम भी करता है। आज रात के बाद वो एक जगह वाली सुविधा नहीं रहेगी।\n\nअगर लगता है इस एक महीने में तुम थोड़ा आगे बढ़े हो, तो आज ही सीट लॉक करो। कल सुबह “कर लेता” सोचने से पहले आज कर लो।\n\nसिर्फ $15:\n{renew_link}\n\nदरवाज़ा आज रात बंद। अपनी सीट अपने पास रखो 💛\n— Method Mafia",
        tg:
          "{name} भाई 👋\n\nये तुम्हारा आखिरी रिन्यू मैसेज है। आज रात Premium VIP एक्सेस बंद हो जाएगा। इसके बाद इस टॉपिक पर और मेल नहीं आएगा।\n\nसिर्फ $15:\n{renew_link}\n\nदरवाज़ा आज रात बंद। अपनी सीट अपने पास रखो 💛\n— Method Mafia"
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
    body: fillRenewPlaceholders_(entry.body, item),
    tg: fillRenewPlaceholders_(entry.tg || entry.body, item)
  };
}

function stripMarkdownBold_(text) {
  return String(text || '').replace(/\*\*/g, '');
}

function fillPayPlaceholders_(text, item) {
  item = item || {};
  var name = String(item.name || '').trim() || 'there';
  var oid = String(item.orderId || '').trim();
  return String(text || '').replace(/\{name\}/g, name).replace(/\{orderId\}/g, oid);
}

function buildPremiumVipPayCopy_(lang, item) {
  var code = String(lang || 'en').toLowerCase();
  var body;
  if (code === 'bn') {
    body =
      'হ্যালো {name} 👋\n' +
      'তোমার Method Mafia অর্ডার {orderId} এখনও পেমেন্টের অপেক্ষায়।\n\n' +
      'স্ক্রিনশট কনফার্ম হলে Premium VIP এক্সেস চালু হবে।\n\n' +
      'Order ID + স্ক্রিনশট পাঠাও @MMHQ_Support';
  } else if (code === 'hi') {
    body =
      'नमस्ते {name} 👋\n' +
      'तुम्हारा Method Mafia ऑर्डर {orderId} अभी पेमेंट का इंतज़ार कर रहा है।\n\n' +
      'स्क्रीनशॉट कन्फर्म होने के बाद Premium VIP एक्सेस चालू होगा।\n\n' +
      'Order ID + स्क्रीनशॉट भेजो @MMHQ_Support';
  } else {
    body =
      'Hey {name} 👋\n' +
      'Your Method Mafia order {orderId} is still waiting on payment.\n\n' +
      'Premium VIP access starts after we confirm your screenshot.\n\n' +
      'Send Order ID + screenshot to @MMHQ_Support';
  }
  return fillPayPlaceholders_(body, item);
}

function buildCustomerPayTelegramMessage_(item) {
  item = item || {};
  var lang = resolveCustomerCopyLang_(item.notes, item.locale || item.lang || item.language);
  return buildPremiumVipPayCopy_(lang, item);
}

function buildCustomerRenewTelegramMessage_(item) {
  item = item || {};
  var lang = resolveCustomerCopyLang_(item.notes, item.locale || item.lang || item.language);
  var copy = buildPremiumVipRenewCopy_(lang, item.daysLeft, item);
  return copy.tg || copy.body;
}

/* ── Lifecycle planners (email stays in Lifecycle.gs) ───── */

function tgPad2_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

function tgParseDate_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : new Date(value.getTime());
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function tgDhakaYmd_(date) {
  if (typeof lifecycleDhakaYmd_ === 'function') return lifecycleDhakaYmd_(date);
  if (typeof dhakaYmd_ === 'function') return dhakaYmd_(date);
  var offset = (typeof ORGANIZE_TZ_OFFSET_MS !== 'undefined') ? ORGANIZE_TZ_OFFSET_MS : (6 * 60 * 60 * 1000);
  var shifted = new Date(date.getTime() + offset);
  return shifted.getUTCFullYear() + '-' + tgPad2_(shifted.getUTCMonth() + 1) + '-' + tgPad2_(shifted.getUTCDate());
}

function tgYmdToUtcMs_(ymd) {
  var p = String(ymd || '').split('-');
  if (p.length < 3) return NaN;
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function tgCalendarDaysUntil_(expiry, today) {
  if (typeof calendarDaysUntil_ === 'function') return calendarDaysUntil_(expiry, today);
  var e = tgParseDate_(expiry);
  var t = tgParseDate_(today);
  if (!e || !t) return null;
  return Math.round((tgYmdToUtcMs_(tgDhakaYmd_(e)) - tgYmdToUtcMs_(tgDhakaYmd_(t))) / 86400000);
}

function shouldSendPayTg_(status, timestamp, notes, now) {
  if (String(status || '').trim().toLowerCase() !== 'pending') return false;
  if (tgNotesHasMarker_(notes, PAY_TG_MARKER)) return false;
  var ts = tgParseDate_(timestamp);
  var n = tgParseDate_(now);
  if (!ts || !n) return false;
  return (n.getTime() - ts.getTime()) >= PAY_TG_MS;
}

function planTelegramPayReminders_(rows, col, now) {
  var out = [];
  now = now || new Date();
  for (var i = 1; i < rows.length; i++) {
    if (!shouldSendPayTg_(rows[i][col.STATUS], rows[i][col.TIMESTAMP], col.NOTES >= 0 ? rows[i][col.NOTES] : '', now)) {
      continue;
    }
    out.push({
      rowIndex0: i,
      orderId: String(rows[i][col.ORDER_ID] || ''),
      name: String(rows[i][col.NAME] || ''),
      telegram: String(rows[i][col.TELEGRAM] || ''),
      notes: col.NOTES >= 0 ? rows[i][col.NOTES] : '',
      language: (col.LANGUAGE >= 0) ? rows[i][col.LANGUAGE] : '',
      marker: PAY_TG_MARKER
    });
  }
  return out;
}

function planTelegramRenewReminders_(rows, col, today) {
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col.STATUS] || '').trim().toLowerCase() !== 'active') continue;
    var days = tgCalendarDaysUntil_(rows[i][col.EXPIRY], today);
    var marker = RENEW_TG_MARKERS[days] || '';
    if (!marker) continue;
    if (tgNotesHasMarker_(rows[i][col.NOTES], marker)) continue;
    out.push({
      rowIndex0: i,
      orderId: String(rows[i][col.ORDER_ID] || ''),
      name: String(rows[i][col.NAME] || ''),
      telegram: String(rows[i][col.TELEGRAM] || ''),
      notes: rows[i][col.NOTES],
      daysLeft: days,
      expiry: rows[i][col.EXPIRY],
      language: (col.LANGUAGE >= 0) ? rows[i][col.LANGUAGE] : '',
      marker: marker
    });
  }
  return out;
}

function shouldAskKick_(status, expiry, notes, today) {
  if (tgNotesHasMarker_(notes, KICK_ASKED_MARKER) || tgNotesHasMarker_(notes, KICKED_MARKER)) return false;
  var st = String(status || '').trim().toLowerCase();
  return st === 'expired';
}

function planTelegramKickAsks_(rows, col, today, baselineYmd) {
  var out = [];
  var baseline = resolveVipBaselineYmd_(baselineYmd);
  for (var i = 1; i < rows.length; i++) {
    if (!shouldAskKick_(rows[i][col.STATUS], rows[i][col.EXPIRY], rows[i][col.NOTES], today)) continue;
    if (!isNewSystemMember_({
      notes: col.NOTES >= 0 ? rows[i][col.NOTES] : '',
      timestamp: col.TIMESTAMP >= 0 ? rows[i][col.TIMESTAMP] : '',
      baselineYmd: baseline
    })) continue;
    out.push({
      rowIndex0: i,
      orderId: String(rows[i][col.ORDER_ID] || ''),
      name: String(rows[i][col.NAME] || ''),
      telegram: String(rows[i][col.TELEGRAM] || ''),
      notes: rows[i][col.NOTES],
      executeKick: false
    });
  }
  return out;
}

/* ── Webhook planner (pure) ─────────────────────────────── */

function processTelegramUpdate_(update, ctx) {
  ctx = ctx || {};
  update = update || {};
  if (!telegramWebhookAuthorized_(ctx.secretProvided, ctx.secretStored)) {
    return { ok: false, reason: 'unauthorized-webhook', actions: [] };
  }
  if (update.callback_query) return processTelegramCallback_(update.callback_query, ctx);
  if (update.message) return processTelegramMessage_(update.message, ctx);
  if (update.chat_member) return processTelegramChatMember_(update.chat_member, ctx);
  return { ok: true, actions: [] };
}

function processTelegramChatMember_(cm, ctx) {
  ctx = ctx || {};
  cm = cm || {};
  var newM = cm.new_chat_member || {};
  var oldM = cm.old_chat_member || {};
  var user = newM.user || {};
  var planned = planJoinLogEntry_({
    userId: user.id,
    username: user.username,
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    joinYmd: ctx.todayYmd || '',
    newStatus: newM.status,
    oldStatus: oldM.status,
    baselineYmd: ctx.baselineYmd
  });
  if (!planned.record) return { ok: true, actions: [] };
  return { ok: true, actions: [{ type: 'recordJoinLog', entry: planned.entry }] };
}

function processTelegramCallback_(cq, ctx) {
  cq = cq || {};
  var fromId = cq.from && cq.from.id;
  var chatId = cq.message && cq.message.chat && cq.message.chat.id;
  var auth = authorizeAdminCallback_({ fromId: fromId, chatId: chatId });
  var parsed = parseCallbackData_(cq.data);
  if (!auth.ok) {
    return {
      ok: false,
      reason: auth.reason,
      actions: [{ type: 'answerCallback', callbackId: cq.id, text: 'Admin only', alert: true }]
    };
  }
  if (!parsed) {
    return { ok: false, reason: 'bad-callback', actions: [{ type: 'answerCallback', callbackId: cq.id, text: 'Unknown button' }] };
  }

  if (parsed.action === 'kick-list-cancel') {
    return {
      ok: true,
      actions: [
        { type: 'answerCallback', callbackId: cq.id, text: 'Cancelled' },
        { type: 'editMessage', chatId: chatId, messageId: cq.message && cq.message.message_id, text: 'Kick list cancelled' },
        { type: 'clearPendingKickList' }
      ]
    };
  }

  if (parsed.action === 'kick-list-confirm') {
    var pending = ctx.pendingKickList;
    if (!pending || !pending.length) {
      return {
        ok: false,
        reason: 'missing-confirm-list',
        actions: [{ type: 'answerCallback', callbackId: cq.id, text: 'No pending kick list', alert: true }]
      };
    }
    var batch = planKickBatchExecute_({ items: pending, adminConfirmed: true });
    if (!batch.ok) {
      return {
        ok: false,
        reason: batch.reason,
        actions: [{ type: 'answerCallback', callbackId: cq.id, text: batch.reason, alert: true }]
      };
    }
    return {
      ok: true,
      actions: [
        { type: 'answerCallback', callbackId: cq.id, text: 'Kicking ' + batch.bans.length },
        { type: 'kick-batch', bans: batch.bans },
        { type: 'clearPendingKickList' }
      ]
    };
  }

  var getOrder = ctx.getOrder || function () { return null; };
  var order = getOrder(parsed.orderId);
  if (!order) {
    return {
      ok: false,
      reason: 'not-found',
      actions: [{ type: 'answerCallback', callbackId: cq.id, text: 'Order not found', alert: true }]
    };
  }

  if (parsed.action === 'dismiss' || parsed.action === 'kick-cancel') {
    return {
      ok: true,
      actions: [
        { type: 'answerCallback', callbackId: cq.id, text: 'Cancelled' },
        { type: 'editMessage', chatId: chatId, messageId: cq.message && cq.message.message_id, text: 'Cancelled ' + parsed.orderId }
      ]
    };
  }

  if (parsed.action === 'confirm') {
    var act = planActivateFromBotConfirm_(order);
    if (!act.ok) {
      return {
        ok: false,
        reason: act.reason,
        actions: [{ type: 'answerCallback', callbackId: cq.id, text: act.reason, alert: true }]
      };
    }
    var actions = [
      { type: 'answerCallback', callbackId: cq.id, text: 'Activating ' + parsed.orderId },
      { type: 'activate', orderId: parsed.orderId, row1: order.row1, newStatus: act.newStatus }
    ];
    if (act.callCapi) actions.push({ type: 'capi', row1: order.row1, orderId: parsed.orderId });
    if (act.createVipInvite) {
      actions.push({
        type: 'vipInvite',
        orderId: parsed.orderId,
        name: order.name,
        telegram: order.telegram,
        notes: order.notes,
        row1: order.row1
      });
    }
    return { ok: true, actions: actions };
  }

  if (parsed.action === 'kick') {
    var userId = resolveCustomerChatId_(order.telegram, order.notes, ctx.usernameMap);
    var kick = planKickExecute_({
      status: order.status,
      notes: order.notes,
      telegramUserId: userId
    });
    if (!kick.ok) {
      return {
        ok: false,
        reason: kick.reason,
        actions: [{ type: 'answerCallback', callbackId: cq.id, text: kick.reason, alert: true }]
      };
    }
    return {
      ok: true,
      actions: [
        { type: 'answerCallback', callbackId: cq.id, text: 'Kicking ' + parsed.orderId },
        { type: 'kick', orderId: parsed.orderId, userId: kick.userId, method: kick.method, row1: order.row1 }
      ]
    };
  }

  return { ok: false, reason: 'unhandled', actions: [] };
}

function processTelegramMessage_(msg, ctx) {
  msg = msg || {};
  var start = parseStartCommand_(msg.text);
  if (!start) {
    if (isTelegramAdminChat_(msg.chat && msg.chat.id) && /^\/id\b/i.test(String(msg.text || ''))) {
      return {
        ok: true,
        actions: [{ type: 'sendMessage', chatId: String(msg.chat.id), text: 'chat_id ' + msg.chat.id }]
      };
    }
    return { ok: true, actions: [] };
  }
  var chatId = msg.chat && msg.chat.id;
  var username = ((msg.from && msg.from.username) || '').toLowerCase();
  return {
    ok: true,
    actions: [{
      type: 'saveChatId',
      chatId: String(chatId || ''),
      username: username,
      orderId: start.orderId
    }]
  };
}

/* ── Apps Script I/O ────────────────────────────────────── */

function telegramJson_(obj) {
  if (typeof ContentService !== 'undefined') {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return obj;
}

function loadJsonProp_(key) {
  try {
    var raw = getTelegramProp_(key);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveJsonProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value || []));
}

function loadJoinLog_() {
  return loadJsonProp_(TG_JOIN_LOG_PROP);
}

function loadPendingKickList_() {
  return loadJsonProp_(TG_PENDING_KICK_PROP);
}

function savePendingKickList_(items) {
  saveJsonProp_(TG_PENDING_KICK_PROP, items || []);
}

function clearPendingKickList_() {
  saveJsonProp_(TG_PENDING_KICK_PROP, []);
}

function mergeJoinLog_(log, entry) {
  log = log ? log.slice() : [];
  entry = entry || {};
  var uid = String(entry.userId || '');
  for (var i = 0; i < log.length; i++) {
    if (uid && String(log[i].userId || '') === uid) {
      log[i] = entry;
      return log;
    }
  }
  log.push(entry);
  return log;
}

function recordJoinLogEntry_(entry) {
  if (!entry) return;
  var next = mergeJoinLog_(loadJoinLog_(), entry);
  saveJsonProp_(TG_JOIN_LOG_PROP, next);
}

function handleTelegramWebhook_(update, opts) {
  opts = opts || {};
  var token = getTelegramBotToken_();
  if (!token) {
    Logger.log('TELEGRAM_BOT_TOKEN missing. Run setupAdminBotToken_(token) or set Script property TELEGRAM_BOT_TOKEN.');
    return telegramJson_({ ok: false, error: 'bot-token-missing' });
  }
  var ctx = {
    secretProvided: opts.secret || '',
    secretStored: getTelegramWebhookSecret_(),
    getOrder: function (orderId) { return loadOrderSnapshot_(orderId); },
    pendingKickList: loadPendingKickList_(),
    baselineYmd: getVipBaselineDate_(),
    todayYmd: tgDhakaYmd_(new Date())
  };
  var plan = processTelegramUpdate_(update, ctx);
  try {
    executeTelegramPlan_(plan, token);
  } catch (err) {
    Logger.log('telegram execute: ' + err.message);
  }
  return telegramJson_({ ok: true, handled: plan.ok });
}

function telegramOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = (typeof SHEET_NAME !== 'undefined') ? SHEET_NAME : 'Orders';
  return ss.getSheetByName(name) || ss.getSheets()[0];
}

function telegramResolveCol_(sheet) {
  if (typeof applyColMapFromSheet_ === 'function' && sheet) {
    try {
      return applyTelegramColToGlobal_(applyColMapFromSheet_(sheet));
    } catch (err) {
      Logger.log('telegram colmap organize: ' + err.message);
    }
  }
  if (sheet && typeof sheet.getLastColumn === 'function') {
    var last = sheet.getLastColumn();
    var headers = last > 0 ? sheet.getRange(1, 1, 1, last).getValues()[0] : [];
    return applyTelegramColToGlobal_(telegramBuildColMap_(headers));
  }
  if (typeof COL !== 'undefined') return COL;
  return telegramBuildColMap_([]);
}

function telegramFindRow_(sheet, orderId, col) {
  col = col || telegramResolveCol_(sheet);
  if (typeof findOrderRow === 'function') {
    var found = findOrderRow(sheet, orderId, col);
    if (found) return found;
  }
  var want = String(orderId || '').toUpperCase();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col.ORDER_ID] || '').toUpperCase() === want) return i + 1;
  }
  return null;
}

function loadOrderSnapshot_(orderId) {
  var oid = String(orderId || '').toUpperCase();
  if (!oid) return null;
  var sheet = telegramOrdersSheet_();
  var col = telegramResolveCol_(sheet);
  var row1 = telegramFindRow_(sheet, oid, col);
  if (!row1) {
    try {
      var masterName = (typeof TAB_MASTER !== 'undefined') ? TAB_MASTER : 'Master';
      var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(masterName);
      if (master) {
        col = telegramResolveCol_(master);
        row1 = telegramFindRow_(master, oid, col);
        if (row1) sheet = master;
      }
    } catch (err) {
      row1 = null;
    }
  }
  if (!row1) return null;
  return {
    orderId: oid,
    row1: row1,
    sheetName: sheet.getName(),
    status: sheet.getRange(row1, col.STATUS + 1).getValue(),
    plan: col.PLAN >= 0 ? sheet.getRange(row1, col.PLAN + 1).getValue() : '',
    notes: col.NOTES >= 0 ? sheet.getRange(row1, col.NOTES + 1).getValue() : '',
    telegram: col.TELEGRAM >= 0 ? String(sheet.getRange(row1, col.TELEGRAM + 1).getValue() || '') : '',
    name: col.NAME >= 0 ? String(sheet.getRange(row1, col.NAME + 1).getValue() || '') : '',
    email: col.EMAIL >= 0 ? String(sheet.getRange(row1, col.EMAIL + 1).getValue() || '') : '',
    expiry: col.EXPIRY >= 0 ? sheet.getRange(row1, col.EXPIRY + 1).getValue() : ''
  };
}

function telegramApi_(method, payload, token) {
  token = token || getTelegramBotToken_();
  if (!token) {
    Logger.log('telegramApi_ skipped: TELEGRAM_BOT_TOKEN missing');
    return { ok: false, error: 'bot-token-missing' };
  }
  var url = TELEGRAM_API + token + '/' + method;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  var body = {};
  try { body = JSON.parse(text); } catch (err) { body = { ok: false, description: text }; }
  if (!body.ok) {
    Logger.log('Telegram ' + method + ' ' + code + ' ' + String(body.description || text).slice(0, 300));
  }
  return body;
}

function executeTelegramPlan_(plan, token) {
  plan = plan || {};
  var actions = plan.actions || [];
  for (var i = 0; i < actions.length; i++) {
    executeTelegramAction_(actions[i], token);
  }
}

function executeTelegramAction_(action, token) {
  if (!action || !action.type) return;
  if (action.type === 'answerCallback') {
    telegramApi_('answerCallbackQuery', {
      callback_query_id: action.callbackId,
      text: action.text || '',
      show_alert: !!action.alert
    }, token);
    return;
  }
  if (action.type === 'editMessage') {
    telegramApi_('editMessageText', {
      chat_id: action.chatId,
      message_id: action.messageId,
      text: action.text || 'Updated'
    }, token);
    return;
  }
  if (action.type === 'sendMessage') {
    telegramSend_(action.chatId, action.text, action.replyMarkup, token);
    return;
  }
  if (action.type === 'activate') {
    telegramActivateRow_(action);
    return;
  }
  if (action.type === 'capi') {
    telegramFireCapi_(action);
    return;
  }
  if (action.type === 'vipInvite') {
    telegramSendVipInvite_(action, token);
    return;
  }
  if (action.type === 'kick') {
    telegramExecuteKick_(action, token);
    return;
  }
  if (action.type === 'kick-batch') {
    var bans = action.bans || [];
    for (var bi = 0; bi < bans.length; bi++) {
      telegramExecuteKick_(bans[bi], token);
    }
    return;
  }
  if (action.type === 'recordJoinLog') {
    recordJoinLogEntry_(action.entry);
    return;
  }
  if (action.type === 'clearPendingKickList') {
    clearPendingKickList_();
    return;
  }
  if (action.type === 'savePendingKickList') {
    savePendingKickList_(action.items || []);
    return;
  }
  if (action.type === 'saveChatId') {
    telegramSaveChatId_(action);
  }
}

function telegramActivateRow_(action) {
  var sheet = telegramOrdersSheet_();
  var col = telegramResolveCol_(sheet);
  var row1 = action.row1 || telegramFindRow_(sheet, action.orderId, col);
  if (!row1 || col.STATUS < 0) {
    Logger.log('telegram activate: row not found ' + action.orderId);
    return;
  }
  sheet.getRange(row1, col.STATUS + 1).setValue(action.newStatus || 'Active');
  if (col.NOTES >= 0) {
    var notes = sheet.getRange(row1, col.NOTES + 1).getValue();
    var stamped = tgNotesAppendMarker_(notes, BOT_CONFIRMED_MARKER);
    stamped = tgNotesAppendMarker_(stamped, 'Activated: ' + new Date().toLocaleString());
    sheet.getRange(row1, col.NOTES + 1).setValue(stamped);
  }
  try {
    if (typeof syncOrderRowToOrganizeTabs_ === 'function') syncOrderRowToOrganizeTabs_(sheet, row1);
  } catch (orgErr) {
    Logger.log('telegram activate organize: ' + orgErr.message);
  }
}

function telegramFireCapi_(action) {
  var sheet = telegramOrdersSheet_();
  telegramResolveCol_(sheet);
  var row1 = action.row1;
  if (!row1) return;
  try {
    if (typeof trySendPurchaseForRow_ === 'function') {
      trySendPurchaseForRow_(sheet, row1);
    } else {
      Logger.log('telegram CAPI skipped: trySendPurchaseForRow_ missing');
    }
  } catch (err) {
    Logger.log('telegram CAPI: ' + err.message);
  }
}

function telegramSendVipInvite_(action, token) {
  var vipChat = getTelegramVipChatId_();
  var admin = TELEGRAM_ADMIN_CHAT_ID;
  if (!vipChat) {
    var missing = formatVipInviteFailure_({
      description: 'TELEGRAM_VIP_CHAT_ID Script property is empty'
    });
    Logger.log(missing);
    telegramSend_(admin, missing, null, token);
    return;
  }
  var created = telegramApi_('createChatInviteLink', buildCreateChatInviteLinkPayload_(vipChat, action.orderId), token);
  if (!created || !created.ok || !created.result || !created.result.invite_link) {
    var fail = formatVipInviteFailure_(created || { description: 'empty createChatInviteLink response' });
    Logger.log(fail);
    telegramSend_(admin, fail, null, token);
    return;
  }
  var invite = created.result.invite_link;
  var sheet = telegramOrdersSheet_();
  var col = telegramResolveCol_(sheet);
  var row1 = action.row1;
  var notes = row1 && col.NOTES >= 0 ? sheet.getRange(row1, col.NOTES + 1).getValue() : (action.notes || '');
  var customerChat = resolveCustomerChatId_(action.telegram, notes, null);
  var delivery = planVipInviteDelivery_({
    inviteLink: invite,
    customerChatId: customerChat,
    adminChatId: admin,
    vipChatId: vipChat,
    publicChannelId: '@TheMethodMafia',
    name: action.name
  });
  if (!delivery.ok) {
    Logger.log('VIP delivery refused: ' + delivery.reason);
    telegramSend_(admin, formatVipInviteFailure_({ description: delivery.reason }), null, token);
    return;
  }
  if (isPublicOrVipChat_(delivery.chatId, vipChat, '@TheMethodMafia')) {
    Logger.log('Refusing to post VIP invite to public/VIP chat ' + delivery.chatId);
    return;
  }
  var sent = telegramSend_(delivery.chatId, delivery.text, null, token);
  if (row1 && col.NOTES >= 0) {
    var marker = customerChat ? VIP_SENT_MARKER : 'VIP_INVITE_ADMIN';
    var next = tgNotesAppendMarker_(sheet.getRange(row1, col.NOTES + 1).getValue(), marker);
    sheet.getRange(row1, col.NOTES + 1).setValue(next);
  }
  if (!sent || sent.ok === false) {
    Logger.log('VIP DM failed; invite was not posted publicly. Admin chat was used or customer must /start @' + TELEGRAM_BOT_USERNAME);
  }
}

function telegramExecuteKick_(action, token) {
  var vipChat = getTelegramVipChatId_();
  if (!vipChat) {
    telegramSend_(TELEGRAM_ADMIN_CHAT_ID, formatVipInviteFailure_({
      description: 'Cannot kick: TELEGRAM_VIP_CHAT_ID missing'
    }), null, token);
    return;
  }
  var result = telegramApi_(action.method || 'banChatMember', {
    chat_id: vipChat,
    user_id: action.userId,
    revoke_messages: false
  }, token);
  var sheet = telegramOrdersSheet_();
  var col = telegramResolveCol_(sheet);
  var row1 = action.row1;
  if (result && result.ok && row1 && col.NOTES >= 0) {
    var notes = tgNotesAppendMarker_(sheet.getRange(row1, col.NOTES + 1).getValue(), KICKED_MARKER);
    sheet.getRange(row1, col.NOTES + 1).setValue(notes);
    try {
      if (typeof syncOrderRowToOrganizeTabs_ === 'function') syncOrderRowToOrganizeTabs_(sheet, row1);
    } catch (err) {
      Logger.log('kick organize: ' + err.message);
    }
  } else {
    var desc = (result && result.description) || 'banChatMember failed';
    telegramSend_(TELEGRAM_ADMIN_CHAT_ID,
      'Kick failed for ' + action.orderId + ': ' + desc +
      ' — Manager/Swa: @' + TELEGRAM_BOT_USERNAME + ' needs Ban users permission in the VIP channel.',
      null, token);
  }
}

function telegramSaveChatId_(action) {
  var sheet = telegramOrdersSheet_();
  var col = telegramResolveCol_(sheet);
  var data = sheet.getDataRange().getValues();
  var uname = String(action.username || '').replace(/^@/, '').toLowerCase();
  var oid = String(action.orderId || '').toUpperCase();
  for (var i = 1; i < data.length; i++) {
    var rowOid = String(data[i][col.ORDER_ID] || '').toUpperCase();
    var rowTg = String(data[i][col.TELEGRAM] || '').replace(/^@/, '').toLowerCase();
    var match = (oid && rowOid === oid) || (uname && rowTg === uname);
    if (!match) continue;
    if (col.NOTES >= 0) {
      var notes = String(data[i][col.NOTES] || '');
      if (!/TG_CHAT:-?\d+/i.test(notes)) {
        notes = tgNotesAppendMarker_(notes, 'TG_CHAT:' + action.chatId);
        sheet.getRange(i + 1, col.NOTES + 1).setValue(notes);
      }
    }
    telegramSend_(action.chatId,
      'Saved. @' + TELEGRAM_BOT_USERNAME + ' can now DM your VIP invite after admin confirms payment.\nইনভাইট কনফার্মের পর এখানেই পাঠানো হবে।',
      null);
    return;
  }
  telegramSend_(action.chatId,
    'Hi. After @MMHQ_Support verifies payment, Swa taps ✅ and your one-time VIP invite arrives here.\nপেমেন্ট কনফার্মের পর VIP ইনভাইট এখানে আসবে।',
    null);
}

function telegramSend_(chatId, text, replyMarkup, token) {
  if (!chatId || !text) return { ok: false };
  var vip = getTelegramVipChatId_();
  if (isPublicOrVipChat_(chatId, vip, '@TheMethodMafia') && /t\.me\/\+/.test(String(text))) {
    Logger.log('Blocked sending a VIP invite link to VIP/public chat ' + chatId);
    return { ok: false, error: 'refused-public-vip' };
  }
  var payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramApi_('sendMessage', payload, token);
}

function notifyAdminNewPendingOrder_(sheet, row1) {
  var col = telegramResolveCol_(sheet);
  if (!row1 || col.ORDER_ID < 0) return;
  var item = {
    orderId: sheet.getRange(row1, col.ORDER_ID + 1).getValue(),
    name: col.NAME >= 0 ? sheet.getRange(row1, col.NAME + 1).getValue() : '',
    email: col.EMAIL >= 0 ? sheet.getRange(row1, col.EMAIL + 1).getValue() : '',
    telegram: col.TELEGRAM >= 0 ? sheet.getRange(row1, col.TELEGRAM + 1).getValue() : '',
    plan: col.PLAN >= 0 ? sheet.getRange(row1, col.PLAN + 1).getValue() : '',
    amount: col.AMOUNT >= 0 ? sheet.getRange(row1, col.AMOUNT + 1).getValue() : '',
    payment: col.PAYMENT >= 0 ? sheet.getRange(row1, col.PAYMENT + 1).getValue() : ''
  };
  telegramSend_(
    TELEGRAM_ADMIN_CHAT_ID,
    buildAdminPendingOrderMessage_(item),
    buildPendingConfirmKeyboard_(item.orderId)
  );
}

function runTelegramLifecycleHook_(opts) {
  opts = opts || {};
  var sheet = opts.sheet || telegramOrdersSheet_();
  var col = telegramResolveCol_(sheet);
  var data = sheet.getDataRange().getValues();
  var now = opts.now || new Date();
  var today = opts.today || now;
  var token = getTelegramBotToken_();
  if (!token) {
    Logger.log('telegram lifecycle skipped: TELEGRAM_BOT_TOKEN missing');
    return { pay: [], renew: [], kickAsks: [] };
  }

  var pay = planTelegramPayReminders_(data, col, now);
  var renew = planTelegramRenewReminders_(data, col, today);
  var kickList = planKickConfirmList_({
    rows: data,
    col: col,
    baselineYmd: getVipBaselineDate_(),
    joinLog: loadJoinLog_(),
    kickUnpaidJoiners: getVipKickUnpaidJoiners_()
  });
  var kicks = kickList.items || [];
  var i;
  var row1;
  var notes;

  for (i = 0; i < pay.length; i++) {
    row1 = pay[i].rowIndex0 + 1;
    notes = col.NOTES >= 0 ? sheet.getRange(row1, col.NOTES + 1).getValue() : '';
    var payChat = resolveCustomerChatId_(pay[i].telegram, notes, null);
    var payText = buildCustomerPayTelegramMessage_(pay[i]);
    var paySent = false;
    if (payChat) {
      var pRes = telegramSend_(payChat, payText, null, token);
      paySent = !!(pRes && pRes.ok);
    } else {
      telegramSend_(TELEGRAM_ADMIN_CHAT_ID,
        'Pay reminder for ' + pay[i].orderId + ' (' + pay[i].telegram + ') — customer has not /start @' +
        TELEGRAM_BOT_USERNAME + ' yet. Email path (Lifecycle) still applies.\n\n' + payText,
        null, token);
    }
    if (col.NOTES >= 0 && (paySent || !payChat)) {
      sheet.getRange(row1, col.NOTES + 1).setValue(tgNotesAppendMarker_(notes, PAY_TG_MARKER));
    }
  }

  for (i = 0; i < renew.length; i++) {
    row1 = renew[i].rowIndex0 + 1;
    notes = col.NOTES >= 0 ? sheet.getRange(row1, col.NOTES + 1).getValue() : '';
    var renewChat = resolveCustomerChatId_(renew[i].telegram, notes, null);
    var renewText = buildCustomerRenewTelegramMessage_(renew[i]);
    var renewSent = false;
    if (renewChat) {
      var rRes = telegramSend_(renewChat, renewText, null, token);
      renewSent = !!(rRes && rRes.ok);
    }
    if (renewSent && col.NOTES >= 0) {
      sheet.getRange(row1, col.NOTES + 1).setValue(tgNotesAppendMarker_(notes, renew[i].marker));
    }
  }

  if (kicks.length) {
    var listMsg = telegramSend_(
      TELEGRAM_ADMIN_CHAT_ID,
      buildKickConfirmListMessage_(kickList),
      buildKickConfirmListKeyboard_(),
      token
    );
    if (listMsg && listMsg.ok) {
      savePendingKickList_(kicks);
      for (i = 0; i < kicks.length; i++) {
        if (kicks[i].reason !== 'expired' || kicks[i].rowIndex0 == null) continue;
        row1 = kicks[i].rowIndex0 + 1;
        if (col.NOTES >= 0) {
          notes = sheet.getRange(row1, col.NOTES + 1).getValue();
          sheet.getRange(row1, col.NOTES + 1).setValue(tgNotesAppendMarker_(notes, KICK_ASKED_MARKER));
        }
      }
    }
  }

  Logger.log('telegram lifecycle pay=' + pay.length + ' renew=' + renew.length + ' kickList=' + kicks.length);
  return { pay: pay, renew: renew, kickAsks: kicks, kickList: kickList };
}

function buildSetWebhookPayload_(webAppUrl, secret) {
  var payload = {
    url: String(webAppUrl || ''),
    allowed_updates: ['message', 'callback_query', 'chat_member']
  };
  if (secret) payload.secret_token = String(secret);
  return payload;
}

function setTelegramWebhook() {
  var token = getTelegramBotToken_();
  if (!token) {
    throw new Error('Set TELEGRAM_BOT_TOKEN first (setupAdminBotToken_).');
  }
  var url = ScriptApp.getService().getUrl();
  var secret = getTelegramWebhookSecret_();
  var payload = buildSetWebhookPayload_(url, secret);
  var result = telegramApi_('setWebhook', payload, token);
  Logger.log('setWebhook ' + url + ' → ' + JSON.stringify(result));
  return result;
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    TELEGRAM_ADMIN_CHAT_ID: TELEGRAM_ADMIN_CHAT_ID,
    TELEGRAM_BOT_USERNAME: TELEGRAM_BOT_USERNAME,
    DEFAULT_VIP_BASELINE_DATE: DEFAULT_VIP_BASELINE_DATE,
    isUsableTelegramToken_: isUsableTelegramToken_,
    resolveTelegramBotToken_: resolveTelegramBotToken_,
    getTelegramBotTokenFromSources_: getTelegramBotTokenFromSources_,
    telegramWebhookAuthorized_: telegramWebhookAuthorized_,
    isTelegramUpdate_: isTelegramUpdate_,
    isTelegramAdminChat_: isTelegramAdminChat_,
    authorizeAdminCallback_: authorizeAdminCallback_,
    parseCallbackData_: parseCallbackData_,
    parseStartCommand_: parseStartCommand_,
    telegramBuildColMap_: telegramBuildColMap_,
    resolveCustomerChatId_: resolveCustomerChatId_,
    planActivateFromBotConfirm_: planActivateFromBotConfirm_,
    buildCreateChatInviteLinkPayload_: buildCreateChatInviteLinkPayload_,
    isPublicOrVipChat_: isPublicOrVipChat_,
    planVipInviteDelivery_: planVipInviteDelivery_,
    formatVipInviteFailure_: formatVipInviteFailure_,
    planKickExecute_: planKickExecute_,
    parseVipBaselineDate_: parseVipBaselineDate_,
    resolveVipBaselineYmd_: resolveVipBaselineYmd_,
    parseKickUnpaidJoinersFlag_: parseKickUnpaidJoinersFlag_,
    telegramIdentityKey_: telegramIdentityKey_,
    sheetHasActiveRowForIdentity_: sheetHasActiveRowForIdentity_,
    isGrandfatheredByBaseline_: isGrandfatheredByBaseline_,
    isNewSystemMember_: isNewSystemMember_,
    planKickConfirmList_: planKickConfirmList_,
    planKickBatchExecute_: planKickBatchExecute_,
    planJoinLogEntry_: planJoinLogEntry_,
    buildKickConfirmListMessage_: buildKickConfirmListMessage_,
    buildKickConfirmListKeyboard_: buildKickConfirmListKeyboard_,
    buildPendingConfirmKeyboard_: buildPendingConfirmKeyboard_,
    buildKickConfirmKeyboard_: buildKickConfirmKeyboard_,
    buildAdminPendingOrderMessage_: buildAdminPendingOrderMessage_,
    buildAdminKickAskMessage_: buildAdminKickAskMessage_,
    buildCustomerPayTelegramMessage_: buildCustomerPayTelegramMessage_,
    buildCustomerRenewTelegramMessage_: buildCustomerRenewTelegramMessage_,
    resolveCustomerCopyLang_: resolveCustomerCopyLang_,
    buildPremiumVipRenewCopy_: buildPremiumVipRenewCopy_,
    premiumVipRenewPack_: premiumVipRenewPack_,
    planTelegramPayReminders_: planTelegramPayReminders_,
    planTelegramRenewReminders_: planTelegramRenewReminders_,
    planTelegramKickAsks_: planTelegramKickAsks_,
    processTelegramUpdate_: processTelegramUpdate_,
    buildSetWebhookPayload_: buildSetWebhookPayload_,
    tgNotesHasMarker_: tgNotesHasMarker_,
    tgNotesAppendMarker_: tgNotesAppendMarker_
  };
}
