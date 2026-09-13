/**
 * THE METHOD MAFIA — Meta CAPI + TikTok Events API
 * =================================================
 * Sends Purchase / CompletePayment when an Entry order becomes Active.
 * Value is ALWAYS 30 USD. Monthly is never sent.
 *
 * Secrets (Script Properties — never hardcode tokens):
 *   META_PIXEL_ID
 *   META_ACCESS_TOKEN
 *   TIKTOK_PIXEL_ID
 *   TIKTOK_ACCESS_TOKEN
 * Optional (test events in Ads Manager):
 *   META_TEST_EVENT_CODE
 *   TIKTOK_TEST_EVENT_CODE
 *
 * Installable trigger (required — simple onEdit cannot call UrlFetchApp):
 *   Triggers → Add Trigger → onOrderStatusEdit → From spreadsheet → On edit
 *
 * See GUIDE.md → PART 9.
 */

var CAPI_PURCHASE_SENT  = 'PURCHASE_SENT';
var CAPI_PURCHASE_VALUE = 30;

function getCapiProps_() {
  var p = PropertiesService.getScriptProperties();
  return {
    metaPixel: p.getProperty('META_PIXEL_ID') || '',
    metaToken: p.getProperty('META_ACCESS_TOKEN') || '',
    ttPixel:   p.getProperty('TIKTOK_PIXEL_ID') || '',
    ttToken:   p.getProperty('TIKTOK_ACCESS_TOKEN') || '',
    metaTest:  p.getProperty('META_TEST_EVENT_CODE') || '',
    ttTest:    p.getProperty('TIKTOK_TEST_EVENT_CODE') || ''
  };
}

