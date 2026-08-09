const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.3-chat';

if (!AZURE_OPENAI_API_KEY) {
  console.error('❌ ERROR: Falta AZURE_OPENAI_API_KEY en el archivo .env');
  process.exit(1);
}

if (!AZURE_OPENAI_ENDPOINT) {
  console.error('❌ ERROR: Falta AZURE_OPENAI_ENDPOINT en el archivo .env');
  process.exit(1);
}

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));



// ==========================
// LTI 1.3 (Moodle)
// ==========================
// La integración es opcional: el tutor sigue funcionando de forma independiente
// si estas variables no están configuradas.
const LTI_CLIENT_IDS = (process.env.LTI_CLIENT_IDS || process.env.LTI_CLIENT_ID || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const LTI_ISSUER = process.env.LTI_ISSUER || '';
const LTI_AUTH_LOGIN_URL = process.env.LTI_AUTH_LOGIN_URL || '';
const LTI_PLATFORM_JWKS_URL = process.env.LTI_PLATFORM_JWKS_URL || '';
const LTI_DEPLOYMENT_IDS = (process.env.LTI_DEPLOYMENT_IDS || process.env.LTI_DEPLOYMENT_ID || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const LTI_SESSION_SECRET = process.env.LTI_SESSION_SECRET || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const LTI_COOKIE_NAME = 'tutoria_lti_session';
const ltiStates = new Map();
let ltiJwksCache = { fetchedAt: 0, keys: [] };

function loadToolSigningKey() {
  const configured = String(process.env.LTI_PRIVATE_KEY || '').replace(/\n/g, '\n').trim();
  let privateKey;
  if (configured) {
    privateKey = crypto.createPrivateKey(configured);
  } else {
    // Suficiente para probar Core LTI. Para servicios LTI Advantage en producción
    // conviene fijar LTI_PRIVATE_KEY en Render para que la clave no cambie.
    const generated = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = generated.privateKey;
  }
  const publicKey = crypto.createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' });
  const kid = crypto.createHash('sha256').update(JSON.stringify(jwk)).digest('hex').slice(0, 16);
  return { privateKey, publicJwk: { ...jwk, use: 'sig', alg: 'RS256', kid }, kid };
}
const LTI_TOOL_KEY = loadToolSigningKey();

function ltiIsConfigured() {
  return Boolean(LTI_CLIENT_IDS.length && LTI_ISSUER && LTI_AUTH_LOGIN_URL && LTI_PLATFORM_JWKS_URL && LTI_SESSION_SECRET);
}

function getPublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function base64urlDecodeToBuffer(value) {
  let str = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('JWT inválido');
  return {
    header: JSON.parse(base64urlDecodeToBuffer(parts[0]).toString('utf8')),
    payload: JSON.parse(base64urlDecodeToBuffer(parts[1]).toString('utf8')),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64urlDecodeToBuffer(parts[2]),
  };
}

async function getPlatformJwks() {
  const now = Date.now();
  if (ltiJwksCache.keys.length && now - ltiJwksCache.fetchedAt < 10 * 60 * 1000) return ltiJwksCache.keys;
  const resp = await fetch(LTI_PLATFORM_JWKS_URL, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`No se pudo obtener JWKS de Moodle (${resp.status})`);
  const json = await resp.json();
  if (!Array.isArray(json.keys)) throw new Error('JWKS de Moodle inválido');
  ltiJwksCache = { fetchedAt: now, keys: json.keys };
  return json.keys;
}

async function verifyLtiIdToken(idToken, expectedNonce, expectedClientId) {
  const parsed = parseJwt(idToken);
  if (parsed.header.alg !== 'RS256') throw new Error(`Algoritmo LTI no admitido: ${parsed.header.alg}`);
  if (!parsed.header.kid) throw new Error('El token LTI no contiene kid');

  const keys = await getPlatformJwks();
  const jwk = keys.find(k => k.kid === parsed.header.kid);
  if (!jwk) {
    ltiJwksCache = { fetchedAt: 0, keys: [] };
    const refreshed = await getPlatformJwks();
    const retryJwk = refreshed.find(k => k.kid === parsed.header.kid);
    if (!retryJwk) throw new Error('No se encontró la clave pública usada por Moodle');
    return verifyLtiIdToken(idToken, expectedNonce, expectedClientId);
  }

  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const validSig = crypto.verify('RSA-SHA256', Buffer.from(parsed.signingInput), keyObject, parsed.signature);
  if (!validSig) throw new Error('Firma LTI inválida');

  const p = parsed.payload;
  const now = Math.floor(Date.now() / 1000);
  if (p.iss !== LTI_ISSUER) throw new Error('Issuer LTI inesperado');
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  const clientId = expectedClientId || LTI_CLIENT_IDS.find(id => aud.includes(id));
  if (!clientId || !LTI_CLIENT_IDS.includes(clientId) || !aud.includes(clientId)) {
    throw new Error('El token LTI no está dirigido a este tutor');
  }
  if (aud.length > 1 && p.azp && p.azp !== clientId) throw new Error('azp LTI inválido');
  if (!p.exp || p.exp < now - 60) throw new Error('Token LTI vencido');
  if (p.iat && p.iat > now + 60) throw new Error('Fecha de emisión LTI inválida');
  if (!p.nonce || p.nonce !== expectedNonce) throw new Error('Nonce LTI inválido');
  if (p['https://purl.imsglobal.org/spec/lti/claim/version'] !== '1.3.0') throw new Error('Versión LTI no válida');

  const deployment = p['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];

if (LTI_DEPLOYMENT_ID && deployment !== LTI_DEPLOYMENT_ID) {
  console.warn(
    `⚠️ Deployment ID recibido desde Moodle: ${deployment} | configurado: ${LTI_DEPLOYMENT_ID}`
  );
  throw new Error('Deployment ID LTI inesperado');
}

  return p;
}

function signLtiSession(payload) {
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', LTI_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyLtiSession(value) {
  try {
    const [body, sig] = String(value || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', LTI_SESSION_SECRET).update(body).digest();
    const supplied = base64urlDecodeToBuffer(sig);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(base64urlDecodeToBuffer(body).toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const result = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  });
  return result;
}

function getLtiUser(req) {
  if (!LTI_SESSION_SECRET) return null;
  return verifyLtiSession(parseCookies(req)[LTI_COOKIE_NAME]);
}

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

function ltiUserKey(user) {
  if (!user?.sub) return '';
  // El sub es un identificador opaco estable para esta integración LTI.
  return crypto.createHash('sha256').update(`${user.iss}|${user.sub}`).digest('hex').slice(0, 24);
}

function cleanupLtiStates() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, value] of ltiStates.entries()) if (value.createdAt < cutoff) ltiStates.delete(key);
}

app.all('/lti/login', (req, res) => {
  try {
    if (!ltiIsConfigured()) return res.status(503).send('LTI 1.3 todavía no está configurado en el servidor.');
    cleanupLtiStates();
    const input = { ...req.query, ...req.body };
    if (!input.login_hint) return res.status(400).send('Falta login_hint en el inicio LTI.');
    if (input.iss && input.iss !== LTI_ISSUER) return res.status(400).send('Issuer LTI no reconocido.');

    const requestedClientId = String(input.client_id || '').trim();
    const clientId = requestedClientId || (LTI_CLIENT_IDS.length === 1 ? LTI_CLIENT_IDS[0] : '');
    if (!clientId || !LTI_CLIENT_IDS.includes(clientId)) {
      return res.status(400).send('Client ID LTI no reconocido.');
    }

    const state = crypto.randomBytes(24).toString('base64url');
    const nonce = crypto.randomBytes(24).toString('base64url');
    ltiStates.set(state, { nonce, clientId, createdAt: Date.now() });

    const redirectUri = `${getPublicBaseUrl(req)}/lti/launch`;
    const params = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: clientId,
      redirect_uri: redirectUri,
      login_hint: input.login_hint,
      state,
      nonce,
    });
    if (input.lti_message_hint) params.set('lti_message_hint', input.lti_message_hint);
    res.redirect(`${LTI_AUTH_LOGIN_URL}${LTI_AUTH_LOGIN_URL.includes('?') ? '&' : '?'}${params.toString()}`);
  } catch (err) {
    console.error('Error en /lti/login:', err);
    res.status(500).send('No se pudo iniciar la autenticación LTI.');
  }
});

