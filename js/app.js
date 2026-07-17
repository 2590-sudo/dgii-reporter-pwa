let deferredPrompt = null;
let estadoApp = 'cargando';

// ══ INIT ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Capturar evento de instalación PWA
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => {
      const banner = document.getElementById('install-banner');
      if (banner && estadoApp === 'principal') banner.style.display = 'flex';
    }, 3000);
  });

  window.addEventListener('appinstalled', () => {
    ocultarBanner();
    mostrarToast('¡App instalada exitosamente! 🎉');
  });

  await iniciar();
});

async function iniciar() {
  mostrarPantalla('carga');
  const token = await getConfig('token');

  if (!token) { mostrarPantalla('token'); return; }

  const activo = await verificarLicencia();
  if (!activo) { mostrarPantalla('bloqueado'); return; }

  const setup = await getConfig('setup_completo');
  if (!setup) { mostrarPantalla('setup'); return; }

  await mostrarPrincipal();
}

// ══ NAVEGACIÓN ════════════════════════════════════════
function mostrarPantalla(nombre) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  const el = document.getElementById(`pantalla-${nombre}`);
  if (el) el.classList.add('activa');

  const navBar = document.getElementById('nav-bar');
  const conNav = ['principal', 'reporte', 'config'];
  navBar.style.display = conNav.includes(nombre) ? 'flex' : 'none';

  // Highlight nav activo
  ['inicio','registro','reporte','config'].forEach(id => {
    document.getElementById(`nav-${id}`)?.classList.remove('activo');
  });
  if (nombre === 'principal') document.getElementById('nav-inicio')?.classList.add('activo');
  if (nombre === 'reporte') document.getElementById('nav-reporte')?.classList.add('activo');
  if (nombre === 'config') document.getElementById('nav-config')?.classList.add('activo');

  estadoApp = nombre;
}

function navegar(pantalla) {
  if (pantalla === 'config') cargarConfig();
  mostrarPantalla(pantalla);
}

function navReporte() {
  verReporte();
}

function volver() { mostrarPantalla('principal'); }

