// mod-creditos.js — Extracted from index.html
// Lines 15995-16263


let creditosData = [];

async function loadCreditos() {
  const list = document.getElementById('cred-list');
  if (list) list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);font-size:12px">Cargando...</div>';
  let query = db.from('creditos_clientes')
    .select('*, pacientes(nombre, apellidos, telefono), creditos_abonos(*)')
    .order('saldo', { ascending: false });
  if (currentUser?.rol === 'sucursal') query = query.eq('sucursal', currentUser.sucursal);
  const { data, error } = await query;
  if (error) { if (list) list.innerHTML = '<div style="color:#e08080;padding:20px;font-size:12px">Error: '+error.message+'</div>'; return; }
  // Also load ventas with saldo > 0 (apartados del sistema nuevo)
  let vtaQuery = db.from('ventas').select('*, pacientes(nombre, apellidos, telefono)').gt('saldo', 0).in('estado', ['Apartado','Pendiente']).order('created_at', { ascending: false });
  if (currentUser?.rol === 'sucursal') vtaQuery = vtaQuery.eq('sucursal', currentUser.sucursal);
  const { data: vtaPend } = await vtaQuery;
  // Convert ventas to credit-like objects
  var vtaAsCreditos = (vtaPend || []).map(function(v) {
    return {
      id: 'vta_' + v.id, _venta_id: v.id, _is_venta: true,
      paciente_id: v.paciente_id, pacientes: v.pacientes,
      sucursal: v.sucursal, folio_sicar: null,
      total: Number(v.total), total_abonos: Number(v.pagado), saldo: Number(v.saldo),
      estado: 'pendiente', notas: 'Folio: ' + v.folio,
      fecha_credito: v.created_at, created_at: v.created_at,
      _folio: v.folio, creditos_abonos: []
    };
  });
  creditosData = [...(data || []), ...vtaAsCreditos];
  renderCreditos();
}

