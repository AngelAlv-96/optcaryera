// mod-clari.js — Extracted from index.html
// Lines 14552-14644


let _iaPromptCache = null;
async function getIAPrompt() {
  if (_iaPromptCache) return _iaPromptCache;
  try {
    const {data} = await db.from('app_config').select('value').eq('id','ia_system_prompt').single();
    if (data?.value) { _iaPromptCache = typeof data.value === 'string' ? data.value : JSON.stringify(data.value); return _iaPromptCache; }
  } catch(e) {}
  _iaPromptCache = 'Eres un asistente de optometría para Ópticas Car & Era en Ciudad Juárez. Responde en español, sé breve y profesional.';
  return _iaPromptCache;
}

let iaMessages = [];
let iaOpen = false;
let iaBusy = false;

function toggleIA() {
  iaOpen = !iaOpen;
  document.getElementById('ia-panel').classList.toggle('open', iaOpen);
  if (iaOpen) document.getElementById('ia-input').focus();
}

function iaQuick(text) {
  document.getElementById('ia-input').value = text;
  document.getElementById('ia-input').focus();
}

function iaAddMsg(role, content) {
  const el = document.getElementById('ia-messages');
  const div = document.createElement('div');
  div.className = `ia-msg ${role === 'user' ? 'user' : 'ai'}`;
  div.innerHTML = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function iaShowTyping() {
  const el = document.getElementById('ia-messages');
  const div = document.createElement('div');
  div.className = 'ia-typing';
  div.id = 'ia-typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function iaHideTyping() {
  const t = document.getElementById('ia-typing-indicator');
  if (t) t.remove();
}

async function iaEnviar() {
  if (iaBusy) return;
  const input = document.getElementById('ia-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  iaAddMsg('user', text);
  iaMessages.push({ role: 'user', content: text });

  iaBusy = true;
  document.getElementById('ia-send').disabled = true;
  iaShowTyping();

  try {
    const response = await fetch('/.netlify/functions/ia-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: await getIAPrompt(),
        messages: iaMessages.slice(-20)
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    const reply = data.content?.map(b => b.text || '').join('') || 'Sin respuesta.';
    iaMessages.push({ role: 'assistant', content: reply });
    iaHideTyping();
    iaAddMsg('assistant', reply);
  } catch (e) {
    iaHideTyping();
    iaAddMsg('assistant', '⚠ Error: ' + (e.message || 'Conexión fallida. Intenta de nuevo.'));
    console.error('IA Error:', e);
  }

  iaBusy = false;
  document.getElementById('ia-send').disabled = false;
  input.focus();
}
