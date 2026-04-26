# Deployment

*Last updated: 2026-04-26 00:01 (PDT)*

## Overview

VeilHub 1.0.0 is designed around one Cloudflare Worker, one KV namespace, and a private owner entry path.

The recommended public shape is:

- private owner workspace: `https://<YOUR_SHARE_DOMAIN>/<YOUR_PRIVATE_ENTRY_PATH>`
- public share links: `https://<YOUR_SHARE_DOMAIN>/<KEY>`

The private entry path keeps the creation surface away from `/`. Public link resolution stays at the root path so generated share links remain short.

## Required Cloudflare Resources

VeilHub requires:

- one Cloudflare Worker
- one Cloudflare KV namespace bound as `VEIL_LINKS`
- three Worker secrets: `ENCRYPTION_KEY`, `CLAIM_TOKEN`, `SESSION_SECRET`

Optional:

- one custom share domain
- one Worker route for `<YOUR_SHARE_DOMAIN>/*`

VeilHub does not require R2, D1, Queues, Durable Objects, or background jobs.

## Key Decisions Before Deployment

### 1. Share Domain

Choose the domain that recipients will see in generated links.

Use a neutral, low-meaning hostname if public link discretion matters:

```text
https://<YOUR_SHARE_DOMAIN>/<KEY>
```

Do not use examples that reveal private operators, business names, personal names, or unrelated third-party services.

### 2. Private Entry Path

Choose a private owner entry path:

```text
<YOUR_PRIVATE_ENTRY_PATH>
```

Rules:

- 6 to 64 URL-safe characters
- no leading slash in `wrangler.toml`
- not a reserved path such as `api`, `favicon.svg`, or known public routes
- do not publish it in public docs or screenshots

Changing `APP_ENTRY_PATH` later does not migrate data, but it changes where the owner workspace and private APIs live.

### 3. Public Creation

Keep public creation disabled unless you have abuse controls:

```toml
PUBLIC_CREATE_ENABLED = "false"
```

Anonymous creation can be abused for spam, phishing, malware redirection, or illegal content references. If you enable it, you are responsible for rate limiting, abuse intake, and compliance procedures.

## Guided Deployment

Install dependencies:

```bash
npm install
```

Run setup:

```bash
npm run setup
```

The script:

- checks Wrangler login,
- creates or reuses the `VEIL_LINKS` KV namespace,
- writes `wrangler.toml`,
- generates a random `APP_ENTRY_PATH`,
- generates `ENCRYPTION_KEY`,
- generates `CLAIM_TOKEN`,
- generates `SESSION_SECRET`,
- uploads secrets,
- deploys the Worker.

The script prints:

- the private claim URL
- the one-time claim token

Store the claim token only until owner setup completes.

## Manual Deployment

### 1. Authenticate Wrangler

```bash
npx wrangler login
```

Confirm the account:

```bash
npx wrangler whoami
```

### 2. Create KV Namespace

```bash
npx wrangler kv namespace create VEIL_LINKS
```

Copy the returned namespace ID.

### 3. Create Local Configuration

```bash
cp wrangler.toml.example wrangler.toml
```

Edit the KV binding:

```toml
kv_namespaces = [
  { binding = "VEIL_LINKS", id = "YOUR_KV_NAMESPACE_ID" }
]
```

Set vars:

```toml
[vars]
BASE_URL = "https://<YOUR_SHARE_DOMAIN>"
APP_ENTRY_PATH = "<YOUR_PRIVATE_ENTRY_PATH>"
PUBLIC_CREATE_ENABLED = "false"
MAX_TTL_SECONDS = "2678400"
```

`BASE_URL` must not end with a trailing slash.

### 4. Generate Secrets

Generate a 32-byte encryption key:

```bash
openssl rand -hex 32
```

Upload it:

```bash
npx wrangler secret put ENCRYPTION_KEY
```

Generate a one-time claim token:

```bash
openssl rand -hex 24
```

Upload it:

```bash
npx wrangler secret put CLAIM_TOKEN
```

Generate a session secret:

```bash
openssl rand -hex 32
```

Upload it:

```bash
npx wrangler secret put SESSION_SECRET
```

Save these values in a password manager. Do not commit them.

### 5. Deploy

```bash
npm run deploy
```

Open:

```text
https://<YOUR_SHARE_DOMAIN>/<YOUR_PRIVATE_ENTRY_PATH>
```

Claim the owner workspace with the one-time claim token.

## Custom Domain and DNS

First verify the Worker on `workers.dev`. Then add a route in `wrangler.toml`:

```toml
routes = [
  { pattern = "<YOUR_SHARE_DOMAIN>/*", zone_name = "<YOUR_ZONE>" }
]
```

DNS requirements:

- create a DNS record for `<YOUR_SHARE_DOMAIN>`
- keep it proxied through Cloudflare
- ensure the Worker route matches the same hostname
- keep SSL/TLS enabled

For a single-domain deployment, both the private owner workspace and public share links use the same hostname. The private workspace is separated by `APP_ENTRY_PATH`, not by a second domain.

## Route Layout

Assuming:

```toml
BASE_URL = "https://<YOUR_SHARE_DOMAIN>"
APP_ENTRY_PATH = "<YOUR_PRIVATE_ENTRY_PATH>"
```

The route layout is:

| Route | Purpose |
| --- | --- |
| `GET /<YOUR_PRIVATE_ENTRY_PATH>` | claim, login, or owner workspace |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/claim` | first-run owner claim |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/login` | owner login |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/links` | authenticated link creation |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/logout` | owner logout |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/reset-sessions` | sign out other sessions |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/change-passphrase` | owner passphrase change |
| `POST /<YOUR_PRIVATE_ENTRY_PATH>/api/recovery-codes` | regenerate recovery codes |
| `GET /favicon.svg` | generated favicon |
| `GET /<KEY>` | public link resolution |
| other private-looking paths | controlled request-failed response |

## Post-Deploy Validation

Validate in this order:

1. `GET /<YOUR_PRIVATE_ENTRY_PATH>` returns the claim or login page.
2. Claim the owner account.
3. Save recovery codes.
4. Log out and log back in.
5. Create a normal link.
6. Open the generated share URL and confirm a `307` redirect.
7. Create an access-code protected link and confirm wrong-code rejection.
8. Create a one-time link and confirm second access fails.
9. Confirm `/` does not expose the owner workspace.
10. Confirm unrelated paths return controlled request-failed pages.

## Updating

For code-only updates:

```bash
git pull --rebase
npm install
npm run deploy
```

For secret changes:

- changing `SESSION_SECRET` invalidates existing owner sessions
- changing `CLAIM_TOKEN` only matters before owner setup
- changing `ENCRYPTION_KEY` breaks existing encrypted links

## Legacy `ADMIN_TOKEN`

`ADMIN_TOKEN` and `API_TOKEN` are retained for legacy API-style creation paths. New deployments should use owner claim, owner passphrase, signed session cookies, and CSRF-protected private APIs.

Do not build new automation around the legacy token path unless you have a clear migration reason.

## Related Docs

- [Quickstart](quickstart.md)
- [Architecture](architecture.md)
- [Threat Model](threat-model.md)
- [Security Design](security-design.md)
- [Troubleshooting](troubleshooting.md)
- [AI Deployment Handoff](ai-deployment-handoff.md)