function sha256Hex_(value) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return raw.map(function(b) {
    var v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function capiShouldSend_(status, plan, notes) {
  if (String(status || '').trim().toLowerCase() !== 'active') return false;
  if (String(plan || '').trim().toLowerCase() !== 'entry') return false;
  if (String(notes || '').toUpperCase().indexOf(CAPI_PURCHASE_SENT) !== -1) return false;
  return true;
}

function capiAppendSentNote_(notes) {
  var cur = String(notes || '').trim();
  if (cur.toUpperCase().indexOf(CAPI_PURCHASE_SENT) !== -1) return cur;
  return cur ? (cur + ' | ' + CAPI_PURCHASE_SENT) : CAPI_PURCHASE_SENT;
}

function trySendPurchaseForRow_(sheet, row) {
  var status = sheet.getRange(row, COL.STATUS + 1).getValue();
  var plan   = sheet.getRange(row, COL.PLAN + 1).getValue();
  var notes  = sheet.getRange(row, COL.NOTES + 1).getValue();
  if (!capiShouldSend_(status, plan, notes)) {
    return { sent: false, reason: 'skip' };
  }

  var orderId  = String(sheet.getRange(row, COL.ORDER_ID + 1).getValue() || '');
  var email    = String(sheet.getRange(row, COL.EMAIL + 1).getValue() || '');
  var telegram = String(sheet.getRange(row, COL.TELEGRAM + 1).getValue() || '');
  var fbclid   = String(sheet.getRange(row, COL.FBCLID + 1).getValue() || '');
  var ttclid   = String(sheet.getRange(row, COL.TTCLID + 1).getValue() || '');

  var results = sendPurchaseCapi_({
    orderId: orderId,
    email: email,
    telegram: telegram,
    fbclid: fbclid,
    ttclid: ttclid
  });

  if (capiShouldMarkSent_(results)) {
    sheet.getRange(row, COL.NOTES + 1).setValue(capiAppendSentNote_(notes));
  }

  Logger.log('CAPI Purchase ' + orderId + ': ' + JSON.stringify(results));
  return { sent: true, results: results };
}

function capiShouldMarkSent_(results) {
  var attempted = [];
  if (results.meta && results.meta !== 'skipped') attempted.push(results.meta);
  if (results.tiktok && results.tiktok !== 'skipped') attempted.push(results.tiktok);
  if (!attempted.length) return false;
  for (var i = 0; i < attempted.length; i++) {
    if (attempted[i] !== 'ok') return false;
  }
  return true;
}

function sendPurchaseCapi_(opts) {
  var props = getCapiProps_();
  var eventTime = Math.floor(Date.now() / 1000);
  var email = String(opts.email || '').trim().toLowerCase();
  var telegram = String(opts.telegram || '').trim();
  var out = { meta: 'skipped', tiktok: 'skipped' };

  if (props.metaPixel && props.metaToken) {
    out.meta = sendMetaPurchase_(props, opts, eventTime, email, telegram);
  }
  if (props.ttPixel && props.ttToken) {
    out.tiktok = sendTikTokPurchase_(props, opts, eventTime, email, telegram);
  }
  return out;
}

function sendMetaPurchase_(props, opts, eventTime, email, telegram) {
  var userData = {};
  if (email) userData.em = [sha256Hex_(email)];
  if (telegram) userData.external_id = [sha256Hex_(telegram)];
  if (opts.fbclid) userData.fbc = 'fb.1.' + eventTime + '.' + opts.fbclid;

  var payload = {
    data: [{
      event_name: 'Purchase',
      event_time: eventTime,
      event_id: opts.orderId || '',
      event_source_url: 'https://themethodmafia.com/',
      action_source: 'website',
      user_data: userData,
      custom_data: {
        value: CAPI_PURCHASE_VALUE,
        currency: 'USD',
        content_name: 'Entry'
      }
    }]
  };
  if (props.metaTest) payload.test_event_code = props.metaTest;

  var url = 'https://graph.facebook.com/v18.0/' +
            encodeURIComponent(props.metaPixel) +
            '/events?access_token=' + encodeURIComponent(props.metaToken);
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    Logger.log('Meta CAPI ' + code + ' ' + res.getContentText());
    return (code >= 200 && code < 300) ? 'ok' : 'error';
  } catch (err) {
    Logger.log('Meta CAPI error: ' + err.message);
    return 'error';
  }
}

function sendTikTokPurchase_(props, opts, eventTime, email, telegram) {
  var user = {};
  if (email) user.email = sha256Hex_(email);
  if (telegram) user.external_id = sha256Hex_(telegram);
  if (opts.ttclid) user.ttclid = opts.ttclid;

  var payload = {
    event_source: 'web',
    event_source_id: props.ttPixel,
    data: [{
      event: 'CompletePayment',
      event_time: eventTime,
      event_id: opts.orderId || '',
      user: user,
      page: { url: 'https://themethodmafia.com/' },
      properties: {
        value: CAPI_PURCHASE_VALUE,
        currency: 'USD',
        content_name: 'Entry'
      }
    }]
  };
  if (props.ttTest) payload.test_event_code = props.ttTest;

  try {
    var res = UrlFetchApp.fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Access-Token': props.ttToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    Logger.log('TikTok Events API ' + code + ' ' + res.getContentText());
    return (code >= 200 && code < 300) ? 'ok' : 'error';
  } catch (err) {
    Logger.log('TikTok Events API error: ' + err.message);
    return 'error';
  }
}

/**
 * Installable trigger target. Do not rename without updating GUIDE.md.
 * Simple onEdit cannot call UrlFetchApp — this must be installed.
 */
function onOrderStatusEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (typeof SHEET_NAME !== 'undefined' && sheet.getName() !== SHEET_NAME) return;
  var startCol = e.range.getColumn();
  var endCol = startCol + e.range.getNumColumns() - 1;
  var statusCol = COL.STATUS + 1;
  if (statusCol < startCol || statusCol > endCol) return;

  var start = e.range.getRow();
  var n = e.range.getNumRows();
  for (var r = start; r < start + n; r++) {
    if (r < 2) continue;
    try {
      trySendPurchaseForRow_(sheet, r);
    } catch (err) {
      Logger.log('onOrderStatusEdit row ' + r + ': ' + err.message);
    }
  }
}

/**
 * Run once from the Apps Script editor to verify tokens.
 * Sends a TEST event (not a real order). Optional: set META_TEST_EVENT_CODE.
 */
function testCapiConnection() {
  var result = sendPurchaseCapi_({
    orderId: 'TEST-' + Date.now(),
    email: 'test@themethodmafia.com',
    telegram: '@mm_test',
    fbclid: '',
    ttclid: ''
  });
  Logger.log(JSON.stringify(result));
}
