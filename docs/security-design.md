# Security Design

*Last updated: 2026-04-26 00:01 (PDT)*

## Design Goals

VeilHub's security design is intentionally narrow:

- encrypt target URLs at rest in KV,
- keep link creation behind an owner workspace by default,
- use Worker-native cryptography,
- fail closed if Web Crypto is unavailable,
- avoid storing plaintext owner secrets or access codes,
- make risky deployment modes explicit.

## Cryptographic Runtime

VeilHub uses the Cloudflare Worker Web Crypto API:

- `crypto.getRandomValues`
- `crypto.subtle.digest`
- `crypto.subtle.importKey`
- `crypto.subtle.encrypt`
- `crypto.subtle.decrypt`
- `crypto.subtle.deriveBits`
- `crypto.subtle.sign`

No external cryptography library is used.

`assertWebCrypto()` fails closed if the runtime lacks the required Web Crypto features.

## Target URL Encryption

### Current Construction

The Worker derives an AES-GCM key as:

```text
SHA-256(ENCRYPTION_KEY) -> AES-256-GCM key material
```

For every encrypted URL:

- IV: 12 random bytes from `crypto.getRandomValues`
- algorithm: AES-GCM
- plaintext: UTF-8 encoded target URL
- stored format: `base64(iv || ciphertext_and_tag)`

AES-GCM provides confidentiality and integrity for the stored target URL. If the ciphertext is modified, decryption fails.

### Rotation Limitation

Existing link records do not store a key ID. Rotating `ENCRYPTION_KEY` makes existing encrypted target URLs undecryptable.

A future multi-key design should add:

- key identifier,
- active encryption key,
- retained decrypt-only old keys,
- migration or expiry policy.

## Access-Code Hashing

Access codes are recipient-facing lightweight controls.

New records use:

- PBKDF2-SHA256,
- 100,000 iterations,
- 16-byte random salt,
- 256-bit output,
- base64url storage,
- metadata marker `pbkdf2-sha256-v1`.

Verification derives a candidate hash with the stored salt and compares it with the stored hash using `constantTimeEqual()`.

### Legacy Hash Path

The Worker still contains a fallback SHA-256 verification path for older records. New records should not be created with the legacy method.

Legacy SHA-256 hashes are weak for 6-digit numeric codes because the search space is small. Operators should expire or recreate old access-code protected links.

## Owner Passphrase and Recovery Codes

Owner passphrases and recovery codes use the same PBKDF2-SHA256 helper pattern:

- random 16-byte salt,
- PBKDF2-SHA256,
- 100,000 iterations,
- base64url hash.

Recovery codes are shown once. Only hashes are stored.

## Session Design

Owner sessions use a signed cookie:

- cookie name: `vh_session`
- `HttpOnly`
- `Secure`
- `SameSite=Strict`
- scoped to the private entry path
- max age: 8 hours by default or 14 days if the owner chooses "remember this device"

The session payload contains:

- owner marker,
- random session ID,
- issued-at timestamp,
- expiry timestamp,
- session version.

The token format is:

```text
base64url(json_payload).base64url(hmac_sha256(SESSION_SECRET, encoded_payload))
```

Session invalidation works by incrementing `owner:session_version` in KV. Existing cookies with older versions fail verification.

## CSRF Design

Authenticated owner APIs require `X-VeilHub-CSRF`.

The CSRF token is derived from:

```text
HMAC-SHA256(SESSION_SECRET, session_id + ":csrf")
```

The Worker also checks request origin and `Sec-Fetch-Site` signals where available.

## Claim Flow

First-run owner setup requires:

- unconfigured owner state,
- configured `CLAIM_TOKEN`,
- configured `SESSION_SECRET`,
- claim token submitted by the operator,
- new owner passphrase of at least 12 characters.

After claim:

- owner passphrase hash is stored,
- recovery codes are generated,
- session cookie is issued.

The claim token is a bootstrap secret, not a long-term login password.

## Randomness

Security-sensitive random values use `crypto.getRandomValues`, including:

- link keys,
- IVs,
- salts,
- recovery codes,
- session IDs.

Short key generation uses rejection sampling over the alphanumeric alphabet to avoid modulo bias.

## Constant-Time Style Comparison

`constantTimeEqual()` compares encoded strings over a fixed 256-byte loop and includes length in the result.

JavaScript is not a strict constant-time environment. This helper reduces obvious early-exit timing leaks but should not be treated as a formal cryptographic timing guarantee.

## Security Headers

HTML responses include:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`
- `X-Content-Type-Options: nosniff`

The CSP permits inline script and style because the Worker generates self-contained HTML pages. This is a pragmatic tradeoff for a single-file Worker prototype.

## Error Handling

Public error pages are intentionally generic:

- invalid unknown paths return request-failed pages,
- private configuration errors return `503`,
- missing links return `404`,
- used one-time links return `410`,
- internal errors avoid exposing stack traces.

## What This Design Does Not Solve

- Cloudflare platform-level access.
- Malicious operators.
- Browser compromise.
- Public abuse at scale.
- Full legal compliance.
- Atomic one-time link consumption.
- Multi-key encryption rotation.

See [Threat Model](threat-model.md).
