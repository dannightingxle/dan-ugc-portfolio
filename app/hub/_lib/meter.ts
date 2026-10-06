/* Usage metering - the hook for billing each creator for their own TrendTrack
   usage. Every live call is attributed to a user and logged with the rows it
   returned (TrendTrack charges per row). In the demo there is one user and the
   log goes to the server console; with a database this becomes an insert into
   a usage table that Stripe metered billing reads from. */

export function meter(user: string, endpoint: string, rows: number) {
  console.log(JSON.stringify({ at: new Date().toISOString(), user, endpoint, rows }));
}
