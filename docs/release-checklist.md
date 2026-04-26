# Release Checklist

*Last updated: 2026-04-26 00:01 (PDT)*

Use this checklist before publishing a VeilHub release or pushing deployment-sensitive changes. The current public baseline is VeilHub 1.0.0.

## Pre-Release Code Checks

- [ ] `node --check worker/sd.js` passes
- [ ] no stack traces are exposed to public responses
- [ ] all HTML responses use security headers
- [ ] private APIs remain under `APP_ENTRY_PATH`
- [ ] public root does not expose owner workspace
- [ ] link creation validates URL scheme
- [ ] access-code verification still rate limits failures
- [ ] owner login and recovery failures remain generic

## Documentation Checks

- [ ] `README.md` matches current behavior
- [ ] `docs/deployment.md` matches `wrangler.toml.example`
- [ ] `docs/architecture.md` matches routes in `worker/sd.js`
- [ ] `docs/security-design.md` matches crypto implementation
- [ ] `docs/threat-model.md` lists current limitations
- [ ] `docs/legal-risk-statement.md` remains prominent
- [ ] docs use placeholders instead of real deployment values
- [ ] timestamps use real PDT/PST time

## Secret and Repository Checks

- [ ] no `wrangler.toml` committed
- [ ] no `.dev.vars` committed
- [ ] no Cloudflare token committed
- [ ] no real KV namespace ID committed
- [ ] no real private entry path committed
- [ ] no recovery code committed
- [ ] no private `local/` planning file committed

## Deployment Validation

After deploy:

- [ ] `GET /<APP_ENTRY_PATH>` returns claim, login, or owner workspace
- [ ] `GET /favicon.svg` returns SVG
- [ ] `GET /` does not expose owner workspace
- [ ] owner login works
- [ ] normal link creation works
- [ ] generated link redirects with `307`
- [ ] access-code protected link rejects wrong code
- [ ] one-time link fails on second access
- [ ] invalid paths return controlled request-failed pages

## Legal and Operational Checks

Before exposing a deployment to third parties:

- [ ] operator identity and abuse contact are published if required
- [ ] privacy policy is adapted from template
- [ ] data retention is defined
- [ ] public creation is disabled or protected
- [ ] local counsel has reviewed high-risk public use
- [ ] Cloudflare account access is controlled

## Breaking Change Warnings

Call out clearly if a release:

- changes route layout,
- changes `APP_ENTRY_PATH` behavior,
- changes encryption format,
- requires `ENCRYPTION_KEY` rotation,
- changes owner session cookie semantics,
- changes link metadata format,
- changes legal or compliance posture.