app.post('/lti/launch', async (req, res) => {
  try {
    if (!ltiIsConfigured()) return res.status(503).send('LTI 1.3 todavía no está configurado en el servidor.');
    const stateInfo = ltiStates.get(String(req.body?.state || ''));
    if (!stateInfo) return res.status(400).send('Estado LTI inválido o vencido. Vuelve a abrir la actividad desde Moodle.');
    ltiStates.delete(String(req.body.state));
    const claims = await verifyLtiIdToken(req.body?.id_token, stateInfo.nonce, stateInfo.clientId);

    const context = claims['https://purl.imsglobal.org/spec/lti/claim/context'] || {};
    const resource = claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'] || {};
    const roles = claims['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const user = {
      iss: claims.iss,
      sub: claims.sub,
      name: claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || 'Estudiante Moodle',
      email: claims.email || '',
      contextId: context.id || '',
      contextTitle: context.title || context.label || '',
      resourceLinkId: resource.id || '',
      roles,
      deploymentId: claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] || '',
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
    };
    user.userKey = ltiUserKey(user);

    const token = signLtiSession(user);
    const secure = getPublicBaseUrl(req).startsWith('https://');
    res.setHeader('Set-Cookie', `${LTI_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${8 * 60 * 60}; SameSite=None${secure ? '; Secure' : ''}`);
    res.redirect('/?lti=1');
  } catch (err) {
    console.error('Error en /lti/launch:', err);
    res.status(400).send(`No se pudo validar el acceso desde Moodle: ${err.message}`);
  }
});

