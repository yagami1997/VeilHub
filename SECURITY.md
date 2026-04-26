# Security Policy

*Last updated: 2026-04-26 00:01 (PDT)*

## Status

VeilHub 1.0.0 is a lightweight self-hosted Cloudflare Worker with a documented security boundary. It has security-oriented design controls, but it is not a managed security service and should not be advertised as an anonymity tool or compliance product.

Security claims in this repository are limited to the documented [Threat Model](docs/threat-model.md).

## Supported Versions

The repository currently tracks one active release line.

| Version line | Status |
| --- | --- |
| `main` / `1.0.x` | Active self-hosted release |
| Older local prototypes | Unsupported |

## Reporting Vulnerabilities

Use a private security advisory if the repository host supports it, or contact the maintainer through the published project profile contact route.

Please include:

- affected route or file,
- reproduction steps,
- expected impact,
- whether the issue requires a deployed Worker,
- whether any secret, token, or private deployment URL was exposed during testing.

Do not publish working exploit details for live deployments before the maintainer has had a reasonable chance to assess the report.

## Content Abuse and Legal Complaints

VeilHub does not operate a public hosted service. Each deployment is controlled by its deployer.

The upstream project author generally cannot inspect, decrypt, remove, revoke, or moderate links created on third-party deployments. Complaints about a specific deployed instance should be directed to the operator of that instance, not to the upstream source-code repository.

Repository-level reports should concern the source code, documentation, license, or security posture of VeilHub itself.

See [Legal Risk Statement](docs/legal-risk-statement.md).

## Current Security Controls

- AES-GCM target URL encryption through Web Crypto.
- Fail-closed Web Crypto checks.
- URL scheme validation for `http:` and `https:`.
- Private owner workspace behind `APP_ENTRY_PATH`.
- First-run owner claim with one-time `CLAIM_TOKEN`.
- Owner passphrase stored as PBKDF2-SHA256 with per-secret salt.
- Recovery codes stored as PBKDF2-SHA256 hashes.
- Signed HttpOnly owner session cookie.
- CSRF token for authenticated owner API calls.
- Session invalidation through a KV-backed session version.
- PBKDF2-SHA256 access-code hashes with per-code salt for newly created links.
- Access-code and auth failure throttling backed by KV counters.
- Constant-time style string comparison helper for secrets and hashes.
- HTML escaping for template output.
- CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Content-Type-Options` on HTML responses.
- Request-failed pages for unavailable or invalid routes.

## Known Limitations

| Limitation | Impact | Current mitigation |
| --- | --- | --- |
| Cloudflare platform-level access is out of scope. | A platform-level adversary can observe Worker secrets and runtime data. | Documented trust boundary; self-hosting controls account ownership but not platform internals. |
| One-time link deletion is not strongly atomic. | Concurrent requests may race before KV deletion fully settles. | Tombstones reduce reuse after deletion, but cannot make KV operations transactional. |
| KV rate-limit counters are read-modify-write. | Concurrent failures may undercount. | Best-effort throttling for abuse resistance, not a billing-grade counter. |
| `ENCRYPTION_KEY` rotation breaks existing encrypted links. | Existing target URLs cannot be decrypted after rotation. | Documented rotation warning. |
| Access codes are entered in the browser and may appear in local browser history depending on flow. | Access codes are not suitable as high-value passwords. | Send access codes separately and use one-time/TTL controls. |
| Malicious operators are out of scope. | A deployer controls Worker code, secrets, DNS, and logs. | Legal/operator responsibility is explicit. |
| Public creation mode can invite abuse. | Anonymous users can create links if enabled. | Disabled by default; operators must add their own abuse controls before public use. |

## Security Non-Goals

VeilHub does not attempt to provide:

- creator anonymity,
- recipient anonymity,
- resistance to malicious deployment operators,
- resistance to Cloudflare platform-level access,
- censorship-resistant hosting,
- blockchain-style immutability,
- malware scanning,
- public content moderation,
- legal safe-harbor qualification.

## Secret Handling

Never commit:

- `wrangler.toml`,
- `.dev.vars`,
- real KV namespace IDs,
- real domains for private deployments,
- `ENCRYPTION_KEY`,
- `SESSION_SECRET`,
- `CLAIM_TOKEN`,
- owner passphrases,
- recovery codes,
- Cloudflare API tokens.

See [Repository Boundaries](docs/repository-boundaries.md).
