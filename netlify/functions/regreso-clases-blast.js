// Regreso a Clases 3x1 (v571) — blast de quincena a prospectos
// Plantilla regreso_clases_3x1_agosto HX344089a3139491aafeef7ba2f4106a0d (twilio/media: flyer + texto).
// SIN variables (prospectos, lección v400 — una variable vacía tumba el mensaje con error 21656).
// Segmento (extraído 14-ago-2026): 1200 = escribieron por WA en los últimos 60 días y NUNCA compraron,
// número MX 521, SIN empleados/admins, SIN no-locales (declaración de otra ciudad con guard juárez).
// Ordenados: LADA de Juárez (656/657) primero — 1033 — y luego el resto de México (167).
// Dedup por tag [Regreso-Clases-3x1] (60 días) + re-check por fono fail-closed.
// Manual: GET /.netlify/functions/regreso-clases-blast?key=SECRET   (dry run: &dry=1)
// Reglas blast: MAX 10/run, 1.5s entre envíos, guard horario 10am-8pm CST, excluye compradores recientes en runtime.
// Guard de saldo: si Twilio baja de MIN_SALDO_USD se detiene solo (un blast a medias con saldo agotado
// deja tags fantasma que bloquean el reenvío — lección v400).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || "caryera2026";

const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;
const DEDUP_DAYS = 60;
const DEDUP_TAG = "Regreso-Clases-3x1";
const TEMPLATE_SID = "HX344089a3139491aafeef7ba2f4106a0d"; // regreso_clases_3x1_agosto (twilio/media, sin variables)
const MIN_SALDO_USD = 1.0;

// La lista vive en su propio módulo para que el blast normal y el -background usen la MISMA.
const { PHONES } = require("./regreso-clases-lista.js");

async function supaREST(method, path, body) {
  const opts = { method, headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error("Supabase " + method + " " + path + ": " + res.status + " " + txt); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = String(phone).replace(/[^0-9]/g, "");
  if (num.length === 10) num = "521" + num;
  if (num.length === 12 && num.startsWith("52") && num[2] !== "1") num = "521" + num.slice(2);
  return num;
}

async function sendTemplate(to) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  params.append("From", fromNum);
  params.append("To", "whatsapp:+" + toNum);
  params.append("ContentSid", TEMPLATE_SID);
  // SIN ContentVariables: la plantilla no tiene variables (evita error 21656, lección v400)
  try {
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error("[REGRESO] WA error " + data.error_code + ": " + data.message); return { ok: false, err: data.error_code + ":" + data.message }; }
    return { ok: true };
  } catch (e) { console.error("[REGRESO] WA exception:", e.message); return { ok: false, err: e.message }; }
}

// Saldo de Twilio. Si se acaba a media corrida, los envíos fallan pero el tag ya quedó
// guardado en los que sí salieron; peor aún, Twilio acepta y falla después (lección v400),
// así que conviene NO arrancar una tanda sin saldo suficiente.
async function saldoTwilio() {
  if (!TWILIO_SID || !TWILIO_TOKEN) return null;
  try {
    const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Balance.json", { headers: { "Authorization": "Basic " + auth } });
    if (!res.ok) return null;
    const d = await res.json();
    const v = parseFloat(d.balance);
    return isNaN(v) ? null : v;
  } catch (e) { console.warn("[REGRESO] saldo:", e.message); return null; }
}

