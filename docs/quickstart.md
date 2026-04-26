# Quickstart

*Last updated: 2026-04-26 00:01 (PDT)*

This guide gets a new VeilHub deployment running on Cloudflare Workers with one KV namespace and one private owner entry.

## Prerequisites

- Node.js 18 or newer
- npm
- Cloudflare account with Workers and KV enabled
- Wrangler login available from this machine

Install dependencies:

```bash
npm install
```

Log in to Cloudflare if needed:

```bash
npx wrangler login
```

## Recommended Setup

Run the guided setup:

```bash
npm run setup
```

The script will ask for a Worker name, create a `VEIL_LINKS` KV namespace, write `wrangler.toml`, upload secrets, deploy the Worker, and print a private claim URL.

Save the printed claim token until owner setup is complete. It is shown in the terminal because it is needed once to initialize the deployment.

## Claim the Owner Workspace

Open:

```text
https://<YOUR_SHARE_DOMAIN>/<YOUR_PRIVATE_ENTRY_PATH>
```

Enter:

- the one-time claim token printed by `npm run setup`
- a new owner passphrase

After setup, VeilHub shows recovery codes once. Store those recovery codes in a password manager before closing the page.

## Verify Basic Behavior

Open the owner workspace:

```text
https://<YOUR_SHARE_DOMAIN>/<YOUR_PRIVATE_ENTRY_PATH>
```

Create a test link with:

```text
https://example.com/
```

Open the generated share link:

```text
https://<YOUR_SHARE_DOMAIN>/<KEY>
```

Expected result: the Worker responds with a `307` redirect to `https://example.com/`.

## Verify Access Code Mode

In the owner workspace:

1. enable `Access code protection`
2. generate a link
3. open the returned share link in a new browser session
4. enter the access code shown at creation time

Expected result: the correct code redirects, and wrong codes are rejected.

## Verify One-Time Mode

In the owner workspace:

1. enable `One-time link`
2. generate a link
3. open the link once
4. open it again

Expected result: the first request redirects; a later request returns a request-failed page indicating the one-time link is gone.

## Next Steps

- Read [Deployment](deployment.md) before binding a custom domain.
- Read [Legal Risk Statement](legal-risk-statement.md) before exposing a deployment to third parties.
- Read [Threat Model](threat-model.md) before making security claims about the deployment.
