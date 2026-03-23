// ═══════════════════════════════════════════════════════════
// FACTURA.JS — Proxy Facturapi para CFDI 4.0
// Env var: FACTURAPI_KEY (sk_test_ o sk_live_)
// ═══════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://icsnlgeereepesbrdjhf.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FACTURAPI_URL = 'https://www.facturapi.io/v2';
const FACTURAPI_KEY = process.env.FACTURAPI_KEY;
const ALLOWED_ORIGIN = 'https://optcaryera.netlify.app';

const HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Auth helper (same pattern as other functions)
const BASE_USERS = { admin: process.env.AUTH_USERS ? JSON.parse(process.env.AUTH_USERS).admin : 'admin2024' };

async function verifyAuth(auth) {
  if (!auth || !auth.id || !auth.pass) return false;
  if (BASE_USERS[auth.id] && BASE_USERS[auth.id] === auth.pass) return true;
  try {
    const db = createClient(SUPA_URL, SUPA_KEY);
    const { data } = await db.from('app_config').select('value').eq('id', 'custom_users').single();
    if (data?.value) {
      const users = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (users[auth.id] && users[auth.id].pass === auth.pass) return true;
    }
  } catch(e) {}
  return false;
}

// Facturapi helper
async function facturapi(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + FACTURAPI_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(FACTURAPI_URL + path, opts);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Facturapi error ' + resp.status + ': ' + err);
  }
  // For PDF/XML responses, return buffer
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/pdf') || ct.includes('application/xml') || ct.includes('text/xml')) {
    const buf = await resp.arrayBuffer();
    return { _binary: true, buffer: Buffer.from(buf), contentType: ct };
  }
  return resp.json();
}

// Clave producto SAT por categoría
function getProductKey(descripcion) {
  var d = (descripcion || '').toLowerCase();
  if (d.includes('lente de contacto') || d.includes('lentes de contacto')) return '42172100';
  if (d.includes('armazón') || d.includes('armazon') || d.includes('marco')) return '42171600';
  return '42172001'; // Lentes oftálmicos (default)
}