async function saveToHistory(phone, content) {
  try { await supaREST("POST", "clari_conversations", { phone: normalizePhone(phone), role: "assistant", content, user_name: "regreso-clases-3x1" }); }
  catch (e) { console.error("[REGRESO] Save history error:", e.message); }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: "Key invalida. Usa ?key=TU_CLAVE" }) };
  const dryRun = qs.dry === "1";

  const nowCH = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "Fuera de horario (10am-8pm CST)" }) };

  try {
    const now = new Date();
    const candidates = PHONES.map(p => normalizePhone(p)).filter(p => p.length >= 12);

    // Empleados (Object.KEYS de empleados_telefono — lección v454) en runtime, por si la lista embebida envejece
    const empSet = new Set();
    try {
      const cfgE = await supaREST("GET", "app_config?id=eq.empleados_telefono&select=value");
      if (cfgE && cfgE[0]) { const emp = typeof cfgE[0].value === "string" ? JSON.parse(cfgE[0].value) : cfgE[0].value; Object.keys(emp || {}).forEach(t => empSet.add(String(t).replace(/[^0-9]/g, "").slice(-10))); }
    } catch (e) { console.warn("[REGRESO] Warn empleados:", e.message); }

    const alreadySent = new Set();
    const dedupFrom = new Date(now); dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const phoneFilter = batch.map(p => '"' + p + '"').join(",");
      try {
        const msgs = await supaREST("GET", "clari_conversations?phone=in.(" + phoneFilter + ")&content=ilike.*" + DEDUP_TAG + "*&created_at=gte." + dedupFrom.toISOString() + "&select=phone&limit=500");
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) {}
    }

    const cut60 = new Date(now); cut60.setDate(cut60.getDate() - 60);
    const recentBuyers = new Set();
    try {
      const ventas = await supaREST("GET", "ventas?created_at=gte." + cut60.toISOString() + "&select=pacientes(telefono)&limit=2000");
      if (ventas) ventas.forEach(v => { if (v.pacientes && v.pacientes.telefono) { const norm = normalizePhone(v.pacientes.telefono); if (norm) recentBuyers.add(norm); } });
    } catch (e) { console.warn("[REGRESO] Warn compradores:", e.message); }

    const eligible = candidates.filter(p => !alreadySent.has(p) && !recentBuyers.has(p) && !empSet.has(p.slice(-10)));
    const limited = eligible.slice(0, MAX_PER_RUN);

    const saldo = await saldoTwilio();
    const costoEstimado = eligible.length * 0.0305;   // precio real medido del blast anterior

    if (dryRun) return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, total: PHONES.length, yaContactados: alreadySent.size, compraronReciente: recentBuyers.size, elegibles: eligible.length, enviarEstaVez: limited.length, restantes: eligible.length - limited.length, saldoUSD: saldo, costoEstimadoRestante: Number(costoEstimado.toFixed(2)), alcanzaParaTodos: saldo === null ? "?" : saldo >= costoEstimado, muestra: limited.map(p => "..." + p.slice(-4)) }, null, 2) };

    // ⛔ No arrancar sin saldo: si se agota a media tanda, los que ya salieron quedan con el
    // tag puesto y los demás fallan — un blast a medias es peor que uno no empezado.
    if (saldo !== null && saldo < MIN_SALDO_USD) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, enviados: 0, saldoUSD: saldo, mensaje: "Saldo de Twilio insuficiente ($" + saldo.toFixed(2) + "). Recarga antes de continuar." }, null, 2) };
    }

    let enviados = 0, fallidos = 0; const errores = [];
    for (const p of limited) {
      try {
        const recheck = await supaREST("GET", "clari_conversations?phone=eq." + p + "&content=ilike.*" + DEDUP_TAG + "*&created_at=gte." + dedupFrom.toISOString() + "&select=id&limit=1");
        if (recheck && recheck.length > 0) { console.log("[REGRESO] skip " + p.slice(-4) + " ya enviado"); continue; }
      } catch (e) { console.warn("[REGRESO] recheck fallo " + p.slice(-4) + ", salto:", e.message); continue; } // fail-closed
      const result = await sendTemplate(p);
      if (result.ok) { await saveToHistory(p, "[" + DEDUP_TAG + "] Promo Regreso a Clases 3x1 enviada (flyer + 10% estudiantes)"); enviados++; }
      else { fallidos++; errores.push({ phone: p.slice(-4), err: result.err }); }
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    const saldoFinal = await saldoTwilio();
    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos, errores, elegiblesAntes: eligible.length, restantes: Math.max(0, eligible.length - limited.length), saldoUSD: saldoFinal }, null, 2) };
  } catch (e) {
    console.error("[REGRESO] Handler error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
