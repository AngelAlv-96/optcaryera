// /.netlify/functions/wa-webhook.js
// WhatsApp Webhook via Twilio — Clari chatbot with AI + order status lookup
// Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WA_NUMBER, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA    = process.env.TWILIO_WA_NUMBER || 'whatsapp:+5216563110094';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://icsnlgeereepesbrdjhf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TWILIO_API_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

function twilioAuth() {
  return 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
}

// ── CUSTOMER-FRIENDLY STATUS MAPPING ──
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
  var month = mx.getMonth() + 1; // 1-based
  var year = mx.getFullYear();

  // Combo headline (2x1 + solar $499 + armazón+micas+AR+UV): Hot Sale 25 may–2 jun, EXTENDIDO todo junio y julio 2026 (en julio con presentación nueva "de verano").
  var comboActive = now >= new Date('2026-05-25T00:00:00-06:00') && now <= new Date('2026-07-31T23:59:59-06:00');
  var esEventoHotSale = comboActive && now <= new Date('2026-06-02T23:59:59-06:00'); // dentro de los 9 días del Hot Sale nombrado
  var esJulio = comboActive && now >= new Date('2026-07-01T00:00:00-06:00'); // julio = misma promo, presentación NUEVA (verano), sin "junio" ni "Hot Sale"
  var hotSaleActive = esEventoHotSale; // (el Hot Sale Aplazo solo existe durante el evento)
  var comboHeader = esEventoHotSale
    ? '🔥 HOT SALE CAR & ERA (25 mayo – 2 junio 2026) — ANÚNCIALA COMO LA PROMO HEADLINE durante estos 9 días, antes que cualquier otra:\n'
    : esJulio
    ? '☀️ PROMOCIÓN DE VERANO — ANÚNCIALA COMO LA PROMO HEADLINE, antes que cualquier otra:\n' +
      '• 🗣️ CÓMO NOMBRARLA: preséntala como "nuestra promoción de verano" o simplemente "la promoción que tenemos ahorita". NO la llames "Hot Sale" ni "promoción de junio" — esos nombres ya pasaron; es el MISMO combo de valor con presentación nueva para julio. Si el cliente menciona el Hot Sale o la promo de junio, confirma con seguridad que la promoción SIGUE vigente ("seguimos con la promoción"), NUNCA digas que terminó.\n'
    : '🎁 PROMOCIÓN DE JUNIO — el MISMO combo del Hot Sale, EXTENDIDO durante TODO junio 2026 — ANÚNCIALA COMO LA PROMO HEADLINE, antes que cualquier otra:\n' +
      '• 🗣️ CÓMO NOMBRARLA SEGÚN EL CONTEXTO: si el cliente menciona el Hot Sale, vio el anuncio del Hot Sale o ya lo conocía → preséntala como EXTENSIÓN ("Extendimos la promo del Hot Sale durante todo junio, sigue vigente"). Si es contexto nuevo/general (no menciona Hot Sale) → preséntala como "nuestra promoción de junio". NUNCA digas que el Hot Sale ya terminó sin aclarar de inmediato que el MISMO combo sigue vigente en junio.\n';
  var comboVigencia = esEventoHotSale ? 'del 25 de mayo al 2 de junio de 2026 (9 días, terminando en martes 2 jun)' : esJulio ? 'durante el verano (vigente en julio de 2026)' : 'durante todo junio de 2026 (hasta el 30 de junio)';
  var hotSaleCarEra = comboActive ? (comboHeader +
    '• Es el 2x1 EN LENTES COMPLETOS: el cliente compra 2 lentes completos y paga solo 1 👓. ⚠️ EL PRECIO DEPENDE de lo que elija (armazón + graduación + material) — NO es un paquete con precio fijo NI con un material/tratamiento específico incluido. ⛔ NUNCA lo presentes como "incluye micas CR-39 + antirreflejante + UV" como si fuera un paquete cerrado: eso confunde y suena a precio fijo. El material y los tratamientos los elige el cliente y cambian el precio.\n' +
    '• ☀️ ADEMÁS un lente solar graduado adicional: GRATIS en compras de $3,000 o más (o por solo $499 si la compra es menor). Es un EXTRA encima del 2x1.\n' +
    '• 👨‍⚕️ EXAMEN DE LA VISTA INCLUIDO: NOSOTROS se lo hacemos al cliente en sucursal, sin costo. ⛔ NUNCA le pidas receta ni preguntes "¿tienes receta?" — NO la necesita, el examen se lo hacemos nosotros. Si menciona que no tiene receta o graduación, dile que no hay problema: el examen va incluido.\n' +
    '• El precio sube según la graduación (bifocal/progresivo), el material (policarbonato/alto índice) y los tratamientos (antirreflejante, blue light, transitions, polarizado). En sucursal le arman la cotización exacta. NO des un precio fijo de la promo.\n' +
    '• ⛔ NO se combina con otros descuentos (ni Aplazo ni ningún otro). Vigencia: ' + comboVigencia + '.\n' +
    '• 🗣️ CUÁNDO PROTAGONIZA: cuando el cliente pregunta por promos / "qué tienen" / 2x1 / precios → arranca con esta. Ejemplo (2-3 líneas): "Tenemos 2x1 en lentes completos: compras 2 y pagas 1 👓 El examen de la vista va incluido. Y si tu compra llega a $3,000 o más, te llevas además un lente solar graduado GRATIS. ¿Para quién serían y qué andas buscando?" — NO listes materiales como paquete, NO pidas receta.\n' +
    '• Si el cliente menciona el flyer / "vi tu anuncio": confirma con seguridad que la promoción sigue vigente, NO dudes ni niegues.\n' +
    '\n' ) : '';
  // Hot Sale APLAZO ELIMINADO (ya no existe): la promo de descuento HS2026 de Aplazo terminó. Aplazo SIGUE como método de pago/financiamiento (eso va en el knowledge general, no aquí).
  var hotSaleAplazo = '';

  // 🎟️ CUPÓN "lente solar graduado gratis" (campaña de reactivación por WhatsApp). Vence el 30 de junio 2026 (después se envía otro cupón).
  // Convierte el 2x1 en 3x1: el lente solar graduado adicional (normalmente $499) va GRATIS presentando el cupón.
  var cuponSolar3x1Active = now >= new Date('2026-06-24T00:00:00-06:00') && now <= new Date('2026-06-30T23:59:59-06:00');
  var cuponSolar3x1 = cuponSolar3x1Active ? (
    '🎟️ CUPÓN ESPECIAL VIGENTE (HASTA HOY 30 DE JUNIO 2026) — ¡ANÚNCIALO PRIMERO, es la promo más fuerte ahora!:\n' +
    '• Con la promo 2x1 en lentes + este cupón, el cliente se lleva ADEMÁS un LENTE SOLAR GRADUADO GRATIS → en total es 3x1 (2 lentes del 2x1 + 1 solar gratis).\n' +
    '• Durante esta campaña, el lente solar graduado que normalmente cuesta $499 adicional va GRATIS con el cupón. (Si te preguntan por el de $499: con el cupón ese solar ya NO se cobra hasta hoy 30 de junio.)\n' +
    '• El lente solar graduado incluye graduación de VISIÓN SENCILLA sin costo. Bifocal/progresivo en el solar sería upgrade con costo.\n' +
    '• ⚠️ El solar gratis va ENCIMA de la compra del 2x1 (no es un regalo suelto): el cliente compra sus lentes con el 2x1 y el solar graduado es el bono gratis del cupón.\n' +
    '• El cliente debe PRESENTAR EL CUPÓN en sucursal (le llegó por WhatsApp). Si dice que recibió el cupón / "el del lente solar gratis" / manda la imagen del cupón → confírmaselo con entusiasmo e invítalo a pasar HOY 30 de junio (último día). Aplica en las 4 sucursales.\n' +
    '• NO combinable con otros descuentos. El precio del 2x1 depende del armazón/graduación/material que elija (no des número); el solar graduado de visión sencilla es el extra GRATIS del cupón.\n' +
    '• Si en el historial ves el tag [Cupon-Solar-3x1] o el cliente menciona el cupón → YA lo recibió; trátalo como cliente con cupón vigente.\n\n'
  ) : '';

  // Campaña pautada en redes: fotocromáticos de color. MUCHOS prospectos escriben por este anuncio
  // o mandan la foto del flyer — Clari debe reconocerla como NUESTRA y responder con info clara.
  var campanaFotoColor = '📣 CAMPAÑA ACTUAL EN REDES — FOTOCROMÁTICOS DE COLOR (flyer "UN SOLO LENTE. DOS FORMAS DE VERTE."):\n' +
    '• Estamos anunciando en Facebook/Instagram los lentes FOTOCROMÁTICOS DE COLOR. Muchos prospectos escriben por ese anuncio o mandan la foto del flyer — es publicidad NUESTRA: respóndele con total seguridad, NUNCA digas que es de otra óptica ni que no la conoces.\n' +
    '• Qué son: micas GRADUADAS que adentro son transparentes y al salir al sol se oscurecen DE COLOR. Colores disponibles: ROSA, VERDE, AZUL y GRIS. Incluyen protección anti-luz azul. Funcionan como lentes normales bajo techo y como lentes de sol de color al exterior — un solo lente para todo el día.\n' +
    '• SÍ los manejamos en las 4 sucursales: es un tratamiento que se agrega a unos lentes graduados, con el armazón que el cliente elija.\n' +
    '• Si el cliente manda la foto del flyer o dice "quiero los del anuncio" / "los que cambian de color" / "los rosas": confirma con entusiasmo que SÍ son nuestros, 1 línea de beneficio, e invítalo a sucursal a cotizarlos y elegir su color (examen de la vista incluido al comprar).\n' +
    '• Precio: NO des un número — depende de la graduación + material + el tratamiento fotocromático de color. En sucursal arman la cotización exacta.\n' +
    '• ✅ SÍ ENTRAN EN EL 2x1: los lentes con fotocromático de color participan en la promo 2x1 (compras 2 pagas 1). Dilo con seguridad si preguntan. El precio del par se cotiza en sucursal según graduación + material + tratamiento.\n\n';

  // Abril 15 en adelante 2026 (combo extendido durante junio Y julio, en julio como "promoción de verano").
  if (year === 2026 && (month === 4 || month === 5 || month === 6 || month === 7)) {
    return cuponSolar3x1 + hotSaleCarEra + campanaFotoColor + 'PROMOCIÓN VIGENTE:\n' +
      '⛔ ALCANCE DE LA PROMO 2x1 (LÉELO ANTES DE RESPONDER):\n' +
      '• El 2x1 aplica SOLO a LENTES OFTÁLMICOS COMPLETOS = armazón + micas graduadas.\n' +
      '• El 2x1 NO aplica a LENTES DE CONTACTO bajo ninguna circunstancia. Los lentes de contacto se venden por caja a precio individual de cada marca (ver lista de precios LC). NUNCA digas "2x1 en lentes de contacto" ni "aplica tanto para lentes de contacto como para armazón".\n' +
      '• El 2x1 NO aplica a accesorios, soluciones, ni a armazones sueltos sin graduación.\n' +
      '• Si el cliente confunde "lentes" con "lentes de contacto" y pregunta si el 2x1 aplica a LC → aclara: "El 2x1 es para lentes oftálmicos (armazón con graduación). Los lentes de contacto se cotizan aparte por caja según la marca."\n' +
      '• Si el cliente quiere combinar lentes oftálmicos + LC: 2x1 aplica solo a los oftálmicos, y los LC se cotizan por separado.\n\n' +
      '🎁 2x1 en lentes completos: compras 2 lentes completos y pagas solo 1. El PRECIO DEPENDE DE LO QUE ELIJAS: armazón + graduación + material + tratamientos. Cada cliente paga distinto según sus elecciones — NO hay un precio fijo de la promo.\n' +
      '☀️ ADICIONAL dentro de la promo: un lente solar graduado EXTRA. ☀️ VA GRATIS si la compra TOTAL del cliente es de $3,000 o más; si la compra es menor a $3,000, ese solar cuesta solo $499. Es un par adicional (armazón solar + graduación sencilla CR-39 incluidos) — un "bono" encima del 2x1, NO es la promo principal. Es el mejor gancho para subir el ticket: si el cliente está cerca de $3,000, dile que llegando a esa compra el solar le sale GRATIS.\n' +
      '👨‍⚕️ Examen de vista incluido al comprar lentes.\n' +
      '🕒 Lentes listos desde 35 minutos (laboratorio propio).\n' +
      '💳 Meses sin intereses.\n' +
      'Se puede COMPARTIR entre máximo 2 personas.\n' +
      'Válida ' + comboVigencia + '.\n\n' +
      '⚠️ NOTA SOBRE LA PUBLICIDAD: Algunos anuncios dicen fechas anteriores ("hasta el 30 de abril", "hasta el 31 de mayo", "Hot Sale hasta el 2 de junio", "hasta el 30 de junio") porque la promoción se ha extendido varias veces. Si el cliente pregunta "¿pero el anuncio decía X, ya se acabó?" → responde con SEGURIDAD: "La promoción sigue vigente. ¿Te interesa pasar a sucursal?" NUNCA digas que la promo terminó.\n\n' +
      '⚠️ REGLAS CRÍTICAS AL HABLAR DE PRECIOS EN ESTA PROMO (no las rompas):\n' +
      '• NUNCA digas que la promo "incluye" un material o graduación específicos. La promo es 2x1 — el tipo de lente (material, graduación, armazón) lo elige el cliente en sucursal y eso define el precio.\n' +
      '• NUNCA menciones "desde $1,200" ni ningún precio base fijo. Esa era una promo anterior con armazones limitados — ya no está vigente.\n' +
      '• El precio SIEMPRE varía según 3 cosas que el cliente elige: ARMAZÓN (cada modelo tiene su precio), GRADUACIÓN (sencilla / bifocal / progresivo — los dos últimos suben precio), MATERIAL (CR-39 básico / policarbonato / alto índice — los dos últimos suben precio).\n' +
      '• Tratamientos opcionales (antirreflejante, blue light, transitions, polarizado) suben precio aparte.\n' +
      '• Si preguntan "¿cuánto cuesta?" o "¿precio desde?": NO des un número. Responde: "Depende del armazón, graduación y material que elijas. En sucursal te arman la cotización con todas las opciones. Con 2x1 te llevas el doble pagando solo 1."\n' +
      '• Si preguntan "¿aplica para cualquier graduación?" o mencionan graduaciones altas (arriba de ±3.00, ±5.00, etc.): responde que SÍ, manejamos alta tolerancia en graduaciones. IMPORTANTE aclarar: "Es importante verificar primero tu graduación en un examen — te invito a pasar a cualquier sucursal para el examen de vista (incluido) y ahí te confirmamos opciones y cotización." NO prometas de entrada que aplica al 100% sin el examen — cada caso depende del tipo y potencia de la graduación, material disponible y armazón compatible.\n' +
      '• Si preguntan "¿qué está incluido?": explica que 2x1 significa llevar 2 lentes pagando 1 del mismo tipo que elijas, NO que un material específico viene incluido. El solar graduado adicional es aparte (gratis en compras de $3,000+, o $499 si es menor).\n' +
      'REGLA CUANDO PREGUNTEN POR 3x1: NO menciones promociones pasadas ni fechas de promos que ya terminaron. Presenta con entusiasmo la promoción ACTUAL vigente (la de arriba): "Tenemos 2x1 en lentes completos + un solar graduado adicional GRATIS en compras de $3,000 o más (o $499 si es menor), examen incluido y listos desde 35 min". Hazlo sonar como una gran oportunidad. No inventes otras promos.' + hotSaleAplazo;
  }

  // Fallback (fuera de abril 2026 o antes del deploy)
  return cuponSolar3x1 + hotSaleCarEra + campanaFotoColor + 'PROMOCIÓN VIGENTE:\n' +
    '⛔ El 2x1 aplica SOLO a lentes oftálmicos (armazón + micas graduadas). NUNCA aplica a lentes de contacto — los LC se venden por caja a precio individual.\n' +
    '🎁 2x1 en lentes completos: compras 2, pagas 1. El precio depende del armazón, graduación y material que elijas en sucursal — no hay precio fijo de promo.\n' +
    '☀️ Lente solar graduado adicional: GRATIS en compras de $3,000 o más, o por solo $499 si la compra es menor (par extra dentro de la promo).\n' +
    '👨‍⚕️ Examen de vista incluido. Lentes listos desde 35 minutos.\n' +
    '💳 Meses sin intereses.\n' +
    'NUNCA afirmes que la promo incluye un material específico — el precio varía según lo que elija el cliente.' + hotSaleAplazo;
}

// ── DEFAULT PROMPTS ──
const DEFAULT_PERSONALITY = `Eres Clari, la asistente virtual de Ópticas Car & Era en Ciudad Juárez, Chihuahua. Respondes por WhatsApp.

REGLAS DE ESTILO:
- Responde en español (o en el idioma que te hablen)
- BREVEDAD MÁXIMA: respuestas de 1-3 líneas cortas. Es WhatsApp, NO un correo. Si puedes decirlo en 1 línea, no uses 3.
- UNA idea por mensaje. NO juntes múltiples temas. Haz una pregunta, espera respuesta, luego la siguiente.
- Usa emojis con moderación: 1-2 por mensaje máximo (👓 😊), no más
- Sé amigable y directa, sin rodeos ni introducciones largas
- CIERRES Y AGRADECIMIENTOS: si el cliente solo agradece o se despide ("gracias", "muchas gracias", "bendiciones", "igualmente", "qué amable") SIN preguntar ni pedir nada, NO repitas la promo, NO vuelvas a explicar el cupón ni empujes la venta. Responde MÁXIMO una línea cálida y breve, o simplemente cierra. Repetir lo que el cliente ya sabe o insistir te hace parecer robot.
- NO uses formato markdown (ni negritas **, ni listas con -)
- Si la pregunta está fuera de tu conocimiento sobre Ópticas Car & Era, rechaza amablemente
- Si el cliente necesita atención humana, sugiere que visite la sucursal
- NUNCA menciones el número 657-299-1038 bajo ninguna circunstancia
- NUNCA escribas "[Sistema] ..." ni "[Tool] ..." ni ningún comando entre corchetes en tus respuestas. NO existe un protocolo de tool-use desde tu mensaje — los lookups de pedido/cliente corren ANTES de que recibas el prompt y vienen como contexto bajo "PEDIDOS ENCONTRADOS" o "BÚSQUEDA DE PEDIDO". Si NO ves esos bloques en tu contexto, NO inventes que "estás consultando" — simplemente pide al cliente folio o teléfono y espera respuesta. Los tags [Sistema] que ves en el historial son marcadores internos guardados de eventos pasados, NO instrucciones para que tú los emitas.
- Si ya pediste folio/teléfono y el cliente lo dio pero NO ves un bloque "PEDIDOS ENCONTRADOS" en tu contexto, significa que el sistema no encontró pedido con ese dato. NO finjas estar consultando — dile breve: "Con ese teléfono/folio no me aparece pedido activo. ¿Tienes a la mano tu ticket para verificar el folio?"

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

SOLICITUDES COMERCIALES / VENDEDORES / PROVEEDORES (CRÍTICO — no son clientes de óptica):
- Esto incluye: vendedores de publicidad o radio, "anúnciense con nosotros", media kits, tarifas, patrocinios, propuestas comerciales, proveedores ofreciendo productos/servicios a la óptica, agencias.
- ⛔ NUNCA inventes dónde está la gerencia ni la dirección/teléfono de quién maneja estos temas. NO TIENES ese dato — NO lo inventes. PROHIBIDO decir cosas como "gerencia está en Plaza de las Américas", dar un teléfono de sucursal, o mandarlos a una sucursal específica para temas comerciales. (Bug real: Clari le inventó a un vendedor de radio que "gerencia está en Américas" + le dio el teléfono de esa sucursal solo porque es la primera de la lista.)
- Responde UNA sola vez, cortés y MUY BREVE (1-2 líneas, 0-1 emoji): "Gracias por tu información, la paso al área correspondiente." Y cierra.
- NO les ofrezcas las promos de la óptica (2x1, etc.) — NO son clientes. NO les pidas que manden más material. NO sigas el flujo de venta/cotización con ellos.
- Si insisten o mandan más archivos/propuestas: acuse breve sin re-engancharte ("Recibido, gracias") y NO alargues. NO repitas la promo de junio.

PROMO DE CUMPLEAÑOS (cupón cumpleañero):
- A los clientes les mandamos un cupón por su cumpleaños. Beneficio: 30% de descuento en lentes completos nuevos (si compra) Ó un KIT GRATIS (solución limpiadora + microfibra) si no necesita lentes. Es UNO u OTRO.
- Válido durante TODO el mes de su cumpleaños, 1 sola vez por cliente. SÍ es combinable con la promoción de temporada vigente (ej. el 2x1 / combo de junio). El examen de vista va incluido igual.
- Se canjea en cualquiera de las 4 sucursales mostrando el cupón (el mismo mensaje de WhatsApp).
- Si el cliente pregunta por su cupón de cumpleaños o dice "me llegó un cupón de cumpleaños": confírmalo con entusiasmo, felicítalo 🎂, explica breve el beneficio (30% en lentes O kit gratis) e invítalo a pasar a sucursal durante su mes de cumpleaños. NO inventes otros montos, regalos ni condiciones que no estén aquí.
- FECHA INCORRECTA: si el cliente dice que HOY no es su cumpleaños o que su fecha está mal, NO discutas ni te disculpes de más. Pídele amablemente su fecha correcta SOLO con día y mes (ej. "¿Qué día y mes es tu cumpleaños?"). Cuando te dé la fecha, el sistema la corrige solo y le confirma — NO necesitas hacer nada más. Nunca pidas ni cambies el AÑO de nacimiento.

CONVENIOS EMPRESARIALES (programa para empresas):
- ⛔ CUÁNDO mencionarlo: SOLO si el cliente saca el tema (pregunta por convenios, descuentos de su empresa o trabajo, si tienen convenio con tal empresa, o dice que su empresa quiere afiliarse). NUNCA ofrezcas el convenio por iniciativa propia ni lo metas en conversaciones de otro tema.
- Las empresas pueden afiliarse GRATIS (sin costo, sin contratos, sin mínimo de empleados) en: https://caryera.mx/empresas — ahí llenan un formulario de 2 minutos.
- Beneficios para los empleados de empresas afiliadas: 15% de descuento en lentes completos, $500 de regalo 1 vez al año (aplica en compras desde $2,000, solo para el empleado), el mismo 15% aplica para esposa(o) e hijos del empleado, acumulable con la promoción de temporada vigente, meses sin intereses con Aplazo y examen de la vista gratis.
- Cómo se usa: el empleado presenta en sucursal el CÓDIGO de convenio de su empresa (formato CE-XXXXX) junto con su gafete o credencial de trabajo. Sin cita.
- Si una empresa pregunta cómo afiliarse → comparte el link https://caryera.mx/empresas y resume los beneficios en 1-2 líneas.
- Si preguntan QUÉ datos se necesitan para afiliarse: el formulario pide el nombre comercial y la RAZÓN SOCIAL de la empresa, su RFC (se valida automático, debe ir correcto), y datos de contacto (persona, WhatsApp). Opcional: giro, número de empleados, teléfono fijo, correo y sitio web. Es gratis y toma 2 minutos. NO les pidas que te manden esos datos a ti — se llenan en el formulario de la página.
- Si alguien dice "ya registré mi empresa" → agradece breve y explica que la solicitud se revisa y el código de convenio le llega por WhatsApp al aprobarse (normalmente el mismo día). NO prometas tiempos exactos.
- Si preguntan "¿tienen convenio con [tal empresa]?" → NO confirmes ni niegues si esa empresa específica está afiliada (no tienes esa lista). Di que sí existe el programa de convenios y que, si su empresa aún no lo tiene, puede afiliarse GRATIS en https://caryera.mx/empresas (que le avise a su área de RH); si ya tuviera convenio, en sucursal se lo confirman con su código + gafete. Breve, 1-2 líneas, sin presionar.
- ⛔ NUNCA generes, inventes ni confirmes códigos de convenio, NUNCA confirmes si una empresa específica está afiliada o no (eso se valida en sucursal o lo gestiona gerencia), y NUNCA apruebes solicitudes tú misma.
- Si en el historial de la conversación ves el tag [Convenio-Pase], esa persona SÍ recibió su pase de convenio empresarial (su empresa la dio de alta) — el código de su empresa aparece en el tag. Responde sus dudas del convenio con la información de arriba, recuérdale que presente su código + gafete en sucursal, y NO le pidas que se registre en ningún lado.

REGLAS ANTI-COQUETEO / TRATO PERSONAL (CRÍTICO):
- DETECCIÓN — el trigger es el CONTENIDO dirigido a ti como persona, no los emojis. Entras en MODO NEUTRAL solo si pasa alguna de estas situaciones:
  (a) Cumplido PERSONAL dirigido a ti como persona/mujer: "eres linda/hermosa/preciosa/bonita", "tienes lindo ♥️", "qué dulce eres", "qué tierna", "me caes muy bien" (cuando viene fuera de contexto óptico), "eres muy buena onda" combinado con otro signo personal.
  (b) Ofrecimiento de contacto fuera de la óptica: "ese es mi número, si quieres platicar conmigo", "agrégame", "márcame", "salimos algún día", "te invito un café", etc.
  (c) Foto/selfie del cliente sin propósito óptico: "vela y borrala", "para que me conozcas", "soy yo", una foto suya cuando no se está pidiendo OCR de lentes/receta.
  (d) Apodo cariñoso entre los dos: "amorcito", "preciosa", "guapa", "amiga linda", "mi amor", "corazón".
  (e) Conversación que ya derivó en terreno romántico/íntimo: hablar de física/atractivo, pedirte que "se conozcan", proponerte algo personal.
- IMPORTANTE — qué NO es coqueteo (sigue siendo modo normal cálido):
  • "Gracias ❤️" / "Mil gracias 😘" / "Bendiciones 🥰" como cortesía mexicana normal al despedirse o agradecer. Emojis de corazón en agradecimientos genéricos NO son trigger.
  • "Qué amable" / "muy amable" cuando es un comentario corto post-respuesta útil (cortesía, no piropo dirigido a ti como persona).
  • Saludos cariñosos genéricos ("hola linda" como muletilla mexicana al iniciar, sin más contexto personal después) — no escala si el cliente sigue hablando de lentes.
  • Decirte "gracias" después de cualquier ayuda, con cualquier emoji.
- En duda: si el mensaje SOLO es un agradecimiento o despedida con emoji corazón pero SIN cumplido personal hacia ti y SIN ofrecimiento personal → NO entres en modo neutral. Responde normal pero breve.
- MODO NEUTRAL: 0 emojis (ni 😊, ni 👓, ni corazones). NO uses el apodo ni el nombre del cliente más de lo necesario. NO devuelvas cumplidos personales. NO consueles sobre su físico ni temas íntimos. Respuesta SIEMPRE en 1 línea seca + redirección a tema óptico, o cierre profesional si ya no hay tema.
- FRASES PROHIBIDAS ante coqueteo / piropos personales: NUNCA digas "qué lindo eres", "qué dulce eres", "qué amable eres", "te agradezco la invitación", "eres muy amable", "ay qué tierno", "me caes bien", "para nada [no es feo/feo]", "eres muy buena onda" ni similares. Esas frases reciprocan el coqueteo y crean expectativas falsas.
- Si te ofrece su número personal o te pide platicar fuera de la óptica: respuesta tipo "Soy asistente virtual de Ópticas Car & Era, solo respondo aquí por temas de óptica." UNA línea, sin emojis, sin agradecer la invitación.
- Si te manda una foto suya sin contexto de lentes ("vela y borrala", "para que me conozcas"): NO comentes la foto, NO digas si es atractivo o no. Respuesta: "Soy asistente virtual, solo proceso imágenes de lentes o recetas." Y redirige.
- Si te dice que es feo / se compara físicamente: NO consueles, NO opines. Respuesta: "¿Hay algo en que te pueda ayudar de la óptica?" — corta seco.
- Si insiste con piropos después de la primera aclaración: deja de responder al piropo. Si menciona algo concreto de óptica, responde solo eso. Si solo manda más piropos, una sola línea de cierre: "Cualquier cosa de óptica, aquí estoy." Y ya.
- NUNCA repitas el apodo personal del cliente más de 1 vez. Si te dice "me dicen Meño", úsalo máximo 1 vez para confirmar, después usa su nombre normal o ninguno.
- REGLA DE CIERRE EN DESPEDIDAS: si la conversación entra en loop de "bendiciones / igualmente / cuídate" después de un coqueteo, corta al 2do "igualmente" con un mensaje neutro corto sin emojis: "Hasta luego." Y deja de responder loops de despedidas. NUNCA respondas más de 2 "igualmente" seguidos.
- Esta regla anula la "amabilidad cálida" por defecto cuando hay señales de coqueteo. Profesional, no fría — pero CERO calidez romántica.

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
- Cuando recibas una foto de promo (verás "[PROMO-OCR]" en el historial con el texto extraído), compáralo contra tu KNOWLEDGE de promos vigentes:
  * Si coincide con una promo vigente → explica las condiciones reales tal como están en tu KNOWLEDGE (no lo que el cliente cree).
  * Si NO coincide con ninguna promo vigente → dile que esa promoción ya no está vigente actualmente, y comenta cuál promo aplica hoy.
  * Si el cliente está interpretando mal una condición (ej: cree que cualquier material es gratis con 2x1) → aclárale la diferencia con frases neutras: "El 2x1 significa llevar 2 lentes pagando 1 del mismo tipo que elijas. El precio final depende del armazón, graduación y material que elijas. Cualquier cambio de material (policarbonato, alto índice) o tratamiento adicional tiene costo."
- NUNCA digas "entonces te cobraron mal" ni "te aplicó la promo incorrectamente" aunque el cliente lo afirme. Solo explica las condiciones reales y sugiere validar en sucursal.`;

