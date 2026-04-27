// mod-auth.js — Sistema de autorización admin
// Opción A: código por WhatsApp (usuario lo ingresa)
// Opción B (futuro): respuesta automática vía webhook

var _authCallback = null;
var _authCodigo = null;
var _authTipo = null;
var _autoAuthEnabled = false;

async function loadAutoAuthFlag() {
  try {
    var { data } = await db.from('app_config').select('value').eq('id', 'auto_auth_enabled').single();
    _autoAuthEnabled = data?.value === 'true';
  } catch(e) { _autoAuthEnabled = false; }
}

function syncAutoAuthToggle() {
  var cb = document.getElementById('cfg-auto-auth');
  var lbl = document.getElementById('cfg-auto-auth-label');
  if (cb) cb.checked = _autoAuthEnabled;
  if (lbl) {
    lbl.textContent = _autoAuthEnabled ? 'ACTIVADO (modo viaje)' : 'Desactivado';
    lbl.style.color = _autoAuthEnabled ? '#72c47e' : '#e08080';
  }
}

async function toggleAutoAuth(on) {
  var val = on ? 'true' : 'false';
  try {
    var res = await fetch('/.netlify/functions/dbwrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', table: 'app_config', data: { id: 'auto_auth_enabled', value: val }, auth: { id: currentUser?.id, pass: currentUser?.pass } })
    });
    var json = await res.json();
    if (json.error) throw new Error(json.error);
    _autoAuthEnabled = on;
    syncAutoAuthToggle();
    toast(on ? '✅ Auto-aprobación ACTIVADA' : '🔒 Auto-aprobación desactivada');
  } catch(e) { toast('Error: ' + e.message, true); syncAutoAuthToggle(); }
}

function solicitarAutorizacion(tipo, descripcion, onAprobado) {
  if (currentUser?.rol === 'admin' || currentUser?.rol === 'gerencia') { onAprobado(); return; }
  if (_autoAuthEnabled) { toast('✓ Auto-aprobado (modo viaje)'); onAprobado(); return; }
  _authCallback = onAprobado;
  _authTipo = tipo;
  _authDesc = descripcion;
  _authCodigo = String(Math.floor(100000 + Math.random() * 900000));

  var ov = document.createElement('div');
  ov.className = 'm-overlay open';
  ov.id = 'auth-overlay';
  ov.style.zIndex = '100000';
  ov.innerHTML = '<div class="modal" style="max-width:380px;padding:24px">'
    + '<div style="text-align:center;font-size:28px;margin-bottom:8px">🔐</div>'
    + '<div style="text-align:center;font-size:15px;font-weight:700;color:var(--white);margin-bottom:4px">Autorización requerida</div>'
    + '<div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:12px;white-space:pre-line">' + descripcion.replace(/</g,'&lt;') + '</div>'
    + '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Motivo de la solicitud</label>'
    + '<input id="auth-motivo" placeholder="Escribe el motivo..." style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:10px;color:var(--white);font-family:Outfit,sans-serif;font-size:13px;outline:none;box-sizing:border-box"></div>'
    + '<div style="display:flex;gap:8px;margin-bottom:16px">'
    + '<button id="auth-tab-code" onclick="authModoCode()" class="btn btn-p btn-sm" style="flex:1;font-size:11px">📱 Código por WA</button>'
    + '<button id="auth-tab-pass" onclick="authModoPass()" class="btn btn-g btn-sm" style="flex:1;font-size:11px">🔑 Credenciales</button>'
    + '</div>'
    + '<div id="auth-mode-code">'
    + '<div style="text-align:center;margin-bottom:12px">'
    + '<button onclick="authEnviarCodigo()" class="btn btn-p" style="width:100%;font-size:13px;padding:12px">📲 Enviar código a administrador</button>'
    + '</div>'
    + '<div id="auth-code-sent" style="display:none">'
    + '<div style="text-align:center;font-size:11px;color:#72c47e;margin-bottom:10px">✓ Código enviado por WhatsApp</div>'
    + '<input id="auth-code-input" placeholder="Ingresa el código de 6 dígitos" maxlength="6" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:12px;color:var(--white);font-family:Outfit,sans-serif;font-size:18px;text-align:center;outline:none;box-sizing:border-box;letter-spacing:8px;font-weight:700" oninput="if(this.value.length===6)authValidarCodigo()">'
    + '<div id="auth-code-error" style="display:none;text-align:center;color:#e08080;font-size:11px;margin-top:6px"></div>'
    + '</div></div>'
    + '<div id="auth-mode-pass" style="display:none">'
    + '<div style="margin-bottom:8px"><input id="auth-user" placeholder="Usuario admin" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:10px;color:var(--white);font-family:Outfit,sans-serif;font-size:13px;outline:none;box-sizing:border-box"></div>'
    + '<div style="margin-bottom:12px"><input id="auth-pass" type="password" placeholder="Contraseña" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:10px;color:var(--white);font-family:Outfit,sans-serif;font-size:13px;outline:none;box-sizing:border-box" onkeydown="if(event.key===\'Enter\')authValidarPass()"></div>'
    + '<div id="auth-pass-error" style="display:none;text-align:center;color:#e08080;font-size:11px;margin-bottom:8px"></div>'
    + '<button onclick="authValidarPass()" class="btn btn-p" style="width:100%;font-size:13px;padding:10px">Autorizar</button>'
    + '</div>'
    + '<div style="margin-top:14px;text-align:center"><button onclick="authCancelar()" class="btn btn-g btn-sm">Cancelar</button></div>'
    + '</div>';
  document.body.appendChild(ov);
  setTimeout(function() { document.getElementById('auth-motivo')?.focus(); }, 100);
}

