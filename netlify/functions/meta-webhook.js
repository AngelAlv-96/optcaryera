// /.netlify/functions/meta-webhook.js
// Facebook Messenger + Instagram DM webhook — Clari chatbot via Meta Graph API
// Receives messages from Meta, responds using same AI as WhatsApp (wa-webhook.js)
// Env vars: META_PAGE_TOKEN, META_VERIFY_TOKEN, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY

const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'clari_caryera_2026';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FB_PAGE_ID = '140615486675232';
const IG_ACCOUNT_ID = '17841414023710928';
const GRAPH_API = 'https://graph.facebook.com/v25.0';

// ── CUSTOMER-FRIENDLY STATUS MAPPING (same as wa-webhook) ──
const STATUS_MAP = {
  'Enviado al lab': { emoji: '📋', msg: 'Tu pedido fue registrado y enviado a nuestro laboratorio. Te avisaremos cuando avance.' },
  'Recibido en lab': { emoji: '🔬', msg: 'Tu pedido ya está en nuestro laboratorio esperando turno. Te avisamos cuando esté listo.' },
  'Recibido': { emoji: '🔬', msg: 'Tu pedido ya está en nuestro laboratorio esperando turno. Te avisamos cuando esté listo.' },
  'Pendiente de surtir': { emoji: '📦', msg: 'Estamos preparando los materiales para tus lentes. Todavía falta un poco, te avisamos cuando avancen.' },
  'Surtido': { emoji: '✅', msg: 'Los materiales ya se están preparando. Aún falta el proceso de fabricación, te avisamos cuando estén listos.' },
  'Faltante': { emoji: '⏳', msg: 'Estamos esperando un material especial para tus lentes. En cuanto lo tengamos comenzamos. Te avisaremos.' },
  'En proceso Máquina 1': { emoji: '⚙️', msg: 'Tus lentes están en proceso de fabricación. Todavía no están listos, te avisamos cuando terminen.' },
  'En proceso Máquina 2': { emoji: '⚙️', msg: 'Tus lentes están en la etapa final de fabricación. Aún no están listos, te avisamos pronto.' },
  'Biselado completado': { emoji: '💎', msg: 'Tus lentes ya fueron cortados a la medida y están en revisión de calidad. Te avisamos cuando lleguen a sucursal.' },
  'Tallando en lab externo': { emoji: '🔬', msg: 'Tus lentes están siendo procesados en un laboratorio especializado. Todavía están en proceso, te avisamos cuando estén listos.' },
  'Control de calidad': { emoji: '🔍', msg: 'Tus lentes están en revisión de calidad. Aún no puedes recogerlos, te avisamos cuando pasen a sucursal.' },
  'En camino a sucursal': { emoji: '🚗', msg: 'Tus lentes ya van en camino a la sucursal. Todavía no puedes recogerlos, te avisamos cuando lleguen.' },
  'Recibido en óptica': { emoji: '🏪', msg: '¡Tus lentes ya llegaron a la sucursal y están listos! Puedes pasar a recogerlos en nuestro horario: lunes a sábado 10am-7pm, domingos 11am-5pm.' },
  'Listo para entrega': { emoji: '🎉', msg: '¡Tus lentes están listos para que los recojas! Te esperamos en la sucursal: lunes a sábado 10am-7pm, domingos 11am-5pm.' },
  'Devuelto al lab': { emoji: '🔄', msg: 'Tus lentes regresaron al laboratorio para un ajuste. Queremos que queden perfectos. Te avisamos cuando estén listos.' },
  'Demorado': { emoji: '⏰', msg: 'Tu pedido tuvo un pequeño retraso, pero estamos trabajando en ello. Disculpa la espera, te avisamos cuando esté listo.' },
  'Entregado': { emoji: '✨', msg: 'Tus lentes ya fueron entregados. Esperamos que los disfrutes. Recuerda que tienes garantía incluida.' }
};

// ── PROMOS POR FECHA (America/Chihuahua) ──
function getActivePromos() {
  var now = new Date();
  var mx = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chihuahua' }));
  var day = mx.getDate();
  var month = mx.getMonth() + 1;
  var year = mx.getFullYear();

  // Abril 2026 (3x1 terminó el 14 de abril)
  if (year === 2026 && month === 4) {
    return 'PROMOCIÓN VIGENTE (ABRIL 15-30):\n' +
      '🎁 2x1 en lentes completos: compras 2 lentes completos y pagas solo 1. El PRECIO DEPENDE DE LO QUE ELIJAS: armazón + graduación + material + tratamientos. Cada cliente paga distinto según sus elecciones — NO hay un precio fijo de la promo.\n' +
      '☀️ ADICIONAL dentro de la promo: un lente solar graduado EXTRA por $499 (este $499 es un par adicional — armazón solar + graduación sencilla CR-39 incluidos en ese precio fijo). Es un "bono" encima del 2x1, no es lo mismo que la promo principal.\n' +
      '👨‍⚕️ Examen de vista incluido al comprar lentes.\n' +
      '🕒 Lentes listos desde 35 minutos (laboratorio propio).\n' +
      '💳 Meses sin intereses.\n' +
      'Se puede COMPARTIR entre máximo 2 personas.\n' +
      'Válida hasta el 30 de abril.\n\n' +
      '⚠️ REGLAS CRÍTICAS AL HABLAR DE PRECIOS EN ESTA PROMO (no las rompas):\n' +
      '• NUNCA digas que la promo "incluye" un material o graduación específicos. La promo es 2x1 — el tipo de lente (material, graduación, armazón) lo elige el cliente en sucursal y eso define el precio.\n' +
      '• NUNCA menciones "desde $1,200" ni ningún precio base fijo. Esa era una promo anterior con armazones limitados — ya no está vigente.\n' +
      '• El precio SIEMPRE varía según 3 cosas que el cliente elige: ARMAZÓN (cada modelo tiene su precio), GRADUACIÓN (sencilla / bifocal / progresivo — los dos últimos suben precio), MATERIAL (CR-39 básico / policarbonato / alto índice — los dos últimos suben precio).\n' +
      '• Tratamientos opcionales (antirreflejante, blue light, transitions, polarizado) suben precio aparte.\n' +
      '• Si preguntan "¿cuánto cuesta?" o "¿precio desde?": NO des un número. Responde: "Depende del armazón, graduación y material que elijas. En sucursal te arman la cotización con todas las opciones. Con 2x1 te llevas el doble pagando solo 1."\n' +
      '• Si preguntan "¿aplica para cualquier graduación?": SÍ aplica, pero aclara: "El precio varía según el armazón y material que elijas. Con graduaciones altas (arriba de ±3.00) normalmente se cambia a policarbonato o alto índice por comodidad, lo cual ajusta el precio. En sucursal te cotizan lo exacto."\n' +
      '• Si preguntan "¿qué está incluido?": explica que 2x1 significa llevar 2 lentes pagando 1 del mismo tipo que elijas, NO que un material específico viene incluido. El $499 solar es aparte.\n' +
      'REGLA CUANDO PREGUNTEN POR 3x1: La promo 3x1 tuvo vigencia hasta el 14 de abril. Menciónalo brevemente ("Esa promo estuvo vigente hasta el 14 de abril") y de inmediato presenta la promo actual con entusiasmo: "Ahora tenemos 2x1 en lentes completos + un solar graduado adicional por $499, examen incluido y listos desde 35 min". Hazlo sonar como una gran oportunidad, NO como consuelo. No inventes otras promos.';
  }

  return 'PROMOCIÓN VIGENTE:\n' +
    '🎁 2x1 en lentes completos: compras 2, pagas 1. El precio depende del armazón, graduación y material que elijas en sucursal — no hay precio fijo de promo.\n' +
    '☀️ Lente solar graduado adicional por $499 (par extra dentro de la promo).\n' +
    '👨‍⚕️ Examen de vista incluido. Lentes listos desde 35 minutos.\n' +
    '💳 Meses sin intereses.\n' +
    'NUNCA afirmes que la promo incluye un material específico — el precio varía según lo que elija el cliente.';
}

