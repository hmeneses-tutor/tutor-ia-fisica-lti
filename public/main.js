// main.js

// ==========================
// Estado en memoria del navegador
// ==========================
let messages = []; // { role: 'student' | 'tutor' | 'system', content: string }
let currentMode = 'guiada'; // guiada | corta | diagnostico
let sessionFinished = false; // se vuelve true al evaluar la sesión
let exerciseImageDataUrl = ''; // captura/imagen del ejercicio en formato data URL
let sessionStartedAt = null;
let sessionEndedAt = null;
let currentEvaluation = null;
let sessionId = null;
let autosaveTimer = null;
let serverAutosaveTimer = null;
let ltiIdentity = null;

// ==========================
// Elementos del DOM
// ==========================
const exerciseEl = document.getElementById('exercise');
const chatEl = document.getElementById('chat');
const studentMessageEl = document.getElementById('studentMessage');
const statusEl = document.getElementById('status');
const evaluationOutputEl = document.getElementById('evaluationOutput');
const studentNameEl = document.getElementById('studentName');
const teamMembersEl = document.getElementById('teamMembers');
const ltiIdentityInfoEl = document.getElementById('ltiIdentityInfo');
const exerciseImageDropzone = document.getElementById('exerciseImageDropzone');
const exerciseImageInput = document.getElementById('exerciseImageInput');
const exerciseImagePreview = document.getElementById('exerciseImagePreview');
const exerciseImageEmpty = document.getElementById('exerciseImageEmpty');
const selectExerciseImageBtn = document.getElementById('selectExerciseImageBtn');
const removeExerciseImageBtn = document.getElementById('removeExerciseImageBtn');

const sessionEndCardEl = document.getElementById('sessionEndCard');
const sessionEndSummaryEl = document.getElementById('sessionEndSummary');
const newSessionBtn = document.getElementById('newSessionBtn');

const sendBtn = document.getElementById('sendBtn');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const evaluateSessionBtn = document.getElementById('evaluateSessionBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const finalExportPdfBtn = document.getElementById('finalExportPdfBtn');
const restoreSessionBtn = document.getElementById('restoreSessionBtn');
const discardSavedSessionBtn = document.getElementById('discardSavedSessionBtn');
const autosaveNoticeEl = document.getElementById('autosaveNotice');

const toggleThemeBtn = document.getElementById('toggleThemeBtn');
const startTutorBtn = document.getElementById('startTutorBtn');

const modeButtons = document.querySelectorAll('.btn-mode');
const mathSymbolButtons = document.querySelectorAll('.math-symbol-btn');

// Toggle del panel de símbolos extra
const mathToggleBtn = document.getElementById('mathToggleBtn');
const mathExtraPanel = document.getElementById('mathExtraPanel');

if (mathToggleBtn && mathExtraPanel) {
  mathToggleBtn.addEventListener('click', () => {
    const wasHidden = mathExtraPanel.classList.contains('hidden');
    mathExtraPanel.classList.toggle('hidden', !wasHidden);
    mathToggleBtn.classList.toggle('active', wasHidden);
    mathToggleBtn.textContent = wasHidden ? 'Menos símbolos ▴' : 'Más símbolos ▾';
  });
}

// ==========================
// Mapas para superíndices y subíndices
// ==========================
const superMap = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  "n": "ⁿ",
  "i": "ⁱ", "j": "ʲ",
  "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ", "f": "ᶠ", "g": "ᵍ",
  "h": "ʰ", "k": "ᵏ", "l": "ˡ", "m": "ᵐ", "o": "ᵒ", "p": "ᵖ",
  "r": "ʳ", "s": "ˢ", "t": "ᵗ", "u": "ᵘ", "v": "ᵛ", "w": "ʷ", "x": "ˣ", "y": "ʸ", "z": "ᶻ"
};

const subMap = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  "n": "ₙ",
  "i": "ᵢ", "j": "ⱼ",
  "a": "ₐ", "e": "ₑ", "h": "ₕ", "k": "ₖ", "l": "ₗ", "m": "ₘ",
  "o": "ₒ", "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ"
};

// ==========================
// Identidad básica del estudiante
// ==========================
function loadStudentIdentity() {
  if (!studentNameEl) return;
  const savedName = localStorage.getItem('studentName');
  if (savedName) studentNameEl.value = savedName;
  if (teamMembersEl) teamMembersEl.value = localStorage.getItem('teamMembers') || '';
}

function persistStudentIdentity() {
  if (!studentNameEl) return;
  if (!ltiIdentity) localStorage.setItem('studentName', studentNameEl.value.trim());
  if (teamMembersEl) localStorage.setItem('teamMembers', teamMembersEl.value.trim());
}

function getPrimaryStudentName() {
  const name = studentNameEl?.value?.trim() || '';
  return name || 'Sin nombre';
}

function getStudentName() {
  const primary = getPrimaryStudentName();
  const teammates = teamMembersEl?.value?.trim() || '';
  return teammates ? `${primary} - ${teammates}` : primary;
}

