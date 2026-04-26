# Repository Boundaries

*Last updated: 2026-04-26 00:01 (PDT)*

## What Belongs in This Repository

- Worker source code: `worker/sd.js`
- Deployment script: `scripts/setup-deploy.mjs`
- Configuration template: `wrangler.toml.example`
- Public documentation: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/*`
- License: `LICENSE`
- Static compatibility files that do not contain secrets

## What Must Never Be Committed

| Item | Reason |
| --- | --- |
| `wrangler.toml` | Contains real KV namespace IDs, domains, routes, and private entry path. |
| `.dev.vars` | Contains local secrets. |
| `.env` or `.env.*` | May contain secrets. |
| Cloudflare API tokens | Full deployment access. |
| `ENCRYPTION_KEY` | Decrypts stored target URLs. |
| `SESSION_SECRET` | Signs owner sessions and CSRF tokens. |
| `CLAIM_TOKEN` | Can claim an uninitialized deployment. |
| Owner passphrase | Controls workspace access. |
| Recovery codes | Reset owner passphrase. |
| Real KV namespace IDs | Deployment-specific Cloudflare resource ID. |
| Real private entry path | Reduces route-obscurity value. |
| Private audit or planning notes | May contain operational context not meant for publication. |
| `local/` | Private ideation, task, and audit workspace. |

## Configuration Strategy

Committed:

```text
wrangler.toml.example
```

Local only:

```text
wrangler.toml
.dev.vars
```

The public template must use placeholders:

- `<YOUR_SHARE_DOMAIN>`
- `<YOUR_PRIVATE_ENTRY_PATH>`
- `<YOUR_ZONE>`
- `YOUR_KV_NAMESPACE_ID`

## Documentation Strategy

Public docs should describe generic deployment. They must not reveal a specific operator's:

- production domain,
- private owner path,
- Cloudflare zone,
- KV namespace ID,
- token values,
- recovery codes,
- account email.

## AI Workspace Boundary

AI assistants may read and edit public documentation and source code when asked. They must not commit private workspace state or local audit notes unless explicitly instructed and reviewed.

When in doubt, keep private operational material out of git.