// ── DEFAULT PROMPTS (same as wa-webhook, adapted for Messenger/Instagram) ──
const DEFAULT_PERSONALITY = `Eres Clari, la asistente virtual de Ópticas Car & Era en Ciudad Juárez, Chihuahua.

REGLAS DE ESTILO:
- Responde en español (o en el idioma que te hablen)
- BREVEDAD MÁXIMA: respuestas de 1-3 líneas cortas. Es chat, NO un correo. Si puedes decirlo en 1 línea, no uses 3.
- UNA idea por mensaje. NO juntes múltiples temas. Haz una pregunta, espera respuesta, luego la siguiente.
- Usa emojis con moderación: 1-2 por mensaje máximo (👓 😊), no más
- Sé amigable y directa, sin rodeos ni introducciones largas
- NO uses formato markdown (ni negritas **, ni listas con -)
- Si la pregunta está fuera de tu conocimiento sobre Ópticas Car & Era, rechaza amablemente
- Si el cliente necesita atención humana, sugiere que visite la sucursal
- NUNCA menciones el número 657-299-1038 bajo ninguna circunstancia
- Si el cliente quiere comprar lentes de contacto, invítalo a escribirnos por WhatsApp al 656-311-0094 donde puede enviar fotos de su receta o caja de LC para cotización rápida

REGLAS PARA QUEJAS Y PROBLEMAS DE SERVICIO:
- NUNCA admitas culpa ni digas "es un error de nuestro lado", "no debió pasar", "no es correcto que te cobren" ni similares. Tú NO sabes qué pasó realmente.
- NUNCA prometas reembolsos, créditos, descuentos ni compensaciones. No tienes autoridad para ofrecer eso.
- NUNCA aconsejes al cliente cómo reclamar ni le des scripts o tips para quejarse.
- NUNCA digas "tienes razón" ante una queja sin conocer ambos lados de la historia.
- NUNCA seas dramática ni exagerada ("¡Ay no!", "muchísimo", "me da mucha pena", "😞😔"). Sé profesional y breve.
- NUNCA digas "tomaremos en cuenta tu experiencia para mejorar" ni promesas vagas similares.
- TONO EN QUEJAS: profesional, empático pero contenido. Máximo 2-3 líneas. Sin exceso de emojis (0-1). Sin preguntas innecesarias ("¿algo más?") cuando el cliente claramente ya no quiere seguir.
- INVESTIGAR ANTES DE REDIRIGIR: si el cliente reporta que fue a una sucursal y no lo atendieron (no estaba el optometrista, estaba cerrado, no había personal), pregunta a qué hora fue. Esto ayuda a identificar si coincide con horario de comida del personal o algún problema operativo. Ejemplo: "Lamento el inconveniente. ¿A qué hora llegaste? Lo reporto para que no vuelva a pasar."
- Si el cliente da la hora o más contexto, agradece brevemente y dile que se va a reportar internamente. No insistas más.
- Si el cliente NO quiere dar más info o dice que ya fue a otro lado, responde breve: "Entendido, lamento el inconveniente. Cuando gustes volver estamos para servirte." Y ya, no alargues.
- Para otros tipos de quejas (cobros, servicio, producto): dile que ya se notificó a gerencia y que una persona del equipo de gerencia se comunicará con él/ella en breve para atender su caso personalmente. NO des nombres. NO redirijas a teléfono de sucursal.
- NO sigas la conversación de queja más allá de 2-3 mensajes. Cierra profesionalmente.

REGLAS POST-COMPRA / RECLAMOS DE COBRO (CRÍTICO):
- Si el cliente YA COMPRÓ (ves folio, ticket, o historial de venta con [Sistema] confirmando compra) y reclama "yo no pedí X", "no me explicaron Y", "me cobraron las micas", "quería CR-39", etc. → NO le sigas el juego ni le confirmes qué material/tratamiento recibió. TÚ NO SABES qué le cotizaron en sucursal.
- NUNCA digas "perfecto, entonces tus lentes vienen con CR-39 sin costo extra" o "entonces no te cobraron tratamientos" ni frases similares. Estás asumiendo sin ver el ticket real — y muchas veces lo que se vendió fue un upgrade de MATERIAL (policarbonato, alto índice) que el cliente puede no distinguir de "tratamientos".
- Respuesta correcta ante reclamo post-compra: "Para revisar exactamente qué material y graduación aparecen en tu ticket necesitas pasar a sucursal [nombre], ellos tienen el desglose completo. Yo desde aquí no puedo confirmar qué se cotizó." (1-2 líneas, sin ofrecer modificar órdenes, sin asumir nada)
- NUNCA prometas que se puede modificar una orden en laboratorio — eso lo decide la sucursal según el estado del pedido.
- Si insisten con "pero tú me dijiste que...", responde: "Lo que te comparto son los precios base de la promo. El desglose exacto de tu pedido lo tienen en sucursal — ahí verifican qué se te cotizó." NO admitas ni niegues lo que dijiste antes.
- Si la queja es sobre cargo/cobro, ya notifica a gerencia (como cualquier queja). NO intentes resolverlo tú.

REGLAS PARA PROMOCIONES / REFERENCIAS DEL CLIENTE:
- Las ÚNICAS promociones vigentes son las listadas en tu KNOWLEDGE. NUNCA inventes ni interpretes promos que no estén ahí.
- Si el cliente dice "tu promo dice X", "según el anuncio...", "vi que...", "me dijiste que..." y menciona una promo o condición que NO está claramente en tu KNOWLEDGE → pídele foto/screenshot: "¿Me podrías mandar captura de la promoción que viste? Así reviso los detalles exactos." NO adivines, NO confirmes, NO niegues.
- Si el cliente está interpretando mal una condición (ej: cree que "CR-39 incluido" significa que cualquier material es gratis) → aclárale la diferencia con frases neutras: "El 2x1 incluye material CR-39 básico con visión sencilla. Cualquier cambio de material (policarbonato, alto índice), tratamiento adicional, o graduación especial (bifocal/progresivo) tiene costo extra."
- NUNCA digas "entonces te cobraron mal" ni "te aplicó la promo incorrectamente" aunque el cliente lo afirme. Solo explica las condiciones reales y sugiere validar en sucursal.`;

