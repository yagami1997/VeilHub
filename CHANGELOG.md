# Changelog

*Last updated: 2026-04-26 00:01 (PDT)*

All notable changes to VeilHub are documented here. The format loosely follows Keep a Changelog, but this project is still in a research-prototype phase.

## [Unreleased]

### Documentation

- Establish full public documentation baseline covering deployment, architecture, threat model, security design, legal risk, AI deployment handoff, repository boundaries, troubleshooting, privacy-policy template, maintenance, and release checks.

### Branding

- Refine VeilHub visual identity, favicon, and owner workspace UI.

## [1.0.0] - 2026-04-26

### Documentation

- Rebuild README with BurnBox-style structure: stack, release notes, architecture, project structure, quick start, documentation index, security model, legal position, and notes.
- Add full documentation baseline under `docs/`.
- Add legal risk statement covering United States, European Union, China, and Japan.
- Add privacy policy template for deployers.
- Add AI deployment handoff and repository-boundary rules.

### Package

- Bump package metadata to `1.0.0`.

### Branding

- Add VeilHub SVG wordmark/symbol usage to README and web UI.

## Pre-1.0 hardening baseline - 2026-04-25

### Security

- Add private owner entry path through `APP_ENTRY_PATH`.
- Add first-run owner claim flow with `CLAIM_TOKEN`.
- Add owner passphrase login.
- Store owner passphrases and recovery codes with PBKDF2-SHA256 and per-secret salts.
- Add signed HttpOnly owner session cookie with session-version invalidation.
- Add CSRF token verification for authenticated owner API calls.
- Add recovery-code reset flow.
- Add owner session reset and passphrase change controls.
- Add AES-GCM target URL encryption using Web Crypto.
- Add PBKDF2-SHA256 access-code hashing for new links.
- Add access-code and auth rate-limiting counters in KV.
- Add security headers for HTML responses.
- Add request-failed pages for unavailable public routes.

### Features

- Create encrypted redirect links from owner workspace.
- Support generated private keys and optional short keys.
- Support custom keys with conflict detection.
- Support TTL expiration through KV expiration.
- Support one-time links with tombstones.
- Support access-code protected links.
- Support fixed share-domain output through `BASE_URL`.
- Add guided deployment script with KV creation, secret generation, and Worker deployment.

### Known Limitations

- One-time link semantics are best-effort under concurrent access.
- KV rate-limit counters are not transactional.
- `ENCRYPTION_KEY` rotation breaks existing encrypted links.
- Public creation mode requires external abuse controls before public exposure.
