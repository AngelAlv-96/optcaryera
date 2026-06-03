// Vittoria Inauguración — Cupón (lente solar graduado gratis primeros clientes + 2x1)
// Segmento ampliado: 415 = cualquiera que escribió por WA en 2026 y NO compró (incluye a los 103
// reactivación-responders del 1er envío; el dedup por tag los salta automáticamente → ~312 nuevos).
// Manual: GET /.netlify/functions/vittoria-inauguracion-blast?key=SECRET   (dry run: &dry=1)
// Reglas blast: MAX 10/run, dedup por tag, re-check por fono antes de enviar, fail-closed,
// excluye compradores recientes, guard de horario 10am-8pm CST. (Mismo patrón que promo-2x1-blast.)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA = process.env.TWILIO_WA_NUMBER;
const BLAST_KEY = process.env.BLAST_KEY || 'caryera2026';

const MAX_PER_RUN = 10;
const RATE_LIMIT_MS = 1500;
const DEDUP_DAYS = 60;
const DEDUP_TAG = 'Vittoria-Inauguracion';
const TEMPLATE_SID = 'HX3c766b536c05ef3eb9229259efee2825'; // vittoria_inauguracion_cupon (sin variables)

// Lista embebida (evita escritura a app_config). 415 contactos: escribieron por WA en 2026, no compraron.
const CONTACTS = [{"name":"","phone":"5212228071375"},{"name":"","phone":"5212295223952"},{"name":"","phone":"5212461680386"},{"name":"","phone":"5212711400707"},{"name":"","phone":"5212781064358"},{"name":"","phone":"5212781248373"},{"name":"","phone":"5212871292306"},{"name":"","phone":"5212871467670"},{"name":"","phone":"5212941122620"},{"name":"","phone":"5212941155557"},{"name":"","phone":"5213311695914"},{"name":"","phone":"5213531019160"},{"name":"","phone":"5214331144912"},{"name":"","phone":"5214461339931"},{"name":"","phone":"5214621254604"},{"name":"","phone":"5214931181755"},{"name":"","phone":"5214932500879"},{"name":"","phone":"5215564867813"},{"name":"","phone":"5215576319954"},{"name":"","phone":"5215587329862"},{"name":"","phone":"5215617460355"},{"name":"","phone":"5215637521839"},{"name":"","phone":"5215641044070"},{"name":"","phone":"5216141046237"},{"name":"","phone":"5216141084274"},{"name":"","phone":"5216141119774"},{"name":"","phone":"5216141214812"},{"name":"","phone":"5216141379248"},{"name":"","phone":"5216141409134"},{"name":"","phone":"5216141597611"},{"name":"","phone":"5216141747306"},{"name":"","phone":"5216141817301"},{"name":"","phone":"5216141899485"},{"name":"","phone":"5216141903355"},{"name":"","phone":"5216141926947"},{"name":"","phone":"5216142217117"},{"name":"","phone":"5216142310469"},{"name":"","phone":"5216142795671"},{"name":"","phone":"5216142803922"},{"name":"","phone":"5216142892779"},{"name":"","phone":"5216143528319"},{"name":"","phone":"5216143789320"},{"name":"","phone":"5216143853414"},{"name":"","phone":"5216145220580"},{"name":"","phone":"5216145365014"},{"name":"","phone":"5216145469139"},{"name":"","phone":"5216145510724"},{"name":"","phone":"5216145944791"},{"name":"","phone":"5216147574246"},{"name":"","phone":"5216181014591"},{"name":"","phone":"5216181226273"},{"name":"","phone":"5216181454871"},{"name":"","phone":"5216181693556"},{"name":"","phone":"5216181721550"},{"name":"","phone":"5216182112257"},{"name":"","phone":"5216182231035"},{"name":"","phone":"5216183006235"},{"name":"","phone":"5216183124411"},{"name":"","phone":"5216183195669"},{"name":"","phone":"5216183667647"},{"name":"","phone":"5216188005069"},{"name":"","phone":"5216188049052"},{"name":"","phone":"5216251227964"},{"name":"","phone":"5216251464437"},{"name":"","phone":"5216253178108"},{"name":"","phone":"5216271034830"},{"name":"","phone":"5216271151151"},{"name":"luisa fernanda","phone":"5216271470878"},{"name":"","phone":"5216271736556"},{"name":"","phone":"5216391110207"},{"name":"","phone":"5216391150738"},{"name":"","phone":"5216391218772"},{"name":"","phone":"5216391306932"},{"name":"","phone":"5216391568791"},{"name":"","phone":"5216391616290"},{"name":"","phone":"5216391754692"},{"name":"","phone":"5216471228443"},{"name":"","phone":"5216481093673"},{"name":"","phone":"5216481466265"},{"name":"","phone":"5216491011533"},{"name":"","phone":"5216521018907"},{"name":"","phone":"5216561020951"},{"name":"","phone":"5216561045934"},{"name":"LUIS ANTINIO","phone":"5216561050032"},{"name":"","phone":"5216561057464"},{"name":"","phone":"5216561069823"},{"name":"","phone":"5216561077615"},{"name":"","phone":"5216561078012"},{"name":"","phone":"5216561116536"},{"name":"","phone":"5216561127954"},{"name":"","phone":"5216561133624"},{"name":"","phone":"5216561158259"},{"name":"","phone":"5216561200550"},{"name":"","phone":"5216561213508"},{"name":"","phone":"5216561254329"},{"name":"","phone":"5216561257790"},{"name":"","phone":"5216561260688"},{"name":"","phone":"5216561262562"},{"name":"","phone":"5216561275635"},{"name":"","phone":"5216561277245"},{"name":"","phone":"5216561281370"},{"name":"","phone":"5216561300668"},{"name":"","phone":"5216561323639"},{"name":"","phone":"5216561330885"},{"name":"","phone":"5216561339866"},{"name":"","phone":"5216561342469"},{"name":"","phone":"5216561346765"},{"name":"","phone":"5216561351919"},{"name":"","phone":"5216561358691"},{"name":"","phone":"5216561384124"},{"name":"","phone":"5216561388757"},{"name":"","phone":"5216561424565"},{"name":"","phone":"5216561445598"},{"name":"","phone":"5216561482435"},{"name":"","phone":"5216561482714"},{"name":"","phone":"5216561484406"},{"name":"","phone":"5216561499431"},{"name":"","phone":"5216561566049"},{"name":"","phone":"5216561573066"},{"name":"","phone":"5216561607640"},{"name":"","phone":"5216561619250"},{"name":"","phone":"5216561630663"},{"name":"","phone":"5216561743535"},{"name":"","phone":"5216561753477"},{"name":"","phone":"5216561767083"},{"name":"","phone":"5216561771056"},{"name":"","phone":"5216561773613"},{"name":"MAYANIN","phone":"5216561776805"},{"name":"","phone":"5216561802000"},{"name":"","phone":"5216561839502"},{"name":"","phone":"5216561845047"},{"name":"","phone":"5216561865761"},{"name":"","phone":"5216561870028"},{"name":"","phone":"5216561872777"},{"name":"","phone":"5216561912272"},{"name":"","phone":"5216561982324"},{"name":"","phone":"5216562033293"},{"name":"","phone":"5216562033987"},{"name":"","phone":"5216562060446"},{"name":"","phone":"5216562069113"},{"name":"RAFAELA","phone":"5216562116762"},{"name":"Dafne","phone":"5216562130718"},{"name":"Alma Delia","phone":"5216562138870"},{"name":"","phone":"5216562159187"},{"name":"","phone":"5216562160015"},{"name":"","phone":"5216562380597"},{"name":"","phone":"5216562435060"},{"name":"","phone":"5216562443889"},{"name":"","phone":"5216562449898"},{"name":"","phone":"5216562507559"},{"name":"Laura","phone":"5216562621109"},{"name":"","phone":"5216562624763"},{"name":"","phone":"5216562631324"},{"name":"","phone":"5216562636493"},{"name":"","phone":"5216562643818"},{"name":"","phone":"5216562650205"},{"name":"","phone":"5216562654433"},{"name":"","phone":"5216562673369"},{"name":"","phone":"5216562696299"},{"name":"","phone":"5216562712397"},{"name":"","phone":"5216562722362"},{"name":"CHRISTIAN","phone":"5216562725429"},{"name":"","phone":"5216562729523"},{"name":"","phone":"5216562736563"},{"name":"","phone":"5216562742421"},{"name":"ma alicia","phone":"5216562747470"},{"name":"","phone":"5216562759035"},{"name":"","phone":"5216562770956"},{"name":"","phone":"5216562778222"},{"name":"","phone":"5216562801118"},{"name":"","phone":"5216562816296"},{"name":"","phone":"5216562818531"},{"name":"","phone":"5216562842841"},{"name":"","phone":"5216562846120"},{"name":"","phone":"5216562873659"},{"name":"","phone":"5216562999769"},{"name":"","phone":"5216563000061"},{"name":"","phone":"5216563041999"},{"name":"","phone":"5216563044370"},{"name":"","phone":"5216563073161"},{"name":"","phone":"5216563079042"},{"name":"","phone":"5216563080998"},{"name":"Elda","phone":"5216563092728"},{"name":"","phone":"5216563093967"},{"name":"","phone":"5216563114670"},{"name":"Carolina","phone":"5216563127794"},{"name":"","phone":"5216563176052"},{"name":"","phone":"5216563193890"},{"name":"","phone":"5216563208819"},{"name":"","phone":"5216563216668"},{"name":"","phone":"5216563222542"},{"name":"","phone":"5216563234181"},{"name":"","phone":"5216563283342"},{"name":"","phone":"5216563292810"},{"name":"","phone":"5216563318024"},{"name":"Dulce","phone":"5216563320579"},{"name":"","phone":"5216563321483"},{"name":"","phone":"5216563372143"},{"name":"Ivonne Yamilez","phone":"5216563373509"},{"name":"","phone":"5216563391085"},{"name":"","phone":"5216563418354"},{"name":"","phone":"5216563425132"},{"name":"","phone":"5216563469055"},{"name":"","phone":"5216563473746"},{"name":"","phone":"5216563493310"},{"name":"","phone":"5216563505182"},{"name":"","phone":"5216563506933"},{"name":"","phone":"5216563522572"},{"name":"","phone":"5216563534610"},{"name":"","phone":"5216563595254"},{"name":"","phone":"5216563607649"},{"name":"","phone":"5216563614482"},{"name":"","phone":"5216563643611"},{"name":"","phone":"5216563740333"},{"name":"","phone":"5216563747786"},{"name":"FRANCISCO","phone":"5216563772170"},{"name":"","phone":"5216563792101"},{"name":"Gloria","phone":"5216563831146"},{"name":"","phone":"5216563847138"},{"name":"","phone":"5216563872897"},{"name":"","phone":"5216563932144"},{"name":"","phone":"5216564023783"},{"name":"","phone":"5216564025992"},{"name":"","phone":"5216564054919"},{"name":"","phone":"5216564137890"},{"name":"","phone":"5216564140742"},{"name":"","phone":"5216564192325"},{"name":"","phone":"5216564193394"},{"name":"","phone":"5216564197656"},{"name":"","phone":"5216564198777"},{"name":"","phone":"5216564199196"},{"name":"","phone":"5216564220352"},{"name":"","phone":"5216564223072"},{"name":"","phone":"5216564258440"},{"name":"","phone":"5216564259797"},{"name":"","phone":"5216564265330"},{"name":"CLAUDIA BERENICE","phone":"5216564267216"},{"name":"","phone":"5216564270013"},{"name":"","phone":"5216564281968"},{"name":"","phone":"5216564291400"},{"name":"","phone":"5216564297317"},{"name":"DAMARIS","phone":"5216564375347"},{"name":"","phone":"5216564403150"},{"name":"","phone":"5216564412427"},{"name":"","phone":"5216564473925"},{"name":"","phone":"5216564490398"},{"name":"","phone":"5216564521991"},{"name":"","phone":"5216564583422"},{"name":"","phone":"5216564587873"},{"name":"","phone":"5216564680414"},{"name":"FRANCISCO","phone":"5216564768114"},{"name":"","phone":"5216564806682"},{"name":"","phone":"5216564958970"},{"name":"Jorge","phone":"5216564972526"},{"name":"","phone":"5216564989008"},{"name":"","phone":"5216564995409"},{"name":"","phone":"5216565107013"},{"name":"ISELA","phone":"5216565284540"},{"name":"","phone":"5216565288582"},{"name":"","phone":"5216565290830"},{"name":"ZULMA","phone":"5216565292324"},{"name":"IRVIN ARMANDO","phone":"5216565294006"},{"name":"JUAN CARLOS","phone":"5216565306078"},{"name":"","phone":"5216565310518"},{"name":"","phone":"5216565323258"},{"name":"","phone":"5216565324062"},{"name":"","phone":"5216565504202"},{"name":"","phone":"5216565511890"},{"name":"","phone":"5216565538555"},{"name":"","phone":"5216565554318"},{"name":"","phone":"5216565564560"},{"name":"","phone":"5216565632399"},{"name":"","phone":"5216565636412"},{"name":"","phone":"5216565656267"},{"name":"","phone":"5216565709230"},{"name":"","phone":"5216565717689"},{"name":"","phone":"5216565727444"},{"name":"","phone":"5216565737824"},{"name":"","phone":"5216565741492"},{"name":"","phone":"5216565778468"},{"name":"","phone":"5216565790503"},{"name":"","phone":"5216565803666"},{"name":"","phone":"5216565812262"},{"name":"","phone":"5216565841178"},{"name":"ADRIANA","phone":"5216565844713"},{"name":"","phone":"5216565848028"},{"name":"","phone":"5216565861873"},{"name":"","phone":"5216565878298"},{"name":"","phone":"5216565881826"},{"name":"","phone":"5216565892464"},{"name":"","phone":"5216565900191"},{"name":"","phone":"5216565906072"},{"name":"","phone":"5216565907024"},{"name":"","phone":"5216565908260"},{"name":"","phone":"5216565953116"},{"name":"","phone":"5216565957215"},{"name":"","phone":"5216565959145"},{"name":"","phone":"5216565967294"},{"name":"","phone":"5216565976127"},{"name":"","phone":"5216565981190"},{"name":"","phone":"5216566002477"},{"name":"Israel","phone":"5216566002991"},{"name":"","phone":"5216566009642"},{"name":"","phone":"5216566010777"},{"name":"","phone":"5216566015416"},{"name":"","phone":"5216566016229"},{"name":"","phone":"5216566066887"},{"name":"","phone":"5216566069060"},{"name":"","phone":"5216566084185"},{"name":"","phone":"5216566260518"},{"name":"","phone":"5216566263239"},{"name":"","phone":"5216566430121"},{"name":"","phone":"5216566433258"},{"name":"","phone":"5216566564997"},{"name":"","phone":"5216566566063"},{"name":"","phone":"5216566571495"},{"name":"","phone":"5216566590355"},{"name":"JUAN FRANCISCO","phone":"5216566600208"},{"name":"","phone":"5216566606570"},{"name":"","phone":"5216566623213"},{"name":"TANIA","phone":"5216566673916"},{"name":"","phone":"5216566758668"},{"name":"","phone":"5216566962290"},{"name":"","phone":"5216566970986"},{"name":"","phone":"5216567051831"},{"name":"","phone":"5216567057355"},{"name":"","phone":"5216567058870"},{"name":"","phone":"5216567084414"},{"name":"","phone":"5216567435804"},{"name":"","phone":"5216567476601"},{"name":"","phone":"5216567485689"},{"name":"","phone":"5216567490517"},{"name":"","phone":"5216567516767"},{"name":"","phone":"5216567550300"},{"name":"","phone":"5216567553494"},{"name":"","phone":"5216567555715"},{"name":"","phone":"5216567557218"},{"name":"","phone":"5216567578741"},{"name":"","phone":"5216567650413"},{"name":"","phone":"5216567665031"},{"name":"","phone":"5216567667089"},{"name":"","phone":"5216567669296"},{"name":"","phone":"5216567705758"},{"name":"","phone":"5216567706671"},{"name":"","phone":"5216567739924"},{"name":"","phone":"5216567770310"},{"name":"sr,","phone":"5216567772722"},{"name":"","phone":"5216567776049"},{"name":"","phone":"5216567783360"},{"name":"","phone":"5216567785371"},{"name":"","phone":"5216567925169"},{"name":"","phone":"5216567928589"},{"name":"","phone":"5216568046125"},{"name":"Karina","phone":"5216568110707"},{"name":"","phone":"5216568155341"},{"name":"","phone":"5216568160308"},{"name":"","phone":"5216568170470"},{"name":"","phone":"5216568174431"},{"name":"","phone":"5216568178423"},{"name":"","phone":"5216568178824"},{"name":"","phone":"5216568200008"},{"name":"","phone":"5216568200440"},{"name":"","phone":"5216568204150"},{"name":"","phone":"5216568244592"},{"name":"","phone":"5216568279968"},{"name":"","phone":"5216568324958"},{"name":"","phone":"5216568341673"},{"name":"","phone":"5216568510337"},{"name":"","phone":"5216568520364"},{"name":"","phone":"5216568521956"},{"name":"","phone":"5216568535637"},{"name":"","phone":"5216568541726"},{"name":"","phone":"5216568547733"},{"name":"","phone":"5216568568008"},{"name":"","phone":"5216568584016"},{"name":"","phone":"5216568611069"},{"name":"","phone":"5216568620374"},{"name":"","phone":"5216568793264"},{"name":"","phone":"5216568798567"},{"name":"","phone":"5216568984831"},{"name":"","phone":"5216568989719"},{"name":"","phone":"5216571041626"},{"name":"","phone":"5216571100637"},{"name":"","phone":"5216571775296"},{"name":"","phone":"5216571912051"},{"name":"","phone":"5216571933697"},{"name":"","phone":"5216572157085"},{"name":"","phone":"5216572254519"},{"name":"","phone":"5216572519388"},{"name":"","phone":"5216645404819"},{"name":"","phone":"5216751038234"},{"name":"","phone":"5216751076001"},{"name":"","phone":"5217221492011"},{"name":"","phone":"5217472217519"},{"name":"","phone":"5218119445684"},{"name":"","phone":"5218443547417"},{"name":"","phone":"5218701496508"},{"name":"","phone":"5218711626825"},{"name":"","phone":"5218712610648"},{"name":"","phone":"5218712801438"},{"name":"","phone":"5218713946725"},{"name":"","phone":"5218714043019"},{"name":"","phone":"5218714072359"},{"name":"","phone":"5218714805340"},{"name":"","phone":"5218715721640"},{"name":"","phone":"5218717816431"},{"name":"","phone":"5218719304948"},{"name":"","phone":"5218721173869"},{"name":"","phone":"5219221005721"},{"name":"","phone":"5219222061520"},{"name":"","phone":"5219321151435"},{"name":"","phone":"5219511428636"},{"name":"","phone":"5219617580513"},{"name":"","phone":"526568511401"},{"name":"","phone":"526568515197"}];