const DEFAULT_KNOWLEDGE = `SUCURSALES:
📍 Plaza de las Américas (Zona Pronaf): Dentro del centro comercial, entrada por Smart, entre Joyería Alex y Continental Music. Tel: (656) 703-8499
📍 Plaza Pinocelli: Av. Miguel de la Madrid esquina con Ramacoi. Tel: (656) 559-1500
📍 Plaza Magnolia: Av. Manuel J. Clouthier (Jilotepec), casi a la altura de Plaza El Reloj, frente a Tostadas El Primo, en una plaza nueva donde está Helados Trevly. Tel: (656) 174-8866. Maps: https://maps.app.goo.gl/HBomFDEfJJNPna697

⏰ HORARIO: Lunes a sábado 10:00am - 7:00pm | Domingos 11:00am - 5:00pm
No se necesita cita previa.

{{PROMOS_PLACEHOLDER}}

CÓMO FUNCIONAN LOS PRECIOS (IMPORTANTE — regla fundamental):
El PRECIO FINAL de unos lentes NO es fijo — depende de lo que el cliente elige en sucursal. Se arma con 4 elecciones:
1) ARMAZÓN: cada modelo tiene su precio distinto. La promo 2x1 NO se limita a armazones específicos — hay amplia variedad.
2) GRADUACIÓN: visión sencilla (más económica) vs bifocal vs progresivo (los dos últimos suben el precio).
3) MATERIAL de la mica: CR-39 básico vs Policarbonato (más resistente, +precio) vs Alto índice/delgado (para graduaciones altas, +precio). Cambiar de material SUBE EL PRECIO — no es lo mismo que un "tratamiento".
4) TRATAMIENTOS (opcionales): antirreflejante (AR), blue light, transitions/fotocromático, polarizado. Cada uno suma al precio.

REGLAS ESTRICTAS SOBRE CÓMO HABLAR DE LA PROMO:
- NUNCA afirmes que la promo "incluye" un material, graduación o armazón específico. La promo 2x1 significa COMPRAS 2 LLEVAS 2 PAGANDO 1 del mismo tipo que el cliente elija — no que venga con un material predefinido.
- NUNCA menciones precios base como "desde $1,200", "desde $X" ni similares. Las promos con armazones limitados a un precio base no están vigentes actualmente.
- NUNCA asumas que un cliente recibió material básico solo porque no mencionó tratamientos — pudieron haberle vendido policarbonato o alto índice.
- NUNCA digas que algo "cuesta de más" o que "le cobraron mal" — el precio depende de lo que se eligió.
- Cuando alguien pregunte "¿qué cobra extra?" menciona las 4 elecciones (armazón, graduación, material, tratamientos), no solo tratamientos.
- Si un cliente pregunta por precio exacto o precio "desde": NO des un número. Dile que depende de lo que elija (armazón + graduación + material) y que en sucursal le dan cotización personalizada.
- NUNCA inventes promociones que no estén listadas arriba. Solo comunica la promoción vigente actual, tal como aparece. No menciones promos pasadas ni futuras.
- El ADICIONAL de $499 (lente solar graduado) es un PAR EXTRA dentro de la promo 2x1 — su armazón solar y graduación sencilla sí vienen incluidos en ese precio fijo de $499 (porque es un producto empacado aparte, no la promo 2x1 principal).

PRODUCTOS Y SERVICIOS:
👓 Armazones (desde $300)
👁️ Lentes oftálmicos con tratamientos
🕶️ Lentes de contacto (ver precios abajo)
🛍️ Accesorios ópticos, lentes clip-on solar

PRECIOS LENTES DE CONTACTO (por caja, precios REALES — NUNCA inventes precios diferentes):
Tóricos (astigmatismo): Air Optix $1,420 | Dailies AquaComfort Plus $1,439 | Precision1 $1,700 | Acuvue Oasys $1,754 | Air Optix Hydraglyde $1,840 | B+L Ultra $1,938 | Biomedics $2,045 | Biofinity $2,064 | Total30 $2,200 | Dailies Total 1 $2,300 | Biofinity XR $3,820
Esféricos: O2 Optix $799 | Dailies AquaComfort Plus $859 | Lenticon Anual $880 | SofLens 59 $890 | Air Optix Hydraglyde $1,040 | B+L Ultra $1,139 | Acuvue Oasys $1,215 | Precision1 $1,400 | Acuvue Oasys 1 Day $1,500 | Biofinity $1,579 | Total30 $1,800 | Dailies Total 1 $1,900
Multifocales: Dailies AquaComfort Plus $1,879 | Acuvue Oasys $2,500 | Dailies Total 1 $2,500 | B+L Ultra $2,960 | Air Optix Hydraglyde $2,999 | Biofinity $3,175 | Total30 $3,200
Color: Start Colors $380 | Air Optix Colors $699
REGLA: usa SOLO estos precios. Si no encuentras el producto exacto, di "te cotizo en sucursal" — NUNCA inventes un precio.
👨‍⚕️ Examen de la vista GRATUITO (incluido al comprar lentes con armazón o lentes de contacto)
⏱️ Tiempo de entrega: desde 35 minutos hasta 48 horas según el tipo de lente
⚠️ DOMINGOS: el laboratorio NO trabaja. Si preguntan si sus lentes pueden estar el mismo día domingo, NO lo afirmes. Sugiere que lo más pronto sería el lunes, sin prometer. Esto aplica tanto para armazones con graduación como para lentes de contacto sobre pedido.
NUNCA prometas tiempos de entrega exactos — sugiere estimados sin afirmar ("lo más pronto podría ser el lunes", "normalmente están listos en X tiempo")

CONVERSIÓN RX OFTÁLMICA → LENTES DE CONTACTO:
La graduación de una receta oftálmica (armazón) NO es igual a la de LC. Reglas:
1. Los LC tóricos vienen en pasos de CYL: la mayoría en -0.75, -1.25, -1.75, -2.25, -2.75.
2. Si el CYL del paciente es -1.50, el LC tórico más cercano es -1.25 o -1.75 — AMBOS son válidos (el optometrista decide).
3. NUNCA digas que una graduación "no está disponible" si cae dentro del rango del producto. Se ajusta al step más cercano en sucursal.
4. SIEMPRE di "en sucursal te hacen el ajuste fino de graduación para LC" — tú solo das opciones de precio y marca.

FORMAS DE PAGO:
Efectivo, tarjetas débito/crédito (Visa, MC, Amex), transferencia bancaria, Aplazo (pagos a plazos sin tarjeta)
Abonos en línea: https://clip.mx/@caryera

APLAZO — COMPRA AHORA, PAGA DESPUÉS (sin tarjeta de crédito):
Aplazo es un sistema externo de pagos a plazos. El cliente lo usa como medio de pago, igual que tarjeta o efectivo.
Cómo funciona:
1. El cliente se registra ANTES de venir a la óptica en: https://customer.aplazo.mx/register/credentials (o descarga la app "Aplazo" en su celular)
2. Una vez aprobado, visita cualquiera de nuestras sucursales y al pagar selecciona Aplazo
3. Paga en 5 parcialidades QUINCENALES — la PRIMERA se paga AL MOMENTO de la compra (20% del total) y las 4 restantes cada 15 días
IMPORTANTE para Clari — qué decir y qué NO decir sobre Aplazo:
- Si preguntan cómo funciona en general: explica que son 5 quincenas (1 al momento + 4 más) y manda el link de registro
- Si preguntan si necesita ENGANCHE: SÍ — el primer pago de los 5 se cobra al momento de la compra (es como un 20% inicial). NUNCA digas que "no necesita enganche"
- Si preguntan por requisitos generales: solo INE, sin tarjeta de crédito ni historial crediticio
- Clari NO es soporte de Aplazo. Para CUALQUIER duda específica del proceso de Aplazo (cómo registrarse, qué les piden, si les autorizaron, si necesitan tarjeta, qué hacer con el NIP, dónde llega la respuesta, por qué no avanza, etc.) responde: "Esas dudas las resuelve directo Aplazo desde su app o página — yo no manejo el proceso interno. Una vez aprobado, vienes con tu NIP a sucursal y nosotros cobramos." NO inventes pasos del registro, NO afirmes qué documentos pide Aplazo, NO digas dónde llega la aprobación.

GARANTÍA: Todas las compras incluyen garantía. Examen de vista con garantía hasta 40 días.

REGLAS IMPORTANTES:
1. EXAMEN DE VISTA: Gratuito al comprar lentes (con armazón O lentes de contacto). NO ofrezcas examen solo ni receta sin compra.
2. SERVICIO A DOMICILIO: No lo ofrecemos. El servicio a domicilio no es una práctica ética en optometría.
3. CURRÍCULUM: admon.caryera@gmail.com (solo optometristas certificados)
4. HORARIO Y ESPERAR AL CLIENTE: NUNCA digas "te esperamos", "date prisa", "alcanzas a llegar", ni prometas que el personal esperará al cliente. Si preguntan si alcanzan cerca de la hora de cierre, di: "El horario es hasta las 7pm (o 5pm domingos). Te recomiendo llegar con tiempo suficiente." NUNCA asegures que "sí alcanza".
5. RECOGIDA POR OTRA PERSONA: Si preguntan si alguien más puede recoger los lentes en su lugar, la respuesta es SÍ. Solo necesita mostrar el ticket de compra o decir el folio del pedido. NO pidas INE, carta poder, ni ningún otro documento — eso NO es necesario. Es un trámite simple.`;

// ── SUPABASE HELPERS ──
async function supaFetch(path, opts) {
  if (!SERVICE_KEY) return null;
  opts = opts || {};
  var res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation'
    },
    body: opts.body || undefined
  });
  if (!res.ok) return null;
  var text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch(e) { return null; }
}

// ── CHECK IF BOT IS DISABLED FOR A CONVERSATION ──
const BOT_OFF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function isBotDisabled(senderId) {
  try {
    var cfg = await supaFetch('app_config?id=eq.bot_disabled_conversations&select=value');
    if (!cfg || !cfg[0] || !cfg[0].value) return false;
    var map = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
    if (Array.isArray(map)) return map.indexOf(String(senderId)) !== -1;
    if (typeof map !== 'object') return false;
    var ts = map[String(senderId)];
    if (!ts) return false;
    if (Date.now() - ts > BOT_OFF_TTL_MS) {
      delete map[String(senderId)];
      try { await supaFetch('app_config?id=eq.bot_disabled_conversations', { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(map) }), prefer: 'return=minimal' }); } catch(e2) {}
      console.log('[Meta Bot Auto-Reactivated] ' + senderId);
      return false;
    }
    return true;
  } catch(e) { return false; }
}

