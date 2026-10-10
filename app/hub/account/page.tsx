"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "../account-provider";
import { ImportLocal } from "../import-local";
import { useProjects, useStars } from "../_lib/store";
import { browserClient } from "../_lib/supabase/browser";
import { Field, Section, input } from "../projects/fields";
import { BillingSection, DataSection, DeleteSection, TrendTrackSection } from "./sections";
import { FeedbackButton } from "../feedback";
import Link from "next/link";

/* The signed-in creator's account: plan and billing, profile, TrendTrack,
   password, data export, sign out and delete - plus bringing over anything
   saved in this browser before accounts existed. */

export default function AccountPage() {
  return (
    <Suspense>
      <Account />
    </Suspense>
  );
}


function Account() {
  const { enabled, user, billing } = useAccount();
  const params = useSearchParams();
  const resetting = params.get("reset") === "1";
  const { projects } = useProjects();
  const { stars } = useStars();

  if (!enabled || !user) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-10">
        <h1 className="font-serif text-4xl">Account</h1>
        <p className="text-text-muted">Accounts aren&apos;t switched on yet, so everything is saved in this browser.</p>
        <DataSection />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 py-4">
      <div>
        <h1 className="font-serif text-4xl">Account</h1>
        <p className="mt-2 text-text-muted">
          {projects.length} project{projects.length === 1 ? "" : "s"} · {Object.keys(stars).length} tracked ad
          {Object.keys(stars).length === 1 ? "" : "s"}
        </p>
      </div>
      <ImportLocal />
      {resetting && <PasswordSection highlight />}
      <BillingSection />
      <ProfileSection name={user.name} email={user.email} />
      <TrendTrackSection />
      {!resetting && <PasswordSection />}
      <DataSection />
      <Section title="Sign out">
        <button
          type="button"
          onClick={async () => {
            await browserClient().auth.signOut();
            window.location.href = "/hub/login";
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          Sign out
        </button>
      </Section>
      <Section title="Help us improve">
        <p className="text-sm text-text-muted">Found a bug, or wish it did something it doesn&apos;t? We read everything.</p>
        <FeedbackButton className="rounded-lg border border-border px-4 py-2 hover:border-accent hover:text-accent" />
      </Section>
      {billing.owner && (
        <Section title="Owner">
          <Link href="/hub/admin" className="text-sm text-accent hover:underline">
            Open the admin page →
          </Link>
        </Section>
      )}
      <DeleteSection />
    </div>
  );
}

function ProfileSection({ name: initial, email }: { name: string; email: string }) {
  const [name, setName] = useState(initial);
  const [status, setStatus] = useState("");
  return (
    <Section title="Profile">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await browserClient().auth.updateUser({ data: { name } });
          setStatus(error ? error.message : "Saved.");
        }}
      >
        <Field label="Name">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={input} value={email} disabled />
        </Field>
        <div className="flex items-center gap-3">
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">Save</button>
          {status && <span className="text-sm text-text-muted">{status}</span>}
        </div>
      </form>
    </Section>
  );
}

function PasswordSection({ highlight }: { highlight?: boolean }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  return (
    <Section title={highlight ? "Set a new password" : "Password"}>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await browserClient().auth.updateUser({ password });
          setStatus(error ? error.message : "Password updated.");
          if (!error) setPassword("");
        }}
      >
        <input
          className={`${input} !w-auto flex-1`}
          type="password"
          minLength={8}
          required
          autoFocus={highlight}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (8+ characters)"
        />
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">Update</button>
      </form>
      {status && <p className="text-sm text-text-muted">{status}</p>}
    </Section>
  );
}