app.get('/lti/jwks', (req, res) => {
  res.json({ keys: [LTI_TOOL_KEY.publicJwk] });
});

app.get('/api/lti/me', (req, res) => {
  const user = getLtiUser(req);
  if (!user) return res.json({ authenticated: false, ltiConfigured: ltiIsConfigured() });
  res.json({
    authenticated: true,
    ltiConfigured: true,
    user: {
      userKey: user.userKey,
      name: user.name,
      email: user.email,
      contextId: user.contextId,
      contextTitle: user.contextTitle,
      resourceLinkId: user.resourceLinkId,
      roles: user.roles,
    },
  });
});

const PROMPTS_DIR = path.join(__dirname, 'prompts');

function loadPromptTemplate(name) {
  const filePath = path.join(PROMPTS_DIR, `${name}.txt`);

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Advertencia: No se encontró el prompt ${name}.txt`);
    return '';
  }

  return fs.readFileSync(filePath, 'utf8');
}

function buildHistoryText(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '(No hay historial previo)';
  }

  return messages
    .map((m) => {
      const role = m?.role;
      const content = m?.content ?? '';

      if (role === 'student') return `Estudiante: ${content}`;
      if (role === 'system') return `Sistema: ${content}`;
      return `Tutor: ${content}`;
    })
    .join('\n');
}

function getLastStudentMessage(messages) {
  if (!Array.isArray(messages)) {
    return 'El estudiante inicia el ejercicio.';
  }

  const found = [...messages].reverse().find((m) => m.role === 'student');
  return found ? found.content : 'El estudiante inicia el ejercicio.';
}

function normalizeEndpoint(endpoint) {
  return endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
}

function isValidExerciseImage(imageDataUrl) {
  if (!imageDataUrl) return false;
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(imageDataUrl));
}

async function callAzureChat(prompt, imageDataUrl = null) {
  const url = `${normalizeEndpoint(AZURE_OPENAI_ENDPOINT)}chat/completions`;

  const userContent = imageDataUrl
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: imageDataUrl,
            detail: 'high',
          },
        },
      ]
    : prompt;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: AZURE_OPENAI_DEPLOYMENT,
      messages: [
        {
          role: 'developer',
          content:
            'Eres un tutor universitario de física. Responde siempre en español claro, útil y pedagógico. Si se adjunta una imagen, interprétala cuidadosamente: puede contener el enunciado completo, datos numéricos, gráficos, diagramas, circuitos, tablas o figuras. No inventes datos que no sean legibles; si algo de la imagen es ambiguo, pide al estudiante que lo confirme.',
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Error al consultar Azure OpenAI');
    error.status = response.status;
    error.responseData = data;
    throw error;
  }

  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function generateText(prompt, imageDataUrl = null) {
  return callAzureChat(prompt, imageDataUrl);
}

app.post('/api/tutor', async (req, res) => {
  try {
    const { exercise, exerciseImage, messages, mode, studentName } = req.body;

    const hasImage = isValidExerciseImage(exerciseImage);
    if (!exercise && !hasImage) {
      return res.status(400).json({ error: 'Falta el enunciado o una imagen del ejercicio.' });
    }

    const historyText = buildHistoryText(messages);
    const lastStudentMessage = getLastStudentMessage(messages);

    let promptName = 'tutor_fisica_guiada';
    if (mode === 'corta') promptName = 'tutor_fisica_corta';
    if (mode === 'diagnostico') promptName = 'tutor_fisica_diagnostico';

    const template = loadPromptTemplate(promptName);
    const basePrompt =
      template ||
      [
        'Eres un tutor de física.',
        'Estudiante: {{ESTUDIANTE}}',
        'Ejercicio: {{ENUNCIADO}}',
        'Historial: {{HISTORIAL}}',
        'Último mensaje del estudiante: {{MENSAJE_ESTUDIANTE}}',
      ].join('\n');

    const fullPrompt = basePrompt
      .replace('{{ENUNCIADO}}', exercise || '[El enunciado completo está contenido en la imagen adjunta. Lee tanto el texto como la figura.]')
      .replace('{{HISTORIAL}}', historyText)
      .replace('{{MENSAJE_ESTUDIANTE}}', lastStudentMessage)
      .replace('{{ESTUDIANTE}}', studentName || 'Estudiante');

    const text = await generateText(fullPrompt, hasImage ? exerciseImage : null);

    res.json({ text });
  } catch (err) {
    console.error('Error llamando a Azure OpenAI:', err.responseData || err);

    const status = err.status || 500;
    let message = 'Error interno del servidor al procesar la solicitud.';

    if (status === 429) {
      message =
        '⚠️ Se alcanzó el límite de solicitudes o de tokens. Intenta nuevamente en unos segundos.';
    } else if (status === 401 || status === 403) {
      message =
        '⚠️ Error de autenticación con la API. Revisa la clave y el endpoint configurados.';
    } else if (status >= 500) {
      message =
        '⚠️ El servicio de IA no respondió correctamente. Intenta de nuevo en unos segundos.';
    }

    res.status(status).json({
      error: message,
      detail: err.message,
    });
  }
});

app.post('/api/evaluate', async (req, res) => {
  try {
    const { exercise, exerciseImage, messages, studentName } = req.body;

    const hasImage = isValidExerciseImage(exerciseImage);
    if ((!exercise && !hasImage) || !messages || messages.length === 0) {
      return res.status(400).json({ error: 'Faltan datos para evaluar.' });
    }

    const historyText = buildHistoryText(messages);
    const evalTemplate = loadPromptTemplate('evaluacion_sesion');
    const baseEvalPrompt =
      evalTemplate ||
      [
        'Evalúa esta sesión de física y devuelve un JSON válido.',
        'Estudiante: {{ESTUDIANTE}}',
        'Ejercicio: {{ENUNCIADO}}',
        'Conversación: {{CONVERSACION}}',
      ].join('\n');

    const evalPrompt = baseEvalPrompt
      .replace('{{ENUNCIADO}}', exercise || '[El enunciado completo está contenido en la imagen adjunta.]')
      .replace('{{CONVERSACION}}', historyText)
      .replace('{{ESTUDIANTE}}', studentName || 'Estudiante');

    let text = await generateText(evalPrompt, hasImage ? exerciseImage : null);
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    let jsonResult;
    try {
      jsonResult = JSON.parse(text);
    } catch (e) {
      jsonResult = {
        error: 'No se pudo generar JSON válido',
        raw: text,
      };
    }

    res.json({ ok: true, evaluation: jsonResult });
  } catch (err) {
    console.error('Error en /api/evaluate:', err.responseData || err);

    res.status(err.status || 500).json({
      error: 'Error al evaluar',
      detail: err.message,
    });
  }
});

app.post('/api/save-session', (req, res) => {
  try {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

    const ltiUser = getLtiUser(req);
    const rawStudentName = req.body?.studentName || ltiUser?.name || 'Sin_nombre';
    const safeStudentName = safeFilePart(rawStudentName) || 'Sin_nombre';
    const suppliedSessionId = String(req.body?.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const sessionId = suppliedSessionId || `ses-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ownerPart = ltiUser?.userKey ? `moodle-${ltiUser.userKey}` : safeStudentName;
    const filename = path.join(sessionsDir, `sesion-${ownerPart}-${sessionId}.json`);

    const trustedLti = ltiUser ? {
      userKey: ltiUser.userKey,
      name: ltiUser.name,
      email: ltiUser.email || '',
      contextId: ltiUser.contextId || '',
      contextTitle: ltiUser.contextTitle || '',
      resourceLinkId: ltiUser.resourceLinkId || '',
      roles: ltiUser.roles || [],
    } : null;

    const stored = { ...req.body, sessionId, lti: trustedLti, savedAt: new Date().toISOString() };
    fs.writeFileSync(filename, JSON.stringify(stored, null, 2), 'utf8');
    res.json({ ok: true, file: filename, sessionId, associatedWithMoodle: Boolean(trustedLti) });
  } catch (err) {
    console.error('Error guardando sesión:', err);
    res.status(500).json({ error: 'Error guardando', detail: err.message });
  }
});