function authModoCode() {
  document.getElementById('auth-mode-code').style.display = '';
  document.getElementById('auth-mode-pass').style.display = 'none';
  document.getElementById('auth-tab-code').className = 'btn btn-p btn-sm';
  document.getElementById('auth-tab-pass').className = 'btn btn-g btn-sm';
}

function authModoPass() {
  document.getElementById('auth-mode-code').style.display = 'none';
  document.getElementById('auth-mode-pass').style.display = '';
  document.getElementById('auth-tab-code').className = 'btn btn-g btn-sm';
  document.getElementById('auth-tab-pass').className = 'btn btn-p btn-sm';
  setTimeout(function() { document.getElementById('auth-user')?.focus(); }, 100);
}

var _authDesc = '';
async function authEnviarCodigo() {
  var tipo = _authTipo || '';
  var desc = _authDesc || '';
  var suc = currentUser?.sucursal || '';
  var nombre = currentUser?.nombre || currentUser?.id || '';
  var motivo = (document.getElementById('auth-motivo')?.value || '').trim();
  try {
    await db.from('autorizaciones').insert({
      codigo: _authCodigo,
      tipo: tipo,
      descripcion: desc + (motivo ? ' | Motivo: ' + motivo : ''),
      solicitado_por: nombre,
      sucursal: suc,
      estado: 'pendiente'
    });
    // Plantilla aprobada: HXee442652c35a9eaaa3eb0e17a048c193 (autorizacion_admin)
    // Variables: {1}=nombre+suc, {2}=tipo+desc, {3}=motivo, {4}=código
    // Usar plantilla → llega siempre, aunque la ventana 24h esté cerrada.
    var AUTH_TEMPLATE_SID = 'HXee442652c35a9eaaa3eb0e17a048c193';
    var templateVars = {
      '1': nombre + ' (' + suc + ')',
      '2': tipo + ': ' + desc,
      '3': motivo || 'Sin motivo',
      '4': _authCodigo
    };
    // Texto fallback (freeform) por si la plantilla falla o no está aprobada
    var msg = '🔐 AUTORIZACIÓN\n'
      + '👤 ' + nombre + ' (' + suc + ')\n'
      + '📋 ' + tipo + ': ' + desc + '\n'
      + (motivo ? '💬 Motivo: ' + motivo + '\n' : '')
      + '🔑 Código: ' + _authCodigo + '\n'
      + '⏰ Válido por 10 min\n'
      + 'Responde SI para aprobar o NO para rechazar\n'
      + 'Car & Era';
    // Send directly via API (bypass role check)
    if (isTrainingMode()) {
      console.log('%c[DEMO] Auth WA no enviado. Código: ' + _authCodigo, 'color:#d4b84a;font-weight:700');
      toast('🧪 Demo: Código es ' + _authCodigo + ' (no enviado por WA)');
    } else {
      // Get admin phones from config
      var _authPhones = ['5216564269961']; // fallback
      try {
        var { data: waCfg } = await db.from('app_config').select('value').eq('id', 'whatsapp_config').single();
        if (waCfg?.value) {
          var wcVal = typeof waCfg.value === 'string' ? JSON.parse(waCfg.value) : waCfg.value;
          if (wcVal.auth_phones?.length) _authPhones = wcVal.auth_phones;
          else if (wcVal.admin_phones?.length) _authPhones = wcVal.admin_phones;
          else if (wcVal.recipients_corte?.length) _authPhones = wcVal.recipients_corte;
        }
      } catch(e) {}
      for (var _ap = 0; _ap < _authPhones.length; _ap++) {
        try {
          // Intentar primero con plantilla (atraviesa ventana 24h)
          var _authRes = await fetch('/.netlify/functions/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'send',
              phone: _authPhones[_ap],
              template: AUTH_TEMPLATE_SID,
              template_variables: templateVars,
              auth: { id: currentUser?.id || 'sistema', pass: currentUser?.pass || '' }
            })
          });
          var _authResData = await _authRes.json();
          if (!_authRes.ok) {
            console.warn('[Auth WA] Plantilla falló, intentando freeform a ' + _authPhones[_ap] + ':', _authResData);
            // Fallback a freeform (solo funciona dentro de ventana 24h)
            var _ffRes = await fetch('/.netlify/functions/whatsapp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'send',
                phone: _authPhones[_ap],
                message: msg,
                auth: { id: currentUser?.id || 'sistema', pass: currentUser?.pass || '' }
              })
            });
            if (!_ffRes.ok) console.error('[Auth WA] Freeform también falló:', await _ffRes.json());
          } else {
            console.log('[Auth WA] Plantilla enviada a ' + _authPhones[_ap]);
          }
        } catch(_sendErr) { console.error('[Auth WA] Fetch error:', _sendErr.message); }
      }
    }
    document.getElementById('auth-code-sent').style.display = '';
    setTimeout(function() { document.getElementById('auth-code-input')?.focus(); }, 100);
    toast('Código enviado al administrador');
    authPollApproval();
  } catch(e) {
    toast('Error enviando código: ' + e.message, true);
  }
}

