# Threat Model

*Last updated: 2026-04-26 00:01 (PDT)*

## System Summary

VeilHub is a self-hosted controlled redirect tool. It stores encrypted target URLs in Cloudflare KV and exposes generated share links that can expire by time, access count, or access-code verification.

The project protects stored target URL contents under a narrow threat model. It does not provide anonymity, platform-level secrecy from Cloudflare, or legal compliance by itself.

## Protected Assets

| Asset | Description |
| --- | --- |
| Target URL | The original destination URL stored encrypted in KV. |
| Access code | Optional recipient-side control used before redirect. |
| Owner passphrase | Private workspace credential. |
| Recovery codes | Owner account recovery material. |
| Worker secrets | `ENCRYPTION_KEY`, `SESSION_SECRET`, `CLAIM_TOKEN`. |
| Private entry path | Obscures the owner workspace route from casual scanning. |

## Trust Boundaries

| Boundary | Assumption |
| --- | --- |
| Browser to Worker | HTTPS terminates at Cloudflare. |
| Worker to KV | Cloudflare internal service is available and returns stored values. |
| Worker secrets | Cloudflare Worker secrets are available to the Worker and not exposed to public clients. |
| Operator | The deployer is trusted to configure and operate the instance lawfully. |
| Cloudflare platform | Platform-level access is out of scope. |

## Adversary Model

### Tier 1: Public Internet Scanner

Can:

- request public paths,
- guess link keys,
- submit wrong access codes,
- look for common admin paths.

Mitigations:

- private owner entry path,
- controlled 404/503 pages,
- generated high-entropy keys by default,
- access-code throttling,
- no owner workspace at `/`.

### Tier 2: KV Read-Only Observer Without Worker Secrets

Can:

- read raw KV values and metadata.

Cannot directly read:

- AES-GCM encrypted target URLs without `ENCRYPTION_KEY`,
- PBKDF2-hashed access codes without offline brute force,
- PBKDF2-hashed owner passphrases without offline brute force.

Limitations:

- metadata can reveal whether a link has an access code or one-time behavior.
- short custom keys can reveal operator-chosen naming patterns.

### Tier 3: Passive Network Observer

Can observe:

- source IP metadata at network layers they control,
- timing,
- requested share URL path if they control the endpoint or logs,
- final destination after the browser follows the redirect, depending on vantage point.

VeilHub does not hide traffic metadata.

### Tier 4: Compromised Worker Secret

If `ENCRYPTION_KEY` is compromised:

- stored target URLs can be decrypted.

If `SESSION_SECRET` is compromised:

- owner sessions can be forged until the secret is rotated.

If `CLAIM_TOKEN` is compromised before claim:

- an attacker may initialize the owner account.

### Tier 5: Cloudflare Platform-Level Adversary

Can theoretically access:

- Worker runtime memory,
- Worker secrets,
- KV contents,
- request metadata.

This adversary is out of scope for VeilHub's protection claims.

### Tier 6: Malicious Operator

The operator controls:

- Worker code,
- Cloudflare account,
- DNS,
- secrets,
- logs,
- deployment policy.

VeilHub does not protect users from a malicious or negligent operator.

## Protection Goals

| Goal | Status |
| --- | --- |
| Target URL confidentiality in KV without Worker secrets | In scope |
| Tamper detection for encrypted target URL payloads | In scope through AES-GCM |
| Owner workspace isolation from root path | In scope |
| Owner session integrity | In scope with signed cookies and session version |
| Access-code brute-force resistance | Best effort with PBKDF2 and KV throttling |
| One-time link destruction | Best effort with KV deletion and tombstone |

## Explicit Non-Goals

VeilHub does not protect:

- creator anonymity,
- recipient anonymity,
- target-site visibility after redirect,
- Cloudflare platform-level access,
- malicious deployment operators,
- browser extensions or local malware,
- legal compliance for a deployment,
- public abuse at scale,
- phishing or malware classification,
- DNS-level metadata,
- traffic timing and frequency.

## STRIDE Summary

| Category | Example | Current control |
| --- | --- | --- |
| Spoofing | Attacker guesses owner API route. | Private `APP_ENTRY_PATH`, session cookie, CSRF token. |
| Tampering | Attacker changes encrypted KV payload. | AES-GCM authentication fails. |
| Repudiation | Operator needs historical audit. | Not implemented; no audit-log guarantee. |
| Information disclosure | KV contents are inspected. | Target URLs encrypted; access codes hashed. |
| Denial of service | Attacker floods public routes. | Not fully addressed; Cloudflare WAF/rate controls recommended. |
| Elevation of privilege | Attacker forges session. | HMAC-signed session cookie and session-version check. |

## Known Limitations

| Limitation | Impact | Mitigation |
| --- | --- | --- |
| KV one-time deletion race | Concurrent opens may race. | Tombstone after deletion; document as best effort. |
| KV rate-limit race | Under high concurrency, counters may undercount. | Use Cloudflare WAF for stronger public abuse controls. |
| Access code is not a password manager secret | Codes are short and recipient-facing. | Send separately and combine with TTL/one-time. |
| No audit log | Incident reconstruction is limited. | Operator may add Cloudflare logs or future audit storage. |
| Secret rotation lacks key IDs | `ENCRYPTION_KEY` rotation breaks old links. | Plan key ID support before production-grade rotation. |

## Operator Responsibilities

Operators must decide:

- whether public creation is allowed,
- whether abuse reporting is required,
- what logging is enabled in Cloudflare,
- what privacy notice is published,
- whether the deployment is lawful in each target jurisdiction,
- how takedown or removal requests are handled.

See [Legal Risk Statement](legal-risk-statement.md).
