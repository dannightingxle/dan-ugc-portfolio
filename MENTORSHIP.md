# Selling the mentorship and the course

| Page | Address | Who sees it |
| --- | --- | --- |
| Mentorship sales page | `/mentorship` | Everyone: link it from Skool's About page, the pinned post, the A to Z and the trailers |
| Course-only page | `/course` | Only people you send it to. Not in the nav, not on Google |
| Mentorship thank-you | `/mentorship/welcome` | Where Stripe sends mentorship buyers |
| Course thank-you | `/course/welcome` | Where Stripe sends course buyers |

Prices, the two Stripe links and the Skool group link all live in
`app/mentorship/offer.ts`. Until a link is pasted in, its button says
"Opening soon". The course outline on both pages is in the same file.

Payments go straight to Stripe, not through Skool, so Skool takes no cut. They
don't touch Creator Desk either: its webhook only looks at subscriptions.

## Make the two payment links (10 minutes)

Do this in **Test mode** first, buy each one with card `4242 4242 4242 4242`,
then repeat in **Live mode** (test links don't copy over).

**Stripe → Product catalogue → Add product**

| | Mentorship | Course |
| --- | --- | --- |
| Name | Anyone Can Create Mentorship | Anyone Can Create Course |
| Price | £497, **One-off** | Your price, **One-off** |

**Stripe → Payment Links → New**, pick the product, then under **Options**:

| Setting | Mentorship | Course | Why |
| --- | --- | --- | --- |
| Collect customers' phone numbers | **On** | Off | To add them to WhatsApp |
| Add custom field: "Email for Skool (if different)" (text, optional) | **On** | **On** | So you can find them in Skool if they signed up with another email |
| Add custom field: "Instagram or TikTok handle" (text, optional) | On | Optional | Handy for feedback |
| Allow promotion codes | **On** | On | Founding-member discount codes for the waitlist |
| Limit the number of payments | Optional | Off | If you want to cap mentorship spots |

**After payment** → *Don't show confirmation page* → redirect to:

- Mentorship: `https://www.dannightingxle.com/mentorship/welcome`
- Course: `https://www.dannightingxle.com/course/welcome`

Copy each link (`https://buy.stripe.com/...`) into `checkoutUrl` in
`app/mentorship/offer.ts`, add the Skool group link to `skoolUrl`, and redeploy.

**Get told about every sale:** Stripe → your profile → *Communication
preferences* → turn on emails for **successful payments**. The Stripe phone
app sends a notification for each one too.

## When someone pays

Stripe → **Payments** → open the payment. You'll see the product, their name,
email, phone number and the custom fields.

**Mentorship**

1. Find them in the Skool group (check the "Email for Skool" field if they gave one). If they haven't joined yet, send them the group link.
2. Classroom → **Anyone Can Create** → add them to the private course. Do the same for the **Mentorship hub**.
3. Add them to the WhatsApp group (or approve their request to join).
4. Send a quick welcome message.

**Course**

1. Find them in the Skool group.
2. Add them to the private **Anyone Can Create** course.

Later, Zapier (or a small automation on this site) can do these steps when a
payment comes in.
