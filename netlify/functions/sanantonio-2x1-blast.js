// San Antonio 2x1 — Promo lentes graduados (13 jun, Día de San Antonio)
// Segmento: 162 = escribieron por WA en últimos 21 días con conversación activa (>=2 msgs),
// SIN compra, SIN campaña en últimas 3 semanas, sin empleados ni no-locales. Incluye 4 admins
// (Angel + 3) para que reciban el envío REAL y lo revisen.
// Manual: GET /.netlify/functions/sanantonio-2x1-blast?key=SECRET   (dry run: &dry=1)
// Reglas blast: MAX 10/run, dedup por tag, re-check por fono antes de enviar, fail-closed,
// excluye compradores recientes, guard de horario 10am-8pm CST. (Mismo patrón que vittoria-inauguracion-blast.)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || "caryera2026";

const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;
const DEDUP_DAYS = 60;
const DEDUP_TAG = "SanAntonio-2x1";
const TEMPLATE_SID = "HX4ebd38e413c4d6edb39e6e379f946025"; // sanantonio_2x1_promo (var {{1}}=nombre)

// Lista embebida (evita escritura a app_config). 162 contactos.
const CONTACTS = [{"name":"","phone":"5216564269961"},{"name":"Angy","phone":"5216565895888"},{"name":"Patty","phone":"5216562223478"},{"name":"Xavi Flores","phone":"5216564227869"},{"name":"Rocío","phone":"5216571411544"},{"name":"Luis","phone":"5214461240863"},{"name":"Anette","phone":"5216562866050"},{"name":"","phone":"5216561131685"},{"name":"eduardo alvarez","phone":"5216562442261"},{"name":"Paula Arellano","phone":"5216561905985"},{"name":"","phone":"5216563990542"},{"name":"Place Studio","phone":"5216567484929"},{"name":"Johana Astorga","phone":"5216141338375"},{"name":"Ivanna Cervantes","phone":"5216567750094"},{"name":"Julitte","phone":"5216563492647"},{"name":"","phone":"5216566858397"},{"name":"Ramirez","phone":"5216563549074"},{"name":"","phone":"5216564050927"},{"name":"Luan Martinez","phone":"5216562790249"},{"name":"","phone":"5219381510322"},{"name":"Gaby Camarena","phone":"5216563760634"},{"name":"Desireé","phone":"5216141000774"},{"name":"Jesus","phone":"5216564927593"},{"name":"","phone":"5216565876877"},{"name":"Mim","phone":"5216565297642"},{"name":"","phone":"5216565865288"},{"name":"","phone":"5216567519768"},{"name":"Lidiana","phone":"5216562414767"},{"name":"","phone":"5219921098516"},{"name":"Jos","phone":"5216562846912"},{"name":"","phone":"5219361091104"},{"name":"Mary","phone":"5216566442435"},{"name":"","phone":"5216563327617"},{"name":"Alexia","phone":"5216568163355"},{"name":"Jose Hdz","phone":"5216562768513"},{"name":"","phone":"5216563173429"},{"name":"","phone":"5216563064464"},{"name":"","phone":"5216563555882"},{"name":"","phone":"5216565296785"},{"name":"Martha Gil","phone":"5216562637923"},{"name":"Guadalupe","phone":"5216564310375"},{"name":"Gabriel","phone":"5216563499863"},{"name":"Tony","phone":"5216561672222"},{"name":"Guadalupe Mtz","phone":"5216564619852"},{"name":"José Abel","phone":"5216563495155"},{"name":"Ivan Freire","phone":"5216562164633"},{"name":"Venice macias","phone":"5216561373423"},{"name":"Richy","phone":"5216561371488"},{"name":"Maria Esquivel","phone":"5216561290057"},{"name":"Alondra","phone":"5216567482447"},{"name":"","phone":"5216567477712"},{"name":"Salma Felix","phone":"5216562966932"},{"name":"Joshua Ríos","phone":"5216568599589"},{"name":"Erika","phone":"5216562988795"},{"name":"KarlitaMu","phone":"5216563012611"},{"name":"","phone":"5216567092472"},{"name":"Pamo","phone":"5216563079996"},{"name":"","phone":"5216566016035"},{"name":"","phone":"5216561021513"},{"name":"","phone":"5216563453710"},{"name":"Chalito","phone":"5216568171286"},{"name":"Laura","phone":"5216568212724"},{"name":"Xochitl","phone":"5216567543217"},{"name":"","phone":"5216563735807"},{"name":"Juan Salazar","phone":"5216561793073"},{"name":"Angelica","phone":"5216567662862"},{"name":"Antonio","phone":"5216561211463"},{"name":"Martin Montaño","phone":"5216565941636"},{"name":"","phone":"5216564027093"},{"name":"Luis Vazquez","phone":"5216567448911"},{"name":"Angie Mars","phone":"5216562640612"},{"name":"Patricia Armendáriz","phone":"5216566385516"},{"name":"Rebeca","phone":"5218715830958"},{"name":"Val","phone":"5216566030057"},{"name":"Lety","phone":"5216565651661"},{"name":"Gladis Nuñez","phone":"5216562110227"},{"name":"LA FRU FRU","phone":"5216561141005"},{"name":"","phone":"5216568242618"},{"name":"","phone":"5216568097087"},{"name":"Estela Chavez Alexander","phone":"5216142191052"},{"name":"","phone":"5216143645193"},{"name":"","phone":"5216146078890"},{"name":"Ver","phone":"5216182183881"},{"name":"Naty Tecuatl","phone":"5216561097116"},{"name":"","phone":"5216561699746"},{"name":"Anna","phone":"5216562650192"},{"name":"","phone":"5216562654836"},{"name":"","phone":"5216562779690"},{"name":"Maegarita","phone":"5216562973362"},{"name":"","phone":"5216563016018"},{"name":"","phone":"5216563420622"},{"name":"Aylin González","phone":"5216563520326"},{"name":"","phone":"5216563536249"},{"name":"","phone":"5216563725210"},{"name":"Josefina Castillo","phone":"5216563818636"},{"name":"Maria Olguin","phone":"5216564744687"},{"name":"Meli","phone":"5216565270070"},{"name":"Mayra","phone":"5216565653616"},{"name":"","phone":"5216565826803"},{"name":"Jessy Tabares","phone":"5216565855316"},{"name":"","phone":"5216565866672"},{"name":"","phone":"5216566046065"},{"name":"","phone":"5216566573067"},{"name":"","phone":"5216566699306"},{"name":"Mary","phone":"5216567463927"},{"name":"","phone":"5216568611292"},{"name":"J.J","phone":"5216572202165"},{"name":"Ricardo Palomo","phone":"5218711886778"},{"name":"","phone":"5216561053822"},{"name":"Any Gabriela","phone":"5216563546969"},{"name":"Victor Rocha","phone":"5216563283386"},{"name":"Paloma","phone":"5218715254925"},{"name":"","phone":"5216566675801"},{"name":"Mary","phone":"5216561010908"},{"name":"Norma","phone":"5216566967565"},{"name":"PABLO HERRERA CONTRERAS","phone":"5216183313638"},{"name":"Viby Dmz","phone":"5216562661309"},{"name":"Yolanda","phone":"5216567487424"},{"name":"","phone":"5216562035049"},{"name":"","phone":"5216562012418"},{"name":"Jose Guerrero","phone":"5216561835067"},{"name":"Cesar","phone":"5216561497129"},{"name":"fuera  de servicio","phone":"5216561096167"},{"name":"Marieli Foret","phone":"5216572979298"},{"name":"Lili","phone":"5218711728327"},{"name":"","phone":"5216565285987"},{"name":"","phone":"5216564180914"},{"name":"Julio","phone":"5219872530974"},{"name":"","phone":"5216562934028"},{"name":"Wendy Gabriel","phone":"5216562740657"},{"name":"Claudia Gallegos","phone":"5216565563054"},{"name":"Angel Daniel","phone":"5216565349113"},{"name":"","phone":"5216564488508"},{"name":"Eva Chacon","phone":"5216565894606"},{"name":"","phone":"5216182061707"},{"name":"","phone":"5216567732370"},{"name":"Dulce Xiomara","phone":"5216561680323"},{"name":"","phone":"5216567760117"},{"name":"Aguila","phone":"5212293430277"},{"name":"Dios Te Vendiga","phone":"5216565345483"},{"name":"Terko Y Aferrado","phone":"5216561454311"},{"name":"Estela","phone":"5216565990908"},{"name":"claudia mendez","phone":"5216565995645"},{"name":"Enrique","phone":"5216563734400"},{"name":"","phone":"5216561452760"},{"name":"Herman Mier","phone":"5218714835251"},{"name":"","phone":"5216563528080"},{"name":"","phone":"5216561209410"},{"name":"Mary","phone":"5216568497051"},{"name":"Abi","phone":"5216566595645"},{"name":"yeimi","phone":"5218713591960"},{"name":"Osiris Montes","phone":"5216566695702"},{"name":"Hortencia Avila","phone":"5216182317557"},{"name":"","phone":"5216566750861"},{"name":"EsPino","phone":"5216566754912"},{"name":"","phone":"5216563166828"},{"name":"carbajalcarlosgonzalez","phone":"5216565969754"},{"name":"Rodolfo Falliner","phone":"5216563016410"},{"name":"Gaby","phone":"5216562976168"},{"name":"","phone":"5216563385430"},{"name":"","phone":"5216563373509"},{"name":"","phone":"5216561227335"}];