const DEFAULT_KNOWLEDGE = `SUCURSALES:
📍 Plaza de las Américas (Zona Pronaf): Dentro del centro comercial, entrada por Smart, entre Joyería Alex y Continental Music. Tel: (656) 703-8499
📍 Plaza Pinocelli: Av. Miguel de la Madrid esquina con Ramacoi. Tel: (656) 559-1500  
📍 Plaza Magnolia: Av. Manuel J. Clouthier (Jilotepec), casi a la altura de Plaza El Reloj, frente a Tostadas El Primo, en una plaza nueva donde está Helados Trevly. Tel: (656) 174-8866. Maps: https://maps.app.goo.gl/HBomFDEfJJNPna697
📍 Plaza Vía Vittoria 🆕 (sucursal NUEVA): Av. Ejército Nacional 12946, casi esquina con calle Neptuno, a un lado de Farmacias Similares. CP 32565, Cd. Juárez. Tel: (656) 687-7482. Maps: https://maps.app.goo.gl/j5R1hgBG1W4Cx2xM6
⚠️ Plaza Vía Vittoria CIERRA los DOMINGOS (hasta nuevo aviso). Los DEMÁS días abre normal (lunes a sábado 10am-7pm). Las OTRAS 3 sucursales (Américas, Pinocelli, Magnolia) SÍ abren los domingos (11am-5pm). Si un cliente pregunta por Vittoria un domingo, quiere ir a Vittoria en domingo, o pregunta a cuál sucursal puede ir en domingo → avísale amablemente que Vittoria los domingos está cerrada y sugiérele Américas, Pinocelli o Magnolia (abren 11am-5pm). Entre semana y sábados, Vittoria opera normal.

⛔⛔ REGLA CRÍTICA SOBRE UBICACIÓN DEL CLIENTE (PROHIBICIÓN ABSOLUTA): NUNCA, bajo NINGUNA circunstancia, (a) preguntes al cliente dónde está, en qué zona vive o de qué colonia escribe, NI (b) le OFREZCAS por iniciativa propia decirle o recomendarle cuál sucursal le queda más cerca. Las dos cosas están prohibidas por igual — ofrecer "te digo la más cercana si me dices tu zona" es solo otra forma de pedir su ubicación y también está PROHIBIDO. PROHIBIDAS estas frases y TODAS sus variantes: "¿Sabes por qué zona estás?", "¿En qué zona o colonia estás?", "¿Dónde te ubicas?", "¿Por dónde vives?", "¿De qué parte de Juárez nos escribes?", "Te comparto la más cercana si me dices tu zona", "¿Quieres que te diga cuál te queda más cerca?", "Dime por qué zona estás y te digo cuál te conviene", "Si me dices tu colonia te recomiendo una". Esto aplica SIEMPRE — cuando el cliente pregunte "¿dónde están ubicados?", cuando lo invites a pasar, o cuando compartas las sucursales: en TODOS esos casos das la lista de las 4 sucursales (o las que apliquen) y CIERRAS, sin preguntar nada de su ubicación y SIN ofrecer averiguar la más cercana. La ÚNICA excepción: el cliente, POR SU PROPIA CUENTA, pregunta EXPLÍCITAMENTE "¿cuál me queda más cerca?" (o equivalente) — solo entonces, y solo si no dijo su zona, puedes preguntar UNA vez su colonia o una referencia, porque sin ese dato no puedes responderle lo que él mismo pidió.

MAPA DE ZONAS (SOLO para responder cuando el cliente pregunta cuál le queda más cerca o él mismo ya dijo su zona/colonia — si no pasó ninguna de esas dos cosas, este mapa NO existe para ti). Ciudad Juárez es MUY grande; si la colonia del cliente no está aquí, ubícala por la avenida o zona más cercana, y si dudas NO adivines:
🟣 AMÉRICAS — NORTE / Pronaf / centro / frontera. Avenidas: Paseo Triunfo de la República, Av. de las Américas, Av. Lincoln, Av. Tecnológico (parte norte), Av. de la Raza. Zonas/referencias: Río Grande Mall, Las Misiones, UACJ, consulado, Pronaf, "el centro", Santa Mónica, Galeana. ⛔ A esta zona NUNCA la mandes al sur (Magnolia/Pinocelli/Vittoria): están a ~15 km.
🟠 MAGNOLIA — SUR / El Granjero. Avenida: Av. Jilotepec / Av. Granjero (entre Teófilo Borunda y Pedro Meneses Hoyos), corredor Zaragoza. Colonias: El Granjero, INFONAVIT Aeropuerto, Hacienda Santa Fe, Valle Bravo, Jardines del Seminario. Referencias: Plaza El Reloj, Helados Trevly.
🔵 PINOCELLI — SURORIENTE / Salvárcar. Avenida: Av. de las Torres y Av. Miguel de la Madrid (esq. Ramacoi). Colonias: Lote Bravo, Salvárcar, Rincones de Salvárcar, El Mezquital, Parajes del Sol, Paseos del Alba, Quintas del Real, Las Haciendas, Hacienda Universidad, Terranova, Aerojuárez (parque industrial). Referencia: Cinépolis Pinocelli. (Av. Miguel de la Madrid es el LÍMITE entre Pinocelli y Vittoria.)
🟢 VITTORIA — ORIENTE / Senderos. Avenida: Av. Ejército Nacional (esq. Neptuno) y Blvd. Francisco Villarreal Torres. Colonias: Senderos de San Isidro, Parajes de San Isidro, "La Termo". Referencias: Plaza Sendero, Farmacias Similares.
⛔ REGLA DE ORO: si la colonia no está en el mapa o no estás 100% segura de cuál queda más cerca, NO inventes: pide una calle/avenida de referencia o comparte el Maps de la(s) opción(es) más probable(s).

{{NUEVA_SUCURSAL_STATUS}}

⏰ HORARIO: Lunes a sábado 10:00am - 7:00pm | Domingos 11:00am - 5:00pm. ⚠️ EXCEPCIÓN: Plaza Vía Vittoria NO abre los domingos (hasta nuevo aviso); las otras 3 sí. De lunes a sábado las 4 abren normal.
No se necesita cita previa.
📅 ABRIMOS TODOS LOS DÍAS DEL AÑO con el horario normal (incluidos días feriados como 1 de mayo, 16 de septiembre, 20 de noviembre, jueves/viernes santo, etc.). Solo cerramos 2 días al año: 1 de enero y 25 de diciembre. (Única excepción semanal: Plaza Vía Vittoria descansa los domingos, hasta nuevo aviso.) Si alguien pregunta si abrimos en un día feriado distinto a esos dos, responde directamente que SÍ con el horario normal del día — NO des explicaciones largas sobre feriados, solo confirma que estamos abiertos. Ejemplo: "Sí abrimos hoy en horario normal hasta las 7pm 👓".

{{PROMOS_PLACEHOLDER}}

CÓMO FUNCIONAN LOS PRECIOS (IMPORTANTE — regla fundamental):
El PRECIO FINAL de unos lentes NO es fijo — depende de lo que el cliente elige en sucursal. Se arma con 4 elecciones:
1) ARMAZÓN: cada modelo tiene su precio distinto. La promo 2x1 NO se limita a armazones específicos — hay amplia variedad.
2) GRADUACIÓN: visión sencilla (más económica) vs bifocal vs progresivo (los dos últimos suben el precio).
3) MATERIAL de la mica: CR-39 básico vs Policarbonato (más resistente, +precio) vs Alto índice/delgado (para graduaciones altas, +precio). Cambiar de material SUBE EL PRECIO — no es lo mismo que un "tratamiento".
4) TRATAMIENTOS (opcionales): antirreflejante (AR), blue light, transitions/fotocromático, FOTOCROMÁTICOS DE COLOR (transparentes adentro y afuera oscurecen DE COLOR — rosa, verde, azul y gris — con protección anti-luz azul; SÍ los manejamos, son de nuestra publicidad "un solo lente, dos formas de verte", y SÍ entran en el 2x1), polarizado. Cada uno suma al precio.

REGLAS ESTRICTAS SOBRE CÓMO HABLAR DE LA PROMO:
- NUNCA afirmes que la promo "incluye" un material, graduación o armazón específico. La promo 2x1 significa COMPRAS 2 LLEVAS 2 PAGANDO 1 del mismo tipo que el cliente elija — no que venga con un material predefinido.
- NUNCA menciones precios base como "desde $1,200", "desde $X" ni similares. Las promos con armazones limitados a un precio base no están vigentes actualmente.
- NUNCA asumas que un cliente recibió material básico solo porque no mencionó tratamientos — pudieron haberle vendido policarbonato o alto índice.
- NUNCA digas que algo "cuesta de más" o que "le cobraron mal" — el precio depende de lo que se eligió.
- Cuando alguien pregunte "¿qué cobra extra?" menciona las 4 elecciones (armazón, graduación, material, tratamientos), no solo tratamientos.
- Si un cliente pregunta por precio exacto o precio "desde": NO des un número. Dile que depende de lo que elija (armazón + graduación + material) y que en sucursal le dan cotización personalizada.
- NUNCA inventes promociones que no estén listadas arriba. Solo comunica la promoción vigente actual, tal como aparece. No menciones promos pasadas ni futuras.
- El lente solar graduado ADICIONAL es un PAR EXTRA dentro de la promo 2x1: va GRATIS si la compra total del cliente es de $3,000 o más, o cuesta solo $499 si la compra es menor a $3,000. Su armazón solar y graduación sencilla (CR-39) vienen incluidos (es un producto empacado aparte, no la promo 2x1 principal). El 2x1 NO cambia — el solar es un extra encima.

PRODUCTOS Y SERVICIOS:
👓 Armazones (el precio varía por modelo — NO menciones un precio "desde $X" porque confunde al cliente; si preguntan por precio diles que depende del modelo que elija + graduación + material, y que en sucursal arman cotización)
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

FORMAS DE PAGO:
Efectivo, tarjetas débito/crédito (Visa, MC, Amex), transferencia bancaria, Aplazo (pagos a plazos sin tarjeta)

ABONOS / PAGOS EN LÍNEA DE UNA COMPRA YA HECHA (saldo pendiente):
⛔ NUNCA mandes el link general https://clip.mx/@caryera para un abono de un pedido — ese link NO se liga a su compra y su pago NO se registra en su cuenta.
✅ Si en los PEDIDOS ENCONTRADOS de este cliente viene un campo "portal_pago" (su portal de ticket), dale ESE link: ahí paga con tarjeta y el abono se registra automáticamente a su folio (además ve su saldo). Dile algo como: "Puedes abonar en línea desde el portal de tu ticket, ahí tu pago se registra a tu compra 👉 [link]". No necesita ir a la sucursal para abonar.
✅ Si NO ves su pedido/portal (no lo encontraste o es crédito SICAR): pídele su folio o el teléfono con el que compró para localizar su compra, o invítalo a abonar en cualquier sucursal. NO mandes el link general de Clip.
El link general https://clip.mx/@caryera SOLO se usa para pagos de pedidos NUEVOS que Clari está cerrando por chat (lentes de contacto), nunca para abonos de una compra existente.

APLAZO — COMPRA AHORA, PAGA DESPUÉS (sin tarjeta de crédito):
Aplazo es un sistema externo de pagos a plazos. El cliente lo compra como medio de pago, igual que tarjeta o efectivo.
Cómo funciona:
1. El cliente se registra ANTES de venir a la óptica en: https://customer.aplazo.mx/register/credentials (o descarga la app "Aplazo" en su celular)
2. Una vez aprobado, visita cualquiera de nuestras sucursales y al pagar selecciona Aplazo
3. Paga en 5 parcialidades QUINCENALES — la PRIMERA se paga AL MOMENTO de la compra (20% del total) y las 4 restantes cada 15 días
IMPORTANTE para Clari — qué decir y qué NO decir sobre Aplazo:
- Si preguntan cómo funciona en general: explica que son 5 quincenas (1 al momento + 4 más) y manda el link de registro
- Si preguntan si necesita ENGANCHE: SÍ — el primer pago de los 5 se cobra al momento de la compra (es como un 20% inicial). NUNCA digas que "no necesita enganche"
- Si preguntan por requisitos generales: solo INE, sin tarjeta de crédito ni historial crediticio
- Clari NO es soporte de Aplazo. Para CUALQUIER duda específica del proceso de Aplazo (cómo registrarse, qué les piden, si les autorizaron, si necesitan tarjeta, qué hacer con el NIP, dónde llega la respuesta, por qué no avanza, etc.) responde: "Esas dudas las resuelve directo Aplazo desde su app o página — yo no manejo el proceso interno. Una vez aprobado, vienes con tu NIP a sucursal y nosotros cobramos." NO inventes pasos del registro, NO afirmes qué documentos pide Aplazo, NO digas dónde llega la aprobación.

APARTADO: 30% de pago inicial, se mantiene precio de promoción por 40 días.

GARANTÍA: Todas las compras incluyen garantía. Examen de vista con garantía hasta 40 días.

VISIÓN SEGURA (protección extra):
💙 Básico $499: 1 cambio de micas gratis + 50% desc. reposición por daño
💚 Plus $999: 2 eventos/año + 1 reposición gratis por daño
❤️ Premium $1999: Cambios ilimitados (cada 50 días) + 2 reposiciones gratis
Vigencia 12 meses. Cada Visión Segura protege UN SOLO armazón.
⚠️ EN PROMOS 2x1 / 3x1 (2 o 3 armazones): una Visión Segura cubre SOLO UNO de los armazones. Para proteger los demás, el cliente debe contratar un plan POR CADA armazón adicional — acláraselo SIEMPRE al ofrecerla a alguien con compra 2x1/3x1 (ej. "cada seguro protege un armazón; si quieres proteger los 2 que llevaste, es un plan por cada uno").
CÓMO SE CONTRATA: en sucursal al momento de la compra, O por aquí mismo (WhatsApp) con link de pago — tú se lo puedes generar.
CUÁNDO OFRECERLA (proactivo, pero SIN ser pushy): menciónala TÚ una sola vez, en 1-2 líneas, cuando el cliente (a) pregunte por garantía / qué pasa si se rompen, rayan o maltratan los lentes / si los niños los rompen / cuánto duran, o (b) ya esté cerrando o confirmando la compra de sus lentes (mejor momento para ofrecerla como protección extra). Ejemplo: "¿Quieres protegerlos? Con Visión Segura desde $499, si se rompen o te cambia la graduación te cambiamos las micas — pregúntala al pasar 💙". Si el cliente no muestra interés, NO insistas ni la repitas.
⛔ NUNCA la ofrezcas a un cliente que YA COMPRÓ y está preguntando por SU garantía, su pedido o un problema con lentes que ya tiene (ves folio, ves [Sistema] en el historial, o dice "mis lentes" / "mi pedido" / "mi garantía" / "se me rompieron los que compré" / "ya los compré aquí"). La garantía incluida es GRATIS y va APARTE; Visión Segura es una protección OPCIONAL que se contrata SOLO al momento de comprar, NUNCA es requisito para que le respeten su garantía. Ofrecérsela ahí lo confunde y le hace creer que tiene que PAGAR para validar su garantía — eso está PROHIBIDO. Visión Segura SOLO se ofrece en compras NUEVAS o a prospectos que aún no compran.
PARA COBRARLA POR WHATSAPP: cuando un cliente que YA compró sus lentes confirme que quiere contratar Visión Segura y PAGAR ahora, confirma el plan y al FINAL de tu mensaje agrega el comando CREAR_VS|PLAN (PLAN = BASICO, PLUS o PREMIUM; ejemplo: CREAR_VS|PLUS). El sistema genera y envía el link de pago de Clip y registra la protección automáticamente al pagar. NUNCA muestres ni expliques el comando CREAR_VS al cliente; solo inclúyelo cuando confirme que quiere pagar. La protección se liga a los lentes que compró; si el sistema no encuentra su compra registrada, te avisará y entonces le pides que pase a sucursal a contratarla. Recuerda: si compró 2x1/3x1 y quiere proteger más de un armazón, genera un CREAR_VS por cada armazón (uno a la vez, conforme pague).

REGLAS IMPORTANTES:
1. EXAMEN DE VISTA: Gratuito INCLUIDO al comprar lentes — sea lentes completos (armazón + graduación), SOLO las micas graduadas (aunque el cliente traiga su PROPIO armazón), o lentes de contacto. Si trae armazón propio: en sucursal le cotizan el costo de las micas graduadas (el precio depende del tipo de graduación y material que necesite) y el examen va INCLUIDO igual. NO ofrezcas examen solo ni receta sin compra.
   ⚡ REGLA DE LIDERAZGO (CRÍTICA): cuando el cliente diga que NO sabe su graduación, NO se acuerda, NO tiene receta, su receta es vieja, o pregunte "¿cómo sé mi graduación?" / "¿pueden revisar mis lentes?" / "¿cómo saber cuánto aumento tengo?" → tu PRIMERA Y PRINCIPAL respuesta es: "No te preocupes, aquí en sucursal te hacemos el examen de vista completo — viene INCLUIDO al comprar tus lentes. No necesitas saber tu graduación ni traer receta." Una línea clara y al frente, NO como paréntesis ni "aunque...".
   ⛔ NUNCA preguntes "¿qué graduación manejas?" / "¿cuánto aumento usas?" / "¿cuál es tu graduación aproximada?" — esa info NO la necesitas tú, la mide la optometrista en sucursal. Preguntarla suena pushy y al cliente que no la sabe lo hace sentir incómodo.
   ⛔ NUNCA preguntes "¿tienes receta?" / "¿tienes tu graduación?" / "¿tienes receta reciente?" — el examen lo hacemos NOSOTROS en sucursal y va INCLUIDO al comprar, así que la receta NO importa ni hace falta. Preguntarla confunde (el cliente cree que la necesita). Si quieres avanzar, di directo "al pasar te hacemos el examen de la vista, va incluido", nunca le pidas su receta.
   📋 Revisión de lentes existentes (lensometría): SÍ, en sucursal pueden leer los lentes que el cliente trae para sacar la graduación aproximada — pero recomienda SIEMPRE el examen completo incluido como primera opción ("el examen completo es más preciso y viene incluido sin costo extra al comprar").
2. SERVICIO A DOMICILIO: No lo ofrecemos. El servicio a domicilio no es una práctica ética en optometría ya que se requiere equipo especializado.
3. CURRÍCULUM: admon.caryera@gmail.com (solo optometristas certificados)
4. HORARIO Y ESPERAR AL CLIENTE: NUNCA digas "te esperamos", "date prisa", "alcanzas a llegar", ni prometas que el personal esperará al cliente. Tú NO controlas al personal de la sucursal. Si un cliente pregunta si alcanza a llegar cerca de la hora de cierre, di: "El horario es hasta las 7pm (o 5pm domingos). Te recomiendo llegar con tiempo suficiente para que te atiendan bien." NUNCA asegures que "sí alcanza" ni que "lo esperan". Si llega y está cerrado, es peor que haberle dicho que viniera otro día.
5. RECOGIDA POR OTRA PERSONA: Si preguntan si alguien más puede recoger los lentes en su lugar, la respuesta es SÍ. Solo necesita mostrar el ticket de compra o decir el folio del pedido. NO pidas INE, carta poder, ni ningún otro documento — eso NO es necesario. Es un trámite simple.

VENTA DE LENTES DE CONTACTO POR WHATSAPP:
Puedes vender lentes de contacto por WhatsApp. Cuando un cliente quiera comprar LC:
1. Pregunta qué marca/tipo usa. Invítalo a enviar FOTO de su caja de LC o receta (el sistema lee fotos automáticamente).
2. Si el sistema detectó datos de foto (verás "[LC-OCR]" en el historial), usa esos datos para recomendar el producto exacto o la alternativa más cercana.
3. Busca en el catálogo y muestra opciones con precio.
4. Pregunta cuántas cajas necesita. Recomienda cantidad según frecuencia: mensuales=6 cajas/año mínimo, quincenales=12/año.
5. Pregunta en qué sucursal quiere recoger (Américas, Pinocelli, o Magnolia).
6. Da el resumen con total y ofrece formas de pago. SIEMPRE ofrece PRIMERO la transferencia (sin comisiones):
   💰 Transferencia BBVA (sin comisión): Cuenta 0485220280 / CLABE 012164004852202892
   💳 O pago con tarjeta: https://clip.mx/@caryera
   Si preguntan por el nombre del beneficiario, aparece como "Ivonne Yamilez Alvidrez Flores". Confirma que ES la cuenta correcta de Ópticas Car y Era, es la cuenta de la empresa.
7. Cuando el cliente confirme que quiere proceder, usa el comando especial CREAR_VENTA al final de tu respuesta (el sistema lo detectará).
   Formato exacto: CREAR_VENTA|nombre del cliente|producto|cantidad|total|sucursal_entrega
   Ejemplo: CREAR_VENTA|Juan Pérez|AIR OPTIX HYDRAGLYDE (ESFERICOS)|2|2080|Américas
IMPORTANTE: NUNCA muestres el comando CREAR_VENTA al cliente. Solo inclúyelo en tu mensaje cuando el cliente confirme la compra.
NUNCA crees una venta sin que el cliente haya confirmado explícitamente que quiere comprar.

FOTOS DE LC: Si un cliente envía foto, el sistema la procesa automáticamente y muestra los datos extraídos + productos del catálogo.
Si ves "[LC-OCR]" en el historial, significa que se extrajo graduación de una foto. Usa esos datos para hacer recomendaciones precisas.
Si ves "[FOTO-OTRA]" en el historial, el cliente mandó una imagen que NO es caja de LC, receta ni promo (un sticker, saludo, selfie u objeto). NO digas que detectaste una receta ni una graduación, NO inventes datos. Continúa la conversación con naturalidad y pregunta en qué le puedes ayudar.
Si la marca/modelo no está en catálogo, recomienda la alternativa más cercana y explica por qué es similar.

CONVERSIÓN RX OFTÁLMICA → LENTES DE CONTACTO:
La graduación de una receta oftálmica (armazón) NO es igual a la de LC. Reglas:
1. Los LC tóricos vienen en pasos de CYL: la mayoría en -0.75, -1.25, -1.75, -2.25, -2.75. Algunas marcas ofrecen -0.50 a -0.50 steps.
2. Si el CYL del paciente es -1.50, el LC tórico más cercano es -1.25 o -1.75 — AMBOS son opciones válidas (el optometrista decide cuál).
3. La esfera también se redondea al paso más cercano de 0.25 disponible en el producto.
4. NUNCA digas que una graduación "no está disponible" si cae dentro del rango del producto (PWR min a max, CYL disponibles). Ejemplo: si un tórico cubre CYL de -0.75 a -2.75, una Rx de CYL -1.50 SÍ es compatible — se ajusta al step más cercano en sucursal.
5. Si la Rx cae fuera del rango del producto (ej: esfera -10.00 cuando el máximo es -8.00), ENTONCES sí di que esa marca no cubre esa graduación y sugiere Biofinity XR u otra opción de rango extendido.
6. SIEMPRE di "en sucursal te hacen el ajuste fino de graduación para LC" — tú solo das opciones de precio y marca.

INVENTARIO Y DISPONIBILIDAD:
NUNCA confirmes que hay producto en stock ni digas "probablemente tenemos" o "lo más probable es que tengamos". NO tienes acceso al inventario real.
Si preguntan si hay disponibilidad → "Pásate a la sucursal y ahí te confirman disponibilidad" o "Puedes llamar a la sucursal para confirmar".
NUNCA digas "seguro los tienen", "los tenemos listos", ni nada que implique que sabes qué hay en inventario.

PLAN DE SUSCRIPCIÓN LC:
Es un plan de COMPRA AUTOMÁTICA para clientes que usan lentes de contacto seguido. Así funciona:
- El cliente registra su tarjeta y elige cada cuánto necesita lentes (mensual, bimestral o trimestral).
- Cada que le toca, se COBRA AUTOMÁTICAMENTE de su tarjeta y sus lentes se preparan en la sucursal que eligió. Solo pasa a recogerlos, sin hacer pedido ni estar pendiente.
- NO es un recordatorio — es una compra real automática. El cobro se hace solo.
- Por suscribirse tiene 10% de descuento permanente en sus lentes de contacto (los que compran normal no lo tienen).
- Puede cambiar graduación, marca, sucursal o cancelar en cualquier momento por WhatsApp, sin compromiso.
- La suscripción en sí NO tiene costo extra, el 10% de descuento es el beneficio.
- Si su graduación cambia, pasa a sucursal para examen incluido y actualizamos su suscripción.
IMPORTANTE: Cuando pregunten por la suscripción, explica TODO claro: SÍ es cobro automático con tarjeta, dilo directo. NO es un recordatorio ni una notificación — es que se cobra solo y los lentes se preparan. Resalta el 10% de descuento como gancho principal.

RECORDATORIO DE RECOMPRA (clientes SIN suscripción):
Al vender LC, calcula cuándo se le van a acabar (cajas × pares × frecuencia en días).
El sistema registra automáticamente la fecha de recompra y enviará recordatorio por WhatsApp 7 días antes.
Menciona esto al cliente: "Te recordaremos cuando sea tiempo de renovar tus lentes 😊"

RESPUESTA A RECORDATORIO DE RECOMPRA:
Si ves "[LC-Recompra]" en el historial reciente, significa que el sistema envió un recordatorio automático de recompra.
Cuando el cliente responda:
- "SI" / "sí" / "ok" / "quiero" / "mándame" → Procede como venta: confirma el producto, cantidad (misma que antes o pregunta), sucursal de entrega, y da total con formas de pago. Usa CREAR_VENTA cuando confirme.
- Pregunta por precio / cotización → Muestra precio del producto y ofrece ordenar.
- Dice que necesita nueva graduación / ve borroso / cambió su vista → Invítalo a sucursal para examen de vista GRATUITO (incluido al comprar lentes con armazón o lentes de contacto). Ofrece tener los lentes listos el mismo día del examen si la graduación es la misma.
- Dice que no / todavía tiene → Responde amablemente, pregunta cuándo le gustaría que le recordemos.
SIEMPRE prioriza la venta primero. La sucursal es el plan B.`;

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
// Format: {"phone": timestamp_ms, ...} — auto-expires after 2h of no admin interaction
const BOT_OFF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function isBotDisabled(phone) {
  try {
    var cfg = await supaFetch('app_config?id=eq.bot_disabled_conversations&select=value');
    if (!cfg || !cfg[0] || !cfg[0].value) return false;
    var map = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
    // Backward compat: if array, treat as disabled without expiry check
    if (Array.isArray(map)) {
      if (map.indexOf(String(phone)) !== -1) return true;
      return false;
    }
    if (typeof map !== 'object') return false;
    var ts = map[String(phone)];
    if (!ts) return false;
    // Auto-expire after 2h
    if (Date.now() - ts > BOT_OFF_TTL_MS) {
      // Remove expired entry
      delete map[String(phone)];
      try {
        await supaFetch('app_config?id=eq.bot_disabled_conversations', {
          method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(map) }), prefer: 'return=minimal'
        });
      } catch(e2) {}
      console.log('[Bot Auto-Reactivated] ' + phone + ' — 2h sin interacción admin');
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
    await supaFetch('app_config?id=eq.bot_disabled_conversations', {
      method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(map) }), prefer: 'return=minimal'
    });
    console.log('[Bot Disabled] ' + phone);
  } catch(e) { console.error('[Bot Disable Error]', e.message); }
}

// ── COMPLAINT DETECTION ──
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

// Muletillas corteses que contienen keywords de queja pero NO son quejas reales
// Ej: "disculpe la molestia", "perdón las molestias" = cortesía, no queja
var POLITENESS_PATTERNS = [
  /(disculp|perdon|perdón|siento|lament|spero no)\w*\s+(la|las|mi|cualquier|alguna|esta|el)?\s*molest/i,
  /molest[oaá](r|rlo|rla|rte|rles)\b/i, // "no quiero molestarte/molestarlos"
  /sin\s+molest/i, // "sin molestar"
  /una\s+molest/i // "una molestia pequeña" — cortesía
];

