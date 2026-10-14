/**
 * "We're live" email to the UGC mentorship waitlist.
 *
 * Paste this into the waitlist Google Sheet's Apps Script editor (Extensions >
 * Apps Script) as a NEW file, next to the existing waitlist script, and save.
 * Then:
 *   1. Run sendLiveEmailTest  - sends one copy to you, so you can check it.
 *   2. Run sendLiveEmails     - sends to everyone on the Waitlist tab.
 *
 * It sends from whichever Google account runs it (use hello@dannightingxle.com).
 * Each row is stamped in a "Live email sent" column the moment its email goes,
 * so running it twice never emails anyone twice, and a run that stops halfway
 * can simply be run again.
 */

const LIVE = {
  sheetName: "Waitlist",
  stampColumn: "Live email sent",
  fromName: "Dan Nightingale",
  replyTo: "hello@dannightingxle.com",
  subject: "Anyone Can Create is live (and your waitlist price)",
  // Links
  community: "https://www.skool.com/anyone-can-create-5406/about",
  mentorshipPage: "https://www.dannightingxle.com/mentorship",
  // The £200-off promo code for waitlist members. It must exist in Stripe and the
  // mentorship payment link must have "Allow promotion codes" switched on.
  promoCode: "FOUNDER",
  checkout: "https://buy.stripe.com/8x200j53l5GZ4tx5fSfQI06",
  fullPrice: "£497",
  waitlistPrice: "£297",
};

// The P.S. about the tech UGC briefs. Plain sentences, used in both versions of the email.
const LIVE_PS = [
  "P.S. One of the first things I'm getting set up is the Tech UGC module, because I'm working with an agency that's looking for creators for quite a few briefs right now. Join today and you'd get access to those straight away.",
  "They pay $20 per video, one video a day. Do the maths and that covers the cost of the mentorship in about three weeks. Not a promise... but I'm not not saying it either.",
];

function liveCheckoutLink() {
  return LIVE.checkout + "?prefilled_promo_code=" + encodeURIComponent(LIVE.promoCode);
}

function liveFirstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}

function liveEmailText(first) {
  return [
    "Hey " + first + ",",
    "",
    "It's live. Anyone Can Create is open, and as promised, you're hearing about it first.",
    "",
    "The Skool community is up and I'm adding resources to it bit by bit. There are already a few things in there for you to go through, starting with The A to Z of UGC. It's a compact run-through of what the whole course covers: what UGC is, where the money is, and how I'd start from zero today. It's free, just join the community:",
    LIVE.community,
    "",
    "The course then digs into all of it in much greater detail, with new lessons going in every week.",
    "",
    "If you want to go all in, the mentorship is open too: the full course, a private WhatsApp group with me, feedback on your content, scripts and pitches, and referrals to the tech UGC companies I work with. Everything that's included is here:",
    LIVE.mentorshipPage,
    "",
    "It'll be " + LIVE.fullPrice + ", but because you were on the waitlist you can join for " + LIVE.waitlistPrice + ". This link has your discount already applied:",
    liveCheckoutLink(),
    "",
    "Any questions at all, just reply to this email. It comes straight to me.",
    "",
    "Speak soon,",
    "Dan",
    "",
    LIVE_PS[0],
    "",
    LIVE_PS[1],
  ].join("\n");
}

function liveEmailHtml(first) {
  const p = 'style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a"';
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
    "<p " + p + ">It's live. <strong>Anyone Can Create</strong> is open, and as promised, you're hearing about it first.</p>",
    "<p " + p + ">The Skool community is up and I'm adding resources to it bit by bit. There are already a few things in there for you to go through, starting with <strong>The A to Z of UGC</strong>. It's a compact run-through of what the whole course covers: what UGC is, where the money is, and how I'd start from zero today. It's free, just join the community:</p>",
    button(LIVE.community, "Join the free community"),
    "<p " + p + ">The course then digs into all of it in much greater detail, with new lessons going in every week.</p>",
    "<p " + p + ">If you want to go all in, the mentorship is open too: the full course, a private WhatsApp group with me, feedback on your content, scripts and pitches, and referrals to the tech UGC companies I work with. " +
      link(LIVE.mentorshipPage, "See everything that's included") + ".</p>",
    "<p " + p + ">It'll be " + LIVE.fullPrice + ", but because you were on the waitlist you can join for <strong>" + LIVE.waitlistPrice + "</strong>. This link has your discount already applied:</p>",
    button(liveCheckoutLink(), "Join for " + LIVE.waitlistPrice),
    "<p " + p + ">Any questions at all, just reply to this email. It comes straight to me.</p>",
    "<p " + p + ">Speak soon,<br>Dan</p>",
    "<p " + p + "><strong>P.S.</strong> " + LIVE_PS[0].replace("P.S. ", "") + "</p>",
    "<p " + p + ">" + LIVE_PS[1] + "</p>",
    "</div>",
  ].join("\n");
}

function liveSend(to, name) {
  const first = liveFirstName(name);
  GmailApp.sendEmail(to, LIVE.subject, liveEmailText(first), {
    htmlBody: liveEmailHtml(first),
    name: LIVE.fromName,
    replyTo: LIVE.replyTo,
  });
}

/** Sends one copy to you (the account running the script). Run this first. */
function sendLiveEmailTest() {
  const me = Session.getEffectiveUser().getEmail();
  liveSend(me, "Dan");
  Logger.log("Test sent to " + me);
}

/** Sends to everyone on the Waitlist tab who hasn't had it yet. */
function sendLiveEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LIVE.sheetName);
  if (!sheet) throw new Error('No tab called "' + LIVE.sheetName + '".');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const nameCol = headers.indexOf("Name");
  const emailCol = headers.indexOf("Email");
  if (nameCol < 0 || emailCol < 0) throw new Error('The first row needs "Name" and "Email" headings.');

  let stampCol = headers.indexOf(LIVE.stampColumn);
  if (stampCol < 0) {
    stampCol = headers.length;
    sheet.getRange(1, stampCol + 1).setValue(LIVE.stampColumn).setFontWeight("bold");
  }

  const seen = {};
  let sent = 0, skipped = 0, failed = 0;
  for (let r = 1; r < values.length; r++) {
    const email = String(values[r][emailCol] || "").trim().toLowerCase();
    const already = stampCol < values[r].length && values[r][stampCol];
    if (!email || already || seen[email]) { skipped++; continue; }
    seen[email] = true;
    try {
      liveSend(email, values[r][nameCol]);
      sheet.getRange(r + 1, stampCol + 1).setValue(new Date());
      SpreadsheetApp.flush();
      sent++;
    } catch (err) {
      failed++;
      Logger.log("Failed for " + email + ": " + err);
    }
  }
  Logger.log("Sent " + sent + ", skipped " + skipped + " (already sent, blank or duplicate), failed " + failed + ".");
}
