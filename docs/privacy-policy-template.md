# Privacy Policy Template for VeilHub Deployments

*Last updated: 2026-04-26 00:01 (PDT)*

> This is a template for deployers. Replace every bracketed placeholder before publication. This document is not legal advice.

## 1. Operator

This VeilHub instance is operated by:

```text
[YOUR NAME OR ORGANIZATION]
[YOUR CONTACT EMAIL]
[YOUR JURISDICTION]
```

This instance is not operated by the upstream VeilHub project author unless the upstream author is explicitly listed above as the operator.

## 2. What This Service Does

This service creates controlled redirect links. A user or operator enters a target URL, and the system returns a share URL that redirects to the target when opened.

The operator may configure links to expire by time, to be usable once, or to require an access code.

## 3. Data Collected

### Link Records

The system may store:

- encrypted target URL,
- public link key,
- expiration time,
- one-time flag,
- access-code presence flag,
- access-code hash and salt if access-code protection is enabled.

Target URLs are stored encrypted at rest in Cloudflare KV. The operator controls the deployment secrets needed to decrypt them.

### Owner Authentication Data

The system may store:

- owner passphrase hash,
- owner recovery-code hashes,
- session version,
- signed owner session cookie in the owner's browser.

The system does not store plaintext owner passphrases or plaintext recovery codes.

### Request and Infrastructure Data

Depending on Cloudflare and operator configuration, the deployment may process:

- IP address,
- user agent,
- request path,
- timestamp,
- TLS and routing metadata,
- Cloudflare security or firewall events.

Specify your actual logging configuration:

```text
[DESCRIBE LOGGING ENABLED OR DISABLED]
```

## 4. Data Not Intentionally Collected

Unless the operator adds external tooling, this deployment does not intentionally include:

- advertising profiles,
- third-party analytics,
- behavioral marketing pixels,
- sale of personal data,
- public user-account registration.

## 5. Data Processors

This deployment runs on Cloudflare infrastructure controlled by the operator.

Cloudflare may process data as an infrastructure provider. Operators should review Cloudflare's privacy, data processing, and regional compliance documentation separately.

## 6. Retention

Recommended template language:

```text
Encrypted link records are retained until their configured expiration, one-time use, manual deletion, or system cleanup. Infrastructure logs, if enabled, are retained for [RETENTION PERIOD]. Owner authentication records are retained until the deployment is reset or the owner credentials are changed.
```

Replace `[RETENTION PERIOD]` with the real retention period.

## 7. User Rights

Depending on jurisdiction, users may have rights to:

- request access,
- request deletion,
- request correction,
- object to processing,
- request portability,
- lodge a complaint with a supervisory authority.

Contact:

```text
[YOUR PRIVACY CONTACT]
```

## 8. Security Measures

This deployment uses:

- HTTPS through Cloudflare,
- AES-GCM encryption for stored target URLs,
- PBKDF2-SHA256 hashes for access codes and owner secrets,
- signed HttpOnly owner session cookies,
- CSRF protection for owner APIs,
- private owner entry path.

No system can guarantee absolute security. Do not use this service for data that requires guarantees outside the documented threat model.

## 9. International Transfers

Data may be processed by Cloudflare infrastructure in locations determined by Cloudflare and the operator's account configuration.

Operators should describe any region-specific configuration here:

```text
[DESCRIBE REGIONAL DATA PROCESSING SETTINGS]
```

## 10. Changes

The operator may update this privacy policy. Material changes will be communicated by:

```text
[DESCRIBE NOTICE METHOD]
```

## 11. Contact

For privacy questions:

```text
[YOUR CONTACT EMAIL OR FORM]
```
