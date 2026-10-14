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
  ["Dream outcome", "wishlist"],
  ["How they want to learn", "formats"],
  ["Would pay (one-time)", "price"],
  ["14-day guarantee", "guarantee"],
  ["Community platform", "community"],
  ["Anything else", "notes"],
];

// New-member intros from dannightingxle.com/start and the "You're in" pages.
// The site sends them with kind "onboarding"; they go on their own tab.
const ONBOARDING_SHEET_NAME = "Onboarding";
const ONBOARDING_COLUMNS = [
  ["Submitted", "submittedAt"],
  ["Name", "name"],
  ["Email", "email"],
  ["TikTok", "tiktok"],
  ["Instagram", "instagram"],
  ["Other socials", "otherSocials"],
  ["Portfolio", "portfolio"],
  ["Doing UGC for", "experience"],
  ["Where they're at", "stage"],
  ["Paid jobs so far", "paidJobs"],
  ["Hours / week", "hours"],
  ["Help with first", "helpFirst"],
  ["Hoping to achieve", "goal"],
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

  const onboarding = data.kind === "onboarding";
  const columns = onboarding ? ONBOARDING_COLUMNS : COLUMNS;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(onboarding ? ONBOARDING_SHEET_NAME : SHEET_NAME, columns);
    const row = columns.map(([, key]) => {
      const v = data[key];
      if (key === "submittedAt") return v ? new Date(v) : new Date();
      return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
    });
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  notify(data, columns, onboarding ? "New member intro: " : "New waitlist signup: ");
  // The site checks "kind" to know this version of the script filed it on the right tab.
  return reply({ ok: true, kind: onboarding ? "onboarding" : "waitlist" });
}

// Emails you each signup. Run testEmail once from the editor to approve the
// email permission and see what it looks like.
function notify(data, columns, subjectPrefix) {
  columns = columns || COLUMNS;
  subjectPrefix = subjectPrefix || "New waitlist signup: ";
  try {
    const lines = columns.slice(1).map(([heading, key]) => {
      const v = data[key];
      return heading + ": " + (Array.isArray(v) ? v.join(", ") : v || "-");
    });
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      replyTo: data.email,
      subject: subjectPrefix + data.name,
      body: lines.join("\n\n") + "\n\nSheet: " + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    });
  } catch (err) {
    console.error("Notification email failed", err);
  }
}

function testEmail() {
  notify({ name: "Test Person", email: "test@example.com", stage: "Haven't started yet", struggles: ["Knowing what to charge"] });
}

function getSheet(name, columns) {
  name = name || SHEET_NAME;
  columns = columns || COLUMNS;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns.map(([heading]) => heading));
    sheet.getRange(1, 1, 1, columns.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