async function loadLtiIdentity() {
  try {
    const resp = await fetch('/api/lti/me', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error('No se pudo consultar la identidad LTI');
    const data = await resp.json();
    if (data.authenticated && data.user) {
      ltiIdentity = data.user;
      if (studentNameEl) {
        studentNameEl.value = data.user.name || 'Estudiante Moodle';
        studentNameEl.readOnly = true;
        studentNameEl.classList.add('identity-locked');
      }
      if (ltiIdentityInfoEl) {
        const course = data.user.contextTitle ? ` · ${data.user.contextTitle}` : '';
        ltiIdentityInfoEl.textContent = `✓ Identificado mediante Moodle${course}`;
        ltiIdentityInfoEl.classList.remove('hidden');
      }
      if (teamMembersEl) teamMembersEl.value = localStorage.getItem('teamMembers') || '';
      return;
    }
  } catch (err) {
    console.warn('Acceso independiente, sin identidad LTI:', err.message);
  }
  ltiIdentity = null;
  if (studentNameEl) {
    studentNameEl.readOnly = false;
    studentNameEl.classList.remove('identity-locked');
  }
  if (ltiIdentityInfoEl) ltiIdentityInfoEl.classList.add('hidden');
  loadStudentIdentity();
}

// ==========================
// Recuperación automática de sesión (borrador local)
// ==========================
const DRAFT_DB_NAME = 'TutorIAFisicaDB';
const DRAFT_STORE = 'drafts';
const CURRENT_DRAFT_KEY = 'current-session';
const ACTIVE_SESSION_STORAGE_KEY = 'tutorIAActiveSessionId';

function openDraftDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function writeDraft(state) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).put(state, CURRENT_DRAFT_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function readDraft() {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readonly');
    const req = tx.objectStore(DRAFT_STORE).get(CURRENT_DRAFT_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function clearDraft() {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).delete(CURRENT_DRAFT_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function buildSessionState() {
  return {
    version: 2,
    sessionId,
    studentName: getStudentName(),
    primaryStudentName: getPrimaryStudentName(),
    teamMembers: teamMembersEl?.value?.trim() || '',
    lti: ltiIdentity,
    exercise: exerciseEl?.value || '',
    exerciseImage: exerciseImageDataUrl || '',
    mode: currentMode,
    messages,
    sessionFinished,
    sessionStartedAt,
    sessionEndedAt,
    evaluation: currentEvaluation,
    savedAt: new Date().toISOString()
  };
}

function rememberActiveSessionId(id = sessionId) {
  if (id) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
}

function forgetActiveSessionId() {
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

async function saveSessionToServer({ silent = true } = {}) {
  if (!sessionStartedAt || !sessionId || messages.length === 0) return false;

  const state = buildSessionState();
  try {
    const resp = await fetch('/api/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        studentName: state.studentName,
        primaryStudentName: state.primaryStudentName,
        teamMembers: state.teamMembers,
        exercise: state.exercise,
        exerciseImage: state.exerciseImage || null,
        mode: state.mode,
        messages: state.messages,
        timestamp: new Date().toISOString(),
        sessionStartedAt: state.sessionStartedAt,
        sessionEndedAt: state.sessionEndedAt,
        evaluation: state.evaluation,
        sessionFinished: state.sessionFinished
      })
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    if (data?.sessionId) {
      sessionId = data.sessionId;
      rememberActiveSessionId(sessionId);
    }
    if (!silent) setStatus('Sesión guardada correctamente en el servidor.');
    return Boolean(data?.ok);
  } catch (err) {
    console.error('No se pudo guardar automáticamente en el servidor:', err);
    if (!silent) setStatus('No se pudo guardar la sesión en el servidor.', true);
    return false;
  }
}

async function readServerSessionById(id) {
  if (!id) return null;
  try {
    const resp = await fetch(`/api/session/${encodeURIComponent(id)}`);
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    return data?.session || null;
  } catch (err) {
    console.error('No se pudo recuperar la sesión desde el servidor:', err);
    return null;
  }
}

async function getRecoverableState() {
  const localDraft = await readDraft().catch(() => null);
  if (localDraft && !localDraft.sessionFinished && Array.isArray(localDraft.messages) && localDraft.messages.length > 0) {
    return { state: localDraft, source: 'local' };
  }
  const activeId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  const serverDraft = await readServerSessionById(activeId);
  if (serverDraft && !serverDraft.sessionFinished && Array.isArray(serverDraft.messages) && serverDraft.messages.length > 0) {
    return { state: serverDraft, source: 'servidor' };
  }
  if (ltiIdentity) {
    try {
      const resp = await fetch('/api/my-active-session', { credentials: 'same-origin' });
      if (resp.ok) {
        const data = await resp.json();
        const moodleDraft = data?.session;
        if (moodleDraft && !moodleDraft.sessionFinished && Array.isArray(moodleDraft.messages) && moodleDraft.messages.length > 0) {
          return { state: moodleDraft, source: 'Moodle/servidor' };
        }
      }
    } catch (err) {
      console.warn('No se pudo buscar una sesión asociada a Moodle:', err);
    }
  }
  return null;
}

async function autosaveLocalNow() {
  if (!sessionStartedAt && messages.length === 0) return;
  try {
    await writeDraft(buildSessionState());
    if (autosaveNoticeEl) autosaveNoticeEl.textContent = 'Guardado automático activo';
  } catch (err) {
    console.error('No se pudo guardar el borrador local:', err);
    if (autosaveNoticeEl) autosaveNoticeEl.textContent = 'No se pudo guardar automáticamente';
  }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveLocalNow, 350);

  // Copia de seguridad automática en el servidor. Se hace con más demora
  // para evitar una escritura por cada tecla pulsada.
  clearTimeout(serverAutosaveTimer);
  serverAutosaveTimer = setTimeout(() => saveSessionToServer({ silent: true }), 1800);
}

function renderMessagesFromState() {
  chatEl.innerHTML = '';
  messages.forEach(m => appendMessage(m.role, m.content));
}

async function restoreSavedDraft() {
  try {
    const recoverable = await getRecoverableState();
    if (!recoverable) {
      setStatus('No hay una sesión pendiente para recuperar.', true);
      return;
    }
    const draft = recoverable.state;
    sessionId = draft.sessionId || null;
    if (!ltiIdentity) {
      studentNameEl.value = draft.primaryStudentName || (draft.studentName && draft.studentName !== 'Sin nombre' ? draft.studentName : '');
    }
    if (teamMembersEl) teamMembersEl.value = draft.teamMembers || '';
    persistStudentIdentity();
    exerciseEl.value = draft.exercise || '';
    exerciseImageDataUrl = draft.exerciseImage || '';
    currentMode = draft.mode || 'guiada';
    messages = Array.isArray(draft.messages) ? draft.messages : [];
    sessionFinished = Boolean(draft.sessionFinished);
    sessionStartedAt = draft.sessionStartedAt || null;
    sessionEndedAt = draft.sessionEndedAt || null;
    currentEvaluation = draft.evaluation || null;

    modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
    updateExerciseImageUI();
    renderMessagesFromState();

    evaluationOutputEl.innerHTML = currentEvaluation ? renderEvaluationPanel(currentEvaluation) : '(Aquí aparecerá la evaluación de la sesión)';
    if (currentEvaluation) typesetLatexSafely(evaluationOutputEl);
    sendBtn.disabled = sessionFinished;
    studentMessageEl.disabled = sessionFinished;
    evaluateSessionBtn.disabled = sessionFinished;
    if (sessionFinished) showSessionEndCard(); else hideSessionEndCard();
    setStatus(`Sesión recuperada desde ${recoverable.source}. Puedes continuar donde la dejaste.`);
    if (autosaveNoticeEl) autosaveNoticeEl.textContent = 'Sesión recuperada · guardado automático activo';
  } catch (err) {
    console.error('Error recuperando sesión:', err);
    setStatus('No se pudo recuperar la sesión guardada.', true);
  }
}

async function discardSavedDraft() {
  await clearDraft().catch(console.error);
  if (sessionId) {
    fetch(`/api/session/${encodeURIComponent(sessionId)}/discard`, { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  }
  forgetActiveSessionId();
  if (restoreSessionBtn) restoreSessionBtn.classList.add('hidden');
  if (discardSavedSessionBtn) discardSavedSessionBtn.classList.add('hidden');
  if (autosaveNoticeEl) autosaveNoticeEl.textContent = 'Guardado automático activo';
  setStatus('Borrador anterior descartado.');
}

async function checkForRecoverableDraft() {
  try {
    const recoverable = await getRecoverableState();
    const hasRecoverable = Boolean(recoverable);
    if (restoreSessionBtn) restoreSessionBtn.classList.toggle('hidden', !hasRecoverable);
    if (discardSavedSessionBtn) discardSavedSessionBtn.classList.toggle('hidden', !hasRecoverable);
    if (autosaveNoticeEl) autosaveNoticeEl.textContent = hasRecoverable
      ? `Hay una sesión anterior sin finalizar disponible para recuperar (${recoverable.source})`
      : 'Guardado automático activo';
  } catch (err) {
    console.error('No se pudo comprobar el borrador:', err);
  }
}

// ==========================
// Imagen/captura del ejercicio
// ==========================
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_JPEG_QUALITY = 0.92;

function updateExerciseImageUI() {
  const hasImage = Boolean(exerciseImageDataUrl);
  if (exerciseImagePreview) {
    exerciseImagePreview.src = hasImage ? exerciseImageDataUrl : '';
    exerciseImagePreview.classList.toggle('hidden', !hasImage);
  }
  if (exerciseImageEmpty) exerciseImageEmpty.classList.toggle('hidden', hasImage);
  if (removeExerciseImageBtn) removeExerciseImageBtn.classList.toggle('hidden', !hasImage);
}

function clearExerciseImage() {
  exerciseImageDataUrl = '';
  if (exerciseImageInput) exerciseImageInput.value = '';
  updateExerciseImageUI();
  scheduleAutosave();
}

function fileToOptimizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function setExerciseImageFromFile(file) {
  try {
    setStatus('Procesando imagen del ejercicio...');
    exerciseImageDataUrl = await fileToOptimizedDataUrl(file);
    updateExerciseImageUI();
    scheduleAutosave();
    setStatus('Imagen del ejercicio cargada correctamente.');
  } catch (err) {
    console.error('Error procesando imagen:', err);
    setStatus(err.message || 'No se pudo cargar la imagen.', true);
  }
}

function getClipboardImageFile(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find(item => item.type?.startsWith('image/'));
  return imageItem ? imageItem.getAsFile() : null;
}

function hideSessionEndCard() {
  if (!sessionEndCardEl) return;
  sessionEndCardEl.classList.add('hidden');
  if (sessionEndSummaryEl) {
    sessionEndSummaryEl.textContent = 'La sesión fue evaluada correctamente.';
  }
}

function showSessionEndCard() {
  if (!sessionEndCardEl || !sessionEndSummaryEl) return;

  const modeMap = {
    guiada: 'Guía paso a paso',
    corta: 'Explicación corta',
    diagnostico: 'Diagnóstico inicial'
  };

  const modeLabel = modeMap[currentMode] || currentMode;
  const studentName = getStudentName();

  sessionEndSummaryEl.innerHTML = `
    <strong>Estudiante:</strong> ${studentName}<br>
    <strong>Modo:</strong> ${modeLabel}<br>
    <strong>Estado:</strong> Sesión finalizada y evaluada
  `;

  sessionEndCardEl.classList.remove('hidden');
}

// ==========================
// Conversión porcentaje (0–100) → nota UTEC (1.00–5.00)
// ==========================
function convertirPorcentajeUTEC(p) {
  const tabla = [
    1.00, 1.04, 1.08, 1.12, 1.17, 1.21, 1.25, 1.29, 1.33, 1.37,
    1.41, 1.45, 1.50, 1.54, 1.58, 1.62, 1.66, 1.70, 1.74, 1.78,
    1.83, 1.87, 1.91, 1.95, 1.99, 2.00, 2.03, 2.06, 2.09, 2.12,
    2.15, 2.19, 2.22, 2.25, 2.28, 2.31, 2.34, 2.37, 2.40, 2.43,
    2.46, 2.49, 2.52, 2.56, 2.59, 2.62, 2.65, 2.68, 2.71, 2.74,
    2.75, 2.78, 2.80, 2.83, 2.86, 2.88, 2.91, 2.94, 2.96, 2.99,
    3.00, 3.10, 3.21, 3.32, 3.43, 3.54, 3.66, 3.77, 3.88, 3.99,
    4.00, 4.05, 4.10, 4.16, 4.21, 4.26, 4.31, 4.36, 4.42, 4.47,
    4.52, 4.57, 4.63, 4.68, 4.73, 4.78, 4.83, 4.89, 4.94, 4.99,
    5.00, 5.00, 5.00, 5.00, 5.00, 5.00, 5.00, 5.00, 5.00, 5.00, 5.00
  ];

  p = Math.min(100, Math.max(0, Math.round(p)));
  return tabla[p];
}

function getConceptoUTEC(n) {
  if (n < 2.0) return 'Deficiente';
  if (n < 3.0) return 'Insuficiente';
  if (n < 4.0) return 'Suficiente';
  if (n < 5.0) return 'Muy bueno';
  return 'Excelente';
}

function getColorForNotaUTEC(notaUTEC) {
  const concepto = getConceptoUTEC(notaUTEC);
  switch (concepto) {
    case 'Deficiente':
      return { bg: '#fee2e2', fg: '#b91c1c' };
    case 'Insuficiente':
      return { bg: '#ffedd5', fg: '#c2410c' };
    case 'Suficiente':
      return { bg: '#ecfdf3', fg: '#15803d' };
    case 'Muy bueno':
      return { bg: '#e0f2fe', fg: '#1d4ed8' };
    case 'Excelente':
    default:
      return { bg: '#fef9c3', fg: '#854d0e' };
  }
}

// ==========================
// Utilidades UI
// ==========================
function typesetLatexSafely(element) {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([element]).catch(err => {
      console.log('MathJax error:', err);
    });
  } else {
    setTimeout(() => typesetLatexSafely(element), 200);
  }
}

function appendMessage(role, content) {
  const div = document.createElement('div');

  let cssRole = 'tutor';
  if (role === 'student') cssRole = 'student';
  if (role === 'system') cssRole = 'tutor';

  div.classList.add('message', cssRole);

  const header = document.createElement('div');
  header.classList.add('message-header');

  if (role === 'student') {
    header.textContent = 'Estudiante';
  } else if (role === 'system') {
    header.textContent = 'Sistema';
  } else {
    header.textContent = 'Tutor IA';
  }

  const body = document.createElement('div');
  body.classList.add('message-body');

  const formattedContent = String(content)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');

  body.innerHTML = formattedContent;

  div.appendChild(header);
  div.appendChild(body);
  chatEl.appendChild(div);

  typesetLatexSafely(body);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.className = 'status';
  if (isError) statusEl.classList.add('error');
}

function insertSymbolInStudentMessage(symbol) {
  const textarea = studentMessageEl;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const value = textarea.value;

  const newValue = value.slice(0, start) + symbol + value.slice(end);
  textarea.value = newValue;

  const newCursorPos = start + symbol.length;
  textarea.selectionStart = textarea.selectionEnd = newCursorPos;
  textarea.focus();
}

function convertSelected(action) {
  const ta = studentMessageEl;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  if (end <= start) return;

  const selected = ta.value.substring(start, end);
  if (!selected) return;

  const map = action === 'super' ? superMap : subMap;
  let converted = '';

  for (const ch of selected) {
    converted += map[ch] || ch;
  }

  ta.value = ta.value.substring(0, start) + converted + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + converted.length;
  ta.focus();
}

// ==========================
// Panel visual de evaluación
// ==========================
function renderEvaluationPanel(data) {
  if (!data) return '(No hay datos)';

  const {
    nota_global,
    conceptos,
    procedimientos,
    unidades,
    autonomia,
    retroalimentacion_general,
    comentarios_detallados
  } = data;

  const studentName = getStudentName();

  const esDiagnosticaSinEvidencia =
    nota_global === 0 &&
    conceptos === 0 &&
    procedimientos === 0 &&
    unidades === 0;

  let avisoDiagnostico = '';
  if (esDiagnosticaSinEvidencia) {
    avisoDiagnostico = `
<div style="margin-top:6px; padding:6px 8px; border-radius:4px; background:#fef3c7; color:#92400e; font-size:0.8rem;">
  Esta es una <strong>evaluación diagnóstica sin evidencia suficiente</strong>:
  el estudiante aún no intentó resolver el problema. Se recomienda que realice
  al menos un paso de la resolución para poder evaluar mejor su desempeño.
</div><br>
`;
  }

  const notaUTEC = convertirPorcentajeUTEC(nota_global ?? 0);
  const conceptoUTEC = getConceptoUTEC(notaUTEC);
  const colores = getColorForNotaUTEC(notaUTEC);

  return `
<strong>Estudiante:</strong> ${studentName}<br><br>

⭐ <strong>Nota global: ${nota_global}/100</strong><br>
<div style="margin-top:4px; margin-bottom:8px; display:inline-block; padding:4px 8px; border-radius:999px; background:${colores.bg}; color:${colores.fg}; font-size:0.9rem;">
  🎓 Calificación UTEC: <strong>${notaUTEC.toFixed(2)}</strong> &nbsp;(${conceptoUTEC})
</div>
<br><br>
${avisoDiagnostico}
<strong>Conceptos:</strong> ${conceptos}/10<br>
<strong>Procedimientos:</strong> ${procedimientos}/10<br>
<strong>Unidades:</strong> ${unidades}/10<br>
<strong>Autonomía:</strong> ${autonomia}/10<br><br>

<strong>Retroalimentación general:</strong><br>
<div style="margin-left:10px; margin-top:4px;">
  ${retroalimentacion_general}
</div><br>

<strong>Comentarios detallados:</strong><br>
<ul style="margin-left:18px;">
  <li><strong>Conceptos:</strong> ${comentarios_detallados?.conceptos ?? ''}</li>
  <li><strong>Procedimientos:</strong> ${comentarios_detallados?.procedimientos ?? ''}</li>
  <li><strong>Unidades:</strong> ${comentarios_detallados?.unidades ?? ''}</li>
  <li><strong>Autonomía:</strong> ${comentarios_detallados?.autonomia ?? ''}</li>
</ul>

<hr style="margin:8px 0;">

<details>
  <summary style="cursor:pointer; color:#2563eb;">Ver JSON completo</summary>
  <pre>
${JSON.stringify(data, null, 2)}
  </pre>
</details>
`;
}

// ==========================
// Cambiar modo del tutor
// ==========================
modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode || 'guiada';
    scheduleAutosave();
    setStatus(`Modo del tutor: ${currentMode}`, false);
  });
});