async function disableBotForPhone(phone) {
  try {
    var cfg = await supaFetch('app_config?id=eq.bot_disabled_conversations&select=value');
    var map = {};
    if (cfg && cfg[0] && cfg[0].value) {
      map = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      if (Array.isArray(map)) { var obj = {}; map.forEach(function(p) { obj[p] = Date.now(); }); map = obj; }
    }
    map[String(phone)] = Date.now();
    await supaFetch('app_config?id=eq.bot_disabled_conversations', { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(map) }), prefer: 'return=minimal' });
  } catch(e) { console.error('[Meta Bot Disable Error]', e.message); }
}

const COMPLAINT_KEYWORDS = [
  'queja', 'quejar', 'molest', 'enojad', 'enojar', 'inconform', 'mal servicio',
  'mal trato', 'maltrato', 'mala atencion', 'mala atención', 'pesimo', 'pésimo',
  'no me atendieron', 'nadie me atendio', 'nadie me atendió', 'cerrado',
  'no habia nadie', 'no había nadie', 'demanda', 'demandar', 'profeco',
  'abuso', 'robo', 'robaron', 'estafa', 'engaño', 'engaña', 'engañar', 'engañaron', 'engañad', 'falta de respeto',
  'grosero', 'grosera', 'prepotente', 'negligencia', 'irresponsab',
  'nunca vuelvo', 'no vuelvo', 'no regreso', 'horrible', 'terrible', 'asqueroso',
  'basura', 'porqueria', 'porquería', 'incompetent'
];

function isComplaintMessage(text) {
  if (!text) return false;
  var lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return COMPLAINT_KEYWORDS.some(function(kw) {
    return lower.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  });
}

async function getClariConfig() {
  try {
    var data = await supaFetch('app_config?id=eq.clari_config&select=value');
    if (data && data[0] && data[0].value) {
      var v = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
      return { personality: v.personality || DEFAULT_PERSONALITY, knowledge: v.knowledge || DEFAULT_KNOWLEDGE, promo_override: v.promo_override || '' };
    }
  } catch(e) { console.error('[Meta Config Error]', e); }
  return { personality: DEFAULT_PERSONALITY, knowledge: DEFAULT_KNOWLEDGE, promo_override: '' };
}

// ── ORDER STATUS LOOKUP ──
async function lookupOrdersByText(text) {
  // Try by folio
  var folioMatch = text.match(/\b(\d{4,6})\b/);
  if (folioMatch) {
    var folio = folioMatch[1];
    var byFolio = await supaFetch('ordenes_laboratorio?notas_laboratorio=ilike.*Folio: ' + folio + '*&select=*,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=5');
    if (byFolio && byFolio.length > 0) return byFolio;
  }
  // Try by name (filter stopwords to find actual name words)
  var _stopwords = ['esta','estan','están','nombre','llamo','soy','hola','buenos','buenas','dias','días','tardes','noches','mis','lentes','pedido','orden','folio','quiero','saber','confirmar','recoger','para','que','los','las','por','favor','con','del','una','unos','como','donde','dónde','cuando','cuándo','tiene','tienen','puede','solo','solo','gracias','sobre','bajo','pendiente','pagar','debo','saldo','adeudo','abono','cobro','liquidar','cuánto','cuanto','queda','tengo','quería','querría','comunico'];
  var nameWords = text.replace(/[^\wáéíóúñü\s]/gi, '').split(/\s+/).filter(function(w) {
    return w.length >= 3 && _stopwords.indexOf(w.toLowerCase()) === -1;
  });
  if (nameWords.length >= 1) {
    for (var i = 0; i < Math.min(nameWords.length, 2); i++) {
      var word = nameWords[i];
      var byName = await supaFetch('pacientes?or=(nombre.ilike.*' + word + '*,apellidos.ilike.*' + word + '*)&select=id,nombre,apellidos&limit=10');
      if (byName && byName.length > 0 && byName.length <= 8) {
        var nameIds = byName.map(function(p) { return p.id; });
        var nameOrders = await supaFetch('ordenes_laboratorio?paciente_id=in.(' + nameIds.join(',') + ')&estado_lab=neq.Entregado&select=*,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=5');
        if (nameOrders && nameOrders.length > 0) return nameOrders;
      }
    }
  }
  return null;
}

