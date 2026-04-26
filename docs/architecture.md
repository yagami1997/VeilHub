# Architecture

*Last updated: 2026-04-26 00:01 (PDT)*

## Overview

VeilHub 1.0.0 is a compact Cloudflare-native redirect control plane:

- Cloudflare Worker handles HTML, private APIs, public link resolution, cryptography, and owner sessions.
- Cloudflare KV stores encrypted link records, metadata, owner credential records, recovery-code hashes, tombstones, and rate-limit counters.
- Web Crypto provides AES-GCM, PBKDF2-SHA256, SHA-256, and HMAC-SHA256 primitives.

There is no external database, object storage bucket, queue, server, cron job, or hosted backend outside the Worker and KV namespace.

## Architectural Position

VeilHub is not a short-link marketing platform. Its architecture is closer to a controlled redirect relay:

1. hide the target URL in KV through encryption,
2. expose only a generated share URL,
3. make access temporary or one-time when requested,
4. keep the creation surface behind a private owner entry.

## Main Components

### Worker

`worker/sd.js` contains:

- routing
- owner claim/login/recovery
- link creation
- link resolution
- cryptographic helpers
- HTML generation
- request-failed pages
- security headers

### KV Namespace

`VEIL_LINKS` stores:

- link records under their public key
- one-time tombstones under `expired:<key>`
- owner passphrase record under `owner:passphrase`
- owner session version under `owner:session_version`
- recovery-code hashes under `owner:recovery:<index>`
- auth rate-limit counters under `rl:auth:*`
- access-code rate-limit counters under `rl:code:*`

### Browser UI

The owner workspace is rendered by the Worker as HTML, CSS, and inline JavaScript. The workspace talks only to private APIs derived from `APP_ENTRY_PATH`.

## Request Routing

| Method | Path | Handler behavior |
| --- | --- | --- |
| `OPTIONS` | any | CORS preflight response |
| `GET` | `/favicon.svg` | generated SVG favicon |
| `GET` | `/<APP_ENTRY_PATH>` | owner claim, login, or workspace |
| `POST` | `/<APP_ENTRY_PATH>/api/claim` | initialize owner account |
| `POST` | `/<APP_ENTRY_PATH>/api/login` | create owner session |
| `POST` | `/<APP_ENTRY_PATH>/api/recover` | reset passphrase with recovery code |
| `POST` | `/<APP_ENTRY_PATH>/api/links` | create encrypted share link |
| `POST` | `/<APP_ENTRY_PATH>/api/logout` | clear session cookie |
| `POST` | `/<APP_ENTRY_PATH>/api/reset-sessions` | invalidate other sessions |
| `POST` | `/<APP_ENTRY_PATH>/api/change-passphrase` | rotate owner passphrase |
| `POST` | `/<APP_ENTRY_PATH>/api/recovery-codes` | regenerate recovery codes |
| `POST` | `/api/links` or `/api/add` | legacy/public creation path if authorized |
| `GET` | `/<KEY>` | resolve public share link |
| other | other | controlled request-failed response |

## Link Creation Flow

1. Owner workspace sends `POST /<APP_ENTRY_PATH>/api/links`.
2. Worker verifies owner session and CSRF token.
3. Worker validates the target URL scheme.
4. Worker validates or generates the public key.
5. Worker clamps requested TTL using `MAX_TTL_SECONDS`.
6. Worker encrypts the target URL using AES-GCM.
7. Worker hashes the access code with PBKDF2-SHA256 if enabled.
8. Worker stores encrypted URL and metadata in KV.
9. Worker returns the share URL and access code information.

## Link Resolution Flow

1. Recipient requests `GET /<KEY>`.
2. Worker loads KV value and metadata.
3. If no link exists, Worker checks `expired:<KEY>` tombstone.
4. If access code is required, Worker renders an access-code form or verifies `code`.
5. Worker decrypts the stored URL.
6. Worker forwards non-`code` query parameters to the destination URL.
7. Worker returns `307` redirect.
8. If the link is one-time, Worker deletes the link and writes a tombstone.

## Owner Auth Flow

New deployment:

1. `GET /<APP_ENTRY_PATH>` shows claim page.
2. Operator enters `CLAIM_TOKEN` and a new owner passphrase.
3. Worker verifies `CLAIM_TOKEN`.
4. Worker stores owner passphrase hash.
5. Worker creates recovery codes and stores their hashes.
6. Worker sets signed owner session cookie.

Returning owner:

1. owner enters passphrase,
2. Worker verifies PBKDF2 hash,
3. Worker issues signed session cookie,
4. workspace receives CSRF token embedded in HTML.

Recovery:

1. owner submits a recovery code and new passphrase,
2. Worker verifies one unused recovery code,
3. Worker rotates the passphrase,
4. Worker increments session version,
5. previous sessions become invalid.

## Data Model

### Link Record

KV key:

```text
<KEY>
```

KV value:

```text
base64(iv[12] || aes_gcm_ciphertext_and_tag)
```

KV metadata:

```json
{
  "oneTime": true,
  "hasPassword": true,
  "accessCodeKdf": "pbkdf2-sha256-v1",
  "accessCodeSalt": "<base64url>",
  "accessCodeHash": "<base64url>"
}
```

### Tombstone Record

KV key:

```text
expired:<KEY>
```

Purpose: distinguish already-used one-time links from never-existing links.

### Owner Passphrase Record

KV key:

```text
owner:passphrase
```

Value: JSON containing KDF identifier, salt, and PBKDF2 hash.

### Recovery Code Records

KV keys:

```text
owner:recovery:0
owner:recovery:1
...
```

Value: JSON containing KDF identifier, salt, hash, and used state.

### Rate Limit Records

KV key examples:

```text
rl:auth:login:<ip>:<window>
rl:code:<key>:<ip>:<window>
```

Value: attempt count as a string with short TTL.

## Security Headers

HTML responses are routed through `htmlResponse()` and receive:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`
- `X-Content-Type-Options: nosniff`

## Known Architectural Limitations

| Limitation | Reason |
| --- | --- |
| One-time link deletion is not transactional. | Cloudflare KV does not provide compare-and-delete semantics for this flow. |
| Rate-limit counters are approximate. | KV read-modify-write can race under concurrent requests. |
| No audit log. | The current design avoids a database and persistent event log. |
| No multi-key encryption rotation. | Link records do not store key IDs. |
| No multi-user model. | Owner account is intentionally single-operator. |

## Related Docs

- [Share Link Delivery](share-link-delivery.md)
- [Security Design](security-design.md)
- [Threat Model](threat-model.md)
- [Deployment](deployment.md)
