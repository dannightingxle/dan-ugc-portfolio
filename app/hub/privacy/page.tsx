import type { Metadata } from "next";
import { BRAND } from "../_lib/brand";
import { Contact, LegalPage, operator } from "../legal";

export const metadata: Metadata = { title: "Privacy policy", robots: { index: true, follow: true } };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This explains what personal data {BRAND.name} collects, why, and what you can do about it. {BRAND.name} is run by {operator} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;), the controller of your data under UK data protection law. Questions? Contact us via <Contact />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, email address and password. Passwords are stored by our authentication provider in a form we
          can&apos;t read.
        </li>
        <li>
          <strong>What you put in:</strong> projects, briefs, deliverables, notes, links, payment details of your jobs (fees, invoice numbers and
          dates), the contact details of brand contacts you add, and the ads you track. If you add someone else&apos;s details, please make sure
          they&apos;d expect you to keep them.
        </li>
        <li>
          <strong>TrendTrack:</strong> if you connect TrendTrack, your API key and workspace name. The key is only ever used on our servers to fetch
          ad data for you, and is never shown in the app again.
        </li>
        <li>
          <strong>Billing:</strong> payments are handled by Stripe - we never see or store your card details. We keep your Stripe customer reference
          and subscription status, trial and renewal dates.
        </li>
        <li>
          <strong>Usage and feedback:</strong> a record of the TrendTrack lookups you make (to manage costs and limits), and any feedback you send.
        </li>
        <li>
          <strong>Technical data:</strong> anonymous page-view statistics (no cookies, nothing that identifies you) and standard server logs used to
          keep the service secure and working.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide {BRAND.name} to you and run your subscription - necessary to perform our contract with you.</li>
        <li>To keep billing and tax records - a legal obligation.</li>
        <li>To keep the service secure, prevent abuse and fix problems, and to understand how it&apos;s used so we can improve it - our legitimate interests.</li>
        <li>To email you about your account, such as confirmations, password resets and billing - part of providing the service.</li>
      </ul>
      <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>

      <h2>Cookies</h2>
      <p>
        We only use cookies that are strictly necessary to keep you signed in and secure. There are no advertising or tracking cookies, so
        there&apos;s no cookie banner. Our page-view statistics don&apos;t use cookies.
      </p>

      <h2>Who we share it with</h2>
      <p>We use trusted providers to run {BRAND.name}. They process data only on our instructions:</p>
      <ul>
        <li>Supabase - database and sign-in</li>
        <li>Stripe - payments and subscriptions</li>
        <li>Vercel - hosting and anonymous page-view statistics</li>
        <li>Our email provider - account emails such as password resets</li>
        <li>TrendTrack - only if you connect it; requests are made with your own key</li>
      </ul>
      <p>
        Some of these providers store data outside the UK. Where they do, the transfer is protected by safeguards approved under UK law, such as the
        UK International Data Transfer Addendum.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while you have an account. You can delete your account at any time from your account page, which permanently deletes
        your projects, tracked ads and settings straight away (backups are cleared within 30 days). Stripe keeps payment records for as long as
        tax law requires.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct, delete or restrict the use of your data, object to how we use it, or receive it in a portable format - you can
        download everything yourself from your account page at any time. To make a request, contact us via <Contact />. If you&apos;re unhappy
        with how we&apos;ve handled your data, you can complain to the Information Commissioner&apos;s Office at{" "}
        <a href="https://ico.org.uk" target="_blank" rel="noreferrer">
          ico.org.uk
        </a>
        .
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest, and access is locked down so that only you can see your own projects and tracked ads. No system is
        perfectly secure, so please use a strong password you don&apos;t use anywhere else.
      </p>

      <h2>Children</h2>
      <p>{BRAND.name} is for people aged 18 and over.</p>

      <h2>Changes</h2>
      <p>If we make important changes to this policy we&apos;ll tell you by email or in the app before they take effect.</p>
    </LegalPage>
  );
}