// ==========================
// Llamar al backend /api/tutor
// ==========================
async function callTutor(customMessages) {
  const exercise = exerciseEl.value.trim();
  const mode = currentMode;
  const payloadMessages = customMessages ?? messages;

  if (!exercise && !exerciseImageDataUrl) {
    setStatus('Ingresa el enunciado o pega/selecciona una imagen del ejercicio.', true);
    return null;
  }

  try {
    setStatus('Consultando al tutor IA...');

    const resp = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercise,
        exerciseImage: exerciseImageDataUrl || null,
        messages: payloadMessages,
        mode,
        studentName: getStudentName()
      })
    });

    if (!resp.ok) {
      try {
        const errorData = await resp.json();
        if (errorData.error) {
          console.error('Error API:', errorData.detail || errorData.error);
          setStatus(errorData.error, true);
          appendMessage('system', `❌ **Error:** ${errorData.error}`);
          return null;
        }
      } catch (e) {
        const textError = await resp.text();
        console.error('Error desconocido:', textError);
      }

      setStatus('Error al comunicarse con el tutor IA. Intenta de nuevo.', true);
      return null;
    }

    const data = await resp.json();
    const text = data.text || '(Sin respuesta del tutor)';
    setStatus('Respuesta recibida del tutor IA.');
    return text;
  } catch (err) {
    console.error('Error de red en /api/tutor:', err);
    setStatus('Error de conexión. Verifica tu internet o si el servidor está encendido.', true);
    return null;
  }
}

