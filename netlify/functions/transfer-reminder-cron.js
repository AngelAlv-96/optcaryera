// Recordatorio de transferencias pendientes de confirmar — cron cada 15 min.
// Cuando el admin tocó "Recordar 15 min" en el aviso de un comprobante, se guardó remind_at
// en app_config (transfer_pending_<tel>). Este cron re-notifica al admin cuando ya venció ese remind_at.
// Re-usa la plantilla confirmar_transferencia (HXd111dcb92c1d846d927ccbd38ce05f37, botones).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const TEMPLATE_SID = "HXd111dcb92c1d846d927ccbd38ce05f37";

async function supaREST(method, path, body) {
  const opts = { method, headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!res.ok) { const t = await res.text(); throw new Error("Supabase " + method + " " + path + ": " + res.status + " " + t); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normPhone(to) {
  let n = String(to || "").replace(/[\s\-()+]/g, "");
  if (n.length === 10) n = "521" + n;
  if (n.length === 12 && n.startsWith("52") && n[2] !== "1") n = "521" + n.slice(2);
  return n;
}

async function sendTemplate(to, vars, fallback) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return false;
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  const p = new URLSearchParams();
  p.append("From", fromNum); p.append("To", "whatsapp:+" + normPhone(to)); p.append("ContentSid", TEMPLATE_SID);
  p.append("ContentVariables", JSON.stringify(vars));
  try {
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
    const d = await r.json();
    if (!d.error_code) return true;
    // fallback freeform
  } catch (e) {}
  if (fallback) { try { const p2 = new URLSearchParams(); p2.append("From", fromNum); p2.append("To", "whatsapp:+" + normPhone(to)); p2.append("Body", fallback); await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: p2.toString() }); return true; } catch (e) {} }
  return false;
}

exports.handler = async function() {
  try {
    const rows = await supaREST("GET", "app_config?id=like.transfer_pending_*&select=id,value&limit=30");
    if (!rows || !rows.length) return { statusCode: 200, body: JSON.stringify({ ok: true, recordados: 0 }) };

    // Destinatarios admin (auth_phones, fallback admin_phones)
    let dest = [];
    try {
      const cfg = await supaREST("GET", "app_config?id=eq.whatsapp_config&select=value");
      if (cfg && cfg[0] && cfg[0].value) { const c = typeof cfg[0].value === "string" ? JSON.parse(cfg[0].value) : cfg[0].value; dest = (c.auth_phones && c.auth_phones.length) ? c.auth_phones : (c.admin_phones || c.recipients_corte || []); }
    } catch (e) {}
    if (!dest.length) return { statusCode: 200, body: JSON.stringify({ ok: true, recordados: 0, mensaje: "sin destinatarios" }) };

    const now = Date.now();
    let recordados = 0;
    for (const r of rows) {
      const v = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
      if (!v || v.status !== "awaiting_admin" || !v.remind_at) continue;
      if (new Date(v.remind_at).getTime() > now) continue; // aún no vence

      const montoTxt = v.monto ? String(v.monto) : "no detectado";
      const fallback = "⏰ Recordatorio: " + (v.cliente_nombre || "un cliente") + " envió un comprobante de transferencia (folio " + v.folio + "), monto aproximado $" + montoTxt + ". ¿Ya cayó? Responde: \"Sí cayó\", \"No cayó\" o \"Recordar 15 min\".";
      for (let i = 0; i < dest.length; i++) {
        await sendTemplate(dest[i], { "1": v.cliente_nombre || "Cliente", "2": String(v.folio), "3": montoTxt }, fallback);
      }
      // Consumir el remind (si vuelve a tocar "Recordar 15 min" se re-arma)
      v.remind_at = null;
      await supaREST("PATCH", "app_config?id=eq." + r.id, { value: JSON.stringify(v) });
      recordados++;
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, recordados }) };
  } catch (err) {
    console.error("[TRANSFER-REMINDER] Fatal:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
