// mod-tickets.js — Extracted from index.html
// Lines 14194-14551

async function cargarDatosVenta(ventaId) {
  const { data: v } = await db.from('ventas').select('*, pacientes(nombre, apellidos, telefono)').eq('id', ventaId).single();
  if (!v) return null;
  const { data: items } = await db.from('venta_items').select('*').eq('venta_id', ventaId).order('created_at');
  const { data: pagos } = await db.from('venta_pagos').select('*').eq('venta_id', ventaId).order('created_at');
  const { data: promos } = await db.from('venta_promociones').select('*').eq('venta_id', ventaId);
  return { ...v, items: items || [], pagos: pagos || [], promos: promos || [] };
}

let _datosFiscalesCache = null;
async function getDatosFiscales() {
  if (_datosFiscalesCache) return _datosFiscalesCache;
  try {
    const { data } = await db.from('app_config').select('value').eq('id', 'datos_fiscales').single();
    if (data?.value) { _datosFiscalesCache = typeof data.value === 'string' ? JSON.parse(data.value) : data.value; return _datosFiscalesCache; }
  } catch(e) {}
  _datosFiscalesCache = { rfc:'AIFI9707035EA', regimen:'RESICO', sucursales:{ 'Américas':{direccion:'BENJAMIN FRANKLIN 3220-L1011G COL. MARGARITAS CP 32300',telefono:'656 703 8499'}, 'Pinocelli':{direccion:'MIGUEL DE LA MADRID L3A COL. LOTE BRAVO CP 32696',telefono:'656 559 1500'}, 'Magnolia':{direccion:'MANUEL J. CLOUTHIER L8 EL GRANJERO CP 32690',telefono:'656 890 3072'} } };
  return _datosFiscalesCache;
}

