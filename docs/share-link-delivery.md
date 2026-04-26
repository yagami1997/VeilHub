# Share Link Delivery

*Last updated: 2026-04-26 00:01 (PDT)*

## Overview

VeilHub share links are controlled redirect links. A generated public URL points to the Worker, and the Worker decides whether to redirect to the encrypted target URL.

Recommended shape:

```text
https://<YOUR_SHARE_DOMAIN>/<KEY>
```

The public link should not expose:

- the original target URL,
- the private owner entry path,
- the operator workspace route,
- implementation details.

## Why VeilHub Uses a Fixed Share Domain

VeilHub uses one fixed share domain plus variable keys. This avoids per-link DNS management and keeps routing simple.

Privacy-oriented operators may choose a low-meaning random-looking hostname, but the hostname is still a public deployment identifier. VeilHub does not make DNS anonymous.

## Public Resolution Flow

1. Recipient requests `GET /<KEY>`.
2. Worker validates that `<KEY>` is not a reserved private path.
3. Worker loads the encrypted URL and metadata from KV.
4. Worker checks access-code requirements.
5. Worker decrypts the target URL with `ENCRYPTION_KEY`.
6. Worker returns HTTP `307`.
7. If one-time mode is enabled, Worker deletes the link and writes a tombstone.

## Access-Code Delivery

If access-code protection is enabled, send:

- share link through one channel,
- access code through a separate channel.

Do not include the access code in the share URL when sending it to recipients.

## Query Parameter Forwarding

VeilHub forwards query parameters from the public share request to the target URL except the `code` parameter used for access-code verification.

This supports simple relay use cases, but operators should understand that forwarded parameters become visible to the destination.

## Expiration Modes

### TTL Expiration

The Worker stores the KV link record with an expiration TTL when requested. After expiration, KV no longer returns the link.

### One-Time Links

The Worker attempts to delete the link after a successful redirect and stores an `expired:<KEY>` tombstone. This is best effort because KV operations are not transactional.

### Access-Code Protected Links

The Worker verifies the submitted code before decrypting and redirecting. New links store PBKDF2-SHA256 hashes rather than plaintext codes.

## Public Surface Rules

The share domain should expose:

- `GET /<KEY>`
- `GET /favicon.svg`
- request-failed pages for invalid routes

The share domain should not expose:

- owner workspace at `/`
- private APIs outside `APP_ENTRY_PATH`
- stack traces
- secret configuration state

## Operational Recommendations

- Use generated high-entropy keys for private links.
- Use short keys only where guessability risk is acceptable.
- Use TTL and one-time controls for sensitive sharing.
- Keep public creation disabled unless abuse controls exist.
- Use Cloudflare WAF or rate limiting for public deployments.

## Related Docs

- [Architecture](architecture.md)
- [Threat Model](threat-model.md)
- [Deployment](deployment.md)