async function supaREST(method, path, body) {
  const opts = { method, headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error("Supabase " + method + " " + path + ": " + res.status + " " + txt); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = String(phone).replace(/[\s\-()+]/g, "");
  if (num.length === 10) num = "521" + num;
  if (num.length === 12 && num.startsWith("52") && num[2] !== "1") num = "521" + num.slice(2);
  return num;
}

function firstName(name) {
  const n = String(name || "").trim();
  if (!n) return "cliente"; // Twilio rechaza variable vacía (error 21656)
  return n.split(/\s+/)[0].slice(0, 20);
}

async function sendTemplate(to, name, templateSid) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: "missing_config" };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64");
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith("whatsapp:") ? TWILIO_WA : "whatsapp:" + TWILIO_WA;
  params.append("From", fromNum);
  params.append("To", "whatsapp:+" + toNum);
  params.append("ContentSid", templateSid || TEMPLATE_SID);
  params.append("ContentVariables", JSON.stringify({ "1": firstName(name) }));
  try {
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", { method: "POST", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error("[SANANTONIO] WA error " + data.error_code + ": " + data.message); return { ok: false, err: data.error_code + ":" + data.message }; }
    return { ok: true };
  } catch (e) { console.error("[SANANTONIO] WA exception:", e.message); return { ok: false, err: e.message }; }
}

