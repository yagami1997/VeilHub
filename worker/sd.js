export default {
    async fetch(request, env) {
      if (!env.ENCRYPTION_KEY) {
        console.error('[Worker] ENCRYPTION_KEY environment variable is not set!');
        return new Response(JSON.stringify({
          error: 'Server misconfiguration: Encryption key not set'
        }), {
          status: 500,
          headers: corsHeaders()
        });
      }

      const url = new URL(request.url);
      console.log(`[Worker] Received ${request.method} request to ${url.pathname} from ${request.headers.get('origin') || 'unknown origin'}`);

      if (request.method === 'OPTIONS') {
        console.log('[Worker] Handling OPTIONS request');
        return handleOptions(request);
      }

      try {
        const { pathname } = url;
        const entry = getAppEntry(env);

        if (request.method === 'POST') {
          const normalizedPath = pathname.replace(/^\/+/, '');

          if (entry.valid && normalizedPath.startsWith(`${entry.path}/api/`)) {
            const apiPath = normalizedPath.slice(`${entry.path}/api/`.length);
            return await handlePrivateApi(apiPath, request, env, entry.path);
          }

          if (normalizedPath === 'api/add' || normalizedPath === 'api/links' || normalizedPath === 'add') {
            return new Response(JSON.stringify({
              success: false,
              error: 'This API endpoint has moved to the private entry path.'
            }), {
              status: 410,
              headers: corsHeaders(),
            });
          }
        }

        if (request.method === 'GET') {
          if (pathname === '/napa' || pathname === '/napa.html') {
            return htmlResponse(generateSilentNotFoundPage(), 404);
          }

          if (pathname === '/favicon.ico') {
            return Response.redirect(`${url.origin}/favicon.svg`, 302);
          }

          if (pathname === '/favicon.svg') {
            return new Response(generateFaviconSvg(), {
              status: 200,
              headers: {
                'Content-Type': 'image/svg+xml;charset=UTF-8',
                'Cache-Control': 'public, max-age=3600',
                'X-Content-Type-Options': 'nosniff'
              }
            });
          }

          if (!entry.valid) {
            return htmlResponse(generatePrivateConfigPage(entry), 503);
          }

          if (pathname === `/${entry.path}` || pathname === `/${entry.path}/`) {
            return await handlePrivateEntry(request, env, entry.path);
          }

          if (pathname === '/') {
            return htmlResponse(generateSilentNotFoundPage(), 404);
          }

          const key = pathname.slice(1);
          if (!key) {
            return new Response(JSON.stringify({ error: 'Missing key' }), {
              status: 400,
              headers: corsHeaders()
            });
          }

          try {
            console.log(`[Worker] Looking up key: ${key}`);

            const { value: encryptedUrl, metadata } = await env.VEIL_LINKS.getWithMetadata(key);

            const expiredKey = `expired:${key}`;
            const isExpiredOneTime = await env.VEIL_LINKS.get(expiredKey);

            if (isExpiredOneTime) {
              console.log(`[Worker] One-time link was previously accessed: ${key}`);
              return htmlResponse(generateOneTimeExpiredPage(), 410);
            }

            if (encryptedUrl) {
              if (metadata && metadata.hasPassword) {
                const accessCode = url.searchParams.get('code');

                if (!accessCode) {
                  console.log(`[Worker] Access code protected link accessed without code: ${key}`);
                  return htmlResponse(generateAccessCodePage(key), 200);
                }

                if (await isAccessCodeRateLimited(key, request, env)) {
                  console.log(`[Worker] Access code rate limited for: ${key}`);
                  return htmlResponse(generateAccessCodePage(key, true, true), 429);
                }

                const validAccessCode = await verifyAccessCode(accessCode, metadata);
                if (!validAccessCode) {
                  await recordAccessCodeFailure(key, request, env);
                  console.log(`[Worker] Invalid access code provided for: ${key}`);
                  return htmlResponse(generateAccessCodePage(key, true), 200);
                }

                console.log(`[Worker] Access code verified for: ${key}`);
              }

              const targetUrl = await decryptUrl(encryptedUrl, env.ENCRYPTION_KEY);

              try {
                const fullTargetUrl = new URL(targetUrl);

                const searchParams = new URL(request.url).searchParams;
                for (const [paramKey, value] of searchParams.entries()) {
                  if (paramKey === 'code') continue;
                  fullTargetUrl.searchParams.append(paramKey, value);
                }

                const finalUrl = fullTargetUrl.toString();
                console.log(`[Worker] Redirecting to: ${finalUrl.replace(/https?:\/\/[^/]+/, 'https://[redacted-host]')}`);

                if (metadata && metadata.oneTime) {
                  console.log(`[Worker] One-time link accessed, deleting key: ${key}`);
                  const response = Response.redirect(finalUrl, 307);

                  await env.VEIL_LINKS.put(expiredKey, "1", { expirationTtl: 86400 });

                  await env.VEIL_LINKS.delete(key);

                  return response;
                }

                return Response.redirect(finalUrl, 307);
              } catch (urlError) {
                console.error('[Worker] URL parsing error:', urlError);
                return new Response(JSON.stringify({ error: 'Invalid URL format in database' }), {
                  status: 500,
                  headers: corsHeaders()
                });
              }
            } else {
              console.log(`[Worker] Key not found: ${key}`);
              return htmlResponse(generateNotFoundPage(), 404);
            }
          } catch (kvError) {
            console.error('[Worker] KV Error:', kvError);
            return htmlResponse(generateErrorPage('Database Error', 'We encountered an issue while retrieving this link.'), 500);
          }
        }

        console.log(`[Worker] Method not allowed: ${request.method} ${pathname}`);
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: corsHeaders()
        });
      } catch (error) {
        console.error('[Worker] Error:', error);
        return htmlResponse(generateErrorPage('Server Error', 'Something went wrong on our end.'), 500);
      }
    }
  };

  async function handlePrivateApi(apiPath, request, env, appEntryPath) {
    if (apiPath === 'claim') {
      return await handleOwnerClaim(request, env, appEntryPath);
    }

    if (apiPath === 'login') {
      return await handleOwnerLogin(request, env, appEntryPath);
    }

    if (apiPath === 'recover') {
      return await handleOwnerRecover(request, env, appEntryPath);
    }

    const session = await verifyOwnerSession(request, env);
    if (!session.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (!await verifyCsrfRequest(request, env, session.payload)) {
      return jsonResponse({ success: false, error: 'Invalid request token' }, 403);
    }

    if (apiPath === 'logout') {
      return handleOwnerLogout(appEntryPath);
    }

    if (apiPath === 'signout-others') {
      await incrementOwnerSessionVersion(env);
      return jsonResponse({ success: true });
    }

    if (apiPath === 'change-passphrase') {
      return await handleChangePassphrase(request, env);
    }

    if (apiPath === 'recovery-codes') {
      const codes = await resetRecoveryCodes(env);
      return jsonResponse({ success: true, recoveryCodes: codes });
    }

    if (apiPath === 'links') {
      return await handleAdd(request, env, { authenticated: true });
    }

    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  async function handlePrivateEntry(request, env, appEntryPath) {
    const ownerConfigured = await isOwnerConfigured(env);
    const configIssues = getPrivateConfigIssues(env, appEntryPath, ownerConfigured);
    if (configIssues.length) {
      return htmlResponse(generatePrivateConfigPage({ valid: true, path: appEntryPath, issues: configIssues }), 503);
    }

    if (!ownerConfigured) {
      return htmlResponse(generateClaimPage(appEntryPath), 200);
    }

    const session = await verifyOwnerSession(request, env);
    if (!session.valid) {
      return htmlResponse(generateLoginPage(appEntryPath), 200);
    }

    const csrfToken = await deriveCsrfToken(env, session.payload.sid);
    return htmlResponse(generateCreatePage({
      appEntryPath,
      csrfToken,
      publicCreateEnabled: String(env.PUBLIC_CREATE_ENABLED || '').toLowerCase() === 'true'
    }), 200);
  }

  async function handleOwnerClaim(request, env, appEntryPath) {
    if (await isOwnerConfigured(env)) {
      await recordAuthFailure('claim', request, env);
      return jsonResponse({ success: false, error: 'Unable to initialize owner.' }, 400);
    }

    if (!env.CLAIM_TOKEN || !env.SESSION_SECRET) {
      return jsonResponse({ success: false, error: 'Owner initialization is not configured.' }, 503);
    }

    if (await isAuthRateLimited('claim', request, env)) {
      return jsonResponse({ success: false, error: 'Too many attempts. Try again later.' }, 429);
    }

    const body = await readJsonBody(request);
    if (!body) {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
    const claimToken = String(body.claimToken || '').trim();
    const passphrase = String(body.passphrase || '');

    const legacyToken = env.ADMIN_TOKEN || env.API_TOKEN || '';
    const validClaimToken = constantTimeEqual(claimToken, env.CLAIM_TOKEN)
      || (legacyToken && constantTimeEqual(claimToken, legacyToken));

    if (passphrase.length < 12 || !validClaimToken) {
      await recordAuthFailure('claim', request, env);
      return jsonResponse({ success: false, error: 'Unable to initialize owner.' }, 400);
    }

    const passphraseRecord = await hashSecret(passphrase);
    await env.VEIL_LINKS.put('owner:passphrase', JSON.stringify(passphraseRecord));
    await env.VEIL_LINKS.put('owner:session_version', '1');
    const recoveryCodes = await resetRecoveryCodes(env);
    await env.VEIL_LINKS.put('owner:configured', '1');

    const response = jsonResponse({ success: true, recoveryCodes });
    response.headers.append('Set-Cookie', await createSessionCookie(env, appEntryPath, 1));
    return response;
  }

  async function handleOwnerLogin(request, env, appEntryPath) {
    if (!await isOwnerConfigured(env)) {
      return jsonResponse({ success: false, error: 'Owner is not initialized.' }, 409);
    }

    if (!env.SESSION_SECRET) {
      return jsonResponse({ success: false, error: 'Session secret is not configured.' }, 503);
    }

    if (await isAuthRateLimited('login', request, env)) {
      return jsonResponse({ success: false, error: 'Too many attempts. Try again later.' }, 429);
    }

    const body = await readJsonBody(request);
    if (!body) {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
    const passphrase = String(body.passphrase || '');
    const remember = !!body.remember;
    const recordText = await env.VEIL_LINKS.get('owner:passphrase');
    const verified = recordText ? await verifySecret(passphrase, JSON.parse(recordText)) : false;

    if (!verified) {
      await recordAuthFailure('login', request, env);
      return jsonResponse({ success: false, error: 'Invalid credentials.' }, 401);
    }

    const version = await getOwnerSessionVersion(env);
    const response = jsonResponse({ success: true });
    response.headers.append('Set-Cookie', await createSessionCookie(env, appEntryPath, version, remember));
    return response;
  }

  async function handleOwnerRecover(request, env, appEntryPath) {
    if (!await isOwnerConfigured(env)) {
      return jsonResponse({ success: false, error: 'Owner is not initialized.' }, 409);
    }

    if (await isAuthRateLimited('recovery', request, env)) {
      return jsonResponse({ success: false, error: 'Too many attempts. Try again later.' }, 429);
    }

    const body = await readJsonBody(request);
    if (!body) {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
    const recoveryCode = String(body.recoveryCode || '').trim();
    const nextPassphrase = String(body.nextPassphrase || '');

    if (nextPassphrase.length < 12) {
      return jsonResponse({ success: false, error: 'New passphrase must be at least 12 characters.' }, 400);
    }

    const index = await findValidRecoveryCode(env, recoveryCode);
    if (index === -1) {
      await recordAuthFailure('recovery', request, env);
      return jsonResponse({ success: false, error: 'Invalid recovery code.' }, 401);
    }

    const recordText = await env.VEIL_LINKS.get(`owner:recovery:${index}`);
    const record = JSON.parse(recordText);
    record.used = true;
    record.usedAt = new Date().toISOString();
    await env.VEIL_LINKS.put(`owner:recovery:${index}`, JSON.stringify(record));
    await env.VEIL_LINKS.put('owner:passphrase', JSON.stringify(await hashSecret(nextPassphrase)));
    const version = await incrementOwnerSessionVersion(env);

    const response = jsonResponse({ success: true });
    response.headers.append('Set-Cookie', await createSessionCookie(env, appEntryPath, version));
    return response;
  }

  function handleOwnerLogout(appEntryPath) {
    const response = jsonResponse({ success: true });
    response.headers.append('Set-Cookie', clearSessionCookie(appEntryPath));
    return response;
  }

  async function handleChangePassphrase(request, env) {
    const body = await readJsonBody(request);
    if (!body) {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
    const currentPassphrase = String(body.currentPassphrase || '');
    const nextPassphrase = String(body.nextPassphrase || '');

    if (nextPassphrase.length < 12) {
      return jsonResponse({ success: false, error: 'New passphrase must be at least 12 characters.' }, 400);
    }

    const recordText = await env.VEIL_LINKS.get('owner:passphrase');
    const verified = recordText ? await verifySecret(currentPassphrase, JSON.parse(recordText)) : false;
    if (!verified) {
      return jsonResponse({ success: false, error: 'Invalid credentials.' }, 401);
    }

    await env.VEIL_LINKS.put('owner:passphrase', JSON.stringify(await hashSecret(nextPassphrase)));
    await incrementOwnerSessionVersion(env);
    return jsonResponse({ success: true });
  }

  async function handleAdd(request, env, options = {}) {
    let requestBody;

    try {
      if (!options.authenticated && !canCreateLink(request, env)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Unauthorized'
        }), {
          status: 401,
          headers: corsHeaders(),
        });
      }

      const headers = [...request.headers.entries()].reduce((obj, [key, val]) => {
        obj[key] = key.toLowerCase() === 'authorization' ? '[REDACTED]' : val;
        return obj;
      }, {});
      console.log('[Worker] Request headers:', headers);

      const requestText = await request.text();
      console.log('[Worker] Request body received, length:', requestText.length);

      if (!requestText || requestText.trim() === '') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Empty request body'
        }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      try {
        requestBody = JSON.parse(requestText);
      } catch (parseError) {
        console.warn('[Worker] Invalid JSON body:', parseError.message);
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid JSON'
        }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      const { url, ttl, oneTime, hasPassword, accessCode, shortKey } = requestBody;
      const entry = getAppEntry(env);
      const key = requestBody.key || (shortKey ? await generateUniqueShortKey(env, entry.path) : await generateUniquePrivateKey(env, entry.path));

      if (!url) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing url'
        }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      if (!isValidKey(key) || (entry.valid && key === entry.path)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid key format'
        }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      if (requestBody.key && await env.VEIL_LINKS.get(key)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'This custom ID is already in use'
        }), {
          status: 409,
          headers: corsHeaders(),
        });
      }

      let validatedUrl;
      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Unsupported URL scheme');
        }
        validatedUrl = parsedUrl.toString();
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid URL format. Only http and https URLs are supported.'
        }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      if (hasPassword && !accessCode) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Access code is required when password protection is enabled'
        }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      try {
        const encryptedUrl = await encryptUrl(validatedUrl, env.ENCRYPTION_KEY);

        console.log(`[Worker] Storing encrypted URL for key: ${key}`);

        const metadata = {
          oneTime: !!oneTime
        };

        if (hasPassword && accessCode) {
          metadata.hasPassword = true;
          const accessCodeRecord = await hashAccessCode(accessCode);
          metadata.accessCodeKdf = accessCodeRecord.kdf;
          metadata.accessCodeSalt = accessCodeRecord.salt;
          metadata.accessCodeHash = accessCodeRecord.hash;
        }

        const effectiveTtl = clampTtl(ttl, env);
        if (effectiveTtl > 0) {
          console.log(`[Worker] Setting TTL: ${effectiveTtl} seconds for key: ${key}`);
          await env.VEIL_LINKS.put(key, encryptedUrl, {
            expirationTtl: effectiveTtl,
            metadata: metadata
          });
        } else {
          console.log(`[Worker] Storing key: ${key} without expiration`);
          await env.VEIL_LINKS.put(key, encryptedUrl, {
            metadata: metadata
          });
        }

        const baseUrl = (env.BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
        const responseData = {
          success: true,
          short: `${baseUrl}/${key}`
        };

        const jsonResponse = JSON.stringify(responseData);
        console.log('[Worker] Response:', jsonResponse);

        return new Response(jsonResponse, {
          headers: corsHeaders(),
        });
      } catch (kvError) {
        console.error('[Worker] KV write error:', kvError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Database error'
        }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    } catch (error) {
      console.error('[Worker] Error processing add request:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Server error'
      }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  }

  function handleOptions(request) {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-VeilHub-CSRF',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-VeilHub-CSRF',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json',
    };
  }

  function htmlHeaders() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-VeilHub-CSRF',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    };
  }

  function htmlResponse(body, status = 200) {
    return new Response(body, {
      status,
      headers: {
        ...htmlHeaders(),
        'Content-Type': 'text/html;charset=UTF-8'
      }
    });
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: corsHeaders()
    });
  }

  async function readJsonBody(request) {
    const requestText = await request.text();
    if (!requestText || requestText.trim() === '') {
      return {};
    }
    try {
      return JSON.parse(requestText);
    } catch (error) {
      return null;
    }
  }

  function getAppEntry(env) {
    const rawPath = String(env.APP_ENTRY_PATH || '').trim().replace(/^\/+|\/+$/g, '');
    if (!rawPath) {
      return { valid: false, path: '', issues: ['APP_ENTRY_PATH is not configured.'] };
    }

    const normalizedPath = rawPath.toLowerCase();
    const reserved = getReservedPaths();
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(rawPath) || reserved.includes(normalizedPath)) {
      return { valid: false, path: rawPath, issues: ['APP_ENTRY_PATH must be 6-64 URL-safe characters and must not use a reserved path.'] };
    }

    return { valid: true, path: rawPath, issues: [] };
  }

  function getReservedPaths() {
    return ['api', 'add', 'admin', 'assets', 'favicon.ico', 'favicon.svg', 'napa', 'napa.html'];
  }

  function getPrivateConfigIssues(env, appEntryPath, ownerConfigured) {
    const issues = [];
    if (!appEntryPath) {
      issues.push('APP_ENTRY_PATH is not configured.');
    }
    if (!env.SESSION_SECRET) {
      issues.push('SESSION_SECRET is not configured.');
    }
    if (!ownerConfigured && !env.CLAIM_TOKEN) {
      issues.push('CLAIM_TOKEN is not configured for first-run owner initialization.');
    }
    return issues;
  }

  function canCreateLink(request, env) {
    if (String(env.PUBLIC_CREATE_ENABLED || '').toLowerCase() === 'true') {
      return true;
    }

    const configuredToken = env.ADMIN_TOKEN || env.API_TOKEN;
    if (!configuredToken) {
      return false;
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    return constantTimeEqual(token, configuredToken);
  }

  function isValidKey(key) {
    const normalizedKey = String(key || '').toLowerCase();
    return /^[A-Za-z0-9_-]{6,64}$/.test(key) && !getReservedPaths().includes(normalizedKey);
  }

  function generateSecureKey(byteLength = 16) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return uint8ArrayToBase64Url(bytes);
  }

  async function generateUniquePrivateKey(env, appEntryPath) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const key = generateSecureKey();
      if (key !== appEntryPath && !await env.VEIL_LINKS.get(key)) {
        return key;
      }
    }
    throw new Error('Unable to allocate a private ID');
  }

  function generateShortKey(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxValid = Math.floor(256 / chars.length) * chars.length;
    let result = '';

    while (result.length < length) {
      const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
      for (const byte of bytes) {
        if (byte >= maxValid) continue;
        result += chars[byte % chars.length];
        if (result.length === length) break;
      }
    }

    return result;
  }

  async function generateUniqueShortKey(env, appEntryPath) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const key = generateShortKey();
      if (key !== appEntryPath && !await env.VEIL_LINKS.get(key)) {
        return key;
      }
    }
    throw new Error('Unable to allocate a short ID');
  }

  function clampTtl(ttl, env) {
    const requestedTtl = Number(ttl);
    const maxTtl = Number(env.MAX_TTL_SECONDS || '0');

    if (!Number.isFinite(requestedTtl) || requestedTtl <= 0) {
      return 0;
    }

    if (Number.isFinite(maxTtl) && maxTtl > 0) {
      return Math.min(Math.floor(requestedTtl), Math.floor(maxTtl));
    }

    return Math.floor(requestedTtl);
  }

  async function encryptUrl(url, encryptionKey) {
    if (!encryptionKey) {
      throw new Error('Encryption key is required');
    }

    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const urlBytes = new TextEncoder().encode(url);

      const keyData = new TextEncoder().encode(encryptionKey);

      assertWebCrypto();
      const keyHash = await crypto.subtle.digest('SHA-256', keyData);

      const ciphertext = await aesGcmEncrypt(urlBytes, keyHash, iv);

      const combined = new Uint8Array(iv.length + ciphertext.length);
      combined.set(iv);
      combined.set(ciphertext, iv.length);

      return uint8ArrayToBase64(combined);
    } catch (error) {
      console.error('[Worker] Encryption error:', error);
      throw error;
    }
  }

  async function decryptUrl(encryptedData, encryptionKey) {
    if (!encryptionKey) {
      throw new Error('Encryption key is required for decryption');
    }

    try {
      const combined = base64ToUint8Array(encryptedData);

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const keyData = new TextEncoder().encode(encryptionKey);

      assertWebCrypto();
      const keyHash = await crypto.subtle.digest('SHA-256', keyData);

      const urlBytes = await aesGcmDecrypt(ciphertext, keyHash, iv);

      return new TextDecoder().decode(urlBytes);
    } catch (error) {
      console.error('[Worker] Decryption error:', error);
      throw error;
    }
  }

  function assertWebCrypto() {
    if (!crypto || !crypto.subtle) {
      throw new Error('Web Crypto API is required');
    }
  }

  async function aesGcmEncrypt(data, key, iv) {
    assertWebCrypto();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    return new Uint8Array(encrypted);
  }

  async function aesGcmDecrypt(data, key, iv) {
    assertWebCrypto();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    return new Uint8Array(decrypted);
  }

  function uint8ArrayToBase64(array) {
    const binString = Array.from(array)
      .map(byte => String.fromCharCode(byte))
      .join('');
    return btoa(binString);
  }

  function uint8ArrayToBase64Url(array) {
    return uint8ArrayToBase64(array)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function base64ToUint8Array(base64) {
    const binString = atob(base64);
    const array = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      array[i] = binString.charCodeAt(i);
    }
    return array;
  }

  async function simpleHash(text) {
    if (!text) return '';

    try {
      assertWebCrypto();
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (e) {
      console.error('Hash calculation error:', e);
      throw e;
    }
  }

  async function hashAccessCode(accessCode) {
    assertWebCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2Hash(accessCode, salt);
    return {
      kdf: 'pbkdf2-sha256-v1',
      salt: uint8ArrayToBase64Url(salt),
      hash: uint8ArrayToBase64Url(hash)
    };
  }

  async function verifyAccessCode(accessCode, metadata) {
    if (!metadata || !metadata.accessCodeHash) {
      return false;
    }

    if (metadata.accessCodeKdf === 'pbkdf2-sha256-v1' && metadata.accessCodeSalt) {
      const salt = base64UrlToUint8Array(metadata.accessCodeSalt);
      const candidate = await pbkdf2Hash(accessCode, salt);
      const candidateHash = uint8ArrayToBase64Url(candidate);
      return constantTimeEqual(candidateHash, metadata.accessCodeHash);
    }

    const legacyHash = await simpleHash(accessCode);
    return constantTimeEqual(legacyHash, metadata.accessCodeHash);
  }

  async function pbkdf2Hash(value, salt) {
    assertWebCrypto();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(String(value)),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations: 100000
      },
      keyMaterial,
      256
    );

    return new Uint8Array(bits);
  }

  function base64UrlToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
    return base64ToUint8Array(base64);
  }

  function constantTimeEqual(left, right) {
    const encoder = new TextEncoder();
    const leftBytes = encoder.encode(String(left || ''));
    const rightBytes = encoder.encode(String(right || ''));
    const maxBytes = 256;
    let diff = leftBytes.length ^ rightBytes.length;

    for (let i = 0; i < maxBytes; i++) {
      const leftByte = i < leftBytes.length ? leftBytes[i] : 0;
      const rightByte = i < rightBytes.length ? rightBytes[i] : 0;
      diff |= leftByte ^ rightByte;
    }

    return diff === 0 && leftBytes.length <= maxBytes && rightBytes.length <= maxBytes;
  }

  async function hashSecret(secret) {
    assertWebCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2Hash(secret, salt);
    return {
      kdf: 'pbkdf2-sha256-v1',
      salt: uint8ArrayToBase64Url(salt),
      hash: uint8ArrayToBase64Url(hash)
    };
  }

  async function verifySecret(secret, record) {
    if (!record || record.kdf !== 'pbkdf2-sha256-v1' || !record.salt || !record.hash) {
      return false;
    }
    const candidate = await pbkdf2Hash(secret, base64UrlToUint8Array(record.salt));
    return constantTimeEqual(uint8ArrayToBase64Url(candidate), record.hash);
  }

  async function hmacSha256(secret, value) {
    assertWebCrypto();
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return uint8ArrayToBase64Url(new Uint8Array(signature));
  }

  async function signSessionPayload(env, payload) {
    const encodedPayload = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const signature = await hmacSha256(env.SESSION_SECRET, encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  async function verifyOwnerSession(request, env) {
    if (!env.SESSION_SECRET) {
      return { valid: false };
    }

    const token = parseCookies(request.headers.get('Cookie') || '').vh_session;
    if (!token || !token.includes('.')) {
      return { valid: false };
    }

    const [encodedPayload, signature] = token.split('.');
    const expectedSignature = await hmacSha256(env.SESSION_SECRET, encodedPayload);
    if (!constantTimeEqual(signature, expectedSignature)) {
      return { valid: false };
    }

    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(encodedPayload)));
    } catch (error) {
      return { valid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload || payload.owner !== 'primary' || !payload.sid || payload.exp <= now) {
      return { valid: false };
    }

    const currentVersion = await getOwnerSessionVersion(env);
    if (Number(payload.version) !== currentVersion) {
      return { valid: false };
    }

    return { valid: true, payload };
  }

  async function createSessionCookie(env, appEntryPath, version, remember = false) {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = remember ? 60 * 60 * 24 * 14 : 60 * 60 * 8;
    const payload = {
      owner: 'primary',
      sid: generateSecureKey(18),
      iat: now,
      exp: now + maxAge,
      version
    };
    const value = await signSessionPayload(env, payload);
    return [
      `vh_session=${value}`,
      `Max-Age=${maxAge}`,
      `Path=/${appEntryPath}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict'
    ].join('; ');
  }

  function clearSessionCookie(appEntryPath) {
    return [
      'vh_session=',
      'Max-Age=0',
      `Path=/${appEntryPath}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict'
    ].join('; ');
  }

  function parseCookies(cookieHeader) {
    return cookieHeader.split(';').reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      cookies[name] = value;
      return cookies;
    }, {});
  }

  async function deriveCsrfToken(env, sessionId) {
    return hmacSha256(env.SESSION_SECRET, `${sessionId}:csrf`);
  }

  async function verifyCsrfRequest(request, env, sessionPayload) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) {
      return false;
    }

    const secFetchSite = request.headers.get('Sec-Fetch-Site');
    if (secFetchSite && !['same-origin', 'none'].includes(secFetchSite)) {
      return false;
    }

    const providedToken = request.headers.get('X-VeilHub-CSRF') || '';
    const expectedToken = await deriveCsrfToken(env, sessionPayload.sid);
    return constantTimeEqual(providedToken, expectedToken);
  }

  async function isOwnerConfigured(env) {
    return await env.VEIL_LINKS.get('owner:configured') === '1';
  }

  async function getOwnerSessionVersion(env) {
    return Number(await env.VEIL_LINKS.get('owner:session_version') || '1');
  }

  async function incrementOwnerSessionVersion(env) {
    const nextVersion = await getOwnerSessionVersion(env) + 1;
    await env.VEIL_LINKS.put('owner:session_version', String(nextVersion));
    return nextVersion;
  }

  async function resetRecoveryCodes(env) {
    const codes = [];
    for (let i = 0; i < 8; i++) {
      const code = formatRecoveryCode(generateSecureKey(10));
      codes.push(code);
      const record = {
        used: false,
        createdAt: new Date().toISOString(),
        secret: await hashSecret(code)
      };
      await env.VEIL_LINKS.put(`owner:recovery:${i}`, JSON.stringify(record));
    }
    return codes;
  }

  async function findValidRecoveryCode(env, recoveryCode) {
    for (let i = 0; i < 8; i++) {
      const recordText = await env.VEIL_LINKS.get(`owner:recovery:${i}`);
      if (!recordText) continue;

      const record = JSON.parse(recordText);
      if (record.used) continue;

      if (await verifySecret(recoveryCode, record.secret)) {
        return i;
      }
    }

    return -1;
  }

  function formatRecoveryCode(value) {
    return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 20).replace(/(.{4})/g, '$1-').replace(/-$/, '');
  }

  async function isAuthRateLimited(scope, request, env) {
    const rateKey = getAuthRateLimitKey(scope, request);
    const count = Number(await env.VEIL_LINKS.get(rateKey) || '0');
    return count >= 8;
  }

  async function recordAuthFailure(scope, request, env) {
    const rateKey = getAuthRateLimitKey(scope, request);
    const count = Number(await env.VEIL_LINKS.get(rateKey) || '0') + 1;
    await env.VEIL_LINKS.put(rateKey, String(count), { expirationTtl: 300 });
  }

  function getAuthRateLimitKey(scope, request) {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const windowStart = Math.floor(Date.now() / 300000);
    return `rl:owner:${scope}:${ip}:${windowStart}`;
  }

  async function isAccessCodeRateLimited(key, request, env) {
    const rateKey = getAccessCodeRateLimitKey(key, request);
    const count = Number(await env.VEIL_LINKS.get(rateKey) || '0');
    return count >= 5;
  }

  async function recordAccessCodeFailure(key, request, env) {
    const rateKey = getAccessCodeRateLimitKey(key, request);
    const count = Number(await env.VEIL_LINKS.get(rateKey) || '0') + 1;
    await env.VEIL_LINKS.put(rateKey, String(count), { expirationTtl: 300 });
  }

  function getAccessCodeRateLimitKey(key, request) {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const windowStart = Math.floor(Date.now() / 300000);
    return `rl:code:${key}:${ip}:${windowStart}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function generateLogoSvg(size = 54) {
    return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="380 190 494 860" fill="none" aria-hidden="true">
      <path d="M425 214C420 214 416 218 416 224V463C416 533 438 610 470 698C502 786 533 870 574 959C587 988 602 1011 620 1027C625 1031 631 1027 627 1021C606 988 597 940 592 891C581 781 568 671 552 561C542 491 532 416 509 350C491 298 466 247 425 214Z" fill="#F6F1E8"></path>
      <path d="M829 214C834 214 838 218 838 224V463C838 533 816 610 784 698C752 786 721 870 680 959C667 988 652 1011 634 1027C629 1031 623 1027 627 1021C648 988 657 940 662 891C673 781 686 671 702 561C712 491 722 416 745 350C763 298 788 247 829 214Z" fill="#F6F1E8"></path>
      <line x1="627" y1="426" x2="627" y2="679" stroke="#D89A3A" stroke-width="7" stroke-linecap="round"></line>
    </svg>`;
  }

  function generateFaviconSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254">
      <rect width="1254" height="1254" rx="180" fill="#4A5D4E"/>
      <path d="M425 214C420 214 416 218 416 224V463C416 533 438 610 470 698C502 786 533 870 574 959C587 988 602 1011 620 1027C625 1031 631 1027 627 1021C606 988 597 940 592 891C581 781 568 671 552 561C542 491 532 416 509 350C491 298 466 247 425 214Z" fill="#F6F1E8"/>
      <path d="M829 214C834 214 838 218 838 224V463C838 533 816 610 784 698C752 786 721 870 680 959C667 988 652 1011 634 1027C629 1031 623 1027 627 1021C648 988 657 940 662 891C673 781 686 671 702 561C712 491 722 416 745 350C763 298 788 247 829 214Z" fill="#F6F1E8"/>
      <line x1="627" y1="426" x2="627" y2="679" stroke="#D89A3A" stroke-width="7" stroke-linecap="round"/>
    </svg>`;
  }

  function generateFaviconDataUri() {
    return `data:image/svg+xml,${encodeURIComponent(generateFaviconSvg())}`;
  }

  function generatePlatformFooter() {
    return `<footer class="site-footer">
      <div class="footer-platform">
        <svg class="cf-mark" viewBox="0 0 96 56" fill="none" aria-hidden="true">
          <path d="M60.7 50H18.3C8.2 50 0 41.8 0 31.7C0 22.4 6.9 14.6 16 13.5C20 5.3 28.5 0 37.9 0C49.1 0 58.8 7.5 61.7 18C70.6 18.6 77.7 26 77.7 35C77.7 43.3 71.7 50 60.7 50Z" fill="#D67A0B"></path>
          <path d="M75.3 50H46.6C39.7 50 34.1 44.4 34.1 37.5C34.1 31.1 38.8 25.8 45.1 25.1C47.8 19.4 53.7 15.7 60.1 15.7C67.8 15.7 74.4 20.9 76.4 28C82.5 28.5 87.3 33.5 87.3 39.7C87.3 45.4 83.2 50 75.3 50Z" fill="#F2E3CE"></path>
        </svg>
        <span>Cloudflare Workers + KV</span>
      </div>
      <div class="footer-tech">
        <span>AES-GCM encryption</span>
        <span>PBKDF2 access codes</span>
        <span>TTL + one-time links</span>
      </div>
    </footer>`;
  }

  function generateRequestFailedPage(status, classification, message) {
    const safeStatus = Number(status) || 500;
    const safeClassification = escapeHtml(classification || 'Request Failed');
    const safeMessage = escapeHtml(message || 'The request could not be completed.');
    const redirectUrl = 'https://www.cloudflare.com/';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5;url=${redirectUrl}">
  <title>Request failed</title>
  <style>
    :root {
      --ink: #23301f;
      --muted: #66715f;
      --line: rgba(60, 86, 51, .16);
      --paper: #fbf7ef;
      --panel: #F2E3CE;
      --wash: rgba(255, 255, 255, .42);
      --green: #3C5633;
      --green-deep: #334b2d;
      --gold: #D67A0B;
      --cream: #fffaf0;
    }
    * { box-sizing: border-box; }
    body {
      background: var(--paper);
      color: var(--ink);
      font-family: Geist, 'Inter Tight', Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      min-height: 100vh;
      text-rendering: geometricPrecision;
    }
    .page {
      align-items: center;
      display: flex;
      justify-content: center;
      min-height: 100vh;
      padding: 48px 24px;
      text-align: center;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 20px 48px rgba(42, 53, 35, .14);
      max-width: 740px;
      overflow: hidden;
      padding: 48px;
      width: 100%;
    }
    .brand {
      align-items: center;
      color: var(--green);
      display: inline-flex;
      justify-content: center;
      margin-bottom: 24px;
    }
    .brand span {
      border: 1px solid rgba(60, 86, 51, .18);
      border-radius: 999px;
      background: rgba(255, 250, 240, .46);
      color: var(--green);
      font-size: 20px;
      font-weight: 820;
      line-height: 1;
      padding: 10px 18px 11px;
    }
    .eyebrow {
      color: var(--gold);
      font-size: 14px;
      font-weight: 780;
      letter-spacing: .16em;
      margin: 0 0 12px;
      text-transform: uppercase;
    }
    .status-code {
      color: var(--green);
      font-size: clamp(72px, 14vw, 118px);
      font-weight: 780;
      letter-spacing: 0;
      line-height: .9;
      margin: 0 0 16px;
    }
    h1 {
      color: var(--ink);
      font-size: clamp(30px, 5vw, 42px);
      font-weight: 680;
      letter-spacing: 0;
      line-height: 1.08;
      margin: 0 0 14px;
    }
    .copy {
      color: var(--muted);
      font-size: 17px;
      line-height: 1.55;
      margin: 0 auto;
      max-width: 42ch;
    }
    .redirect-card {
      background: var(--wash);
      border: 1px solid rgba(60, 86, 51, .18);
      border-radius: 8px;
      margin-top: 34px;
      padding: 26px 24px;
    }
    .spinner {
      animation: spin .85s linear infinite;
      border: 3px solid rgba(60, 86, 51, .18);
      border-top-color: var(--green);
      border-radius: 999px;
      height: 42px;
      margin: 0 auto 18px;
      width: 42px;
    }
    .redirect-title {
      color: var(--ink);
      font-size: 18px;
      font-weight: 720;
      margin: 0 0 8px;
    }
    .redirect-copy {
      color: var(--muted);
      font-size: 15px;
      line-height: 1.45;
      margin: 0 0 20px;
    }
    .actions {
      display: flex;
      justify-content: center;
    }
    .button {
      background: var(--green);
      border-radius: 6px;
      color: var(--cream);
      display: inline-flex;
      font-size: 15px;
      font-weight: 720;
      justify-content: center;
      line-height: 1;
      min-width: 118px;
      padding: 14px 18px;
      text-decoration: none;
      transition: background .12s ease, transform .12s ease;
    }
    .button:hover {
      background: var(--green-deep);
      transform: translateY(-1px);
    }
    .footnote {
      border-top: 1px solid rgba(60, 86, 51, .14);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      margin-top: 34px;
      padding-top: 18px;
    }
    .footnote b {
      color: var(--gold);
      font-weight: 760;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
      .button {
        transition: none;
      }
      .button:hover {
        transform: none;
      }
    }
    @media (max-width: 720px) {
      .page { padding: 24px 16px; }
      .panel { padding: 34px 20px 24px; }
      .brand { margin-bottom: 20px; }
      .brand span { font-size: 18px; padding: 9px 16px 10px; }
      .redirect-card { margin-top: 28px; padding: 22px 18px; }
      .copy { font-size: 16px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="panel">
      <div class="brand" aria-label="VeilHub">
        <span>VeilHub</span>
      </div>
      <p class="eyebrow">Error ${safeStatus}</p>
      <div class="status-code">${safeStatus}</div>
      <h1>${safeClassification}</h1>
      <p class="copy">${safeMessage}</p>

      <div class="redirect-card" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <p class="redirect-title">Redirecting to Cloudflare</p>
        <p class="redirect-copy">Automatically redirecting in <b id="countdown">5</b> seconds.</p>
        <div class="actions">
          <a class="button" href="${redirectUrl}">Go now</a>
        </div>
      </div>

      <div class="footnote">
        <span>Public errors are intentionally brief. Powered by <b>Cloudflare</b>.</span>
      </div>
    </section>
  </main>
  <script>
    (() => {
      const redirectUrl = ${JSON.stringify(redirectUrl)};
      const countdown = document.getElementById('countdown');
      let seconds = 5;
      const tick = () => {
        seconds -= 1;
        if (countdown) countdown.textContent = String(Math.max(seconds, 0));
        if (seconds <= 0) {
          window.location.assign(redirectUrl);
          return;
        }
        window.setTimeout(tick, 1000);
      };
      window.setTimeout(tick, 1000);
    })();
  </script>
</body>
</html>`;
  }

  function generateSilentNotFoundPage() {
    return generateRequestFailedPage(
      404,
      'Not Found',
      'The requested resource could not be located. The address may be invalid, incomplete, or no longer available.'
    );
  }

  function generatePrivateConfigPage(entry) {
    return generateRequestFailedPage(
      503,
      'Unavailable',
      'The requested service is not available at this address. Please verify the endpoint and try again later.'
    );
  }

  function generateClaimPage(appEntryPath) {
    return generateOwnerAuthPage({
      title: 'Claim your VeilHub',
      description: 'Initialize the single owner account for this deployment.',
      appEntryPath,
      mode: 'claim'
    });
  }

  function generateLoginPage(appEntryPath) {
    return generateOwnerAuthPage({
      title: 'Owner sign in',
      description: 'Enter the owner passphrase to open the private workspace.',
      appEntryPath,
      mode: 'login'
    });
  }

  function generateOwnerAuthPage(options) {
    const appBasePath = `/${options.appEntryPath}`;
    const isClaim = options.mode === 'claim';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)} | VeilHub</title>
  <link rel="icon" href="${generateFaviconDataUri()}" type="image/svg+xml">
  <style>
    body { background: #fbf7ef; color: #23301f; font-family: Geist, 'Inter Tight', Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; text-rendering: geometricPrecision; }
    .hero { background: #3C5633; color: #F2E3CE; padding: 58px 24px 72px; }
    .hero-inner { margin: 0 auto; max-width: 640px; }
    .brand { align-items: flex-end; display: inline-flex; gap: 13px; margin: 0; }
    .logo { color: #fffaf0; font-size: 62px; font-weight: 660; letter-spacing: -.025em; line-height: .95; }
    .hero-copy { margin-top: 34px; max-width: 34ch; }
    .hero-copy strong { color: rgba(242,227,206,.92); display: block; font-size: 29px; font-weight: 590; letter-spacing: -.015em; line-height: 1.12; margin-bottom: 10px; }
    .hero-copy span { color: rgba(242,227,206,.66); font-size: 15px; line-height: 1.55; }
    main { max-width: 640px; margin: -34px auto 48px; padding: 0 24px; }
    .card { background: #F2E3CE; border: 1px solid rgba(60,86,51,.16); border-radius: 8px; box-shadow: 0 18px 44px rgba(42,53,35,.12); padding: 30px; }
    h1 { font-size: 25px; font-weight: 620; letter-spacing: -.015em; margin: 0 0 8px; }
    p { color: #66715f; line-height: 1.55; margin: 0 0 18px; }
    input, button { box-sizing: border-box; border-radius: 6px; font: inherit; margin: 7px 0; padding: 14px 15px; width: 100%; }
    input { background: rgba(255,255,255,.72); border: 1px solid rgba(60,86,51,.2); color: #23301f; outline: 0; }
    input:focus { background: rgba(255,255,255,.88); border-color: rgba(60,86,51,.48); box-shadow: 0 0 0 3px rgba(60,86,51,.1); }
    .field-label { color: #4e6049; display: block; font-size: 13px; font-weight: 680; letter-spacing: .08em; margin: 16px 0 3px; text-transform: uppercase; }
    button { background: #3C5633; border: 0; color: #fffaf0; cursor: pointer; font-weight: 690; }
    button:hover { background: #334b2d; }
    label { align-items: center; color: #66715f; display: flex; gap: 8px; margin: 8px 0 12px; }
    label input { width: auto; }
    .error { background: #f8d7da; border-radius: 6px; color: #66151a; display: none; margin-top: 12px; padding: 10px; }
    .recovery { background: rgba(255,255,255,.65); border-radius: 6px; display: none; margin-top: 14px; padding: 14px; }
    .recovery code { display: block; font-size: 15px; margin: 5px 0; }
    .divider { border-top: 1px solid rgba(60,86,51,.18); margin: 22px 0 14px; }
    .recover-panel { border-top: 1px solid rgba(60,86,51,.18); margin-top: 26px; padding-top: 16px; }
    .recover-panel summary { color: #3C5633; cursor: pointer; font-size: 15px; font-weight: 700; list-style: none; width: fit-content; }
    .recover-panel summary::-webkit-details-marker { display: none; }
    .recover-panel summary::after { content: ' +'; color: #D67A0B; font-weight: 800; }
    .recover-panel[open] summary::after { content: ' -'; }
    .recover-body { margin-top: 14px; }
    .site-footer { border-top: 1px solid rgba(60,86,51,.16); color: #66715f; font-size: 13px; line-height: 1.45; margin: 32px auto 0; max-width: 640px; padding: 16px 18px 30px; text-align: center; }
    .footer-platform { align-items: center; color: #3C5633; display: inline-flex; font-weight: 800; gap: 8px; justify-content: center; margin-bottom: 10px; }
    .cf-mark { flex: 0 0 auto; height: 18px; width: 28px; }
    .footer-tech { display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: center; }
    .footer-tech span { white-space: nowrap; }
    @media (max-width: 640px) { .hero { padding: 42px 20px 60px; } .brand { gap: 11px; } .brand-mark { height: 54px; width: 54px; } .logo { font-size: 48px; } main { padding: 0 18px; } .card { padding: 24px; } }
  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <div class="brand">${generateLogoSvg(70)}<div class="logo">VeilHub</div></div>
      <div class="hero-copy">
        <strong>Encrypted links that expire</strong>
        <span>Share the path, hide the destination.</span>
      </div>
    </div>
  </header>
  <main>
    <section class="card">
      <h1>${escapeHtml(options.title)}</h1>
      <p>${escapeHtml(options.description)}</p>
      ${isClaim ? '<label class="field-label" for="claimToken">Claim token</label><input id="claimToken" type="password" placeholder="Paste the deployment claim token" autocomplete="off">' : ''}
      <label class="field-label" for="passphrase">${isClaim ? 'New owner passphrase' : 'Owner passphrase'}</label>
      <input id="passphrase" type="password" placeholder="Owner passphrase" autocomplete="${isClaim ? 'new-password' : 'current-password'}">
      ${isClaim ? '<p>Use at least 12 characters. Recovery codes are shown once after setup.</p>' : '<label><input id="remember" type="checkbox"> Remember this device for 14 days</label>'}
      <button id="submitButton" type="button">${isClaim ? 'Claim VeilHub' : 'Sign In'}</button>
      ${isClaim ? '' : `
      <details class="recover-panel">
        <summary>Recover access</summary>
        <div class="recover-body">
          <p>Use a recovery code to reset the owner passphrase.</p>
          <input id="recoveryCode" type="password" placeholder="Recovery code" autocomplete="off">
          <input id="nextPassphrase" type="password" placeholder="New owner passphrase" autocomplete="new-password">
          <button id="recoverButton" type="button">Recover Access</button>
        </div>
      </details>`}
      <div id="error" class="error"></div>
      <div id="recovery" class="recovery"></div>
    </section>
  </main>
  ${generatePlatformFooter()}
  <script>
    const API_BASE = ${JSON.stringify(`${appBasePath}/api`)};
    const isClaim = ${JSON.stringify(isClaim)};
    const $ = (id) => document.getElementById(id);
    $('submitButton').addEventListener('click', submit);
    if (!isClaim) $('recoverButton').addEventListener('click', recover);
    async function submit() {
      $('error').style.display = 'none';
      const payload = { passphrase: $('passphrase').value };
      if (isClaim) payload.claimToken = $('claimToken').value;
      if (!isClaim) payload.remember = $('remember').checked;
      try {
        const response = await fetch(API_BASE + (isClaim ? '/claim' : '/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
        if (isClaim && data.recoveryCodes) {
          $('recovery').innerHTML = '<strong>Recovery codes. Store them now.</strong>' + data.recoveryCodes.map((code) => '<code>' + code + '</code>').join('');
          $('recovery').style.display = 'block';
          setTimeout(() => window.location.reload(), 8000);
          return;
        }
        window.location.reload();
      } catch (error) {
        $('error').textContent = error.message || 'Unexpected error.';
        $('error').style.display = 'block';
      }
    }
    async function recover() {
      $('error').style.display = 'none';
      try {
        const response = await fetch(API_BASE + '/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recoveryCode: $('recoveryCode').value,
            nextPassphrase: $('nextPassphrase').value
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Recovery failed.');
        window.location.reload();
      } catch (error) {
        $('error').textContent = error.message || 'Unexpected error.';
        $('error').style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
  }

  function generateCreatePage(context = {}) {
    const appEntryPath = context.appEntryPath || '';
    const appBasePath = appEntryPath ? `/${appEntryPath}` : '';
    const csrfToken = context.csrfToken || '';
    const publicWarning = context.publicCreateEnabled
      ? '<p class="warning">Public creation is enabled. Use this only on protected deployments with external abuse controls.</p>'
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VeilHub</title>
  <link rel="icon" href="${generateFaviconDataUri()}" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico">
  <style>
    :root { color-scheme: light; }
    body { background: #fbf7ef; color: #23301f; font-family: Geist, 'Inter Tight', Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; text-rendering: geometricPrecision; }
    .hero { background: #3C5633; color: #F2E3CE; padding: 58px 24px 58px; }
    .hero-inner { box-sizing: border-box; margin: 0 auto; max-width: 820px; padding: 0 28px; }
    .brand-lockup { align-items: flex-end; display: inline-flex; gap: 14px; margin: 0; }
    .brand-mark { flex: 0 0 auto; }
    .wordmark { color: #fffaf0; font-size: 76px; font-weight: 650; letter-spacing: -.025em; line-height: .95; }
    .hero-message { margin-top: 32px; max-width: 640px; }
    .headline { color: rgba(242,227,206,.9); font-size: 36px; font-weight: 560; letter-spacing: -.012em; line-height: 1.1; margin: 0; }
    .subtitle { color: rgba(242,227,206,.66); font-size: 17px; font-weight: 420; line-height: 1.52; margin: 9px 0 0; max-width: 34ch; }
    .content { max-width: 820px; margin: -26px auto 34px; padding: 0 24px; }
    .card { background: #F2E3CE; border: 1px solid rgba(60,86,51,.16); border-radius: 8px; box-shadow: 0 18px 44px rgba(42,53,35,.12); padding: 28px; }
    .card-header { align-items: flex-start; display: flex; gap: 18px; justify-content: space-between; margin: 0 0 18px; }
    .card-title { min-width: 0; }
    .card-title h1 { color: #23301f; font-size: 25px; font-weight: 620; letter-spacing: -.015em; margin: 0 0 5px; }
    .card-title p { margin: 0; }
    h1 { color: #23301f; font-size: 25px; font-weight: 620; letter-spacing: -.015em; margin: 0 0 18px; }
    input, select, button { box-sizing: border-box; font: inherit; width: 100%; }
    input, select { background: rgba(255,255,255,.72); border: 1px solid rgba(60,86,51,.2); border-radius: 6px; color: #23301f; margin: 6px 0; outline: 0; padding: 13px 14px; transition: border-color .12s ease, background .12s ease, box-shadow .12s ease; }
    input:focus, select:focus { background: rgba(255,255,255,.88); border-color: rgba(60,86,51,.48); box-shadow: 0 0 0 3px rgba(60,86,51,.1); }
    button { background: #3C5633; border: 0; border-radius: 6px; color: #fffaf0; cursor: pointer; font-weight: 690; margin: 9px 0 0; padding: 13px 16px; transition: background .12s ease, transform .12s ease; }
    button:hover { background: #334b2d; }
    button:active { transform: translateY(1px); }
    button.secondary { background: rgba(60,86,51,.09); border: 1px solid rgba(60,86,51,.18); color: #23301f; width: auto; padding: 8px 12px; }
    button.secondary:hover { background: rgba(60,86,51,.14); }
    label { align-items: center; color: #4e6049; display: flex; font-size: 14px; gap: 8px; margin: 10px 0; }
    label input { width: auto; }
    .code-row { align-items: center; background: rgba(255,255,255,.5); border: 1px solid rgba(60,86,51,.12); border-radius: 6px; display: none; gap: 12px; justify-content: space-between; padding: 10px 12px; }
    .result, .error { display: none; margin-top: 14px; padding: 12px; border-radius: 6px; word-break: break-word; }
    .result { background: rgba(255,255,255,.48); border: 1px solid rgba(60,86,51,.12); }
    .error { background: #f8d7da; color: #66151a; }
    .result-item { margin: 0 0 12px; }
    .result-label-row { align-items: center; display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .result-label { color: #66715f; font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .copy-status { color: #D67A0B; font-size: 13px; font-weight: 700; min-height: 18px; opacity: 0; transition: opacity .15s ease; }
    .copy-status.visible { opacity: 1; }
    .result-value-row { align-items: center; background: rgba(255,255,255,.72); border: 1px solid rgba(60,86,51,.12); border-radius: 6px; display: flex; gap: 10px; padding: 10px; }
    .result-value { flex: 1; min-width: 0; }
    .copy-icon { align-items: center; background: transparent; border: 1px solid rgba(60,86,51,.25); border-radius: 6px; color: #23301f; cursor: pointer; display: inline-flex; flex: 0 0 auto; height: 34px; justify-content: center; margin: 0; padding: 0; width: 34px; }
    .copy-icon:hover { background: rgba(60,86,51,.08); }
    .copy-icon.copied { background: #D67A0B; border-color: #D67A0B; color: #fff; }
    .copy-icon svg { height: 18px; width: 18px; }
    .copy-toast { background: #3C5633; border-radius: 6px; color: #fff; display: none; font-size: 14px; font-weight: 700; margin-top: 12px; padding: 10px 12px; text-align: center; }
    #resultCodeBlock { display: none; }
    .muted { color: #66715f; font-size: 13px; line-height: 1.45; }
    .field-note { margin: -3px 0 8px; }
    .warning { background: rgba(214,122,11,.16); border-left: 4px solid #D67A0B; border-radius: 6px; color: #23301f; margin: 0 0 14px; padding: 10px 12px; }
    .owner-actions { align-items: center; display: flex; flex: 0 0 auto; gap: 8px; justify-content: flex-end; margin: 0; }
    .owner-actions button { background: rgba(60,86,51,.065); border-color: rgba(60,86,51,.13); color: rgba(35,48,31,.6); font-size: 12px; font-weight: 620; margin: 0; padding: 6px 9px; width: auto; }
    .settings { border-top: 1px solid rgba(60,86,51,.18); margin-top: 28px; padding-top: 18px; }
    .settings summary { color: #23301f; cursor: pointer; font-size: 18px; font-weight: 700; list-style: none; width: fit-content; }
    .settings summary::-webkit-details-marker { display: none; }
    .settings summary::after { content: ' +'; color: #D67A0B; font-weight: 800; }
    .settings[open] summary::after { content: ' -'; }
    .settings-body { margin-top: 14px; }
    .settings-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .settings .secondary { width: 100%; }
    .recovery-output { background: rgba(255,255,255,.65); border-radius: 6px; display: none; margin-top: 12px; padding: 12px; }
    .recovery-output code { display: block; margin: 4px 0; }
    .site-footer { border-top: 1px solid rgba(60,86,51,.16); color: #66715f; font-size: 13px; line-height: 1.45; margin: 32px auto 0; max-width: 880px; padding: 16px 18px 30px; text-align: center; }
    .footer-platform { align-items: center; color: #3C5633; display: inline-flex; font-weight: 800; gap: 8px; justify-content: center; margin-bottom: 10px; }
    .cf-mark { flex: 0 0 auto; height: 18px; width: 28px; }
    .footer-tech { display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: center; }
    .footer-tech span { white-space: nowrap; }
    @media (max-width: 700px) { .hero { padding: 38px 20px 46px; } .hero-inner { padding: 0; } .brand-lockup { gap: 11px; } .brand-mark { height: 58px; width: 58px; } .wordmark { font-size: 52px; } .hero-message { margin-top: 26px; } .headline { font-size: 25px; } .subtitle { font-size: 15px; } .content { margin-top: -22px; padding: 0 18px; } .card { padding: 22px; } .card-header { flex-direction: column; gap: 12px; } .settings-grid { grid-template-columns: 1fr; } .owner-actions { justify-content: flex-start; } .footer-tech span { white-space: normal; } }
  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <div class="brand-lockup">
        ${generateLogoSvg(86)}
        <div class="wordmark">VeilHub</div>
      </div>
      <div class="hero-message">
        <h1 class="headline">Encrypted links that expire</h1>
        <p class="subtitle">Share the path, hide the destination.</p>
      </div>
    </div>
  </header>
  <main class="content">
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <h1>Generate Share Link</h1>
          <p class="muted">Create a controlled encrypted redirect.</p>
        </div>
        <div class="owner-actions">
          <button class="secondary" type="button" id="signOutOthersButton">Revoke Sessions</button>
          <button class="secondary" type="button" id="logoutButton">Logout</button>
        </div>
      </div>
      ${publicWarning}
      <div id="error" class="error"></div>
      <input id="urlInput" type="url" placeholder="Paste your URL here">
      <input id="keyInput" type="text" placeholder="Optional custom ID. Leave blank for a private random token.">
      <select id="ttlSelect">
        <option value="3600">1 Hour</option>
        <option value="10800">3 Hours</option>
        <option value="21600">6 Hours</option>
        <option value="86400">1 Day</option>
        <option value="259200" selected>3 Days</option>
        <option value="604800">7 Days</option>
        <option value="2678400">31 Days</option>
        <option value="0">Permanent</option>
      </select>
      <label><input type="checkbox" id="shortKeyMode"> Use ultra-short ID</label>
      <p class="muted field-note">Ultra-short IDs are easier to share but less private. Leave it off for a private random token.</p>
      <label><input type="checkbox" id="oneTimeLink"> One-time link</label>
      <label><input type="checkbox" id="passwordProtection"> Access code protection</label>
      <div id="codeSection" class="code-row">
        <span>Access Code: <strong id="accessCode"></strong></span>
        <button class="secondary" type="button" id="refreshCode">Refresh</button>
      </div>
      <button type="button" id="generateButton">Generate</button>
      <div id="result" class="result">
        <div class="result-item">
          <div class="result-label-row">
            <span class="result-label">Share link</span>
            <span id="copyLinkStatus" class="copy-status" role="status" aria-live="polite"></span>
          </div>
          <div class="result-value-row">
            <div id="shortLink" class="result-value"></div>
            <button type="button" id="copyLinkButton" class="copy-icon" aria-label="Copy link" title="Copy link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
        <div id="resultCodeBlock" class="result-item">
          <div class="result-label-row">
            <span class="result-label">Access code</span>
            <span id="copyCodeStatus" class="copy-status" role="status" aria-live="polite"></span>
          </div>
          <div class="result-value-row">
            <div id="resultCode" class="result-value"></div>
            <button type="button" id="copyCodeButton" class="copy-icon" aria-label="Copy code" title="Copy code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
        <div id="copyToast" class="copy-toast" role="status" aria-live="polite"></div>
      </div>
      <p class="muted">Send the share link and access code separately. The access code is not part of the URL.</p>
      <details class="settings">
        <summary>Owner Security</summary>
        <div class="settings-body">
          <p class="muted">Private entry: /${escapeHtml(appEntryPath)}</p>
          <div class="settings-grid">
            <input id="currentPassphrase" type="password" placeholder="Current passphrase">
            <input id="nextPassphrase" type="password" placeholder="New passphrase">
          </div>
          <button class="secondary" type="button" id="changePassphraseButton">Change Passphrase</button>
          <button class="secondary" type="button" id="regenerateRecoveryButton">Regenerate Recovery Codes</button>
          <div id="recoveryOutput" class="recovery-output"></div>
        </div>
      </details>
    </section>
    ${generatePlatformFooter()}
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const API_BASE = ${JSON.stringify(`${appBasePath}/api`)};
    const CSRF_TOKEN = ${JSON.stringify(csrfToken)};
    $('passwordProtection').addEventListener('change', () => {
      $('codeSection').style.display = $('passwordProtection').checked ? 'flex' : 'none';
      if ($('passwordProtection').checked && !$('accessCode').textContent) refreshCode();
    });
    $('refreshCode').addEventListener('click', refreshCode);
    $('generateButton').addEventListener('click', generateLink);
    $('copyLinkButton').addEventListener('click', copyLink);
    $('copyCodeButton').addEventListener('click', copyCode);
    $('logoutButton').addEventListener('click', logout);
    $('signOutOthersButton').addEventListener('click', signOutOthers);
    $('changePassphraseButton').addEventListener('click', changePassphrase);
    $('regenerateRecoveryButton').addEventListener('click', regenerateRecoveryCodes);

    function generateRandomCode() {
      const bytes = crypto.getRandomValues(new Uint32Array(1));
      return String(100000 + (bytes[0] % 900000));
    }

    function refreshCode() {
      $('accessCode').textContent = generateRandomCode();
    }

    async function generateLink() {
      const errorDiv = $('error');
      const resultDiv = $('result');
      errorDiv.style.display = 'none';
      resultDiv.style.display = 'none';

      const url = $('urlInput').value.trim();
      if (!url) {
        errorDiv.textContent = 'Link cannot be empty.';
        errorDiv.style.display = 'block';
        return;
      }

      const payload = {
        url,
        ttl: parseInt($('ttlSelect').value, 10),
        oneTime: $('oneTimeLink').checked,
        shortKey: $('shortKeyMode').checked
      };
      const customKey = $('keyInput').value.trim();
      if (customKey) {
        payload.key = customKey;
        delete payload.shortKey;
      }

      if ($('passwordProtection').checked) {
        if (!$('accessCode').textContent) refreshCode();
        payload.hasPassword = true;
        payload.accessCode = $('accessCode').textContent;
      }

      const headers = { 'Content-Type': 'application/json', 'X-VeilHub-CSRF': CSRF_TOKEN };

      try {
        const response = await fetch(API_BASE + '/links', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to generate link.');

        $('shortLink').textContent = data.short;
        $('shortLink').dataset.link = data.short;
        if (payload.hasPassword) {
          $('resultCode').textContent = payload.accessCode;
          $('resultCode').dataset.code = payload.accessCode;
          $('resultCodeBlock').style.display = 'block';
        } else {
          $('resultCode').textContent = '';
          $('resultCode').dataset.code = '';
          $('resultCodeBlock').style.display = 'none';
        }
        resultDiv.style.display = 'block';
      } catch (error) {
        errorDiv.textContent = error.message || 'Unexpected error occurred.';
        errorDiv.style.display = 'block';
      }
    }

    async function logout() {
      await fetch(API_BASE + '/logout', {
        method: 'POST',
        headers: { 'X-VeilHub-CSRF': CSRF_TOKEN }
      });
      window.location.reload();
    }

    async function signOutOthers() {
      await fetch(API_BASE + '/signout-others', {
        method: 'POST',
        headers: { 'X-VeilHub-CSRF': CSRF_TOKEN }
      });
      window.location.reload();
    }

    async function changePassphrase() {
      try {
        const response = await fetch(API_BASE + '/change-passphrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-VeilHub-CSRF': CSRF_TOKEN },
          body: JSON.stringify({
            currentPassphrase: $('currentPassphrase').value,
            nextPassphrase: $('nextPassphrase').value
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to change passphrase.');
        $('currentPassphrase').value = '';
        $('nextPassphrase').value = '';
        alert('Passphrase changed. Please sign in again.');
        window.location.reload();
      } catch (error) {
        alert(error.message || 'Unable to change passphrase.');
      }
    }

    async function regenerateRecoveryCodes() {
      try {
        const response = await fetch(API_BASE + '/recovery-codes', {
          method: 'POST',
          headers: { 'X-VeilHub-CSRF': CSRF_TOKEN }
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to regenerate recovery codes.');
        $('recoveryOutput').innerHTML = '<strong>Recovery codes. Store them now.</strong>' + data.recoveryCodes.map((code) => '<code>' + code + '</code>').join('');
        $('recoveryOutput').style.display = 'block';
      } catch (error) {
        alert(error.message || 'Unable to regenerate recovery codes.');
      }
    }

    async function writeClipboardText(value) {
      const text = String(value || '');
      if (!text) return false;

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (error) {
        // Fall through to the textarea path. Some browsers copy but still reject.
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        copied = false;
      }

      document.body.removeChild(textarea);
      return copied;
    }

    function setCopiedState(button, message, statusId, ok = true) {
      const status = $(statusId);
      status.textContent = ok ? 'Copied' : 'Copy failed';
      status.classList.add('visible');
      button.classList.toggle('copied', ok);
      $('copyToast').textContent = message;
      $('copyToast').style.display = 'block';
      setTimeout(() => {
        status.classList.remove('visible');
        button.classList.remove('copied');
        $('copyToast').style.display = 'none';
      }, 1600);
    }

    async function copyLink(event) {
      const copied = await writeClipboardText($('shortLink').dataset.link || $('shortLink').textContent || '');
      setCopiedState(event.currentTarget, copied ? 'Copied link' : 'Unable to copy link', 'copyLinkStatus', copied);
    }

    async function copyCode(event) {
      const copied = await writeClipboardText($('resultCode').dataset.code || $('resultCode').textContent || '');
      setCopiedState(event.currentTarget, copied ? 'Copied code' : 'Unable to copy code', 'copyCodeStatus', copied);
    }
  </script>
</body>
</html>`;
  }

  function generateNotFoundPage() {
    return generateRequestFailedPage(
      404,
      'Not Found',
      'The requested resource could not be located. The address may be invalid, incomplete, or no longer available.'
    );
  }

  function generateOneTimeExpiredPage() {
    return generateRequestFailedPage(
      410,
      'Gone',
      'The requested resource is no longer available.'
    );
  }

  function generateErrorPage(title, message) {
    return generateRequestFailedPage(
      500,
      'Service Error',
      'The request could not be completed. Please try again later.'
    );
  }

  function generateAccessCodePage(key, invalid = false, rateLimited = false) {
    const errorText = rateLimited
      ? 'Too many incorrect attempts. Please wait a few minutes and try again.'
      : 'Incorrect access code. Please try again.';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Code Verification | VeilHub</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background-color: #fbf7ef;
      color: #23301f;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .header {
      background-color: #3C5633;
      width: 100%;
      position: fixed;
      top: 0;
      left: 0;
      color: white;
      padding: 20px 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 100;
    }
    .brand { align-items: center; display: flex; flex-direction: column; gap: 8px; justify-content: center; margin: 0 auto; max-width: 720px; text-align: center; width: fit-content; }
    .brand-main { align-items: center; display: inline-flex; gap: 18px; justify-content: center; margin: 0 auto; }
    .brand-mark { flex: 0 0 auto; }
    .logo {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 58px;
      font-weight: 900;
      letter-spacing: .005em;
      line-height: .9;
      color: #fff;
      text-rendering: geometricPrecision;
    }
    .subtitle {
      font-size: 15px;
      color: rgba(242,227,206,.78);
      margin-top: 2px;
    }
    .container {
      background-color: #F2E3CE; border: 1px solid rgba(214,122,11,.3);
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 14px 34px rgba(60, 86, 51, 0.16);
      margin-top: 100px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
      color: #3C5633;
    }
    h1 {
      font-size: 28px;
      color: #23301f;
      margin-bottom: 20px;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 25px;
      color: #473b52;
    }
    .error-message {
      background-color: rgba(207, 82, 82, 0.1);
      border-left: 4px solid #cf5252;
      padding: 10px 15px;
      margin-bottom: 20px;
      text-align: left;
      color: #cf5252;
      font-size: 15px;
      display: ${invalid ? 'block' : 'none'};
    }
    form {
      width: 100%;
      margin-bottom: 20px;
    }
    input[type="password"] {
      width: 100%;
      height: 50px;
      border: none;
      border-radius: 8px;
      padding: 0 20px;
      font-size: 16px;
      margin-bottom: 15px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
      box-sizing: border-box;
    }
    button {
      width: 100%;
      height: 50px;
      background-color: #3C5633;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    button:hover {
      background-color: #4b6840;
    }
    .footer {
      margin-top: 40px;
      color: #75687d;
      font-size: 14px;
      opacity: 0.6;
    }
    .security-notice {
      background-color: rgba(10, 38, 66, 0.05);
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #3C5633;
      margin: 20px 0;
      text-align: left;
    }
    .security-notice p {
      font-size: 14px;
      margin: 0;
      color: #23301f;
    }
    .security-notice i {
      margin-right: 6px;
      color: #3C5633;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-main">
        ${generateLogoSvg(66)}
        <div class="logo">VeilHub</div>
      </div>
      <div class="subtitle">Lightweight encrypted expiring links</div>
    </div>
  </div>

  <div class="container">
    <div class="icon">🔒</div>
    <h1>Access Code Required</h1>
    <p>This link requires an access code to view. Please enter the code that was provided to you.</p>

    <div class="error-message">
      ${escapeHtml(errorText)}
    </div>

    <form method="GET">
      <input type="password" name="code" placeholder="Enter access code" required autofocus autocomplete="off">
      <button type="submit">Access Link</button>
    </form>

    <div class="security-notice">
      <p>All source data (original URLs) are encrypted using AES-256-GCM encryption, ensuring user privacy and security throughout our system.</p>
    </div>
  </div>

  <div class="footer">
    <p>Built on Cloudflare Workers + KV</p>
  </div>

  <script>
    document.querySelector('form').addEventListener('submit', function(e) {
      e.preventDefault();
      const code = this.elements.code.value;
      const currentPath = window.location.pathname;
      window.location.href = currentPath + '?code=' + encodeURIComponent(code);
    });
  </script>
</body>
</html>`;
  }
