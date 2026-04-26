import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || (options.input ? ['pipe', 'pipe', 'pipe'] : 'pipe'),
    input: options.input,
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }

  return `${result.stdout || ''}${result.stderr || ''}`;
}

function extractNamespaceId(outputText) {
  const jsonMatch = outputText.match(/"id"\s*:\s*"([^"]+)"/);
  if (jsonMatch) return jsonMatch[1];

  const objectMatch = outputText.match(/id\s*=\s*"([^"]+)"/);
  if (objectMatch) return objectMatch[1];

  const looseMatch = outputText.match(/\b[a-f0-9]{32}\b/i);
  if (looseMatch) return looseMatch[0];

  return '';
}

function findNamespaceId(namespaceTitle) {
  const listOutput = run('npx', ['wrangler', 'kv', 'namespace', 'list']);
  const namespaces = JSON.parse(listOutput);
  const namespace = namespaces.find((item) => item.title === namespaceTitle);
  return namespace?.id || '';
}

async function ask(question, fallback = '') {
  const suffix = fallback ? ` (${fallback})` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
}

async function main() {
  console.log('VeilHub one-command deployment');
  console.log('This script creates KV, writes wrangler.toml, sets secrets, and deploys the Worker.');

  const workerName = await ask('Worker name', 'veilhub');
  const shouldOverwrite = existsSync('wrangler.toml')
    ? (await ask('wrangler.toml exists. Overwrite it? Type no to keep the current file', 'yes')).toLowerCase() !== 'no'
    : true;

  console.log('\nChecking Wrangler login...');
  try {
    run('npx', ['wrangler', 'whoami']);
  } catch {
    console.log('Wrangler is not logged in. Opening login flow...');
    run('npx', ['wrangler', 'login'], { stdio: 'inherit' });
  }

  const namespaceTitle = 'VEIL_LINKS';
  console.log('\nCreating KV namespace...');
  let namespaceId = '';
  try {
    const kvOutput = run('npx', ['wrangler', 'kv', 'namespace', 'create', namespaceTitle]);
    namespaceId = extractNamespaceId(kvOutput);
  } catch (error) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
    console.log('KV namespace already exists. Reusing it.');
    namespaceId = findNamespaceId(namespaceTitle);
  }

  if (!namespaceId) {
    throw new Error('Could not detect the KV namespace id from Wrangler output.');
  }

  const appEntryPath = `vlt-${randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12)}`;

  if (shouldOverwrite) {
    writeFileSync('wrangler.toml', `name = "${workerName}"
main = "worker/sd.js"
compatibility_date = "2026-04-25"

kv_namespaces = [
  { binding = "VEIL_LINKS", id = "${namespaceId}" }
]

[vars]
BASE_URL = "https://<YOUR_SHARE_DOMAIN>"
APP_ENTRY_PATH = "${appEntryPath}"
PUBLIC_CREATE_ENABLED = "false"
MAX_TTL_SECONDS = "2678400"

[triggers]
crons = []
`);
    console.log('Wrote wrangler.toml');
  } else {
    console.log('Skipped wrangler.toml update');
  }

  const encryptionKey = randomBytes(32).toString('hex');
  const claimToken = randomBytes(18).toString('base64url');
  const sessionSecret = randomBytes(32).toString('hex');

  console.log('\nSetting Worker secrets...');
  run('npx', ['wrangler', 'secret', 'put', 'ENCRYPTION_KEY'], { input: `${encryptionKey}\n` });
  run('npx', ['wrangler', 'secret', 'put', 'CLAIM_TOKEN'], { input: `${claimToken}\n` });
  run('npx', ['wrangler', 'secret', 'put', 'SESSION_SECRET'], { input: `${sessionSecret}\n` });

  console.log('\nDeploying Worker...');
  const deployOutput = run('npx', ['wrangler', 'deploy']);
  console.log(deployOutput.trim());

  console.log('\nDeployment complete.');
  console.log('Open the private entry path to claim this deployment:');
  console.log(`https://<YOUR_SHARE_DOMAIN>/${appEntryPath}`);
  console.log('Save this one-time claim token until owner setup is complete:');
  console.log(claimToken);
}

main()
  .catch((error) => {
    console.error(`\nDeployment failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