async function imprimirTicketVentaTermico(ventaIdParam) {
  const vid = ventaIdParam || lastSaleId;
  if (!vid) { toast('No hay venta seleccionada', true); return; }
  const v = await cargarDatosVenta(vid);
  if (!v) { toast('Error cargando venta', true); return; }
  const pac = v.pacientes ? `${v.pacientes.nombre || ''} ${v.pacientes.apellidos || ''}`.trim() : 'PÚBLICO GENERAL';
  const fecha = new Date(v.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const saldo = Number(v.saldo);
  const promoInfo = v.promos?.length ? v.promos[0] : null;
  const folios = promoInfo?.folios_detalle || [];
  // Build grouped items: armazón + material per folio
  let itemsHtml = '';
  if (folios.length) {
    const usedDescs = new Set();
    folios.forEach(fd => {
      const armItem = (v.items||[]).find(i => fd.armazon && i.descripcion === fd.armazon && !usedDescs.has('a:'+fd.folio+i.descripcion));
      const matItem = (v.items||[]).find(i => fd.material && i.descripcion === fd.material && !usedDescs.has('m:'+fd.folio+i.descripcion));
      if (armItem) { usedDescs.add('a:'+fd.folio+armItem.descripcion); const d=armItem.descripcion.length>26?armItem.descripcion.substring(0,26)+'..':armItem.descripcion; itemsHtml+=`<div class="r"><span>${d}</span><span>$${Number(armItem.subtotal).toFixed(2)}</span></div>`; }
      if (matItem) { usedDescs.add('m:'+fd.folio+matItem.descripcion); const d=matItem.descripcion.length>26?matItem.descripcion.substring(0,26)+'..':matItem.descripcion; itemsHtml+=`<div class="r sm"><span>  ${d}</span><span>$${Number(matItem.subtotal).toFixed(2)}</span></div>`; }
      const px = (fd.paciente_nombre||pac).split(' ')[0];
      itemsHtml += `<div class="r tiny"><span>  📋 ${fd.folio} · ${px}</span><span></span></div>`;
    });
    // Any items not assigned to a folio
    const allUsedDescs = new Set();
    folios.forEach(fd => { if(fd.armazon) allUsedDescs.add(fd.armazon); if(fd.material) allUsedDescs.add(fd.material); });
    (v.items||[]).forEach(i => {
      if (!allUsedDescs.has(i.descripcion) && !i.folio_asignado) {
        const d=i.descripcion.length>28?i.descripcion.substring(0,28)+'..':i.descripcion;
        itemsHtml+=`<div class="r"><span>${i.cantidad}x ${d}</span><span>$${Number(i.subtotal).toFixed(2)}</span></div>`;
      }
    });
    itemsHtml += `<div class="r" style="font-size:11px;padding-top:3px"><span>🏷 ${promoInfo.nombre_promo}</span><span>-$${Number(promoInfo.descuento_aplicado).toFixed(2)}</span></div>`;
  } else {
    (v.items || []).forEach(i => {
      const d=i.descripcion.length>28?i.descripcion.substring(0,28)+'..':i.descripcion;
      itemsHtml+=`<div class="r"><span>${i.cantidad}x ${d}</span><span>$${Number(i.subtotal).toFixed(2)}</span></div>`;
    });
    if (promoInfo) {
      itemsHtml += `<div class="r" style="font-size:11px;padding-top:3px"><span>🏷 ${promoInfo.nombre_promo}</span><span>-$${Number(promoInfo.descuento_aplicado).toFixed(2)}</span></div>`;
    }
  }
  const pagosHtml = (v.pagos || []).map((p, idx) => {
    const lbl = idx === 0 && v.pagos.length > 1 ? 'Anticipo' : idx === 0 ? 'Pago' : `Abono #${idx}`;
    return `<div class="r sm"><span>${lbl}: ${p.metodo_pago}${p.msi_meses ? ' ' + p.msi_meses + 'm' : ''}</span><span>$${Number(p.monto).toFixed(2)}</span></div>`;
  }).join('');
  // Portal QR
  let token = v.token_portal;
  if (!token) { token = Math.random().toString(36).substring(2,12); await db.from('ventas').update({token_portal:token}).eq('id',v.id); }
  const portalUrl = `${window.location.origin}/portal.html?t=${token}`;
  const qrSvg = qrToSVG(portalUrl, 3);
  const fiscal = await getDatosFiscales();
  const fiscalSuc = v.sucursal === 'Online' && v.sucursal_entrega ? v.sucursal_entrega : v.sucursal;
  const sucFiscal = fiscal.sucursales?.[fiscalSuc] || Object.values(fiscal.sucursales || {})[0] || {};
  const dirSuc = sucFiscal.direccion || '';
  const telSuc = sucFiscal.telefono || '';
  const t = `
<div class="logo">ÓPTICAS CAR & ERA</div>
<div class="city">Cd. Juárez, Chih.</div>
<div class="footer">RFC: ${fiscal.rfc || ''} · ${fiscal.regimen || ''}</div>
<div class="footer">${dirSuc}${telSuc ? ' · TEL '+telSuc : ''}</div>
<div class="sep"></div>
<div class="r sm"><span>Folio:</span><span class="b">${v.folio}</span></div>
<div class="r sm"><span>Fecha:</span><span>${fecha}</span></div>
<div class="r sm"><span>Cliente:</span><span>${pac}</span></div>
<div class="r sm"><span>Atendió:</span><span>${v.asesor || '—'}</span></div>
${v.sucursal ? `<div class="r sm"><span>Sucursal:</span><span>${v.sucursal}</span></div>` : ''}
${v.sucursal === 'Online' ? `<div class="r sm" style="font-weight:700"><span>🌐 VENTA ONLINE</span><span>${v.canal_venta||''}</span></div>${v.sucursal_entrega?'<div class="r sm"><span>Recoger en:</span><span style="font-weight:700">'+v.sucursal_entrega+'</span></div>':''}` : ''}
${v.fecha_entrega ? `<div class="r sm"><span>Entrega:</span><span class="b">${new Date(v.fecha_entrega+'T12:00').toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}${v.hora_entrega ? ' '+v.hora_entrega : ''}</span></div>` : ''}
<div class="sep"></div>
${itemsHtml}
<div class="sep"></div>
${Number(v.descuento) > 0 ? `<div class="r"><span>Descuento</span><span>-$${Number(v.descuento).toFixed(2)}</span></div>` : ''}
${Number(v.monedero_usado) > 0 ? `<div class="r sm"><span>Monedero</span><span>-$${Number(v.monedero_usado).toFixed(2)}</span></div>` : ''}
${(v.items||[]).some(i => (i.descripcion||'').includes('[ARO PX]')) || (folios||[]).some(fd => fd.aro_px) ? `<div class="sep"></div><div class="gx" style="text-align:center;padding:4px 2px"><b>⚠ ARMAZÓN PROPIEDAD DEL CLIENTE (ARO PX)</b></div><div class="gx" style="font-size:8px;text-align:justify">AL DEJAR SU ARMAZÓN PROPIO PARA LA ELABORACIÓN DE LENTES, EL CLIENTE ACEPTA QUE ÓPTICAS CAR & ERA NO SE HACE RESPONSABLE POR DAÑOS QUE PUDIERAN OCURRIR DURANTE EL PROCESO DE FABRICACIÓN, BISELADO O MONTAJE, INCLUYENDO PERO NO LIMITADO A: FRACTURAS, RAYONES, DEFORMACIÓN, DESCASCARADO O CUALQUIER OTRO DETERIORO. EL ARMAZÓN SERÁ MANIPULADO CON EL MAYOR CUIDADO POSIBLE, SIN EMBARGO, POR SU NATURALEZA, MATERIAL Y ESTADO DE USO, PUEDE PRESENTAR FRAGILIDAD QUE ESCAPE A NUESTRO CONTROL.</div>` : ''}
<div class="r big"><span>TOTAL</span><span>$${Number(v.total).toFixed(2)}</span></div>
<div class="sep thick"></div>
${pagosHtml}
<div class="r"><span>PAGADO</span><span>$${Number(v.pagado).toFixed(2)}</span></div>
${saldo > 0
  ? `<div class="saldo"><span>SALDO PENDIENTE</span><span>$${saldo.toFixed(2)}</span></div>`
  : '<div class="ok">★★★ LIQUIDADA ★★★</div>'}
${Number(v.monedero_generado) > 0 ? `<div class="r sm"><span>Monedero generado</span><span>+$${Number(v.monedero_generado).toFixed(2)}</span></div>` : ''}
<div class="sep"></div>
<div class="footer">Gracias por su preferencia · ${v.folio}</div>
<div class="sep"></div>
<div class="gt">ABONOS Y MONEDERO ELECTRÓNICO</div>
<div style="text-align:center;padding:3px 0">${qrSvg}</div>
<div class="footer tiny">Escanea con tu celular</div>
<div class="sep"></div>
<div class="gt">GARANTÍA</div>
<div class="gx"><b>90 DIAS ARMAZONES</b> — CUBRE UNICAMENTE DEFECTOS DE FABRICACION; COMO PUNTOS DE SOLDADURA Y ENSAMBLES. NO CUBRE DAÑOS OCASIONADOS POR LA MANIPULACION INADECUADA, POR EL USO EN CONDICIONES ANORMALES O POR EL DESGASTE NATURAL CAUSADO POR SU USO O POR LA ACIDEZ DEL SUDOR (PH) DEL USUARIO. NO ES VALIDA SI SU ARMAZON PRESENTA DAÑOS CAUSADOS POR MALOS HABITOS; POR EJEMPLO MORDEDURAS EN CUALQUIERA DE SUS PARTES, FALTA DE HIGIENE EN EL ARMAZON, EVIDENCIA DE QUE EL ARMAZON NO ES PROTEGIDO POR SU ESTUCHE CUANDO NO SE UTILIZA, O MICAS CON EVIDENCIA DE MALTRATO. SERA VALIDA UNICAMENTE SI EL ARMAZON CUENTA CON TODAS LAS PIEZAS ORIGINALES Y SIN REPARACIONES PREVIAS: SOLDADURAS, PEGAMENTO, ALGUN ADHESIVO, SOLVENTES, REPINTADO, PULIDO O CUALQUIER INTENTO DE REPARACION EN TORNILLOS, PLAQUETAS O TERMINALES NO ORIGINALES. ESTA GARANTIA NO APLICA EN ARMAZONES VENDIDOS EN EL OUTLET, SALDOS O PIEZAS UNICAS. SI EL ARMAZON ES SUJETO A GARANTIA ESTE SERA REPARADO, EN CASO DE NO PODER SER REPARADO ESTE SERA SUSTITUIDO POR UN ARMAZON IGUAL O SIMILAR EN FORMA Y PRECIO; PARA CUBRIR LA GARANTIA SE TENDRA QUE DEJAR EL ARMAZON PARA REVISION DEL PROVEEDOR.</div>
<div class="gx"><b>60 DIAS LENTES</b> — LA GARANTIA CUBRE UNICAMENTE DEFECTOS DE FABRICA, MONTAJE DE LAS LENTES O ANOMALIA EN LOS TRATAMIENTOS DE FOTOCROMIA, ANTIRREFLEJOS O ENTINTADO. LA GARANTIA NO CUBRE DAÑOS OCASIONADOS POR EL MALTRATO COMO DESPOSTILLADAS, RAYAS O RAYONES EN LA SUPERFICIE, POR EL USO EN CONDICIONES ANORMALES O POR EL DESGASTE NATURAL CAUSADO POR SU USO O POR EVIDENCIA DE QUE NO SON GUARDADOS EN SU ESTUCHE CUANDO NO SE UTILIZAN.</div>
<div class="gx"><b>40 DIAS GRADUACION</b> — LA GRADUACION QUE LE FUE PRESCRITA TIENE UNA GARANTIA DE 40 DIAS A PARTIR DE LA FECHA EN QUE SE REALIZO SU EXAMEN. SI LA GRADUACION ES PROPORCIONADA POR EL CLIENTE, ESTA GARANTIA NO APLICA.</div>
<div class="gt">NO HAY CAMBIOS NI DEVOLUCIONES.</div>
<div class="gx" style="text-align:center">RECUERDE GUARDAR SUS LENTES EN SU ESTUCHE.</div>`;
  const css = THERMAL_VENTA_CSS;
  silentPrint(t, css);
}

function generarTicketDigitalHTML(v) {
  const pac = v.pacientes ? `${v.pacientes.nombre || ''} ${v.pacientes.apellidos || ''}`.trim() : 'Público general';
  const fecha = new Date(v.created_at);
  const fechaStr = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
  const saldo = Number(v.saldo);
  const total = Number(v.total);
  const pagado = Number(v.pagado);
  const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;
  const EC = { 'Liquidada': ['#059669', '#ecfdf5', '✓ Liquidada'], 'Apartado': ['#d97706', '#fffbeb', '⏳ Apartado'], 'Pendiente': ['#2563eb', '#eff6ff', '⏳ Pendiente'], 'Cancelada': ['#dc2626', '#fef2f2', '✕ Cancelada'] };
  const [ec, ebg, elbl] = EC[v.estado] || ['#888', '#f5f5f5', v.estado];

  const dPromoInfo = v.promos?.length ? v.promos[0] : null;
  const dFolios = dPromoInfo?.folios_detalle || [];
  let itemsHtml = '';
  if (dFolios.length) {
    dFolios.forEach(fd => {
      const armI = (v.items||[]).find(i => fd.armazon && i.descripcion === fd.armazon);
      const matI = (v.items||[]).find(i => fd.material && i.descripcion === fd.material);
      const px = (fd.paciente_nombre||pac).split(' ')[0];
      itemsHtml += `<div style="padding:10px 0;border-bottom:1px solid #e5e7eb">`;
      if (armI) itemsHtml += `<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-weight:700;color:#1a1a2e;font-size:14px">${armI.descripcion}</span><span style="font-weight:700;color:#1a1a2e;font-size:14px;white-space:nowrap;padding-left:8px">$${Number(armI.subtotal).toFixed(2)}</span></div>`;
      else if (fd.armazon) itemsHtml += `<div style="font-weight:600;color:#1a1a2e;font-size:13px">${fd.armazon}</div>`;
      if (matI) itemsHtml += `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:2px"><span style="font-size:12px;color:#4b5563;padding-left:10px">${matI.descripcion}</span><span style="font-size:12px;color:#4b5563;white-space:nowrap;padding-left:8px">$${Number(matI.subtotal).toFixed(2)}</span></div>`;
      else if (fd.material) itemsHtml += `<div style="font-size:12px;color:#4b5563;padding-left:10px;margin-top:2px">${fd.material}</div>`;
      itemsHtml += `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;padding-left:10px"><span style="font-size:12px;font-weight:600;color:#c4972e">📋 ${fd.folio}</span><span style="font-size:12px;color:#6b7280">· ${px}</span></div></div>`;
    });
    const dAllUsed = new Set();
    dFolios.forEach(fd => { if(fd.armazon) dAllUsed.add(fd.armazon); if(fd.material) dAllUsed.add(fd.material); });
    (v.items||[]).forEach(i => {
      if (!dAllUsed.has(i.descripcion) && !i.folio_asignado) {
        itemsHtml += `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f1f4"><div><div style="font-weight:600;color:#1a1a2e;font-size:14px">${i.descripcion}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px">$${Number(i.precio_unitario).toFixed(2)} × ${i.cantidad}</div></div><div style="font-weight:700;color:#1a1a2e;font-size:15px;padding-left:12px">$${Number(i.subtotal).toFixed(2)}</div></div>`;
      }
    });
    itemsHtml += `<div style="display:flex;justify-content:space-between;padding:10px 0;font-size:13px"><span style="font-weight:600;color:#1a1a2e">🏷 ${dPromoInfo.nombre_promo}</span><span style="font-weight:700;color:#059669">-$${Number(dPromoInfo.descuento_aplicado).toFixed(2)}</span></div>`;
  } else {
    itemsHtml = (v.items || []).map(i => `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f1f1f4"><div style="flex:1;min-width:0"><div style="font-weight:600;color:#1a1a2e;font-size:14px">${i.descripcion}</div><div style="font-size:12px;color:#9ca3af;margin-top:2px">$${Number(i.precio_unitario).toFixed(2)} × ${i.cantidad}</div></div><div style="font-weight:700;color:#1a1a2e;font-size:15px;padding-left:12px">$${Number(i.subtotal).toFixed(2)}</div></div>`).join('');
    if (dPromoInfo) itemsHtml += `<div style="display:flex;justify-content:space-between;padding:10px 0;font-size:13px"><span style="font-weight:600;color:#1a1a2e">🏷 ${dPromoInfo.nombre_promo}</span><span style="font-weight:700;color:#059669">-$${Number(dPromoInfo.descuento_aplicado).toFixed(2)}</span></div>`;
  }

  const MI = { 'Efectivo': ['💵', '#059669'], 'Tarjeta': ['💳', '#2563eb'], 'Transferencia': ['🔄', '#7c3aed'], 'Aplazo': ['📱', '#db2777'], 'MSI': ['⏰', '#d97706'], 'Link de pago': ['🔗', '#0891b2'], 'Monedero': ['🪙', '#059669'] };
  const pagosHtml = (v.pagos || []).map((p, idx) => {
    const lbl = idx === 0 && v.pagos.length > 1 ? 'Anticipo' : idx === 0 ? 'Pago' : `Abono ${idx}`;
    const fp = new Date(p.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const [icon, clr] = MI[p.metodo_pago] || ['💰', '#888'];
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f1f4">
      <div style="width:36px;height:36px;border-radius:10px;background:${clr}10;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:#1a1a2e;font-size:13px">${lbl}</div>
        <div style="font-size:11px;color:#9ca3af">${p.metodo_pago}${p.msi_meses ? ' · ' + p.msi_meses + ' meses' : ''} · ${fp}</div>
      </div>
      <div style="font-weight:700;color:#059669;font-size:14px">+$${Number(p.monto).toFixed(2)}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket ${v.folio} · Ópticas Car & Era</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#f0f0f5;min-height:100vh;padding:20px 16px;display:flex;justify-content:center}
.wrap{max-width:440px;width:100%}
/* Header card */
.head{background:linear-gradient(145deg,#1a1a2e 0%,#2d2d52 50%,#1a1a2e 100%);border-radius:20px;padding:32px 24px 28px;text-align:center;position:relative;overflow:hidden;margin-bottom:12px}
.head::before{content:'';position:absolute;top:-40%;left:-20%;width:140%;height:140%;background:radial-gradient(ellipse,rgba(196,162,101,0.08) 0%,transparent 70%);pointer-events:none}
.head::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#c4a265,#e8d5b0,#c4a265,transparent)}
.h-optica{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:rgba(196,162,101,0.7);font-weight:600}
.h-brand{font-size:26px;font-weight:800;color:#fff;letter-spacing:.01em;margin:2px 0}
.h-city{font-size:11px;color:rgba(255,255,255,0.4)}
.h-folio{display:inline-block;margin-top:16px;padding:8px 24px;background:rgba(196,162,101,0.12);border:1px solid rgba(196,162,101,0.2);border-radius:30px;font-size:16px;font-weight:800;color:#c4a265;letter-spacing:.06em}
.h-estado{display:inline-flex;align-items:center;gap:4px;margin-top:10px;padding:5px 16px;border-radius:20px;font-size:12px;font-weight:600}
/* Body card */
.card{background:#fff;border-radius:16px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.card-inner{padding:18px 20px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.meta-item{font-size:11px;color:#9ca3af}.meta-item strong{display:block;font-size:13px;color:#1a1a2e;font-weight:600;margin-top:1px}
.slbl{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#c4a265;font-weight:700;margin-bottom:10px}
/* Total block */
.total-block{background:linear-gradient(145deg,#1a1a2e,#2a2a4e);border-radius:14px;padding:18px 20px;margin:14px 0;display:flex;align-items:center;justify-content:space-between}
.total-block .lbl{font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.1em}
.total-block .amt{font-size:30px;font-weight:900;color:#fff;letter-spacing:-.01em}
/* Progress */
.prog-wrap{margin:12px 0}
.prog-bar{height:8px;background:#f1f1f4;border-radius:4px;overflow:hidden}
.prog-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#059669,#34d399);transition:width .8s cubic-bezier(.4,0,.2,1)}
.prog-labels{display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:6px}
.prog-labels strong{font-weight:700}
/* Saldo alert */
.saldo-alert{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin:10px 0}
.saldo-alert .l{font-size:12px;font-weight:600;color:#92400e}.saldo-alert .v{font-size:18px;font-weight:800;color:#b45309}
/* Monedero info */
.mon-info{background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1px solid #a7f3d0;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:8px;font-size:12px;color:#065f46;margin:8px 0}
.mon-info strong{font-weight:700}
/* Footer */
.foot{text-align:center;padding:24px 20px 8px;color:#9ca3af;font-size:11px}
.foot .thanks{font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.foot .sub{font-size:10px;color:#d1d5db;margin-top:8px}
/* Share btn */
.share-row{display:flex;gap:8px;margin:16px 0 6px}
.share-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:12px;border:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.share-btn.wa{background:#25d366;color:#fff}.share-btn.wa:hover{background:#1fba59}
.share-btn.print{background:#f1f1f4;color:#1a1a2e}.share-btn.print:hover{background:#e5e7eb}
@media print{body{background:#fff;padding:0}.wrap{max-width:100%}.card{box-shadow:none;border:1px solid #eee}.share-row{display:none!important}}
@media(max-width:480px){body{padding:12px 8px}.head{padding:24px 16px 20px;border-radius:16px}.card{border-radius:12px}}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div class="h-optica">Óptica</div>
    <div class="h-brand">Car & Era</div>
    <div class="h-city">Cd. Juárez, Chihuahua</div>
    <br><div class="h-folio">${v.folio}</div>
    <br><span class="h-estado" style="background:${ebg};color:${ec}">${elbl}</span>
  </div>

  <div class="card"><div class="card-inner">
    <div class="meta-grid">
      <div class="meta-item">Cliente<strong>${pac}</strong></div>
      <div class="meta-item">Fecha<strong>${fechaStr}</strong></div>
      <div class="meta-item">Hora<strong>${horaStr}</strong></div>
      <div class="meta-item">Atendió<strong>${v.asesor || '—'}</strong></div>
      ${v.fecha_entrega ? `<div class="meta-item">Entrega<strong>${new Date(v.fecha_entrega+'T12:00').toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}${v.hora_entrega ? ' · '+v.hora_entrega : ''}</strong></div>` : ''}
    </div>
  </div></div>

  <div class="card"><div class="card-inner">
    <div class="slbl">Detalle de Venta</div>
    ${itemsHtml}
    ${(v.items||[]).some(i => (i.descripcion||'').includes('[ARO PX]')) || (dFolios||[]).some(fd => fd.aro_px) ? `<div style="margin-top:10px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px"><div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">⚠ Armazón propiedad del cliente (ARO PX)</div><div style="font-size:10px;color:#78350f;line-height:1.4">Al dejar su armazón propio para la elaboración de lentes, el cliente acepta que Ópticas Car & Era no se hace responsable por daños que pudieran ocurrir durante el proceso de fabricación, biselado o montaje.</div></div>` : ''}
    ${Number(v.descuento) > 0 ? `<div style="display:flex;justify-content:space-between;padding:10px 0;font-size:13px;color:#dc2626"><span>Descuento</span><span>-$${Number(v.descuento).toFixed(2)}</span></div>` : ''}
    <div class="total-block"><div><div class="lbl">Total</div></div><div class="amt">$${total.toFixed(2)}</div></div>
    ${Number(v.monedero_usado) > 0 ? `<div class="mon-info">🪙 Monedero aplicado: <strong>-$${Number(v.monedero_usado).toFixed(2)}</strong></div>` : ''}
  </div></div>

  <div class="card"><div class="card-inner">
    <div class="slbl">Historial de pagos</div>
    ${pagosHtml || '<div style="padding:10px 0;color:#9ca3af;font-size:12px;text-align:center">Sin pagos registrados</div>'}
    <div class="prog-wrap">
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      <div class="prog-labels">
        <span>Pagado: <strong style="color:#059669">$${pagado.toFixed(2)}</strong></span>
        ${saldo > 0 ? `<span>Saldo: <strong style="color:#dc2626">$${saldo.toFixed(2)}</strong></span>` : '<span style="color:#059669;font-weight:600">✓ Completo</span>'}
      </div>
    </div>
    ${saldo > 0 ? `<div class="saldo-alert"><span class="l">⚠ Saldo pendiente</span><span class="v">$${saldo.toFixed(2)}</span></div>` : ''}
    ${Number(v.monedero_generado) > 0 ? `<div class="mon-info">🪙 Se acumularon <strong>$${Number(v.monedero_generado).toFixed(2)}</strong> en tu monedero electrónico</div>` : ''}
  </div></div>

  <div class="card"><div class="card-inner">
    <div class="slbl">🛡 Políticas de Garantía</div>
    <div style="padding:8px 0;border-bottom:1px solid #f1f1f4"><div style="font-weight:700;color:#1a1a2e;font-size:13px">GARANTIA DE 90 DIAS EN ARMAZONES</div><div style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.6">CUBRE UNICAMENTE DEFECTOS DE FABRICACION; COMO PUNTOS DE SOLDADURA Y ENSAMBLES. NO CUBRE DAÑOS OCASIONADOS POR LA MANIPULACION INADECUADA, POR EL USO EN CONDICIONES ANORMALES O POR EL DESGASTE NATURAL CAUSADO POR SU USO O POR LA ACIDEZ DEL SUDOR (PH) DEL USUARIO. NO ES VALIDA SI SU ARMAZON PRESENTA DAÑOS CAUSADOS POR MALOS HABITOS; POR EJEMPLO MORDEDURAS EN CUALQUIERA DE SUS PARTES, FALTA DE HIGIENE EN EL ARMAZON, EVIDENCIA DE QUE EL ARMAZON NO ES PROTEGIDO POR SU ESTUCHE CUANDO NO SE UTILIZA, O MICAS CON EVIDENCIA DE MALTRATO. SERA VALIDA UNICAMENTE SI EL ARMAZON CUENTA CON TODAS LAS PIEZAS ORIGINALES Y SIN REPARACIONES PREVIAS: SOLDADURAS, PEGAMENTO, ALGUN ADHESIVO, SOLVENTES, REPINTADO, PULIDO O CUALQUIER INTENTO DE REPARACION EN TORNILLOS, PLAQUETAS O TERMINALES NO ORIGINALES. ESTA GARANTIA NO APLICA EN ARMAZONES VENDIDOS EN EL OUTLET, SALDOS O PIEZAS UNICAS. SI EL ARMAZON ES SUJETO A GARANTIA ESTE SERA REPARADO, EN CASO DE NO PODER SER REPARADO ESTE SERA SUSTITUIDO POR UN ARMAZON IGUAL O SIMILAR EN FORMA Y PRECIO; PARA CUBRIR LA GARANTIA SE TENDRA QUE DEJAR EL ARMAZON PARA REVISION DEL PROVEEDOR.</div></div>
    <div style="padding:8px 0;border-bottom:1px solid #f1f1f4"><div style="font-weight:700;color:#1a1a2e;font-size:13px">GARANTIA DE 60 DIAS EN LENTES</div><div style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.6">LA GARANTIA CUBRE UNICAMENTE DEFECTOS DE FABRICA, MONTAJE DE LAS LENTES O ANOMALIA EN LOS TRATAMIENTOS DE FOTOCROMIA, ANTIRREFLEJOS O ENTINTADO. LA GARANTIA NO CUBRE DAÑOS OCASIONADOS POR EL MALTRATO COMO DESPOSTILLADAS, RAYAS O RAYONES EN LA SUPERFICIE, POR EL USO EN CONDICIONES ANORMALES O POR EL DESGASTE NATURAL CAUSADO POR SU USO O POR EVIDENCIA DE QUE NO SON GUARDADOS EN SU ESTUCHE CUANDO NO SE UTILIZAN.</div></div>
    <div style="padding:8px 0"><div style="font-weight:700;color:#1a1a2e;font-size:13px">GARANTIA DE 40 DIAS EN SU GRADUACION</div><div style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.6">LA GRADUACION QUE LE FUE PRESCRITA TIENE UNA GARANTIA DE 40 DIAS A PARTIR DE LA FECHA EN QUE SE REALIZO SU EXAMEN. SI LA GRADUACION ES PROPORCIONADA POR EL CLIENTE, ESTA GARANTIA NO APLICA.</div></div>
    <div style="text-align:center;padding:10px 0 0;font-size:12px;font-weight:700;color:#dc2626">NO HAY CAMBIOS NI DEVOLUCIONES.</div>
    <div style="text-align:center;font-size:11px;color:#6b7280;margin-top:4px">RECUERDE GUARDAR SUS LENTES EN SU ESTUCHE.</div>
  </div></div>

  <div class="share-row">
    <button class="share-btn print" onclick="window.print()">🖨 Imprimir</button>
  </div>

  <div class="foot">
    <div class="thanks">¡Gracias por tu preferencia!</div>
    <div>Ópticas Car & Era · Cd. Juárez, Chih.</div>
    <div class="sub">Ticket generado el ${new Date().toLocaleString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
  </div>
</div>
<script>document.querySelector('.prog-fill').style.width='0%';setTimeout(function(){document.querySelector('.prog-fill').style.width='${pct}%'},200)<\/script>
</body></html>`;
}

async function verTicketDigital(ventaIdParam) {
  const vid = ventaIdParam || lastSaleId;
  if (!vid) { toast('No hay venta seleccionada', true); return; }
  const v = await cargarDatosVenta(vid);
  if (!v) { toast('Error cargando venta', true); return; }
  const html = generarTicketDigitalHTML(v);
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else { const b = new Blob([html], { type: 'text/html' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
}

// ── WA throttle store: { [key]: { ts, attempts } } ──
var _waThrottle = {};
var WA_THROTTLE_MS = 2 * 60 * 60 * 1000; // 2 horas

function _waThrottleKey(tipo, id) { return tipo + ':' + id; }

function _waCheckThrottle(tipo, id) {
  var key = _waThrottleKey(tipo, id);
  var entry = _waThrottle[key];
  var now = Date.now();
  if (!entry) return { ok: true, attempts: 0 };
  if (entry.blocked) return { ok: false, blocked: true, attempts: entry.attempts };
  var elapsed = now - entry.ts;
  if (elapsed < WA_THROTTLE_MS) {
    var mins = Math.ceil((WA_THROTTLE_MS - elapsed) / 60000);
    return { ok: false, wait: mins, attempts: entry.attempts };
  }
  return { ok: true, attempts: entry.attempts };
}

function _waMarkSent(tipo, id) {
  var key = _waThrottleKey(tipo, id);
  var prev = _waThrottle[key] || { attempts: 0 };
  _waThrottle[key] = { ts: Date.now(), attempts: prev.attempts + 1, blocked: false };
}

function _waMarkBlocked(tipo, id) {
  var key = _waThrottleKey(tipo, id);
  var prev = _waThrottle[key] || { attempts: 0, ts: Date.now() };
  _waThrottle[key] = { ts: prev.ts, attempts: prev.attempts, blocked: true };
}

// ── Modal de confirmación/corrección de teléfono para WA ──
function _mostrarDialogoWA(opts) {
  // opts: { nombre, telActual, pacienteId, isRetry, onEnviar, onCancelar }
  var existing = document.getElementById('wa-phone-overlay');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'wa-phone-overlay';
  ov.className = 'm-overlay open';
  ov.style.cssText = 'z-index:99999!important';

  var retryInfo = opts.isRetry
    ? '<div style="background:rgba(224,128,128,0.12);border:1px solid rgba(224,128,128,0.25);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#e08080">⚠️ El envío anterior falló o fue reportado como incorrecto. Último intento disponible.</div>'
    : '';

  var telDisplay = opts.telActual ? opts.telActual : '(sin teléfono)';
  var btnLabel = opts.isRetry ? '📲 Enviar al nuevo número' : '✅ Sí, enviar a este número';

  ov.innerHTML = '<div class="modal" style="max-width:380px;padding:24px">'
    + '<div style="text-align:center;font-size:26px;margin-bottom:6px">📱</div>'
    + '<div style="text-align:center;font-size:15px;font-weight:700;color:var(--white);margin-bottom:4px">Confirmar número WhatsApp</div>'
    + '<div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:14px">' + (opts.nombre || 'Cliente') + '</div>'
    + retryInfo
    + '<div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:14px;text-align:center">'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">Número registrado</div>'
    + '<div style="font-size:18px;font-weight:700;color:var(--white);letter-spacing:1px">' + telDisplay + '</div>'
    + '</div>'
    + (opts.isRetry
        ? '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Número correcto</label>'
          + '<input id="wa-new-tel" type="tel" placeholder="10 dígitos" maxlength="15" style="width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;color:var(--white);font-family:Outfit,sans-serif;font-size:15px;outline:none;box-sizing:border-box;letter-spacing:1px" oninput="this.value=this.value.replace(/\\D/g,\'\')">'
          + '<div id="wa-tel-err" style="display:none;color:#e08080;font-size:11px;margin-top:5px"></div>'
          + '</div>'
        : '')
    + '<div style="display:flex;gap:8px;margin-top:4px">'
    + '<button class="btn btn-g" style="flex:1" onclick="document.getElementById(\'wa-phone-overlay\').remove();' + (opts.onCancelar ? opts.onCancelar + '()' : '') + '">Cancelar</button>'
    + (opts.isRetry
        ? '<button class="btn btn-p" style="flex:1;font-size:12px" id="wa-confirm-btn" onclick="_waTelConfirmarRetry()">📲 Enviar</button>'
        : '<button class="btn btn-g" style="flex:1;background:rgba(224,128,128,0.1);border-color:rgba(224,128,128,0.3);color:#e08080;font-size:11px" onclick="_waTelReportar()">'
          + '❌ Número incorrecto</button>'
          + '<button class="btn btn-p" style="flex:1;font-size:12px" id="wa-confirm-btn" onclick="_waTelConfirmar()">' + btnLabel + '</button>')
    + '</div>'
    + '</div>';

  // Store callbacks
  ov._opts = opts;
  document.body.appendChild(ov);
  if (opts.isRetry) setTimeout(function() { document.getElementById('wa-new-tel')?.focus(); }, 100);
}

function _waTelConfirmar() {
  var ov = document.getElementById('wa-phone-overlay');
  if (!ov || !ov._opts) return;
  ov.remove();
  ov._opts.onEnviar(ov._opts.telActual, false);
}

function _waTelReportar() {
  var ov = document.getElementById('wa-phone-overlay');
  if (!ov || !ov._opts) return;
  var opts = ov._opts;
  ov.remove();
  // Show retry modal
  _mostrarDialogoWA({ nombre: opts.nombre, telActual: opts.telActual, pacienteId: opts.pacienteId, isRetry: true, onEnviar: opts.onEnviar, onCancelar: opts.onCancelar, _tipo: opts._tipo, _id: opts._id });
}

function _waTelConfirmarRetry() {
  var ov = document.getElementById('wa-phone-overlay');
  if (!ov || !ov._opts) return;
  var opts = ov._opts;
  var nuevoTel = (document.getElementById('wa-new-tel')?.value || '').replace(/\D/g, '');
  var errEl = document.getElementById('wa-tel-err');
  var telOrigLimpio = (opts.telActual || '').replace(/\D/g, '');
  if (!nuevoTel || nuevoTel.length < 10) {
    errEl.textContent = 'Ingresa un número válido de 10 dígitos'; errEl.style.display = ''; return;
  }
  if (nuevoTel === telOrigLimpio || nuevoTel === '52' + telOrigLimpio || '52' + nuevoTel === telOrigLimpio) {
    errEl.textContent = 'Es el mismo número — ingresa uno diferente'; errEl.style.display = ''; return;
  }
  ov.remove();
  opts.onEnviar(nuevoTel, true, opts.pacienteId);
}

async function compartirTicketDigital(ventaIdParam) {
  const vid = ventaIdParam || vtaDetalleId || lastSaleId;
  if (!vid) { toast('Sin venta seleccionada', true); return; }

  // Throttle check
  var thr = _waCheckThrottle('ticket', vid);
  if (thr.blocked) { toast('❌ Envío bloqueado para esta venta', true); return; }
  if (!thr.ok) { toast('⏳ Espera ' + thr.wait + ' min para reenviar el ticket', true); return; }

  const { data: v } = await db.from('ventas').select('*, pacientes(id, nombre, apellidos, telefono)').eq('id', vid).single();
  if (!v) { toast('Venta no encontrada', true); return; }
  const pac = v.pacientes ? `${v.pacientes.nombre || ''} ${v.pacientes.apellidos || ''}`.trim() : '';
  const nombre = pac ? pac.split(' ')[0] : 'Cliente';
  const tel = v.pacientes?.telefono || '';
  const pacienteId = v.pacientes?.id || v.paciente_id;
  const saldo = Number(v.saldo);
  let token = v.token_portal;
  if (!token) { token = Math.random().toString(36).substring(2,12); await db.from('ventas').update({token_portal:token}).eq('id',v.id); }
  const portalUrl = `${window.location.origin}/portal.html?t=${token}`;
  // Convertir created_at (UTC) a fecha local correcta — evita mostrar día siguiente en ventas nocturnas
  const _fD = new Date(v.created_at);
  const fecha = new Date(_fD.getTime() - _fD.getTimezoneOffset()*60000).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});

  if (!tel) {
    try { await navigator.clipboard.writeText(portalUrl); toast('✓ Link del portal copiado (cliente sin teléfono)'); } catch { prompt('Copia este link:', portalUrl); }
    return;
  }

  async function ejecutarEnvioTicket(telParam, esNuevoTel, pacId) {
    var cleanTel = (telParam || '').replace(/\D/g, '');
    var whatsappNum = cleanTel.startsWith('52') ? cleanTel : cleanTel.length === 10 ? '52' + cleanTel : cleanTel;
    let fallbackMsg = `🧾 *ÓPTICAS CAR & ERA*\n\nHola ${nombre}, aquí está tu ticket:\n\n`;
    fallbackMsg += `📋 *${v.folio}* · $${Number(v.total).toFixed(2)}\n`;
    fallbackMsg += saldo > 0 ? `⚠️ Saldo pendiente: *$${saldo.toFixed(2)}*\n` : `✅ *Liquidada*\n`;
    fallbackMsg += `\n👉 *Ver ticket completo:*\n${portalUrl}\n\n¡Gracias por tu preferencia! 👓`;
    var waResult = await sendWA(whatsappNum, fallbackMsg, {
      template: 'HX06c0cfea31f5a0110f28b9e46bbed4ae',
      template_variables: { '1': nombre, '2': (v.sucursal && v.sucursal !== 'Todas') ? v.sucursal : (currentUser?.sucursal && currentUser.sucursal !== 'Todas' ? currentUser.sucursal : 'Car & Era'), '3': v.folio, '4': Number(v.total).toFixed(2), '5': saldo > 0 ? saldo.toFixed(2) : '0.00', '6': fecha, '7': portalUrl }
    });
    if (waResult.ok) {
      _waMarkSent('ticket', vid);
      toast('✅ Ticket digital enviado por WhatsApp');
      if (esNuevoTel && pacId) {
        // Actualizar teléfono en pacientes
        var telGuardar = cleanTel.length > 10 ? cleanTel.slice(-10) : cleanTel;
        await db.from('pacientes').update({ telefono: telGuardar }).eq('id', pacId);
        toast('📞 Teléfono actualizado en expediente');
      }
    } else {
      _waMarkBlocked('ticket', vid);
      toast('❌ No se pudo enviar. Botón bloqueado.', true);
    }
  }

  var isRetry = thr.attempts > 0;
  _mostrarDialogoWA({
    nombre: nombre, telActual: tel, pacienteId: pacienteId,
    isRetry: isRetry, _tipo: 'ticket', _id: vid,
    onEnviar: ejecutarEnvioTicket
  });
}

async function copiarLinkPortal(ventaIdParam) {
  const vid = ventaIdParam || lastSaleId;
  if (!vid) { toast('No hay venta', true); return; }
  let token;
  if (lastSaleData?.portalToken) { token = lastSaleData.portalToken; }
  else {
    const { data: v } = await db.from('ventas').select('token_portal').eq('id', vid).single();
    token = v?.token_portal;
    if (!token) { token = Math.random().toString(36).substring(2,12); await db.from('ventas').update({token_portal:token}).eq('id',vid); }
  }
  const url = `${window.location.origin}/portal.html?t=${token}`;
  try { await navigator.clipboard.writeText(url); toast('✓ Link del portal copiado'); } catch { prompt('Copia este link:', url); }
}