var _authPollTimer = null;

function authPollApproval() {
  if (_authPollTimer) clearInterval(_authPollTimer);
  var attempts = 0;
  _authPollTimer = setInterval(async function() {
    attempts++;
    if (attempts > 60 || !_authCodigo) { clearInterval(_authPollTimer); _authPollTimer = null; return; }
    try {
      var { data } = await db.from('autorizaciones').select('estado, respondido_por').eq('codigo', _authCodigo).single();
      if (data && data.estado === 'aprobada') {
        clearInterval(_authPollTimer); _authPollTimer = null;
        authExito(data.respondido_por || 'Admin WA');
      } else if (data && data.estado === 'rechazada') {
        clearInterval(_authPollTimer); _authPollTimer = null;
        toast('❌ Autorización rechazada por admin', true);
        authCancelar();
      }
    } catch(e) {}
  }, 3000);
}

function authValidarCodigo() {
  var input = document.getElementById('auth-code-input')?.value?.trim();
  if (input === _authCodigo) {
    authExito('código WA');
  } else {
    var err = document.getElementById('auth-code-error');
    err.textContent = 'Código incorrecto'; err.style.display = '';
    document.getElementById('auth-code-input').value = '';
    document.getElementById('auth-code-input').focus();
  }
}

function authValidarPass() {
  var user = (document.getElementById('auth-user')?.value || '').trim().toLowerCase();
  var pass = (document.getElementById('auth-pass')?.value || '').trim();
  var allUsers = getAllUsers();
  var u = allUsers[user];
  if (!u || u.pass !== pass) {
    var err = document.getElementById('auth-pass-error');
    err.textContent = 'Usuario o contraseña incorrectos'; err.style.display = '';
    return;
  }
  if (u.rol !== 'admin' && u.rol !== 'gerencia') {
    var err = document.getElementById('auth-pass-error');
    err.textContent = 'Solo administradores o gerencia pueden autorizar'; err.style.display = '';
    return;
  }
  authExito(u.nombre || user);
}

function authExito(autorizadoPor) {
  if (_authPollTimer) { clearInterval(_authPollTimer); _authPollTimer = null; }
  if (_authCodigo) {
    db.from('autorizaciones').update({ estado: 'aprobada', respondido_por: autorizadoPor }).eq('codigo', _authCodigo);
  }
  var ov = document.getElementById('auth-overlay');
  if (ov) ov.remove();
  toast('✓ Autorizado por ' + autorizadoPor);
  if (_authCallback) { var cb = _authCallback; _authCallback = null; _authCodigo = null; cb(); }
}

function authCancelar() {
  if (_authPollTimer) { clearInterval(_authPollTimer); _authPollTimer = null; }
  if (_authCodigo) {
    db.from('autorizaciones').update({ estado: 'cancelada' }).eq('codigo', _authCodigo);
  }
  var ov = document.getElementById('auth-overlay');
  if (ov) ov.remove();
  _authCallback = null; _authCodigo = null;
}
