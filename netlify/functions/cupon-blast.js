// Envío GENÉRICO de cupones personalizados por campaña (código único por persona).
// Lee la tabla `cupones` (campana + enviado_at IS NULL) y manda la plantilla WA con el código.
// Reutilizable para cualquier campaña de cupones (v459+). El beneficio ya está en cada cupón.
// Manual/dry: GET /.netlify/functions/cupon-blast?key=SECRET&campana=Cupon-Mexico&tpl=HXxxxx  (&dry=1)
// Reglas blast: MAX 10/run, 1.5s, re-check por cupón (enviado_at) antes de mandar (fail-closed),
// dedup por enviado_at + tag [<campana>], excluye empleados + no-locales (915), guard 10am-8pm CST.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || "caryera2026";

const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;

async function supaREST(method, path, body) {
  const opts = { method, headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!res.ok) { const t = await res.text(); throw new Error("Supabase " + method + " " + path + ": " + res.status + " " + t); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let n = String(phone || "").replace(/[\s\-()+]/g, "");
  if (n.length === 10) n = "521" + n;
  if (n.length === 12 && n.startsWith("52") && n[2] !== "1") n = "521" + n.slice(2);
  return n;
}
function last10(phone) { return String(phone || "").replace(/\D/g, "").slice(-10); }

async function sendTemplate(to, codigo, templateSid) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  const p = new URLSearchParams();
  p.append("From", fromNum);
  p.append("To", "whatsapp:+" + normalizePhone(to));
  p.append("ContentSid", templateSid);
  p.append("ContentVariables", JSON.stringify({ "1": String(codigo) }));
  try {
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
    const d = await r.json();
    if (d.error_code) { console.error("[CUPON-BLAST] WA error " + d.error_code + ": " + d.message); return { ok: false, err: d.error_code + ":" + d.message }; }
    return { ok: true };
  } catch (e) { console.error("[CUPON-BLAST] WA exception:", e.message); return { ok: false, err: e.message }; }
}

async function saveHistory(phone, campana, codigo) {
  try { await supaREST("POST", "clari_conversations", { phone: normalizePhone(phone), role: "assistant", content: "[" + campana + "] Cupón " + codigo + " enviado", user_name: "cupon-blast" }); }
  catch (e) { console.error("[CUPON-BLAST] history:", e.message); }
}

exports.handler = async function(event) {
  const qs = (event && event.queryStringParameters) || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: "Key invalida. Usa ?key=TU_CLAVE&campana=X&tpl=HX..." }) };
  const campana = qs.campana;
  const templateSid = qs.tpl;
  if (!campana) return { statusCode: 400, body: JSON.stringify({ error: "Falta ?campana=" }) };
  if (!templateSid || !/^HX[0-9a-f]{32}$/i.test(templateSid)) return { statusCode: 400, body: JSON.stringify({ error: "Falta ?tpl=HX... (SID de la plantilla aprobada)" }) };
  const dryRun = qs.dry === "1";

  const nowCH = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
  const hora = nowCH.getHours();
  if (!dryRun && (hora < 10 || hora >= 20)) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "Fuera de horario (10am-8pm CST)" }) };

  try {
    // Cupones de la campaña sin enviar
    const cupones = await supaREST("GET", "cupones?campana=eq." + encodeURIComponent(campana) + "&enviado_at=is.null&select=id,codigo,telefono,nombre&order=id.asc&limit=300");
    if (!cupones || !cupones.length) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "No hay cupones pendientes de envío en " + campana }) };

    // Empleados (excluir) — keyeado por teléfono
    const empSet = new Set();
    try {
      const emp = await supaREST("GET", "app_config?id=eq.empleados_telefono&select=value");
      if (emp && emp[0] && emp[0].value) { const map = typeof emp[0].value === "string" ? JSON.parse(emp[0].value) : emp[0].value; Object.keys(map || {}).forEach(k => { const l = last10(k); if (l.length === 10) empSet.add(l); }); }
    } catch (e) {}

    const elegibles = cupones.filter(c => { const d = last10(c.telefono); return d.length === 10 && !d.startsWith("915") && !empSet.has(d); });
    const limited = elegibles.slice(0, MAX_PER_RUN);

    if (dryRun) return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, campana, pendientes: cupones.length, elegibles: elegibles.length, enviarEstaVez: limited.length, restantes: elegibles.length - limited.length, muestra: limited.map(c => ({ codigo: c.codigo, tel: "..." + last10(c.telefono).slice(-4) })) }, null, 2) };

    let enviados = 0, fallidos = 0; const errores = [];
    for (const c of limited) {
      // Re-check enviado_at fresco (fail-closed)
      try {
        const rc = await supaREST("GET", "cupones?id=eq." + c.id + "&select=enviado_at");
        if (rc && rc[0] && rc[0].enviado_at) continue;
      } catch (e) { console.warn("[CUPON-BLAST] recheck " + c.codigo + ", salto:", e.message); continue; }
      const r = await sendTemplate(c.telefono, c.codigo, templateSid);
      if (r.ok) {
        await supaREST("PATCH", "cupones?id=eq." + c.id, { enviado_at: new Date().toISOString() });
        await saveHistory(c.telefono, campana, c.codigo);
        enviados++;
      } else { fallidos++; errores.push({ codigo: c.codigo, err: r.err }); }
      await new Promise(res => setTimeout(res, RATE_LIMIT_MS));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, campana, enviados, fallidos, restantes: elegibles.length - limited.length, errores: errores.slice(0, 10) }) };
  } catch (err) {
    console.error("[CUPON-BLAST] Fatal:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
