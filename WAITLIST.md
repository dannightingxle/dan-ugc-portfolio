# UGC mentorship waitlist

Live at **`/waitlist`** (e.g. `https://yourdomain.com/waitlist`). It isn't in the
site nav and is set to `noindex`, so people only find it through links you share.

## Files

| What | Where |
| --- | --- |
| Page (headline, copy, bullet points) | `app/waitlist/page.tsx` |
| Form + success message | `app/waitlist/waitlist-form.tsx` |
| Question options (edit these to change answers) | `app/waitlist/questions.ts` |
| Video | `app/waitlist/intro-video.tsx` |
| API that saves submissions | `app/api/waitlist/route.ts` |
| Google Sheet script | `scripts/waitlist-sheet.gs` |

## Add the video

1. Export it as a 9:16 MP4 (H.264, ideally under ~20 MB).
2. Save it as `public/waitlist/intro.mp4`.
3. Optional: a still frame as `public/waitlist/intro.jpg` (shown before play).

Until the file exists, the page shows an "Intro video coming soon" placeholder.

## Connect the Google Sheet (one-off, ~5 minutes)

Submissions go straight into a Google Sheet in your Workspace account.

1. Create a new Google Sheet, e.g. **"UGC Mentorship Waitlist"**.
2. In the sheet: **Extensions → Apps Script**. Delete the starter code and paste
   in everything from `scripts/waitlist-sheet.gs`.
3. Make up a long random password (e.g. from a password manager) and put it in
   the `SECRET` line at the top of the script. Save.
4. **Deploy → New deployment** → type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone** (the secret stops anyone else writing to it)
   - Click Deploy, approve the permissions, and copy the **Web app URL**.
5. In your hosting (Vercel → Project → Settings → Environment Variables) add:
   - `WAITLIST_SHEET_URL` = the Web app URL from step 4
   - `WAITLIST_SHEET_SECRET` = the same secret as step 3
6. Redeploy the site. Submit a test entry - a **Waitlist** tab appears in the
   sheet with headers and your row.

If you later edit the script, use **Deploy → Manage deployments → Edit → New
version** so the URL stays the same.

Until these variables are set, the live form shows an error instead of silently
losing answers (in local dev it just logs submissions to the terminal).

**Email per signup:** in the sheet, *Tools → Notification settings → Edit
notifications* → notify you "when any changes are made".