function formatOrders(orders) {
  return orders.map(function(o) {
    var nombre = o.pacientes ? (o.pacientes.nombre + ' ' + (o.pacientes.apellidos || '')).trim() : 'Cliente';
    var notas = o.notas_laboratorio || '';
    var folio = (notas.match(/Folio: ([^\s|]+)/) || [])[1] || 'S/N';
    var estado = o.estado_lab || 'Desconocido';
    var statusInfo = STATUS_MAP[estado] || { emoji: '📋', msg: 'Tu pedido está siendo procesado.' };
    var sucursal = o.sucursal || '';
    var fecha = new Date(o.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    // Enrich with venta or SICAR credit data
    var baseFolio = folio.replace(/-\d+$/, '');
    var result = { nombre, folio, estado, emoji: statusInfo.emoji, mensaje_cliente: statusInfo.msg, sucursal, fecha };
    if (o._ventaData) {
      result.total_venta = o._ventaData.total;
      result.pagado = o._ventaData.pagado;
      result.saldo = o._ventaData.saldo;
      result.estado_pago = o._ventaData.estado;
    }
    return result;
  });
}

// Enrich orders with venta/credit data and return SICAR credits
async function enrichOrdersWithSales(orders) {
  if (!orders || orders.length === 0) return { orders: orders, sicarCredits: [] };
  var folios = orders.map(function(o) {
    return (o.notas_laboratorio || '').match(/Folio: ([^\s|]+)/);
  }).filter(Boolean).map(function(m) { return m[1]; });
  var baseFolios = {};
  folios.forEach(function(f) { baseFolios[f.replace(/-\d+$/, '')] = true; });
  var baseKeys = Object.keys(baseFolios);
  for (var i = 0; i < baseKeys.length; i++) {
    var bf = baseKeys[i];
    var ventas = await supaFetch('ventas?folio=eq.' + bf + '&select=folio,total,pagado,saldo,estado&limit=1');
    if (ventas && ventas.length > 0) {
      orders.forEach(function(o) {
        var f = ((o.notas_laboratorio || '').match(/Folio: ([^\s|]+)/) || [])[1] || '';
        if (f.replace(/-\d+$/, '') === bf) o._ventaData = ventas[0];
      });
    } else {
      // Check SICAR credits
      var credit = await supaFetch('creditos_clientes?folio_sicar=eq.' + bf + '&saldo=gt.0&select=folio_sicar,total,total_abonos,saldo,sucursal,fecha_vencimiento&limit=1');
      if (credit && credit.length > 0) {
        orders.forEach(function(o) {
          var f = ((o.notas_laboratorio || '').match(/Folio: ([^\s|]+)/) || [])[1] || '';
          if (f.replace(/-\d+$/, '') === bf) o._ventaData = { total: credit[0].total, pagado: credit[0].total_abonos || 0, saldo: credit[0].saldo, estado: 'Crédito SICAR pendiente' };
        });
      }
    }
  }
  return { orders: orders, sicarCredits: [] };
}

function isAskingAboutOrder(text) {
  var lower = text.toLowerCase();
  var keywords = ['pedido', 'orden', 'listo', 'listos', 'lentes', 'status', 'estado', 'entrega', 'recoger', 'folio', 'cuando', 'cuándo', 'demora', 'tarda', 'avance', 'proceso', 'ya están', 'ya estan', 'ya mero', 'falta', 'tiempo', 'pagar', 'debo', 'pendiente', 'saldo', 'adeudo', 'abono', 'cobro', 'cuánto debo', 'cuanto debo', 'liquidar'];
  return keywords.some(function(kw) { return lower.includes(kw); }) || /\b\d{4,6}\b/.test(text);
}

// ── CONVERSATION HISTORY (uses senderId as phone to keep it simple) ──
async function getConversationHistory(senderId) {
  if (!SERVICE_KEY) return [];
  try {
    var data = await supaFetch('clari_conversations?phone=eq.' + senderId + '&select=role,content,created_at&order=created_at.desc&limit=10');
    if (!data) return [];
    return data.reverse().map(function(m) { return { role: m.role, content: m.content }; });
  } catch(e) { return []; }
}

async function saveMessage(senderId, role, content, userName, channel) {
  if (!SERVICE_KEY) return;
  try {
    await supaFetch('clari_conversations', {
      method: 'POST',
      body: JSON.stringify({
        phone: senderId,
        role: role,
        content: content,
        user_name: userName || ('clari-' + channel)
      }),
      prefer: 'return=minimal'
    });
  } catch(e) { console.error('[Meta Save Error]', e); }
}

// ── AI RESPONSE ──
async function getAIResponse(userMessage, userName, senderId, channel) {
  var config = await getClariConfig();
  var channelNote = channel === 'instagram' ? 'Respondes por Instagram DM.' : 'Respondes por Facebook Messenger.';
  var nowMx = new Date().toLocaleString('es-MX', { timeZone: 'America/Chihuahua', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  // Inject dynamic promos into knowledge (promo_override takes priority)
  var promoText = config.promo_override || getActivePromos();
  var knowledgeWithPromos = config.knowledge.replace('{{PROMOS_PLACEHOLDER}}', promoText);
  var systemPrompt = config.personality.replace(/Respondes por WhatsApp\.?/, channelNote) + '\n\nFECHA Y HORA ACTUAL: ' + nowMx + '\nUsa esta información para responder preguntas sobre horarios (ej: si es domingo, el horario es 11am-5pm, no 10am-7pm).\n\nINFORMACIÓN DEL NEGOCIO:\n' + knowledgeWithPromos;

  // Order lookup (by text only — no phone number available from Messenger/IG)
  var orderContext = '';
  if (isAskingAboutOrder(userMessage)) {
    var orders = await lookupOrdersByText(userMessage);
    if (orders && orders.length > 0) {
      await enrichOrdersWithSales(orders);
      var formatted = formatOrders(orders);
      orderContext = '\n\nPEDIDOS ENCONTRADOS:\n';
      var shownSale = {};
      formatted.forEach(function(o, i) {
        orderContext += (i + 1) + '. ' + o.nombre + ' — Folio: ' + o.folio + '\n';
        orderContext += '   Estado: ' + o.emoji + ' ' + o.mensaje_cliente + '\n';
        orderContext += '   Sucursal: ' + o.sucursal + ' | Fecha: ' + o.fecha + '\n';
        var baseFolio = o.folio.replace(/-\d+$/, '');
        if (o.total_venta && !shownSale[baseFolio]) {
          shownSale[baseFolio] = true;
          orderContext += '   Venta folio ' + baseFolio + ': Total $' + Number(o.total_venta).toLocaleString('es-MX') + ' | Pagado $' + Number(o.pagado).toLocaleString('es-MX') + ' | Saldo $' + Number(o.saldo).toLocaleString('es-MX') + ' | ' + o.estado_pago + '\n';
        }
      });
      orderContext += '\nINSTRUCCIONES PEDIDOS:\n' +
        '- USA el mensaje_cliente como base. NUNCA digas que están listos a menos que el estado sea "Recibido en óptica" o "Listo para entrega".\n' +
        '- Si están listos, dile que pase a recogerlos a la sucursal (solo el nombre, ej: "Magnolia").\n' +
        '- El cliente YA ES CLIENTE — NO dar direcciones, referencias, horarios ni teléfonos. Ya sabe dónde queda.\n' +
        '- Si la venta está Liquidada y lentes listos, confirma que puede pasar a recogerlos.\n' +
        '- PROHIBIDO decir "contacta a la sucursal" o "llama". TÚ tienes la información.\n' +
        '- Si el cliente dice que recibió un mensaje avisando que están listos, confirma que somos nosotros (Ópticas Car & Era).\n' +
        '- Si hay saldo pendiente (saldo > 0), menciónalo amablemente.\n' +
        '- No uses markdown. Sé breve (1-3 líneas).';
    } else {
      orderContext = '\n\nBÚSQUEDA DE PEDIDO: No se encontraron pedidos con esa información.\n' +
        'INSTRUCCIONES (seguir en orden):\n' +
        '1. Si dio solo nombre: pide NÚMERO DE FOLIO (en su ticket) o TELÉFONO registrado en la compra.\n' +
        '2. Si ya dio nombre Y folio/teléfono sin resultados: puede estar registrado con otro dato. Pregunta si tiene su ticket.\n' +
        '3. ÚLTIMO RECURSO (2+ intentos fallidos): invítalo a pasar a sucursal (solo el nombre, sin direcciones — ya es cliente).\n' +
        '4. Si dice que recibió mensaje de lentes listos: confirma que SÍ somos nosotros (Ópticas Car & Era). Pide folio para verificar.\n' +
        '5. NUNCA dar direcciones ni referencias a quien pregunta por su pedido — ya es cliente.';
    }
    systemPrompt += orderContext;
  }

  // Magnolia location context — for people arriving from Facebook Ads
  systemPrompt += '\n\nUBICACIÓN MAGNOLIA (para quienes pregunten cómo llegar):\n' +
    'Si alguien pregunta por Magnolia, cómo llegar, dónde queda, o menciona que vio un anuncio de Magnolia:\n' +
    '- Está en Av. Manuel J. Clouthier (Jilotepec), casi a la altura de Plaza El Reloj\n' +
    '- Frente a Tostadas El Primo, en una plaza nueva donde está Helados Trevly\n' +
    '- Link Google Maps: https://maps.app.goo.gl/HBomFDEfJJNPna697\n' +
    '- SIEMPRE envía el link de Google Maps cuando pregunten ubicación de Magnolia\n' +
    '- Promo: usa la promoción vigente actual (la que aparece en PROMOCIÓN VIGENTE arriba) + Examen de vista incluido al comprar lentes (armazón o LC)\n' +
    '- Lentes listos en 35 minutos\n' +
    '- Tel: (656) 174-8866\n' +
    '- Si el cliente se muestra desinteresado o molesto, agradece amablemente y no insistas';

  var history = await getConversationHistory(senderId);
  var messages = [];
  for (var i = 0; i < history.length; i++) {
    messages.push({ role: history[i].role, content: history[i].content });
  }
  var greeting = userName ? '[Cliente: ' + userName + ' vía ' + channel + '] ' : '[Vía ' + channel + '] ';
  messages.push({ role: 'user', content: greeting + userMessage });

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      system: systemPrompt,
      messages: messages
    })
  });

  var data = await res.json();
  if (!res.ok) {
    console.error('[Meta AI Error]', data);
    return '¡Hola! 👋 En este momento tengo una pequeña dificultad técnica. Te invito a llamar directamente a cualquiera de nuestras sucursales para atenderte. 🙏';
  }

  var textBlock = data.content ? data.content.find(function(b) { return b.type === 'text'; }) : null;
  var reply = (textBlock && textBlock.text) ? textBlock.text : 'Gracias por tu mensaje 😊 Un momento por favor...';

  await saveMessage(senderId, 'user', greeting + userMessage, userName, channel);
  await saveMessage(senderId, 'assistant', reply, null, channel);

  return reply;
}

// ── SEND REPLY VIA META GRAPH API ──
async function sendMetaReply(recipientId, text, channel) {
  if (!META_PAGE_TOKEN) {
    console.error('[Meta] No PAGE_TOKEN configured');
    return false;
  }

  // Split long messages (Messenger has 2000 char limit)
  var chunks = [];
  var remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 1900) { chunks.push(remaining); break; }
    var breakAt = remaining.lastIndexOf('\n', 1900);
    if (breakAt < 500) breakAt = remaining.lastIndexOf('. ', 1900);
    if (breakAt < 500) breakAt = 1900;
    chunks.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt).trim();
  }

  for (var i = 0; i < chunks.length; i++) {
    // For Instagram, use the Instagram Graph API endpoint
    var endpoint = channel === 'instagram'
      ? GRAPH_API + '/me/messages'
      : GRAPH_API + '/me/messages';

    var res = await fetch(endpoint + '?access_token=' + META_PAGE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: chunks[i] },
        messaging_type: 'RESPONSE'
      })
    });

    if (!res.ok) {
      var err = await res.text();
      console.error('[Meta Send Error]', err);
      return false;
    }
  }
  return true;
}

