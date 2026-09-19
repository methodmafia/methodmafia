'use strict';

/**
 * @MM_OrdersBot — Option A (Swa locked). One bot only.
 * Pure helpers in apps-script/TelegramBot.gs plus source/GUIDE guards.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TG_PATH = path.join(__dirname, '..', 'apps-script', 'TelegramBot.gs');
const OP_PATH = path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs');
const CAPI_PATH = path.join(__dirname, '..', 'apps-script', 'CapiPurchase.gs');
const GUIDE_PATH = path.join(__dirname, '..', 'GUIDE.md');

const tg = require(TG_PATH);

const LIVE_HEADERS = [
  'Timestamp', 'Order ID', 'Name', 'Email', 'Telegram', 'Plan', 'Amount',
  'Source', 'Status', 'Expiry', 'Days Left', 'Payment', 'Notes', 'FBclid', 'TTclid'
];
const OLD_HEADERS = [
  'Timestamp', 'Order ID', 'Name', 'Email', 'Telegram', 'Plan', 'Amount',
  'Payment', 'Source', 'Medium', 'Campaign', 'Status', 'Expiry', 'Days Left',
  'Notes', 'FBclid', 'TTclid'
];

const NOW = new Date('2026-09-19T12:00:00.000Z');
const TODAY = new Date('2026-09-19T00:00:00.000Z');
const ADMIN = '7581392046';

function liveCol() {
  return tg.telegramBuildColMap_(LIVE_HEADERS);
}

function liveRow(overrides) {
  const col = liveCol();
  const r = [
    '2026-09-16T14:59:10.481Z', 'MM-2026-3007', 'Felix', 'felix@example.com',
    '@digitalbaymm', 'Entry', '$30', 'direct', 'Pending', '2026-10-16', 27, 'bKash',
    '', '', ''
  ];
  Object.keys(overrides || {}).forEach(function (key) {
    const idx = col[key];
    if (idx == null || idx < 0) throw new Error('unknown col ' + key);
    r[idx] = overrides[key];
  });
  return r;
}

test('token comes only from Script Properties or process env — never a hardcoded bot token', () => {
  assert.equal(tg.resolveTelegramBotToken_('', ''), '');
  assert.equal(tg.resolveTelegramBotToken_('CHANGE_ME_NOW', ''), '');
  assert.equal(tg.resolveTelegramBotToken_('', 'CHANGE_ME'), '');
  assert.equal(tg.resolveTelegramBotToken_('  123456:ABCdef-real  ', 'other'), '123456:ABCdef-real');
  assert.equal(tg.resolveTelegramBotToken_('', 'env-token-value'), 'env-token-value');
  assert.equal(
    tg.getTelegramBotTokenFromSources_({ TELEGRAM_BOT_TOKEN: 'from-props' }, { TELEGRAM_BOT_TOKEN: 'from-env' }),
    'from-props'
  );
  assert.equal(
    tg.getTelegramBotTokenFromSources_({}, { TELEGRAM_BOT_TOKEN: 'from-env' }),
    'from-env'
  );
  assert.equal(tg.getTelegramBotTokenFromSources_({}, {}), '');

  const gs = fs.readFileSync(TG_PATH, 'utf8');
  assert.match(gs, /function setupAdminBotToken_/);
  assert.match(gs, /TELEGRAM_BOT_TOKEN/);
  assert.match(gs, /PropertiesService\.getScriptProperties/);
  assert.doesNotMatch(gs, /\d{8,}:[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(gs, /bot[0-9]{8,}:[A-Za-z0-9_-]+/);
});

test('isTelegramUpdate_ detects webhook bodies and ignores website order posts', () => {
  assert.equal(tg.isTelegramUpdate_({ update_id: 42, message: { text: 'hi' } }), true);
  assert.equal(tg.isTelegramUpdate_({ update_id: 1, callback_query: { id: '9' } }), true);
  assert.equal(tg.isTelegramUpdate_({ orderId: 'MM-2026-3007', telegram: '@x', email: 'a@b.c' }), false);
  assert.equal(tg.isTelegramUpdate_(null), false);
  assert.equal(tg.isTelegramUpdate_({}), false);
});

test('webhook secret is optional; when set it must match', () => {
  assert.equal(tg.telegramWebhookAuthorized_('', ''), true);
  assert.equal(tg.telegramWebhookAuthorized_('abc', ''), true);
  assert.equal(tg.telegramWebhookAuthorized_('abc', 'abc'), true);
  assert.equal(tg.telegramWebhookAuthorized_('nope', 'abc'), false);
  assert.equal(tg.telegramWebhookAuthorized_('', 'abc'), false);
});

test('admin notify chat is 7581392046; @MMHQ_Support is not the bot', () => {
  assert.equal(String(tg.TELEGRAM_ADMIN_CHAT_ID), ADMIN);
  assert.equal(tg.isTelegramAdminChat_(ADMIN), true);
  assert.equal(tg.isTelegramAdminChat_(Number(ADMIN)), true);
  assert.equal(tg.isTelegramAdminChat_('123'), false);
  assert.equal(tg.isTelegramAdminChat_(''), false);
  const gs = fs.readFileSync(TG_PATH, 'utf8');
  assert.match(gs, /@MM_OrdersBot/);
  assert.doesNotMatch(gs, /MM_Remind|RemindBot|@MM_Remind/i);
  assert.match(gs, /MMHQ_Support/);
});

test('callback_data parses confirm / dismiss / kick-yes / kick-no for an Order ID', () => {
  assert.deepEqual(tg.parseCallbackData_('c:MM-2026-4821'), { action: 'confirm', orderId: 'MM-2026-4821' });
  assert.deepEqual(tg.parseCallbackData_('x:MM-2026-4821'), { action: 'dismiss', orderId: 'MM-2026-4821' });
  assert.deepEqual(tg.parseCallbackData_('k:MM-2026-4821'), { action: 'kick', orderId: 'MM-2026-4821' });
  assert.deepEqual(tg.parseCallbackData_('n:MM-2026-4821'), { action: 'kick-cancel', orderId: 'MM-2026-4821' });
  assert.equal(tg.parseCallbackData_('c:MM-2026-4821').orderId.length + 2 <= 64, true);
  assert.equal(tg.parseCallbackData_('hello'), null);
  assert.equal(tg.parseCallbackData_(''), null);
});

test('only the admin chat may confirm a pending order or kick', () => {
  const ok = tg.authorizeAdminCallback_({ fromId: ADMIN, chatId: ADMIN });
  assert.equal(ok.ok, true);
  const stranger = tg.authorizeAdminCallback_({ fromId: '999', chatId: '999' });
  assert.equal(stranger.ok, false);
  assert.match(stranger.reason, /admin/i);
});

test('bot ✅ on Pending sets Active and requests CAPI + one-time VIP; already Active does not re-fire', () => {
  const pending = tg.planActivateFromBotConfirm_({ status: 'Pending', plan: 'Entry', notes: '' });
  assert.equal(pending.ok, true);
  assert.equal(pending.newStatus, 'Active');
  assert.equal(pending.callCapi, true);
  assert.equal(pending.createVipInvite, true);

  const verifying = tg.planActivateFromBotConfirm_({ status: 'Verifying', plan: 'Monthly', notes: '' });
  assert.equal(verifying.ok, true);
  assert.equal(verifying.callCapi, true);

  const active = tg.planActivateFromBotConfirm_({
    status: 'Active',
    plan: 'Entry',
    notes: 'Activated | PURCHASE_SENT | VIP_INVITE_SENT'
  });
  assert.equal(active.ok, false);
  assert.equal(active.reason, 'already-active');
  assert.equal(active.callCapi, false);
  assert.equal(active.createVipInvite, false);

  const rejected = tg.planActivateFromBotConfirm_({ status: 'reject', plan: 'Entry', notes: '' });
  assert.equal(rejected.ok, false);
});

test('createChatInviteLink is one-time (member_limit=1) and never exportChatInviteLink', () => {
  const payload = tg.buildCreateChatInviteLinkPayload_('-1001234567890', 'MM-2026-4821');
  assert.equal(payload.chat_id, '-1001234567890');
  assert.equal(payload.member_limit, 1);
  assert.equal(payload.name, 'MM-2026-4821');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'creates_join_request'), false);

  const gs = fs.readFileSync(TG_PATH, 'utf8');
  assert.match(gs, /createChatInviteLink/);
  assert.doesNotMatch(gs, /exportChatInviteLink/);
  assert.doesNotMatch(gs, /member_limit\s*[:=]\s*0/);
});

test('VIP invite send targets customer or admin DM — never the VIP/public channel', () => {
  const vipChat = '-100999888777';
  const customer = tg.planVipInviteDelivery_({
    inviteLink: 'https://t.me/+AbCdEfOneTime',
    customerChatId: '111222',
    adminChatId: ADMIN,
    vipChatId: vipChat,
    publicChannelId: '@TheMethodMafia'
  });
  assert.equal(customer.ok, true);
  assert.equal(customer.chatId, '111222');
  assert.notEqual(customer.chatId, vipChat);
  assert.match(customer.text, /t\.me\/\+/);

  const fallback = tg.planVipInviteDelivery_({
    inviteLink: 'https://t.me/+AbCdEfOneTime',
    customerChatId: '',
    adminChatId: ADMIN,
    vipChatId: vipChat,
    publicChannelId: '@TheMethodMafia'
  });
  assert.equal(fallback.ok, true);
  assert.equal(String(fallback.chatId), ADMIN);
  assert.match(fallback.text, /forward|privately|\/start/i);
  assert.doesNotMatch(fallback.text, /TheMethodMafia1/i);

  assert.equal(tg.isPublicOrVipChat_(vipChat, vipChat, '@TheMethodMafia'), true);
  assert.equal(tg.isPublicOrVipChat_(ADMIN, vipChat, '@TheMethodMafia'), false);
  assert.equal(tg.isPublicOrVipChat_('111222', vipChat, '@TheMethodMafia'), false);
});

test('VIP invite failure logs a clear Manager/Swa admin-the-bot instruction', () => {
  const msg = tg.formatVipInviteFailure_({
    description: 'Bad Request: not enough rights to manage chat invites',
    error_code: 400
  });
  assert.match(msg, /@MM_OrdersBot/);
  assert.match(msg, /admin/i);
  assert.match(msg, /VIP/i);
  assert.match(msg, /Invite users via link|invite/i);
  assert.match(msg, /Swa|Manager/i);
});

test('header col map finds live Status column I and the older Payment-before-Status layout', () => {
  const live = tg.telegramBuildColMap_(LIVE_HEADERS);
  assert.equal(live.STATUS, 8);
  assert.equal(live.ORDER_ID, 1);
  assert.equal(live.TELEGRAM, 4);
  assert.equal(live.NOTES, 12);
  const old = tg.telegramBuildColMap_(OLD_HEADERS);
  assert.equal(old.STATUS, 11);
  assert.equal(old.PAYMENT, 7);
  assert.equal(old.NOTES, 14);
});

test('customer chat id resolves from numeric Telegram field or TG_CHAT notes — not from @username alone', () => {
  assert.equal(tg.resolveCustomerChatId_('847112233', ''), '847112233');
  assert.equal(tg.resolveCustomerChatId_('@rakib_h', 'Activated | TG_CHAT:847112233'), '847112233');
  assert.equal(tg.resolveCustomerChatId_('@rakib_h', '', { rakib_h: '847112233' }), '847112233');
  assert.equal(tg.resolveCustomerChatId_('@rakib_h', ''), '');
});

test('pay/renew TG jobs select Pending>24h and Active 3/2/1 without double-send markers', () => {
  const col = liveCol();
  const oldTs = new Date(NOW.getTime() - 30 * 3600 * 1000).toISOString();
  const youngTs = new Date(NOW.getTime() - 10 * 3600 * 1000).toISOString();
  const rows = [
    LIVE_HEADERS,
    liveRow({ ORDER_ID: 'MM-PAY', STATUS: 'Pending', TIMESTAMP: oldTs, NOTES: '', TELEGRAM: '@payme' }),
    liveRow({ ORDER_ID: 'MM-YOUNG', STATUS: 'Pending', TIMESTAMP: youngTs, NOTES: '', TELEGRAM: '@young' }),
    liveRow({ ORDER_ID: 'MM-PAYDONE', STATUS: 'Pending', TIMESTAMP: oldTs, NOTES: 'PAY_TG_SENT', TELEGRAM: '@done' }),
    liveRow({
      ORDER_ID: 'MM-R3', STATUS: 'Active', EXPIRY: '2026-09-22', NOTES: 'PURCHASE_SENT',
      TELEGRAM: '@r3', EMAIL: 'r3@example.com'
    }),
    liveRow({
      ORDER_ID: 'MM-R3D', STATUS: 'Active', EXPIRY: '2026-09-22', NOTES: 'RENEW_TG_3',
      TELEGRAM: '@r3d', EMAIL: 'r3d@example.com'
    }),
    liveRow({
      ORDER_ID: 'MM-R1', STATUS: 'Active', EXPIRY: '2026-09-20', NOTES: '',
      TELEGRAM: '@r1', EMAIL: 'r1@example.com'
    })
  ];
  const pay = tg.planTelegramPayReminders_(rows, col, NOW);
  assert.deepEqual(pay.map((p) => p.orderId), ['MM-PAY']);
  const renew = tg.planTelegramRenewReminders_(rows, col, TODAY);
  const renewIds = renew.map((p) => p.orderId).sort();
  assert.deepEqual(renewIds, ['MM-R1', 'MM-R3']);
  assert.equal(renew.filter((p) => p.orderId === 'MM-R3')[0].marker, 'RENEW_TG_3');
  assert.equal(renew.filter((p) => p.orderId === 'MM-R1')[0].marker, 'RENEW_TG_1');
});

test('customer pay/renew Telegram copy is private Method Mafia tone and has no public VIP link', () => {
  const pay = tg.buildCustomerPayTelegramMessage_({
    name: 'Rakib',
    orderId: 'MM-2026-4821',
    telegram: '@rakib_h'
  });
  assert.match(pay, /Rakib|MM-2026-4821|@MMHQ_Support/i);
  assert.doesNotMatch(pay, /t\.me\/\+/);
  assert.doesNotMatch(pay, /TheMethodmafia1/i);

  const renew = tg.buildCustomerRenewTelegramMessage_({
    name: 'Felix',
    daysLeft: 3,
    expiry: '2026-09-22'
  });
  assert.match(renew, /Felix/);
  assert.match(renew, /3/);
  assert.match(renew, /Method Mafia/i);
  assert.doesNotMatch(renew, /t\.me\/\+/);
  assert.doesNotMatch(renew, /kick|ban/i);
});

test('kick is confirm-first: job only asks admin; ban runs only after admin k: callback', () => {
  const col = liveCol();
  const rows = [
    LIVE_HEADERS,
    liveRow({ ORDER_ID: 'MM-EXP', STATUS: 'Expired', EXPIRY: '2026-09-18', TELEGRAM: '@gone', NOTES: 'PURCHASE_SENT' }),
    liveRow({ ORDER_ID: 'MM-ASKED', STATUS: 'Expired', EXPIRY: '2026-09-01', TELEGRAM: '@asked', NOTES: 'KICK_ASKED' }),
    liveRow({ ORDER_ID: 'MM-LIVE', STATUS: 'Active', EXPIRY: '2026-10-16', TELEGRAM: '@live', NOTES: 'PURCHASE_SENT' })
  ];
  const asks = tg.planTelegramKickAsks_(rows, col, TODAY);
  assert.deepEqual(asks.map((a) => a.orderId), ['MM-EXP']);
  assert.equal(asks[0].executeKick, false);

  const askMsg = tg.buildAdminKickAskMessage_(asks[0]);
  assert.match(askMsg, /confirm/i);
  assert.match(askMsg, /MM-EXP/);
  const kb = tg.buildKickConfirmKeyboard_('MM-EXP');
  const flat = JSON.stringify(kb);
  assert.match(flat, /k:MM-EXP/);
  assert.match(flat, /n:MM-EXP/);

  const allowed = tg.planKickExecute_({ status: 'Expired', notes: 'KICK_ASKED', telegramUserId: '555' });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.method, 'banChatMember');
  assert.equal(allowed.userId, '555');

  const refuseActive = tg.planKickExecute_({ status: 'Active', notes: 'KICK_ASKED', telegramUserId: '555' });
  assert.equal(refuseActive.ok, false);

  const refuseNoConfirm = tg.planKickExecute_({ status: 'Expired', notes: '', telegramUserId: '555' });
  assert.equal(refuseNoConfirm.ok, false);
  assert.match(refuseNoConfirm.reason, /confirm/i);
});

test('new pending order admin message has ✅ confirm button and no VIP invite link', () => {
  const msg = tg.buildAdminPendingOrderMessage_({
    orderId: 'MM-2026-4821',
    name: 'রাকিব হাসান',
    email: 'rakib@gmail.com',
    telegram: '@rakib_h',
    plan: 'Entry',
    amount: '$30',
    payment: 'বিকাশ'
  });
  assert.match(msg, /MM-2026-4821/);
  assert.match(msg, /@rakib_h/);
  assert.match(msg, /Entry/);
  assert.match(msg, /screenshot|SS|@MMHQ_Support/i);
  assert.doesNotMatch(msg, /t\.me\/\+/);
  const kb = tg.buildPendingConfirmKeyboard_('MM-2026-4821');
  assert.match(JSON.stringify(kb), /c:MM-2026-4821/);
});

test('processTelegramUpdate_ confirm from admin returns activate + capi + vip actions', () => {
  const update = {
    update_id: 9,
    callback_query: {
      id: 'cb1',
      from: { id: Number(ADMIN) },
      message: { chat: { id: Number(ADMIN) }, message_id: 70 },
      data: 'c:MM-2026-4821'
    }
  };
  const plan = tg.processTelegramUpdate_(update, {
    secretProvided: '',
    secretStored: '',
    getOrder: function () {
      return {
        orderId: 'MM-2026-4821',
        status: 'Pending',
        plan: 'Entry',
        notes: '',
        telegram: '@rakib_h',
        name: 'Rakib',
        row1: 4
      };
    }
  });
  assert.equal(plan.ok, true);
  const types = plan.actions.map((a) => a.type);
  assert.ok(types.indexOf('activate') !== -1);
  assert.ok(types.indexOf('capi') !== -1);
  assert.ok(types.indexOf('vipInvite') !== -1);
  assert.ok(types.indexOf('answerCallback') !== -1);
});

test('processTelegramUpdate_ rejects confirm from a non-admin chat', () => {
  const update = {
    update_id: 10,
    callback_query: {
      id: 'cb2',
      from: { id: 1 },
      message: { chat: { id: 1 }, message_id: 2 },
      data: 'c:MM-2026-4821'
    }
  };
  const plan = tg.processTelegramUpdate_(update, {
    getOrder: function () {
      return { orderId: 'MM-2026-4821', status: 'Pending', plan: 'Entry', notes: '', row1: 4 };
    }
  });
  assert.equal(plan.ok, false);
  assert.equal((plan.actions || []).some((a) => a.type === 'activate'), false);
});

test('OrderProcessor keeps organize dual-write and hooks Telegram without a second bot; CAPI $30 intact', () => {
  const opSrc = fs.readFileSync(OP_PATH, 'utf8');
  const capi = fs.readFileSync(CAPI_PATH, 'utf8');
  const op = require(OP_PATH);
  assert.equal(op.DIGEST_EMAIL, 'methodmafia.hq@gmail.com');
  assert.equal(op.COL.STATUS, 8);
  assert.equal(op.COL.NOTES, 12);
  assert.match(opSrc, /upsertNewOrderToOrganizeTabs_/);
  assert.match(opSrc, /applyColMapFromSheet_/);
  assert.match(opSrc, /isTelegramUpdate_/);
  assert.match(opSrc, /handleTelegramWebhook_/);
  assert.match(opSrc, /notifyAdminNewPendingOrder_/);
  assert.match(opSrc, /runTelegramLifecycleHook_/);
  assert.match(opSrc, /trySendPurchaseForRow_/);
  const webhookIdx = opSrc.indexOf('isTelegramUpdate_');
  const organizeIdx = opSrc.indexOf('upsertNewOrderToOrganizeTabs_');
  assert.ok(webhookIdx !== -1 && organizeIdx !== -1 && webhookIdx < organizeIdx);
  assert.match(capi, /function trySendPurchaseForRow_/);
  assert.match(capi, /CAPI_PURCHASE_VALUE\s*=\s*30/);
  assert.doesNotMatch(opSrc, /MM_Remind|TELEGRAM_REMIND_BOT/);
  assert.doesNotMatch(capi, /createChatInviteLink|MM_OrdersBot/);
  assert.match(opSrc, /DIGEST_EMAIL/);
});

test('GUIDE PART 13 documents setWebhook, Script Properties, VIP admin, Bangla+EN', () => {
  const guide = fs.readFileSync(GUIDE_PATH, 'utf8');
  assert.match(guide, /PART 13/);
  assert.match(guide, /@MM_OrdersBot/);
  assert.match(guide, /setWebhook/);
  assert.match(guide, /TELEGRAM_BOT_TOKEN/);
  assert.match(guide, /setupAdminBotToken_/);
  assert.match(guide, /7581392046/);
  assert.match(guide, /TELEGRAM_VIP_CHAT_ID/);
  assert.match(guide, /Invite users via link|invite users via link/i);
  assert.match(guide, /member_limit/);
  assert.match(guide, /বাংলা|Bangla/);
  assert.doesNotMatch(guide, /MM_RemindBot|second Remind bot/i);
});