function isComplaintMessage(text) {
  if (!text) return false;
  var lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Detectar match de keyword
  var matched = COMPLAINT_KEYWORDS.some(function(kw) {
    return lower.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  });
  if (!matched) return false;

  // Si el ÚNICO match es 'molest' y la frase es una muletilla cortés, NO es queja
  var onlyMolest = COMPLAINT_KEYWORDS
    .filter(function(kw) { return kw !== 'molest'; })
    .every(function(kw) { return !lower.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')); });
  if (onlyMolest) {
    var isPoliteness = POLITENESS_PATTERNS.some(function(rx) { return rx.test(text); });
    if (isPoliteness) return false;
  }

  return true;
}

async function getClariConfig() {
  try {
    var data = await supaFetch('app_config?id=eq.clari_config&select=value');
    if (data && data[0] && data[0].value) {
      var v = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
      return { personality: v.personality || DEFAULT_PERSONALITY, knowledge: v.knowledge || DEFAULT_KNOWLEDGE, promo_override: v.promo_override || '' };
    }
  } catch(e) { console.error('[Config Error]', e); }
  return { personality: DEFAULT_PERSONALITY, knowledge: DEFAULT_KNOWLEDGE, promo_override: '' };
}

// ── ORDER STATUS LOOKUP ──
async function lookupOrders(phone, text) {
  if (!SERVICE_KEY) return null;
  var results = [];
  var cleanPhone = phone.replace(/^\+?52/, '').replace(/^1/, '');
  console.log('[OrderLookup] phone=' + phone + ' cleanPhone=' + cleanPhone + ' text=' + text.substring(0, 50));

  // 1. Try by phone number (the sender's WhatsApp number)
  if (cleanPhone.length === 10) {
    var patients = await supaFetch('pacientes?telefono=ilike.*' + cleanPhone + '*&select=id,nombre,apellidos,telefono&limit=5');
    console.log('[OrderLookup] phone search: ' + (patients ? patients.length : 'null') + ' patients');
    if (patients && patients.length > 0) {
      var patIds = patients.map(function(p) { return p.id; });
      var orders = await supaFetch('ordenes_laboratorio?paciente_id=in.(' + patIds.join(',') + ')&estado_lab=neq.Entregado&select=*,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=10');
      console.log('[OrderLookup] orders by phone: ' + (orders ? orders.length : 'null'));
      if (orders && orders.length > 0) results = results.concat(orders);
    }
  }

  // 2. Try by folio if message contains a number (numérico 10538 o prefijado V0001)
  var folioMatch = text.match(/\b(V?\d{4,6})\b/i);
  if (folioMatch) {
    var folio = folioMatch[1].toUpperCase();
    var byFolio = await supaFetch('ordenes_laboratorio?notas_laboratorio=ilike.*Folio: ' + folio + '*&select=*,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=5');
    console.log('[OrderLookup] folio "' + folio + '": ' + (byFolio ? byFolio.length : 'null'));
    if (byFolio && byFolio.length > 0) {
      byFolio.forEach(function(o) {
        if (!results.find(function(r) { return r.id === o.id; })) results.push(o);
      });
    }
  }

  // 3. Try by name if message has a name-like text (only if no results yet)
  if (results.length === 0) {
    // Skip common Spanish stopwords to find actual name words
    var _stopwords = ['esta','estan','están','nombre','llamo','soy','hola','buenos','buenas','dias','días','tardes','noches','mis','lentes','pedido','orden','folio','quiero','saber','confirmar','recoger','para','que','los','las','por','favor','con','del','una','unos','como','donde','dónde','cuando','cuándo','tiene','tienen','puede','solo','solo','gracias','sobre','bajo','pendiente','pagar','debo','saldo','adeudo','abono','cobro','liquidar','cuánto','cuanto','queda','tengo','quería','querría','comunico'];
    var nameWords = text.replace(/[^\wáéíóúñü\s]/gi, '').split(/\s+/).filter(function(w) {
      return w.length >= 3 && _stopwords.indexOf(w.toLowerCase()) === -1;
    });
    console.log('[OrderLookup] trying name search, words: ' + nameWords.join(', '));
    if (nameWords.length >= 1) {
      for (var i = 0; i < Math.min(nameWords.length, 2); i++) {
        var word = nameWords[i];
        var byName = await supaFetch('pacientes?or=(nombre.ilike.*' + word + '*,apellidos.ilike.*' + word + '*)&select=id,nombre,apellidos&limit=10');
        console.log('[OrderLookup] name "' + word + '": ' + (byName ? byName.length : 'null') + ' patients');
        if (byName && byName.length > 0 && byName.length <= 8) {
          var nameIds = byName.map(function(p) { return p.id; });
          var nameOrders = await supaFetch('ordenes_laboratorio?paciente_id=in.(' + nameIds.join(',') + ')&estado_lab=neq.Entregado&select=*,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=5');
          console.log('[OrderLookup] orders by name: ' + (nameOrders ? nameOrders.length : 'null'));
          if (nameOrders && nameOrders.length > 0) results = results.concat(nameOrders);
          break;
        }
      }
    }
  }

  // 4. Scan conversation history for folios (e.g. from review surveys)
  if (results.length === 0) {
    try {
      var histMsgs = await supaFetch('clari_conversations?phone=eq.' + phone + '&select=content&order=created_at.desc&limit=20');
      if (histMsgs && histMsgs.length > 0) {
        var histFolios = {};
        histMsgs.forEach(function(m) {
          var matches = (m.content || '').match(/Folio:\s*(V?\d{4,6}(?:-\d+)?)/gi);
          if (matches) matches.forEach(function(fm) {
            var f = fm.replace(/Folio:\s*/, '').replace(/-\d+$/, '');
            histFolios[f] = true;
          });
        });
        var hfKeys = Object.keys(histFolios);
        console.log('[OrderLookup] history folios: ' + hfKeys.join(', '));
        for (var hi = 0; hi < hfKeys.length && results.length === 0; hi++) {
          var hf = hfKeys[hi];
          var histOrders = await supaFetch('ordenes_laboratorio?notas_laboratorio=ilike.*Folio: ' + hf + '*&select=*,pacientes(nombre,apellidos,telefono)&order=created_at.desc&limit=5');
          if (histOrders && histOrders.length > 0) results = results.concat(histOrders);
        }
      }
    } catch(e) { console.error('[OrderLookup] history scan error:', e); }
  }

  // 5. Lookup SICAR credits (creditos_clientes) by patient IDs
  var sicarCredits = [];
  try {
    // Collect patient IDs from orders found so far
    var creditPatIds = {};
    results.forEach(function(o) { if (o.paciente_id) creditPatIds[o.paciente_id] = true; });
    // Also search by phone directly
    if (cleanPhone.length === 10) {
      var phonePats = await supaFetch('pacientes?telefono=ilike.*' + cleanPhone + '*&select=id&limit=5');
      if (phonePats) phonePats.forEach(function(p) { creditPatIds[p.id] = true; });
    }
    var cpIds = Object.keys(creditPatIds);
    if (cpIds.length > 0) {
      var credits = await supaFetch('creditos_clientes?paciente_id=in.(' + cpIds.join(',') + ')&saldo=gt.0&select=folio_sicar,total,total_abonos,saldo,sucursal,fecha_vencimiento,paciente_id,pacientes(nombre,apellidos)&order=created_at.desc&limit=5');
      if (credits && credits.length > 0) {
        sicarCredits = credits;
        console.log('[OrderLookup] SICAR credits found: ' + credits.length);
      }
    }
    // Also search by phone in notas field of creditos_clientes
    if (sicarCredits.length === 0 && cleanPhone.length === 10) {
      var creditsByPhone = await supaFetch('creditos_clientes?notas=ilike.*' + cleanPhone + '*&saldo=gt.0&select=folio_sicar,total,total_abonos,saldo,sucursal,fecha_vencimiento,paciente_id,pacientes(nombre,apellidos)&limit=5');
      if (creditsByPhone && creditsByPhone.length > 0) {
        sicarCredits = creditsByPhone;
        console.log('[OrderLookup] SICAR credits by phone in notas: ' + creditsByPhone.length);
      }
    }
  } catch(e) { console.error('[OrderLookup] SICAR credit lookup error:', e); }

  if (results.length === 0 && sicarCredits.length === 0) { console.log('[OrderLookup] no results found'); return null; }

  // Deduplicate
  var seen = {};
  results = results.filter(function(o) {
    if (seen[o.id]) return false;
    seen[o.id] = true;
    return true;
  });

  // Enrich with sale data (total, saldo, estado pago)
  var folios = results.map(function(o) {
    return (o.notas_laboratorio || '').match(/Folio: ([^\s|]+)/);
  }).filter(Boolean).map(function(m) { return m[1]; });
  // Extract base folios (15698 from 15698-2, 15698-3, etc.)
  var baseFolios = {};
  folios.forEach(function(f) { baseFolios[f.replace(/-\d+$/, '')] = true; });
  var ventasMap = {};
  var baseKeys = Object.keys(baseFolios);
  if (baseKeys.length > 0) {
    for (var vi = 0; vi < baseKeys.length; vi++) {
      var vf = baseKeys[vi];
      var ventas = await supaFetch('ventas?folio=eq.' + vf + '&select=folio,total,pagado,saldo,estado,token_portal&limit=1');
      if (ventas && ventas.length > 0) ventasMap[vf] = ventas[0];
    }
  }
  // Also check creditos_clientes for base folios not found in ventas
  if (baseKeys.length > 0) {
    for (var ci = 0; ci < baseKeys.length; ci++) {
      var cf = baseKeys[ci];
      if (!ventasMap[cf]) {
        var creditByFolio = await supaFetch('creditos_clientes?folio_sicar=eq.' + cf + '&saldo=gt.0&select=folio_sicar,total,total_abonos,saldo,sucursal,fecha_vencimiento&limit=1');
        if (creditByFolio && creditByFolio.length > 0) {
          ventasMap[cf] = { folio: cf, total: creditByFolio[0].total, pagado: creditByFolio[0].total_abonos || 0, saldo: creditByFolio[0].saldo, estado: 'Crédito SICAR pendiente', es_sicar: true };
        }
      }
    }
  }
  console.log('[OrderLookup] enriched with ' + Object.keys(ventasMap).length + ' ventas/creditos');

  // Format for AI context — orders
  var formatted = results.map(function(o) {
    var nombre = o.pacientes ? (o.pacientes.nombre + ' ' + (o.pacientes.apellidos || '')).trim() : 'Cliente';
    var notas = o.notas_laboratorio || '';
    var folio = (notas.match(/Folio: ([^\s|]+)/) || [])[1] || 'S/N';
    var estado = o.estado_lab || 'Desconocido';
    var statusInfo = STATUS_MAP[estado] || { emoji: '📋', msg: 'Tu pedido está siendo procesado.' };
    var sucursal = o.sucursal || '';
    var fecha = new Date(o.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    var baseFolio = folio.replace(/-\d+$/, '');
    var venta = ventasMap[baseFolio] || null;
    // Plaza Vía Vittoria no abre domingos (v462): en su mensaje de pedido listo, no ofrezcas el domingo.
    // ⚠️ AL REABRIR VITTORIA LOS DOMINGOS: quitar este reemplazo.
    var msgCliente = statusInfo.msg;
    if ((sucursal || '').toLowerCase().indexOf('vittoria') !== -1) {
      msgCliente = msgCliente.replace(/, domingos 11am-5pm/gi, ' (esta sucursal no abre domingos)');
    }
    var result = {
      nombre: nombre,
      folio: folio,
      estado: estado,
      emoji: statusInfo.emoji,
      mensaje_cliente: msgCliente,
      sucursal: sucursal,
      fecha: fecha
    };
    if (venta) {
      result.total_venta = venta.total;
      result.pagado = venta.pagado;
      result.saldo = venta.saldo;
      result.estado_pago = venta.estado;
      // Si tiene saldo pendiente y portal de ticket, el abono va POR AHÍ (se liga a su folio y se registra).
      if (venta.saldo > 0 && venta.token_portal && !venta.es_sicar) {
        result.portal_pago = 'https://caryera.mx/portal.html?t=' + venta.token_portal;
      }
    }
    return result;
  });

  // Add SICAR credits not already covered by order folios
  var coveredFolios = {};
  formatted.forEach(function(o) { coveredFolios[o.folio.replace(/-\d+$/, '')] = true; });
  sicarCredits.forEach(function(sc) {
    if (!coveredFolios[sc.folio_sicar]) {
      var nombre = sc.pacientes ? (sc.pacientes.nombre + ' ' + (sc.pacientes.apellidos || '')).trim() : 'Cliente';
      formatted.push({
        nombre: nombre,
        folio: 'SICAR-' + sc.folio_sicar,
        estado: 'Crédito SICAR',
        emoji: '💳',
        mensaje_cliente: 'Tienes un saldo pendiente de este crédito.',
        sucursal: sc.sucursal || '',
        fecha: sc.fecha_vencimiento ? 'Vence: ' + new Date(sc.fecha_vencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
        total_venta: sc.total,
        pagado: sc.total_abonos || 0,
        saldo: sc.saldo,
        estado_pago: 'Crédito SICAR pendiente'
      });
    }
  });

  return formatted;
}

function isAskingAboutOrder(text) {
  var lower = text.toLowerCase();
  var keywords = ['pedido', 'orden', 'listo', 'listos', 'lentes', 'status', 'estado', 'entrega', 'recoger', 'folio', 'cuando', 'cuándo', 'demora', 'tarda', 'avance', 'proceso', 'ya están', 'ya estan', 'ya mero', 'falta', 'tiempo', 'pagar', 'debo', 'pendiente', 'saldo', 'adeudo', 'abono', 'cobro', 'cuánto debo', 'cuanto debo', 'liquidar'];
  return keywords.some(function(kw) { return lower.includes(kw); }) || /\bV?\d{4,6}\b/i.test(text);
}

// Detect if user is providing name/folio as follow-up to a previous order inquiry
function isOrderFollowUp(history) {
  if (!history || history.length < 2) return false;
  // Check last 4 messages for Clari asking for name/folio
  var recent = history.slice(-4);
  for (var i = 0; i < recent.length; i++) {
    if (recent[i].role === 'assistant') {
      var c = (recent[i].content || '').toLowerCase();
      if ((c.includes('nombre') || c.includes('folio')) && (c.includes('pedido') || c.includes('ubicarte') || c.includes('buscar') || c.includes('revisar'))) {
        return true;
      }
    }
  }
  return false;
}

// ── CONVERSATION HISTORY ──
async function getConversationHistory(phone) {
  if (!SERVICE_KEY) return [];
  try {
    var data = await supaFetch('clari_conversations?phone=eq.' + phone + '&select=role,content,created_at&order=created_at.desc&limit=10');
    if (!data) return [];
    return data.reverse().map(function(m) { return { role: m.role, content: m.content }; });
  } catch(e) { return []; }
}

// ── Upload Twilio media to Supabase Storage for persistent chat images ──
var CHAT_BUCKET = 'chat-media';
async function ensureChatBucket() {
  try {
    var check = await fetch(SUPA_URL + '/storage/v1/bucket/' + CHAT_BUCKET, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    });
    if (check.ok) return;
    await fetch(SUPA_URL + '/storage/v1/bucket', {
      method: 'POST',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: CHAT_BUCKET, name: CHAT_BUCKET, public: true })
    });
  } catch(e) { console.error('[ChatBucket]', e.message); }
}

async function uploadChatMedia(twilioUrl, contentType, phone) {
  try {
    // Download from Twilio (requires auth)
    var imgRes = await fetch(twilioUrl, {
      headers: { 'Authorization': twilioAuth() }
    });
    if (!imgRes.ok) { console.error('[UploadMedia] Twilio download failed:', imgRes.status); return null; }
    var imgBuf = Buffer.from(await imgRes.arrayBuffer());
    // Generate filename
    var ext = (contentType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
    var fname = phone.replace(/\D/g,'') + '_' + Date.now() + '.' + ext;
    await ensureChatBucket();
    // Upload to Supabase Storage
    var upRes = await fetch(SUPA_URL + '/storage/v1/object/' + CHAT_BUCKET + '/' + fname, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': contentType || 'image/jpeg',
        'x-upsert': 'true'
      },
      body: imgBuf
    });
    if (!upRes.ok) { console.error('[UploadMedia] Storage upload failed:', upRes.status); return null; }
    return SUPA_URL + '/storage/v1/object/public/' + CHAT_BUCKET + '/' + fname;
  } catch(e) { console.error('[UploadMedia]', e.message); return null; }
}

async function saveMessage(phone, role, content, userName, viaPhoneId) {
  if (!SERVICE_KEY) return;
  try {
    var payload = { phone: phone, role: role, content: content, user_name: userName || null };
    if (viaPhoneId) payload.via_phone_id = viaPhoneId;
    await supaFetch('clari_conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
      prefer: 'return=minimal'
    });
  } catch(e) { console.error('[Save Error]', e); }
}

async function cleanOldMessages() {
  if (!SERVICE_KEY) return;
  try {
    var cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supaFetch('clari_conversations?created_at=lt.' + cutoff, { method: 'DELETE', prefer: 'return=minimal' });
  } catch(e) {}
}

// ── AI RESPONSE ──
async function getAIResponse(userMessage, userName, phone, viaPhoneId) {
  var config = await getClariConfig();
  // Fecha y hora actual en Cd. Juárez para contexto
  var nowMx = new Date().toLocaleString('es-MX', { timeZone: 'America/Chihuahua', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  var todayWeekday = new Date().toLocaleString('es-MX', { timeZone: 'America/Chihuahua', weekday: 'long' });
  // Inject dynamic promos into knowledge (promo_override from cmdPromo takes priority)
  var promoText = config.promo_override || getActivePromos();
  var knowledgeWithPromos = config.knowledge.replace('{{PROMOS_PLACEHOLDER}}', promoText);
  // Override horario por días especiales (cierres anticipados, festivos)
  var todayChi = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
  // Estado date-gated de la nueva sucursal Plaza Vía Vittoria (inaugura 2026-05-30)
  var _vittoriaStatus;
  if (todayChi < '2026-05-30') {
    _vittoriaStatus = '🆕 SOBRE PLAZA VÍA VITTORIA (MUY IMPORTANTE): esta sucursal ABRE HASTA MAÑANA, el 30 de mayo de 2026 — HOY TODAVÍA NO ESTÁ ABIERTA. Si alguien pregunta por sucursales o por esa zona, SÍ puedes mencionarla con entusiasmo, PERO SIEMPRE aclara en el MISMO mensaje que abre hasta mañana 30 de mayo (para que no vaya hoy y la encuentre cerrada). NUNCA digas que ya pueden visitarla hoy ni que ya está abierta.';
  } else if (todayChi === '2026-05-30') {
    _vittoriaStatus = '🎉 SOBRE PLAZA VÍA VITTORIA — ¡HOY ES LA INAUGURACIÓN (30 de mayo de 2026)! Es nuestra sucursal MÁS NUEVA y RECIÉN INAUGURADA. SIEMPRE que alguien pregunte por ubicaciones, por dónde estamos, o no sepa a cuál sucursal ir, DESTÁCALA con entusiasmo como la que abre HOY e invítalos a ser de los primeros en conocerla (con más razón si están por la zona de Av. Ejército Nacional / a un lado de Farmacias Similares). Ya está abierta con horario normal. 🎁 PROMO DE INAUGURACIÓN (SOLO Plaza Vía Vittoria, para los primeros clientes): el lente solar graduado adicional va GRATIS — NO se cobra el costo extra. Ofrécela como gancho de apertura a quien pregunte por esta sucursal o se interese en visitarla. Profesional y breve (1-3 líneas), sin exagerar ni sonar a spam.';
  } else {
    _vittoriaStatus = '🆕 SOBRE PLAZA VÍA VITTORIA: es nuestra sucursal MÁS NUEVA (inaugurada el 30 de mayo de 2026), ya abierta con horario normal. Cuando pregunten por ubicaciones o estén indecisos sobre a cuál ir, SUGIÉRELA con entusiasmo como la opción más nueva (sobre todo si están por la zona de Av. Ejército Nacional / Farmacias Similares). 🎁 PROMO DE APERTURA (SOLO Plaza Vía Vittoria, para los primeros clientes): el lente solar graduado adicional va GRATIS, sin costo extra — menciónala como gancho a quien pregunte por esta sucursal. NO digas que "abre mañana" ni que aún no abre. Profesional y breve.';
  }
  // Plaza Vía Vittoria descansa los DOMINGOS (hasta nuevo aviso): en domingo NO se promueve y se encamina a las otras 3.
  var esDomingo = (todayWeekday || '').toLowerCase().indexOf('domingo') !== -1;
  if (esDomingo) {
    _vittoriaStatus = '⚠️ HOY ES DOMINGO y Plaza Vía Vittoria está CERRADA los domingos (hasta nuevo aviso). Las otras 3 (Plaza de las Américas, Plaza Pinocelli, Plaza Magnolia) SÍ abren hoy de 11am a 5pm. HOY: NO promuevas ni sugieras Vittoria como opción para visitar; si el cliente pregunta por Vittoria o quiere ir a Vittoria hoy, avísale amable y breve que los domingos está cerrada y ofrécele Américas, Pinocelli o Magnolia. Vittoria vuelve a abrir mañana (lunes) en horario normal.';
  }
  knowledgeWithPromos = knowledgeWithPromos.replace('{{NUEVA_SUCURSAL_STATUS}}', _vittoriaStatus);
  var horarioOverride = '';
  if (esDomingo) {
    horarioOverride += '\n⚠️ HOY (domingo): Plaza Vía Vittoria está CERRADA. Abren SOLO Américas, Pinocelli y Magnolia, de 11am a 5pm. Si preguntan por Vittoria o a cuál pueden ir hoy, encamínalos a esas 3. NUNCA invites a alguien a ir HOY a Vittoria.';
  }
  // (Aquí van avisos de horario especial date-gated puntuales — cierres por festivo, etc. Se agregan
  //  con `if (todayChi === 'AAAA-MM-DD') { horarioOverride += '...'; }` y se quitan cuando pasan.)
  var systemPrompt = config.personality + '\n\nFECHA Y HORA ACTUAL EN CHIHUAHUA: ' + nowMx + '\nHOY ES ' + todayWeekday.toUpperCase() + '. NUNCA inventes el día de la semana — usa este. Horario: lunes a sábado 10am-7pm, domingos 11am-5pm. Si HOY no es domingo, NO digas "hoy domingo".' + horarioOverride + '\n\nINFORMACIÓN DEL NEGOCIO:\n' + knowledgeWithPromos;

  // Get conversation history early (needed for order follow-up detection)
  var history = await getConversationHistory(phone);

  // Check if asking about order and lookup
  var orderContext = '';
  var shouldLookupOrder = isAskingAboutOrder(userMessage);
  // Also trigger lookup if conversation shows Clari asked for name/folio (follow-up)
  if (!shouldLookupOrder && isOrderFollowUp(history)) {
    shouldLookupOrder = true;
    console.log('[OrderLookup] triggered by follow-up detection');
  }
  if (shouldLookupOrder) {
    var orders = await lookupOrders(phone, userMessage);
    if (orders && orders.length > 0) {
      orderContext = '\n\nPEDIDOS ENCONTRADOS PARA ESTE CLIENTE:\n';
      // Group by base folio to show sale info once
      var shownSale = {};
      orders.forEach(function(o, i) {
        orderContext += (i + 1) + '. ' + o.nombre + ' — Folio: ' + o.folio + '\n';
        orderContext += '   Estado: ' + o.emoji + ' ' + o.estado + ' — ' + o.mensaje_cliente + '\n';
        orderContext += '   Sucursal: ' + o.sucursal + ' | Fecha orden: ' + o.fecha + '\n';
        // Show sale data once per base folio
        var baseFolio = o.folio.replace(/-\d+$/, '');
        if (o.total_venta && !shownSale[baseFolio]) {
          shownSale[baseFolio] = true;
          orderContext += '   Venta folio ' + baseFolio + ': Total $' + Number(o.total_venta).toLocaleString('es-MX') + ' | Pagado $' + Number(o.pagado).toLocaleString('es-MX') + ' | Saldo $' + Number(o.saldo).toLocaleString('es-MX') + ' | ' + o.estado_pago + '\n';
          if (o.portal_pago) {
            orderContext += '   portal_pago (para abonar en línea, se registra a este folio): ' + o.portal_pago + '\n';
          }
        }
      });
      orderContext += '\nINSTRUCCIONES IMPORTANTES SOBRE PEDIDOS:\n' +
        '- TÚ TIENES TODA LA INFORMACIÓN. Responde directamente con los datos que ves arriba.\n' +
        '- PROHIBIDO decir "contacta a la sucursal", "llama a la sucursal", "te recomiendo visitar" o cualquier variante. Tú eres quien da la información.\n' +
        '- PROHIBIDO pedir nombre o folio si ya encontraste pedidos arriba.\n' +
        '- Usa el mensaje_cliente como base para responder. NO inventes información adicional.\n' +
        '- NUNCA digas que los lentes están listos o casi listos a menos que el estado sea "Recibido en óptica" o "Listo para entrega".\n' +
        '- Para CUALQUIER otro estado, deja claro que TODAVÍA NO están listos y que le avisaremos cuando lo estén.\n' +
        '- Si hay saldo pendiente (saldo > 0), menciónalo amablemente.\n' +
        '- Si el cliente pregunta cómo abonar/pagar en línea y arriba viene "portal_pago" para su folio, DALE ESE LINK (ahí su abono se registra a su compra). ⛔ NUNCA le mandes el link general https://clip.mx/@caryera para un abono — ese no se liga a su folio. No necesita ir a la sucursal para abonar en línea.\n' +
        '- Si la venta está Liquidada y los lentes están listos, dile que pase a recogerlos a la sucursal (solo el nombre, ej: "Magnolia").\n' +
        '- El cliente YA ES CLIENTE EXISTENTE — NO dar direcciones, referencias de ubicación, horarios ni teléfonos. Ya sabe dónde está la sucursal. Solo mencionar el nombre.\n' +
        '- NO uses formato markdown (negritas, listas). Solo texto plano con emojis.\n' +
        '- Sé honesta sobre el tiempo: si están en proceso, di que están en proceso. No generes falsas expectativas.\n' +
        '- Incluye el folio para referencia del cliente.\n' +
        '- Si hay múltiples folios del mismo paciente (ej: 15698, 15698-2, 15698-3), son parte de la misma compra (promo 3x1). Resume el estado general en vez de repetir cada uno.';
    } else {
      orderContext = '\n\nBÚSQUEDA DE PEDIDO: No se encontraron pedidos activos para este número de teléfono ni con la información proporcionada.\n' +
        'INSTRUCCIONES (seguir en orden):\n' +
        '1. Si el cliente dio solo nombre: pide su NÚMERO DE FOLIO (aparece en su ticket de compra) o su NÚMERO DE TELÉFONO registrado en la compra para buscarlo mejor.\n' +
        '2. Si ya dio nombre Y folio/teléfono y no hay resultados: dile que no encontraste pedidos con esos datos, puede que esté registrado con otro nombre o teléfono. Pregunta si tiene su ticket de compra a la mano.\n' +
        '3. Solo como ÚLTIMO RECURSO (después de 2+ intentos fallidos): invítalo a pasar a sucursal (solo el nombre, sin direcciones ni referencias — ya es cliente, ya sabe dónde está).\n' +
        '4. NUNCA redirigir a sucursal en el primer intento sin haber pedido folio Y teléfono primero.\n' +
        '5b. NUNCA dar direcciones, referencias de ubicación, horarios ni teléfonos a alguien que pregunta por su pedido — ya es cliente, ya sabe dónde queda.\n' +
        '5. Si el cliente dice que ya recibió un mensaje/WhatsApp avisando que sus lentes están listos: confirmar que SÍ somos nosotros (Ópticas Car & Era) y que el mensaje es válido. Pero aún así pide folio o teléfono para confirmar el estado exacto en el sistema.\n' +
        'NUNCA menciones el número 657-299-1038.';
    }
    systemPrompt += orderContext;
  }

  // Check if asking about LC — add catalog context
  if (isAskingAboutLC(userMessage)) {
    var lcProducts = await lookupLCCatalog(userMessage);
    if (lcProducts && lcProducts.length > 0) {
      var lcContext = '\n\nCATÁLOGO LENTES DE CONTACTO ENCONTRADOS:\n';
      lcProducts.forEach(function(p, i) {
        var info = (i + 1) + '. ' + p.nombre + ' — $' + Number(p.precio_venta).toFixed(0) + '/caja';
        if (p.pares_por_caja) info += ' (' + p.pares_por_caja + ' pares, cambio c/' + (p.frecuencia_cambio_dias||30) + 'd)';
        if (p.stock !== null && p.stock !== undefined) info += p.stock > 0 ? ' ✅ En stock' : ' ⏳ Sobre pedido';
        lcContext += info + '\n';
      });
      lcContext += '\nMuestra los productos relevantes con precio. Si el cliente quiere comprar, sigue el flujo de venta de LC por WhatsApp.';
      systemPrompt += lcContext;
    }
  }

  // Check for Magnolia Reactivation context in recent history
  var hasMagReactivation = false;
  for (var mr = 0; mr < Math.min(history.length, 10); mr++) {
    if (history[mr].content && history[mr].content.indexOf('[Magnolia-Reactivation]') !== -1) {
      hasMagReactivation = true;
      break;
    }
  }
  if (hasMagReactivation) {
    systemPrompt += '\n\nCONTEXTO REACTIVACIÓN MAGNOLIA:\n' +
      'Este cliente fue contactado como parte de la campaña de reactivación de clientes de Magnolia. ' +
      'Es un cliente anterior que nos conocía en la ubicación vieja (Plaza La Nueva Esperanza, Montes Urales). Trátalo con especial calidez.\n' +
      '- ANTES estábamos en Plaza La Nueva Esperanza (Montes Urales) — YA NO\n' +
      '- AHORA estamos en Plaza Magnolia, sobre Av. Manuel J. Clouthier (Jilotepec)\n' +
      '- REFERENCIA PARA LLEGAR: está casi a la altura de Plaza El Reloj, frente a Tostadas El Primo, en una plaza nueva donde está Helados Trevly\n' +
      '- Link Google Maps: https://maps.app.goo.gl/HBomFDEfJJNPna697\n' +
      '- Promo vigente: usa la promoción actual del negocio (la que aparece en PROMOCIÓN VIGENTE arriba)\n' +
      '- Examen de vista incluido al comprar lentes (armazón o lentes de contacto)\n' +
      '- Lentes listos en 35 minutos (laboratorio propio)\n' +
      '- Horario: L-S 10am-7pm, Dom 11am-5pm | Tel: (656) 174-8866\n' +
      '- Si quiere agendar, toma nota de su nombre y horario preferido y confirma que le avisamos\n' +
      '- Menciona que nos mudamos para tener más espacio y atenderlos mejor\n\n' +
      'REGLAS DE TRATO REACTIVACIÓN:\n' +
      '- Si el cliente responde positivamente o con interés, dale toda la info (ubicación, promo, Maps link) con entusiasmo\n' +
      '- Si el cliente pregunta cómo llegar, SIEMPRE manda el link de Google Maps Y las referencias (Plaza El Reloj, Tostadas El Primo, Helados Trevly)\n' +
      '- Si el cliente se muestra DESINTERESADO, frío, o dice que no necesita nada: agradece amablemente, dile que aquí estamos cuando lo necesite, y NO INSISTAS más\n' +
      '- Si el cliente se muestra MOLESTO por el mensaje o pide que no le escriban: discúlpate brevemente, dile que no volveremos a molestar, y DEJA DE RESPONDER\n' +
      '- NUNCA envíes más de 2 mensajes seguidos sin respuesta del cliente — si no contesta, no insistas\n' +
      '- El objetivo es reconectar con calidez, NO presionar la venta';
  }

  // Check for LC Reactivation campaign context
  var hasLCReactivation = false;
  for (var lr = 0; lr < Math.min(history.length, 10); lr++) {
    if (history[lr].content && (history[lr].content.indexOf('[LC-Reactivacion]') !== -1 || history[lr].content.indexOf('[PIN-LC-Reactivacion]') !== -1)) {
      hasLCReactivation = true;
      break;
    }
  }
  if (hasLCReactivation) {
    // Lookup patient LC history for graduation data
    var lcHist = await lookupLCHistory(phone);
    var rxContext = '';
    if (lcHist && lcHist.lcRx) {
      var diasDesdeRx = Math.floor((Date.now() - new Date(lcHist.lcRx.fecha).getTime()) / 86400000);
      rxContext = '\n📋 GRADUACIÓN LC EN ARCHIVO:\n' +
        '- Marca anterior: ' + lcHist.lcRx.marca + '\n' +
        '- OD: ' + lcHist.lcRx.od + ' | OI: ' + lcHist.lcRx.oi + '\n' +
        (lcHist.lcRx.bc ? '- BC: ' + lcHist.lcRx.bc + ' | DIA: ' + lcHist.lcRx.dia + '\n' : '') +
        '- Fecha de graduación: ' + lcHist.lcRx.fecha.slice(0,10) + ' (' + diasDesdeRx + ' días atrás)\n' +
        (diasDesdeRx <= 365 ? '✅ Graduación RECIENTE (menos de 1 año) — se puede usar directamente\n' : '⚠️ Graduación tiene más de 1 año — recomendar verificar en sucursal\n');
    } else if (lcHist && lcHist.rx) {
      rxContext = '\n📋 GRADUACIÓN GENERAL EN ARCHIVO (no específica de LC):\n' +
        '- OD: ' + lcHist.rx.od + ' | OI: ' + lcHist.rx.oi + '\n' +
        '- Necesita conversión vertex para LC — invitar a sucursal si quiere verificar\n';
    } else {
      rxContext = '\n📋 NO hay graduación en archivo para este paciente — necesita examen en sucursal\n';
    }

    systemPrompt += '\n\nCONTEXTO CAMPAÑA REACTIVACIÓN LC:\n' +
      'Este cliente fue contactado porque es usuario de lentes de contacto que no ha comprado recientemente. ' +
      'Es un cliente anterior que ya nos conoce. Trátalo con calidez.\n' +
      rxContext +
      '\n⚠️ REGLA MÁS IMPORTANTE — RESPONDE LO QUE PREGUNTAN:\n' +
      'Si el cliente hace una pregunta específica (ej: "qué es el plan de suscripción?", "cuánto cuestan?", "dónde están?"), ' +
      'responde SOLO esa pregunta en 1-2 líneas. NO agregues saludo, NO hagas otra pregunta, NO cambies de tema. ' +
      'Después de responder, ESPERA. Si el cliente no pregunta nada, ahí sí sigue los pasos.\n\n' +
      '⚠️ REGLA CRÍTICA — UNA COSA A LA VEZ:\n' +
      'Responde CORTO (1-3 líneas máximo). UNA sola idea por mensaje. ' +
      'NUNCA juntes múltiples temas en un solo mensaje. ESPERA respuesta antes de avanzar.\n\n' +
      'OBJETIVO PRINCIPAL: CERRAR LA VENTA POR WHATSAPP. El cliente solo debe ir a sucursal a RECOGER, no a comprar.\n\n' +
      'PASOS (solo si el cliente NO hace una pregunta específica):\n' +
      'PASO 1: Saludo corto (1 línea) + pregunta: "¿En qué te puedo ayudar?" o "¿Qué necesitas?"\n' +
      'PASO 2: Si menciona lentes de contacto/graduación → pregunta si sigue con la misma graduación o necesita revisión. Si pregunta otra cosa → respóndela.\n' +
      'PASO 3: Si confirma graduación → pregunta marca/cantidad. Si necesita examen → invita a sucursal sin cita.\n' +
      'PASO 4: Cotiza el producto con precio. Ofrece hacer el pedido: "¿Te lo pedimos? Solo nos dices cuántas cajas y en qué sucursal recoges".\n' +
      'PASO 5: Si acepta → confirma producto, cantidad, sucursal, total. Ofrece pago: puede liquidar completo o anticipo del 50%. Formas de pago: transferencia BBVA o link de pago con tarjeta. NO hay opción de pagar al recoger. Usa CREAR_VENTA cuando confirme.\n' +
      'PASO 6: Solo después de cerrar la venta, menciona suscripción: "Por cierto, tenemos plan de compra automática — se cobra solo de tu tarjeta, tus lentes se preparan sin pedirlos, y tienes 10% de descuento. ¿Te interesa?".\n\n' +
      'REGLAS:\n' +
      '- PRIORIDAD: vender por WhatsApp. Solo mandar a sucursal si necesita examen de graduación\n' +
      '- DESINTERESADO: agradece y no insistas\n' +
      '- MOLESTO: discúlpate y deja de responder\n' +
      '- NUNCA más de 2 mensajes sin respuesta\n' +
      '- NUNCA mencionar "cita" ni "agendar" — es llegando directo\n' +
      '- NUNCA admitir culpa ni prometer cosas\n' +
      '- NUNCA confirmar disponibilidad ni inventario — NO sabes qué hay en stock\n' +
      '- NUNCA decir "probablemente tenemos", "seguro hay", "lo más probable es que tengamos" — si no sabes, NO lo afirmes\n' +
      '- NUNCA mandar al cliente a sucursal a "verificar" o "confirmar" algo que puedes resolver por WhatsApp\n' +
      '- Sucursales para recoger: Américas, Pinocelli, Magnolia (Plaza Magnolia, Av. Jilotepec), y Plaza Vía Vittoria (Av. Ejército Nacional esq. Neptuno, a un lado de Farmacias Similares) — la más nueva, ya abierta';
  }

  // Check for VIP/Fase3 Reactivation campaign context (same prompt — revisar graduación)
  var hasVIPReactivation = false;
  for (var vr = 0; vr < Math.min(history.length, 10); vr++) {
    if (history[vr].content && (history[vr].content.indexOf('[VIP-Reactivacion]') !== -1 || history[vr].content.indexOf('[AME-Fase3]') !== -1 || history[vr].content.indexOf('[PIN-VIP-Reactivacion]') !== -1 || history[vr].content.indexOf('[PIN-Fase3]') !== -1)) {
      hasVIPReactivation = true;
      break;
    }
  }
  if (hasVIPReactivation) {
    systemPrompt += '\n\nCONTEXTO CAMPAÑA REACTIVACIÓN VIP:\n' +
      'Este cliente es un paciente anterior que no ha comprado en más de un año. ' +
      'Le enviamos un mensaje invitándolo a revisar su graduación. Trátalo con calidez.\n\n' +
      '⚠️ REGLA MÁS IMPORTANTE — RESPONDE LO QUE PREGUNTAN:\n' +
      'Si el cliente hace una pregunta específica, responde SOLO esa pregunta en 1-2 líneas. ' +
      'NO agregues saludo, NO hagas otra pregunta, NO cambies de tema. Después ESPERA.\n\n' +
      '⚠️ REGLA CRÍTICA — UNA COSA A LA VEZ:\n' +
      'Responde CORTO (1-3 líneas máximo). UNA sola idea por mensaje. ESPERA respuesta antes de avanzar.\n\n' +
      'PASOS (solo si el cliente NO hace una pregunta específica):\n' +
      'PASO 1: Saludo corto (1 línea) + pregunta: "¿En qué te puedo ayudar?" o "¿Qué necesitas?"\n' +
      'PASO 2: Según lo que diga el cliente:\n' +
      '  - Si pregunta por graduación/examen → pregunta cuál sucursal le queda mejor\n' +
      '  - Si pregunta por lentes/armazones/promos → responde con la promo vigente\n' +
      '  - Si no es claro → pregunta amablemente qué está buscando\n' +
      'PASO 3: Confirmar sucursal + horarios + la promo vigente actual (la que aparece en PROMOCIÓN VIGENTE) + examen incluido.\n\n' +
      'REGLAS:\n' +
      '- DESINTERESADO: agradece y no insistas\n' +
      '- MOLESTO: discúlpate y deja de responder\n' +
      '- NUNCA más de 2 mensajes sin respuesta\n' +
      '- NUNCA mencionar "cita" ni "agendar" — es llegando directo\n' +
      '- El objetivo es que venga a la sucursal — la venta se cierra en persona';
  }

  var messages = [];
  for (var i = 0; i < history.length; i++) {
    messages.push({ role: history[i].role, content: history[i].content });
  }
  var greeting = userName ? '[Cliente: ' + userName + '] ' : '';
  messages.push({ role: 'user', content: greeting + userMessage });

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 350,
      system: systemPrompt,
      messages: messages
    })
  });

  var data = await res.json();
  if (!res.ok) {
    console.error('[AI Error]', data);
    return '¡Hola! 👋 En este momento tengo una pequeña dificultad técnica. Te invito a llamar directamente a cualquiera de nuestras sucursales para atenderte. ¡Disculpa la molestia! 🙏';
  }

  var textBlock = data.content ? data.content.find(function(b) { return b.type === 'text'; }) : null;
  var reply = (textBlock && textBlock.text) ? textBlock.text : 'Gracias por tu mensaje 😊 Un momento por favor...';

  // Safety net: el modelo a veces alucina comandos tipo "[Sistema] consulta el pedido..." porque ve esos tags en el historial guardado.
  // Los [Sistema] son markers internos en clari_conversations, NO un protocolo de tool-use. Sanitizar antes de mandar al usuario.
  reply = reply.replace(/\n?\[Sistema\][^\n]*\n?/g, '\n').replace(/\s*\[Cierre\]\s*/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!reply) reply = 'Un momento por favor 😊';

  await saveMessage(phone, 'user', greeting + userMessage, userName, viaPhoneId);
  await saveMessage(phone, 'assistant', reply, null, viaPhoneId);
  if (Math.random() < 0.05) cleanOldMessages();

  return reply;
}