async function saveToHistory(phone, content) {
  try { await supaREST("POST", "clari_conversations", { phone: normalizePhone(phone), role: "assistant", content, user_name: "sanantonio-2x1" }); }
  catch (e) { console.error("[SANANTONIO] Save history error:", e.message); }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: "Key invalida. Usa ?key=TU_CLAVE" }) };
  const dryRun = qs.dry === "1";
  const templateSid = (qs.tpl && /^HX[0-9a-f]{32}$/i.test(qs.tpl)) ? qs.tpl : TEMPLATE_SID;

  const nowCH = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chihuahua" }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: "Fuera de horario (10am-8pm CST)" }) };

  try {
    const now = new Date();
    const candidates = CONTACTS.map(c => ({ name: c.name || "", phone: normalizePhone(c.phone) }));

    const alreadySent = new Set();
    const dedupFrom = new Date(now); dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const phoneFilter = batch.map(c => "\"" + c.phone + "\"").join(",");
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
    } catch (e) { console.warn("[SANANTONIO] Warn compradores:", e.message); }

    const eligible = candidates.filter(c => c.phone && c.phone.length >= 12 && !alreadySent.has(c.phone) && !recentBuyers.has(c.phone));
    const limited = eligible.slice(0, MAX_PER_RUN);

    if (dryRun) return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, total: CONTACTS.length, yaContactados: alreadySent.size, compraronReciente: recentBuyers.size, elegibles: eligible.length, enviarEstaVez: limited.length, restantes: eligible.length - limited.length, muestra: limited.map(c => "..." + c.phone.slice(-4)) }, null, 2) };

    let enviados = 0, fallidos = 0; const errores = [];
    for (const c of limited) {
      try {
        const recheck = await supaREST("GET", "clari_conversations?phone=eq." + c.phone + "&content=ilike.*" + DEDUP_TAG + "*&created_at=gte." + dedupFrom.toISOString() + "&select=id&limit=1");
        if (recheck && recheck.length > 0) { console.log("[SANANTONIO] skip " + c.phone.slice(-4) + " ya enviado"); continue; }
      } catch (e) { console.warn("[SANANTONIO] recheck fallo " + c.phone.slice(-4) + ", salto:", e.message); continue; }
      const result = await sendTemplate(c.phone, c.name, templateSid);
      if (result.ok) { await saveToHistory(c.phone, "[" + DEDUP_TAG + "] Promo San Antonio 2x1 enviada a " + (c.name || c.phone.slice(-4))); enviados++; }
      else { fallidos++; errores.push({ phone: c.phone.slice(-4), err: result.err }); }
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos, total: limited.length, restantes: eligible.length - limited.length, errores: errores.slice(0, 10) }) };
  } catch (err) { console.error("[SANANTONIO] Fatal:", err.message); return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; }
};