// ══ TOKEN ═════════════════════════════════════════════
async function activarToken() {
  const input = document.getElementById('input-token').value.trim().toUpperCase();
  if (!input || input.length < 6) {
    mostrarError('token-error', 'Token inválido. Verifica con tu proveedor.');
    return;
  }
  document.getElementById('btn-activar').disabled = true;
  document.getElementById('btn-activar').textContent = 'Verificando...';

  try {
    const SYNC_URL = 'https://dgii-admin-panel.vercel.app/api';
    const resp = await fetch(`${SYNC_URL}/check?token=${input}`, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json();
    if (data.active) {
      await setConfig('token', input);
      await setConfig('license_status', 'active');
      await setConfig('last_sync', Date.now());
      mostrarPantalla('setup');
    } else {
      mostrarError('token-error', 'Token inválido o cuenta suspendida.');
    }
  } catch {
    // Demo mode — para pruebas sin servidor activo
    if (input.startsWith('TEST') || input.startsWith('DEMO')) {
      await setConfig('token', input);
      await setConfig('license_status', 'active');
      await setConfig('last_sync', Date.now());
      mostrarPantalla('setup');
    } else {
      mostrarError('token-error', 'Sin conexión al servidor. Usa un token DEMO-XXXX para pruebas.');
    }
  }

  document.getElementById('btn-activar').disabled = false;
  document.getElementById('btn-activar').textContent = 'Activar ✅';
}

// ══ SETUP ═════════════════════════════════════════════
async function guardarSetup() {
  const nombre = document.getElementById('setup-nombre').value.trim();
  const rnc    = document.getElementById('setup-rnc').value.trim().replace(/-/g,'');
  const tipo   = document.getElementById('setup-tipo').value;
  const itbis  = document.getElementById('setup-itbis').value;

  if (!nombre || !rnc) { mostrarError('setup-error', 'Nombre y RNC son obligatorios.'); return; }
  if (!/^\d{9,11}$/.test(rnc)) { mostrarError('setup-error', 'RNC inválido. Debe tener 9 u 11 dígitos.'); return; }

  await setConfig('negocio', { nombre, rnc, tipo, itbis });
  await setConfig('setup_completo', true);
  await mostrarPrincipal();
}

// ══ PRINCIPAL ══════════════════════════════════════════
async function mostrarPrincipal() {
  const negocio = await getConfig('negocio');
  document.getElementById('nombre-negocio').textContent = negocio?.nombre || 'Mi Negocio';
  const hoy = new Date().toLocaleDateString('es-DO', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('fecha-hoy').textContent = hoy;

  await actualizarResumenMes();
  await verificarRegistroHoy();
  mostrarPantalla('principal');
}

async function verificarRegistroHoy() {
  const registros = await getRegistroHoy();
  const el = document.getElementById('estado-hoy');
  if (registros.length > 0) {
    const r = registros[registros.length - 1];
    el.textContent = `✅ Registrado: Ventas ${formatearDinero(r.ventas)} | Compras ${formatearDinero(r.compras)}`;
    el.className = 'estado-hoy estado-ok';
  } else {
    el.textContent = '⏳ Aún no has registrado el día de hoy';
    el.className = 'estado-hoy estado-pendiente';
  }
}

async function actualizarResumenMes() {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const r = calcularResumenMensual(registros);

  document.getElementById('total-ventas').textContent   = formatearDinero(r.totalVentas);
  document.getElementById('total-compras').textContent  = formatearDinero(r.totalCompras);
  document.getElementById('itbis-cobrado').textContent  = formatearDinero(r.totalItbisCobrado);
  document.getElementById('itbis-neto').textContent     = formatearDinero(r.itbisAPagar);
  document.getElementById('mes-nombre').textContent     = getMesNombre().toUpperCase();

  const sem = document.getElementById('semaforo');
  if (r.diasRegistrados === 0) {
    sem.className = 'semaforo verde'; sem.textContent = '🟢 Sin registros aún';
  } else if (r.itbisAPagar > 50000) {
    sem.className = 'semaforo rojo'; sem.textContent = `🔴 ITBIS alto: ${formatearDinero(r.itbisAPagar)}`;
  } else if (r.itbisAPagar > 0) {
    sem.className = 'semaforo amarillo'; sem.textContent = `🟡 ITBIS a pagar: ${formatearDinero(r.itbisAPagar)}`;
  } else {
    sem.className = 'semaforo verde'; sem.textContent = '🟢 Crédito a favor este mes';
  }
}

// ══ REGISTRO DIARIO ════════════════════════════════════
let comprobantesTemp = [];

function abrirRegistro() {
  document.getElementById('reg-fecha').textContent = new Date().toLocaleDateString('es-DO',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('input-ventas').value = '';
  document.getElementById('input-compras').value = '';
  document.getElementById('preview-ventas').innerHTML = '';
  document.getElementById('preview-compras').innerHTML = '';
  document.getElementById('comprobantes-preview').innerHTML = '';
  comprobantesTemp = [];
  mostrarPantalla('registro');
  cargarComprobantesHoy();
}

function previewVentas() {
  const monto = parsearMonto(document.getElementById('input-ventas').value);
  const el = document.getElementById('preview-ventas');
  if (monto > 0) {
    const c = calcularDesdeVentas(monto);
    el.innerHTML = `<div class="preview-box">
      <span>Ventas netas</span><strong>${formatearDinero(c.ventasNetas)}</strong>
      <span>ITBIS cobrado (18%)</span><strong>${formatearDinero(c.itbisCobrado)}</strong>
    </div>`;
  } else { el.innerHTML = ''; }
}

function previewCompras() {
  const monto = parsearMonto(document.getElementById('input-compras').value);
  const el = document.getElementById('preview-compras');
  if (monto > 0) {
    const c = calcularDesdeCompras(monto);
    el.innerHTML = `<div class="preview-box">
      <span>Compras netas</span><strong>${formatearDinero(c.comprasNetas)}</strong>
      <span>ITBIS pagado (crédito)</span><strong>${formatearDinero(c.itbisPagado)}</strong>
    </div>`;
  } else { el.innerHTML = ''; }
}

function sinVentasHoy() {
  document.getElementById('input-ventas').value = '0';
  document.getElementById('preview-ventas').innerHTML = '';
}

async function guardarDia() {
  const ventas  = parsearMonto(document.getElementById('input-ventas').value);
  const compras = parsearMonto(document.getElementById('input-compras').value);
  if (ventas === 0 && compras === 0) {
    mostrarError('reg-error', 'Ingresa al menos ventas o compras del día.'); return;
  }
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('btn-guardar-dia').disabled = true;
  await guardarRegistro({ fecha: hoy, mes: hoy.substring(0,7), ventas, compras, timestamp: Date.now() });
  await actualizarResumenMes();
  await verificarRegistroHoy();
  mostrarToast('¡Día guardado exitosamente! ✅');
  mostrarPantalla('principal');
  document.getElementById('btn-guardar-dia').disabled = false;
}

// ══ COMPROBANTES ═══════════════════════════════════════
function abrirCamara() { document.getElementById('input-camara').click(); }
function abrirSelectorComprobante() { document.getElementById('input-comprobante').click(); }

async function procesarComprobante(files) {
  if (!files || !files.length) return;
  mostrarToast('Guardando comprobante...');
  const container = document.getElementById('comprobantes-preview');
  for (const file of files) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      mostrarError('reg-error', 'Solo imágenes o PDF.'); continue;
    }
    const id = Date.now() + Math.random().toString(36).substr(2,5);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      await guardarComprobante({ id, fecha: new Date().toISOString().split('T')[0],
        mes: getMesActual(), nombre: file.name, tipo: file.type, data: dataUrl, timestamp: Date.now() });
      comprobantesTemp.push({ id, nombre: file.name, dataUrl, tipo: file.type });
      renderizarComprobante(id, file.name, dataUrl, file.type, container);
      mostrarToast('✅ Comprobante guardado');
    };
    reader.readAsDataURL(file);
  }
}