// ── SEND REPLY VIA TWILIO ──
async function sendWhatsAppReply(to, text) {
  var toNum = to.replace(/[\s\-\(\)\+]/g, '');
  if (toNum.length === 10) toNum = '521' + toNum;
  if (toNum.length === 12 && toNum.startsWith('52') && toNum[2] !== '1') toNum = '521' + toNum.slice(2);

  var chunks = [];
  var remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 1500) { chunks.push(remaining); break; }
    var breakAt = remaining.lastIndexOf('\n', 1500);
    if (breakAt < 500) breakAt = remaining.lastIndexOf('. ', 1500);
    if (breakAt < 500) breakAt = 1500;
    chunks.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt).trim();
  }

  for (var i = 0; i < chunks.length; i++) {
    var params = new URLSearchParams();
    params.append('From', TWILIO_WA);
    params.append('To', 'whatsapp:+' + toNum);
    params.append('Body', chunks[i]);
    await fetch(TWILIO_API_URL, {
      method: 'POST',
      headers: { 'Authorization': twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  }
}

// Envía plantilla aprobada (atraviesa ventana 24h). Si falla, cae a freeform con fallbackText.
async function sendWhatsAppTemplate(to, templateSid, vars, fallbackText) {
  var toNum = to.replace(/[\s\-\(\)\+]/g, '');
  if (toNum.length === 10) toNum = '521' + toNum;
  if (toNum.length === 12 && toNum.startsWith('52') && toNum[2] !== '1') toNum = '521' + toNum.slice(2);
  try {
    var params = new URLSearchParams();
    params.append('From', TWILIO_WA);
    params.append('To', 'whatsapp:+' + toNum);
    params.append('ContentSid', templateSid);
    if (vars && Object.keys(vars).length) params.append('ContentVariables', JSON.stringify(vars));
    var res = await fetch(TWILIO_API_URL, {
      method: 'POST',
      headers: { 'Authorization': twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (res.ok) return true;
    var body = await res.text();
    console.warn('[Template Send] Failed ' + templateSid + ' to ' + toNum + ': ' + body.slice(0, 200));
  } catch(e) { console.warn('[Template Send] Error: ' + e.message); }
  if (fallbackText) { try { await sendWhatsAppReply(to, fallbackText); } catch(e) {} }
  return false;
}

// ── PARSE TWILIO WEBHOOK (form-urlencoded) ──
function parseBody(raw) {
  var params = {};
  (raw || '').split('&').forEach(function(pair) {
    var parts = pair.split('=');
    if (parts.length === 2) params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1].replace(/\+/g, ' '));
  });
  return params;
}

// ── ADMIN PHONE CHECK HELPER ──
async function isAdminPhone(phoneNum) {
  try {
    var cfgData = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
    if (cfgData && cfgData[0] && cfgData[0].value) {
      var cfg = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
      var adminPhones = (cfg.admin_phones || cfg.recipients_corte || []).map(function(p) { return p.replace(/[\s\-\(\)\+]/g, ''); });
      var clean = phoneNum.replace(/[\s\-\(\)\+]/g, '');
      return adminPhones.some(function(ap) { return clean.endsWith(ap.slice(-10)) || ap.endsWith(clean.slice(-10)); });
    }
  } catch(e) { console.warn('[AdminCheck] Error:', e.message); }
  return false;
}

function hoyLocal() {
  return new Date().toLocaleDateString('en-CA');
}

// ── ATTENDANCE QUERIES (admin via WA) ──
function _normalizeText(t) {
  return (t||'').toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').trim();
}

async function _getEmpleados() {
  var cfgData = await supaFetch('app_config?id=eq.empleados_telefono&select=value');
  if (!cfgData?.[0]?.value) return {};
  return typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
}

function _findEmpleadoByName(empleados, nameQuery) {
  var q = _normalizeText(nameQuery);
  if (!q) return null;
  // empleados = { phone: uid, ... } — need expedientes for names
  // Instead match against known names from horarios_asistencia or expedientes
  return q; // Return the query text, caller will match against DB
}

async function _getAsistenciaHoy() {
  var fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chihuahua' });
  var data = await supaFetch('asistencia?fecha=eq.' + fecha + '&select=uid,entrada,salida,comida_inicio,comida_fin,retardo_min,es_falta,sucursal');
  return { fecha, records: data || [] };
}

async function _getEmpleadoNames() {
  // Get employee names from expedientes
  var cfgData = await supaFetch('app_config?id=eq.expedientes_empleados&select=value');
  var expedientes = {};
  if (cfgData?.[0]?.value) {
    expedientes = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
  }
  // Also get phone→uid mapping
  var telData = await supaFetch('app_config?id=eq.empleados_telefono&select=value');
  var telMap = {};
  if (telData?.[0]?.value) {
    telMap = typeof telData[0].value === 'string' ? JSON.parse(telData[0].value) : telData[0].value;
  }
  // Build uid→name map
  var names = {};
  // From expedientes (preferred — has full name)
  Object.keys(expedientes).forEach(function(uid) {
    var exp = expedientes[uid];
    names[uid] = exp.nombre_completo || exp.nombre || uid;
  });
  // Fallback from telMap values (uid is the value)
  Object.values(telMap).forEach(function(uid) {
    if (!names[uid]) names[uid] = uid;
  });
  return names;
}

function _matchEmpleado(names, query) {
  var q = _normalizeText(query);
  if (!q) return null;
  var best = null, bestScore = 0;
  Object.keys(names).forEach(function(uid) {
    var name = _normalizeText(names[uid]);
    // Exact uid match
    if (_normalizeText(uid) === q) { best = uid; bestScore = 100; return; }
    // Name contains query
    if (name.includes(q) && q.length >= 3) {
      var score = q.length / name.length * 10;
      if (score > bestScore) { best = uid; bestScore = score; }
    }
    // First name match
    var firstName = name.split(' ')[0];
    if (firstName === q && q.length >= 3) { best = uid; bestScore = 50; }
  });
  return best;
}

async function _handleAsistQuery(lowerText, originalText, fromPhone) {
  var tz = 'America/Chihuahua';
  var norm = _normalizeText(lowerText);

  // ── "Asistencia hoy" / "asistencia" — full summary ──
  if (/^asistencia(\s+hoy)?$/.test(norm)) {
    var { fecha, records } = await _getAsistenciaHoy();
    var names = await _getEmpleadoNames();
    if (!records.length) return '📋 *ASISTENCIA ' + fecha + '*\n\nNadie ha fichado hoy.';
    var lines = records.map(function(r) {
      var name = names[r.uid] || r.uid;
      var entrada = r.entrada ? new Date(r.entrada).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true }) : '—';
      var status = '';
      if (r.es_falta) status = '❌ Falta';
      else if (r.salida) status = '🏠 Salió ' + new Date(r.salida).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
      else if (r.comida_inicio && !r.comida_fin) status = '🍽 Comiendo';
      else if (r.entrada) status = '✅ Trabajando';
      else status = '⏳ Sin entrada';
      var retardo = r.retardo_min > 0 ? ' ⚠️+' + r.retardo_min + 'min' : '';
      return name + ': ' + entrada + ' ' + status + retardo;
    });
    // Check who hasn't shown up
    var fichadosUids = records.map(function(r) { return r.uid; });
    var allNames = Object.keys(names);
    var noShow = allNames.filter(function(uid) { return !fichadosUids.includes(uid); });
    if (noShow.length) {
      lines.push('');
      lines.push('*Sin fichar:*');
      noShow.forEach(function(uid) { lines.push('⚠️ ' + (names[uid] || uid)); });
    }
    return '📋 *ASISTENCIA ' + fecha + '*\n\n' + lines.join('\n');
  }

  // ── "Ya llegó [nombre]?" / "¿a qué hora llegó [nombre]?" ──
  var llegoMatch = norm.match(/(?:ya llego|ya llego|llego|a que hora llego|hora de llegada de|hora llegada)\s+(\w+)/);
  if (llegoMatch) {
    var empName = llegoMatch[1];
    var names = await _getEmpleadoNames();
    var uid = _matchEmpleado(names, empName);
    if (!uid) return '❓ No encontré empleado "' + empName + '". Usa el primer nombre.';
    var { records } = await _getAsistenciaHoy();
    var rec = records.find(function(r) { return r.uid === uid; });
    var displayName = names[uid] || uid;
    if (!rec || !rec.entrada) return '⏳ *' + displayName + '* aún no ha llegado hoy.';
    var hora = new Date(rec.entrada).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
    var retMsg = rec.retardo_min > 0 ? ' (⚠️ ' + rec.retardo_min + ' min tarde)' : ' (✅ a tiempo)';
    return '✅ *' + displayName + '* llegó a las *' + hora + '*' + retMsg;
  }

  // ── "¿A qué hora salió [nombre]?" ──
  var salioMatch = norm.match(/(?:a que hora salio|ya salio|salio|hora de salida de|hora salida)\s+(\w+)/);
  if (salioMatch) {
    var empName = salioMatch[1];
    var names = await _getEmpleadoNames();
    var uid = _matchEmpleado(names, empName);
    if (!uid) return '❓ No encontré empleado "' + empName + '".';
    var { records } = await _getAsistenciaHoy();
    var rec = records.find(function(r) { return r.uid === uid; });
    var displayName = names[uid] || uid;
    if (!rec || !rec.entrada) return '⏳ *' + displayName + '* no ha fichado hoy.';
    if (!rec.salida) return '🏢 *' + displayName + '* sigue en sucursal (no ha fichado salida).';
    var hora = new Date(rec.salida).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
    return '🏠 *' + displayName + '* salió a las *' + hora + '*.';
  }

  // ── "¿[nombre] está comiendo?" / "anda comiendo [nombre]?" ──
  var comidaMatch = norm.match(/(?:esta comiendo|anda comiendo|fue a comer|salio a comer)\s+(\w+)/) || norm.match(/(\w+)\s+(?:esta comiendo|anda comiendo|fue a comer)/);
  if (comidaMatch) {
    var empName = comidaMatch[1];
    var names = await _getEmpleadoNames();
    var uid = _matchEmpleado(names, empName);
    if (!uid) return '❓ No encontré empleado "' + empName + '".';
    var { records } = await _getAsistenciaHoy();
    var rec = records.find(function(r) { return r.uid === uid; });
    var displayName = names[uid] || uid;
    if (!rec || !rec.entrada) return '⏳ *' + displayName + '* no ha fichado hoy.';
    if (rec.comida_inicio && !rec.comida_fin) {
      var horaComida = new Date(rec.comida_inicio).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
      return '🍽 Sí, *' + displayName + '* salió a comer a las *' + horaComida + '* y aún no regresa.';
    }
    if (rec.comida_inicio && rec.comida_fin) {
      var horaRegreso = new Date(rec.comida_fin).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
      return '✅ *' + displayName + '* ya regresó de comer (a las ' + horaRegreso + ').';
    }
    return '🏢 *' + displayName + '* no ha salido a comer.';
  }

  // ── "Avísame cuando llegue [nombre]" ──
  var avisaMatch = norm.match(/(?:avisame|avisame|avisa)\s+(?:cuando|si)\s+(?:llegue|llega|entre|ficha|venga)\s+(\w+)/);
  if (avisaMatch) {
    var empName = avisaMatch[1];
    var names = await _getEmpleadoNames();
    var uid = _matchEmpleado(names, empName);
    if (!uid) return '❓ No encontré empleado "' + empName + '". Usa el primer nombre.';
    var displayName = names[uid] || uid;
    // Check if already arrived
    var { records } = await _getAsistenciaHoy();
    var rec = records.find(function(r) { return r.uid === uid; });
    if (rec && rec.entrada) {
      var hora = new Date(rec.entrada).toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
      return '✅ *' + displayName + '* ya llegó hoy a las *' + hora + '*.';
    }
    // Save alert in app_config
    var alertKey = 'asist_alert_' + new Date().toLocaleDateString('en-CA', { timeZone: tz });
    var existingAlerts = await supaFetch('app_config?id=eq.' + alertKey + '&select=value');
    var alerts = [];
    if (existingAlerts?.[0]?.value) {
      alerts = typeof existingAlerts[0].value === 'string' ? JSON.parse(existingAlerts[0].value) : existingAlerts[0].value;
    }
    // Add alert (dedup)
    var already = alerts.find(function(a) { return a.uid === uid && a.phone === fromPhone; });
    if (!already) {
      alerts.push({ uid: uid, name: displayName, phone: fromPhone, created: new Date().toISOString() });
      if (existingAlerts?.[0]) {
        await supaFetch('app_config?id=eq.' + alertKey, { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(alerts) }), prefer: 'return=minimal' });
      } else {
        await supaFetch('app_config', { method: 'POST', body: JSON.stringify({ id: alertKey, value: JSON.stringify(alerts) }), prefer: 'return=minimal' });
      }
    }
    return '🔔 Listo. Te aviso cuando *' + displayName + '* fiche entrada hoy.';
  }

  return null; // No attendance query matched
}

// Resolve pending absence alert: if cron sent an ausencia alert earlier, send correction to admin
async function _resolveAbsenceAlert(uid, empName, empSuc, fecha, horaLocal) {
  try {
    var pendRes = await supaFetch('app_config?id=eq.asist_ausencia_pendientes&select=value');
    if (!pendRes || !pendRes[0] || !pendRes[0].value) return;
    var pend = typeof pendRes[0].value === 'string' ? JSON.parse(pendRes[0].value) : pendRes[0].value;
    if (!Array.isArray(pend) || !pend.length) return;
    var hit = pend.find(function(p){ return p.uid === uid && p.fecha === fecha; });
    if (!hit) return;
    var cfgWA = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
    var admPhones = [];
    if (cfgWA && cfgWA[0] && cfgWA[0].value) {
      var w = typeof cfgWA[0].value === 'string' ? JSON.parse(cfgWA[0].value) : cfgWA[0].value;
      admPhones = w.admin_phones || [];
    }
    var msg = '✅ *Corrección asistencia*\n📅 ' + fecha + '\n👤 ' + empName + '\n🏪 ' + empSuc + '\n\nYa registró entrada a las ' + horaLocal + '. La alerta anterior queda resuelta.';
    var corrVars = { '1': fecha, '2': empName, '3': empSuc, '4': horaLocal };
    for (var a = 0; a < admPhones.length; a++) {
      try { await sendWhatsAppTemplate(admPhones[a], 'HX58f623eec625eb47d8b7bd03aff2abd7', corrVars, msg); } catch(e){}
    }
    var remaining = pend.filter(function(p){ return !(p.uid === uid && p.fecha === fecha); });
    await supaFetch('app_config?on_conflict=id', {
      method: 'POST',
      body: JSON.stringify({ id: 'asist_ausencia_pendientes', value: JSON.stringify(remaining) }),
      prefer: 'return=minimal,resolution=merge-duplicates'
    });
  } catch(e) { console.warn('[AsistAbsCorr]', e.message); }
}

// Check and send pending arrival alerts (called after entry is recorded)
async function _checkArrivalAlerts(uid, empName, empSuc) {
  try {
    var tz = 'America/Chihuahua';
    var alertKey = 'asist_alert_' + new Date().toLocaleDateString('en-CA', { timeZone: tz });
    var existingAlerts = await supaFetch('app_config?id=eq.' + alertKey + '&select=value');
    if (!existingAlerts?.[0]?.value) return;
    var alerts = typeof existingAlerts[0].value === 'string' ? JSON.parse(existingAlerts[0].value) : existingAlerts[0].value;
    var matching = alerts.filter(function(a) { return a.uid === uid; });
    if (!matching.length) return;
    var hora = new Date().toLocaleTimeString('es-MX', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:true });
    for (var i = 0; i < matching.length; i++) {
      await sendWhatsAppReply(matching[i].phone, '🔔 *' + empName + '* acaba de llegar\n⏰ ' + hora + '\n🏪 ' + empSuc);
    }
    // Remove fulfilled alerts
    var remaining = alerts.filter(function(a) { return a.uid !== uid; });
    await supaFetch('app_config?id=eq.' + alertKey, { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(remaining) }), prefer: 'return=minimal' });
  } catch(e) { console.warn('[AsistAlert]', e.message); }
}

// ── ATTENDANCE COMMAND DETECTION (typo-tolerant + synonyms) ──
function _detectAsistCmd(text) {
  var t = text.replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/[^\w\s]/g,'').trim();

  // Entrada: exact + typos + synonyms
  if (/^entrad[ao]?$/.test(t)) return 'entrada';
  if (/^(ya\s+)?llegu[eé]$/.test(t)) return 'entrada';
  if (/^ya\s+(estoy|llegue|vine)/.test(t)) return 'entrada';
  if (/^(llegue|llegué|check\s*in|checkin)$/.test(t)) return 'entrada';
  if (/^(buenos?\s+dias?|buen\s+dia)$/.test(t)) return 'entrada';
  if (/^(entre|entro|entrda|netrada|entra)$/.test(t)) return 'entrada';

  // Salida: exact + typos + synonyms
  if (/^salid[ao]?$/.test(t)) return 'salida';
  if (/^(ya\s+me\s+voy|me\s+voy|me\s+retiro)/.test(t)) return 'salida';
  if (/^(check\s*out|checkout|bye|adios|sali|salgo)$/.test(t)) return 'salida';
  if (/^(sailda|slida|saldia|dalida)$/.test(t)) return 'salida';

  // Comida: exact + typos + synonyms
  if (/^comid[ao]?$/.test(t)) return 'comida';
  if (/^(voy\s+a\s+comer|a\s+comer|hora\s+de\s+comer)/.test(t)) return 'comida';
  if (/^(almuerzo|lunch|lonche|lonch|comda|comdia)$/.test(t)) return 'comida';

  // Regreso: exact + typos + synonyms
  if (/^regres[eo]?$/.test(t)) return 'regreso';
  if (/^(ya\s+regrese|ya\s+volvi|ya\s+llegue\s+de\s+comer)/.test(t)) return 'regreso';
  if (/^(volvi|regrese|rgereso|regrso|regresp)$/.test(t)) return 'regreso';

  return null;
}

async function cmdAsistencia(phone, action, profileName) {
  try {
    // 1. Load phone→uid mapping
    var phoneMapData = await supaFetch('app_config?id=eq.empleados_telefono&select=value');
    if (!phoneMapData || !phoneMapData[0] || !phoneMapData[0].value) {
      return { reply: '⚠️ El sistema de asistencia no está configurado. Contacta al administrador.' };
    }
    var phoneMap = typeof phoneMapData[0].value === 'string' ? JSON.parse(phoneMapData[0].value) : phoneMapData[0].value;

    // Normalize phone: strip non-digits, match on last 10
    var cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    var last10 = cleanPhone.slice(-10);
    var uid = null;
    for (var mapPhone in phoneMap) {
      var mapClean = mapPhone.replace(/[\s\-\(\)\+]/g, '');
      if (mapClean.slice(-10) === last10) { uid = phoneMap[mapPhone]; break; }
    }
    if (!uid) {
      return { reply: '⚠️ Tu número no está registrado para asistencia. Contacta al administrador.' };
    }

    // 2. Get employee info from custom_users + asesores
    var empName = uid;
    var empSuc = 'N/A';
    if (uid.startsWith('asesor_')) {
      // Resolve from asesores config
      var asesData = await supaFetch('app_config?id=eq.asesores&select=value');
      if (asesData && asesData[0] && asesData[0].value) {
        var asesCfg = typeof asesData[0].value === 'string' ? JSON.parse(asesData[0].value) : asesData[0].value;
        var allAses = [];
        var sucursales = asesCfg.sucursales || {};
        for (var suc in sucursales) { (sucursales[suc] || []).forEach(function(n) { allAses.push({ nombre: n, sucursal: suc }); }); }
        (asesCfg.globales || []).forEach(function(n) { allAses.push({ nombre: n, sucursal: 'Global' }); });
        var match = allAses.find(function(a) { return 'asesor_' + a.nombre.toLowerCase().replace(/\s+/g, '_') === uid; });
        if (match) { empName = match.nombre; empSuc = match.sucursal; }
      }
    } else if (uid.startsWith('extra_')) {
      // Resolve from horarios_asistencia.empleados_extra
      var extraData = await supaFetch('app_config?id=eq.horarios_asistencia&select=value');
      if (extraData && extraData[0] && extraData[0].value) {
        var horCfg = typeof extraData[0].value === 'string' ? JSON.parse(extraData[0].value) : extraData[0].value;
        var extras = horCfg.empleados_extra || {};
        if (extras[uid]) { empName = extras[uid].nombre; empSuc = extras[uid].sucursal || 'Laboratorio'; }
      }
    } else {
      var usersData = await supaFetch('app_config?id=eq.custom_users&select=value');
      var users = {};
      if (usersData && usersData[0] && usersData[0].value) {
        users = typeof usersData[0].value === 'string' ? JSON.parse(usersData[0].value) : usersData[0].value;
      }
      var emp = users[uid] || {};
      empName = emp.nombre || uid;
      empSuc = emp.sucursal || 'N/A';
    }

    // 3. Get current date/time in America/Chihuahua
    var nowChihuahua = new Date().toLocaleString('en-US', { timeZone: 'America/Chihuahua' });
    var nowLocal = new Date(nowChihuahua);
    var fechaLocal = nowLocal.toLocaleDateString('en-CA'); // YYYY-MM-DD
    var horaLocal = nowLocal.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });

    // 4. Load schedule
    var schedData = await supaFetch('app_config?id=eq.horarios_asistencia&select=value');
    var horarios = { default: { lun:{entrada:'10:00',salida:'19:00'}, mar:{entrada:'10:00',salida:'19:00'}, mie:{entrada:'10:00',salida:'19:00'}, jue:{entrada:'10:00',salida:'19:00'}, vie:{entrada:'10:00',salida:'19:00'}, sab:{entrada:'10:00',salida:'19:00'}, dom:{entrada:'11:00',salida:'17:00'} }, tolerancia_min: 10, override: {} };
    if (schedData && schedData[0] && schedData[0].value) {
      horarios = typeof schedData[0].value === 'string' ? JSON.parse(schedData[0].value) : schedData[0].value;
    }

    var dayNames = ['dom','lun','mar','mie','jue','vie','sab'];
    var dayKey = dayNames[nowLocal.getDay()];
    var sched = horarios.default ? horarios.default[dayKey] : null;
    if (horarios.override && horarios.override[uid]) {
      var ov = horarios.override[uid][dayKey];
      if (ov === null) sched = null;
      else if (ov && ov.alternating) {
        // Alternating day off (e.g. domingos alternos)
        var _refD = new Date(ov.ref + 'T00:00:00');
        var _diffW = Math.round((nowLocal.getTime() - _refD.getTime()) / (7 * 86400000));
        if ((Math.abs(_diffW) % 2) === ov.parity) sched = null; // this week is their turn off
      }
      else if (ov) sched = ov;
    }

    // 5. Check existing record for today
    var existing = await supaFetch('asistencia?uid=eq.' + uid + '&fecha=eq.' + fechaLocal + '&select=*');
    var record = (existing && existing.length > 0) ? existing[0] : null;

    var nowISO = new Date().toISOString();

    if (action === 'entrada') {
      if (record && record.entrada) {
        var entH = new Date(record.entrada).toLocaleTimeString('es-MX', { timeZone: 'America/Chihuahua', hour: '2-digit', minute: '2-digit', hour12: true });
        return { reply: '⚠️ Ya registraste tu entrada hoy a las ' + entH, uid: uid };
      }
      // Calculate retardo
      var retardoMin = 0;
      if (sched && sched.entrada) {
        var schedParts = sched.entrada.split(':');
        var schedMin = parseInt(schedParts[0]) * 60 + parseInt(schedParts[1]);
        var actualMin = nowLocal.getHours() * 60 + nowLocal.getMinutes();
        var tolerancia = horarios.tolerancia_min || 10;
        var minTarde = actualMin - schedMin;
        retardoMin = minTarde > tolerancia ? minTarde : 0;
      }
      // UPSERT
      var payload = { uid: uid, fecha: fechaLocal, entrada: nowISO, retardo_min: retardoMin, sucursal: empSuc };
      if (record) {
        await supaFetch('asistencia?id=eq.' + record.id, { method: 'PATCH', body: JSON.stringify(payload), prefer: 'return=minimal' });
      } else {
        await supaFetch('asistencia', { method: 'POST', body: JSON.stringify(payload), prefer: 'return=minimal' });
      }
      var replyMsg = '✅ Entrada registrada\n⏰ ' + horaLocal + '\n🏪 ' + empSuc;
      // Check pending arrival alerts
      _checkArrivalAlerts(uid, empName, empSuc).catch(function(e){ console.warn('[AsistAlert]', e.message); });
      // Check pending absence alerts (cron sent admin alert earlier → send correction now)
      _resolveAbsenceAlert(uid, empName, empSuc, fechaLocal, horaLocal).catch(function(e){ console.warn('[AsistAbsCorr]', e.message); });
      if (retardoMin > 0) {
        replyMsg += '\n⚠️ Retardo: ' + retardoMin + ' min';
        // Notify admin
        try {
          var cfgWA = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
          if (cfgWA && cfgWA[0] && cfgWA[0].value) {
            var waCfg = typeof cfgWA[0].value === 'string' ? JSON.parse(cfgWA[0].value) : cfgWA[0].value;
            var admPhones = waCfg.admin_phones || [];
            var retFallback = '⚠️ *Retardo*\n👤 ' + empName + '\n🏪 ' + empSuc + '\n⏰ ' + horaLocal + ' (' + retardoMin + ' min tarde)';
            var retVars = { '1': empName, '2': empSuc, '3': horaLocal, '4': String(retardoMin) };
            for (var i = 0; i < admPhones.length; i++) {
              await sendWhatsAppTemplate(admPhones[i], 'HX85d725cc02628385e8c7f75f32c26c99', retVars, retFallback);
            }
          }
        } catch(e) { console.warn('[Asistencia] Admin notify error:', e.message); }
      }

      // ── Check for recent unjustified absences (send acta if found) ──
      try {
        var faltasDias = [];
        var ASISTENCIA_START_DATE = '2026-03-25'; // ignore absences before this date (employees started using system)
        // Per-employee start date: NUNCA contar faltas antes de la fecha_ingreso del empleado.
        // Los empleados nuevos no tienen faltas en los días previos a su alta (causaba actas falsas).
        var fechaIngreso = null;
        try {
          var expData = await supaFetch('app_config?id=eq.expedientes_empleados&select=value');
          if (expData && expData[0] && expData[0].value) {
            var expedientes = typeof expData[0].value === 'string' ? JSON.parse(expData[0].value) : expData[0].value;
            if (expedientes[uid] && expedientes[uid].fecha_ingreso) fechaIngreso = expedientes[uid].fecha_ingreso;
          }
        } catch(eIng) { console.warn('[Asistencia] fecha_ingreso lookup error:', eIng.message); }
        // Check last 7 days for days with no entry where employee was scheduled
        for (var dBack = 1; dBack <= 7; dBack++) {
          var checkDate = new Date(nowChihuahua);
          checkDate.setDate(checkDate.getDate() - dBack);
          var checkFecha = checkDate.toLocaleDateString('en-CA');
          if (checkFecha < ASISTENCIA_START_DATE) continue; // skip dates before system was activated
          if (fechaIngreso && checkFecha < fechaIngreso) continue; // empleado nuevo: ignorar días antes de su ingreso
          var checkDayKey = dayNames[checkDate.getDay()];
          // Check schedule for that day
          var checkSched = horarios.default ? horarios.default[checkDayKey] : null;
          if (horarios.override && horarios.override[uid]) {
            var checkOv = horarios.override[uid][checkDayKey];
            if (checkOv === null) checkSched = null;
            else if (checkOv && checkOv.alternating) {
              var _refD2 = new Date(checkOv.ref + 'T00:00:00');
              var _diffW2 = Math.round((checkDate.getTime() - _refD2.getTime()) / (7 * 86400000));
              if ((Math.abs(_diffW2) % 2) === checkOv.parity) checkSched = null;
            }
            else if (checkOv) checkSched = checkOv;
          }
          if (!checkSched) continue; // day off
          // Check if there's a record (skip authorized absences: Vacaciones, Permiso, Incapacidad, Dia personal)
          var checkRec = await supaFetch('asistencia?uid=eq.' + uid + '&fecha=eq.' + checkFecha + '&select=entrada,es_falta,nota');
          var hasPermiso = checkRec && checkRec.length > 0 && checkRec[0].nota && /vacaciones|permiso|incapacidad|dia personal/i.test(checkRec[0].nota);
          if (hasPermiso) continue; // authorized absence, skip
          if (!checkRec || checkRec.length === 0 || (!checkRec[0].entrada && !checkRec[0].es_falta)) {
            faltasDias.push(checkFecha);
            // Mark as falta in DB
            if (!checkRec || checkRec.length === 0) {
              await supaFetch('asistencia', { method: 'POST', body: JSON.stringify({ uid: uid, fecha: checkFecha, es_falta: true, sucursal: empSuc }), prefer: 'return=minimal' });
            }
          }
        }

        if (faltasDias.length > 0) {
          // Generate acta token and send link
          var actaCrypto = require('crypto');
          var actaToken = actaCrypto.randomBytes(24).toString('hex');
          var actaExpires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72h
          var actaPeriodoInicio = faltasDias[faltasDias.length - 1]; // earliest
          var actaPeriodoFin = fechaLocal; // today

          // UPSERT sobre (uid, periodo_inicio) UNIQUE: en cada check-in se regenera el token y se
          // reenvía el link. Si ya existe el registro de ese periodo, un INSERT normal fallaba por el
          // UNIQUE → el link nuevo quedaba con un token HUÉRFANO (sin registro) → "token no encontrado/
          // expirado". Con upsert, el registro existente se actualiza con el NUEVO token (firmado_at /
          // firma_empleado NO van en el payload → se preservan si ya firmó).
          await supaFetch('asistencia_firmas?on_conflict=uid,periodo_inicio', {
            method: 'POST',
            body: JSON.stringify({
              uid: uid,
              periodo_inicio: actaPeriodoInicio,
              periodo_fin: actaPeriodoFin,
              token: actaToken,
              token_expires: actaExpires,
              enviado_at: nowISO
            }),
            prefer: 'resolution=merge-duplicates,return=minimal'
          });

          var SITE = process.env.URL || 'https://optcaryera.netlify.app';
          var actaLink = SITE + '/firma-asistencia?token=' + actaToken + '&acta=1&faltas=' + faltasDias.join(',');

          // Send acta link to employee (small delay so entry msg arrives first)
          await new Promise(function(r) { setTimeout(r, 2000); });
          try {
            var faltasListStr = faltasDias.map(function(f) { return f; }).join(', ');
            await sendWhatsAppReply(phone, '📋 *Acta de falta injustificada*\n\nSe registraron ' + faltasDias.length + ' falta(s) sin justificar:\n📅 ' + faltasListStr + '\n\nRevisa y firma el acta aqui:\n👉 ' + actaLink + '\n\nEl link expira en 72 horas.\n\n_Art. 47 Frac. X — Ley Federal del Trabajo_');
            console.log('[Asistencia] Sent acta link to ' + empName + ' for ' + faltasDias.length + ' falta(s)');
          } catch(e2) { console.warn('[Asistencia] Acta send error:', e2.message); }

          // Notify admin
          var cfgWA2 = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
          if (cfgWA2 && cfgWA2[0] && cfgWA2[0].value) {
            var waCfg2 = typeof cfgWA2[0].value === 'string' ? JSON.parse(cfgWA2[0].value) : cfgWA2[0].value;
            var admPhones2 = waCfg2.admin_phones || [];
            var actaFallback = '📋 *Acta de falta enviada*\n👤 ' + empName + '\n🏪 ' + empSuc + '\n📅 Faltas: ' + faltasDias.join(', ') + '\n\nSe envio link de firma automaticamente.';
            var actaVars = { '1': empName, '2': empSuc, '3': faltasDias.join(', ') };
            for (var a2 = 0; a2 < admPhones2.length; a2++) {
              await sendWhatsAppTemplate(admPhones2[a2], 'HX4583d4e52a7f97e0ba920f3ab52e677a', actaVars, actaFallback);
            }
          }
        }
      } catch(faltaErr) { console.warn('[Asistencia] Falta check error:', faltaErr.message); }

      return { reply: replyMsg, uid: uid };

    } else if (action === 'comida') {
      if (!record || !record.entrada) {
        return { reply: '⚠️ No tienes entrada registrada hoy. Envía "entrada" primero.', uid: uid };
      }
      if (record.comida_inicio) {
        var comH = new Date(record.comida_inicio).toLocaleTimeString('es-MX', { timeZone: 'America/Chihuahua', hour: '2-digit', minute: '2-digit', hour12: true });
        return { reply: '⚠️ Ya registraste tu hora de comida a las ' + comH, uid: uid };
      }
      await supaFetch('asistencia?id=eq.' + record.id, { method: 'PATCH', body: JSON.stringify({ comida_inicio: nowISO }), prefer: 'return=minimal' });
      return { reply: '🍽️ Hora de comida registrada\n⏰ ' + horaLocal + '\n¡Buen provecho! Recuerda enviar "regreso" al volver.', uid: uid };

    } else if (action === 'regreso') {
      if (!record || !record.comida_inicio) {
        return { reply: '⚠️ No tienes hora de comida registrada. Envía "comida" primero.', uid: uid };
      }
      if (record.comida_fin) {
        var regH = new Date(record.comida_fin).toLocaleTimeString('es-MX', { timeZone: 'America/Chihuahua', hour: '2-digit', minute: '2-digit', hour12: true });
        return { reply: '⚠️ Ya registraste tu regreso de comida a las ' + regH, uid: uid };
      }
      var comidaMs = new Date(nowISO).getTime() - new Date(record.comida_inicio).getTime();
      var comidaMin = Math.round(comidaMs / 60000);
      await supaFetch('asistencia?id=eq.' + record.id, { method: 'PATCH', body: JSON.stringify({ comida_fin: nowISO }), prefer: 'return=minimal' });
      return { reply: '✅ Regreso de comida registrado\n⏰ ' + horaLocal + '\n🍽️ Tiempo de comida: ' + comidaMin + ' min', uid: uid };

    } else if (action === 'salida') {
      if (!record || !record.entrada) {
        return { reply: '⚠️ No tienes entrada registrada hoy. Envía "entrada" primero.', uid: uid };
      }
      if (record.salida) {
        var salH = new Date(record.salida).toLocaleTimeString('es-MX', { timeZone: 'America/Chihuahua', hour: '2-digit', minute: '2-digit', hour12: true });
        return { reply: '⚠️ Ya registraste tu salida hoy a las ' + salH, uid: uid };
      }
      // Calculate hours worked (minus lunch if applicable)
      var totalMs = new Date(nowISO).getTime() - new Date(record.entrada).getTime();
      var lunchMs = 0;
      if (record.comida_inicio && record.comida_fin) {
        lunchMs = new Date(record.comida_fin).getTime() - new Date(record.comida_inicio).getTime();
      } else if (record.comida_inicio && !record.comida_fin) {
        // Forgot to send "regreso" — count lunch as ongoing until now
        lunchMs = new Date(nowISO).getTime() - new Date(record.comida_inicio).getTime();
      }
      var netMs = totalMs - lunchMs;
      var horas = Math.round(netMs / 36000) / 100; // 2 decimal places
      await supaFetch('asistencia?id=eq.' + record.id, { method: 'PATCH', body: JSON.stringify({ salida: nowISO, horas_trabajadas: horas }), prefer: 'return=minimal' });
      return { reply: '✅ Salida registrada\n⏰ ' + horaLocal + '\n⏱️ Horas trabajadas: ' + horas.toFixed(2) + 'h', uid: uid };
    }

    return { reply: '⚠️ Comando no reconocido.' };
  } catch(err) {
    console.error('[Asistencia] Error:', err.message);
    return { reply: '❌ Error registrando asistencia. Intenta de nuevo.' };
  }
}

