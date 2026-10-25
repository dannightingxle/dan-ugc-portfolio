/**
 * "Here's what's in there so far" update email to the UGC mentorship waitlist.
 *
 * Paste this into the waitlist Google Sheet's Apps Script editor (Extensions >
 * Apps Script) as a NEW file, next to the other two, and save. Then:
 *   1. Run sendUpdateEmailTest - sends one copy to you, so you can check it.
 *   2. Run sendUpdateEmails    - sends to everyone on the Waitlist tab.
 *
 * Who it skips:
 *   - Anyone ticked in the "Joined" column. Their email is skipped on every row,
 *     so a person who filled the form in twice is still skipped.
 *   - Rows already stamped in "Update email sent" (so running it twice never
 *     emails anyone twice, and a run that stops halfway can be run again).
 *   - Blank emails, repeats of the same email, and test addresses.
 */

const UPDATE = {
  sheetName: "Waitlist",
  stampColumn: "Update email sent",
  joinedColumn: "Joined",
  fromName: "Dan Nightingale",
  replyTo: "hello@dannightingxle.com",
  subject: "What's inside Anyone Can Create so far",
  community: "https://www.skool.com/anyone-can-create-5406/about",
  mentorshipPage: "https://www.dannightingxle.com/mentorship",
  // Same waitlist discount as the launch email (the code must still exist in Stripe).
  promoCode: "FOUNDER",
  checkout: "https://buy.stripe.com/8x200j53l5GZ4tx5fSfQI06",
  fullPrice: "£497",
  waitlistPrice: "£297",
};

// The email, as sections. Each section is a heading and its bullet points.
const UPDATE_DONE = [
  "Getting set up: the tech I use, setting up your accounts properly, and the apps and tools that make it all quicker.",
  "Tech UGC: what it is, how to find the work, and the exact setup I use to manage it as efficiently as possible.",
];
const UPDATE_STARTED = [
  "Finding work on the platforms: which ones are worth your time and how to get picked.",
  "Positioning yourself through your own social accounts, so brands understand what you do straight away.",
  "Getting inbound: the content that makes brands come to you, instead of you chasing them.",
];
const UPDATE_NEXT = [
  "Making the best content you can: content that wins you clients, and that gets your clients real results, so you keep winning work.",
  "Portfolio content that shows brands exactly what you can do.",
  "Building good relationships with the people you work with, so one brief turns into repeat work.",
];

function updCheckoutLink() {
  return UPDATE.checkout + "?prefilled_promo_code=" + encodeURIComponent(UPDATE.promoCode);
}

function updFirstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}

function updEmailText(first) {
  const bullets = function (items) { return items.map(function (i) { return "- " + i; }).join("\n"); };
  return [
    "Hey " + first + ",",
    "",
    "A quick update on Anyone Can Create, since you're on the waitlist and I said I'd keep you posted.",
    "",
    "I've been filming a lot. Here's where it's at.",
    "",
    "DONE",
    bullets(UPDATE_DONE),
    "",
    "STARTED",
    bullets(UPDATE_STARTED),
    "",
    "COMING NEXT",
    bullets(UPDATE_NEXT),
    "",
    "New lessons keep going in every week, and the free community is where you'll see them first:",
    UPDATE.community,
    "",
    "If you want the full course plus me in your corner (a private WhatsApp group, feedback on your content and pitches, and referrals to the tech UGC companies I work with), everything that's included is here:",
    UPDATE.mentorshipPage,
    "",
    "It's " + UPDATE.fullPrice + ", but as you're on the waitlist you can still join for " + UPDATE.waitlistPrice + ". This link has your discount already applied:",
    updCheckoutLink(),
    "",
    "Any questions, just reply. It comes straight to me.",
    "",
    "Speak soon,",
    "Dan",
  ].join("\n");
}