// ── NOTIFY ADMIN VIA WHATSAPP ──
async function notifyAdmin(senderName, channel, messageText) {
  // Optional: notify admin phones about new Messenger/IG messages
  // Uses existing whatsapp.js function pattern
  try {
    var cfgData = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
    if (!cfgData || !cfgData[0]) return;
    var cfg = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
    var adminPhones = cfg.admin_phones || [];
    if (adminPhones.length === 0) return;

    var icon = channel === 'instagram' ? '📸' : '💬';
    var preview = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;
    var msg = icon + ' Nuevo mensaje ' + channel.toUpperCase() + '\n'
            + '👤 ' + (senderName || 'Usuario') + '\n'
            + '💬 ' + preview;

    // Send to first admin only (avoid spam)
    var TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
    var TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    var TWILIO_WA = process.env.TWILIO_WA_NUMBER;
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA) return;

    var auth = 'Basic ' + Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');
    var phone = adminPhones[0].replace(/[\s\-\(\)\+]/g, '');
    if (phone.length === 10) phone = '521' + phone;

    var params = new URLSearchParams();
    params.append('From', TWILIO_WA.startsWith('whatsapp:') ? TWILIO_WA : 'whatsapp:' + TWILIO_WA);
    params.append('To', 'whatsapp:+' + phone);
    params.append('Body', msg);

    await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } catch(e) { console.error('[Meta AdminNotify]', e.message); }
}

// ── GET SENDER PROFILE ──
async function getSenderProfile(senderId, channel) {
  try {
    var fields = channel === 'instagram' ? 'name,username' : 'first_name,last_name';
    var res = await fetch(GRAPH_API + '/' + senderId + '?fields=' + fields + '&access_token=' + META_PAGE_TOKEN);
    if (res.ok) {
      var data = await res.json();
      if (channel === 'instagram') return data.name || data.username || null;
      return ((data.first_name || '') + ' ' + (data.last_name || '')).trim() || null;
    }
  } catch(e) { console.error('[Meta Profile]', e.message); }
  return null;
}

// ── COMMENT AUTO-REPLY ──
// Public reply: smart but brief. DM: full detailed response.

async function generatePublicReply(commentText) {
  if (!ANTHROPIC_API_KEY) return '¡Hola! 👓 Te mandamos un mensaje directo con más info ✨';
  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `Eres Clari, asistente de Ópticas Car & Era en Ciudad Juárez. Genera una respuesta PÚBLICA para un comentario en redes sociales.

REGLAS ESTRICTAS:
- Máximo 3-4 líneas, breve pero informativo
- Responde lo básico del comentario (horario, ubicación, etc.)
- Si preguntan ubicación, SIEMPRE menciona las 3 sucursales con su zona
- Siempre termina invitando a revisar su DM para más detalles
- Usa 1-2 emojis máximo (👓 ✨ 👋)
- NO uses markdown, NO uses listas con guiones
- Tono amigable y profesional
- NO des precios ni promos en público (eso va en el DM)

DATOS BÁSICOS:
Horario: Lun-Sáb 10am-7pm, Dom 11am-5pm
Sucursales: Plaza de las Américas (Zona Pronaf), Plaza Pinocelli (Miguel de la Madrid), Plaza Magnolia (Jilotepec, casi a la altura de Plaza El Reloj, frente a Tostadas El Primo, donde está Helados Trevly) — Ciudad Juárez
Examen de vista incluido al comprar lentes (armazón o lentes de contacto)
Lentes listos desde 35 min
No se necesita cita`,
        messages: [{ role: 'user', content: 'Comentario: "' + commentText + '"' }]
      })
    });
    var data = await res.json();
    if (res.ok && data.content && data.content[0]) {
      return data.content[0].text;
    }
  } catch(e) { console.error('[Meta PublicReply AI]', e.message); }
  return '¡Hola! 👓 Te mandamos un mensaje directo con más info ✨';
}

async function replyToComment(commentId, text, channel) {
  if (!META_PAGE_TOKEN) return false;
  try {
    // Instagram uses /replies, Facebook uses /comments
    var subpath = channel === 'instagram' ? '/replies' : '/comments';
    var params = new URLSearchParams({ message: text, access_token: META_PAGE_TOKEN });
    var url = GRAPH_API + '/' + commentId + subpath;
    console.log('[Meta Reply] POST ' + channel + ' to ' + url.replace(META_PAGE_TOKEN, '***'));
    var res = await fetch(url, {
      method: 'POST',
      body: params
    });
    if (res.ok) {
      console.log('[Meta Reply] Success for ' + channel + ' comment ' + commentId);
      return true;
    }
    var err = await res.text();
    console.error('[Meta Reply Error]', channel, res.status, err.substring(0, 400));
    return false;
  } catch(e) { console.error('[Meta Comment Reply Exception]', e.message); return false; }
}

async function sendPrivateReplyFromComment(commentId, text, channel) {
  if (!META_PAGE_TOKEN) return false;
  try {
    var endpoint = GRAPH_API + '/me/messages?access_token=' + META_PAGE_TOKEN;
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: text },
        messaging_type: 'RESPONSE'
      })
    });
    if (!res.ok) {
      var err = await res.text();
      console.error('[Meta Private Reply Error]', err);
      return false;
    }
    return true;
  } catch(e) { console.error('[Meta Private Reply]', e.message); return false; }
}

async function handleComment(commentData, channel) {
  var commentId = commentData.id || commentData.comment_id;
  var commentText = commentData.text || commentData.message || '';
  var fromId = commentData.from ? commentData.from.id : 'unknown';
  var fromName = commentData.from ? (commentData.from.name || commentData.from.username || 'Usuario') : 'Usuario';

  if (!commentId) return;

  // Skip comments from our own page (only if we know the sender)
  if (fromId && (fromId === FB_PAGE_ID || fromId === IG_ACCOUNT_ID)) return;

  // Skip very short comments (emojis only, single chars)
  if (commentText.replace(/[\s\p{Emoji}]/gu, '').length < 2 && commentText.length < 5) return;

  // Check if already replied to this comment
  var existing = await supaFetch('clari_conversations?content=eq.[FB-Comment:' + commentId + ']&select=id&limit=1');
  if (existing && existing.length > 0) return;

  console.log('[Meta] ' + channel + ' comment from ' + fromName + ': ' + commentText.substring(0, 50));

  // 1. Generate smart brief public reply based on comment
  var publicReply = await generatePublicReply(commentText);
  var replied = await replyToComment(commentId, publicReply, channel);
  console.log('[Meta] Public reply to ' + channel + ' comment ' + commentId + ': ' + (replied ? 'OK' : 'FAILED'));

  // 2. Track this comment as replied (only if reply succeeded)
  if (replied) {
    await saveMessage('comment-' + fromId, 'assistant', '[FB-Comment:' + commentId + ']', fromName, channel);
  }

  // 3. Send DM via private reply (linked to the comment) — skip DM since Meta already sends the comment as a message
  // The DM response is handled by the messaging webhook handler automatically
}