app.get('/api/my-active-session', (req, res) => {
  try {
    const ltiUser = getLtiUser(req);
    if (!ltiUser?.userKey) return res.status(401).json({ error: 'No hay una identidad Moodle activa.' });
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) return res.json({ ok: true, session: null });

    const candidates = [];
    for (const name of fs.readdirSync(sessionsDir)) {
      if (!name.endsWith('.json')) continue;
      const fullPath = path.join(sessionsDir, name);
      try {
        const st = fs.statSync(fullPath);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (data?.lti?.userKey === ltiUser.userKey && !data.sessionFinished && !data.discarded) {
          candidates.push({ data, mtime: st.mtimeMs });
        }
      } catch {}
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    res.json({ ok: true, session: candidates[0]?.data || null });
  } catch (err) {
    console.error('Error buscando sesión Moodle:', err);
    res.status(500).json({ error: 'No se pudo buscar la sesión Moodle.' });
  }
});

app.post('/api/session/:sessionId/discard', (req, res) => {
  try {
    const sessionsDir = path.join(__dirname, 'sessions');
    const sessionId = String(req.params.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sessionId || !fs.existsSync(sessionsDir)) return res.status(404).json({ error: 'Sesión no encontrada' });
    const suffix = `-${sessionId}.json`;
    const file = fs.readdirSync(sessionsDir).find(name => name.endsWith(suffix));
    if (!file) return res.status(404).json({ error: 'Sesión no encontrada' });
    const fullPath = path.join(sessionsDir, file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const ltiUser = getLtiUser(req);
    if (data?.lti?.userKey && data.lti.userKey !== ltiUser?.userKey) return res.status(403).json({ error: 'No autorizado' });
    data.discarded = true;
    data.discardedAt = new Date().toISOString();
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo descartar la sesión.' });
  }
});

app.get('/api/session/:sessionId', (req, res) => {
  try {
    const sessionsDir = path.join(__dirname, 'sessions');
    const sessionId = String(req.params.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sessionId || !fs.existsSync(sessionsDir)) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const suffix = `-${sessionId}.json`;
    const file = fs.readdirSync(sessionsDir).find(name => name.endsWith(suffix));
    if (!file) return res.status(404).json({ error: 'Sesión no encontrada' });

    const fullPath = path.join(sessionsDir, file);
    const session = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    res.json({ ok: true, session });
  } catch (err) {
    console.error('Error recuperando sesión:', err);
    res.status(500).json({ error: 'Error recuperando sesión', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});