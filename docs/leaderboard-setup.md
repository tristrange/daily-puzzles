# Free leaderboard setup

The backend and app integration are merged, and the hosted project is active.
These steps remain the reproducible setup guide for the free provider projects.
Players will not need accounts, but you need maintainer accounts to own the
infrastructure.

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

Do not invent tables by hand. Open Supabase's SQL Editor and run the complete
contents of
[`001_leaderboards.sql`](../backend/leaderboard/migrations/001_leaderboards.sql)
once. It creates the tables, private rate counter and restricted RPC functions
in one transaction. Reapplying it fails without dropping the existing data.
Then apply [`002_tents.sql`](../backend/leaderboard/migrations/002_tents.sql)
and [`003_sudoku.sql`](../backend/leaderboard/migrations/003_sudoku.sql)
to support all seven puzzle families before synchronizing the catalog.
Never run `tests/auth-fixture.sql` on Supabase: that file belongs only in the
disposable local test database. Configure CAPTCHA before enabling anonymous
sign-ins; the provider toggles alone do not activate publishing in the app.

### Upgrade an existing project for Tents

Before deploying the Tents release, open the existing Supabase project's **SQL
Editor**, create a new query, paste the complete contents of
[`backend/leaderboard/migrations/002_tents.sql`](../backend/leaderboard/migrations/002_tents.sql)
and click **Run**. Do not rerun `001_leaderboards.sql`. The upgrade replaces only
the three puzzle-family checks in one transaction, validates existing rows, and
can be run again safely. Existing catalog entries, results, rate limits, RLS,
RPC functions and privileges remain intact. A failed upgrade rolls back the
whole transaction; resolve the reported error before deploying.

After the upgrade succeeds, deploy the release normally. Its trusted catalog
sync registers the committed `YYYY-MM-DD-tents` IDs with width and height 10.
Existing deployed app versions remain compatible throughout this order. Confirm
an existing game's ranking still loads and a published Tents solve can be
submitted and read back.

For rollback, redeploy the previous app version and leave `002` applied. Its
expanded checks are compatible with the older catalog sync and app, and this
preserves any Tents results already submitted. Do not drop Tents catalog rows,
delete results, rerun `001`, or restore the narrower checks once Tents data
exists. Disabling cloud features via the public build variables remains an
option if needed.

### Upgrade an existing project for daily Sudoku

Before merging or deploying the daily Sudoku release, open the existing
Supabase project's **SQL Editor**, create a new query, paste the complete contents
of [`003_sudoku.sql`](../backend/leaderboard/migrations/003_sudoku.sql), and click
**Run**. Apply `002_tents.sql` first if it has not already been applied. Do not
rerun `001_leaderboards.sql`.

Migration `003` replaces only five catalog check constraints in one transaction:
the permitted family, canonical ID, date/family pairing, permitted size label,
and ID/label pairing. Sudoku IDs require `-sudoku-easy`, `-sudoku-medium` or
`-sudoku-hard`; each requires 9x9 dimensions and its matching Easy, Medium or
Hard label. An unsized `-sudoku` ID is rejected. Existing catalog rows, results,
rate limits, RLS, grants and RPC signatures remain intact. It validates existing
rows and can be retried safely, including after Sudoku scores have been stored.
A failure rolls back the whole transaction; resolve the error before deploying.

After the migration succeeds, merge and deploy normally. The trusted catalog
sync registers each committed level separately. Confirm an existing game's
ranking still loads and each Sudoku level has its own ranking. For rollback,
redeploy the previous app and leave `003` applied; preserve Sudoku catalog rows
and scores and keep the expanded constraints.

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

The local SQL tests do not use hosted credentials or CAPTCHA. Do not weaken the production widget
or put a production secret into a test file.

## 3. Values we will use

Once the projects exist, the following public values can be shared for wiring
up the implementation:

- Supabase Project URL, such as `https://<project-ref>.supabase.co`.
- Supabase **publishable** API key, not the secret/service-role key.
- Turnstile **site** key, not its secret key.

The trusted main Pages build uses these public repository variables:

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
a secret, catalog synchronization is skipped. Missing public build variables
disable leaderboard features while local play remains available.

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
deletion, write limits and concurrent first submissions.
The harness tests a clean `001` + `002` + `003` install and seeded upgrades from
`001` through `002` and `003`, including repeated migrations, unchanged
rows/security/RPCs, retained Tents and Sudoku scores, separate Sudoku levels and
rejection of mismatched family/ID/level metadata. These checks do not prove
Supabase HTTP authentication or CAPTCHA; the two real anonymous sessions in the
activation checks below cover those. No new npm/Python packages are needed here.

## 4. Activation and rollback

For local hosted signup checks, explicitly add `localhost` to the same widget's
Hostname Management: select **Add Hostnames**, enter the bare hostname, click
**Add**, confirm it appears in the list, then save. Do not include a scheme,
path or port. Reopen settings to confirm it persisted. Remove this temporary
hostname after testing. Keep CAPTCHA enabled; dummy test tokens cannot be
validated with the production secret. See Cloudflare's
[hostname instructions](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
and [local testing guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

Local app preview with public configuration:

```sh
cd app
# Set only the three public VITE_* variables from the table above.
BASE_PATH=/daily-puzzles/ npm run build
BASE_PATH=/daily-puzzles/ npm run preview -- --host localhost --port 4174
```

Open `http://localhost:4174/daily-puzzles/`. Separate localhost ports have separate
browser identities and can be used for the two-session check. Never put server
or Turnstile secret keys in a `VITE_*` variable or a committed environment file.

Setup evidence on October 20: anonymous sign-ins are enabled; the maintainer
reports CAPTCHA configured; the GitHub server-secret name and public variable
names are present. A clean main deployment synchronized the catalog. A public
ranking request for a committed puzzle succeeds and raw result-table reads are
denied. Two real anonymous sessions completed managed Turnstile verification,
published first solves, saw the correct hints/time rankings and their own "You"
marker. Removing one identity's results left the other intact; both test scores
were then removed with maintainer approval. Ties and outside-top-25 ownership
are covered by SQL and app contract tests. Public activation is complete as of
October 20, 2026.

Publishing requires browser storage and Web Locks for safe coordination across
tabs. Without them, local play and public rankings remain available but joining
is refused. The SDK uses the same durable storage as participation; it owns
session serialization and renewal. Stop is immediate in the current tab; saving
the setting across tabs and removing results may wait for an in-flight request.

Activation order for a new project or rebuild:

1. Apply `001_leaderboards.sql`, `002_tents.sql`, then `003_sudoku.sql`, and run the database checks.
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
