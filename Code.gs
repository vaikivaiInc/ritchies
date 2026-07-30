/**
 * Ritchie's — Order/Contact form backend (Google Apps Script)
 *
 * SETUP (see chat for full instructions):
 * 1. Create a Google Sheet, open Extensions > Apps Script, paste this file in.
 * 2. Deploy > New deployment > Web app > Execute as "Me", Who has access "Anyone".
 * 3. Copy the resulting /exec URL and send it back so it can be wired into
 *    contact.html in place of the current FormSubmit integration.
 */

var NOTIFY_EMAIL = 'ritchie.ramdass@vaikivai.ca';
var SHEET_NAME = 'Orders'; // tab name inside the spreadsheet

// Ceiling on customer confirmation emails per day. This endpoint is public
// (it has to be, for the site's fetch() call to reach it), so without a cap
// someone could script repeated submissions with an arbitrary "Email" value
// and turn this into a mail relay against people who never contacted the
// business. A generous daily cap protects the account without affecting any
// realistic day of actual orders.
var MAX_CUSTOMER_EMAILS_PER_DAY = 50;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Honeypot — if this hidden field got filled in, it's almost certainly a
    // bot. Pretend success so bots don't retry, but don't log or email it.
    if (data._honey) {
      return jsonResponse({ result: 'success' });
    }

    var sheet = getSheet();
    var timestamp = new Date();

    sheet.appendRow([
      timestamp,
      data.Name || '',
      data.Email || '',
      data['Event Type'] || '',
      data.Message || '',
      'New'
    ]);

    // The row is saved at this point — that's the source of truth for
    // success. A failed notification email should never turn an already
    // -saved submission into an error response (the customer would just
    // resubmit and create a duplicate row for an order that went through).
    // Each notification is wrapped separately so one failing never blocks
    // the other.
    try {
      notifyOwner(data, timestamp);
    } catch (notifyErr) {
      // Swallow — the submission is already safely logged in the sheet.
    }

    try {
      notifyCustomer(data);
    } catch (customerErr) {
      // Swallow for the same reason — plus this call may intentionally
      // no-op (invalid email, daily cap reached), which isn't an error.
    }

    return jsonResponse({ result: 'success' });
  } catch (err) {
    return jsonResponse({ result: 'error', message: err.message });
  }
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Name', 'Email', 'Event Type', 'Message', 'Status']);
  }
  return sheet;
}

function notifyOwner(data, timestamp) {
  var subject = "New message from the Ritchie's website";
  var body =
    'New submission received at ' + timestamp.toLocaleString() + '\n\n' +
    'Name: ' + (data.Name || '') + '\n' +
    'Email: ' + (data.Email || '') + '\n' +
    'Event Type: ' + (data['Event Type'] || '') + '\n\n' +
    'Message:\n' + (data.Message || '') + '\n\n' +
    '— Logged automatically to the Orders sheet.';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    body: body,
    replyTo: data.Email || NOTIFY_EMAIL
  });
}

function notifyCustomer(data) {
  // Only send to something that at least looks like a real email address,
  // and only while under today's send cap. Both checks fail silently (no
  // throw) since skipping the confirmation is not an error condition.
  if (!isValidEmail(data.Email)) return;
  if (!consumeCustomerEmailQuota()) return;

  var subject = "Your order has been received — Ritchie's";
  var body =
    'Hi ' + (data.Name || 'there') + ',\n\n' +
    "Your order has been placed! A member of our team will reach out shortly to confirm payment and next steps.\n\n" +
    "Here's a copy of what you sent us:\n\n" + (data.Message || '') + '\n\n' +
    "— Ritchie's\n" +
    'ritchie.ramdass@vaikivai.ca | (416) 938-9465';

  MailApp.sendEmail({
    to: data.Email,
    subject: subject,
    body: body,
    replyTo: NOTIFY_EMAIL
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Simple day-scoped counter stored in the project's script properties.
// Returns true (and consumes one slot) if today's cap hasn't been hit yet.
function consumeCustomerEmailQuota() {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var storedDate = props.getProperty('CUSTOMER_EMAIL_DATE');
  var count = parseInt(props.getProperty('CUSTOMER_EMAIL_COUNT'), 10) || 0;

  if (storedDate !== today) {
    count = 0;
    props.setProperty('CUSTOMER_EMAIL_DATE', today);
  }

  if (count >= MAX_CUSTOMER_EMAILS_PER_DAY) {
    return false;
  }

  props.setProperty('CUSTOMER_EMAIL_COUNT', String(count + 1));
  return true;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