function renderizarComprobante(id, nombre, dataUrl, tipo, container) {
  const div = document.createElement('div');
  div.className = 'comprobante-item'; div.id = `comp-${id}`;
  const preview = tipo === 'application/pdf'
    ? `<div class="comp-pdf">📄</div>`
    : `<img src="${dataUrl}" class="comp-img" onclick="verComprobante('${id}')">`;
  div.innerHTML = `${preview}
    <div class="comp-info">
      <div class="comp-nombre">${nombre.length > 22 ? nombre.substr(0,22)+'...' : nombre}</div>
      <div class="comp-fecha">Hoy</div>
    </div>
    <button class="comp-eliminar" onclick="eliminarComprobante('${id}')">✕</button>`;
  container.appendChild(div);
}

async function eliminarComprobante(id) {
  const db = await openDB();
  const tx = db.transaction('comprobantes', 'readwrite');
  tx.objectStore('comprobantes').delete(id);
  document.getElementById(`comp-${id}`)?.remove();
  comprobantesTemp = comprobantesTemp.filter(c => c.id !== id);
}

function verComprobante(id) {
  const comp = comprobantesTemp.find(c => c.id === id);
  if (!comp) return;
  const modal = document.getElementById('modal-comprobante');
  document.getElementById('modal-img').src = comp.dataUrl;
  modal.style.display = 'flex';
}
function cerrarModal() { document.getElementById('modal-comprobante').style.display = 'none'; }

async function cargarComprobantesHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  try {
    const db = await openDB();
    const tx = db.transaction('comprobantes', 'readonly');
    const idx = tx.objectStore('comprobantes').index('fecha');
    const req = idx.getAll(hoy);
    req.onsuccess = () => {
      const container = document.getElementById('comprobantes-preview');
      container.innerHTML = ''; comprobantesTemp = [];
      req.result.forEach(c => {
        comprobantesTemp.push({ id: c.id, nombre: c.nombre, dataUrl: c.data, tipo: c.tipo });
        renderizarComprobante(c.id, c.nombre, c.data, c.tipo, container);
      });
    };
  } catch(e) {}
}

// ══ REPORTE ════════════════════════════════════════════
async function verReporte() {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const r = calcularResumenMensual(registros);
  const negocio = await getConfig('negocio');
  document.getElementById('rep-negocio').textContent = negocio?.nombre;
  document.getElementById('rep-rnc').textContent = negocio?.rnc;
  document.getElementById('rep-mes').textContent = getMesNombre();
  document.getElementById('rep-ventas').textContent = formatearDinero(r.totalVentas);
  document.getElementById('rep-compras').textContent = formatearDinero(r.totalCompras);
  document.getElementById('rep-itbis-cobrado').textContent = formatearDinero(r.totalItbisCobrado);
  document.getElementById('rep-itbis-pagado').textContent = formatearDinero(r.totalItbisPagado);
  document.getElementById('rep-itbis-pagar').textContent = formatearDinero(r.itbisAPagar);
  mostrarPantalla('reporte');
  document.getElementById('nav-reporte')?.classList.add('activo');
}

