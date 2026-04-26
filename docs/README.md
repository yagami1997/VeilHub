# VeilHub Documentation

*Last updated: 2026-04-26 00:01 (PDT)*

VeilHub 1.0.0 is a self-hosted encrypted redirect-link tool for Cloudflare Workers.

All public documentation is English only.

## Reading Order

For first-time deployers:

1. [Quickstart](quickstart.md)
2. [Deployment](deployment.md)
3. [Legal Risk Statement](legal-risk-statement.md)
4. [Threat Model](threat-model.md)

For security review:

1. [Threat Model](threat-model.md)
2. [Security Design](security-design.md)
3. [Architecture](architecture.md)
4. [Security Policy](../SECURITY.md)

For compliance and public operation:

1. [Legal Risk Statement](legal-risk-statement.md)
2. [Privacy Policy Template](privacy-policy-template.md)
3. [Maintenance](maintenance.md)
4. [Repository Boundaries](repository-boundaries.md)

For AI-assisted deployment:

1. [AI Deployment Handoff](ai-deployment-handoff.md)
2. [Deployment](deployment.md)
3. [Troubleshooting](troubleshooting.md)

## Document Index

| Document | Purpose |
| --- | --- |
| [Quickstart](quickstart.md) | Shortest deployment path. |
| [Deployment](deployment.md) | Complete Cloudflare deployment and configuration reference. |
| [Architecture](architecture.md) | Worker routes, KV data model, auth flow, and link lifecycle. |
| [Share Link Delivery](share-link-delivery.md) | Public redirect-link behavior and domain separation. |
| [Threat Model](threat-model.md) | What VeilHub protects, what it does not protect, and why. |
| [Security Design](security-design.md) | Cryptographic and session design. |
| [Legal Risk Statement](legal-risk-statement.md) | Operator responsibility and jurisdiction-specific legal considerations. |
| [Privacy Policy Template](privacy-policy-template.md) | Template for deployers; not legal advice. |
| [AI Deployment Handoff](ai-deployment-handoff.md) | Protocol for AI coding agents deploying VeilHub. |
| [Repository Boundaries](repository-boundaries.md) | What belongs in public git and what must remain local. |
| [Troubleshooting](troubleshooting.md) | Common deployment and runtime problems. |
| [Maintenance](maintenance.md) | Secret rotation, owner recovery, and operational care. |
| [Release Checklist](release-checklist.md) | Pre-release and post-deploy validation. |
| [Development Plan](development-plan.md) | Conservative scope and future work. |

## Documentation Rules

- Document implemented behavior only.
- Do not imply anonymity, legal compliance, or platform-level protection.
- Use placeholders for domains, zones, tokens, and resource IDs.
- Keep legal and operator responsibility language intact.
- Update docs when routes, secrets, auth behavior, or storage semantics change.
