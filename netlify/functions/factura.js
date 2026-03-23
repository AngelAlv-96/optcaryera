// ═══════════════════════════════════════════════════════════
// FACTURA.JS — DEPRECATED (v171)
// Facturación ahora es manual: contadora emite en portal SAT,
// sistema solo lleva control de solicitudes via Supabase directo.
// Este archivo se mantiene vacío para evitar errores 404 si
// algún código legacy hace fetch a este endpoint.
// ═══════════════════════════════════════════════════════════

exports.handler = async (event) => {
  return {
    statusCode: 410,
    headers: {
      'Access-Control-Allow-Origin': 'https://optcaryera.netlify.app',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ error: 'Facturación via API deshabilitada. Las facturas se emiten manualmente en el portal del SAT.' })
  };
};
