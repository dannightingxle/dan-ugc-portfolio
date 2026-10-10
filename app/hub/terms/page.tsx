import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "../_lib/brand";
import { Contact, LegalPage, operator } from "../legal";

export const metadata: Metadata = { title: "Terms", robots: { index: true, follow: true } };

export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms are an agreement between you and {operator}, who runs {BRAND.name}. By creating an account you agree to them, and to our{" "}
        <Link href="/hub/privacy">privacy policy</Link>. Questions? Contact us via <Contact />.
      </p>

      <h2>Who can use {BRAND.name}</h2>
      <p>
        You must be 18 or over. {BRAND.name} is a tool for running your content creation work, and you use it for that business (including as a
        sole trader or freelancer). One account is for one person - please don&apos;t share your login.
      </p>

      <h2>Free trial and subscription</h2>
      <ul>
        <li>
          To start, you add a payment card and begin a free trial. The trial length is shown before you add your card - for example, a founding offer
          for our earliest members, or our standard trial. One free trial per person.
        </li>
        <li>
          <strong>Unless you cancel before your trial ends, your subscription starts automatically and your card is charged</strong> the price
          shown when you signed up. It then renews automatically each billing period until you cancel.
        </li>
        <li>Prices include VAT where it applies. If we change the price, we&apos;ll tell you at least 30 days before it affects you.</li>
        <li>If a payment fails, we&apos;ll ask you to update your card. If it can&apos;t be collected, your access may be paused until it is.</li>
      </ul>

      <h2>Cancelling</h2>
      <p>
        You can cancel at any time from your account page (Account → Manage billing). If you cancel during your free trial you won&apos;t be
        charged. If you cancel a paid subscription, you keep access until the end of the period you&apos;ve paid for. We don&apos;t refund part
        periods, except where the law says we must. You can download your data before you go, and delete your account whenever you like.
      </p>

      <h2>Your content</h2>
      <p>
        Everything you add - projects, briefs, notes, contacts - stays yours. You give us permission to store and process it only so we can provide
        {" "}{BRAND.name} to you. You&apos;re responsible for what you add, including having the right to store other people&apos;s contact details.
      </p>

      <h2>TrendTrack and ad data</h2>
      <p>
        Ad data comes from TrendTrack through your own TrendTrack account, and your use of TrendTrack is covered by their terms. {BRAND.name} isn&apos;t
        affiliated with TrendTrack, Meta or any brand shown. Figures such as reach and estimated spend are estimates from third parties and may not be
        accurate - please don&apos;t rely on them as exact.
      </p>

      <h2>Fair use</h2>
      <p>
        Please don&apos;t use {BRAND.name} for anything unlawful, try to access other people&apos;s data, overload or disrupt the service, scrape it,
        or get around its limits. We may suspend accounts that do.
      </p>

      <h2>The service</h2>
      <p>
        We work hard to keep {BRAND.name} running smoothly and your data safe, but we can&apos;t promise it will always be available or error-free,
        and features may change as we improve it. Keep your own copies of anything important - you can export your data at any time.
      </p>

      <h2>Liability</h2>
      <p>
        Nothing in these terms limits liability that can&apos;t legally be limited, such as for fraud, or for death or personal injury caused by
        negligence. Otherwise, we aren&apos;t liable for indirect or consequential losses, or for lost profits, income, deals or data, and our total
        liability to you is limited to the amount you&apos;ve paid us in the 12 months before the claim.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can stop using {BRAND.name} and delete your account at any time. We may suspend or close an account that breaks these terms or
        doesn&apos;t pay, and we&apos;ll give notice where we reasonably can.
      </p>

      <h2>Changes and the law</h2>
      <p>
        If we change these terms in a way that matters, we&apos;ll tell you before the change takes effect. These terms are governed by the law of
        England and Wales, and the courts of England and Wales have jurisdiction.
      </p>
    </LegalPage>
  );
}