// ── ADMIN COMMAND: VENTAS ──
async function cmdVentas() {
  var today = hoyLocal();
  var utcStart = new Date(today + 'T00:00:00').toISOString();
  var utcEnd = new Date(today + 'T23:59:59.999').toISOString();
  var ventas = await supaFetch('ventas?select=sucursal,total,pagado,estado&created_at=gte.' + utcStart + '&created_at=lte.' + utcEnd + '&estado=neq.Cancelada');
  ventas = ventas || [];
  var sucs = ['Américas', 'Pinocelli', 'Magnolia', 'Plaza Vía Vittoria'];
  var totalGeneral = 0;
  var totalPagado = 0;
  var lines = ['📊 *VENTAS HOY* ' + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) + '\n'];
  sucs.forEach(function(s) {
    var sv = ventas.filter(function(v) { return v.sucursal === s; });
    var st = sv.reduce(function(a, v) { return a + Number(v.total); }, 0);
    var sp = sv.reduce(function(a, v) { return a + Number(v.pagado); }, 0);
    totalGeneral += st;
    totalPagado += sp;
    var emoji = s === 'Américas' ? '🔵' : s === 'Pinocelli' ? '🟡' : s === 'Magnolia' ? '🟣' : '🟢';
    lines.push(emoji + ' ' + s + ': ' + sv.length + ' ventas');
    lines.push('   💰 $' + st.toLocaleString('es-MX', { minimumFractionDigits: 0 }) + ' vendido · $' + sp.toLocaleString('es-MX', { minimumFractionDigits: 0 }) + ' cobrado');
  });
  lines.push('\n🏪 TOTAL: ' + ventas.length + ' ventas');
  lines.push('💰 $' + totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 0 }) + ' vendido');
  lines.push('✅ $' + totalPagado.toLocaleString('es-MX', { minimumFractionDigits: 0 }) + ' cobrado');
  return lines.join('\n');
}

// ── ADMIN COMMAND: CAJA ──
async function cmdCaja() {
  var today = hoyLocal();
  var utcStart = new Date(today + 'T00:00:00').toISOString();
  var utcEnd = new Date(today + 'T23:59:59.999').toISOString();
  var cajas = await supaFetch('cortes_caja?select=*&fecha=eq.' + today + '&order=created_at.desc');
  cajas = cajas || [];
  var pagos = await supaFetch('venta_pagos?select=monto,metodo_pago,ventas(sucursal)&created_at=gte.' + utcStart + '&created_at=lte.' + utcEnd);
  pagos = pagos || [];
  var retiros = await supaFetch('retiros_caja?select=monto,sucursal&fecha=eq.' + today);
  retiros = retiros || [];
  var sucs = ['Américas', 'Pinocelli', 'Magnolia', 'Plaza Vía Vittoria'];
  var lines = ['🏦 *CAJA HOY* ' + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) + '\n'];
  sucs.forEach(function(s) {
    var caja = cajas.find(function(c) { return c.sucursal === s; });
    var emoji = s === 'Américas' ? '🔵' : s === 'Pinocelli' ? '🟡' : s === 'Magnolia' ? '🟣' : '🟢';
    if (!caja) {
      lines.push(emoji + ' ' + s + ': ⚪ Sin abrir');
      return;
    }
    var estado = caja.estado === 'abierta' ? '🟢 Abierta' : '✅ Cortada';
    var fondo = Number(caja.fondo_inicial) || 0;
    var sucPagos = pagos.filter(function(p) { return p.ventas && p.ventas.sucursal === s; });
    var ingreso = sucPagos.reduce(function(a, p) { return a + Number(p.monto); }, 0);
    var sucRetiros = retiros.filter(function(r) { return r.sucursal === s; });
    var totalRetiros = sucRetiros.reduce(function(a, r) { return a + Number(r.monto); }, 0);
    // Payment method breakdown
    var desglose = {};
    sucPagos.forEach(function(p) {
      var m = p.metodo_pago || 'Otro';
      desglose[m] = (desglose[m] || 0) + Number(p.monto);
    });
    lines.push(emoji + ' ' + s + ': ' + estado);
    lines.push('   💵 Fondo: $' + fondo.toFixed(0) + ' · Ingreso: $' + ingreso.toFixed(0));
    if (totalRetiros > 0) lines.push('   📤 Retiros: $' + totalRetiros.toFixed(0));
    var metodos = Object.entries(desglose).sort(function(a, b) { return b[1] - a[1]; });
    if (metodos.length > 0) {
      var desgloseStr = metodos.map(function(e) { return e[0] + ' $' + e[1].toFixed(0); }).join(' · ');
      lines.push('   📋 ' + desgloseStr);
    }
    if (caja.estado === 'cortada' && caja.diferencia !== undefined) {
      var dif = Number(caja.diferencia);
      lines.push('   ' + (dif === 0 ? '✅ Cuadra perfecto' : (dif > 0 ? '⬆️ Sobrante: $' + dif.toFixed(2) : '⬇️ Faltante: $' + Math.abs(dif).toFixed(2))));
    }
  });
  return lines.join('\n');
}

// ── ADMIN COMMAND: PENDIENTES LAB ──
async function cmdPendientes() {
  var ordenes = await supaFetch('ordenes_laboratorio?select=id,estado_lab,sucursal&estado_lab=neq.Entregado');
  ordenes = ordenes || [];
  var sucs = ['Américas', 'Pinocelli', 'Magnolia', 'Plaza Vía Vittoria'];
  var estados = {
    'En cola': ['Enviado al lab', 'Recibido en lab', 'Recibido', 'Pendiente de surtir'],
    'Surtido': ['Surtido'],
    'En máquinas': ['En proceso Máquina 1', 'En proceso Máquina 2'],
    'Biselado/CC': ['Biselado completado', 'Control de calidad'],
    'Lab externo': ['Tallando en lab externo'],
    'En camino': ['En camino a sucursal'],
    'Listo': ['Recibido en óptica', 'Listo para entrega'],
    'Faltante': ['Faltante'],
    'Demorado': ['Demorado'],
    'Devuelto': ['Devuelto al lab']
  };
  var lines = ['🔬 *PENDIENTES LAB*\n'];
  lines.push('📦 Total activas: ' + ordenes.length + '\n');
  // Summary by status
  Object.keys(estados).forEach(function(grupo) {
    var count = ordenes.filter(function(o) { return estados[grupo].includes(o.estado_lab); }).length;
    if (count > 0) {
      var emoji = grupo === 'En cola' ? '📋' : grupo === 'Surtido' ? '✅' : grupo === 'En máquinas' ? '⚙️' : grupo === 'Biselado/CC' ? '💎' : grupo === 'Lab externo' ? '🔬' : grupo === 'En camino' ? '🚗' : grupo === 'Listo' ? '🎉' : grupo === 'Faltante' ? '⏳' : grupo === 'Demorado' ? '⏰' : '🔄';
      lines.push(emoji + ' ' + grupo + ': ' + count);
    }
  });
  // By branch
  lines.push('\n🏪 Por sucursal:');
  sucs.forEach(function(s) {
    var sv = ordenes.filter(function(o) { return o.sucursal === s; });
    var listo = sv.filter(function(o) { return ['Recibido en óptica', 'Listo para entrega'].includes(o.estado_lab); }).length;
    var emoji = s === 'Américas' ? '🔵' : s === 'Pinocelli' ? '🟡' : s === 'Magnolia' ? '🟣' : '🟢';
    lines.push(emoji + ' ' + s + ': ' + sv.length + ' órdenes' + (listo > 0 ? ' (' + listo + ' listas para entregar)' : ''));
  });
  return lines.join('\n');
}

// ── ADMIN COMMAND: PROMO ──
async function cmdPromo(newPromoText, userName) {
  // Read current clari_config
  var configData = await supaFetch('app_config?id=eq.clari_config&select=value');
  var config = {};
  if (configData && configData[0] && configData[0].value) {
    config = typeof configData[0].value === 'string' ? JSON.parse(configData[0].value) : configData[0].value;
  }
  // Save as promo_override — takes priority over date-based auto promos
  // Send "Promo auto" to clear override and return to automatic date-based promos
  if (newPromoText.toLowerCase().trim() === 'auto') {
    config.promo_override = '';
    config.updated_at = new Date().toISOString();
    var result = await supaFetch('app_config?id=eq.clari_config', {
      method: 'PATCH',
      body: JSON.stringify({ value: JSON.stringify(config) }),
      prefer: 'return=representation'
    });
    if (result) return '✅ Promos regresadas a modo AUTOMÁTICO por fecha.\n\n📅 Promo activa ahora:\n' + getActivePromos() + '\n\n👤 Por: ' + (userName || 'Admin');
    return '❌ Error. Intenta de nuevo.';
  }
  config.promo_override = 'PROMOCIÓN VIGENTE (MANUAL):\n' + newPromoText;
  config.updated_at = new Date().toISOString();
  var result = await supaFetch('app_config?id=eq.clari_config', {
    method: 'PATCH',
    body: JSON.stringify({ value: JSON.stringify(config) }),
    prefer: 'return=representation'
  });
  if (result) {
    return '✅ Promos actualizadas (override manual).\n\n📝 Nuevo texto:\n' + newPromoText + '\n\n⚠️ Esto sobreescribe las promos automáticas. Envía "Promo auto" para volver al modo automático.\n\n👤 Por: ' + (userName || 'Admin');
  }
  return '❌ Error al actualizar promociones. Intenta de nuevo.';
}

// ── LC HISTORY LOOKUP (graduation by phone) ──
async function lookupLCHistory(phone) {
  if (!SERVICE_KEY) return null;
  try {
    var cleanPhone = phone.replace(/^521/, '').replace(/^52/, '').replace(/^1/, '');
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
    var patients = await supaFetch('pacientes?telefono=ilike.*' + cleanPhone + '*&select=id,nombre,apellidos&limit=3');
    if (!patients || !patients.length) return null;
    var patIds = patients.map(function(p) { return p.id; });
    // Get most recent historia_clinica with LC data
    var hcs = await supaFetch('historias_clinicas?paciente_id=in.(' + patIds.join(',') + ')&select=paciente_id,created_at,lc_marca,lc_programa,lc_od_esfera,lc_od_cilindro,lc_od_eje,lc_oi_esfera,lc_oi_cilindro,lc_oi_eje,lc_bc,lc_dia,od_esfera,od_cilindro,od_eje,oi_esfera,oi_cilindro,oi_eje,od_add,oi_add&order=created_at.desc&limit=3');
    if (!hcs || !hcs.length) return { patient: patients[0], rx: null, lcRx: null };
    // Find one with LC data first
    var lcHc = hcs.find(function(h) { return h.lc_od_esfera || h.lc_marca; });
    var anyHc = hcs[0]; // most recent regardless
    var result = { patient: patients[0], rx: null, lcRx: null, rxDate: anyHc.created_at };
    if (lcHc) {
      result.lcRx = {
        marca: lcHc.lc_marca || '',
        od: (lcHc.lc_od_esfera || '') + (lcHc.lc_od_cilindro ? ' / ' + lcHc.lc_od_cilindro + ' x ' + (lcHc.lc_od_eje || '') : ''),
        oi: (lcHc.lc_oi_esfera || '') + (lcHc.lc_oi_cilindro ? ' / ' + lcHc.lc_oi_cilindro + ' x ' + (lcHc.lc_oi_eje || '') : ''),
        bc: lcHc.lc_bc || '', dia: lcHc.lc_dia || '',
        fecha: lcHc.created_at
      };
    }
    if (anyHc.od_esfera) {
      result.rx = {
        od: (anyHc.od_esfera || '') + (anyHc.od_cilindro ? ' / ' + anyHc.od_cilindro + ' x ' + (anyHc.od_eje || '') : '') + (anyHc.od_add ? ' ADD ' + anyHc.od_add : ''),
        oi: (anyHc.oi_esfera || '') + (anyHc.oi_cilindro ? ' / ' + anyHc.oi_cilindro + ' x ' + (anyHc.oi_eje || '') : '') + (anyHc.oi_add ? ' ADD ' + anyHc.oi_add : '')
      };
    }
    return result;
  } catch(e) { console.error('[LC History]', e.message); return null; }
}

// ── LC CATALOG LOOKUP ──
async function lookupLCCatalog(searchText) {
  if (!SERVICE_KEY) return null;
  var terms = searchText.toLowerCase().split(/\s+/).filter(function(w) { return w.length >= 2; });
  // Build ilike filters
  var products = [];
  try {
    // Search by name — get all LC products
    var all = await supaFetch('productos?categoria=eq.Lente de contacto&select=id,nombre,precio_venta,pares_por_caja,frecuencia_cambio_dias,duracion_dias,stock&order=nombre&limit=200');
    if (all && all.length) {
      // Filter by search terms
      if (terms.length > 0) {
        products = all.filter(function(p) {
          var n = p.nombre.toLowerCase();
          return terms.every(function(t) { return n.includes(t); });
        });
        // If no exact match, try partial
        if (!products.length) {
          products = all.filter(function(p) {
            var n = p.nombre.toLowerCase();
            return terms.some(function(t) { return n.includes(t); });
          });
        }
      } else {
        products = all.slice(0, 20);
      }
    }
  } catch(e) { console.error('[LC Catalog]', e.message); }
  return products.slice(0, 15);
}

function isAskingAboutLC(text) {
  var lower = text.toLowerCase();
  var keywords = ['lente de contacto', 'lentes de contacto', 'contacto', 'acuvue', 'air optix', 'freshlook', 'biofinity', 'dailies', 'soflens', 'biomedics', 'biotrue', 'clariti', 'oasys', 'comprar lentes', 'precio lentes', 'cuanto cuestan', 'cuánto cuestan', 'cotizar', 'cotización'];
  return keywords.some(function(kw) { return lower.includes(kw); });
}

// ── LC BOX/PRESCRIPTION OCR (for ALL users, not just admin) ──
async function lcPhotoOCR(mediaUrl, mediaType) {
  // 1. Download image from Twilio
  console.log('[LC-OCR] Downloading image...');
  var imgResp = await fetch(mediaUrl, {
    headers: { 'Authorization': twilioAuth() }
  });
  if (!imgResp.ok) throw new Error('No pude descargar la imagen');
  var imgBuffer = await imgResp.arrayBuffer();
  var base64 = Buffer.from(imgBuffer).toString('base64');
  var mType = mediaType || 'image/jpeg';

  // 2. Send to Anthropic Vision for LC-specific extraction
  var aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: 'Eres un experto óptico que clasifica y extrae datos de imágenes. La imagen puede ser:\n' +
        '(A) Caja o blíster de lentes de contacto\n' +
        '(B) Receta oftalmológica / prescripción\n' +
        '(C) Imagen de una promoción publicitaria de una óptica (flyer, anuncio, captura de pantalla, redes sociales, poster en sucursal)\n' +
        '(D) Otra cosa no reconocible\n\n' +
        'PRIMERO clasifica la imagen. Si es (C) PROMO, responde con JSON de promo (no intentes extraer graduación). Si es (A) o (B), extrae datos de LC/receta. Si es (D) OTRA COSA (sticker, emoji, meme, GIF, selfie, foto de una persona, saludo tipo "buenos días/bonito día", paisaje, mascota, comida, objeto no óptico, captura sin promoción), responde EXACTAMENTE {"es_promo":false,"es_otro":true,"descripcion_breve":"qué es la imagen en pocas palabras"} y NADA MÁS.\n' +
        '⛔ NUNCA inventes una RECETA ni una graduación a partir de una imagen que no contiene datos ópticos. Si NO ves números de graduación (PWR/SPH/CYL/AXIS) NI una caja/blíster de lentes de contacto NI texto claro de una receta médica, entonces ES (D): usa es_otro:true. NO fuerces marca="RECETA" en imágenes sin graduación legible.\n\n' +
        'SI ES PROMO (flyer, anuncio, captura de Facebook/Instagram/WhatsApp, poster con precios, texto promocional tipo "2x1", "50% desc", "desde $X"):\n' +
        'Extrae TEXTO VISIBLE completo y condiciones. Formato JSON:\n' +
        '{"es_promo":true,"texto_completo":"todo el texto visible literal, sin resumir","titulo":"título o headline principal","precio":"precio principal si hay","condiciones":"letra chica o condiciones si se ven","marca_negocio":"nombre de la óptica que publica la promo si se ve (ej: Ópticas Car & Era, Devlyn, Ben & Frank, Salud Digna)","fecha_vigencia":"si menciona fecha","detalle":"descripción de qué incluye la promo (ej: armazón + micas CR-39, examen gratis, etc.)"}\n' +
        'Solo llena los campos con información realmente visible. Usa null si no se ve.\n\n' +
        'SI ES LC O RECETA:\n' +
        'Extrae TODA la información visible:\n' +
        '- marca (ej: Air Optix, Acuvue, Biofinity, FreshLook, Dailies)\n' +
        '- modelo (ej: Hydraglyde, Oasys, Colors, Moist)\n' +
        '- tipo: esferico, torico, multifocal, color\n' +
        '- ojo: OD (derecho), OI (izquierdo), o ambos si hay dos datos\n' +
        '- poder/esfera (PWR/SPH): número como -2.50, +1.00\n' +
        '- cilindro (CYL): para tóricos, ej: -0.75, -1.25\n' +
        '- eje (AXIS): para tóricos, ej: 180, 90\n' +
        '- adición (ADD): para multifocales, ej: Low, Med, Hi\n' +
        '- BC (curva base): ej: 8.6\n' +
        '- DIA (diámetro): ej: 14.2\n' +
        '- color: si es LC de color (ej: Sterling Gray, Blue, Green)\n' +
        '- cantidad_cajas: si se ve la cantidad (si no, usa 1)\n' +
        '- frecuencia: diario, quincenal, mensual (si se puede inferir del producto)\n' +
        'Si es una RECETA OFTÁLMICA (no una caja de LC), extrae la graduación para OD y OI. En recetas manuscritas:\n' +
        '- OD = ojo derecho, OS/OI = ojo izquierdo\n' +
        '- Formato típico: -3.25 = -1.25 x 180 significa esfera -3.25, cilindro -1.25, eje 180\n' +
        '- ADD = adición para progresivos/multifocales\n' +
        '- DP/DIP = distancia interpupilar\n' +
        '- Para recetas, usa marca="RECETA" y tipo según lo indicado (si dice LC/lentes de contacto usa "torico" o "esferico" según tenga CYL o no)\n' +
        'Si no puedes leer un campo, usa null.\n' +
        'RESPONDE ÚNICAMENTE con JSON (SIN markdown, sin ```):\n' +
        'Promo: {"es_promo":true,"texto_completo":"...","titulo":"...","precio":"...","condiciones":"...","marca_negocio":"...","fecha_vigencia":null,"detalle":"..."}\n' +
        'LC: {"es_promo":false,"marca":"Air Optix","modelo":"Hydraglyde","tipo":"esferico","ojos":[{"ojo":"OD","pwr":"-2.50","cyl":null,"axis":null,"add":null,"bc":"8.6","dia":"14.2"}],"color":null,"frecuencia":"mensual","cantidad_cajas":1}\n' +
        'Si hay datos para ambos ojos, incluye ambos en el array "ojos".\n' +
        'Si es un producto de color, incluye el nombre del color.\n' +
        'Para recetas oftálmicas: marca="RECETA", modelo=null, tipo según CYL (torico si tiene CYL, esferico si no).\n' +
        'Otra cosa (D): {"es_promo":false,"es_otro":true,"descripcion_breve":"..."}. Recuerda: sin graduación legible ni caja de LC, NO es receta — usa es_otro:true.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mType, data: base64 } },
          { type: 'text', text: 'Clasifica esta imagen y extrae los datos visibles según las reglas. Si NO es caja de LC, receta ni promo (ej: sticker, saludo, selfie, objeto), usa es_otro:true. Responde solo JSON.' }
        ]
      }]
    })
  });

  if (!aiResp.ok) {
    var aiErr = await aiResp.json();
    throw new Error(aiErr.error?.message || 'Error de Vision API');
  }

  var aiData = await aiResp.json();
  var aiText = '';
  if (aiData.content) aiData.content.forEach(function(c) { if (c.type === 'text') aiText += c.text; });

  // 3. Parse JSON response
  var parsed = null;
  var objMatch = aiText.match(/\{[\s\S]*\}/);
  if (objMatch) try { parsed = JSON.parse(objMatch[0]); } catch(e) { console.log('[LC-OCR] JSON parse error:', e.message); }

  return parsed;
}

