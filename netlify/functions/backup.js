// Netlify Function — Backup completo con almacenamiento automático
// Modos:
//   GET /backup              → descarga manual (desde el botón en la app)
//   GET /backup?auto=1       → backup automático: guarda en Supabase Storage + limpia antiguos
//   Requiere query param token para modo auto

const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const BACKUP_TOKEN = process.env.BACKUP_TOKEN || 'caryera-backup-2024';
const BUCKET = 'backups';
const RETENTION_DAYS = 7;

const TABLES = ['pacientes', 'historias_clinicas', 'ordenes_laboratorio', 'citas', 'app_config', 'protecciones_vs', 'ventas', 'venta_items', 'venta_pagos', 'creditos_clientes', 'creditos_abonos', 'cortes_caja', 'retiros_caja', 'monedero', 'vision_segura', 'vision_segura_eventos', 'promociones', 'venta_promociones', 'lc_seguimiento'];

const sbHeaders = () => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
});

async function fetchAll(table) {
  let all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&offset=${offset}&limit=${limit}`,
      { headers: sbHeaders() }
    );
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) return [];
      throw new Error(`Error fetching ${table}: ${res.statusText}`);
    }
    const data = await res.json();
    all = all.concat(data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function ensureBucket() {
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
    headers: sbHeaders()
  });
  if (check.ok) return true;

  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
  });
  if (!create.ok) {
    const err = await create.text();
    throw new Error(`No se pudo crear bucket "${BUCKET}": ${err}`);
  }
  return true;
}

async function uploadToStorage(filename, jsonString) {
  await ensureBucket();
  // Compress with gzip to reduce size
  const compressed = await gzip(Buffer.from(jsonString, 'utf-8'));
  const gzFilename = filename.replace('.json', '.json.gz');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${gzFilename}`, {
    method: 'POST',
    headers: {
      ...sbHeaders(),
      'Content-Type': 'application/gzip',
      'x-upsert': 'true'
    },
    body: compressed
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error subiendo backup: ${err}`);
  }
  return { filename: gzFilename, compressedSize: compressed.length };
}

async function cleanOldBackups() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'name', order: 'asc' } })
  });
  if (!res.ok) return { deleted: 0 };

  const files = await res.json();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const toDelete = files
    .filter(f => {
      const match = f.name.match(/backup-caryera-(\d{4}-\d{2}-\d{2})\.json(\.gz)?/);
      return match && match[1] < cutoffStr;
    })
    .map(f => f.name);

  if (toDelete.length === 0) return { deleted: 0 };

  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: toDelete })
  });

  return { deleted: toDelete.length, files: toDelete };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.URL || 'https://optcaryera.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, x-backup-token'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (!SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY no configurada en Netlify' }) };
  }

  const params = event.queryStringParameters || {};
  const isAuto = params.auto === '1';

  // Require token for ALL modes (auto and manual) to prevent unauthorized access
  const token = params.token || '';
  if (token !== BACKUP_TOKEN) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token requerido. Usa ?token=XXX' }) };
  }

  try {
    const tableData = {};
    await Promise.all(TABLES.map(async (table) => {
      tableData[table] = await fetchAll(table);
    }));

    const now = new Date();
    const mxTime = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const fecha = mxTime.toISOString().slice(0, 10);
    const hora = mxTime.toISOString().slice(11, 19);

    const stats = {};
    for (const t of TABLES) stats[t] = tableData[t].length;

    const backup = {
      fecha, hora,
      sistema: 'Car & Era Óptica',
      modo: isAuto ? 'automático' : 'manual',
      retencion: `${RETENTION_DAYS} días`,
      stats,
      data: tableData
    };

    if (isAuto) {
      const filename = `backup-caryera-${fecha}.json`;
      const jsonStr = JSON.stringify(backup);
      const sizeMB = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(2);

      const uploadResult = await uploadToStorage(filename, jsonStr);
      const compMB = (uploadResult.compressedSize / 1024 / 1024).toFixed(2);
      const cleaned = await cleanOldBackups();

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          mensaje: `Backup guardado: ${uploadResult.filename} (${sizeMB} MB → ${compMB} MB comprimido)`,
          stats, fecha, hora,
          limpieza: cleaned,
          retencion: `${RETENTION_DAYS} días`
        })
      };
    } else {
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="backup-caryera-${fecha}.json"`
        },
        body: JSON.stringify(backup)
      };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