async function supaREST(method, path, body) {
  const opts = { method, headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error('Supabase ' + method + ' ' + path + ': ' + res.status + ' ' + txt); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function normalizePhone(phone) {
  let num = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (num.length === 10) num = '521' + num;
  if (num.length === 12 && num.startsWith('52') && num[2] !== '1') num = '521' + num.slice(2);
  return num;
}

async function sendTemplate(to, templateSid) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return { ok: false, err: 'missing_config' };
  const toNum = normalizePhone(to);
  const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
  const params = new URLSearchParams();
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  params.append('From', fromNum);
  params.append('To', 'whatsapp:+' + toNum);
  params.append('ContentSid', templateSid || TEMPLATE_SID);
  params.append('ContentVariables', JSON.stringify({}));
  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', { method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await res.json();
    if (data.error_code) { console.error('[VITTORIA] WA error ' + data.error_code + ': ' + data.message); return { ok: false, err: data.error_code + ':' + data.message }; }
    return { ok: true };
  } catch (e) { console.error('[VITTORIA] WA exception:', e.message); return { ok: false, err: e.message }; }
}

async function saveToHistory(phone, content) {
  try { await supaREST('POST', 'clari_conversations', { phone: normalizePhone(phone), role: 'assistant', content, user_name: 'vittoria-inauguracion' }); }
  catch (e) { console.error('[VITTORIA] Save history error:', e.message); }
}