async function descargarCSV(tipo) {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const negocio = await getConfig('negocio');
  const config = { rnc: negocio?.rnc };
  let csv, filename;
  if (tipo === '606') {
    csv = generarCSV606(registros, config); filename = `606_${mes}_${config.rnc}.txt`;
  } else {
    csv = generarCSV607(registros, config); filename = `607_${mes}_${config.rnc}.txt`;
  }
  const blob = new Blob([csv], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  mostrarToast(`Archivo ${tipo} descargado ✅`);
}

// ══ CONFIG ═════════════════════════════════════════════
async function cargarConfig() {
  const negocio = await getConfig('negocio');
  const lastSync = await getConfig('last_sync');
  const status = await getConfig('license_status');
  document.getElementById('cfg-nombre').textContent = negocio?.nombre || '-';
  document.getElementById('cfg-rnc').textContent = negocio?.rnc || '-';
  document.getElementById('cfg-tipo').textContent = negocio?.tipo || '-';
  document.getElementById('cfg-licencia').textContent = status === 'active' ? '✅ Activa' : '❌ Suspendida';
  if (lastSync) {
    const d = new Date(lastSync);
    document.getElementById('cfg-sync').textContent = d.toLocaleString('es-DO');
  }
  // Mostrar opción nativa si disponible
  if (deferredPrompt) document.getElementById('opt-nativo').style.display = 'flex';
}

async function forzarSync() {
  mostrarToast('Sincronizando...');
  const activo = await verificarLicencia();
  if (!activo) { mostrarPantalla('bloqueado'); return; }
  mostrarToast('✅ Sincronización completa');
  cargarConfig();
}

// ══ INSTALL PWA ════════════════════════════════════════
function mostrarInstallModal() {
  ocultarBanner();
  if (deferredPrompt) document.getElementById('opt-nativo').style.display = 'flex';
  document.getElementById('modal-install').style.display = 'block';
}
function cerrarModalInstall(e) {
  if (!e || e.target === document.getElementById('modal-install'))
    document.getElementById('modal-install').style.display = 'none';
}

async function instalarNativo() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('modal-install').style.display = 'none';
  if (outcome === 'accepted') mostrarToast('¡App instalada! 🎉');
}

function mostrarInstruccionesManual() {
  document.getElementById('modal-install').style.display = 'none';
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  document.getElementById('instrucciones-android').style.display = isAndroid ? 'block' : 'none';
  document.getElementById('instrucciones-ios').style.display = isIOS ? 'block' : 'none';
  document.getElementById('instrucciones-general').style.display = (!isAndroid && !isIOS) ? 'block' : 'none';
  document.getElementById('modal-instrucciones').style.display = 'block';
}
function cerrarInstrucciones() { document.getElementById('modal-instrucciones').style.display = 'none'; }

function ocultarBanner() { document.getElementById('install-banner').style.display = 'none'; }

// ══ BLOQUEADO ══════════════════════════════════════════
function mostrarPantallaBloqueo() { mostrarPantalla('bloqueado'); }

// ══ UTILS ══════════════════════════════════════════════
function parsearMonto(str) {
  if (!str) return 0;
  const n = parseFloat(str.toString().replace(/,/g,'').replace(/[^0-9.]/g,''));
  return isNaN(n) ? 0 : n;
}

function mostrarError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
  setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  if (t) { t.textContent = msg; t.classList.add('visible'); }
  setTimeout(() => t?.classList.remove('visible'), 3000);
}

