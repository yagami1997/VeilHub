# Contributing to VeilHub

*Last updated: 2026-04-26 00:01 (PDT)*

## Project Scope

VeilHub is intentionally small: one Cloudflare Worker, one KV namespace, a private owner workspace, and controlled redirect links.

The project should remain a privacy-oriented link infrastructure tool. It should not grow into a general marketing short-link platform, file storage system, analytics product, social sharing service, VPN, crawler, or multi-tenant hosted platform.

## Legal and Safety Baseline

Contributions must preserve the project's legal and compliance posture:

- no guidance for unlawful use,
- no features designed to evade takedown, moderation, or accountability,
- no instructions for abusing third-party infrastructure,
- no misleading anonymity claims,
- no removal of operator-responsibility language,
- no weakening of abuse-control warnings around public creation.

Read [Legal Risk Statement](docs/legal-risk-statement.md) before proposing public-exposure or abuse-sensitive changes.

## Welcome Contributions

- Security hardening.
- Bug fixes with reproduction steps.
- Documentation improvements.
- Deployment script improvements.
- Testable routing and crypto behavior improvements.
- Accessibility and usability fixes that do not expand product scope.
- Better operator warnings for risky configuration.

## Changes Likely to Be Declined

- Multi-user systems.
- Public link directories.
- Analytics or tracking.
- Advertising integrations.
- External databases without a strong architectural reason.
- Hosted-service features that imply the upstream project operates deployments.
- UI redesigns that are not tied to usability, safety, or maintainability.
- Any feature that weakens the private-entry model.

## Code Standards

- Keep dependencies minimal.
- Prefer readable Worker-native code over clever abstractions.
- Use Web Crypto for cryptographic operations.
- Do not introduce `Math.random()` for security-sensitive values.
- Escape untrusted values rendered into HTML.
- Keep private APIs derived from `APP_ENTRY_PATH`.
- Do not expose implementation errors to public responses.
- Preserve security headers on all HTML responses.

## Documentation Standards

Behavior changes must update the relevant docs:

- deployment changes: `docs/deployment.md`
- route or storage changes: `docs/architecture.md`
- cryptographic or auth changes: `docs/security-design.md`
- threat-boundary changes: `docs/threat-model.md`
- legal or abuse-surface changes: `docs/legal-risk-statement.md`

All public documentation is English only.

Use placeholders instead of real deployment values:

- `<YOUR_SHARE_DOMAIN>`
- `<YOUR_PRIVATE_ENTRY_PATH>`
- `<YOUR_ZONE>`
- `YOUR_KV_NAMESPACE_ID`
- `<YOUR_TOKEN>`

## Pull Request Checklist

Before submitting a pull request:

- [ ] no real secrets, domains, KV IDs, or personal workspace files are included
- [ ] `node --check worker/sd.js` passes if Worker code changed
- [ ] docs are updated for behavior changes
- [ ] security implications are described
- [ ] deployment impact is described
- [ ] legal/operator responsibility language is not weakened

## Repository Boundaries

Private planning, audits, local credentials, and deployment-specific configuration do not belong in the public repository.

See [Repository Boundaries](docs/repository-boundaries.md).