// Build human-readable LC summary + match with catalog
async function processLCPhoto(mediaUrl, mediaType, phone, userName) {
  var ocr = await lcPhotoOCR(mediaUrl, mediaType);
  if (!ocr) {
    return { reply: '🔍 No pude identificar los datos de esta foto.\n\nPor favor envía una foto más clara.\n\n¡Intenta de nuevo! 😊' };
  }

  // ── PROMO PHOTO DETECTED ──
  // Store promo data in conversation context and generate Clari's response
  // by invoking Anthropic directly with the active promos from knowledge
  if (ocr.es_promo === true) {
    var promoSummary = {
      texto_completo: ocr.texto_completo || null,
      titulo: ocr.titulo || null,
      precio: ocr.precio || null,
      condiciones: ocr.condiciones || null,
      marca_negocio: ocr.marca_negocio || null,
      fecha_vigencia: ocr.fecha_vigencia || null,
      detalle: ocr.detalle || null
    };
    var promoContext = '[PROMO-OCR] ' + JSON.stringify(promoSummary);
    await saveMessage(phone, 'user', promoContext, userName);

    // Build analysis prompt
    var activePromos = getActivePromos();
    var analysisSystem = 'Eres Clari, asistente de Ópticas Car & Era. El cliente envió una foto de una promoción y necesitas analizarla.\n\n' +
      'PROMOS VIGENTES DE ÓPTICAS CAR & ERA:\n' + activePromos + '\n\n' +
      'REGLAS:\n' +
      '- Responde en 2-4 líneas máximo, tono amigable, 1 emoji máximo.\n' +
      '- TIPOS DE IMAGEN — distingue: (a) PROMO con precio/vigencia/condiciones, vs (b) PUBLICIDAD DE PRODUCTO (sin precio ni vigencia, solo describe un producto y sus beneficios). Ópticas Car & Era publica en redes anuncios de PRODUCTOS que manejamos, por ejemplo los FOTOCROMÁTICOS DE COLOR ("un solo lente, dos formas de verte": transparentes adentro, afuera oscurecen DE COLOR — rosa, verde, azul y gris — con protección anti-luz azul). Estos SÍ los manejamos: son un tratamiento que se agrega al armar lentes graduados, y SÍ entran en la promo 2x1.\n' +
      '- Si la imagen describe un producto que manejamos (fotocromáticos de color, blue light, transitions, polarizados, antirreflejante, etc.) y NO trae el nombre de OTRA óptica → trátala como PUBLICIDAD NUESTRA: confirma con seguridad que SÍ los manejamos, 1 línea del beneficio, e invita a sucursal a cotizarlos (el precio depende de graduación + material + el tratamiento). NUNCA digas que "no es promo de Car & Era" en este caso.\n' +
      '- ⛔ SOLO digas "esa promo es de otra óptica" si marca_negocio trae EXPLÍCITAMENTE el nombre de otra óptica (Devlyn, Ben & Frank, Salud Digna, +Visión, etc.). Si marca_negocio es null o no se ve, NUNCA asumas que es de otra óptica — lo más probable es que sea publicidad nuestra que el cliente vio en nuestras redes o anuncios.\n' +
      '- Si la foto trae precio/condiciones de una promo que NO coincide con la vigente (mes pasado, promo vieja) → dile amablemente que esa promoción ya no está vigente y menciona la promo vigente de hoy.\n' +
      '- IMPORTANTE sobre CR-39: si la foto dice "micas incluidas" o "graduación incluida", aclara que eso se refiere a material CR-39 básico con visión sencilla SIN tratamientos. Cualquier material distinto (policarbonato, alto índice), tratamiento (AR, blue light, transitions) o graduación especial (bifocal, progresivo) sube el precio.\n' +
      '- NO admitas culpa ni digas "te cobraron mal". NO prometas reembolsos ni modificaciones. Solo explica las condiciones reales.\n' +
      '- NO uses markdown (sin ** ni listas con -).\n\n' +
      'DATOS DE LA PROMO DE LA FOTO:\n' + JSON.stringify(promoSummary, null, 2);

    try {
      var promoResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 350,
          system: analysisSystem,
          messages: [{ role: 'user', content: 'Analiza esta promo contra las promos vigentes y responde al cliente.' }]
        })
      });
      if (promoResp.ok) {
        var promoData = await promoResp.json();
        var promoReply = '';
        if (promoData.content) promoData.content.forEach(function(c) { if (c.type === 'text') promoReply += c.text; });
        if (promoReply.trim()) {
          return { reply: promoReply.trim(), promo: true, ocr: ocr };
        }
      }
    } catch(e) { console.error('[Promo-Analysis]', e.message); }

    // Fallback if AI call fails
    return {
      reply: 'Gracias por mandarme la promo 👀 Déjame revisarla contra nuestras promos vigentes. ¿En qué más te puedo ayudar mientras tanto?',
      promo: true, ocr: ocr
    };
  }

  // ── FOTO NO ÓPTICA (sticker, saludo, selfie, objeto) ──
  // Evita que un sticker/saludo se convierta en una "receta" alucinada (marca=RECETA con ojos vacíos)
  // y que Clari ofrezca una venta sobre una graduación inexistente.
  var _recetaTieneDatos = ocr.ojos && ocr.ojos.some(function(o) { return o && (o.pwr || o.cyl || o.axis || o.add); });
  if (ocr.es_otro === true || (ocr.marca === 'RECETA' && !_recetaTieneDatos && !ocr.modelo)) {
    var otraCtx = '[FOTO-OTRA] ' + JSON.stringify({ descripcion: ocr.descripcion_breve || null });
    await saveMessage(phone, 'user', otraCtx, userName);
    return { reply: 'Recibí tu foto 👀 ¿En qué te puedo ayudar?' };
  }

  // ── LC / RECETA FLOW ──
  if (!ocr.marca && (!ocr.ojos || !ocr.ojos.length)) {
    return { reply: '🔍 No pude identificar los datos del lente en esta foto.\n\nPor favor envía una foto más clara de:\n📦 La caja del lente de contacto (donde aparecen marca, graduación y parámetros)\n📋 O tu receta/prescripción de lentes de contacto\n\n¡Intenta de nuevo! 😊' };
  }
  var isReceta = ocr.marca === 'RECETA' || !ocr.marca;

  // Build summary
  var summary = '';
  if (isReceta) {
    summary += '📋 *Receta detectada:*\n';
  } else {
    summary += '👁️ *Datos detectados:*\n';
    summary += '🏷️ ' + ocr.marca;
    if (ocr.modelo) summary += ' ' + ocr.modelo;
    if (ocr.tipo) summary += ' (' + ocr.tipo + ')';
    if (ocr.color) summary += ' — Color: ' + ocr.color;
    summary += '\n';
  }

  if (ocr.ojos && ocr.ojos.length) {
    ocr.ojos.forEach(function(o) {
      summary += '\n' + (o.ojo || '??') + ': ';
      if (o.pwr) summary += 'PWR ' + o.pwr;
      if (o.cyl) summary += ' | CYL ' + o.cyl;
      if (o.axis) summary += ' | AXIS ' + o.axis;
      if (o.add) summary += ' | ADD ' + o.add;
      if (o.bc) summary += ' | BC ' + o.bc;
      if (o.dia) summary += ' | DIA ' + o.dia;
    });
    summary += '\n';
  }

  if (ocr.frecuencia) summary += '⏱️ Frecuencia: ' + ocr.frecuencia + '\n';

  // Search catalog for matching products
  var matches;
  if (isReceta) {
    // For prescriptions, search by type (torico/esferico/multifocal)
    var searchType = ocr.tipo || 'contacto';
    matches = await lookupLCCatalog(searchType);
  } else {
    var searchTerm = ocr.marca;
    if (ocr.modelo) searchTerm += ' ' + ocr.modelo;
    if (ocr.tipo === 'color' && ocr.color) searchTerm += ' ' + ocr.color;
    matches = await lookupLCCatalog(searchTerm);
    // If no exact match, try just brand
    if ((!matches || !matches.length) && ocr.marca) {
      matches = await lookupLCCatalog(ocr.marca);
    }
  }

  // Store OCR data in conversation context for Clari to use
  var ocrContext = '[LC-OCR] ' + JSON.stringify(ocr);
  await saveMessage(phone, 'user', ocrContext, userName);

  if (matches && matches.length > 0) {
    if (isReceta) {
      var hasCyl = ocr.ojos && ocr.ojos.some(function(o) { return o.cyl && parseFloat(o.cyl) !== 0; });
      summary += '\n✅ *Opciones de LC ' + (hasCyl ? 'tóricos' : 'esféricos') + ' disponibles:*\n';
      matches.slice(0, 6).forEach(function(p, i) {
        summary += (i + 1) + '. ' + p.nombre + ' — $' + Number(p.precio_venta).toFixed(0) + '/caja\n';
      });
      summary += '\nTu graduación es compatible con estas opciones. En sucursal te hacen el ajuste fino para LC 😊\n';
      summary += '¿Cuál te interesa o quieres que te recomiende?';
    } else {
      summary += '\n✅ *Encontré en nuestro catálogo:*\n';
      matches.forEach(function(p, i) {
        summary += (i + 1) + '. ' + p.nombre + ' — $' + Number(p.precio_venta).toFixed(0) + '/caja';
        if (p.pares_por_caja) summary += ' (' + p.pares_por_caja + ' pares)';
        if (p.stock > 0) summary += ' ✅';
        summary += '\n';
      });
      summary += '\n¿Te gustaría ordenar? Dime cuántas cajas necesitas y en qué sucursal quieres recoger 😊\n';
      summary += '\n💳 Aceptamos transferencia BBVA o link de pago Clip';
    }
  } else {
    summary += '\n⚠️ No encontré ese producto exacto en nuestro catálogo actual.\n';
    summary += 'Pero tenemos opciones similares. ¿Quieres que te muestre alternativas? 👓';
    // Try broader search
    var altMatches = await lookupLCCatalog(ocr.tipo || 'contacto');
    if (altMatches && altMatches.length > 0) {
      summary += '\n\n📋 *Opciones disponibles:*\n';
      altMatches.slice(0, 5).forEach(function(p, i) {
        summary += (i + 1) + '. ' + p.nombre + ' — $' + Number(p.precio_venta).toFixed(0) + '/caja\n';
      });
    }
  }

  return { reply: summary, ocr: ocr, matches: matches };
}

// ── LC SALE CREATION ──
async function generateOnlineFolio() {
  // Read folio config
  var cfgData = await supaFetch('app_config?id=eq.folio_ventas&select=value');
  var folioConfig = {};
  if (cfgData && cfgData[0] && cfgData[0].value) {
    folioConfig = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
  }
  if (!folioConfig['Online']) folioConfig['Online'] = { prefijo: 'ONL', siguiente: 1 };
  var onCfg = folioConfig['Online'];
  // Get last folio
  var lastVenta = await supaFetch('ventas?sucursal=eq.Online&select=folio&order=created_at.desc&limit=1');
  var nextNum = onCfg.siguiente || 1;
  if (lastVenta && lastVenta[0] && lastVenta[0].folio) {
    var m = lastVenta[0].folio.match(/(\d+)$/);
    if (m) nextNum = Math.max(nextNum, parseInt(m[1]) + 1);
  }
  folioConfig['Online'] = { prefijo: 'ONL', siguiente: nextNum + 1 };
  await supaFetch('app_config?id=eq.folio_ventas', {
    method: 'PATCH',
    body: JSON.stringify({ value: JSON.stringify(folioConfig) }),
    prefer: 'return=minimal'
  });
  return 'ONL-' + String(nextNum).padStart(4, '0');
}

async function findOrCreatePatient(name, phone) {
  var cleanPhone = phone.replace(/^\+?521?/, '').replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    // Search by phone
    var byPhone = await supaFetch('pacientes?telefono=ilike.*' + cleanPhone + '*&select=id,nombre,apellidos,telefono&limit=3');
    if (byPhone && byPhone.length > 0) return byPhone[0];
  }
  // Search by name
  if (name) {
    var parts = name.trim().split(/\s+/);
    var nombre = parts[0] || '';
    var apellidos = parts.slice(1).join(' ') || '';
    if (nombre.length >= 2) {
      var byName = await supaFetch('pacientes?nombre=ilike.*' + nombre + '*&select=id,nombre,apellidos,telefono&limit=5');
      if (byName && byName.length > 0) {
        // Try to match by apellido too
        if (apellidos && byName.length > 1) {
          var exact = byName.find(function(p) { return (p.apellidos||'').toLowerCase().includes(apellidos.toLowerCase().split(' ')[0]); });
          if (exact) return exact;
        }
        if (byName.length === 1) return byName[0];
      }
    }
    // Create new patient
    var newPac = await supaFetch('pacientes', {
      method: 'POST',
      body: JSON.stringify({ nombre: nombre, apellidos: apellidos, telefono: cleanPhone.length === 10 ? cleanPhone : null, estado: 'activo' }),
      prefer: 'return=representation'
    });
    if (newPac && newPac.length > 0) {
      console.log('[LC Sale] Nuevo paciente creado: ' + nombre + ' ' + apellidos);
      return newPac[0];
    }
  }
  return null;
}

async function createLCSale(customerName, productName, qty, total, sucursalEntrega, customerPhone) {
  // 1. Find or create patient
  var patient = await findOrCreatePatient(customerName, customerPhone);
  if (!patient) throw new Error('No se pudo encontrar o crear paciente');
  
  // 2. Find product
  var prods = await supaFetch('productos?categoria=eq.Lente de contacto&nombre=ilike.*' + encodeURIComponent(productName.split(' ')[0]) + '*&select=id,nombre,precio_venta,pares_por_caja,frecuencia_cambio_dias&limit=10');
  var prod = null;
  if (prods && prods.length) {
    // Try exact match first
    prod = prods.find(function(p) { return p.nombre.toLowerCase() === productName.toLowerCase(); });
    if (!prod) prod = prods.find(function(p) { return p.nombre.toLowerCase().includes(productName.toLowerCase().substring(0, 15)); });
    if (!prod) prod = prods[0];
  }
  
  // 3. Generate folio
  var folio = await generateOnlineFolio();
  
  // 4. Create venta
  var ventaData = {
    folio: folio,
    paciente_id: patient.id,
    asesor: 'Clari (WA)',
    sucursal: 'Online',
    canal_venta: 'WhatsApp',
    sucursal_entrega: sucursalEntrega || 'Américas',
    subtotal: total,
    descuento: 0,
    total: total,
    pagado: 0,
    saldo: total,
    estado: 'Apartado',
    fecha_entrega: null,
    hora_entrega: null,
    notas: '🌐 Venta generada por Clari vía WhatsApp'
  };
  var ventaResult = await supaFetch('ventas', {
    method: 'POST',
    body: JSON.stringify(ventaData),
    prefer: 'return=representation'
  });
  if (!ventaResult || !ventaResult.length) throw new Error('Error creando venta');
  var venta = ventaResult[0];
  
  // 5. Create venta item
  var precioUnit = prod ? Number(prod.precio_venta) : Math.round(total / qty);
  await supaFetch('venta_items', {
    method: 'POST',
    body: JSON.stringify({
      venta_id: venta.id,
      producto_id: prod ? prod.id : null,
      descripcion: productName,
      cantidad: qty,
      precio_unitario: precioUnit,
      descuento_item: 0,
      subtotal: total
    }),
    prefer: 'return=minimal'
  });
  
  // 6. Register in LC CRM tracking
  if (prod) {
    var pares = prod.pares_por_caja || 3;
    var freq = prod.frecuencia_cambio_dias || 30;
    var duracion = pares * freq * qty;
    var hoy = new Date().toISOString().slice(0, 10);
    var fechaRecompra = new Date();
    fechaRecompra.setDate(fechaRecompra.getDate() + duracion);
    await supaFetch('lc_seguimiento', {
      method: 'POST',
      body: JSON.stringify({
        paciente_id: patient.id,
        venta_id: venta.id,
        producto: productName,
        producto_id: prod.id,
        sucursal: 'Online',
        canal_venta: 'WhatsApp',
        fecha_compra: hoy,
        duracion_dias: duracion,
        cantidad_cajas: qty,
        fecha_recompra: fechaRecompra.toISOString().slice(0, 10),
        estado: 'activo'
      }),
      prefer: 'return=minimal'
    });
  }
  
  console.log('[LC Sale] Venta creada: ' + folio + ' · ' + customerName + ' · ' + productName + ' x' + qty + ' · $' + total);
  return { folio: folio, venta_id: venta.id, paciente: patient, total: total, sucursal: sucursalEntrega };
}

// ── PENDING SALE (approval flow) ──
async function savePendingSale(phone, saleData) {
  // Store pending sale in app_config with key 'clari_pending_sale_PHONE'
  var key = 'clari_pending_' + phone.replace(/\D/g, '').slice(-10);
  await supaFetch('app_config', {
    method: 'POST',
    body: JSON.stringify({ id: key, value: JSON.stringify(saleData) }),
    prefer: 'return=minimal'
  });
}

async function getPendingSale(phone) {
  var key = 'clari_pending_' + phone.replace(/\D/g, '').slice(-10);
  var data = await supaFetch('app_config?id=eq.' + key + '&select=value');
  if (data && data[0] && data[0].value) {
    return typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
  }
  return null;
}

async function deletePendingSale(phone) {
  var key = 'clari_pending_' + phone.replace(/\D/g, '').slice(-10);
  await supaFetch('app_config?id=eq.' + key, { method: 'DELETE', prefer: 'return=minimal' });
}

async function notifyAdminPendingSale(saleData, customerPhone) {
  // Get admin phones
  var cfgData = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
  var adminPhones = [];
  if (cfgData && cfgData[0] && cfgData[0].value) {
    var cfg = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
    adminPhones = cfg.admin_phones || cfg.recipients_corte || [];
  }
  if (!adminPhones.length) { console.warn('[LC Sale] No admin phones configured'); return; }
  
  var titulo = saleData.isRecompra
    ? '🔄 *RECOMPRA LC (cliente regresa)* 🎉'
    : '🛒 *NUEVA VENTA CLARI (pendiente)*';
  var msg = titulo + '\n\n'
    + '👤 Cliente: ' + saleData.customerName + '\n'
    + '📱 Tel: ' + customerPhone + '\n'
    + '👁 Producto: ' + saleData.productName + '\n'
    + '📦 Cantidad: ' + saleData.qty + ' cajas\n'
    + '💰 Total: $' + saleData.total + '\n'
    + '🏪 Entrega: ' + saleData.sucursalEntrega + '\n'
    + (saleData.isRecompra ? '♻️ *Recompra automática desde recordatorio*\n' : '') + '\n'
    + 'Responde:\n'
    + '✅ *APROBAR 3 dias* (o la fecha/tiempo)\n'
    + '❌ *RECHAZAR*';
  
  for (var i = 0; i < adminPhones.length; i++) {
    await sendWhatsAppReply(adminPhones[i], msg);
  }
}

// ── 🛡️ VISIÓN SEGURA por WhatsApp: genera link de pago Clip + guarda mapeo para el webhook ──
var VS_PRICES = { BASICO: 499, PLUS: 999, PREMIUM: 1999 };
var VS_LABELS = { BASICO: 'Básico', PLUS: 'Plus', PREMIUM: 'Premium' };

async function crearLinkVisionSegura(phone, plan) {
  plan = (plan || '').toUpperCase();
  if (!VS_PRICES[plan]) return { ok: false, reason: 'plan_invalido' };
  var monto = VS_PRICES[plan];
  var tel10 = (phone || '').replace(/\D/g, '').slice(-10);
  if (tel10.length !== 10) return { ok: false, reason: 'no_paciente' };

  // 1. Buscar paciente por teléfono (eq 10 dígitos, fallback ilike)
  var pacs = await supaFetch('pacientes?telefono=eq.' + tel10 + '&select=id,nombre,apellidos&limit=1');
  if (!pacs || !pacs.length) {
    pacs = await supaFetch('pacientes?telefono=ilike.*' + tel10 + '*&select=id,nombre,apellidos&limit=1');
  }
  if (!pacs || !pacs.length) return { ok: false, reason: 'no_paciente' };
  var pac = pacs[0];
  var nombre = (pac.nombre + ' ' + (pac.apellidos || '')).trim();

  // 2. Órdenes recientes del paciente → candidatos de armazón (más reciente primero)
  var ords = await supaFetch('ordenes_laboratorio?paciente_id=eq.' + pac.id + '&select=armazon,notas_laboratorio,created_at&order=created_at.desc&limit=12');
  if (!ords || !ords.length) return { ok: false, reason: 'no_compra' };

  // 3. Elegir el armazón MÁS RECIENTE que NO tenga ya una protección VIGENTE (regla: 1 seguro por armazón)
  var idArmazon = null;
  for (var i = 0; i < ords.length; i++) {
    var folio = ((ords[i].notas_laboratorio || '').match(/Folio:\s*([^\s|]+)/) || [])[1] || '';
    var cand = (ords[i].armazon || '').trim() || (folio ? ('Folio ' + folio) : '');
    if (!cand) continue;
    var ya = await supaFetch('vision_segura?id_armazon=eq.' + encodeURIComponent(cand) + '&estado=eq.VIGENTE&select=id&limit=1');
    if (!ya || !ya.length) { idArmazon = cand; break; }
  }
  if (!idArmazon) return { ok: false, reason: 'todos_protegidos' };

  // 4. Crear checkout en Clip
  var SITE = process.env.URL || 'https://optcaryera.netlify.app';
  var token = process.env.CLIP_WEBHOOK_TOKEN ? ('?token=' + process.env.CLIP_WEBHOOK_TOKEN) : '';
  var clipBody = {
    amount: monto,
    currency: 'MXN',
    purchase_description: 'Vision Segura ' + VS_LABELS[plan] + ' - Opticas Car y Era',
    redirection_url: {
      success: SITE + '/vision-segura?pago=ok',
      error: SITE + '/vision-segura?pago=error',
      default: SITE + '/vision-segura'
    },
    metadata: { me_reference_id: 'VS-' + plan, customer_info: { name: nombre } },
    webhook_url: SITE + '/.netlify/functions/clip-webhook' + token
  };
  var resp = await fetch('https://api.payclip.com/v2/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from((process.env.CLIP_API_KEY || '') + ':' + (process.env.CLIP_API_SECRET || '')).toString('base64')
    },
    body: JSON.stringify(clipBody)
  });
  var data = await resp.json();
  if (!resp.ok || !data.payment_request_url || !data.payment_request_id) {
    console.error('[VS] Clip API error:', resp.status, JSON.stringify(data).slice(0, 300));
    return { ok: false, reason: 'clip_error' };
  }

  // 5. Guardar mapeo pendiente para que clip-webhook registre la protección al pagar
  var pendKey = 'vs_pending_' + data.payment_request_id;
  await supaFetch('app_config?on_conflict=id', {
    method: 'POST',
    body: JSON.stringify({ id: pendKey, value: JSON.stringify({
      id_px: pac.id, id_armazon: idArmazon, plan: plan, phone: tel10, monto: monto, nombre: nombre, created: Date.now()
    }) }),
    prefer: 'return=minimal,resolution=merge-duplicates'
  });

  return { ok: true, url: data.payment_request_url, monto: monto, label: VS_LABELS[plan], plan: plan, armazon: idArmazon, nombre: nombre };
}

async function notifyAdminVS(phone, vsRes) {
  try {
    var cfgData = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
    var adminPhones = [];
    if (cfgData && cfgData[0] && cfgData[0].value) {
      var cfg = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
      adminPhones = cfg.admin_phones || cfg.recipients_corte || [];
    }
    var msg = '🛡️ *Visión Segura — link enviado por Clari*\n\n'
      + '👤 ' + vsRes.nombre + '\n'
      + '📱 Tel: ' + phone + '\n'
      + '📦 Plan: ' + vsRes.label + ' ($' + vsRes.monto + ')\n'
      + '👓 Armazón: ' + vsRes.armazon + '\n\n'
      + 'Al pagar, la protección se registra sola y se liga a ese armazón. Verifica que sea el correcto.';
    for (var i = 0; i < adminPhones.length; i++) { try { await sendWhatsAppReply(adminPhones[i], msg); } catch(e){} }
  } catch (e) { console.warn('[VS] notifyAdmin error:', e.message); }
}

// ── 🎂 CORRECCIÓN DE FECHA DE CUMPLEAÑOS (Clari, solo día+mes, conserva el año) ──
// Solo aplica a clientes que recibieron el cupón de cumpleaños este año ([Cumple-AAAA] en su historial).
var _CUMPLE_MESES = { enero:1,ene:1,febrero:2,feb:2,marzo:3,mar:3,abril:4,abr:4,mayo:5,may:5,junio:6,jun:6,julio:7,jul:7,agosto:8,ago:8,septiembre:9,setiembre:9,sep:9,sept:9,octubre:10,oct:10,noviembre:11,nov:11,diciembre:12,dic:12 };
function _cumpleStripAccents(s){ return (s||'').replace(/[áéíóúü]/g,function(c){return {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u'}[c];}); }
function _cumpleValidDM(d, mo){
  if (!(d>=1 && d<=31 && mo>=1 && mo<=12)) return null;
  var dim=[31,29,31,30,31,30,31,31,30,31,30,31];
  if (d>dim[mo-1]) return null;
  return { dia:d, mes:mo };
}
function _cumpleParseFecha(text){
  var t = _cumpleStripAccents((text||'').toLowerCase());
  var m = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,})\b/); // "15 de marzo" / "15 marzo"
  if (m && _CUMPLE_MESES[m[2]] !== undefined) { var r=_cumpleValidDM(parseInt(m[1],10), _CUMPLE_MESES[m[2]]); if(r) return r; }
  var m2 = t.match(/\b([a-z]{3,})\s+(\d{1,2})\b/); // "marzo 15"
  if (m2 && _CUMPLE_MESES[m2[1]] !== undefined) { var r2=_cumpleValidDM(parseInt(m2[2],10), _CUMPLE_MESES[m2[1]]); if(r2) return r2; }
  var m3 = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?\b/); // "15/03" / "15-3-1990"
  if (m3) { var r3=_cumpleValidDM(parseInt(m3[1],10), parseInt(m3[2],10)); if(r3) return r3; }
  return null;
}
async function handleCumpleCorreccion(from, userText){
  try {
    var fecha = _cumpleParseFecha(userText);
    if (!fecha) return null;
    var t = _cumpleStripAccents((userText||'').toLowerCase());
    // Requiere referencia explícita al cumpleaños/nacimiento/corrección, O un mensaje CORTO que sea casi solo la fecha
    // (evita falsos positivos como "paso el 15 de marzo a recoger" — 40 chars con otra intención — o preguntas con "?").
    var corto = (userText||'').trim().length <= 25 && !/\?\s*$/.test((userText||'').trim());
    if (!(/cumple|naci|mi fecha|no es (mi|hoy)|hoy no es|fecha de nac|equivoc|esta mal|incorrect/.test(t) || corto)) return null;
    var d10 = (from||'').replace(/\D/g,'').slice(-10);
    if (d10.length < 10) return null;
    var anio = new Date().getFullYear();
    var tagCheck = await supaFetch('clari_conversations?phone=ilike.*' + d10 + '*&content=ilike.*Cumple-' + anio + '*&select=id&limit=1');
    if (!tagCheck || !tagCheck.length) return null; // no recibió el cupón → no corrige
    var pacs = await supaFetch('pacientes?telefono=ilike.*' + d10 + '*&select=id,nombre,fecha_nacimiento&limit=1');
    if (!pacs || !pacs.length) return null;
    var pac = pacs[0];
    var yr = (pac.fecha_nacimiento && /^\d{4}/.test(pac.fecha_nacimiento)) ? pac.fecha_nacimiento.slice(0,4) : '1990'; // conserva el AÑO
    var nuevoISO = yr + '-' + String(fecha.mes).padStart(2,'0') + '-' + String(fecha.dia).padStart(2,'0');
    var actual = (pac.fecha_nacimiento||'').slice(0,10);
    if (actual !== nuevoISO) {
      await supaFetch('pacientes?id=eq.' + pac.id, { method:'PATCH', body: JSON.stringify({ fecha_nacimiento: nuevoISO }), prefer:'return=minimal' });
    }
    var meses = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    var primer = (pac.nombre||'').trim().split(/\s+/)[0] || '';
    return 'Listo' + (primer?' '+primer:'') + ', ya lo corregí 🎂 Tu cumpleaños quedó el ' + fecha.dia + ' de ' + meses[fecha.mes] + '. Te felicitamos en ' + meses[fecha.mes] + ' y tu cupón aplica ese mes 🎁';
  } catch(e){ console.warn('[Cumple-Fix]', e.message); return null; }
}