function renderCreditos() {
  const list = document.getElementById('cred-list');
  const stats = document.getElementById('cred-stats');
  if (!list) return;
  const search = (document.getElementById('cred-search')?.value || '').toLowerCase();
  const sucFilter = document.getElementById('cred-suc-filter')?.value || '';
  const estFilter = document.getElementById('cred-estado-filter')?.value || '';
  const esSuc = currentUser?.rol === 'sucursal';

  let filtered = creditosData.filter(c => {
    if (sucFilter && c.sucursal !== sucFilter) return false;
    if (estFilter && c.estado !== estFilter) return false;
    if (search) {
      const pac = c.pacientes;
      const nom = pac ? (pac.nombre+' '+(pac.apellidos||'')).toLowerCase() : (c.notas||'').toLowerCase();
      const tel = pac?.telefono || '';
      const folio = c.folio_sicar || '';
      if (!nom.includes(search) && !tel.includes(search) && !folio.includes(search)) return false;
    }
    return true;
  });

  const pendientes = creditosData.filter(c => Number(c.saldo) > 0).length;
  const pagadosCount = creditosData.filter(c => !c._is_venta && Number(c.saldo) <= 0).length;
  const sicarCount = creditosData.filter(c => !c._is_venta && Number(c.saldo) > 0).length;
  const vtaCount = creditosData.filter(c => c._is_venta).length;
  const statItem = (n,lbl,col) => '<div style="text-align:center;padding:8px 6px;background:'+col+'11;border:1px solid '+col+'33;border-radius:8px"><div style="font-size:16px;font-weight:700;color:'+col+'">'+n+'</div><div style="font-size:9px;color:var(--muted)">'+lbl+'</div></div>';
  if (stats) {
    var sh = statItem(pendientes,'Con adeudo','#e08080') + statItem(sicarCount,'SICAR','#8ab0e8') + statItem(vtaCount,'Ventas','#d4b84a') + statItem(pagadosCount,'Pagados','#72c47e');
    if (!esSuc) {
      var totalSaldo = creditosData.reduce((s,c) => s + (Number(c.saldo)||0), 0);
      var porSuc = {};
      creditosData.filter(c=>c.estado==='pendiente').forEach(c => { porSuc[c.sucursal] = (porSuc[c.sucursal]||0) + (c.saldo||0); });
      sh = statItem('$'+totalSaldo.toLocaleString('es-MX',{minimumFractionDigits:2}),'Saldo total','#d4b84a') + sh
        + Object.entries(porSuc).map(([s,v]) => statItem('$'+v.toLocaleString('es-MX',{minimumFractionDigits:2}),s,'#72b8c4')).join('');
    }
    stats.innerHTML = sh;
  }

  if (!filtered.length) { list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);font-size:12px">'+(creditosData.length?'Sin resultados para el filtro.':'No hay créditos. Usa "Importar SICAR" para cargar datos.')+'</div>'; return; }

  list.innerHTML = filtered.map(c => {
    const pac = c.pacientes;
    const nombre = pac ? (pac.nombre+' '+(pac.apellidos||'')).trim() : (c.notas||'Sin paciente');
    const tel = pac?.telefono || '';
    const isPagado = c.estado === 'pagado';
    const pct = c.total > 0 ? Math.round(((c.total - c.saldo) / c.total) * 100) : 0;
    const abCount = c.creditos_abonos?.length || 0;
    const isVenta = c._is_venta;
    const folioLabel = isVenta ? c._folio : (c.folio_sicar ? 'SICAR-' + c.folio_sicar : 'SICAR');
    const tipoTag = isVenta ? '<span style="font-size:8px;padding:1px 4px;background:rgba(226,198,166,0.15);color:var(--beige);border-radius:3px;font-weight:700">VENTA</span>' : '<span style="font-size:8px;padding:1px 4px;background:rgba(138,176,232,0.15);color:#8ab0e8;border-radius:3px;font-weight:700">SICAR</span>';
    const clickAction = isVenta ? "verDetalleVenta('"+c._venta_id+"')" : "verDetalleCredito('"+c.id+"')";
    return '<div class="card" style="cursor:pointer;transition:background .15s;opacity:'+(isPagado?'0.6':'1')+'" onclick="'+clickAction+'">'
      + '<div style="padding:14px;display:flex;justify-content:space-between;align-items:center">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<div style="width:34px;height:34px;border-radius:50%;background:'+(isPagado?'rgba(114,196,126,0.2)':'rgba(224,128,128,0.2)')+';display:flex;align-items:center;justify-content:center;font-size:14px">'+(isPagado?'✅':'💳')+'</div>'
      + '<div style="min-width:0">'
      + '<div style="font-size:13px;font-weight:600;color:var(--white)">'+escH(nombre)+' '+tipoTag+'</div>'
      + '<div style="font-size:11px;color:var(--muted)">'+c.sucursal+' · '+folioLabel+' · '+(tel?'📞 '+tel:'')+'</div>'
      + '</div></div>'
      + '<div style="margin-top:6px;margin-left:42px">'
      + '<div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;width:120px"><div style="height:100%;width:'+pct+'%;background:'+(isPagado?'#72c47e':'#d4b84a')+';border-radius:2px"></div></div>'
      + '<div style="font-size:9px;color:var(--muted);margin-top:2px">'+pct+'% pagado'+(abCount?' · '+abCount+' abono'+(abCount>1?'s':''):'')+'</div>'
      + '</div></div>'
      + '<div style="text-align:right;flex-shrink:0;margin-left:12px">'
      + '<div style="font-size:16px;font-weight:700;color:'+(isPagado?'#72c47e':'#e08080')+'">$'+(c.saldo||0).toLocaleString('es-MX',{minimumFractionDigits:2})+'</div>'
      + '<div style="font-size:10px;color:var(--muted)">de $'+(c.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})+'</div>'
      + '</div></div></div>';
  }).join('');
}