// ══ PDF + WHATSAPP ═════════════════════════════════════
async function generarPDFReporte() {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const r = calcularResumenMensual(registros);
  const negocio = await getConfig('negocio');

  if (r.diasRegistrados === 0) {
    mostrarToast('No hay registros este mes');
    return null;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 20;

  // Header con fondo
  doc.setFillColor(13, 13, 26);
  doc.rect(0, 0, W, 35, 'F');
  doc.setTextColor(124, 58, 237);
  doc.setFontSize(22);
  doc.setFont(undefined, 'bold');
  doc.text('DGII Reporter', 105, 15, { align: 'center' });
  doc.setTextColor(136, 136, 170);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Reporte Fiscal Mensual', 105, 23, { align: 'center' });
  doc.text(getMesNombre().toUpperCase(), 105, 28, { align: 'center' });
  y = 45;

  // Datos del negocio
  doc.setTextColor(40, 40, 60);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(negocio?.nombre || 'N/A', 20, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 120);
  doc.text('RNC: ' + (negocio?.rnc || 'N/A'), 20, y + 7);
  doc.text('Tipo: ' + (negocio?.tipo || 'N/A'), 20, y + 13);
  doc.text('Generado: ' + new Date().toLocaleString('es-DO'), 20, y + 19);
  y += 30;

  // Linea separadora
  doc.setDrawColor(220, 220, 230);
  doc.line(20, y, W - 20, y);
  y += 10;

  // Resumen fiscal
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(40, 40, 60);
  doc.text('Resumen Fiscal', 20, y);
  y += 8;

  const filas = [
    ['Total Ventas (con ITBIS)', formatearDinero(r.totalVentas), [167, 139, 250]],
    ['Total Compras', formatearDinero(r.totalCompras), [60, 60, 80]],
    ['ITBIS Cobrado (18%)', formatearDinero(r.totalItbisCobrado), [60, 60, 80]],
    ['ITBIS Pagado (credito)', formatearDinero(r.totalItbisPagado), [60, 60, 80]],
    ['Dias registrados', r.diasRegistrados.toString(), [60, 60, 80]]
  ];

  doc.setFontSize(11);
  filas.forEach(f => {
    doc.setFont(undefined, 'normal');
    doc.setTextColor(f[2][0], f[2][1], f[2][2]);
    doc.text(f[0], 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(f[1], W - 20, y, { align: 'right' });
    y += 8;
  });

  // ITBIS a pagar destacado
  y += 4;
  doc.setFillColor(240, 240, 245);
  doc.roundedRect(20, y - 5, W - 40, 16, 3, 3, 'F');
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(124, 58, 237);
  doc.text('ITBIS a Pagar a DGII', 25, y + 4);
  doc.setTextColor(0, 168, 138);
  doc.text(formatearDinero(r.itbisAPagar), W - 25, y + 4, { align: 'right' });
  y += 20;

  // Detalle de registros
  if (registros.length > 0) {
    doc.addPage();
    y = 20;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(40, 40, 60);
    doc.text('Detalle de Registros', 20, y);
    y += 8;

    // Tabla header
    doc.setFillColor(13, 13, 26);
    doc.rect(20, y - 5, W - 40, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Fecha', 22, y + 1);
    doc.text('Ventas', 90, y + 1, { align: 'right' });
    doc.text('Compras', 140, y + 1, { align: 'right' });
    doc.text('ITBIS Cobrado', W - 22, y + 1, { align: 'right' });
    y += 10;

    // Filas
    doc.setFont(undefined, 'normal');
    doc.setTextColor(60, 60, 80);
    registros.forEach((reg, i) => {
      if (y > 280) { doc.addPage(); y = 20; }
      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 252);
        doc.rect(20, y - 4, W - 40, 8, 'F');
      }
      const fechaTxt = new Date(reg.fecha + 'T00:00:00').toLocaleDateString('es-DO', { day:'2-digit', month:'2-digit' });
      doc.text(fechaTxt, 22, y + 1);
      const cv = reg.ventas > 0 ? calcularDesdeVentas(reg.ventas) : null;
      doc.text(reg.ventas > 0 ? formatearDinero(reg.ventas) : '-', 90, y + 1, { align: 'right' });
      doc.text(reg.compras > 0 ? formatearDinero(reg.compras) : '-', 140, y + 1, { align: 'right' });
      doc.text(cv ? formatearDinero(cv.itbisCobrado) : '-', W - 22, y + 1, { align: 'right' });
      y += 8;
    });
  }

  // Footer en cada pagina
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 170);
    doc.text('DGII Reporter - Reporte generado automaticamente', 105, 290, { align: 'center' });
    doc.text('Pagina ' + p + ' de ' + pages, W - 20, 290, { align: 'right' });
  }

  const filename = 'reporte_DGII_' + mes + '.pdf';
  const blob = doc.output('blob');
  return { blob, filename };
}

async function descargarPDF() {
  const result = await generarPDFReporte();
  if (!result) return;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast('PDF descargado ✅');
}

async function compartirPDFWhatsApp() {
  const result = await generarPDFReporte();
  if (!result) return;

  const file = new File([result.blob], result.filename, { type: 'application/pdf' });

  // Intentar Web Share API con archivo (funciona en Android Chrome)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Reporte DGII',
        text: 'Reporte fiscal de ' + getMesNombre()
      });
      return;
    } catch(e) {
      if (e.name === 'AbortError') return;
    }
  }

  // Fallback: descargar + abrir WhatsApp
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();

  // Dar tiempo a que descargue y luego abrir WhatsApp
  setTimeout(() => {
    const waUrl = 'https://wa.me/?text=' + encodeURIComponent(
      'Reporte DGII ' + getMesNombre() + '\n\nAdjunta el PDF que se descargo.'
    );
    window.open(waUrl, '_blank');
    URL.revokeObjectURL(url);
  }, 800);

  mostrarToast('PDF descargado. Abriendo WhatsApp...');
}
