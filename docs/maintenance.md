# Maintenance

*Last updated: 2026-04-26 00:01 (PDT)*

## Routine Checks

Periodically verify:

- owner login works,
- recovery codes are stored securely,
- test link creation works,
- test link redirect works,
- one-time link second access fails,
- custom domain still routes to the Worker,
- Cloudflare account access is still controlled,
- `PUBLIC_CREATE_ENABLED` has not been accidentally enabled.

## Secret Rotation

### `SESSION_SECRET`

Rotating `SESSION_SECRET` invalidates all existing sessions.

Steps:

```bash
openssl rand -hex 32
npx wrangler secret put SESSION_SECRET
npm run deploy
```

Then log in again.

### `CLAIM_TOKEN`

`CLAIM_TOKEN` matters only before owner claim. After the owner account exists, changing it has no effect on normal login.

### `ENCRYPTION_KEY`

Rotating `ENCRYPTION_KEY` breaks existing links because link records do not store key IDs.

Only rotate it if you accept that existing encrypted target URLs will no longer decrypt.

Steps:

```bash
openssl rand -hex 32
npx wrangler secret put ENCRYPTION_KEY
npm run deploy
```

Expected result: new links work; old links may fail.

## Owner Passphrase

The owner workspace includes an `Owner Security` section for passphrase changes and recovery-code regeneration.

Changing the passphrase requires the current passphrase. Recovery-code reset requires an unused recovery code.

## Recovery Codes

Recovery codes are shown once. Store them in a password manager.

When recovery codes are regenerated, old recovery codes should be treated as invalid.

## KV Data Retention

Link records with TTL expire through KV expiration. One-time links are deleted after successful use and tombstoned for a limited period.

Owner account records remain until the KV namespace is reset or the records are manually removed.

## Backup Considerations

Back up:

- `wrangler.toml` privately,
- Cloudflare account access,
- owner recovery codes,
- secret values in a password manager.

Do not publish backups containing secrets.

## Decommissioning

To retire a deployment:

1. remove Worker route or custom domain binding,
2. delete or disable Worker,
3. delete KV namespace if records are no longer needed,
4. revoke Cloudflare API tokens used for deployment,
5. remove DNS record if applicable,
6. preserve legal or compliance records if required by law.
