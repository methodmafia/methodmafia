/**
 * THE METHOD MAFIA — Pay now invoices
 * =====================================
 * Paste this file into the same Apps Script project as OrderProcessor.gs.
 * Deploy a new web app version (Execute as: Me, Access: Anyone).
 *
 * The website calls:
 *   POST exec?pay=create
 *   body: { orderId, provider }   provider = nowpayments | plisio | whop
 *
 * The browser does not send an amount. This file re-derives the charge
 * from the sheet Plan column (Entry → 30 USD), matching config.js
 * ENTRY_USD. Checkout is refused unless that plan is on PAY_NOW_PLANS_
 * (keep in sync with config.js PAY_NOW.plans; today only "entry").
 * Monthly stays on the Telegram / USDT flow. A query amount, a client
 * amount, and the sheet Amount cell are ignored.
 *
 * Script properties (Project Settings → Script properties). Never put these
 * in config.js or any other website file:
 *   NOWPAYMENTS_API_KEY
 *   PLISIO_API_KEY
 *   WHOP_API_KEY
 *   WHOP_COMPANY_ID     biz_…
 *   WHOP_PRODUCT_ID     optional prod_…
 *
 * Webhook match fields:
 *   NOWPayments  order_id
 *   Plisio       order_number
 *   Whop         metadata.order_id
 */

/* @test-export */

/* Keep in sync with config.js ENTRY_USD ($30) and MONTHLY_USD ($15). */
function planAmountUsd_(plan) {
  var p = String(plan || '').trim().toLowerCase();
  if (p === 'entry') return 30;
  if (p === 'monthly') return 15;
  return 0;
}

/* Only the plan name is read. Other fields on the object are ignored. */
function chargeUsd_(order) {
  return planAmountUsd_(order && order.plan);
}

function isOrderId_(id) {
  return /^MM-\d{4}-\d{4,5}$/.test(String(id || ''));
}

/* Keep in sync with config.js PAY_NOW.plans. Non-entry is refused. */
var PAY_NOW_PLANS_ = ['entry'];

function payNowPlanAllowed_(plan) {
  var key = String(plan || '').trim().toLowerCase();
  if (!key) return false;
  for (var i = 0; i < PAY_NOW_PLANS_.length; i++) {
    if (String(PAY_NOW_PLANS_[i] || '').trim().toLowerCase() === key) return true;
  }
  return false;
}

function nowpaymentsInvoiceBody_(orderId, amountUsd, plan) {
  return {
    price_amount: amountUsd,
    price_currency: 'usd',
    order_id: String(orderId || ''),
    order_description: 'The Method Mafia ' + String(plan || '') + ' ' + String(orderId || '')
  };
}

function plisioInvoiceParams_(orderId, amountUsd, plan) {
  return {
    source_currency: 'USD',
    source_amount: amountUsd,
    order_number: String(orderId || ''),
    order_name: 'The Method Mafia ' + String(plan || '')
  };
}

function whopCheckoutBody_(orderId, amountUsd, companyId, plan, productId) {
  var planBody = {
    company_id: String(companyId || ''),
    initial_price: amountUsd,
    plan_type: 'one_time',
    currency: 'usd',
    force_create_new_plan: true,
    title: 'The Method Mafia ' + String(plan || '')
  };
  if (productId) planBody.product_id = String(productId);
  return {
    mode: 'payment',
    metadata: { order_id: String(orderId || '') },
    plan: planBody
  };
}

function whopIdempotencyKey_(orderId) {
  return 'checkout-' + String(orderId || '');
}