// IVA zona fronteriza: 8%
const IVA_RATE = 0.08;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: '{"error":"POST only"}' };
  if (!FACTURAPI_KEY) return { statusCode: 500, headers: HEADERS, body: '{"error":"FACTURAPI_KEY not configured"}' };

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // Auth check
    if (!await verifyAuth(body.auth)) {
      return { statusCode: 401, headers: HEADERS, body: '{"error":"No autorizado"}' };
    }

    const db = createClient(SUPA_URL, SUPA_KEY);

    // ─── CREAR FACTURA ───
    if (action === 'crear') {
      const { venta_folio, cliente, forma_pago } = body;
      if (!venta_folio || !cliente || !cliente.tax_id) {
        return { statusCode: 400, headers: HEADERS, body: '{"error":"Faltan datos: venta_folio y datos fiscales del cliente"}' };
      }

      // Get venta + items
      const { data: venta } = await db.from('ventas').select('*').eq('folio', venta_folio).single();
      if (!venta) return { statusCode: 404, headers: HEADERS, body: '{"error":"Venta no encontrada"}' };

      // Check if already invoiced
      const { data: existing } = await db.from('facturas').select('id').eq('venta_folio', venta_folio).eq('status', 'valid').limit(1);
      if (existing && existing.length > 0) {
        return { statusCode: 409, headers: HEADERS, body: '{"error":"Esta venta ya tiene factura emitida"}' };
      }

      const { data: items } = await db.from('venta_items').select('*').eq('venta_id', venta.id);

      // Build Facturapi invoice
      var invoiceItems = (items || []).map(function(item) {
        var precio_sin_iva = parseFloat(item.precio_unitario || item.precio || 0) / (1 + IVA_RATE);
        return {
          quantity: parseInt(item.cantidad || 1),
          product: {
            description: item.descripcion || item.nombre || 'Producto óptico',
            product_key: getProductKey(item.descripcion || item.nombre || ''),
            price: Math.round(precio_sin_iva * 100) / 100,
            taxes: [{ type: 'IVA', rate: IVA_RATE }]
          }
        };
      });

      // If no items but venta has total, create single line item
      if (invoiceItems.length === 0 && venta.total > 0) {
        invoiceItems = [{
          quantity: 1,
          product: {
            description: 'Servicio óptico',
            product_key: '42172001',
            price: Math.round(parseFloat(venta.total) / (1 + IVA_RATE) * 100) / 100,
            taxes: [{ type: 'IVA', rate: IVA_RATE }]
          }
        }];
      }

      var invoiceData = {
        type: 'I',
        customer: {
          legal_name: cliente.legal_name,
          tax_id: cliente.tax_id.toUpperCase().trim(),
          tax_system: cliente.tax_system,
          email: cliente.email || undefined,
          address: { zip: cliente.zip }
        },
        items: invoiceItems,
        use: cliente.use || 'G03',
        payment_form: forma_pago || '01',
        payment_method: 'PUE'
      };

      var result = await facturapi('POST', '/invoices', invoiceData);

      // Save to DB
      await db.from('facturas').insert({
        venta_folio: venta_folio,
        facturapi_id: result.id,
        rfc_cliente: cliente.tax_id.toUpperCase().trim(),
        razon_social: cliente.legal_name,
        total: parseFloat(venta.total),
        status: 'valid'
      });

      // Save client fiscal data for reuse
      if (venta.paciente_id) {
        try {
          var datosFiscales = {
            rfc: cliente.tax_id.toUpperCase().trim(),
            razon_social: cliente.legal_name,
            regimen_fiscal: cliente.tax_system,
            cp_fiscal: cliente.zip,
            uso_cfdi: cliente.use || 'G03',
            email: cliente.email || ''
          };
          await db.from('pacientes').update({ datos_fiscales: datosFiscales }).eq('id', venta.paciente_id);
        } catch(e) { /* non-critical */ }
      }

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ ok: true, facturapi_id: result.id, folio_fiscal: result.folio_number, uuid: result.uuid })
      };
    }

    // ─── DESCARGAR PDF ───
    if (action === 'pdf') {
      var result = await facturapi('GET', '/invoices/' + body.facturapi_id + '/pdf');
      if (result._binary) {
        return {
          statusCode: 200,
          headers: { ...HEADERS, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="factura.pdf"' },
          body: result.buffer.toString('base64'),
          isBase64Encoded: true
        };
      }
      return { statusCode: 500, headers: HEADERS, body: '{"error":"No se pudo obtener PDF"}' };
    }

    // ─── DESCARGAR XML ───
    if (action === 'xml') {
      var result = await facturapi('GET', '/invoices/' + body.facturapi_id + '/xml');
      if (result._binary) {
        return {
          statusCode: 200,
          headers: { ...HEADERS, 'Content-Type': 'application/xml', 'Content-Disposition': 'inline; filename="factura.xml"' },
          body: result.buffer.toString('base64'),
          isBase64Encoded: true
        };
      }
      return { statusCode: 500, headers: HEADERS, body: '{"error":"No se pudo obtener XML"}' };
    }

    // ─── CANCELAR FACTURA ───
    if (action === 'cancelar') {
      await facturapi('DELETE', '/invoices/' + body.facturapi_id);
      await db.from('facturas').update({ status: 'cancelled', cancelada_at: new Date().toISOString() }).eq('facturapi_id', body.facturapi_id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    // ─── STATUS (check if venta has invoice) ───
    if (action === 'status') {
      var { data: factura } = await db.from('facturas').select('*').eq('venta_folio', body.venta_folio).eq('status', 'valid').limit(1);
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ tiene_factura: factura && factura.length > 0, factura: factura?.[0] || null })
      };
    }

    return { statusCode: 400, headers: HEADERS, body: '{"error":"action inválido"}' };
  } catch(err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
