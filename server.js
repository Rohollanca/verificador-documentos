import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'documentos.json');
const PUBLIC_DIR = join(__dirname, 'public');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Cache-Control': 'no-store'
  });
  res.end(type.includes('json') ? JSON.stringify(body) : body);
};

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
      reject(new Error('Payload demasiado grande'));
    }
  });
  req.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error('JSON invalido'));
    }
  });
});

const ensureStorage = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) await writeFile(DATA_FILE, '[]', 'utf8');
};

const loadDocuments = async () => {
  await ensureStorage();
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveDocuments = async (documents) => {
  await ensureStorage();
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(documents, null, 2), 'utf8');
  await rename(tmp, DATA_FILE);
};

const normalizeCode = (code) => decodeURIComponent(String(code || '')).trim().toUpperCase();

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const sendStatic = async (res, fileName) => {
  const safeName = String(fileName || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const ext = safeName.split('.').pop()?.toLowerCase();
  const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml; charset=utf-8' };
  if (!safeName || !types[ext]) return send(res, 404, { ok: false, error: 'archivo no encontrado' });
  try {
    const data = await readFile(join(PUBLIC_DIR, safeName));
    res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'public, max-age=300' });
    res.end(data);
  } catch {
    send(res, 404, { ok: false, error: 'archivo no encontrado' });
  }
};

const getDocumentMeta = (doc = {}) => {
  const source = `${doc.documentoId || ''} ${doc.documento || ''} ${doc.codigo || ''}`.toUpperCase();
  if (source.includes('RECETA') || source.includes('RX-')) {
    return {
      name: 'Receta Medica',
      label: 'Codigo de receta',
      placeholder: 'RX-20260616-75481714-12345',
      intro: 'Ingrese el codigo de la Receta Medica para validar su autenticidad en el sistema.'
    };
  }
  if (source.includes('CERTIFICADO') || source.includes('CM-')) {
    return {
      name: 'Certificado Medico',
      label: 'Codigo de certificado',
      placeholder: 'CM-20260616-75481714-12345',
      intro: 'Ingrese el codigo del Certificado Medico para validar su autenticidad en el sistema.'
    };
  }
  if (source.includes('DESCANSO') || source.includes('CITT') || source.includes('DM-') || source.includes('T-')) {
    return {
      name: 'Descanso Medico',
      label: 'Numero de CITT',
      placeholder: 'T-763-07962276-28',
      intro: 'Ingrese el codigo del Certificado de Incapacidad Temporal para el Trabajo (CITT) para validar su autenticidad en el sistema.'
    };
  }
  return {
    name: 'Documento de Salud',
    label: 'Codigo de documento',
    placeholder: 'Ingrese codigo',
    intro: 'Ingrese el codigo del documento de salud para validar su autenticidad en el sistema.'
  };
};