// ── 🤐 CIERRE CORTÉS — si el cliente solo agradece o se despide, Clari NO responde (evita re-pitch robótico) ──
// SOLO agradecimientos/despedidas (NUNCA confirmaciones tipo "ok/sí/va" que avanzan ventas).
function isPureCourtesyCloser(text){
  var raw = (text||'').trim();
  if (!raw) return false;
  var t = _cumpleStripAccents(raw.toLowerCase());
  // limpia emojis + puntuación
  var noemoji = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}❤️‍✅✨]/gu,'').replace(/[!¡.,;:~_*"')(\/\-]/g,' ').replace(/\s+/g,' ').trim();
  if (!noemoji) return true; // solo emojis (👍 🎂 👋 ❤️) → cierre
  if (noemoji.length > 40) return false;
  // NO silenciar si trae pregunta, intención de pedir/seguir, o una confirmación que avanza venta (ok/sí/va/perfecto…)
  if (/\?|precio|cuanto|cuando|donde|cita|graduacion|examen|pedido|folio|lente|cupon|promo|info|ayuda|quiero|necesito|tienen|hay |aparta|comprar|cotiz|disponible|manda|envia|pasame|pregunta|duda|otra cosa|tambien|ademas|una mas|me puedes|podrias|\bsi\b|\bok\b|okay|vale|listo|claro|perfecto|\bsale\b|\bva\b/.test(t)) return false;
  // whitelist: SOLO agradecimiento / despedida inequívoca (NO incluye saludos ambiguos como "buenas noches" que pueden ABRIR conversación)
  return /\b(gracias|grax|igualmente|bendiciones|saludos|de nada|que amable|muy amable|hasta luego|hasta pronto|hasta ma(n|ñ)ana|nos vemos|que tengas|que tengan|que te vaya bien|que est(e|e)n bien|que estes bien|que descanses|cuidate|cuidense|adios|bye|chao|chau|estamos en contacto|gracias por todo)\b/.test(noemoji);
}
// Respuesta cálida y breve a la PRIMERA despedida (sin promo). La SEGUNDA en adelante = silencio.
// Frases fijas → se detectan por sí mismas en el historial (sin guardar ningún marcador visible).
var _CIERRE_GRACIAS = ['¡Con gusto! 😊', '¡A ti! Que estés muy bien 😊', '¡Para servirte! 😊'];
var _CIERRE_DESPEDIDA = ['¡Hasta luego! 😊', '¡Que estés muy bien! 😊', '¡Nos vemos! 😊'];
var _CIERRE_TODAS = _CIERRE_GRACIAS.concat(_CIERRE_DESPEDIDA);
function _cierreReply(text){
  var t = _cumpleStripAccents((text||'').toLowerCase());
  var esGracias = /gracias|grax|de nada|que amable|muy amable/.test(t);
  var opts = esGracias ? _CIERRE_GRACIAS : _CIERRE_DESPEDIDA;
  return opts[Math.floor(Math.random()*opts.length)];
}
// ¿El último mensaje de Clari ya fue una despedida de cierre? (para no responder dos veces)
function _yaEsCierre(msg){
  var m = (msg||'').replace(/\s*\[Cierre\]\s*/g,'').trim(); // tolera marcador legacy
  return _CIERRE_TODAS.indexOf(m) !== -1;
}

// ── 🛡️ Detector de intento de manipulación / jailbreak / prompt-injection a Clari ──
// Probado: 0 falsos positivos en mensajes normales de óptica; detecta los patrones claros de ataque.
function isPromptInjection(text){
  var t = (text||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  var pats = [
    /ignore (all |your |the |previous |above )*(instruction|rule|prompt|guideline)/,
    /disregard (all |your |the |previous |above )/,
    /system (prompt|instruction|message)/,
    /(reveal|show|output|print|repeat|give me|tell me|display)[^.]{0,20}(system )?(instruction|prompt|rule|config|guideline)/,
    /\bdan (mode|jailbreak)\b|\bmodo dan\b|do anything now|jail ?break|developer mode|unrestricted (mode|ai|assistant|system|version)/,
    /forget (you are|your|everything|all|that you)/,
    /you are now (a|an|named|unrestricted|dan|in)/,
    /(pretend|act) (to be|as|like|you are)|roleplay as|simulate (a|an|being)/,
    /(respond|reply|answer)[^.]{0,15}in json|output[^.]{0,10}(json|code|raw)/,
    /bypass[^.]{0,20}(security|cybersecurity|filter|rule|restriction|safeguard)/,
    /how (do i|to|can i)[^.]{0,15}(bypass|hack|exploit|break into)/,
    // español
    /ignora (tus|las|todas|los|mis) (instruccion|regla|directriz|orden)/,
    /olvida que eres|olvida (todas? )?tus (instruccion|regla)/,
    /act[uú]a como (un|una) (sistema|ia|asistente sin)|finge (ser|que eres)/,
    /(muestrame|dame|revela|imprime|dime|escribe) (tus|el|las|tu) (instruccion|prompt|regla|sistema|configuracion)/,
    /modo (desarrollador|sin restricciones|libre|dios)/,
    /eres ahora|eres (un sistema )?(sin restricciones|libre|dan)/,
    /responde(me)?[^.]{0,10}json|formato json/,
  ];
  return pats.some(function(re){ return re.test(t); });
}

// ── 🔏 Validación de firma de Twilio (X-Twilio-Signature = HMAC-SHA1 de URL+params ordenados, base64) ──
var _waCrypto = require('crypto');
function validateTwilioSignature(authToken, signature, url, params) {
  if (!authToken || !signature) return false;
  try {
    var data = Object.keys(params || {}).sort().reduce(function(acc, k){ return acc + k + params[k]; }, url);
    var expected = _waCrypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
    var a = Buffer.from(signature), b = Buffer.from(expected);
    return a.length === b.length && _waCrypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

// ── MAIN HANDLER ──
exports.handler = async function(event) {
  var H = { 'Content-Type': 'text/xml', 'Cache-Control': 'no-cache' };

  // Twilio sends POST with form-urlencoded body
  if (event.httpMethod === 'POST') {
    try {
      var tw = parseBody(event.body);
      // ── 🔏 Firma de Twilio — MODO MONITOR (registra; solo rechaza si WEBHOOK_ENFORCE_SIG=1). Prueba varias URLs candidatas. ──
      try {
        var _tsig = (event.headers && (event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature'])) || '';
        var _cands = [];
        if (event.rawUrl) _cands.push(event.rawUrl);
        var _h = event.headers && (event.headers['x-forwarded-host'] || event.headers.host);
        if (_h) _cands.push('https://' + _h + (event.path || ''));
        _cands.push('https://optcaryera.netlify.app/.netlify/functions/wa-webhook');
        var _tOk = _cands.some(function(u){ return validateTwilioSignature(process.env.TWILIO_AUTH_TOKEN, _tsig, u, tw); });
        if (_tOk) { console.log('[SIG][Twilio] OK'); }
        else {
          console.warn('[SIG][Twilio] MISMATCH hasSig=' + (!!_tsig) + ' urls=' + JSON.stringify(_cands));
          if (process.env.WEBHOOK_ENFORCE_SIG === '1' && process.env.TWILIO_AUTH_TOKEN) {
            return { statusCode: 403, headers: H, body: '<Response></Response>' };
          }
        }
      } catch (_tse) { console.warn('[SIG][Twilio] error ' + _tse.message); }
      var from = (tw.From || '').replace('whatsapp:+', '');
      var userText = (tw.Body || '').trim();
      var userName = tw.ProfileName || '';
      var messageSid = tw.MessageSid || '';
      var numMedia = parseInt(tw.NumMedia || '0');

      // ── PROMO 2X1 ABRIL — Quick Reply button handler ──
      // Twilio envía ButtonPayload con el id del botón cuando el usuario toca Quick Reply.
      // Responde canned y regresa; el siguiente mensaje del usuario va a Clari IA normal.
      var buttonPayload = (tw.ButtonPayload || '').trim();
      if (from && (buttonPayload === 'interesa' || buttonPayload === 'mas_info' || buttonPayload === 'no_gracias')) {
        var btnLabel = '', btnReply = '';
        if (buttonPayload === 'interesa') {
          btnLabel = 'Me interesa';
          btnReply = '¡Perfecto! 👓 ¿Qué sucursal te queda más cerca o te mando las ubicaciones?';
        } else if (buttonPayload === 'mas_info') {
          btnLabel = 'Más info';
          btnReply = 'En el 2x1 compras 2 lentes completos y pagas como 1. Y puedes sumar un lente solar graduado: GRATIS si tu compra es de $3,000 o más, o por solo $499 si es menor. ¿Te late?';
        } else {
          btnLabel = 'No gracias';
          btnReply = 'Gracias por avisarme 😊 Si cambias de parecer, aquí estoy.';
        }
        await saveMessage(from, 'user', '[Promo-2x1-Button:' + buttonPayload + '] ' + btnLabel, userName);
        await sendWhatsAppReply(from, btnReply);
        await saveMessage(from, 'assistant', btnReply);
        return { statusCode: 200, headers: H, body: '<Response></Response>' };
      }

      if (!from || !userText) {
        // Media message without text (or empty text)
        if (from && numMedia > 0) {
          console.log('[Media] from=' + from + ' numMedia=' + numMedia + ' MediaUrl0=' + (tw.MediaUrl0||'NONE') + ' MediaContentType0=' + (tw.MediaContentType0||'NONE'));
          var isAdminMedia = await isAdminPhone(from);
          console.log('[Media] isAdmin=' + isAdminMedia);
          // Twilio WA sends MediaUrl0, MediaContentType0
          var mediaUrl = tw.MediaUrl0 || tw['MediaUrl0'] || '';
          var mediaType = tw.MediaContentType0 || tw['MediaContentType0'] || 'image/jpeg';

          // Admin sends photo → Lab Assistant OCR
          if (isAdminMedia && mediaUrl) {
            var adminImgUrl = await uploadChatMedia(mediaUrl, mediaType, from);
            await saveMessage(from, 'user', '📸 Foto nota de compra' + (adminImgUrl ? '\n[IMG:' + adminImgUrl + ']' : ''), userName);
            try {
              var ocrResult = await labAssistantOCR(mediaUrl, mediaType, userName);
              await sendWhatsAppReply(from, ocrResult.reply);
              await saveMessage(from, 'assistant', ocrResult.reply);
            } catch(ocrErr) {
              console.error('[LabOCR Error]', ocrErr.message, ocrErr.stack);
              await sendWhatsAppReply(from, '❌ Error procesando la foto: ' + ocrErr.message);
            }
            return { statusCode: 200, headers: H, body: '<Response></Response>' };
          }

          // Admin but no mediaUrl — log and reply
          if (isAdminMedia && !mediaUrl) {
            console.log('[Media] Admin pero sin MediaUrl. Params:', JSON.stringify(Object.keys(tw)));
            await sendWhatsAppReply(from, '⚠ Recibí tu foto pero no pude obtener la URL. Intenta de nuevo.');
            return { statusCode: 200, headers: H, body: '<Response></Response>' };
          }

          // Non-admin media → LC Photo OCR (contact lens box/prescription)
          var custMediaUrl = tw.MediaUrl0 || tw['MediaUrl0'] || '';
          var custMediaType = tw.MediaContentType0 || tw['MediaContentType0'] || 'image/jpeg';
          if (custMediaUrl && (custMediaType||'').startsWith('image/')) {
            var custImgUrl = await uploadChatMedia(custMediaUrl, custMediaType, from);
            await saveMessage(from, 'user', '📷 Foto recibida (LC/receta)' + (custImgUrl ? '\n[IMG:' + custImgUrl + ']' : ''), userName);
            try {
              console.log('[LC-OCR] Processing photo from customer ' + from);
              var lcResult = await processLCPhoto(custMediaUrl, custMediaType, from, userName);
              await sendWhatsAppReply(from, lcResult.reply);
              await saveMessage(from, 'assistant', lcResult.reply);
            } catch(lcErr) {
              console.error('[LC-OCR Error]', lcErr.message);
              await sendWhatsAppReply(from, '📸 Recibí tu foto pero tuve un problema procesándola.\n\n¿Podrías enviarla de nuevo? Asegúrate que se vea bien la caja del lente o la receta 👓');
              await saveMessage(from, 'assistant', '⚠ Error procesando foto: ' + lcErr.message);
            }
            return { statusCode: 200, headers: H, body: '<Response></Response>' };
          }
          // Non-image media (audio, video, etc.)
          await saveMessage(from, 'user', '📎 Media recibida', userName);
          var mediaReply = '¡Gracias por tu mensaje! 😊 Por el momento puedo leer fotos de cajas de lentes de contacto o recetas. Si tienes alguna pregunta, escríbela y con gusto te ayudo 👓✨';
          await sendWhatsAppReply(from, mediaReply);
          await saveMessage(from, 'assistant', mediaReply);
          return { statusCode: 200, headers: H, body: '<Response></Response>' };
        }
        return { statusCode: 200, headers: H, body: '<Response></Response>' };
      }

      // Check if admin sent text WITH media (photo + caption)
      if (numMedia > 0) {
        console.log('[MediaWithText] from=' + from + ' text=' + userText.substring(0,50) + ' MediaUrl0=' + (tw.MediaUrl0||'NONE'));
        var isAdminWithMedia = await isAdminPhone(from);
        var mediaUrl2 = tw.MediaUrl0 || tw['MediaUrl0'] || '';
        var mediaType2 = tw.MediaContentType0 || tw['MediaContentType0'] || 'image/jpeg';
        if (isAdminWithMedia && mediaUrl2) {
          var adminImgUrl2 = await uploadChatMedia(mediaUrl2, mediaType2, from);
          await saveMessage(from, 'user', '📸 ' + userText + (adminImgUrl2 ? '\n[IMG:' + adminImgUrl2 + ']' : ''), userName);
          try {
            var ocrResult2 = await labAssistantOCR(mediaUrl2, mediaType2, userName, userText);
            await sendWhatsAppReply(from, ocrResult2.reply);
            await saveMessage(from, 'assistant', ocrResult2.reply);
          } catch(ocrErr2) {
            console.error('[LabOCR2 Error]', ocrErr2.message);
            await sendWhatsAppReply(from, '❌ Error procesando: ' + ocrErr2.message);
          }
          return { statusCode: 200, headers: H, body: '<Response></Response>' };
        }
        // Non-admin sent photo WITH text → check if it's about LC or something else
        if (!isAdminWithMedia && mediaUrl2 && (mediaType2||'').startsWith('image/')) {
          var custImgUrl2 = await uploadChatMedia(mediaUrl2, mediaType2, from);
          await saveMessage(from, 'user', '📷 ' + userText + (custImgUrl2 ? '\n[IMG:' + custImgUrl2 + ']' : ''), userName);
          // If caption mentions LC-related terms OR promo references → LC/Promo OCR. Otherwise → let Clari handle with photo context
          var lcTerms = /lente(s)?\s*(de)?\s*contacto|caja|graduaci[oó]n|receta|rx|prescripci[oó]n|recompra|pedir\s*lentes/i;
          var promoTerms = /promo(ci[oó]n)?|oferta|descuento|anuncio|flyer|cupon|cup[oó]n|2x1|3x1|por\s*ciento|%|promocional|mira|fijate|vi\s+est[ae]|esta\s+es/i;
          if (lcTerms.test(userText) || promoTerms.test(userText)) {
            try {
              console.log('[LC-OCR+Text] Processing photo from customer ' + from + ' caption: ' + userText.substring(0,50));
              var lcResult2 = await processLCPhoto(mediaUrl2, mediaType2, from, userName);
              await sendWhatsAppReply(from, lcResult2.reply);
              await saveMessage(from, 'assistant', lcResult2.reply);
            } catch(lcErr2) {
              console.error('[LC-OCR2 Error]', lcErr2.message);
              await sendWhatsAppReply(from, '📸 Recibí tu foto pero tuve un problema. ¿Podrías enviarla de nuevo? 👓');
            }
            return { statusCode: 200, headers: H, body: '<Response></Response>' };
          }
          // Not LC-related → let message flow through to Clari (photo saved above, text continues below)
          console.log('[Photo+Text] Not LC — passing to Clari: ' + userText.substring(0,60));
        }
      }

      console.log('[Incoming] ' + from + ' (' + userName + '): ' + userText);

      // ── CHECK IF ADMIN PHONE (single check, reused) ──
      var isAdmin = await isAdminPhone(from);

      // ── AUTHORIZATION RESPONSE (SI/NO) ──
      var isAuthResponse = false;
      var lowerText = userText.toLowerCase().trim();

      // ── APROBAR/RECHAZAR VENTA CLARI ──
      if (isAdmin && !isAuthResponse) {
        var aprobarMatch = userText.match(/^aprobar\s+(.+)/i);
        var isRechazar = lowerText === 'rechazar';
        
        if (aprobarMatch || isRechazar) {
          var pendingKeys = await supaFetch('app_config?id=like.clari_pending_*&select=id,value&limit=5');
          if (pendingKeys && pendingKeys.length > 0) {
            var pendEntry = pendingKeys[0];
            var pendData = typeof pendEntry.value === 'string' ? JSON.parse(pendEntry.value) : pendEntry.value;
            var custPhone = pendData.customerPhone || '';
            
            if (aprobarMatch) {
              var tiempoEntrega = aprobarMatch[1].trim();
              // Save delivery time and mark as approved-pending-customer
              pendData.tiempoEntrega = tiempoEntrega;
              pendData.adminApproved = true;
              await supaFetch('app_config?id=eq.' + pendEntry.id, {
                method: 'PATCH',
                body: JSON.stringify({ value: JSON.stringify(pendData) }),
                prefer: 'return=minimal'
              });
              // Notify customer with delivery time
              if (custPhone) {
                await sendWhatsAppReply(custPhone, '¡Hola! 👋 Tenemos novedades sobre tu pedido de lentes de contacto.\n\n👁 ' + pendData.productName + ' x' + pendData.qty + '\n💰 Total: $' + pendData.total + '\n🏪 Recoger en: ' + pendData.sucursalEntrega + '\n📅 Tiempo de entrega: ' + tiempoEntrega + '\n\n¿Deseas confirmar tu pedido? Responde *SI* para proceder o *NO* para cancelar.');
                await saveMessage(custPhone, 'assistant', 'Tiempo de entrega: ' + tiempoEntrega + '. Esperando confirmación del cliente.');
              }
              await sendWhatsAppReply(from, '✅ Tiempo de entrega enviado al cliente: ' + tiempoEntrega + '\n⏳ Esperando confirmación del cliente...');
              await saveMessage(from, 'user', userText, userName);
              console.log('[LC Sale] Admin approved with delivery: ' + tiempoEntrega);
            } else {
              // Rechazar
              if (custPhone) {
                await sendWhatsAppReply(custPhone, 'Hola 👋 Lamentamos informarte que no pudimos procesar tu pedido de lentes de contacto en este momento. Te invitamos a visitar cualquiera de nuestras sucursales para atenderte personalmente. ¡Disculpa la molestia! 🙏');
              }
              await supaFetch('app_config?id=eq.' + pendEntry.id, { method: 'DELETE', prefer: 'return=minimal' });
              await sendWhatsAppReply(from, '❌ Venta rechazada. Se notificó al cliente.');
              await saveMessage(from, 'user', userText, userName);
              console.log('[LC Sale] Rejected: ' + pendData.customerName);
            }
            isAuthResponse = true;
          }
        }
      }

      // ── CUSTOMER CONFIRMS PENDING SALE (SI/NO after delivery time) ──
      if (!isAdmin && !isAuthResponse && (lowerText === 'si' || lowerText === 'sí' || lowerText === 'no')) {
        var custPending = await getPendingSale(from);
        if (custPending && custPending.adminApproved) {
          if (lowerText === 'si' || lowerText === 'sí') {
            try {
              var saleResult = await createLCSale(custPending.customerName, custPending.productName, custPending.qty, custPending.total, custPending.sucursalEntrega, from);
              // Notify customer
              await sendWhatsAppReply(from, '¡Pedido confirmado! 🎉\n\n📋 Folio: ' + saleResult.folio + '\n👁 ' + custPending.productName + ' x' + custPending.qty + '\n💰 Total: $' + custPending.total + '\n🏪 Recoger en: ' + custPending.sucursalEntrega + '\n📅 Entrega: ' + custPending.tiempoEntrega + '\n\nRealiza tu pago:\n💳 Link: https://clip.mx/@caryera\n🏦 BBVA: Cuenta 0485220280 / CLABE 012164004852202892\n\nEnvíanos tu comprobante por este chat cuando lo hagas. ¡Gracias por tu preferencia! 👓✨');
              // Notify admin
              var cfgData2 = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
              if (cfgData2 && cfgData2[0]) {
                var cfg2 = typeof cfgData2[0].value === 'string' ? JSON.parse(cfgData2[0].value) : cfgData2[0].value;
                var admPhones = cfg2.admin_phones || cfg2.recipients_corte || [];
                for (var ap = 0; ap < admPhones.length; ap++) {
                  await sendWhatsAppReply(admPhones[ap], '✅ Cliente confirmó venta\n📋 Folio: ' + saleResult.folio + '\n👤 ' + custPending.customerName + '\n👁 ' + custPending.productName + ' x' + custPending.qty + '\n💰 $' + custPending.total + '\n🏪 ' + custPending.sucursalEntrega + '\n📅 ' + custPending.tiempoEntrega);
                }
              }
              await deletePendingSale(from);
              console.log('[LC Sale] Customer confirmed: ' + saleResult.folio);
            } catch(saleErr) {
              await sendWhatsAppReply(from, 'Lo siento, hubo un error procesando tu pedido. Por favor intenta de nuevo o visita nuestra sucursal. 🙏');
              console.error('[LC Sale] Error:', saleErr.message);
            }
          } else {
            await sendWhatsAppReply(from, 'Entendido, tu pedido ha sido cancelado. Si cambias de opinión o necesitas algo más, aquí estamos. 😊👓');
            await deletePendingSale(from);
            // Notify admin
            var cfgData3 = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
            if (cfgData3 && cfgData3[0]) {
              var cfg3 = typeof cfgData3[0].value === 'string' ? JSON.parse(cfgData3[0].value) : cfgData3[0].value;
              var admPhones2 = cfg3.admin_phones || cfg3.recipients_corte || [];
              for (var ap2 = 0; ap2 < admPhones2.length; ap2++) {
                await sendWhatsAppReply(admPhones2[ap2], '❌ Cliente canceló la venta\n👤 ' + custPending.customerName + '\n👁 ' + custPending.productName);
              }
            }
            console.log('[LC Sale] Customer declined');
          }
          await saveMessage(from, 'user', userText, userName);
          isAuthResponse = true;
        }
      }

      if ((lowerText === 'si' || lowerText === 'sí' || lowerText === 'no') && isAdmin && !isAuthResponse) {
          var pendingAuth = await supaFetch('autorizaciones?estado=eq.pendiente&order=created_at.desc&limit=1');
          if (pendingAuth && pendingAuth.length > 0) {
            var auth = pendingAuth[0];
            var isApprove = lowerText === 'si' || lowerText === 'sí';
            var newEstado = isApprove ? 'aprobada' : 'rechazada';
            await supaFetch('autorizaciones?id=eq.' + auth.id, {
              method: 'PATCH',
              body: JSON.stringify({ estado: newEstado, respondido_por: userName || 'Admin WA' }),
              prefer: 'return=minimal'
            });
            var authReply = isApprove 
              ? '✅ Autorización APROBADA\n📋 ' + (auth.tipo||'') + ': ' + (auth.descripcion||'') + '\n👤 Solicitado por: ' + (auth.solicitado_por||'') + ' (' + (auth.sucursal||'') + ')'
              : '❌ Autorización RECHAZADA\n📋 ' + (auth.tipo||'') + ': ' + (auth.descripcion||'') + '\n👤 Solicitado por: ' + (auth.solicitado_por||'');
            await sendWhatsAppReply(from, authReply);
            await saveMessage(from, 'user', userText, userName);
            await saveMessage(from, 'assistant', authReply);
            console.log('[Auth] ' + newEstado + ' by ' + userName + ' for code ' + auth.codigo);
            isAuthResponse = true;
          }
      }

      // ── ATTENDANCE CHECK-IN/OUT (all registered employee phones) ──
      var asistHandled = false;
      var isEmployeePhone = false;
      if (!isAuthResponse) {
        // Check if this phone belongs to a registered employee
        var empPhoneData = await supaFetch('app_config?id=eq.empleados_telefono&select=value');
        if (empPhoneData && empPhoneData[0] && empPhoneData[0].value) {
          var empPhoneMap = typeof empPhoneData[0].value === 'string' ? JSON.parse(empPhoneData[0].value) : empPhoneData[0].value;
          var cleanFrom = from.replace(/[\s\-\(\)\+]/g, '');
          var fromLast10 = cleanFrom.slice(-10);
          for (var empPh in empPhoneMap) {
            if (empPh.replace(/[\s\-\(\)\+]/g, '').slice(-10) === fromLast10) { isEmployeePhone = true; break; }
          }
        }

        var asistAction = _detectAsistCmd(lowerText);
        if (asistAction && isEmployeePhone) {
          var asistResult = await cmdAsistencia(from, asistAction, userName);
          await sendWhatsAppReply(from, asistResult.reply);
          await saveMessage(from, 'user', userText, userName);
          await saveMessage(from, 'assistant', asistResult.reply);
          console.log('[Asistencia] ' + asistAction + ' (raw: ' + lowerText + ') by ' + (asistResult.uid || from));
          asistHandled = true;
        } else if (isEmployeePhone && !isAdmin) {
          // Employee phone but not a valid command — block Clari, show help
          var helpReply = '⏰ *Reloj Checador*\n\nComandos disponibles:\n\n✅ *entrada* — Registrar llegada\n🍽️ *comida* — Iniciar hora de comida\n🔙 *regreso* — Regresar de comida\n🚪 *salida* — Registrar salida\n\nEnvía solo la palabra del comando.';
          await sendWhatsAppReply(from, helpReply);
          await saveMessage(from, 'user', userText, userName);
          await saveMessage(from, 'assistant', helpReply);
          asistHandled = true;
        }
      }

      // ── ADMIN COMMANDS ──
      var cmdHandled = false;
      if (!isAuthResponse && !asistHandled && isAdmin) {
          // DOLAR command
          var dolarMatch = userText.match(/^d[oó]lar\s+(\d+\.?\d*)/i);
          if (dolarMatch) {
            var newRate = parseFloat(dolarMatch[1]);
            if (newRate > 0 && newRate < 100) {
              var tcPayload = JSON.stringify({ rate: newRate, updated: new Date().toISOString(), by: userName || 'Admin WA' });
              var tcResult = await supaFetch('app_config?id=eq.tipo_cambio', {
                method: 'PATCH',
                body: JSON.stringify({ value: tcPayload }),
                prefer: 'return=representation'
              });
              var dolarReply = tcResult
                ? '✅ Tipo de cambio actualizado a $' + newRate.toFixed(2) + ' MXN por dólar.\n📅 ' + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n👤 Por: ' + (userName || 'Admin')
                : '❌ Error al actualizar el tipo de cambio. Intenta de nuevo.';
              await sendWhatsAppReply(from, dolarReply);
              await saveMessage(from, 'user', userText, userName);
              await saveMessage(from, 'assistant', dolarReply);
              console.log('[Dolar] Rate updated to ' + newRate + ' by ' + userName);
            } else {
              await sendWhatsAppReply(from, '⚠️ Valor inválido. Usa: Dolar 18.50 (entre 1 y 99)');
            }
            cmdHandled = true;
          }

          // VENTAS command
          if (!cmdHandled && /^ventas(\s+hoy)?$/i.test(lowerText)) {
            var ventasReply = await cmdVentas();
            await sendWhatsAppReply(from, ventasReply);
            await saveMessage(from, 'user', userText, userName);
            await saveMessage(from, 'assistant', ventasReply);
            console.log('[Cmd] Ventas by ' + userName);
            cmdHandled = true;
          }

          // CAJA command
          if (!cmdHandled && /^caja$/i.test(lowerText)) {
            var cajaReply = await cmdCaja();
            await sendWhatsAppReply(from, cajaReply);
            await saveMessage(from, 'user', userText, userName);
            await saveMessage(from, 'assistant', cajaReply);
            console.log('[Cmd] Caja by ' + userName);
            cmdHandled = true;
          }

          // PENDIENTES command
          if (!cmdHandled && /^pendientes$/i.test(lowerText)) {
            var pendReply = await cmdPendientes();
            await sendWhatsAppReply(from, pendReply);
            await saveMessage(from, 'user', userText, userName);
            await saveMessage(from, 'assistant', pendReply);
            console.log('[Cmd] Pendientes by ' + userName);
            cmdHandled = true;
          }

          // PROMO command (update)
          if (!cmdHandled && /^promo\s+/i.test(userText)) {
            var promoText = userText.replace(/^promo\s+/i, '').trim();
            if (promoText.length > 5) {
              var promoReply = await cmdPromo(promoText, userName);
              await sendWhatsAppReply(from, promoReply);
              await saveMessage(from, 'user', userText, userName);
              await saveMessage(from, 'assistant', promoReply);
              console.log('[Cmd] Promo updated by ' + userName);
            } else {
              await sendWhatsAppReply(from, '⚠️ Texto de promoción muy corto. Usa:\nPromo [texto completo de la promoción]');
            }
            cmdHandled = true;
          }

          // VER PROMO command (read current)
          if (!cmdHandled && /^ver\s*promo$/i.test(lowerText)) {
            var vpConfig = await supaFetch('app_config?id=eq.clari_config&select=value');
            var vpOverride = '';
            if (vpConfig && vpConfig[0] && vpConfig[0].value) {
              var vpVal = typeof vpConfig[0].value === 'string' ? JSON.parse(vpConfig[0].value) : vpConfig[0].value;
              vpOverride = vpVal.promo_override || '';
            }
            var vpMode = vpOverride ? '⚙️ Modo: MANUAL (override)\nEnvía "Promo auto" para volver a automático\n\n' : '⚙️ Modo: AUTOMÁTICO por fecha\n\n';
            var vpText = vpOverride || getActivePromos();
            var vpReply = '📢 *PROMO ACTIVA EN CLARI:*\n\n' + vpMode + vpText;
            await sendWhatsAppReply(from, vpReply);
            await saveMessage(from, 'user', userText, userName);
            await saveMessage(from, 'assistant', vpReply);
            cmdHandled = true;
          }

          // BOT OFF/ON command — disable/enable bot for a conversation
          if (!cmdHandled && /^bot\s+(off|on)\s+(.+)/i.test(userText)) {
            var botMatch = userText.match(/^bot\s+(off|on)\s+(.+)/i);
            var botAction = botMatch[1].toLowerCase();
            var botTarget = botMatch[2].trim();
            try {
              var bdCfg = await supaFetch('app_config?id=eq.bot_disabled_conversations&select=id,value');
              var bdMap = {};
              if (bdCfg && bdCfg[0] && bdCfg[0].value) {
                bdMap = typeof bdCfg[0].value === 'string' ? JSON.parse(bdCfg[0].value) : bdCfg[0].value;
                if (Array.isArray(bdMap)) { var obj = {}; bdMap.forEach(function(p) { obj[p] = Date.now(); }); bdMap = obj; }
              }
              var bdReply = '';
              if (botAction === 'off') {
                bdMap[botTarget] = Date.now();
                bdReply = '🔇 Bot DESACTIVADO para: ' + botTarget + '\nClari ya no responderá a esa conversación. Los mensajes se guardan.\nSe reactiva automáticamente después de 2h sin interacción.\nUsa "bot on ' + botTarget + '" para reactivar manualmente.';
              } else {
                delete bdMap[botTarget];
                bdReply = '🔊 Bot REACTIVADO para: ' + botTarget + '\nClari volverá a responder normalmente.';
              }
              await supaFetch('app_config?id=eq.bot_disabled_conversations', {
                method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(bdMap) }), prefer: 'return=minimal'
              });
              await sendWhatsAppReply(from, bdReply);
              await saveMessage(from, 'user', userText, userName);
              await saveMessage(from, 'assistant', bdReply);
              console.log('[Bot ' + botAction.toUpperCase() + '] ' + botTarget + ' by ' + userName);
            } catch(bdErr) {
              await sendWhatsAppReply(from, '❌ Error: ' + bdErr.message);
            }
            cmdHandled = true;
          }

          // HELP/COMANDOS command
          if (!cmdHandled && /^(comandos|ayuda|help|menu|menú)$/i.test(lowerText)) {
            var helpReply = '🛠️ *COMANDOS ADMIN*\n\n'
              + '💵 *Dolar 18.50* — Actualizar tipo de cambio\n'
              + '📊 *Ventas* — Resumen ventas del día\n'
              + '🏦 *Caja* — Estado de caja por sucursal\n'
              + '🔬 *Pendientes* — Órdenes lab activas\n'
              + '📢 *Promo [texto]* — Actualizar promos Clari\n'
              + '👀 *Ver promo* — Ver promos actuales\n'
              + '✅ *Aprobar / ❌ Rechazar* — Ventas Clari\n'
              + '\n👤 *ASISTENCIA*\n'
              + '📋 *Asistencia hoy* — Resumen del día\n'
              + '❓ *Ya llegó [nombre]?* — Estado de un empleado\n'
              + '🔔 *Avísame cuando llegue [nombre]* — Alerta\n'
              + '\n📦 *LAB ASSISTANT*\n'
              + '📸 *Enviar foto* — Registra nota de compra\n'
              + '💰 *Gastos / Cuánto gasté* — Resumen gastos\n'
              + '🔍 *Precio del [material]* — Consultar precio\n'
              + '📝 *[material] ya vale $X* — Actualizar precio\n'
              + '\n🤖 *BOT*\n'
              + '🔇 *Bot off [id]* — Desactivar bot para conversación\n'
              + '🔊 *Bot on [id]* — Reactivar bot\n'
              + '❓ *Comandos* — Ver esta ayuda';
            await sendWhatsAppReply(from, helpReply);
            await saveMessage(from, 'user', userText, userName);
            await saveMessage(from, 'assistant', helpReply);
            cmdHandled = true;
          }

          // ── ATTENDANCE QUERIES (admin/gerencia via WA) ──
          if (!cmdHandled) {
            var asistQueryResult = await _handleAsistQuery(lowerText, userText, from);
            if (asistQueryResult) {
              await sendWhatsAppReply(from, asistQueryResult);
              await saveMessage(from, 'user', userText, userName);
              await saveMessage(from, 'assistant', asistQueryResult);
              cmdHandled = true;
            }
          }

          // ── LAB ASSISTANT (materiales, precios, gastos) ──
          if (!cmdHandled && isLabAssistantQuery(lowerText)) {
            await saveMessage(from, 'user', userText, userName);
            try {
              var labReply = await labAssistantText(userText, userName);
              await sendWhatsAppReply(from, labReply);
              await saveMessage(from, 'assistant', labReply);
            } catch(labErr) {
              console.error('[LabAssistant Error]', labErr);
              await sendWhatsAppReply(from, '❌ Error: ' + labErr.message);
            }
            cmdHandled = true;
          }
      }

      // ── REVIEW/NPS RESPONSE HANDLING ──
      // Quick Reply buttons from opinion_servicio template
      if (!isAuthResponse && !asistHandled && !cmdHandled) {
        var reviewButtons = ['todo excelente', 'buenas promos', 'podría mejorar', 'podria mejorar'];
        if (reviewButtons.includes(lowerText)) {
          // Check if this customer has a recent [Review] entry (last 7 days)
          var reviewCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          var reviewHistory = await supaFetch('clari_conversations?phone=eq.' + from + '&content=ilike.*[Review]*&created_at=gte.' + reviewCutoff + '&select=content&order=created_at.desc&limit=1');
          if (reviewHistory && reviewHistory.length > 0) {
            await saveMessage(from, 'user', userText, userName);
            // Extract sucursal from [Review] log
            var sucMatch = (reviewHistory[0].content || '').match(/Sucursal:\s*([^\n,]+)/);
            var reviewSuc = sucMatch ? sucMatch[1].trim() : '';
            // Google Maps links per sucursal (SOLO las que tienen ficha de Google verificada).
            var mapsLinks = {
              'Américas': 'https://g.page/r/CV9ZD9ZPVjvbEBM/review',
              'Pinocelli': 'https://g.page/r/Cdzzax18yI15EBM/review',
              'Magnolia': 'https://g.page/r/CTVxzblIsQ6IEBM/review',
              'Plaza Vía Vittoria': 'https://g.page/r/CXWWc_sm_uq-EBM/review'
            };
            var mapsLink = mapsLinks[reviewSuc]; // sin fallback a Américas (misatribuiría reseñas)
            var reviewReply;
            if (lowerText === 'todo excelente' || lowerText === 'buenas promos') {
              if (mapsLink) {
                reviewReply = '¡Gracias! 😊 ¿Nos regalas 15 segundos? Solo toca el link, pon tus estrellitas ⭐ y listo. Nos ayudas a que más familias en Juárez nos encuentren 🙏\n👉 ' + mapsLink;
              } else {
                // Sucursal sin ficha de Google propia aún (ej. Plaza Vía Vittoria) — agradecer sin pedir reseña
                reviewReply = '¡Muchísimas gracias por tu confianza! 😊 Nos alegra que tu experiencia haya sido excelente. Aquí estamos para cuidar tu vista cuando lo necesites. ¡Un gusto atenderte! 👓';
              }
            } else {
              // "Podría mejorar" — enter care mode
              reviewReply = 'Lamentamos que tu experiencia no haya sido la mejor 😔\n\nQueremos mejorar. ¿Podrías contarnos qué te gustaría que hiciéramos diferente? Tu opinión es muy valiosa para nosotros.\n\nSi prefieres, también puedes visitarnos en cualquier sucursal y con gusto te atendemos personalmente 🤝';
              // Notify admin about negative feedback
              try {
                var cfgData = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
                if (cfgData && cfgData[0] && cfgData[0].value) {
                  var cfg = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value;
                  var adminPhones = cfg.admin_phones || [];
                  var alertMsg = '⚠️ *Opinión negativa recibida*\n\n👤 ' + (userName || from) + '\n📱 +' + from + '\n🏪 Sucursal: ' + (reviewSuc || 'N/A') + '\n\nEl cliente respondió "Podría mejorar" a la encuesta de opinión. Por favor dale seguimiento.';
                  for (var ap = 0; ap < adminPhones.length; ap++) {
                    await sendWhatsAppReply(adminPhones[ap], alertMsg);
                  }
                }
              } catch(alertErr) { console.warn('[Review] Alert error:', alertErr.message); }
            }
            await sendWhatsAppReply(from, reviewReply);
            await saveMessage(from, 'assistant', '[Review Response] ' + reviewReply);
            cmdHandled = true;
          }
        }
      }

      // ── CHECK IF BOT IS DISABLED FOR THIS CONVERSATION ──
      if (!isAuthResponse && !asistHandled && !cmdHandled) {
        var botOff = await isBotDisabled(from);
        if (botOff) {
          console.log('[Bot Disabled] Skipping AI for ' + from + ' — saving message only');
          await saveMessage(from, 'user', userText, userName);
          return { statusCode: 200, headers: H, body: '<Response></Response>' };
        }
      }

      // ── CLARI AI (default for non-admin or unmatched commands) ──
      if (!isAuthResponse && !asistHandled && !cmdHandled) {
        // ── CHECK: Is this a reactivation campaign client? ──
        var recentMsgs = null;
        var isReactivationClient = false;
        var reactType = '';
        try {
          recentMsgs = await getConversationHistory(from);
          if (recentMsgs) {
            var reactTags = [
              { tag: '[LC-Reactivacion]', type: 'LC' },
              { tag: '[PIN-LC-Reactivacion]', type: 'LC Pinocelli' },
              { tag: '[VIP-Reactivacion]', type: 'VIP' },
              { tag: '[PIN-VIP-Reactivacion]', type: 'VIP Pinocelli' },
              { tag: '[AME-Fase3]', type: 'Fase3' },
              { tag: '[PIN-Fase3]', type: 'Fase3 Pinocelli' }
            ];
            for (var rt = 0; rt < reactTags.length; rt++) {
              if (recentMsgs.some(function(m) { return m.content && m.content.indexOf(reactTags[rt].tag) !== -1; })) {
                isReactivationClient = true;
                reactType = reactTags[rt].type;
                break;
              }
            }
          }
        } catch(e) { /* continue */ }

        if (isReactivationClient) {
          // ── REACTIVATION: Alert Angel + let Clari respond (step by step) ──
          var isFirstReply = !recentMsgs.some(function(m) { return m.role === 'user'; });
          try {
            var alertEmoji = isFirstReply ? '🚨 PRIMERA RESPUESTA' : '💬 CONVERSACIÓN ACTIVA';
            var alertMsg = alertEmoji + ' — *' + reactType + ' Reactivación*\n\n'
              + '👤 ' + (userName || 'Cliente') + '\n'
              + '📱 ' + from + '\n'
              + '💬 "' + userText.substring(0, 100) + '"\n\n'
              + '👀 Clari está respondiendo — revisa en el sistema.';
            await sendWhatsAppReply('5216564269961', alertMsg);
          } catch(alertErr) { console.warn('[React Alert]', alertErr.message); }
          // Clari responds normally (prompt already has reactivation context)
        }

        // ── 🛡️ Intento de manipulación/jailbreak a Clari → alerta admin + respuesta segura (sin llamar al modelo) ──
        if (isPromptInjection(userText)) {
          var _jbReply = 'Soy Clari, asistente de Ópticas Car & Era 👓 ¿Te ayudo con algo sobre lentes, una promoción o tu pedido?';
          await saveMessage(from, 'user', userText, userName);
          await saveMessage(from, 'assistant', '[Jailbreak-Intento] ' + _jbReply);
          try {
            var _waCfgJb = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
            var _jbPhone = '5216564269961';
            if (_waCfgJb && _waCfgJb[0]) {
              var _wjb = typeof _waCfgJb[0].value === 'string' ? JSON.parse(_waCfgJb[0].value) : _waCfgJb[0].value;
              if (_wjb.auth_phones && _wjb.auth_phones.length) _jbPhone = _wjb.auth_phones[0];
            }
            var _jbTxt = '🛡️ Intento de manipulación a Clari\n\n👤 ' + (userName || from) + '\n📱 ' + from + '\n💬 "' + userText.substring(0, 200) + '"\n\nClari NO obedeció (respondió neutral). Es solo un aviso.';
            // Vía plantilla aprobada (llega aunque la ventana 24h del admin esté cerrada); fallback a freeform.
            await sendWhatsAppTemplate(_jbPhone, 'HXa076da6bd95ae70ece9545df84036f56', { '1': _jbTxt }, _jbTxt);
          } catch(_jbe) { console.warn('[Jailbreak alert]', _jbe.message); }
          console.log('[Jailbreak] -> ' + from + ': "' + userText.substring(0, 80) + '"');
          await sendWhatsAppReply(from, _jbReply);
          return { statusCode: 200, headers: H, body: '<Response></Response>' };
        }

        // ── 🎂 Corrección de fecha de cumpleaños (solo día/mes, conserva el año) ──
        var cumpleFixReply = await handleCumpleCorreccion(from, userText);
        if (cumpleFixReply) {
          await saveMessage(from, 'user', userText, userName);
          await saveMessage(from, 'assistant', cumpleFixReply);
          console.log('[Cumple-Fix] -> ' + from + ': ' + cumpleFixReply.substring(0, 60));
          await sendWhatsAppReply(from, cumpleFixReply);
          return { statusCode: 200, headers: H, body: '<Response></Response>' };
        }

        // ── 🤐 Cierre cortés: contesta la PRIMERA despedida con una línea cálida; si insisten, silencio (evita re-pitch robótico y loops) ──
        if (isPureCourtesyCloser(userText)) {
          await saveMessage(from, 'user', userText, userName);
          var _lastAssist = null;
          if (recentMsgs) { for (var _ri = recentMsgs.length - 1; _ri >= 0; _ri--) { if (recentMsgs[_ri].role === 'assistant') { _lastAssist = recentMsgs[_ri].content || ''; break; } } }
          if (_lastAssist && _yaEsCierre(_lastAssist)) {
            // Ya nos despedimos antes → no seguir contestando la despedida
            console.log('[Closer] silent (repeat) -> ' + from + ': "' + userText.substring(0, 40) + '"');
            return { statusCode: 200, headers: H, body: '<Response></Response>' };
          }
          var _desp = _cierreReply(userText);
          await saveMessage(from, 'assistant', _desp);
          await sendWhatsAppReply(from, _desp);
          console.log('[Closer] first farewell -> ' + from + ': ' + _desp);
          return { statusCode: 200, headers: H, body: '<Response></Response>' };
        }

        var reply = await getAIResponse(userText, userName, from);

        // Check if AI response contains CREAR_VENTA command
        var saleMatch = reply.match(/CREAR_VENTA\|([^|]+)\|([^|]+)\|(\d+)\|(\d+\.?\d*)\|([^|\n]+)/);
        if (saleMatch) {
          // Remove the command from the visible reply
          reply = reply.replace(/CREAR_VENTA\|[^\n]+/g, '').trim();
          
          // Parse sale data
          var saleData = {
            customerName: saleMatch[1].trim(),
            productName: saleMatch[2].trim(),
            qty: parseInt(saleMatch[3]),
            total: parseFloat(saleMatch[4]),
            sucursalEntrega: saleMatch[5].trim(),
            customerPhone: from,
            isRecompra: false
          };
          // Check if this is a recompra (LC-Recompra tag in recent history)
          try {
            var recentHistory = await getConversationHistory(from);
            if (recentHistory && recentHistory.some(function(m) { return m.content && m.content.includes('[LC-Recompra]'); })) {
              saleData.isRecompra = true;
            }
          } catch(e) {}

          // Save pending sale and notify admin
          try {
            await savePendingSale(from, saleData);
            await notifyAdminPendingSale(saleData, from);
            console.log('[LC Sale] Pending sale saved: ' + saleData.customerName + ' · $' + saleData.total);
            // Add note to customer reply
            reply += '\n\n⏳ Estamos verificando disponibilidad y te daremos un tiempo de entrega en unos minutos. ¡Gracias por tu paciencia!';
          } catch(saleErr) {
            console.error('[LC Sale] Error saving pending:', saleErr.message);
          }
        }
        
        // Check for CREAR_VS command (Visión Segura por WhatsApp + link de pago Clip)
        var vsMatch = reply.match(/CREAR_VS\|(BASICO|PLUS|PREMIUM)/i);
        if (vsMatch) {
          reply = reply.replace(/CREAR_VS\|[A-Za-z]+/gi, '').trim();
          var vsPlan = vsMatch[1].toUpperCase();
          try {
            var vsRes = await crearLinkVisionSegura(from, vsPlan);
            if (vsRes.ok) {
              reply += (reply ? '\n\n' : '') + '💙 Tu link de pago para Visión Segura ' + vsRes.label + ' ($' + vsRes.monto + '):\n' + vsRes.url + '\n\nEn cuanto se confirme tu pago queda activada tu protección. ✅';
              await notifyAdminVS(from, vsRes);
              console.log('[VS] Link enviado: ' + vsRes.nombre + ' · ' + vsRes.label + ' · ' + vsRes.armazon);
            } else if (vsRes.reason === 'no_compra' || vsRes.reason === 'no_paciente') {
              reply += (reply ? '\n\n' : '') + 'Para activar Visión Segura necesito ligarla a tus lentes, pero no encuentro tu compra registrada por aquí. Pásala a contratar en sucursal y con gusto te la activan. 💙';
            } else if (vsRes.reason === 'todos_protegidos') {
              reply += (reply ? '\n\n' : '') + 'Tus lentes ya tienen Visión Segura activa. Si compraste más de un armazón y quieres proteger otro, coméntame o pásalo en sucursal. 💙';
            } else {
              reply += (reply ? '\n\n' : '') + 'Tuve un detalle generando tu link de pago — pásalo a contratar en sucursal y con gusto te ayudamos. 💙';
            }
          } catch (vsErr) {
            console.error('[VS] error:', vsErr.message);
            reply += (reply ? '\n\n' : '') + 'Tuve un detalle generando tu link de pago — pásalo en sucursal y te ayudamos. 💙';
          }
        }

        console.log('[Reply] -> ' + from + ': ' + reply.substring(0, 100) + '...');
        await sendWhatsAppReply(from, reply);

        // ── COMPLAINT DETECTION — notify admin + auto-disable bot ──
        if (isComplaintMessage(userText)) {
          console.log('[Complaint Detected] ' + from + ': ' + userText.substring(0, 80));
          try {
            // Notify Angel by WA
            var complaintName = userName || from;
            var complaintAlert = '🚨 *QUEJA / CLIENTE MOLESTO*\n\n'
              + '👤 ' + complaintName + '\n'
              + '📱 ' + from + '\n'
              + '💬 "' + userText.substring(0, 200) + '"\n\n'
              + 'Clari respondió y le dijo que gerencia se comunicará en breve.\n'
              + 'Bot desactivado automáticamente — revisa en el panel de Clari.';
            var waCfgComplaint = await supaFetch('app_config?id=eq.whatsapp_config&select=value');
            var alertPhone = '5216564269961'; // Angel default
            if (waCfgComplaint && waCfgComplaint[0]) {
              var wcfg = typeof waCfgComplaint[0].value === 'string' ? JSON.parse(waCfgComplaint[0].value) : waCfgComplaint[0].value;
              if (wcfg.auth_phones && wcfg.auth_phones.length) alertPhone = wcfg.auth_phones[0];
            }
            await sendWhatsAppReply(alertPhone, complaintAlert);
            // Auto-disable bot for this conversation
            await disableBotForPhone(from);
          } catch(complaintErr) {
            console.error('[Complaint Alert Error]', complaintErr.message);
          }
        }
      }

      return { statusCode: 200, headers: H, body: '<Response></Response>' };
    } catch (err) {
      console.error('[Webhook Error]', err);
      return { statusCode: 200, headers: H, body: '<Response></Response>' };
    }
  }

  // GET request — Twilio doesn't need verification like Meta, but handle gracefully
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: 'OK' };
  }

  return { statusCode: 405, headers: H, body: 'Method not allowed' };
};

// ═══════════════════════════════════════════════════
//  LAB ASSISTANT — Compras de materiales por WhatsApp
// ═══════════════════════════════════════════════════

const LAB_KEYWORDS = [
  'gast','compr','material','precio','costo','cuesta','vale','poli','cr39','cr-39',
  'hi index','ultra','bifocal','progresivo','anti blue','blue light','antirreflejante',
  'foto ar','fotocromatico','blanco','nota','factura','proveedor','mica','lente',
  'subi','subio','subió','baj','cuánto','cuanto','análisis','analisis','surtido',
  'tratamiento','ar ','armazón','armazon','donde','dónde','cómo se llama','como se llama'
];

function isLabAssistantQuery(text) {
  var lower = text.toLowerCase();
  for (var i = 0; i < LAB_KEYWORDS.length; i++) {
    if (lower.includes(LAB_KEYWORDS[i])) return true;
  }
  return false;
}

async function labAssistantOCR(mediaUrl, mediaType, userName, caption) {
  // 1. Download image from Twilio
  console.log('[LabOCR] Downloading from Twilio:', mediaUrl);
  var imgResp = await fetch(mediaUrl, {
    headers: { 'Authorization': twilioAuth() }
  });
  if (!imgResp.ok) throw new Error('No pude descargar la imagen de Twilio');

  var imgBuffer = await imgResp.arrayBuffer();
  var base64 = Buffer.from(imgBuffer).toString('base64');
  var mType = mediaType || 'image/jpeg';

  // 2. Load price lists for OCR context (helps model match material names)
  console.log('[LabOCR] Loading price lists for context...');
  var precioListsCtx = [];
  try {
    var ctxLists = await supaFetch("app_config?id=like.precios_lab_*&select=id,value");
    if (ctxLists) {
      var seenMat = {};
      ctxLists.forEach(function(row) {
        var val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        var labName = val.laboratorio || row.id.replace('precios_lab_', '').toUpperCase();
        var cats = val.categorias || {};
        Object.values(cats).forEach(function(prods) {
          (prods || []).forEach(function(p) {
            var k = p.material.toUpperCase();
            if (!seenMat[k]) { seenMat[k] = true; precioListsCtx.push(labName + ': ' + p.material); }
          });
        });
      });
    }
  } catch(e) { console.warn('[LabOCR] Could not load price lists for context:', e.message); }
  var matCtx = precioListsCtx.length ? '\n\nMATERIALES CONOCIDOS en nuestro catálogo (usa estos nombres cuando el material de la nota coincida o sea equivalente):\n' + precioListsCtx.join('\n') : '';

  // 3. Send to Anthropic Vision
  console.log('[LabOCR] Sending to Vision API, size:', base64.length);
  var aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: 'Eres un asistente experto en óptica que extrae datos de notas de compra de materiales ópticos (lentes oftálmicos). Las notas pueden ser IMPRESAS (tickets, facturas) o MANUSCRITAS (escritas a mano).\n\n' +
        'INSTRUCCIONES PARA NOTAS MANUSCRITAS:\n' +
        '- Lee con mucho cuidado cada línea. La caligrafía puede ser difícil.\n' +
        '- Los números escritos a mano pueden confundirse: 1/7, 3/8, 4/9, 5/6. Usa el contexto (precios típicos de materiales ópticos van de $100 a $5,000 MXN por pieza).\n' +
        '- Abreviaturas comunes: "c/u"=cada uno, "p/u"=precio unitario, "pza"/"pz"=pieza, "pr"=par, "Dz"=docena, "BL"=Blue Light, "AR"=Anti-Reflejo, "CR"=CR-39, "Poli"=Policarbonato, "Foto"=Fotocromático, "HI"=Hi-Index, "Prog"=Progresivo, "BF"=Bifocal, "FT"=Flat Top, "Inv"=Invisible.\n' +
        '- Si hay tachones o correcciones, usa el último valor visible.\n' +
        '- Las cantidades suelen ser 1-20 piezas por línea. Si lees un número muy alto (>50), probablemente es un precio.\n\n' +
        'INSTRUCCIONES PARA NOTAS IMPRESAS:\n' +
        '- Extrae exactamente como aparece el nombre del material.\n' +
        '- Busca encabezados de columnas (Cant, Descripción, P.U., Importe, etc.) para identificar qué número es qué.\n\n' +
        'REGLAS GENERALES:\n' +
        '1. proveedor: nombre de la empresa/laboratorio que emite la nota\n' +
        '2. folio: número de folio, ticket, nota, remisión o factura\n' +
        '3. fecha: en formato YYYY-MM-DD. Si solo dice día/mes, asume año actual 2026.\n' +
        '4. items: array de cada material/producto:\n' +
        '   - material: nombre del material óptico TAL COMO APARECE en la nota. Si reconoces que es equivalente a un material de nuestro catálogo, usa el nombre del catálogo.\n' +
        '   - serie: rango de graduación (S1=1, S2=2, S3=3, Serie 1=1, etc). Si la nota agrupa por serie o rango, extrae el número. Si no aparece, null.\n' +
        '   - cantidad: número de piezas/pares. Default 1 si no es claro.\n' +
        '   - precio_unitario: precio por unidad SIN IVA.\n' +
        '   - subtotal: cantidad × precio_unitario\n\n' +
        'MANEJO DE IVA (MUY IMPORTANTE):\n' +
        '- Si la nota muestra "Subtotal", "IVA" y "Total" por separado → usa los precios de la columna de precio unitario tal cual (ya son sin IVA).\n' +
        '- Si la nota solo muestra un total final y los precios parecen incluir IVA (números "redondos" que al dividir entre 1.16 dan cantidades limpias) → divide entre 1.16.\n' +
        '- Si no hay indicación de IVA → deja los precios tal cual.\n' +
        '- Incluye el total general de la nota como item: material="TOTAL NOTA", cantidad=0, precio_unitario=0, subtotal=(total de la nota SIN IVA).\n\n' +
        'RESPONDE ÚNICAMENTE con JSON object, SIN markdown, SIN comentarios, SIN texto extra:\n' +
        '{"proveedor":"NOMBRE","folio":"12345","fecha":"2026-03-15","items":[{"material":"NOMBRE","serie":1,"cantidad":1,"precio_unitario":123.45,"subtotal":123.45}]}' +
        matCtx,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mType, data: base64 } },
          { type: 'text', text: caption || 'Extrae proveedor, folio, fecha y TODOS los materiales de esta nota de compra de óptica. Analiza cuidadosamente cada línea, especialmente si es manuscrita. Responde SOLO JSON object, sin markdown.' }
        ]
      }]
    })
  });

  if (!aiResp.ok) {
    var aiErr = await aiResp.json();
    throw new Error(aiErr.error?.message || 'Error de Vision API');
  }

  var aiData = await aiResp.json();
  var aiText = '';
  if (aiData.content) aiData.content.forEach(function(c) { if (c.type === 'text') aiText += c.text; });

  // 4. Parse response — clean and robust
  aiText = aiText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  aiText = aiText.replace(/,\s*([}\]])/g, '$1'); // trailing commas
  var parsed = null;
  var objMatch = aiText.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { parsed = JSON.parse(objMatch[0]); } catch(e) {
      var fixed = objMatch[0].replace(/'/g, '"').replace(/,\s*([}\]])/g, '$1');
      try { parsed = JSON.parse(fixed); } catch(e2) {}
    }
  }
  if (!parsed) {
    var arrMatch = aiText.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { parsed = { items: JSON.parse(arrMatch[0]) }; } catch(e) {
        var fixed2 = arrMatch[0].replace(/'/g, '"').replace(/,\s*([}\]])/g, '$1');
        try { parsed = { items: JSON.parse(fixed2) }; } catch(e2) {}
      }
    }
  }
  if (!parsed || !parsed.items || !parsed.items.length) {
    console.warn('[LabOCR] Raw response:', aiText);
    return { reply: '⚠ No pude leer materiales de esta foto. Intenta con una foto más clara o de más cerca.' };
  }

  var items = parsed.items.filter(function(i) { return i.material && !(i.material||'').toUpperCase().includes('TOTAL'); });
  var total = items.reduce(function(s,i) { return s + ((i.cantidad||1) * (i.precio_unitario||0)); }, 0);
  var fecha = parsed.fecha || hoyLocal();
  var proveedor = parsed.proveedor || 'Sin proveedor';
  var folio = parsed.folio || null;

  // 5. Load mapeos + all price lists + product mappings
  var [mapeos, precioLists, mapeoProductosRaw] = await Promise.all([
    supaFetch('mapeo_materiales?activo=eq.true&select=nombre_proveedor,nuestro_material,nuestro_tratamiento&limit=500'),
    supaFetch("app_config?id=like.precios_lab_*&select=id,value"),
    supaFetch("app_config?id=eq.mapeo_productos_lab&select=value")
  ]);
  mapeos = mapeos || [];
  precioLists = precioLists || [];
  var mapeoProductos = {};
  if (mapeoProductosRaw && mapeoProductosRaw[0] && mapeoProductosRaw[0].value) {
    try { mapeoProductos = typeof mapeoProductosRaw[0].value === 'string' ? JSON.parse(mapeoProductosRaw[0].value) : mapeoProductosRaw[0].value; } catch(e) {}
  }

  // Build flat index of all price list products for matching
  var precioIndex = []; // { lab, labId, material, rangos[] }
  precioLists.forEach(function(row) {
    var val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    var labName = val.laboratorio || row.id.replace('precios_lab_', '').toUpperCase();
    var cats = val.categorias || {};
    Object.values(cats).forEach(function(prods) {
      (prods || []).forEach(function(p) {
        precioIndex.push({ lab: labName, labId: row.id, material: p.material, rangos: p.rangos || [] });
      });
    });
  });

  // Helper: find price list product by name (direct or via mapeoProductos)
  function findPrecioProduct(matName) {
    var upper = (matName || '').toUpperCase().trim();
    // 1. Direct match against price list products
    var direct = precioIndex.find(function(p) {
      var pUp = p.material.toUpperCase().trim();
      return pUp === upper || upper.includes(pUp) || pUp.includes(upper);
    });
    if (direct) return direct;
    // 2. Via mapeoProductos (saved mappings)
    var mapped = mapeoProductos[upper] || mapeoProductos[matName];
    if (mapped) {
      var mappedProduct = precioIndex.find(function(p) {
        return p.material.toUpperCase().trim() === (mapped.producto || '').toUpperCase().trim();
      });
      if (mappedProduct) return mappedProduct;
    }
    return null;
  }

  // Helper: get price from rangos by serie number
  function getPrecioBySerie(rangos, serie) {
    if (!rangos || !rangos.length) return null;
    if (!serie || serie < 1) return rangos[0]; // default to first range
    var idx = Math.min(serie - 1, rangos.length - 1);
    return rangos[idx];
  }

  // 6. Build saveItems with price validation
  var saveItems = items.map(function(i) {
    var mat = (i.material||'').trim();
    var serie = i.serie ? parseInt(i.serie) : null;
    var mapped = mapeos.find(function(m) {
      var alias = (m.nombre_proveedor||'').toUpperCase();
      return alias === mat.toUpperCase() || mat.toUpperCase().includes(alias) || alias.includes(mat.toUpperCase());
    });

    // Try to find price list match — check saved mappings for serie too
    var precioMatch = findPrecioProduct(mat);
    var savedMap = mapeoProductos[(mat).toUpperCase().trim()];
    if (!serie && savedMap && savedMap.serie) serie = savedMap.serie;
    if (!precioMatch && mapped) {
      var nuestro = mapped.nuestro_material + (mapped.nuestro_tratamiento ? ' ' + mapped.nuestro_tratamiento : '');
      precioMatch = findPrecioProduct(nuestro);
    }

    var precioEsperado = null;
    var rangoInfo = null;
    if (precioMatch) {
      rangoInfo = getPrecioBySerie(precioMatch.rangos, serie);
      if (rangoInfo) precioEsperado = parseFloat(rangoInfo.precio || rangoInfo.precio_par) || null;
    }

    return {
      material: mat,
      material_nuestro: mapped ? (mapped.nuestro_material + (mapped.nuestro_tratamiento ? ' · ' + mapped.nuestro_tratamiento : '')) : null,
      serie: serie,
      cantidad: parseInt(i.cantidad) || 1,
      precio_unitario: parseFloat(i.precio_unitario) || 0,
      subtotal: (parseInt(i.cantidad)||1) * (parseFloat(i.precio_unitario)||0),
      precio_lista: precioEsperado,
      producto_lista: precioMatch ? precioMatch.material : null,
      lab_lista: precioMatch ? precioMatch.lab : null,
      rango_texto: rangoInfo ? rangoInfo.rango : null
    };
  });

  // 7. Save to compras_lab
  var compraData = {
    fecha: fecha,
    proveedor: proveedor,
    folio_nota: folio,
    items: JSON.stringify(saveItems),
    total: total,
    sucursal: 'Todas',
    usuario: userName || 'WhatsApp'
  };

  var saveResult = await supaFetch('compras_lab', {
    method: 'POST',
    body: JSON.stringify(compraData),
    prefer: 'return=representation'
  });
  var compraId = (saveResult && saveResult[0]) ? saveResult[0].id : null;

  // 8. Save precios_materiales
  for (var pi = 0; pi < saveItems.length; pi++) {
    var si = saveItems[pi];
    if (si.precio_unitario > 0) {
      var matName = si.material_nuestro || si.material;
      await supaFetch('precios_materiales', {
        method: 'POST',
        body: JSON.stringify({
          material: matName,
          proveedor: proveedor,
          precio: si.precio_unitario,
          fecha: fecha,
          fuente: 'whatsapp',
          compra_id: compraId
        })
      });
    }
  }

  // 9. Build reply with price validation
  var reply = '✅ *Compra registrada*\n'
    + '🏪 ' + proveedor + (folio ? ' #' + folio : '') + '\n'
    + '📅 ' + fecha + '\n\n';

  var alertas = 0;
  saveItems.forEach(function(si) {
    var mappedTag = si.material_nuestro ? ' → _' + si.material_nuestro + '_' : '';
    var serieTag = si.serie ? ' (S' + si.serie + ')' : '';
    reply += '• ' + si.material + mappedTag + serieTag + ' x' + si.cantidad + ' = $' + si.subtotal.toFixed(0) + '\n';

    // Price validation line
    if (si.precio_lista !== null && si.precio_unitario > 0) {
      var diff = si.precio_unitario - si.precio_lista;
      var tolerance = si.precio_lista * 0.02; // 2% tolerance
      if (Math.abs(diff) <= tolerance) {
        reply += '  ✅ Precio correcto ($' + si.precio_lista.toFixed(0) + ' ' + (si.lab_lista||'') + ')\n';
      } else {
        alertas++;
        var signo = diff > 0 ? '+' : '';
        reply += '  ⚠️ Lista dice $' + si.precio_lista.toFixed(0) + ' (' + (si.lab_lista||'') + ')';
        if (si.rango_texto) reply += ' [' + si.rango_texto + ']';
        reply += ' → dif ' + signo + '$' + diff.toFixed(0) + '\n';
      }
    } else if (!si.producto_lista && si.precio_unitario > 0) {
      reply += '  ❓ Sin precio de referencia en listas\n';
    }
  });

  reply += '\n💰 *Total: $' + total.toLocaleString('es-MX', {minimumFractionDigits: 0}) + '*';

  if (alertas > 0) {
    reply += '\n\n🔴 *' + alertas + ' alerta(s) de precio* — revisa las diferencias arriba';
  }

  var unmapped = saveItems.filter(function(s) { return !s.material_nuestro && !s.producto_lista; });
  if (unmapped.length) {
    reply += '\n\n⚠ ' + unmapped.length + ' material(es) sin mapear. Abre *Compras Lab* en el sistema para asignar equivalencias.';
  }

  console.log('[LabOCR] Saved compra #' + compraId + ': $' + total + ' (' + items.length + ' items, ' + alertas + ' price alerts)');
  return { reply: reply };
}

