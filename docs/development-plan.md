# Development Plan

*Last updated: 2026-04-26 00:01 (PDT)*

## Product Boundary

VeilHub should remain a small self-hosted privacy link infrastructure tool.

It should not become:

- a public short-link marketing platform,
- a file storage product,
- a multi-user SaaS,
- an analytics dashboard,
- a VPN,
- an anonymity network,
- a blockchain product,
- a hosted moderation service.

## Current Baseline: 1.0.0

Implemented:

- private owner entry path,
- owner claim/login/recovery,
- signed sessions and CSRF,
- encrypted target URL storage,
- TTL links,
- one-time links,
- access-code links,
- generated favicon and branded owner UI,
- guided Cloudflare deployment,
- legal and security documentation baseline.

## Priority Work

### P0: Safety and Correctness

- Keep docs synchronized with code.
- Add automated route tests.
- Add crypto helper tests where feasible.
- Add explicit smoke test script for deployment validation.
- Keep public creation disabled by default.

### P1: Operational Hardening

- Add better Cloudflare WAF/rate-limit deployment guidance.
- Add optional audit logging design without expanding into analytics.
- Add multi-key encryption rotation design.
- Add clearer migration path for legacy `ADMIN_TOKEN` use.

### P2: Usability

- Improve owner workspace copy where it reduces operator mistakes.
- Improve recovery-code handling UX.
- Improve troubleshooting messages without leaking internals.

## Work That Should Be Avoided

- Public user accounts.
- Link analytics.
- Tracking pixels.
- Third-party analytics scripts.
- Link discovery pages.
- Public link search.
- Social sharing integrations.
- Features that weaken the owner-private-entry model.

## Documentation Rule

No feature should be documented as available until it is implemented and verified in code.