async function getAdminPhones() {
  try { const cfg = await supaREST('GET', 'app_config?id=eq.whatsapp_config&select=value'); if (cfg && cfg[0]) { const parsed = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value; return parsed.admin_phones || ['5216564269961']; } } catch (e) {}
  return ['5216564269961'];
}

async function sendAdminWA(msg) {
  const phones = await getAdminPhones();
  const auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
  const fromNum = TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA;
  for (const ap of phones) {
    try { const toNum = normalizePhone(ap); const params = new URLSearchParams(); params.append('From', fromNum); params.append('To', 'whatsapp:+' + toNum); params.append('Body', msg);
      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', { method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    } catch (e) { console.warn('[VITTORIA] Admin notify error:', e.message); }
  }
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  if (qs.key !== BLAST_KEY) return { statusCode: 401, body: JSON.stringify({ error: 'Key invalida. Usa ?key=TU_CLAVE' }) };
  const dryRun = qs.dry === '1';
  // Permite elegir el template aprobado al momento de enviar (?tpl=SID). Default: el de texto.
  const templateSid = (qs.tpl && /^HX[0-9a-f]{32}$/i.test(qs.tpl)) ? qs.tpl : TEMPLATE_SID;

  const nowCH = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  const horaLocal = nowCH.getHours();
  if (horaLocal < 10 || horaLocal >= 20) return { statusCode: 200, body: JSON.stringify({ ok: true, enviados: 0, mensaje: 'Fuera de horario (10am-8pm CST)' }) };

  try {
    const now = new Date();
    const candidates = CONTACTS.map(c => ({ name: c.name || '', phone: normalizePhone(c.phone) }));

    // Dedup por tag en los ultimos DEDUP_DAYS dias
    const alreadySent = new Set();
    const dedupFrom = new Date(now); dedupFrom.setDate(dedupFrom.getDate() - DEDUP_DAYS);
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = candidates.slice(i, i + 20);
      const phoneFilter = batch.map(c => '"' + c.phone + '"').join(',');
      try {
        const msgs = await supaREST('GET', 'clari_conversations?phone=in.(' + phoneFilter + ')&content=ilike.*' + DEDUP_TAG + '*&created_at=gte.' + dedupFrom.toISOString() + '&select=phone&limit=500');
        if (msgs) msgs.forEach(m => alreadySent.add(m.phone));
      } catch (e) {}
    }

    // Excluir compradores ultimos 60 dias (doble seguridad)
    const cut60 = new Date(now); cut60.setDate(cut60.getDate() - 60);
    const recentBuyers = new Set();
    try {
      const ventas = await supaREST('GET', 'ventas?created_at=gte.' + cut60.toISOString() + '&select=pacientes(telefono)&limit=2000');
      if (ventas) ventas.forEach(v => { if (v.pacientes && v.pacientes.telefono) { const norm = normalizePhone(v.pacientes.telefono); if (norm) recentBuyers.add(norm); } });
    } catch (e) { console.warn('[VITTORIA] Warn compradores:', e.message); }

    const eligible = candidates.filter(c => c.phone && c.phone.length >= 12 && !alreadySent.has(c.phone) && !recentBuyers.has(c.phone));
    const limited = eligible.slice(0, MAX_PER_RUN);

    if (dryRun) return { statusCode: 200, body: JSON.stringify({ ok: true, dryRun: true, total: CONTACTS.length, yaContactados: alreadySent.size, compraronReciente: recentBuyers.size, elegibles: eligible.length, enviarEstaVez: limited.length, restantes: eligible.length - limited.length, muestra: limited.map(c => '...' + c.phone.slice(-4)) }, null, 2) };

    let enviados = 0, fallidos = 0; const errores = [];
    for (const c of limited) {
      // Re-check por fono justo antes de enviar (fail-closed)
      try {
        const recheck = await supaREST('GET', 'clari_conversations?phone=eq.' + c.phone + '&content=ilike.*' + DEDUP_TAG + '*&created_at=gte.' + dedupFrom.toISOString() + '&select=id&limit=1');
        if (recheck && recheck.length > 0) { console.log('[VITTORIA] skip ' + c.phone.slice(-4) + ' ya enviado'); continue; }
      } catch (e) { console.warn('[VITTORIA] recheck fallo ' + c.phone.slice(-4) + ', salto:', e.message); continue; }
      const result = await sendTemplate(c.phone, templateSid);
      if (result.ok) { await saveToHistory(c.phone, '[' + DEDUP_TAG + '] Cupon inauguracion Vittoria enviado a ' + (c.name || c.phone.slice(-4))); enviados++; }
      else { fallidos++; errores.push({ phone: c.phone.slice(-4), err: result.err }); }
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    // (Resumen por WhatsApp a admins ELIMINADO — spameaba un mensaje por cada lote a los admin_phones.
    //  Los resultados de cada lote ya van en la respuesta JSON; no hace falta notificar por WA.)

    return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos, total: limited.length, restantes: eligible.length - limited.length, errores: errores.slice(0, 10) }) };
  } catch (err) { console.error('[VITTORIA] Fatal:', err.message); return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; }
};