async function labAssistantText(userText, userName) {
  // Load context from BD
  var hoy = hoyLocal();
  var hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
  var mesIni = hoy.substring(0,8) + '01';
  var hace7 = new Date(); hace7.setDate(hace7.getDate() - 7);

  var [comprasMes, preciosRecientes, mapeos] = await Promise.all([
    supaFetch('compras_lab?fecha=gte.' + mesIni + '&select=fecha,proveedor,total,items&order=fecha.desc&limit=50'),
    supaFetch('precios_materiales?fecha=gte.' + hace30.toLocaleDateString('en-CA') + '&select=material,proveedor,precio,fecha&order=fecha.desc&limit=200'),
    supaFetch('mapeo_materiales?activo=eq.true&select=nombre_proveedor,nuestro_material,nuestro_tratamiento&limit=200')
  ]);

  comprasMes = comprasMes || [];
  preciosRecientes = preciosRecientes || [];
  mapeos = mapeos || [];

  // Build context string
  var totalMes = comprasMes.reduce(function(s,c) { return s + (parseFloat(c.total)||0); }, 0);
  var totalSem = comprasMes.filter(function(c) { return c.fecha >= hace7.toLocaleDateString('en-CA'); })
    .reduce(function(s,c) { return s + (parseFloat(c.total)||0); }, 0);

  var precioMap = {};
  preciosRecientes.forEach(function(p) {
    var key = p.material.toUpperCase();
    if (!precioMap[key]) precioMap[key] = [];
    precioMap[key].push({ precio: p.precio, proveedor: p.proveedor, fecha: p.fecha });
  });

  var mapeoStr = mapeos.map(function(m) {
    return m.nombre_proveedor + ' → ' + m.nuestro_material + (m.nuestro_tratamiento ? ' · ' + m.nuestro_tratamiento : '');
  }).join('\n');

  var precioStr = Object.keys(precioMap).map(function(k) {
    var entries = precioMap[k];
    return k + ': $' + entries[0].precio + ' (' + (entries[0].proveedor||'?') + ', ' + entries[0].fecha + ')';
  }).join('\n');

  var comprasStr = comprasMes.slice(0,15).map(function(c) {
    return c.fecha + ' | ' + (c.proveedor||'?') + ' | $' + (parseFloat(c.total)||0).toFixed(0);
  }).join('\n');

  // Check if user wants to update a price
  var priceUpdateMatch = userText.match(/(?:ya vale|ahora vale|subió? a|bajo? a|cuesta|vale)\s*\$?\s*(\d+(?:\.\d+)?)/i);

  var context = 'DATOS DE COMPRAS DEL LABORATORIO:\n'
    + 'Hoy: ' + hoy + '\n'
    + 'Gastos esta semana: $' + totalSem.toFixed(0) + '\n'
    + 'Gastos este mes: $' + totalMes.toFixed(0) + ' (' + comprasMes.length + ' compras)\n\n'
    + 'ÚLTIMOS PRECIOS POR MATERIAL:\n' + (precioStr || 'Sin datos aún') + '\n\n'
    + 'MAPEO PROVEEDOR → NUESTRO:\n' + (mapeoStr || 'Sin mapeos aún') + '\n\n'
    + 'ÚLTIMAS COMPRAS:\n' + (comprasStr || 'Sin compras registradas');

  var aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'Eres el asistente de compras del laboratorio de Ópticas Car & Era en Ciudad Juárez.\n'
        + 'Respondes preguntas sobre materiales ópticos, precios, proveedores y gastos.\n'
        + 'Responde conciso en español, usando emojis. Máximo 500 caracteres.\n'
        + 'Si el usuario quiere actualizar un precio, extrae el material y precio nuevo y responde con:\n'
        + 'ACTUALIZAR_PRECIO|material|precio_nuevo\n'
        + 'seguido de tu mensaje de confirmación.\n'
        + 'Si no tienes datos suficientes, dilo honestamente.\n\n'
        + context,
      messages: [{ role: 'user', content: userText }]
    })
  });

  if (!aiResp.ok) throw new Error('Error AI');
  var aiData = await aiResp.json();
  var reply = '';
  if (aiData.content) aiData.content.forEach(function(c) { if (c.type === 'text') reply += c.text; });

  // Handle price update command from AI
  var updateMatch = reply.match(/ACTUALIZAR_PRECIO\|([^|]+)\|(\d+(?:\.\d+)?)/);
  if (updateMatch) {
    reply = reply.replace(/ACTUALIZAR_PRECIO\|[^\n]+/g, '').trim();
    var matUpdate = updateMatch[1].trim();
    var precioUpdate = parseFloat(updateMatch[2]);
    if (precioUpdate > 0) {
      await supaFetch('precios_materiales', {
        method: 'POST',
        body: JSON.stringify({
          material: matUpdate,
          precio: precioUpdate,
          fecha: hoy,
          fuente: 'whatsapp-manual',
          proveedor: null
        })
      });
      console.log('[LabAssistant] Price updated: ' + matUpdate + ' = $' + precioUpdate);
    }
  }

  return reply || 'No tengo información suficiente. Sube notas de compra para que pueda aprender los precios.';
}
