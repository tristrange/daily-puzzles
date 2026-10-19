# Free leaderboard setup

The backend is prepared; the app integration and public leaderboard are not live
yet. These steps prepare the free provider projects. Players will not need
accounts, but you need maintainer accounts to own the infrastructure.

## 1. Create a Supabase Free project

1. Sign in at [Supabase](https://supabase.com/dashboard).
2. Create or select an organization on the **Free** plan. A project created in a
   paid organization inherits that organization's plan, so check this explicitly.
3. Create a project named `daily-puzzles-leaderboard`, selecting a nearby EU
   region. Generate a strong database password and keep it in your password
   manager. Do not send it in chat or commit it.
4. Wait for the project to finish provisioning. Confirm the organization still
   shows Free. Do not select Pro, paid add-ons or a trial requiring an upgrade.
5. Find the **Project URL** and **publishable API key** in the project's Connect
   dialog/API settings. These are intended for public clients. A legacy `anon`
   key can serve the same client role; a secret or `service_role` key cannot.

Do not invent tables by hand. After the backend PR is merged, open Supabase's
SQL Editor and run the complete contents of
[`001_leaderboards.sql`](../backend/leaderboard/migrations/001_leaderboards.sql)
once. It creates the tables, private rate counter and restricted RPC functions
in one transaction. Reapplying it fails without dropping the existing data.
Never run `tests/auth-fixture.sql` on Supabase: that file belongs only in the
disposable local test database. Configure CAPTCHA before enabling anonymous
sign-ins; the provider toggles alone do not activate publishing in the app.

## 2. Prepare free signup protection

Supabase recommends CAPTCHA protection for anonymous sign-ups to reduce abuse
of database capacity. Its Auth service supports Cloudflare Turnstile, which has
a free plan and does not require moving the puzzle site away from GitHub Pages.

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) and open **Turnstile**.
   Choose the free offering; do not buy hosting or a domain.
2. Add a widget named `daily-puzzles-leaderboard` for `tristrange.github.io`, using
   the Managed widget type. Enter the hostname without a URL path.
3. Keep the **site key** for the frontend. Keep the **secret key** private.
4. After applying the backend migration, configure Supabase Authentication's CAPTCHA
   protection to use Turnstile and enter the secret there. Then enable anonymous
   sign-ins. The secret never belongs in the app or the repository.

The local SQL tests do not use hosted credentials or CAPTCHA. The later app
slice will supply the frontend test setup. Do not weaken the production widget
or put a production secret into a test file.

## 3. Values we will use

Once the projects exist, the following public values can be shared for wiring
up the implementation:

- Supabase Project URL, such as `https://<project-ref>.supabase.co`.
- Supabase **publishable** API key, not the secret/service-role key.
- Turnstile **site** key, not its secret key.

The eventual Pages build uses these public repository variables:

| GitHub Actions variable | Browser build variable |
| --- | --- |
| `SUPABASE_URL` | `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `TURNSTILE_SITE_KEY` | `VITE_TURNSTILE_SITE_KEY` |

Catalog synchronization also requires a server-only `SUPABASE_SECRET_KEY` in
GitHub's **Settings → Secrets and variables → Actions → Secrets**. Use a new
`sb_secret_...` key from Supabase API settings. Add it directly in GitHub; do not
paste it into chat. PR checks and the browser build do not receive it.

Set `SUPABASE_URL` as a repository variable after applying the migration, then
add the secret. The next normal main deployment synchronizes all committed
puzzle IDs before building Pages. A sync failure emits a workflow warning and
publishing continues, so a paused leaderboard cannot stop new daily puzzles.
The next deployment retries; you can also rerun synchronization manually. Without
a secret, current deployment is unchanged. Public app integration waits
for the later app PR, so leave its other two variables unset until activation.

For manual catalog synchronization, load the URL and server secret into your
terminal environment privately and run:

```sh
node backend/leaderboard/sync-catalog.mjs
```

It sends only puzzle ID, game/date, dimensions and size label. It does not send
boards or solutions, delete old entries, create projects or change any plan.
The server key uses the `apikey` header; it is not a player JWT.

## Local verification

With Docker Desktop running, from the repository root:

```sh
node --test backend/leaderboard/sync-catalog.test.mjs
bash backend/leaderboard/test.sh
```

The SQL script owns a new `postgres:17` container and removes it afterward. It
accepts no database URL, exposes no host port and cannot run against a hosted
database. A test-only Auth fixture supplies the roles and `auth.uid()` context;
the checks exercise real PostgreSQL permissions, rankings, duplicates, owner
deletion, write limits and concurrent first submissions. They do not prove
Supabase HTTP authentication or CAPTCHA; two real anonymous sessions remain
required before public launch. No new npm/Python packages are needed here.

## 4. Activation and rollback

After the schema and app PRs are reviewed and merged:

1. Apply the versioned migration and run its database checks.
2. Configure CAPTCHA and anonymous sign-ins; leave paid options disabled.
3. Add the server-only GitHub secret and synchronize the known puzzle catalog.
4. Set the three public GitHub variables and deploy the app.
5. Check two separate anonymous sessions, rankings and failed/offline requests.

Removing the three public variables and redeploying disables cloud features
without deleting local progress, Stats or hosted results. Provider outages and
quota restrictions should not require a rollback just to keep playing.

## 5. Cost and availability

Remain on Free. Supabase applies service restrictions when free quotas are
persistently exceeded; it can also pause a project after a low-activity week.
Resume a paused project from the dashboard if needed. No automatic paid upgrade
or artificial keep-alive job is part of this design. Free hosting does not
include an uptime guarantee, and provider terms can change.

Sources: [Supabase pricing](https://supabase.com/pricing),
[free quota policy](https://supabase.com/docs/guides/platform/billing-faq#what-will-happen-when-i-exceed-the-free-plan-quota),
[pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
[API key roles](https://supabase.com/docs/guides/getting-started/api-keys),
[CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha), and
[Turnstile plans](https://developers.cloudflare.com/turnstile/plans/).
