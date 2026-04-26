# Troubleshooting

*Last updated: 2026-04-26 00:01 (PDT)*

## Deployment Issues

### `wrangler deploy` fails

Check:

```bash
npx wrangler whoami
```

Then verify `wrangler.toml` exists and has a valid `VEIL_LINKS` namespace ID.

### Worker returns 503 at the private entry

Likely configuration issue.

Check:

- `APP_ENTRY_PATH` is configured,
- `SESSION_SECRET` is uploaded,
- `CLAIM_TOKEN` is uploaded if the owner has not been claimed,
- `VEIL_LINKS` binding exists.

### Private entry path shows 404

Check:

- exact `APP_ENTRY_PATH`,
- no leading slash in `wrangler.toml`,
- custom domain route points to this Worker,
- DNS record is proxied through Cloudflare.

## Owner Login Issues

### Claim fails

Check:

- claim token matches the uploaded `CLAIM_TOKEN`,
- owner passphrase has at least 12 characters,
- owner account has not already been claimed.

### Login fails

Check:

- correct owner passphrase,
- no password manager inserted an extra space,
- auth failure rate limit has not been triggered.

Wait at least 5 minutes if repeated failures occurred.

### Recovery fails

Check:

- recovery code is unused,
- recovery code was copied exactly,
- new passphrase is at least 12 characters.

## Link Creation Issues

### Generate returns an error

Check:

- target URL starts with `http://` or `https://`,
- custom key contains only allowed URL-safe characters,
- custom key does not collide with an existing link,
- owner session is still valid,
- CSRF token is present from the rendered workspace.

### Generated link uses the wrong domain

Set:

```toml
BASE_URL = "https://<YOUR_SHARE_DOMAIN>"
```

Do not include a trailing slash.

Redeploy:

```bash
npm run deploy
```

## Link Resolution Issues

### Link returns 404

Possible causes:

- key never existed,
- link expired,
- link was deleted,
- wrong domain,
- wrong path.

### Link returns 410

The one-time link was already used. This is expected behavior.

### Access code is rejected

Check:

- exact six-digit code,
- no spaces,
- rate limit has not been triggered,
- correct link key.

Wait at least 5 minutes after repeated failures.

## Custom Domain Issues

### Domain does not reach Worker

Check:

- DNS record exists,
- DNS record is proxied,
- Worker route pattern matches `<YOUR_SHARE_DOMAIN>/*`,
- zone name is correct,
- deployment output lists the route.

### TLS or SSL error

Check Cloudflare SSL/TLS mode and certificate coverage for the hostname.

## Public Creation Issues

If anonymous creation is expected, verify:

```toml
PUBLIC_CREATE_ENABLED = "true"
```

Do not enable public creation on a public instance without abuse controls.

## Still Stuck

Collect:

- route requested,
- HTTP status,
- Worker deployment version,
- sanitized `wrangler.toml`,
- whether `workers.dev` works,
- whether custom domain works,
- exact error text with secrets removed.

Do not share secrets, real recovery codes, or private owner passphrases.