function updEmailHtml(first) {
  const p = 'style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a"';
  const h = 'style="margin:24px 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#e8551f"';
  const ul = 'style="margin:0 0 16px;padding-left:20px;font-size:16px;line-height:1.55;color:#1a1a1a"';
  const list = function (items) {
    return "<ul " + ul + ">" + items.map(function (i) { return '<li style="margin:0 0 6px">' + i + "</li>"; }).join("") + "</ul>";
  };
  const button = function (href, label) {
    return '<p style="margin:0 0 20px"><a href="' + href + '" style="display:inline-block;background:#ff6b35;color:#0a0a0a;' +
      'font-weight:600;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:999px">' + label + "</a></p>";
  };
  const link = function (href, label) {
    return '<a href="' + href + '" style="color:#e8551f">' + label + "</a>";
  };
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px">',
    "<p " + p + ">Hey " + first + ",</p>",
    "<p " + p + ">A quick update on <strong>Anyone Can Create</strong>, since you're on the waitlist and I said I'd keep you posted.</p>",
    "<p " + p + ">I've been filming a lot. Here's where it's at.</p>",
    "<p " + h + "><strong>Done</strong></p>",
    list(UPDATE_DONE),
    "<p " + h + "><strong>Started</strong></p>",
    list(UPDATE_STARTED),
    "<p " + h + "><strong>Coming next</strong></p>",
    list(UPDATE_NEXT),
    "<p " + p + ">New lessons keep going in every week, and the free community is where you'll see them first:</p>",
    button(UPDATE.community, "Join the free community"),
    "<p " + p + ">If you want the full course plus me in your corner (a private WhatsApp group, feedback on your content and pitches, and referrals to the tech UGC companies I work with), " +
      link(UPDATE.mentorshipPage, "here's everything that's included") + ".</p>",
    "<p " + p + ">It's " + UPDATE.fullPrice + ", but as you're on the waitlist you can still join for <strong>" + UPDATE.waitlistPrice + "</strong>. This link has your discount already applied:</p>",
    button(updCheckoutLink(), "Join for " + UPDATE.waitlistPrice),
    "<p " + p + ">Any questions, just reply. It comes straight to me.</p>",
    "<p " + p + ">Speak soon,<br>Dan</p>",
    "</div>",
  ].join("\n");
}

function updSend(to, name) {
  const first = updFirstName(name);
  GmailApp.sendEmail(to, UPDATE.subject, updEmailText(first), {
    htmlBody: updEmailHtml(first),
    name: UPDATE.fromName,
    replyTo: UPDATE.replyTo,
  });
}

function updIsTestAddress(email) {
  return /@example\.(com|org|net)$/.test(email);
}

function updIsTicked(value) {
  return value === true || /^(true|yes|y|x|✓|✔)$/i.test(String(value).trim());
}

/** Sends one copy to you (the account running the script). Run this first. */
function sendUpdateEmailTest() {
  const me = Session.getEffectiveUser().getEmail();
  updSend(me, "Dan");
  Logger.log("Test sent to " + me);
}

/** Sends to everyone on the Waitlist tab who hasn't joined and hasn't had it yet. */
function sendUpdateEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UPDATE.sheetName);
  if (!sheet) throw new Error('No tab called "' + UPDATE.sheetName + '".');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const nameCol = headers.indexOf("Name");
  const emailCol = headers.indexOf("Email");
  const joinedCol = headers.indexOf(UPDATE.joinedColumn);
  if (nameCol < 0 || emailCol < 0) throw new Error('The first row needs "Name" and "Email" headings.');
  if (joinedCol < 0) throw new Error('No "' + UPDATE.joinedColumn + '" column. Add it and tick everyone who has already signed up.');

  // Everyone ticked as joined, by email, so every row of theirs is skipped.
  const joined = {};
  for (let r = 1; r < values.length; r++) {
    const email = String(values[r][emailCol] || "").trim().toLowerCase();
    if (email && updIsTicked(values[r][joinedCol])) joined[email] = true;
  }

  let stampCol = headers.indexOf(UPDATE.stampColumn);
  if (stampCol < 0) {
    stampCol = headers.length;
    sheet.getRange(1, stampCol + 1).setValue(UPDATE.stampColumn).setFontWeight("bold");
  }

  const seen = {};
  let sent = 0, skippedJoined = 0, skipped = 0, failed = 0;
  for (let r = 1; r < values.length; r++) {
    const email = String(values[r][emailCol] || "").trim().toLowerCase();
    const already = stampCol < values[r].length && values[r][stampCol];
    if (email && joined[email]) { skippedJoined++; continue; }
    if (!email || already || seen[email] || updIsTestAddress(email)) { skipped++; continue; }
    seen[email] = true;
    try {
      updSend(email, values[r][nameCol]);
      sheet.getRange(r + 1, stampCol + 1).setValue(new Date());
      SpreadsheetApp.flush();
      sent++;
    } catch (err) {
      failed++;
      Logger.log("Failed for " + email + ": " + err);
    }
  }
  Logger.log("Sent " + sent + ", skipped " + skippedJoined + " rows of people who've joined, skipped " + skipped +
    " (already sent, blank, duplicate or test), failed " + failed + ".");
}