// ── POLL FOR UNANSWERED COMMENTS (FB feed + IG media) ──
async function checkRecentComments() {
  if (!META_PAGE_TOKEN) { console.log('[Meta Comments] No PAGE_TOKEN — skipping'); return; }
  var startTime = Date.now();
  var replied = 0;
  var MAX_REPLIES_PER_RUN = 5;
  var ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  var skippedDedup = 0, skippedShort = 0, skippedOld = 0;

  try {
    // ── 1. Facebook organic posts ──
    var allComments = []; // { id, message, created_time, channel }
    try {
      var feedUrl = GRAPH_API + '/' + FB_PAGE_ID + '/feed?fields=id,created_time,comments.summary(true).limit(25){id,message,created_time}&limit=30&access_token=' + META_PAGE_TOKEN;
      var postsRes = await fetch(feedUrl);
      if (postsRes.ok) {
        var postsData = await postsRes.json();
        var fbPosts = 0;
        for (var p = 0; p < (postsData.data || []).length; p++) {
          var post = postsData.data[p];
          if (Date.now() - new Date(post.created_time).getTime() > ONE_WEEK) continue;
          if (!post.comments || !post.comments.data) continue;
          fbPosts++;
          for (var c = 0; c < post.comments.data.length; c++) {
            var fc = post.comments.data[c];
            fc.channel = 'messenger';
            allComments.push(fc);
          }
        }
        console.log('[Meta Comments] FB: ' + allComments.length + ' comments from ' + fbPosts + ' posts');
      } else {
        console.error('[Meta Comments] FB feed failed:', postsRes.status);
      }
    } catch(e) { console.error('[Meta Comments] FB error:', e.message); }

    // ── 2. Instagram media comments ──
    // IG posts can be old but have recent comments — use 30 days for posts, filter comments by 1 week
    var ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    try {
      var igUrl = GRAPH_API + '/' + IG_ACCOUNT_ID + '/media?fields=id,timestamp,comments_count&limit=15&access_token=' + META_PAGE_TOKEN;
      var igRes = await fetch(igUrl);
      if (igRes.ok) {
        var igData = await igRes.json();
        var igPosts = 0;
        for (var ip = 0; ip < (igData.data || []).length; ip++) {
          if (Date.now() - startTime > 5000) break; // time guard
          var igPost = igData.data[ip];
          if (Date.now() - new Date(igPost.timestamp).getTime() > ONE_MONTH) continue;
          if (!igPost.comments_count || igPost.comments_count === 0) continue;
          // Fetch comments for this IG post
          var igCommUrl = GRAPH_API + '/' + igPost.id + '/comments?fields=id,text,username,timestamp&limit=25&access_token=' + META_PAGE_TOKEN;
          var igCommRes = await fetch(igCommUrl);
          if (igCommRes.ok) {
            var igCommData = await igCommRes.json();
            igPosts++;
            for (var ic = 0; ic < (igCommData.data || []).length; ic++) {
              var igc = igCommData.data[ic];
              // Normalize IG fields to match FB structure
              allComments.push({
                id: igc.id,
                message: igc.text,
                created_time: igc.timestamp,
                channel: 'instagram',
                username: igc.username
              });
            }
          }
        }
        console.log('[Meta Comments] IG: ' + (allComments.length - allComments.filter(function(x){return x.channel==='messenger';}).length) + ' comments from ' + igPosts + ' posts');
      } else {
        console.error('[Meta Comments] IG media failed:', igRes.status);
      }
    } catch(e) { console.error('[Meta Comments] IG error:', e.message); }

    console.log('[Meta Comments] Total: ' + allComments.length + ' comments to process');
    if (!allComments.length) return;

    // ── 3. Process all comments ──
    for (var i = 0; i < allComments.length && replied < MAX_REPLIES_PER_RUN; i++) {
      if (Date.now() - startTime > 7000) {
        console.log('[Meta Comments] Timeout guard — stopping after ' + replied + ' replies');
        break;
      }

      var comment = allComments[i];
      if (!comment.message) continue;

      // Skip old comments
      if (Date.now() - new Date(comment.created_time).getTime() > ONE_WEEK) { skippedOld++; continue; }

      // Skip very short comments
      if (comment.message.replace(/[\s\p{Emoji}]/gu, '').length < 2 && comment.message.length < 5) { skippedShort++; continue; }

      // Dedup
      var existing = await supaFetch('clari_conversations?content=eq.[FB-Comment:' + comment.id + ']&select=id&limit=1');
      if (existing && existing.length > 0) { skippedDedup++; continue; }

      var ch = comment.channel || 'messenger';
      console.log('[Meta Comments] Replying to ' + ch + ': "' + comment.message.substring(0, 60) + '" (id:' + comment.id + ')');
      await handleComment({
        id: comment.id,
        message: comment.message,
        from: comment.username ? { username: comment.username } : null
      }, ch);
      replied++;
    }
    console.log('[Meta Comments] Done: ' + replied + ' new, ' + skippedDedup + ' dedup, ' + skippedShort + ' short, ' + skippedOld + ' old (' + (Date.now() - startTime) + 'ms)');
  } catch(e) { console.error('[Meta Comments] Error:', e.message, e.stack ? e.stack.substring(0, 200) : ''); }
}

// ── DIAGNOSTIC: test comment checking manually ──
// GET /meta-webhook?diag=comments&token=clari_caryera_2026
// GET /meta-webhook?diag=full&token=clari_caryera_2026  (complete diagnostic)
async function diagComments(mode) {
  if (!META_PAGE_TOKEN) return { error: 'No META_PAGE_TOKEN' };
  var result = {};
  try {
    // 1. Check token permissions (use page-level debug)
    try {
      var permRes = await fetch(GRAPH_API + '/me/permissions?access_token=' + META_PAGE_TOKEN);
      var permText = await permRes.text();
      try {
        var permData = JSON.parse(permText);
        if (permData.data) {
          result.permissions = (permData.data || []).filter(function(p) { return p.status === 'granted'; }).map(function(p) { return p.permission; });
          result.declined_permissions = (permData.data || []).filter(function(p) { return p.status !== 'granted'; }).map(function(p) { return p.permission + ':' + p.status; });
        } else {
          result.permissions_error = permText.substring(0, 300);
        }
      } catch(pe) { result.permissions_error = permText.substring(0, 300); }
    } catch(e) { result.permissions_error = e.message; }

    // 1b. Check token info via debug endpoint
    try {
      var debugRes = await fetch(GRAPH_API + '/debug_token?input_token=' + META_PAGE_TOKEN + '&access_token=' + META_PAGE_TOKEN);
      if (debugRes.ok) {
        var debugData = await debugRes.json();
        if (debugData.data) {
          result.token_info = {
            type: debugData.data.type,
            app_id: debugData.data.app_id,
            is_valid: debugData.data.is_valid,
            expires_at: debugData.data.expires_at === 0 ? 'never' : new Date(debugData.data.expires_at * 1000).toISOString(),
            scopes: debugData.data.scopes,
            granular_scopes: (debugData.data.granular_scopes || []).map(function(s) { return s.scope; })
          };
        }
      }
    } catch(e) { result.token_debug_error = e.message; }

    // 2. Feed with inline comments
    var feedUrl = GRAPH_API + '/' + FB_PAGE_ID + '/feed?fields=id,created_time,comments.summary(true).limit(10){id,message,created_time}&limit=5&access_token=' + META_PAGE_TOKEN;
    var postsRes = await fetch(feedUrl);
    if (!postsRes.ok) {
      var errText = await postsRes.text();
      result.feed_error = { status: postsRes.status, detail: errText.substring(0, 300) };
    } else {
      var postsData = await postsRes.json();
      result.posts_in_feed = postsData.data ? postsData.data.length : 0;

      if (postsData.data && postsData.data.length > 0) {
        var firstPost = postsData.data[0];
        result.first_post = {
          id: firstPost.id,
          created_time: firstPost.created_time,
          has_comments_field: !!firstPost.comments,
          comments_count: firstPost.comments ? (firstPost.comments.summary ? firstPost.comments.summary.total_count : 'no summary') : 'no comments field',
          comments_data_length: firstPost.comments && firstPost.comments.data ? firstPost.comments.data.length : 0
        };
      }

      // Count inline comments
      var comments = [];
      for (var p = 0; p < (postsData.data || []).length; p++) {
        var post = postsData.data[p];
        if (!post.comments || !post.comments.data) continue;
        for (var c = 0; c < post.comments.data.length; c++) {
          comments.push({ id: post.comments.data[c].id, message: (post.comments.data[c].message || '').substring(0, 80) });
        }
      }
      result.inline_comments = comments.length;
    }

    // 3. Instagram media + comments
    try {
      var igMediaUrl = GRAPH_API + '/' + IG_ACCOUNT_ID + '/media?fields=id,caption,timestamp,comments_count,like_count&limit=5&access_token=' + META_PAGE_TOKEN;
      var igRes = await fetch(igMediaUrl);
      if (igRes.ok) {
        var igData = await igRes.json();
        result.ig_media = (igData.data || []).map(function(m) {
          return { id: m.id, comments: m.comments_count, likes: m.like_count, date: m.timestamp, caption: (m.caption || '').substring(0, 60) };
        });
        // Get comments on first IG post with comments
        var igPostWithComments = (igData.data || []).find(function(m) { return m.comments_count > 0; });
        if (igPostWithComments) {
          var igCommUrl = GRAPH_API + '/' + igPostWithComments.id + '/comments?fields=id,text,username,timestamp&limit=10&access_token=' + META_PAGE_TOKEN;
          var igCommRes = await fetch(igCommUrl);
          if (igCommRes.ok) {
            var igCommData = await igCommRes.json();
            result.ig_comments_sample = (igCommData.data || []).map(function(c) {
              return { id: c.id, text: (c.text || '').substring(0, 80), user: c.username, date: c.timestamp };
            });
          } else {
            result.ig_comments_error = (await igCommRes.text()).substring(0, 300);
          }
        }
      } else {
        result.ig_media_error = (await igRes.text()).substring(0, 300);
      }
    } catch(e) { result.ig_error = e.message; }

    // 4. Check webhook subscriptions on page
    try {
      var subsRes = await fetch(GRAPH_API + '/' + FB_PAGE_ID + '/subscribed_apps?access_token=' + META_PAGE_TOKEN);
      if (subsRes.ok) {
        var subsData = await subsRes.json();
        result.webhook_subscriptions = (subsData.data || []).map(function(a) {
          return { id: a.id, name: a.name, subscribed_fields: a.subscribed_fields };
        });
      } else {
        result.webhook_subs_error = (await subsRes.text()).substring(0, 300);
      }
    } catch(e) { result.webhook_subs_error = e.message; }

    // 5. Recent Messenger conversations
    try {
      var convRes = await fetch(GRAPH_API + '/' + FB_PAGE_ID + '/conversations?fields=id,updated_time,participants,message_count&platform=instagram&limit=5&access_token=' + META_PAGE_TOKEN);
      if (convRes.ok) {
        var convData = await convRes.json();
        result.ig_conversations = (convData.data || []).map(function(c) {
          return { id: c.id, messages: c.message_count, updated: c.updated_time };
        });
      } else {
        result.ig_conversations_error = (await convRes.text()).substring(0, 300);
      }
    } catch(e) { result.ig_conversations_error = e.message; }

    result.api_version = GRAPH_API;
    return result;
  } catch(e) { result.error = e.message; return result; }
}

