/**
 * Waitlist -> Google Sheet
 *
 * Paste this into the sheet's Apps Script editor (Extensions > Apps Script),
 * set SECRET to the same value as WAITLIST_SHEET_SECRET on the website, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Full steps are in WAITLIST.md.
 */

const SECRET = "paste-the-same-secret-as-WAITLIST_SHEET_SECRET";
const SHEET_NAME = "Waitlist";

// [column heading, field sent by the site]
const COLUMNS = [
  ["Submitted", "submittedAt"],
  ["Name", "name"],
  ["Email", "email"],
  ["Handle", "handle"],
  ["Where they're at", "stage"],
  ["Goal", "goal"],
  ["Hours / week", "hours"],
  ["Biggest struggles", "struggles"],
  ["Want the course to cover", "wishlist"],
  ["How they want to learn", "formats"],
  ["Would pay (one-time)", "price"],
  ["14-day guarantee", "guarantee"],
  ["Community platform", "community"],
  ["Anything else", "notes"],
];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "Bad JSON" });
  }
  if (data.secret !== SECRET) return reply({ ok: false, error: "Unauthorised" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet();
    const row = COLUMNS.map(([, key]) => {
      const v = data[key];
      if (key === "submittedAt") return v ? new Date(v) : new Date();
      return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
    });
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(([heading]) => heading));
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