async function verDetalleCredito(id) {
  const c = creditosData.find(x => x.id === id);
  if (!c) return;
  const pac = c.pacientes;
  const nombre = pac ? (pac.nombre+' '+(pac.apellidos||'')).trim() : (c.notas||'—');
  const abonos = c.creditos_abonos || [];
  const isPagado = c.estado === 'pagado';
  const ov = document.createElement('div');
  ov.className = 'm-overlay open';
  ov.style.zIndex = '10002';
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const tpMap = {EF:'Efectivo',TA:'Tarjeta',TR:'Transferencia',efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia'};
  let abonosHtml = abonos.length ? abonos.sort((a,b)=>a.fecha>b.fecha?1:-1).map((a,idx) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
    +'<div><div style="font-size:12px;color:var(--white)">$'+(a.monto||0).toLocaleString('es-MX',{minimumFractionDigits:2})+'</div>'
    +'<div style="font-size:10px;color:var(--muted)">'+(tpMap[a.metodo_pago]||a.metodo_pago||'—')+' · '+(a.registrado_por||a.origen||'—')+'</div></div>'
    +'<div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;color:var(--muted)">'+fmtDate(a.fecha)+'</span>'
    +'<button onclick="event.stopPropagation();reimprimirAbonoCred(\''+c.id+'\','+a.monto+',\''+(tpMap[a.metodo_pago]||a.metodo_pago||'Efectivo')+'\','+(c.total_abonos||0)+','+(c.saldo||0)+',\''+(c.estado||'')+'\',\''+(a.fecha||'')+'\')" style="background:none;border:1px solid rgba(226,198,166,0.3);border-radius:4px;color:var(--beige);font-size:9px;padding:1px 6px;cursor:pointer" title="Reimprimir">🖨</button>'
    +'<button onclick="event.stopPropagation();borrarAbonoCredito(\''+a.id+'\',\''+c.id+'\','+a.monto+',this.closest(\'.m-overlay\'))" style="background:none;border:1px solid rgba(224,128,128,0.3);border-radius:4px;color:#e08080;font-size:9px;padding:1px 6px;cursor:pointer" title="Borrar abono">🗑</button>'
    +'</div></div>'
  ).join('') : '<div style="font-size:12px;color:var(--muted);padding:10px 0">Sin abonos registrados</div>';

  ov.innerHTML = '<div class="modal" style="max-width:460px">'
    +'<h3 style="font-family:Cormorant Garamond,serif;font-size:20px;color:var(--beige);margin-bottom:4px">'+escH(nombre)+'</h3>'
    +'<div style="font-size:11px;color:var(--muted);margin-bottom:16px">'+c.sucursal+' · SICAR #'+(c.no_cli_sicar||'—')+' · Folio '+(c.folio_sicar||'—')+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">'
    +'<div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px"><div style="font-size:10px;color:var(--muted)">Total</div><div style="font-size:15px;font-weight:700;color:var(--white)">$'+(c.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})+'</div></div>'
    +'<div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px"><div style="font-size:10px;color:var(--muted)">Abonado</div><div style="font-size:15px;font-weight:700;color:#72c47e">$'+(c.total_abonos||0).toLocaleString('es-MX',{minimumFractionDigits:2})+'</div></div>'
    +'<div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px"><div style="font-size:10px;color:var(--muted)">Saldo</div><div style="font-size:15px;font-weight:700;color:'+(isPagado?'#72c47e':'#e08080')+'">$'+(c.saldo||0).toLocaleString('es-MX',{minimumFractionDigits:2})+'</div></div>'
    +'</div>'
    +'<div style="font-size:11px;color:var(--muted);margin-bottom:4px">Fecha crédito: '+fmtDate(c.fecha_credito)+' · Vencimiento: '+fmtDate(c.fecha_vencimiento)+'</div>'
    +'<div style="font-size:13px;font-weight:600;color:var(--beige);margin:16px 0 8px">Historial de abonos</div>'
    +'<div style="max-height:200px;overflow-y:auto">'+abonosHtml+'</div>'
    +(isPagado ? '' : '<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">'
      +'<div style="font-size:13px;font-weight:600;color:var(--beige);margin-bottom:8px">Registrar abono</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<input id="abono-monto" type="number" step="0.01" min="0.01" max="'+(c.saldo||0)+'" placeholder="Monto $" style="flex:1;min-width:80px;background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 10px;color:var(--white);font-family:Outfit,sans-serif;font-size:13px;outline:none">'
      +'<select id="abono-metodo" style="background:var(--surface2);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px 10px;color:var(--white);font-family:Outfit,sans-serif;font-size:12px;outline:none"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select>'
      +'<button class="btn btn-p" onclick="registrarAbonoCredito(\''+c.id+'\',this.closest(\'.m-overlay\'))">Registrar</button>'
      +'</div></div>')
    +'<div class="m-actions" style="margin-top:16px">'
    +'<button class="btn btn-g" onclick="this.closest(\'.m-overlay\').remove()">Cerrar</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

async function registrarAbonoCredito(creditoId, overlay) {
  if (typeof _actionBusy !== 'undefined' && _actionBusy['registrarAbonoCredito']) { toast('Ya se está procesando el abono...', true); return; }
  const montoEl = document.getElementById('abono-monto');
  const metodoEl = document.getElementById('abono-metodo');
  const btnEl = overlay?.querySelector('.btn-p');
  const monto = parseFloat(montoEl?.value);
  const metodo = metodoEl?.value || 'efectivo';
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', true); montoEl?.focus(); return; }
  const cred = creditosData.find(c => c.id === creditoId);
  if (!cred) return;
  if (monto > (cred.saldo || 0) + 0.01) { toast('El monto excede el saldo pendiente', true); return; }
  // Anti-duplicado
  if (typeof _actionBusy !== 'undefined') _actionBusy['registrarAbonoCredito'] = true;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Registrando...'; }
  try {
    const { error: e1 } = await db.from('creditos_abonos').insert({
      credito_id: creditoId, monto: monto, metodo_pago: metodo,
      registrado_por: currentUser?.nombre || currentUser?.id || 'Sistema', origen: 'sistema',
      sucursal: currentUser?.sucursal || null
    });
    if (e1) throw e1;
    const newAbonos = (cred.total_abonos || 0) + monto;
    const newSaldo = Math.max(0, (cred.total || 0) - newAbonos);
    const newEstado = newSaldo <= 0.01 ? 'pagado' : 'pendiente';
    const { error: e2 } = await db.from('creditos_clientes').update({
      total_abonos: Math.round(newAbonos*100)/100, saldo: Math.round(newSaldo*100)/100,
      estado: newEstado, updated_at: new Date().toISOString()
    }).eq('id', creditoId);
    if (e2) throw e2;
    toast('✓ Abono de $'+monto.toLocaleString('es-MX',{minimumFractionDigits:2})+' registrado');
    _lastAbonoCredito = { cred: cred, monto: monto, metodo: metodo, totalAbonos: newAbonos, saldo: newSaldo, estado: newEstado };
    if (overlay) overlay.remove();
    mostrarOpcionesTicketAbono();
    loadCreditos();
  } catch(e) {
    toast('Error: '+(e.message||e), true);
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Registrar'; }
  } finally {
    if (typeof _actionBusy !== 'undefined') _actionBusy['registrarAbonoCredito'] = false;
  }
}

async function borrarAbonoCredito(abonoId, creditoId, monto, overlay) {
  if (currentUser?.rol !== 'admin') {
    solicitarAutorizacion('Borrar abono', 'Borrar abono de $' + monto.toFixed(2), function() { _ejecutarBorrarAbono(abonoId, creditoId, monto, overlay); });
    return;
  }
  _ejecutarBorrarAbono(abonoId, creditoId, monto, overlay);
}
async function _ejecutarBorrarAbono(abonoId, creditoId, monto, overlay) {
  if (!confirm('¿Borrar este abono de $' + monto.toFixed(2) + '?\n\nSe recalculará el saldo del crédito.')) return;
  try {
    await db.from('creditos_abonos').delete().eq('id', abonoId);
    const cred = creditosData.find(c => c.id === creditoId);
    if (cred) {
      const newAbonos = Math.max(0, (cred.total_abonos || 0) - monto);
      const newSaldo = Math.max(0, (cred.total || 0) - newAbonos);
      await db.from('creditos_clientes').update({
        total_abonos: Math.round(newAbonos*100)/100, saldo: Math.round(newSaldo*100)/100,
        estado: newSaldo <= 0.01 ? 'pagado' : 'pendiente', updated_at: new Date().toISOString()
      }).eq('id', creditoId);
    }
    toast('✓ Abono borrado');
    if (overlay) overlay.remove();
    loadCreditos();
  } catch(e) { toast('Error: ' + e.message, true); }
}

async function marcarPagado(creditoId, overlay) {
  if (!confirm('¿Marcar este crédito como pagado?')) return;
  try {
    const { error } = await db.from('creditos_clientes').update({
      estado: 'pagado', saldo: 0, updated_at: new Date().toISOString()
    }).eq('id', creditoId);
    if (error) throw error;
    toast('✓ Crédito marcado como pagado');
    if (overlay) overlay.remove();
    loadCreditos();
  } catch(e) { toast('Error: '+(e.message||e), true); }
}

const SICAR_CREDITOS = [];

async function mostrarImportCreditos() {
  const { data: existing } = await db.from('creditos_clientes').select('id').limit(1);
  const yaImportado = existing && existing.length > 0;
  const ov = document.createElement('div');
  ov.className = 'm-overlay open'; ov.style.zIndex = '10002';
  ov.innerHTML = '<div class="modal" style="max-width:500px">'
    +'<h3 style="font-family:Cormorant Garamond,serif;font-size:18px;color:var(--beige);margin-bottom:8px">📥 Importar créditos de SICAR</h3>'
    +'<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Se importarán <b>'+SICAR_CREDITOS.length+'</b> clientes con saldos pendientes. El sistema buscará cada cliente por teléfono en la base de pacientes para vincularlos.</div>'
    +(yaImportado ? '<div style="background:rgba(212,184,74,0.1);border:1px solid rgba(212,184,74,0.3);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#d4b84a">⚠️ Ya existen créditos importados. Importar de nuevo creará duplicados. Solo continúa si estás seguro.</div>' : '')
    +'<div id="import-progress" style="display:none;margin-bottom:12px"><div style="font-size:12px;color:var(--muted)" id="import-status">Procesando...</div><div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:6px"><div id="import-bar" style="height:100%;width:0%;background:var(--beige);border-radius:2px;transition:width .3s"></div></div></div>'
    +'<div id="import-result" style="display:none;margin-bottom:12px"></div>'
    +'<div class="m-actions">'
    +'<button class="btn btn-g" onclick="this.closest(\'.m-overlay\').remove()">Cancelar</button>'
    +'<button class="btn btn-p" id="import-go-btn" onclick="importarSicarCreditos(this.closest(\'.m-overlay\'))">🚀 Iniciar importación</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

async function importarSicarCreditos(overlay) {
  const btn = document.getElementById('import-go-btn');
  const progress = document.getElementById('import-progress');
  const bar = document.getElementById('import-bar');
  const status = document.getElementById('import-status');
  const result = document.getElementById('import-result');
  if (btn) btn.disabled = true;
  if (progress) progress.style.display = '';
  let imported = 0, matched = 0, unmatched = 0, errors = 0;
  const total = SICAR_CREDITOS.length;
  const unmatchedList = [];

  for (let i = 0; i < total; i++) {
    const cli = SICAR_CREDITOS[i];
    if (bar) bar.style.width = Math.round(((i+1)/total)*100)+'%';
    if (status) status.textContent = 'Procesando '+(i+1)+'/'+total+': '+cli.nom;
    let pacienteId = null;
    if (cli.tel) {
      const cleanTel = cli.tel.replace(/[\s\-\(\)\/]/g,'').slice(-10);
      if (cleanTel.length >= 7) {
        const { data: pacs } = await db.from('pacientes').select('id,nombre,apellidos,telefono').ilike('telefono','%'+cleanTel.slice(-7)+'%').limit(3);
        if (pacs && pacs.length === 1) { pacienteId = pacs[0].id; matched++; }
        else if (pacs && pacs.length > 1) {
          const exact = pacs.find(p => p.telefono && p.telefono.replace(/\D/g,'').slice(-10) === cleanTel);
          if (exact) { pacienteId = exact.id; matched++; }
          else { pacienteId = pacs[0].id; matched++; }
        } else { unmatched++; unmatchedList.push(cli.nom+' ('+cli.tel+')'); }
      } else { unmatched++; unmatchedList.push(cli.nom+' (sin tel válido)'); }
    } else { unmatched++; unmatchedList.push(cli.nom+' (sin tel)'); }

    for (const cr of cli.cr) {
      try {
        const { data: inserted, error } = await db.from('creditos_clientes').insert({
          paciente_id: pacienteId, sucursal: cli.suc, no_cli_sicar: cli.n,
          folio_sicar: cr.f, fecha_credito: cr.fe || null, fecha_vencimiento: cr.ve || null,
          estado: cr.sa <= 0.01 ? 'pagado' : 'pendiente',
          total: cr.to, total_abonos: cr.ab, saldo: cr.sa,
          notas: 'Importado de SICAR | Cliente: '+cli.nom+' | Estado SICAR: '+cr.es
        }).select('id').single();
        if (error) { errors++; console.error('Import error:', error); continue; }
        imported++;
        for (const ab of (cr.abs||[])) {
          await db.from('creditos_abonos').insert({
            credito_id: inserted.id, monto: ab.mo,
            metodo_pago: ab.tp === 'EF' ? 'efectivo' : ab.tp === 'TA' ? 'tarjeta' : ab.tp === 'TR' ? 'transferencia' : ab.tp || 'efectivo',
            fecha: ab.fe || null, registrado_por: 'SICAR', origen: 'sicar'
          });
        }
      } catch(e) { errors++; console.error('Import error:', e); }
    }
  }

  if (status) status.textContent = '¡Importación completada!';
  if (result) {
    result.style.display = '';
    result.innerHTML = '<div style="background:var(--surface2);border-radius:8px;padding:14px;font-size:12px">'
      +'<div style="color:#72c47e;font-weight:600;margin-bottom:6px">✓ '+imported+' créditos importados</div>'
      +'<div style="color:var(--muted)">Pacientes vinculados: '+matched+' | Sin vincular: '+unmatched+' | Errores: '+errors+'</div>'
      +(unmatchedList.length ? '<details style="margin-top:8px"><summary style="cursor:pointer;color:#d4b84a;font-size:11px">Ver no vinculados ('+unmatchedList.length+')</summary><div style="margin-top:6px;font-size:10px;color:var(--muted);max-height:120px;overflow-y:auto">'+unmatchedList.join('<br>')+'</div></details>' : '')
      +'</div>';
  }
  if (btn) { btn.textContent = '✓ Completado'; }
  loadCreditos();
}

var _lastAbonoCredito = null;

function mostrarOpcionesTicketAbono() {
  var d = _lastAbonoCredito;
  if (!d) return;
  var ov = document.createElement('div');
  ov.className = 'm-overlay open';
  ov.innerHTML = '<div class="modal" style="max-width:340px;padding:24px;text-align:center">'
    + '<div style="font-size:28px;margin-bottom:8px">✅</div>'
    + '<div style="font-size:15px;font-weight:700;color:var(--white);margin-bottom:4px">Abono registrado</div>'
    + '<div style="font-size:20px;font-weight:800;color:#72c47e;margin-bottom:14px">$' + d.monto.toFixed(2) + '</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">' + (d.cred.nombre_cliente||'Cliente') + ' · Saldo: $' + d.saldo.toFixed(2) + '</div>'
    + '<div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button onclick="this.closest(\'.m-overlay\').remove();imprimirTicketAbonoCredito(_lastAbonoCredito.cred,_lastAbonoCredito.monto,_lastAbonoCredito.metodo,_lastAbonoCredito.totalAbonos,_lastAbonoCredito.saldo,_lastAbonoCredito.estado)" class="btn btn-g" style="flex:1;font-size:12px;padding:12px">🖨 Ticket impreso</button>'
    + '<button onclick="this.closest(\'.m-overlay\').remove();enviarTicketAbonoCreditoWA()" class="btn btn-g" style="flex:1;font-size:12px;padding:12px">📱 Enviar por WA</button>'
    + '</div>'
    + '<button onclick="this.closest(\'.m-overlay\').remove()" class="btn btn-g btn-sm" style="font-size:11px;color:var(--muted)">Sin comprobante</button>'
    + '</div>';
  document.body.appendChild(ov);
}

function enviarTicketAbonoCreditoWA() {
  var d = _lastAbonoCredito;
  if (!d) { toast('No hay abono reciente', true); return; }

  // Throttle: usar creditoId como clave
  var creditoId = d.cred.id || d.cred.folio_sicar || 'abono';
  var thr = _waCheckThrottle('abono', creditoId);
  if (thr.blocked) { toast('❌ Envío bloqueado para este cliente', true); return; }
  if (!thr.ok) { toast('⏳ Espera ' + thr.wait + ' min para reenviar el comprobante', true); return; }

  var nombre = d.cred.nombre_cliente || 'Cliente';
  var tpMap = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia' };
  var metodoLabel = tpMap[d.metodo] || d.metodo || 'Efectivo';
  var suc = currentUser?.sucursal || '';
  var msg = '✅ COMPROBANTE DE ABONO\n'
    + 'Ópticas Car & Era\n\n'
    + '👤 ' + nombre + '\n'
    + (d.cred.folio_sicar ? '📋 Folio: ' + d.cred.folio_sicar + '\n' : '')
    + '💰 Abono: $' + d.monto.toFixed(2) + '\n'
    + '💳 Método: ' + metodoLabel + '\n'
    + (suc ? '📍 Sucursal: ' + suc + '\n' : '')
    + '📅 ' + new Date().toLocaleString('es-MX', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) + '\n'
    + '\n📊 RESUMEN\n'
    + 'Total crédito: $' + (d.cred.total||0).toFixed(2) + '\n'
    + 'Abonado: $' + d.totalAbonos.toFixed(2) + '\n'
    + (d.estado === 'pagado' ? '✅ LIQUIDADO' : 'Saldo: $' + d.saldo.toFixed(2)) + '\n'
    + '\nGracias por su preferencia';

  var tel = d.cred.telefono_cliente || '';
  var pacienteId = d.cred.paciente_id || null;

  if (!tel) {
    toast('Cliente sin teléfono — abre WhatsApp manual', true);
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    return;
  }

  async function ejecutarEnvioAbono(telParam, esNuevoTel, pacId) {
    var cleanTel = (telParam || '').replace(/\D/g, '');
    var waResult = { ok: false };
    // Template HX40 si disponible, fallback texto libre
    try {
      var r = await sendWA(cleanTel, msg, {
        template: 'HX40dba775cdf9e14b874bc8c7ff0034a6',
        template_variables: { '1': nombre, '2': suc || 'Car & Era', '3': '$' + d.monto.toFixed(2), '4': d.cred.folio_sicar || '', '5': d.estado === 'pagado' ? 'LIQUIDADO' : 'Saldo $' + d.saldo.toFixed(2) }
      });
      if (r.ok) waResult = r;
    } catch(e) {}
    if (!waResult.ok) waResult = await sendWA(cleanTel, msg);
    if (waResult.ok) {
      _waMarkSent('abono', creditoId);
      toast('✅ Comprobante de abono enviado por WhatsApp');
      if (esNuevoTel && pacId) {
        var telGuardar = cleanTel.length > 10 ? cleanTel.slice(-10) : cleanTel;
        await db.from('pacientes').update({ telefono: telGuardar }).eq('id', pacId);
        toast('📞 Teléfono actualizado en expediente');
      }
    } else {
      _waMarkBlocked('abono', creditoId);
      toast('❌ No se pudo enviar. Botón bloqueado.', true);
    }
  }

  var isRetry = thr.attempts > 0;
  _mostrarDialogoWA({
    nombre: nombre, telActual: tel, pacienteId: pacienteId,
    isRetry: isRetry, _tipo: 'abono', _id: creditoId,
    onEnviar: ejecutarEnvioAbono
  });
}

function imprimirTicketAbonoCredito(cred, monto, metodo, totalAbonos, saldo, estado) {
  var nombre = cred.nombre_cliente || 'CLIENTE';
  var tpMap = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia' };
  var metodoLabel = tpMap[metodo] || metodo || 'Efectivo';
  var fechaStr = new Date().toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  var suc = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.sucursal || '') : '';
  var recibio = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.nombre || '') : '';
  var t = '<div class="logo">ÓPTICAS CAR & ERA</div>';
  t += '<div class="city">Cd. Juárez, Chih.</div>';
  t += '<div class="sep"></div>';
  t += '<div class="titulo">COMPROBANTE DE ABONO</div>';
  t += '<div class="sep"></div>';
  t += '<div class="r sm"><span>Fecha:</span><span>' + fechaStr + '</span></div>';
  t += '<div class="r sm"><span>Cliente:</span><span>' + nombre + '</span></div>';
  if (cred.folio_sicar) t += '<div class="r sm"><span>Folio SICAR:</span><span>' + cred.folio_sicar + '</span></div>';
  if (suc) t += '<div class="r sm"><span>Sucursal:</span><span>' + suc + '</span></div>';
  t += '<div class="r sm"><span>Recibió:</span><span>' + recibio + '</span></div>';
  t += '<div class="sep thick"></div>';
  t += '<div class="r big"><span>ABONO</span><span>$' + monto.toFixed(2) + '</span></div>';
  t += '<div class="r sm"><span>Método:</span><span>' + metodoLabel + '</span></div>';
  t += '<div class="sep thick"></div>';
  t += '<div class="sh">RESUMEN DE CUENTA</div>';
  t += '<div class="r"><span>Total crédito</span><span>$' + (cred.total || 0).toFixed(2) + '</span></div>';
  t += '<div class="r"><span>Total abonado</span><span>$' + totalAbonos.toFixed(2) + '</span></div>';
  if (estado === 'pagado') {
    t += '<div class="ok">★★★ LIQUIDADO ★★★</div>';
  } else {
    t += '<div class="saldo"><span>SALDO PENDIENTE</span><span>$' + saldo.toFixed(2) + '</span></div>';
  }
  t += '<div class="sep"></div>';
  t += '<div class="footer">Conserve este comprobante</div>';
  t += '<div class="footer tiny">' + fechaStr + '</div>';
  t += '<div class="footer">Gracias por su preferencia</div>';
  silentPrint(t, THERMAL_VENTA_CSS);
}