// ── MAIN HANDLER ──
exports.handler = async function(event) {
  // Webhook verification (GET request from Meta)
  if (event.httpMethod === 'GET') {
    var qs = event.queryStringParameters || {};

    // Diagnostic endpoint
    if ((qs.diag === 'comments' || qs.diag === 'full') && qs.token === META_VERIFY_TOKEN) {
      var result = await diagComments(qs.diag);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result, null, 2) };
    }

    // Manual send endpoint: GET ?action=send&to=RECIPIENT_ID&msg=TEXT&channel=messenger&token=VERIFY_TOKEN
    if (qs.action === 'send' && qs.to && qs.msg && qs.token === META_VERIFY_TOKEN) {
      var ch = qs.channel || 'messenger';
      var ok = await sendMetaReply(qs.to, decodeURIComponent(qs.msg), ch);
      if (ok) await saveMessage(qs.to, 'assistant', qs.msg, null, 'clari-' + ch);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent: ok }) };
    }

    if (qs['hub.mode'] === 'subscribe' && qs['hub.verify_token'] === META_VERIFY_TOKEN) {
      console.log('[Meta] Webhook verified');
      return { statusCode: 200, body: qs['hub.challenge'] };
    }
    return { statusCode: 403, body: 'Forbidden' };
  }

  // POST — incoming message or comment
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    var body = JSON.parse(event.body || '{}');
    console.log('[Meta] Webhook received: object=' + (body.object || 'unknown') + ', entries=' + (body.entry?.length || 0));

    // Meta sends { object: 'page' or 'instagram', entry: [...] }
    if (!body.entry || !body.entry.length) {
      return { statusCode: 200, body: 'OK' };
    }

    for (var e = 0; e < body.entry.length; e++) {
      var entry = body.entry[e];

      // ── HANDLE DIRECT MESSAGES ──
      var messaging = entry.messaging || [];
      for (var m = 0; m < messaging.length; m++) {
        var msg = messaging[m];

        // Skip non-message events (deliveries, reads, etc.)
        if (!msg.message || !msg.message.text) continue;

        // Skip echo messages (sent by the page itself)
        if (msg.message.is_echo) continue;

        var senderId = msg.sender.id;
        var messageText = msg.message.text;

        // Determine channel
        var channel = body.object === 'instagram' ? 'instagram' : 'messenger';
        console.log('[Meta] ' + channel + ' message from ' + senderId + ': ' + messageText.substring(0, 50));

        // Check if bot is disabled for this conversation
        var botOff = await isBotDisabled(senderId);
        if (botOff) {
          console.log('[Meta] Bot disabled for ' + senderId + ' — saving message only');
          var senderNameOff = await getSenderProfile(senderId, channel);
          await saveMessage(senderId, 'user', '[Vía ' + channel + '] ' + messageText, senderNameOff || 'clari-' + channel);
          continue;
        }

        // Get sender name
        var senderName = await getSenderProfile(senderId, channel);

        // Get AI response
        var reply = await getAIResponse(messageText, senderName, senderId, channel);

        // Send reply
        await sendMetaReply(senderId, reply, channel);

        // ── COMPLAINT DETECTION — notify admin + auto-disable bot ──
        if (isComplaintMessage(messageText)) {
          console.log('[Meta Complaint] ' + channel + ' from ' + senderId + ': ' + messageText.substring(0, 80));
          try {
            var complaintName = senderName || senderId;
            var complaintAlert = '🚨 *QUEJA / CLIENTE MOLESTO (' + channel.toUpperCase() + ')*\n\n'
              + '👤 ' + complaintName + '\n'
              + '📱 ' + senderId + ' (vía ' + channel + ')\n'
              + '💬 "' + messageText.substring(0, 200) + '"\n\n'
              + 'Clari respondió y le dijo que gerencia se comunicará en breve.\n'
              + 'Bot desactivado automáticamente — revisa en el panel de Clari.';
            var TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
            var TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
            var TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || 'whatsapp:+5216563110094';
            if (TWILIO_SID && TWILIO_TOKEN) {
              var alertPhone = '5216564269961';
              var twilioUrl = 'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json';
              await fetch(twilioUrl, {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'From=' + encodeURIComponent(TWILIO_FROM) + '&To=' + encodeURIComponent('whatsapp:+' + alertPhone) + '&Body=' + encodeURIComponent(complaintAlert)
              });
            }
            await disableBotForPhone(senderId);
          } catch(compErr) { console.error('[Meta Complaint Error]', compErr.message); }
        }
      }

      // ── HANDLE COMMENTS (feed changes — if feed webhook works) ──
      var changes = entry.changes || [];
      if (changes.length > 0) console.log('[Meta] Changes received:', JSON.stringify(changes).substring(0, 500));
      for (var c = 0; c < changes.length; c++) {
        var change = changes[c];

        // Facebook comments: field === 'feed', value.item === 'comment', value.verb === 'add'
        if (change.field === 'feed' && change.value && change.value.item === 'comment' && change.value.verb === 'add') {
          await handleComment({
            id: change.value.comment_id,
            message: change.value.message,
            from: change.value.from
          }, 'messenger');
        }

        // Instagram comments: field === 'comments'
        if (change.field === 'comments' && change.value) {
          await handleComment(change.value, 'instagram');
        }
      }
    }

    // ── POLL FOR UNANSWERED COMMENTS (piggyback on webhook calls) ──
    await checkRecentComments();

    return { statusCode: 200, body: 'OK' };

  } catch(err) {
    console.error('[Meta Webhook Error]', err.message);
    return { statusCode: 200, body: 'OK' }; // Always return 200 to Meta
  }
};
