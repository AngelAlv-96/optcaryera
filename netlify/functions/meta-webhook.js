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

// ── DEFAULT PROMPTS (same as wa-webhook, adapted for Messenger/Instagram) ──
const DEFAULT_PERSONALITY = `Eres Clari, la asistente virtual de Ópticas Car & Era en Ciudad Juárez, Chihuahua.

REGLAS DE ESTILO:
- Responde en español (o en el idioma que te hablen)
- Respuestas breves y claras (máximo 3-4 párrafos cortos)
- Usa emojis de visión y lentes: 👓 👁️ ✨ 💫 🔍
- Sé amigable, cálida y profesional
- NO uses formato markdown (ni negritas **, ni listas con -)
- Usa saltos de línea para separar ideas
- Si la pregunta está fuera de tu conocimiento sobre Ópticas Car & Era, rechaza amablemente
- Si el cliente necesita atención humana o tiene un problema complejo, sugiere que visite la sucursal más cercana
- NUNCA menciones el número 657-299-1038 bajo ninguna circunstancia
- Si el cliente quiere comprar lentes de contacto, invítalo a escribirnos por WhatsApp al 656-311-0094 donde puede enviar fotos de su receta o caja de LC para cotización rápida`;

const DEFAULT_KNOWLEDGE = `SUCURSALES:
📍 Plaza de las Américas (Zona Pronaf): Dentro del centro comercial, entrada por Smart, entre Joyería Alex y Continental Music. Tel: (656) 703-8499
📍 Plaza Pinocelli: Av. Miguel de la Madrid esquina con Ramacoi. Tel: (656) 559-1500
📍 Plaza Magnolia: Av. Manuel J. Clouthier (Jilotepec), entre Casa de Cambio y Trevly, frente a Tostadas El Primo. Tel: (656) 174-8866

⏰ HORARIO: Lunes a sábado 10:00am - 7:00pm | Domingos 11:00am - 5:00pm
No se necesita cita previa.

PROMOCIONES VIGENTES (MARZO):
🎁 3x1 en lentes completos: Dos lentes con el material de tu elección + un solar graduado. Desde $600 en armazones seleccionados. Hasta 2 graduaciones diferentes. Válida hasta 31 de marzo.
✨ Armazones con antirreflejante Blue o Hi AR por $1,200
💫 30% descuento en bifocales y progresivos | 20% en armazones
☀️ Lente solar graduado adicional por $249 (combinable con cualquier promo)
🎁 Estuches y soluciones GRATIS
💳 Meses sin intereses
💰 5% de reembolso en Opti Coins
🕒 Lentes listos desde 35 minutos (tenemos laboratorio propio)
Las promociones deben ser aprovechadas por la misma persona.

PRODUCTOS Y SERVICIOS:
👓 Armazones (desde $300)
👁️ Lentes oftálmicos con tratamientos
🕶️ Lentes de contacto
🛍️ Accesorios ópticos, lentes clip-on solar
👨‍⚕️ Examen de la vista GRATUITO (incluido al comprar lentes)
⏱️ Tiempo de entrega: desde 35 minutos hasta 48 horas según el tipo de lente

FORMAS DE PAGO:
Efectivo, tarjetas débito/crédito (Visa, MC, Amex), transferencia bancaria, Aplazo (pagos a plazos sin tarjeta)

GARANTÍA: Todas las compras incluyen garantía. Examen de vista con garantía hasta 40 días.

REGLAS IMPORTANTES:
1. EXAMEN DE VISTA: Gratuito SOLO al comprar lentes. NO ofrezcas examen solo ni receta sin compra.
2. SERVICIO A DOMICILIO: No lo ofrecemos. El servicio a domicilio no es una práctica ética en optometría.
3. CURRÍCULUM: admon.caryera@gmail.com (solo optometristas certificados)`;

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

