// Re-enganche con cupón: tras ~10 min de INACTIVIDAD, a un prospecto que chateó hoy y NO tiene cupón
// se le genera su código Cupón México y se le envía (para tratar de forzar la venta). Cron cada 5 min.
// Vigente hasta el 4-jul-2026 (mientras el cupón vale); después NO hace nada.
// Candados: MAX 10/run, 1.5s, excluye compradores/empleados/915 (en la RPC), dedup por-persona (RPC:
// solo quien NO tiene ya un cupón de la campaña), guard 10am-8pm CST. Genera código único por persona.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;

const CAMPANA = 'Cupon-Mexico';
const TEMPLATE_SID = 'HXbc8c646d16a33be2e1fc536bf7737362'; // cupon_mexico (media + {{1}}=codigo)
const BENEFICIO_TIPO = 'desc_pct';
const BENEFICIO_VALOR = 20;
const VIGENCIA = '2026-07-04';
const VIGENCIA_FIN = '2026-07-04T23:59:59-06:00'; // el cron deja de operar después de esta fecha
const INACTIVE_MIN = 10;
const RECENT_HOURS = 6;
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
function normalizePhone(phone) { let n = String(phone || "").replace(/[\s\-()+]/g, ""); if (n.length === 10) n = "521" + n; if (n.length === 12 && n.startsWith("52") && n[2] !== "1") n = "521" + n.slice(2); return n; }
function randCode() { return 'MX-' + Math.floor(Math.random() * 0x100000).toString(16).toUpperCase().padStart(5, '0'); }

async function sendTemplate(to, codigo) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  const p = new URLSearchParams();
  p.append("From", fromNum); p.append("To", "whatsapp:+" + normalizePhone(to)); p.append("ContentSid", TEMPLATE_SID);
  p.append("ContentVariables", JSON.stringify({ "1": String(codigo) }));
  try {
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
    const d = await r.json();
    if (d.error_code) { console.error("[CUPON-REENGAGE] WA error " + d.error_code + ": " + d.message); return { ok: false, err: d.error_code + ":" + d.message }; }
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
}

exports.handler = async function() {
  try {
    const now = new Date();
    if (now > new Date(VIGENCIA_FIN)) { console.log("[CUPON-REENGAGE] campaña terminada"); return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "campaña terminada" }) }; }
    const nowCH = new Date(now.toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
    const hora = nowCH.getHours();
    if (hora < 10 || hora >= 20) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "fuera de horario" }) };

    const cands = await supaREST("POST", "rpc/cupon_reengage_candidates", { p_campana: CAMPANA, p_inactive_min: INACTIVE_MIN, p_recent_hours: RECENT_HOURS });
    if (!Array.isArray(cands) || !cands.length) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "sin candidatos inactivos" }) };

    const limited = cands.slice(0, MAX_PER_RUN);
    let enviados = 0, fallidos = 0; const errores = [];
    for (const c of limited) {
      const tel = normalizePhone(c.telefono);
      const tel10 = String(c.telefono || "").replace(/\D/g, "").slice(-10);
      if (tel10.length !== 10) continue;
      // Doble-check anti-carrera: ¿ya tiene cupón de la campaña? (la RPC ya lo filtra, pero por si acaso)
      try {
        const ex = await supaREST("GET", "cupones?campana=eq." + encodeURIComponent(CAMPANA) + "&telefono=ilike.*" + tel10 + "*&select=id&limit=1");
        if (ex && ex.length) continue;
      } catch (e) { continue; }
      // Genera código único
      let codigo = null;
      for (let a = 0; a < 6; a++) {
        const cand = randCode();
        try { const chk = await supaREST("GET", "cupones?codigo=eq." + encodeURIComponent(cand) + "&select=id&limit=1"); if (chk && chk.length === 0) { codigo = cand; break; } } catch (e) {}
      }
      if (!codigo) continue;
      // Inserta el cupón (enviado_at null); si el envío falla, se borra para reintentar
      let ins = null;
      try { ins = await supaREST("POST", "cupones", { codigo, campana: CAMPANA, beneficio_tipo: BENEFICIO_TIPO, beneficio_valor: BENEFICIO_VALOR, descripcion: "20% Cupón México (2 goles) — re-enganche inactividad", telefono: tel, nombre: c.nombre || null, vigencia: VIGENCIA, usado: false }); }
      catch (e) { console.warn("[CUPON-REENGAGE] insert " + tel10 + ":", e.message); continue; }
      if (!ins || !ins.length) continue;
      const cupId = ins[0].id;
      const r = await sendTemplate(tel, codigo);
      if (r.ok) {
        try { await supaREST("PATCH", "cupones?id=eq." + cupId, { enviado_at: new Date().toISOString() }); } catch (e) {}
        try { await supaREST("POST", "clari_conversations", { phone: tel, role: "assistant", content: "[" + CAMPANA + "] Cupón " + codigo + " enviado (re-enganche inactividad)", user_name: "cupon-reengage" }); } catch (e) {}
        enviados++;
      } else {
        // borrar el cupón para que reintente en otra corrida
        try { await supaREST("DELETE", "cupones?id=eq." + cupId); } catch (e) {}
        fallidos++; errores.push({ tel: "..." + tel10.slice(-4), err: r.err });
      }
      await new Promise(res => setTimeout(res, RATE_LIMIT_MS));
    }
    console.log("[CUPON-REENGAGE] enviados=" + enviados + " fallidos=" + fallidos);
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos, candidatos: cands.length, errores: errores.slice(0, 5) }) };
  } catch (err) {
    console.error("[CUPON-REENGAGE] Fatal:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