const verificationPage = (doc = {}) => {
  const valid = Boolean(doc.estado || doc.documento || doc.paciente);
  const code = doc.codigo || '';
  const meta = getDocumentMeta(doc);
  const content = valid
    ? `<h1>${escapeHtml(meta.name)}<br>Verificada</h1>
    <p class="intro">La informacion consultada corresponde a un documento registrado en el sistema del Ministerio de Salud.</p>
    <section class="verified-card">
      <div class="status-line"><span class="check">✓</span><span>Documento verificado</span></div>
      <div class="detail-row"><span>Codigo de verificacion</span><strong>${escapeHtml(code)}</strong></div>
      <div class="detail-row"><span>Documento</span><strong>${escapeHtml(doc.documento || meta.name)}</strong></div>
      <div class="detail-row"><span>Paciente</span><strong>${escapeHtml(doc.paciente || '-')}</strong></div>
      <div class="detail-row"><span>DNI</span><strong>${escapeHtml(doc.dni || '-')}</strong></div>
      <div class="detail-row"><span>Fecha de emision</span><strong>${escapeHtml(doc.fecha || '-')}</strong></div>
      <div class="detail-row"><span>Medico tratante</span><strong>${escapeHtml(doc.medico || '-')}</strong></div>
      <div class="detail-row"><span>CMP</span><strong>${escapeHtml(doc.cmp || '-')}</strong></div>
    </section>
    <a class="secondary-link" href="/verificar">Realizar otra consulta</a>`
    : `<h1>Verificacion de<br>Autenticidad</h1>
    <p class="intro">${escapeHtml(meta.intro)}</p>
    <form method="get" action="/verificar">
      <div class="field">
        <label class="label" for="codigo">${escapeHtml(meta.label)}</label>
        <div class="input-wrap">
          <div class="icon" aria-hidden="true"><div class="icon-box"></div></div>
          <input id="codigo" name="codigo" value="${escapeHtml(code)}" autocomplete="off" placeholder="${escapeHtml(meta.placeholder)}" />
        </div>
      </div>
      <button type="submit">Verificar Autenticidad</button>
    </form>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verificacion de Autenticidad</title>
  <style>
    :root { --blue:#2456b8; --blue2:#17499d; --text:#34343a; --muted:#747782; --line:#e1e1e1; --ok:#15845f; --footer:#f2f3f5; }
    * { box-sizing:border-box; }
    html, body { margin:0; min-height:100%; background:#fff; color:var(--text); font-family:Arial, Helvetica, sans-serif; }
    body { min-height:100vh; display:flex; flex-direction:column; }
    .page { width:min(520px, 100%); margin:0 auto; padding:82px 34px 42px; flex:1; display:flex; flex-direction:column; align-items:center; }
    .minsa-logo { width:100%; padding-bottom:34px; border-bottom:1px solid #eeeeee; display:flex; justify-content:center; }
    .logo-img { display:block; width:min(276px, 82%); max-height:82px; object-fit:contain; }
    .logo-fallback { width:min(276px, 82%); height:74px; border:1px dashed #cfd5dc; color:#8b95a1; display:flex; align-items:center; justify-content:center; text-align:center; font-size:11px; line-height:1.4; padding:12px; }
    h1 { margin:42px 0 16px; text-align:center; font-size:35px; line-height:1.3; font-weight:650; color:var(--text); letter-spacing:-.2px; }
    .intro { margin:0 0 36px; max-width:460px; text-align:center; color:var(--muted); font-size:20px; line-height:1.48; font-weight:350; }
    form { width:100%; max-width:420px; }
    .field { position:relative; width:100%; margin-bottom:28px; }
    .label { position:absolute; top:-11px; left:52px; z-index:1; padding:0 7px; background:white; color:#2b60aa; font-size:16px; font-weight:400; }
    .input-wrap { height:56px; border:1px solid var(--line); border-radius:8px; display:flex; align-items:center; overflow:hidden; background:white; }
    .icon { width:52px; display:grid; place-items:center; color:#777; }
    .icon-box { width:23px; height:23px; border-radius:4px; border:2px solid #777; position:relative; }
    .icon-box:before { content:""; position:absolute; inset:4px 6px; background:repeating-linear-gradient(90deg,#777 0 2px, transparent 2px 4px); }
    input { flex:1; min-width:0; height:100%; border:0; outline:0; color:#303139; font-size:20px; font-weight:400; letter-spacing:.2px; }
    button { width:100%; height:60px; border:0; border-radius:8px; background:linear-gradient(180deg,var(--blue),var(--blue2)); color:white; font-size:21px; font-weight:600; box-shadow:0 3px 8px rgba(31,85,181,.22); cursor:pointer; }
    .verified-card { width:100%; max-width:430px; border:1px solid #dfe5ea; border-radius:9px; overflow:hidden; background:white; box-shadow:0 8px 22px rgba(24,39,75,.06); }
    .status-line { display:flex; align-items:center; justify-content:center; gap:9px; padding:16px; color:var(--ok); background:#f1fbf6; border-bottom:1px solid #d5ecdf; font-size:17px; font-weight:650; }
    .check { width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid #9dddbd; font-size:16px; }
    .detail-row { display:grid; grid-template-columns:150px 1fr; gap:12px; padding:13px 15px; border-bottom:1px solid #edf0f3; align-items:start; }
    .detail-row:last-child { border-bottom:0; }
    .detail-row span { color:#7c8795; font-size:12px; line-height:1.35; }
    .detail-row strong { color:#2f3540; font-size:13px; line-height:1.35; font-weight:650; text-transform:uppercase; overflow-wrap:anywhere; }
    .secondary-link { display:inline-flex; align-items:center; justify-content:center; margin-top:24px; color:#2456b8; text-decoration:none; font-size:14px; font-weight:600; }
    .footer-bar { width:100%; background:var(--footer); border-top:1px solid #e2e4e7; color:#70747c; text-align:center; padding:17px 12px; font-size:13px; letter-spacing:.1px; }
    .copyright { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border:1px solid #70747c; border-radius:50%; font-size:9px; font-weight:600; line-height:1; margin:0 4px; vertical-align:1px; }
    @media (max-width:560px) {
      .page { padding:78px 33px 30px; }
      .minsa-logo { padding-bottom:32px; }
      .logo-img { width:270px; max-width:84%; }
      h1 { margin-top:40px; font-size:34px; }
      .intro { font-size:20px; }
      .label { left:52px; font-size:16px; }
      input { font-size:20px; }
      button { height:60px; font-size:21px; }
      .detail-row { grid-template-columns:1fr; gap:4px; padding:12px 14px; }
      .footer-bar { font-size:12px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="minsa-logo" aria-label="Ministerio de Salud">
      <img class="logo-img" src="/logo-minsa.png" alt="Ministerio de Salud" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
      <div class="logo-fallback" style="display:none;">Coloca el logo oficial en<br>verificador-documentos/public/logo-minsa.png</div>
    </section>
    ${content}
  </main>
  <footer class="footer-bar">Plataforma digital del Ministerio de Salud del Peru <span class="copyright">C</span> 2026</footer>
</body>
</html>`;
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') return send(res, 204, {});

    if (req.method === 'GET' && url.pathname.startsWith('/public/')) {
      return sendStatic(res, url.pathname.replace('/public/', ''));
    }

    if (req.method === 'GET' && url.pathname === '/logo-minsa.png') {
      return sendStatic(res, 'logo-minsa.png');
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, verificationPage(), 'text/html; charset=utf-8');
    }

    if (req.method === 'POST' && url.pathname === '/api/documentos') {
      const payload = await readJsonBody(req);
      const codigo = normalizeCode(payload.codigo);
      if (!codigo) return send(res, 400, { ok: false, error: 'codigo requerido' });
      const documents = await loadDocuments();
      const record = {
        ...payload,
        codigo,
        estado: payload.estado || 'VALIDO',
        registradoEn: new Date().toISOString()
      };
      const next = documents.filter(doc => normalizeCode(doc.codigo) !== codigo);
      next.unshift(record);
      await saveDocuments(next);
      return send(res, 201, { ok: true, codigo, url: `/verificar/${encodeURIComponent(codigo)}` });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/verificar/')) {
      const codigo = normalizeCode(url.pathname.replace('/api/verificar/', ''));
      const documents = await loadDocuments();
      const doc = documents.find(item => normalizeCode(item.codigo) === codigo);
      return send(res, doc ? 200 : 404, doc ? { ok: true, documento: doc } : { ok: false, error: 'documento no encontrado' });
    }

    if (req.method === 'GET' && (url.pathname.startsWith('/verificar/') || url.pathname === '/verificar')) {
      const codigo = normalizeCode(url.pathname === '/verificar' ? url.searchParams.get('codigo') : url.pathname.replace('/verificar/', ''));
      const documents = await loadDocuments();
      const doc = documents.find(item => normalizeCode(item.codigo) === codigo);
      return send(res, 200, verificationPage(doc || { codigo }), 'text/html; charset=utf-8');
    }

    return send(res, 404, { ok: false, error: 'ruta no encontrada' });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Verificador corriendo en http://localhost:${PORT}`);
});