async function getClariConfig() {
  try {
    var data = await supaFetch('app_config?id=eq.clari_config&select=value');
    if (data && data[0] && data[0].value) {
      var v = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
      return { personality: v.personality || DEFAULT_PERSONALITY, knowledge: v.knowledge || DEFAULT_KNOWLEDGE };
    }
  } catch(e) { console.error('[Meta Config Error]', e); }
  return { personality: DEFAULT_PERSONALITY, knowledge: DEFAULT_KNOWLEDGE };
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
  // Try by name
  var nameWords = text.replace(/[^\wáéíóúñü\s]/gi, '').split(/\s+/).filter(function(w) { return w.length >= 3; });
  if (nameWords.length >= 1) {
    for (var i = 0; i < Math.min(nameWords.length, 2); i++) {
      var word = nameWords[i];
      var byName = await supaFetch('pacientes?or=(nombre.ilike.*' + word + '*,apellidos.ilike.*' + word + '*)&select=id,nombre,apellidos&limit=5');
      if (byName && byName.length > 0 && byName.length <= 3) {
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
    return { nombre, folio, estado, emoji: statusInfo.emoji, mensaje_cliente: statusInfo.msg, sucursal, fecha };
  });
}

function isAskingAboutOrder(text) {
  var lower = text.toLowerCase();
  var keywords = ['pedido', 'orden', 'listo', 'listos', 'lentes', 'status', 'estado', 'entrega', 'recoger', 'folio', 'cuando', 'cuándo', 'demora', 'tarda', 'avance', 'proceso', 'ya están', 'ya estan', 'ya mero', 'falta', 'tiempo'];
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
  var systemPrompt = config.personality.replace(/Respondes por WhatsApp\.?/, channelNote) + '\n\nINFORMACIÓN DEL NEGOCIO:\n' + config.knowledge;

  // Order lookup (by text only — no phone number available from Messenger/IG)
  var orderContext = '';
  if (isAskingAboutOrder(userMessage)) {
    var orders = await lookupOrdersByText(userMessage);
    if (orders && orders.length > 0) {
      var formatted = formatOrders(orders);
      orderContext = '\n\nPEDIDOS ENCONTRADOS:\n';
      formatted.forEach(function(o, i) {
        orderContext += (i + 1) + '. ' + o.nombre + ' — Folio: ' + o.folio + '\n';
        orderContext += '   Estado: ' + o.emoji + ' ' + o.mensaje_cliente + '\n';
        orderContext += '   Sucursal: ' + o.sucursal + ' | Fecha: ' + o.fecha + '\n';
      });
      orderContext += '\nUSA el mensaje_cliente como base. NUNCA digas que están listos a menos que el estado sea "Recibido en óptica" o "Listo para entrega". No uses markdown.';
    } else {
      orderContext = '\n\nBÚSQUEDA DE PEDIDO: No se encontraron pedidos con esa información. Pide al cliente su número de folio (aparece en su ticket de compra) o su nombre completo. Si no hay resultados, sugiere visitar la sucursal más cercana.';
    }
    systemPrompt += orderContext;
  }

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
      max_tokens: 800,
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
Sucursales: Plaza de las Américas (Zona Pronaf), Plaza Pinocelli (Miguel de la Madrid), Plaza Magnolia (Jilotepec) — Ciudad Juárez
Examen de vista gratuito al comprar lentes
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

async function replyToComment(commentId, text) {
  if (!META_PAGE_TOKEN) return false;
  try {
    var res = await fetch(GRAPH_API + '/' + commentId + '/replies?access_token=' + META_PAGE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    if (!res.ok) {
      // Try Facebook format (comments endpoint instead of replies)
      res = await fetch(GRAPH_API + '/' + commentId + '/comments?access_token=' + META_PAGE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
    }
    if (!res.ok) {
      var err = await res.text();
      console.error('[Meta Comment Reply Error]', err);
      return false;
    }
    return true;
  } catch(e) { console.error('[Meta Comment Reply]', e.message); return false; }
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
  var fromId = commentData.from ? commentData.from.id : null;
  var fromName = commentData.from ? (commentData.from.name || commentData.from.username || 'Usuario') : 'Usuario';

  if (!commentId || !fromId) return;

  // Skip comments from our own page
  if (fromId === FB_PAGE_ID || fromId === IG_ACCOUNT_ID) return;

  // Skip very short comments (emojis only, single chars)
  if (commentText.replace(/[\s\p{Emoji}]/gu, '').length < 2 && commentText.length < 5) return;

  // Check if already replied to this comment
  var existing = await supaFetch('clari_conversations?content=eq.[FB-Comment:' + commentId + ']&select=id&limit=1');
  if (existing && existing.length > 0) return;

  console.log('[Meta] ' + channel + ' comment from ' + fromName + ': ' + commentText.substring(0, 50));

  // 1. Generate smart brief public reply based on comment
  var publicReply = await generatePublicReply(commentText);
  var replied = await replyToComment(commentId, publicReply);
  console.log('[Meta] Public reply to comment ' + commentId + ': ' + (replied ? 'OK' : 'FAILED'));

  // 2. Track this comment as replied
  await saveMessage('comment-' + fromId, 'assistant', '[FB-Comment:' + commentId + ']', fromName, channel);

  // 3. Send DM via private reply (linked to the comment) — skip DM since Meta already sends the comment as a message
  // The DM response is handled by the messaging webhook handler automatically
}

// ── POLL FOR UNANSWERED COMMENTS ──
async function checkRecentComments() {
  if (!META_PAGE_TOKEN) return;
  try {
    // Get recent posts (last 5)
    var postsRes = await fetch(GRAPH_API + '/' + FB_PAGE_ID + '/posts?fields=id&limit=5&access_token=' + META_PAGE_TOKEN);
    if (!postsRes.ok) { console.error('[Meta] Failed to get posts:', postsRes.status); return; }
    var postsData = await postsRes.json();
    if (!postsData.data || !postsData.data.length) return;

    for (var p = 0; p < postsData.data.length; p++) {
      var postId = postsData.data[p].id;

      // Get comments on this post (last 10)
      var commentsRes = await fetch(GRAPH_API + '/' + postId + '/comments?fields=id,from,message,created_time&limit=10&access_token=' + META_PAGE_TOKEN);
      if (!commentsRes.ok) continue;
      var commentsData = await commentsRes.json();
      if (!commentsData.data) continue;

      for (var c = 0; c < commentsData.data.length; c++) {
        var comment = commentsData.data[c];
        if (!comment.from || !comment.message) continue;

        // Skip comments from our own page
        if (comment.from.id === FB_PAGE_ID) continue;

        // Skip old comments (only reply to last 2 hours)
        var commentTime = new Date(comment.created_time);
        if (Date.now() - commentTime.getTime() > 7200000) continue;

        // Skip very short comments
        if (comment.message.replace(/[\s\p{Emoji}]/gu, '').length < 2 && comment.message.length < 5) continue;

        // handleComment checks for duplicates internally
        await handleComment({
          id: comment.id,
          message: comment.message,
          from: comment.from
        }, 'messenger');
      }
    }
    console.log('[Meta] Comment check completed');
  } catch(e) { console.error('[Meta] Comment check error:', e.message); }
}

// ── MAIN HANDLER ──
exports.handler = async function(event) {
  // Webhook verification (GET request from Meta)
  if (event.httpMethod === 'GET') {
    var qs = event.queryStringParameters || {};
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
    console.log('[Meta] Webhook body:', JSON.stringify(body).substring(0, 500));

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

        // Get sender name
        var senderName = await getSenderProfile(senderId, channel);

        // Get AI response
        var reply = await getAIResponse(messageText, senderName, senderId, channel);

        // Send reply
        await sendMetaReply(senderId, reply, channel);
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
