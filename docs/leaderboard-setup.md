# Free leaderboard setup

The leaderboard is being designed; there is no hosted service or migration to
apply yet. These steps prepare the free provider projects. Players will not need
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

At this stage, do not create tables by hand or enable anonymous sign-ins. The
reviewed migration and CAPTCHA setup should be ready first.

## 2. Prepare free signup protection

Supabase recommends CAPTCHA protection for anonymous sign-ups to reduce abuse
of database capacity. Its Auth service supports Cloudflare Turnstile, which has
a free plan and does not require moving the puzzle site away from GitHub Pages.

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) and open **Turnstile**.
   Choose the free offering; do not buy hosting or a domain.
2. Add a widget named `daily-puzzles-leaderboard` for `tristrange.github.io`, using
   the Managed widget type. Enter the hostname without a URL path.
3. Keep the **site key** for the frontend. Keep the **secret key** private.
4. When the backend is ready, configure Supabase Authentication's CAPTCHA
   protection to use Turnstile and enter the secret there. Then enable anonymous
   sign-ins. The secret never belongs in the app or the repository.

Local testing will use the documented test setup supplied with the implementation;
do not weaken the production widget or put a production secret into a test file.

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

Catalog synchronization will additionally require a server-only
`SUPABASE_SECRET_KEY` in GitHub's **Actions secrets**. Add that through GitHub's
settings when the backend instructions are ready; do not paste it into chat.
PR checks and the browser build must not receive it.

Public keys do not grant administrative access. We still need the migration
and access tests in place before enabling the app. Applying that reviewed SQL
will be a separate setup step with exact instructions from the backend PR.

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
