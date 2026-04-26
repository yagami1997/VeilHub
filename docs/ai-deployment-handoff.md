# AI Deployment Handoff

*Last updated: 2026-04-26 00:01 (PDT)*

## Purpose

This document is written for AI coding agents assisting with VeilHub deployment or maintenance.

Follow the steps in order. Do not invent missing values. Stop and ask the operator when a required resource, secret, domain, or account decision is missing.

## Mandatory Constraints

Never invent or guess:

- Cloudflare account identity,
- KV namespace ID,
- zone name,
- custom domain,
- private entry path requested by the operator,
- secret values after they have been uploaded,
- legal or privacy contact details.

Never commit:

- `wrangler.toml`,
- `.dev.vars`,
- real secret values,
- real KV namespace IDs,
- real operator-only private entry paths,
- private planning files under `local/`.

Always verify:

- Wrangler login state,
- KV namespace creation or reuse,
- secret upload completion,
- Worker deployment output,
- private entry path response,
- public share-link redirect behavior.

## Required Operator Inputs

Before deployment, obtain:

- desired Worker name,
- whether to use `workers.dev` only or a custom domain,
- target share domain if custom domain is used,
- Cloudflare zone name if a route is configured,
- whether public creation must remain disabled,
- whether the operator wants a generated private entry path or has chosen one.

## Deployment Sequence

### Step 1: Verify Environment

```bash
node --version
npm --version
npx wrangler whoami
```

If Wrangler is not logged in:

```bash
npx wrangler login
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Prefer Guided Setup

```bash
npm run setup
```

Record only non-secret operational facts needed by the operator. Do not place secrets into chat history unless the operator explicitly asks and understands the risk.

The setup script prints the one-time claim token. Tell the operator to save it in a password manager until the owner account is claimed.

### Step 4: Manual Setup If Needed

Create KV:

```bash
npx wrangler kv namespace create VEIL_LINKS
```

Create local config:

```bash
cp wrangler.toml.example wrangler.toml
```

Edit placeholders in `wrangler.toml`. Confirm the file is gitignored.

Generate and upload secrets:

```bash
openssl rand -hex 32
npx wrangler secret put ENCRYPTION_KEY
openssl rand -hex 24
npx wrangler secret put CLAIM_TOKEN
openssl rand -hex 32
npx wrangler secret put SESSION_SECRET
```

Deploy:

```bash
npm run deploy
```

### Step 5: Validate

Check private entry:

```bash
curl -I https://<YOUR_SHARE_DOMAIN>/<YOUR_PRIVATE_ENTRY_PATH>
```

Check favicon:

```bash
curl -I https://<YOUR_SHARE_DOMAIN>/favicon.svg
```

After owner claim, create a test link from the UI and verify the public link redirects.

### Step 6: Custom Domain

If a custom domain is requested:

1. confirm the zone is in the operator's Cloudflare account,
2. configure DNS as proxied,
3. add a Worker route for `<YOUR_SHARE_DOMAIN>/*`,
4. set `BASE_URL = "https://<YOUR_SHARE_DOMAIN>"`,
5. deploy,
6. verify generated links use the custom domain.

## Safety Rules for AI Agents

- Do not weaken legal disclaimers to make the project sound more marketable.
- Do not enable `PUBLIC_CREATE_ENABLED=true` unless the operator explicitly requests it and accepts abuse responsibility.
- Do not remove `APP_ENTRY_PATH`.
- Do not print secrets again after setup unless required for the immediate operator task.
- Do not use production domains in public documentation.
- Do not commit local audit or ideation files.

## Completion Checklist

- [ ] dependencies installed
- [ ] Wrangler logged in
- [ ] KV namespace configured
- [ ] `ENCRYPTION_KEY` uploaded
- [ ] `CLAIM_TOKEN` uploaded
- [ ] `SESSION_SECRET` uploaded
- [ ] `wrangler.toml` remains uncommitted
- [ ] Worker deployed
- [ ] private entry path loads
- [ ] owner claim completed
- [ ] recovery codes saved by operator
- [ ] test link created
- [ ] test link redirects
- [ ] legal/privacy docs reviewed before public exposure