function reimprimirAbonoCred(creditoId, monto, metodo, totalAbonos, saldo, estado, fechaStr) {
  var cred = creditosData.find(c => c.id === creditoId);
  if (!cred) { toast('Crédito no encontrado', true); return; }
  var pac = cred.pacientes;
  var nombre = pac ? (pac.nombre + ' ' + (pac.apellidos||'')).trim() : (cred.notas||'CLIENTE');
  var _cred = { nombre_cliente: nombre, folio_sicar: cred.folio_sicar, total: cred.total };
  var fechaLabel = fechaStr ? new Date(fechaStr).toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }) : '—';
  var suc = cred.sucursal || '';
  var t = '<div class="logo">ÓPTICAS CAR & ERA</div>';
  t += '<div class="city">Cd. Juárez, Chih.</div>';
  t += '<div class="sep"></div>';
  t += '<div class="titulo">REIMPRESIÓN ABONO</div>';
  t += '<div class="sep"></div>';
  t += '<div class="r sm"><span>Fecha:</span><span>' + fechaLabel + '</span></div>';
  t += '<div class="r sm"><span>Cliente:</span><span>' + nombre + '</span></div>';
  if (cred.folio_sicar) t += '<div class="r sm"><span>Folio SICAR:</span><span>' + cred.folio_sicar + '</span></div>';
  if (suc) t += '<div class="r sm"><span>Sucursal:</span><span>' + suc + '</span></div>';
  t += '<div class="sep thick"></div>';
  t += '<div class="r big"><span>ABONO</span><span>$' + monto.toFixed(2) + '</span></div>';
  t += '<div class="r sm"><span>Método:</span><span>' + metodo + '</span></div>';
  t += '<div class="sep thick"></div>';
  t += '<div class="sh">RESUMEN DE CUENTA</div>';
  t += '<div class="r"><span>Total crédito</span><span>$' + (cred.total || 0).toFixed(2) + '</span></div>';
  t += '<div class="r"><span>Total abonado</span><span>$' + totalAbonos.toFixed(2) + '</span></div>';
  if (estado === 'pagado') {
    t += '<div class="ok">★★★ LIQUIDADO ★★★</div>';
  } else {
    t += '<div class="saldo"><span>SALDO PENDIENTE</span><span>$' + saldo.toFixed(2) + '</span></div>';
  }
  t += '<div class="sep"></div>';
  t += '<div style="text-align:center;font-size:11px;color:#999;margin-top:4px">REIMPRESIÓN</div>';
  t += '<div class="footer">Conserve este comprobante</div>';
  silentPrint(t, THERMAL_VENTA_CSS);
  toast('🖨 Reimprimiendo abono');
}