function publicCheckoutUrl_(value) {
  var s = String(value || '').trim();
  if (!s) return '';
  if (s.charAt(0) === '/' && s.indexOf('//') !== 0) s = 'https://whop.com' + s;
  if (!/^https:\/\//i.test(s)) return '';
  try {
    var u = new URL(s);
    if (u.protocol !== 'https:') return '';
    u.searchParams.delete('api_key');
    u.searchParams.delete('apikey');
    u.searchParams.delete('token');
    return u.toString();
  } catch (e) {
    return '';
  }
}

function checkoutUrlFromProvider_(provider, json) {
  if (!json || typeof json !== 'object') return '';
  var raw = '';
  if (provider === 'nowpayments') raw = json.invoice_url;
  else if (provider === 'plisio') raw = json.data && json.data.invoice_url;
  else if (provider === 'whop') raw = json.purchase_url;
  return publicCheckoutUrl_(raw);
}

/* @test-export-end */

function paymentJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseProviderJson_(text) {
  try {
    var v = JSON.parse(text || '');
    return (v && typeof v === 'object') ? v : null;
  } catch (e) {
    return null;
  }
}

function plisioRequestUrl_(params, apiKey) {
  var url = 'https://api.plisio.net/api/v1/invoices/new?api_key=' + encodeURIComponent(apiKey);
  Object.keys(params || {}).forEach(function(key) {
    url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  });
  return url;
}

/**
 * Public. No admin token. Looks up the order, then prices it from Plan.
 * The response is { ok, url, provider, orderId } or { ok:false, error }.
 * Provider errors are not echoed — they can contain a request URL.
 */
function handleCreatePayment_(params) {
  var orderId = String((params && params.orderId) || '').trim().toUpperCase();
  var provider = String((params && params.provider) || '').trim().toLowerCase();
  if (!isOrderId_(orderId)) return paymentJson_({ ok: false, error: 'bad_order' });
  if (provider !== 'nowpayments' && provider !== 'plisio' && provider !== 'whop') {
    return paymentJson_({ ok: false, error: 'bad_provider' });
  }

  var sheet;
  try {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
            || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  } catch (err) {
    return paymentJson_({ ok: false, error: 'sheet' });
  }

  var row = findOrderRow(sheet, orderId);
  if (!row) return paymentJson_({ ok: false, error: 'not_found', orderId: orderId });

  var plan = sheet.getRange(row, COL.PLAN + 1).getValue();
  if (!payNowPlanAllowed_(plan)) {
    return paymentJson_({ ok: false, error: 'plan_not_allowed', orderId: orderId });
  }
  var amount = chargeUsd_({ plan: plan });
  if (!amount) return paymentJson_({ ok: false, error: 'unknown_plan', orderId: orderId });

  var url = '';
  try {
    url = createProviderCheckoutUrl_(provider, orderId, amount, plan);
  } catch (err) {
    url = '';
  }
  if (!url) {
    return paymentJson_({ ok: false, error: 'not_configured', orderId: orderId, provider: provider });
  }
  return paymentJson_({ ok: true, url: url, provider: provider, orderId: orderId });
}

function createProviderCheckoutUrl_(provider, orderId, amount, plan) {
  var props = PropertiesService.getScriptProperties();

  if (provider === 'nowpayments') {
    var key = props.getProperty('NOWPAYMENTS_API_KEY');
    if (!key) return '';
    var res = UrlFetchApp.fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key },
      muteHttpExceptions: true,
      payload: JSON.stringify(nowpaymentsInvoiceBody_(orderId, amount, plan))
    });
    return checkoutUrlFromProvider_('nowpayments', parseProviderJson_(res.getContentText()));
  }

  if (provider === 'plisio') {
    var pkey = props.getProperty('PLISIO_API_KEY');
    if (!pkey) return '';
    var pres = UrlFetchApp.fetch(plisioRequestUrl_(plisioInvoiceParams_(orderId, amount, plan), pkey), {
      method: 'get',
      muteHttpExceptions: true
    });
    return checkoutUrlFromProvider_('plisio', parseProviderJson_(pres.getContentText()));
  }

  if (provider === 'whop') {
    var wkey = props.getProperty('WHOP_API_KEY');
    var companyId = props.getProperty('WHOP_COMPANY_ID');
    if (!wkey || !companyId) return '';
    var productId = props.getProperty('WHOP_PRODUCT_ID') || '';
    var wres = UrlFetchApp.fetch('https://api.whop.com/api/v1/checkout_configurations', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + wkey,
        'Idempotency-Key': whopIdempotencyKey_(orderId)
      },
      muteHttpExceptions: true,
      payload: JSON.stringify(whopCheckoutBody_(orderId, amount, companyId, plan, productId))
    });
    return checkoutUrlFromProvider_('whop', parseProviderJson_(wres.getContentText()));
  }

  return '';
}