// ==========================
// Iniciar tutor
// ==========================
async function handleStartTutor() {
  const studentName = getStudentName();

  if (!studentName || studentName === 'Sin nombre') {
    setStatus('Por favor escribe tu nombre antes de iniciar el tutor.', true);
    studentNameEl?.focus();
    return;
  }

  messages = [];
  sessionFinished = false;
  sessionStartedAt = new Date().toISOString();
  sessionEndedAt = null;
  currentEvaluation = null;
  sessionId = (crypto.randomUUID ? crypto.randomUUID() : `ses-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  rememberActiveSessionId(sessionId);
  chatEl.innerHTML = '';
  evaluationOutputEl.innerHTML = '(Aquí aparecerá la evaluación de la sesión)';
  hideSessionEndCard();

  sendBtn.disabled = false;
  studentMessageEl.disabled = false;
  evaluateSessionBtn.disabled = false;

  const textoTutor = await callTutor([]);
  if (!textoTutor) return;

  messages.push({ role: 'tutor', content: textoTutor });
  appendMessage('tutor', textoTutor);
  scheduleAutosave();
}

// ==========================
// Enviar mensaje del estudiante
// ==========================
async function handleSend() {
  if (sessionFinished) {
    setStatus('La sesión ya fue evaluada y está cerrada. Inicia una nueva para continuar.', true);
    return;
  }

  const studentText = studentMessageEl.value.trim();
  if (!studentText) {
    setStatus('Escribe un mensaje antes de enviar.', true);
    return;
  }

  messages.push({ role: 'student', content: studentText });
  appendMessage('student', studentText);
  scheduleAutosave();
  studentMessageEl.value = '';

  const textoTutor = await callTutor();
  if (!textoTutor) return;

  messages.push({ role: 'tutor', content: textoTutor });
  appendMessage('tutor', textoTutor);
  scheduleAutosave();
}

// ==========================
// Guardar sesión en servidor
// ==========================
async function handleSaveSession() {
  const exercise = exerciseEl.value.trim();

  if (!exercise && !exerciseImageDataUrl) {
    setStatus('No hay enunciado ni imagen para guardar.', true);
    return;
  }

  if (messages.length === 0) {
    setStatus('No hay conversación para guardar.', true);
    return;
  }

  setStatus('Guardando sesión en el servidor...');
  await autosaveLocalNow();
  const ok = await saveSessionToServer({ silent: false });
  if (ok && autosaveNoticeEl) autosaveNoticeEl.textContent = 'Guardado local y en servidor activo';
}

// ==========================
// Evaluar sesión
// ==========================
async function handleEvaluateSession() {
  if (sessionFinished) {
    setStatus('La sesión ya fue evaluada.', true);
    return;
  }

  const exercise = exerciseEl.value.trim();

  if (!exercise && !exerciseImageDataUrl) {
    setStatus('No hay enunciado ni imagen para evaluar.', true);
    return;
  }

  if (messages.length === 0) {
    setStatus('No hay conversación para evaluar.', true);
    return;
  }

  const hasStudentMessage = messages.some(m => m.role === 'student');
  if (!hasStudentMessage) {
    setStatus('Todavía no hay respuestas del estudiante para evaluar.', true);
    return;
  }

  try {
    setStatus('Enviando sesión para evaluación...');

    const resp = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        studentName: getStudentName(),
        exercise,
        exerciseImage: exerciseImageDataUrl || null,
        messages
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Error en /api/evaluate:', errorText);
      setStatus('Error al evaluar la sesión.', true);
      return;
    }

    const data = await resp.json();

    if (data.ok && data.evaluation) {
      currentEvaluation = data.evaluation;
      sessionEndedAt = new Date().toISOString();
      const panelHtml = renderEvaluationPanel(data.evaluation);
      evaluationOutputEl.innerHTML = panelHtml;

// Renderizar fórmulas matemáticas en la evaluación
  typesetLatexSafely(evaluationOutputEl);

      sessionFinished = true;
      sendBtn.disabled = true;
      studentMessageEl.disabled = true;
      evaluateSessionBtn.disabled = true;

      appendMessage(
        'system',
        '✅ La sesión fue evaluada y quedó cerrada. Para seguir practicando, inicia una nueva sesión.'
      );

      setStatus('Evaluación recibida. La sesión quedó cerrada.');
      showSessionEndCard();
      await autosaveLocalNow();
      await saveSessionToServer({ silent: true });
    } else if (data.raw) {
      evaluationOutputEl.textContent =
        'La IA no devolvió un JSON válido. Respuesta cruda:\n\n' + data.raw;
      setStatus('Error de formato en la evaluación.', true);
    } else {
      evaluationOutputEl.textContent = 'No se recibió una evaluación válida.';
      setStatus('Respuesta de evaluación inesperada.', true);
    }
  } catch (err) {
    console.error('Error de red en /api/evaluate:', err);
    setStatus('Error de red al evaluar la sesión.', true);
  }
}

async function handleNewSession() {
  messages = [];
  sessionFinished = false;
  sessionStartedAt = null;
  sessionEndedAt = null;
  currentEvaluation = null;
  sessionId = null;
  forgetActiveSessionId();
  await clearDraft().catch(console.error);

  chatEl.innerHTML = '';
  evaluationOutputEl.innerHTML = '(Aquí aparecerá la evaluación de la sesión)';
  studentMessageEl.value = '';
  exerciseEl.value = '';
  clearExerciseImage();

  sendBtn.disabled = false;
  studentMessageEl.disabled = false;
  evaluateSessionBtn.disabled = false;

  hideSessionEndCard();
  setStatus('Sesión reiniciada. Puedes escribir un nuevo enunciado e iniciar el tutor.');
}

// ==========================
// Exportar a PDF
// ==========================
function handleExportPdf() {
  const exercise = exerciseEl.value.trim();
  const studentName = getStudentName();
const safeStudentName = studentName.replace(/[\\/:*?"<>|]/g, '-');
  const now = new Date();
  const startDate = sessionStartedAt ? new Date(sessionStartedAt) : now;
  const endDate = sessionEndedAt ? new Date(sessionEndedAt) : null;
  const date = startDate.toLocaleDateString();
  const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const endTime = endDate ? endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const dateFile = startDate.toISOString().slice(0, 10);
  const notaGlobal = currentEvaluation?.nota_global;
  const notaUTEC = Number.isFinite(Number(notaGlobal)) ? convertirPorcentajeUTEC(Number(notaGlobal)) : null;
  const conceptoUTEC = notaUTEC !== null ? getConceptoUTEC(notaUTEC) : '';
  const calificacionHeader = notaUTEC !== null ? `${notaGlobal}/100 · UTEC ${notaUTEC.toFixed(2)} (${conceptoUTEC})` : 'Pendiente';
  const courseName = ltiIdentity?.contextTitle?.trim() || '';

  const modeMap = {
    guiada: 'Guía paso a paso',
    corta: 'Explicación corta',
    diagnostico: 'Diagnóstico inicial'
  };

  const modeLabel = modeMap[currentMode] || currentMode;
  const estado = sessionFinished ? 'Sesión finalizada y evaluada' : 'Sesión en curso';

  let htmlChat = '';

  chatEl.querySelectorAll('.message').forEach(msg => {
    let who = 'Tutor IA';
    let cssClass = 'tutor';

    if (msg.classList.contains('student')) {
      who = 'Estudiante';
      cssClass = 'student';
    }

    const headerText = msg.querySelector('.message-header')?.innerText?.trim();
    if (headerText === 'Sistema') {
      who = 'Sistema';
      cssClass = 'system';
    }

    const body = msg.querySelector('.message-body')?.innerHTML || '';

    htmlChat += `
      <div class="chat-message ${cssClass}">
        <div class="chat-message-header">${who}</div>
        <div class="chat-message-body">${body}</div>
      </div>
    `;
  });

  const evalHtml = evaluationOutputEl.innerHTML || '<p>(Sin evaluación)</p>';

  const win = window.open('', '_blank');
  if (!win) {
    setStatus('No se pudo abrir la ventana para exportar el PDF.', true);
    return;
  }

  win.document.write(`
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Informe Tutor IA - ${safeStudentName} - ${dateFile}</title>

      <style>
        body {
          font-family: system-ui, sans-serif;
          padding: 24px;
          line-height: 1.45;
        }

        h1 { margin: 0 0 4px 0; }
        h2 {
          margin-top: 20px;
          border-bottom: 2px solid #ddd;
          padding-bottom: 4px;
        }

        .header-box {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .header-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 20px;
        }

        .label { font-weight: bold; }

        .chat-message {
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 8px;
          margin-bottom: 8px;
        }

        .chat-message.student { background: #ecfdf5; }
        .chat-message.tutor { background: #f9fafb; }
        .chat-message.system { background: #eff6ff; }

        .chat-message-header {
          font-weight: bold;
          margin-bottom: 4px;
        }

        .evaluation {
          border: 1px solid #ddd;
          padding: 10px;
          border-radius: 6px;
          background: #fafafa;
        }

        .exercise-image-pdf {
          margin: 10px 0 14px 0;
          text-align: center;
          break-inside: avoid;
        }

        .exercise-image-pdf img {
          max-width: 100%;
          max-height: 520px;
          object-fit: contain;
        }
      </style>

      <script>
        window.MathJax = {
          tex: {
            inlineMath: [['$', '$'], ['\\\\(', '\\\\)']]
          }
        };
      </script>
      <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    </head>

    <body>
      <h1>Tutor IA de Física</h1>
      <p><strong>Informe de sesión</strong></p>

      <div class="header-box">
        <div class="header-grid">
          <p><span class="label">Estudiante:</span> ${studentName}</p>
          <p><span class="label">Fecha:</span> ${date}</p>
          ${courseName ? `<p><span class="label">Curso:</span> ${courseName}</p>` : ''}
          <p><span class="label">Calificación:</span> ${calificacionHeader}</p>
          <p><span class="label">Hora de comienzo:</span> ${startTime}</p>
          <p><span class="label">Hora de finalización:</span> ${endTime}</p>
          <p><span class="label">Modo:</span> ${modeLabel}</p>
          <p><span class="label">Estado:</span> ${estado}</p>
        </div>
      </div>

      <h2>1. Enunciado del ejercicio</h2>
      <p>${exercise ? exercise.replace(/\\n/g, '<br>') : (exerciseImageDataUrl ? '(El enunciado está contenido en la imagen)' : '(Sin enunciado)')}</p>
      ${exerciseImageDataUrl ? `<div class="exercise-image-pdf"><img src="${exerciseImageDataUrl}" alt="Imagen del ejercicio"></div>` : ''}

      <h2>2. Desarrollo de la interacción</h2>
      ${htmlChat || '<p>(Sin mensajes)</p>'}

      <h2>3. Evaluación final</h2>
      <div class="evaluation">
        ${evalHtml}
      </div>

      <script>
        window.onload = () => {
          if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise().then(() => window.print());
          } else {
            window.print();
          }
        };
      </script>
    </body>
    </html>
  `);

  win.document.close();
}

// ==========================
// Modo oscuro
// ==========================
function initTheme() {
  document.body.classList.add('light-mode');
}

function toggleTheme() {
  if (document.body.classList.contains('light-mode')) {
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
    toggleThemeBtn.textContent = 'Modo claro';
  } else {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
    toggleThemeBtn.textContent = 'Modo oscuro';
  }
}

// ==========================
// Event listeners
// ==========================
sendBtn.addEventListener('click', handleSend);
saveSessionBtn.addEventListener('click', handleSaveSession);
evaluateSessionBtn.addEventListener('click', handleEvaluateSession);
exportPdfBtn.addEventListener('click', handleExportPdf);
toggleThemeBtn.addEventListener('click', toggleTheme);
startTutorBtn.addEventListener('click', handleStartTutor);

if (selectExerciseImageBtn && exerciseImageInput) {
  selectExerciseImageBtn.addEventListener('click', () => exerciseImageInput.click());
  exerciseImageInput.addEventListener('change', () => {
    const file = exerciseImageInput.files?.[0];
    if (file) setExerciseImageFromFile(file);
  });
}

if (removeExerciseImageBtn) removeExerciseImageBtn.addEventListener('click', clearExerciseImage);

if (exerciseImageDropzone) {
  exerciseImageDropzone.addEventListener('click', () => exerciseImageInput?.click());
  exerciseImageDropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      exerciseImageInput?.click();
    }
  });
  exerciseImageDropzone.addEventListener('dragover', e => {
    e.preventDefault();
    exerciseImageDropzone.classList.add('dragover');
  });
  exerciseImageDropzone.addEventListener('dragleave', () => exerciseImageDropzone.classList.remove('dragover'));
  exerciseImageDropzone.addEventListener('drop', e => {
    e.preventDefault();
    exerciseImageDropzone.classList.remove('dragover');
    const file = Array.from(e.dataTransfer?.files || []).find(f => f.type?.startsWith('image/'));
    if (file) setExerciseImageFromFile(file);
  });
  exerciseImageDropzone.addEventListener('paste', e => {
    const file = getClipboardImageFile(e);
    if (!file) return;
    e.preventDefault();
    setExerciseImageFromFile(file);
  });
}

if (exerciseEl) {
  exerciseEl.addEventListener('paste', e => {
    const file = getClipboardImageFile(e);
    if (!file) return;
    e.preventDefault();
    setExerciseImageFromFile(file);
  });
}

if (studentNameEl) {
  studentNameEl.addEventListener('input', () => { persistStudentIdentity(); scheduleAutosave(); });
}
if (teamMembersEl) {
  teamMembersEl.addEventListener('input', () => { persistStudentIdentity(); scheduleAutosave(); });
}

if (exerciseEl) exerciseEl.addEventListener('input', scheduleAutosave);
if (studentMessageEl) studentMessageEl.addEventListener('input', scheduleAutosave);
if (restoreSessionBtn) restoreSessionBtn.addEventListener('click', restoreSavedDraft);
if (discardSavedSessionBtn) discardSavedSessionBtn.addEventListener('click', discardSavedDraft);
window.addEventListener('pagehide', () => { autosaveLocalNow(); });

mathSymbolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const symbol = btn.dataset.symbol;

    if (symbol) {
      insertSymbolInStudentMessage(symbol);
    } else if (action === 'super') {
      convertSelected('super');
    } else if (action === 'sub') {
      convertSelected('sub');
    }
  });
});

studentMessageEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    handleSend();
  }
});

if (newSessionBtn) {
  newSessionBtn.addEventListener('click', handleNewSession);
}

if (finalExportPdfBtn) {
  finalExportPdfBtn.addEventListener('click', handleExportPdf);
}

// ==========================
// Inicialización
// ==========================
async function initializeApp() {
  initTheme();
  await loadLtiIdentity();
  updateExerciseImageUI();
  hideSessionEndCard();
  await checkForRecoverableDraft();
}
initializeApp();
