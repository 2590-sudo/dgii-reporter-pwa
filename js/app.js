// App principal — lógica de UI y flujo

let estadoApp = 'cargando'; // cargando | activacion | setup | principal | bloqueado

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  await iniciar();
});

async function iniciar() {
  mostrarPantalla('pantalla-carga');
  const token = await getConfig('token');
  if (!token) {
    mostrarPantalla('pantalla-token');
    return;
  }
  const activo = await verificarLicencia();
  if (!activo) {
    mostrarPantallaBloqueo();
    return;
  }
  const setup = await getConfig('setup_completo');
  if (!setup) {
    mostrarPantalla('pantalla-setup');
    return;
  }
  await mostrarPrincipal();
}

// ─── ACTIVACIÓN POR TOKEN ───────────────────────────────
async function activarToken() {
  const input = document.getElementById('input-token').value.trim().toUpperCase();
  if (!input || input.length < 8) {
    mostrarError('token-error', 'Token inválido. Verifica con tu proveedor.');
    return;
  }
  mostrarCargando('btn-activar', true);
  try {
    const SYNC_URL = 'https://dgii-admin-panel.vercel.app/api';
    const resp = await fetch(`${SYNC_URL}/check?token=${input}`);
    const data = await resp.json();
    if (data.active) {
      await setConfig('token', input);
      await setConfig('license_status', 'active');
      await setConfig('last_sync', Date.now());
      mostrarPantalla('pantalla-setup');
    } else {
      mostrarError('token-error', 'Token inválido o cuenta suspendida.');
    }
  } catch {
    mostrarError('token-error', 'Sin conexión. Verifica tu internet e intenta de nuevo.');
  }
  mostrarCargando('btn-activar', false);
}

// ─── SETUP INICIAL ──────────────────────────────────────
async function guardarSetup() {
  const nombre = document.getElementById('setup-nombre').value.trim();
  const rnc = document.getElementById('setup-rnc').value.trim();
  const tipo = document.getElementById('setup-tipo').value;
  const itbis = document.getElementById('setup-itbis').value;

  if (!nombre || !rnc) {
    mostrarError('setup-error', 'Nombre y RNC son obligatorios.');
    return;
  }
  if (!/^\d{9,11}$/.test(rnc.replace(/-/g, ''))) {
    mostrarError('setup-error', 'RNC inválido. Debe tener 9 u 11 dígitos.');
    return;
  }

  await setConfig('negocio', { nombre, rnc, tipo, itbis });
  await setConfig('setup_completo', true);
  await mostrarPrincipal();
}

// ─── PANTALLA PRINCIPAL ─────────────────────────────────
async function mostrarPrincipal() {
  const negocio = await getConfig('negocio');
  document.getElementById('nombre-negocio').textContent = negocio?.nombre || 'Mi Negocio';

  const hoy = new Date().toLocaleDateString('es-DO', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('fecha-hoy').textContent = hoy;

  await actualizarResumenMes();
  await verificarRegistroHoy();
  mostrarPantalla('pantalla-principal');
}

async function verificarRegistroHoy() {
  const registros = await getRegistroHoy();
  if (registros.length > 0) {
    const r = registros[registros.length - 1];
    document.getElementById('estado-hoy').textContent =
      `✅ Hoy registrado: Ventas ${formatearDinero(r.ventas)} | Compras ${formatearDinero(r.compras)}`;
    document.getElementById('estado-hoy').className = 'estado-ok';
  } else {
    document.getElementById('estado-hoy').textContent = '⏳ Aún no has registrado el día de hoy';
    document.getElementById('estado-hoy').className = 'estado-pendiente';
  }
}

// ─── REGISTRO DIARIO ────────────────────────────────────
function abrirRegistro() {
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('reg-fecha').textContent = new Date().toLocaleDateString('es-DO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  document.getElementById('input-ventas').value = '';
  document.getElementById('input-compras').value = '';
  document.getElementById('preview-ventas').innerHTML = '';
  document.getElementById('preview-compras').innerHTML = '';
  mostrarPantalla('pantalla-registro');
  cargarComprobantesHoy();
}

function previewVentas() {
  const monto = parsearMonto(document.getElementById('input-ventas').value);
  if (monto > 0) {
    const c = calcularDesdeVentas(monto);
    document.getElementById('preview-ventas').innerHTML =
      `<div class="preview-box">
        <span>Ventas netas:</span><strong>${formatearDinero(c.ventasNetas)}</strong>
        <span>ITBIS cobrado (18%):</span><strong>${formatearDinero(c.itbisCobrado)}</strong>
      </div>`;
  } else {
    document.getElementById('preview-ventas').innerHTML = '';
  }
}

function previewCompras() {
  const monto = parsearMonto(document.getElementById('input-compras').value);
  if (monto > 0) {
    const c = calcularDesdeCompras(monto);
    document.getElementById('preview-compras').innerHTML =
      `<div class="preview-box">
        <span>Compras netas:</span><strong>${formatearDinero(c.comprasNetas)}</strong>
        <span>ITBIS pagado (crédito):</span><strong>${formatearDinero(c.itbisPagado)}</strong>
      </div>`;
  } else {
    document.getElementById('preview-compras').innerHTML = '';
  }
}

async function guardarDia() {
  const ventas = parsearMonto(document.getElementById('input-ventas').value);
  const compras = parsearMonto(document.getElementById('input-compras').value);

  if (ventas === 0 && compras === 0) {
    mostrarError('reg-error', 'Ingresa al menos ventas o compras del día.');
    return;
  }

  const hoy = new Date().toISOString().split('T')[0];
  const mes = hoy.substring(0, 7);

  mostrarCargando('btn-guardar-dia', true);

  const registro = {
    fecha: hoy,
    mes: mes,
    ventas: ventas,
    compras: compras,
    timestamp: Date.now()
  };

  await guardarRegistro(registro);
  await actualizarResumenMes();
  await verificarRegistroHoy();

  mostrarToast('¡Día guardado exitosamente! ✅');
  mostrarPantalla('pantalla-principal');
  mostrarCargando('btn-guardar-dia', false);
}

function sinVentasHoy() {
  document.getElementById('input-ventas').value = '0';
  previewVentas();
}

// ─── RESUMEN MENSUAL ────────────────────────────────────
async function actualizarResumenMes() {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const resumen = calcularResumenMensual(registros);

  document.getElementById('total-ventas').textContent = formatearDinero(resumen.totalVentas);
  document.getElementById('total-compras').textContent = formatearDinero(resumen.totalCompras);
  document.getElementById('itbis-cobrado').textContent = formatearDinero(resumen.totalItbisCobrado);
  document.getElementById('itbis-pagado').textContent = formatearDinero(resumen.totalItbisPagado);
  document.getElementById('itbis-neto').textContent = formatearDinero(resumen.itbisAPagar);
  document.getElementById('dias-reg').textContent = resumen.diasRegistrados + ' días';
  document.getElementById('mes-nombre').textContent = getMesNombre();

  const semaforo = document.getElementById('semaforo');
  if (resumen.itbisAPagar > 50000) {
    semaforo.className = 'semaforo rojo';
    semaforo.textContent = '🔴 ITBIS alto este mes';
  } else if (resumen.itbisAPagar > 0) {
    semaforo.className = 'semaforo amarillo';
    semaforo.textContent = '🟡 Tienes ITBIS a pagar';
  } else {
    semaforo.className = 'semaforo verde';
    semaforo.textContent = '🟢 Crédito a favor';
  }
}

async function verReporte() {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const resumen = calcularResumenMensual(registros);
  const negocio = await getConfig('negocio');

  document.getElementById('rep-negocio').textContent = negocio?.nombre;
  document.getElementById('rep-rnc').textContent = negocio?.rnc;
  document.getElementById('rep-mes').textContent = getMesNombre();
  document.getElementById('rep-ventas').textContent = formatearDinero(resumen.totalVentas);
  document.getElementById('rep-compras').textContent = formatearDinero(resumen.totalCompras);
  document.getElementById('rep-itbis-cobrado').textContent = formatearDinero(resumen.totalItbisCobrado);
  document.getElementById('rep-itbis-pagado').textContent = formatearDinero(resumen.totalItbisPagado);
  document.getElementById('rep-itbis-pagar').textContent = formatearDinero(resumen.itbisAPagar);
  document.getElementById('rep-dias').textContent = resumen.diasRegistrados;

  mostrarPantalla('pantalla-reporte');
}

async function descargarCSV(tipo) {
  const mes = getMesActual();
  const registros = await getRegistrosMes(mes);
  const negocio = await getConfig('negocio');
  const config = { rnc: negocio?.rnc };

  let csv, filename;
  if (tipo === '606') {
    csv = generarCSV606(registros, config);
    filename = `606_${mes}_${config.rnc}.txt`;
  } else {
    csv = generarCSV607(registros, config);
    filename = `607_${mes}_${config.rnc}.txt`;
  }

  const blob = new Blob([csv], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast(`Archivo ${tipo} descargado ✅`);
}

// ─── BLOQUEO ─────────────────────────────────────────────
function mostrarPantallaBloqueo() {
  mostrarPantalla('pantalla-bloqueado');
}

// ─── UTILIDADES UI ───────────────────────────────────────
function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id)?.classList.add('activa');
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

function mostrarCargando(btnId, estado) {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = estado;
}

function parsearMonto(str) {
  if (!str) return 0;
  const n = parseFloat(str.toString().replace(/,/g, '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function volver() {
  const setup = getConfig('setup_completo');
  mostrarPantalla('pantalla-principal');
}

// ─── COMPROBANTES / FOTOS ────────────────────────────────
let comprobantesTemp = [];

function abrirSelectorComprobante() {
  document.getElementById('input-comprobante').click();
}

function abrirCamara() {
  document.getElementById('input-camara').click();
}

async function procesarComprobante(files) {
  if (!files || files.length === 0) return;

  const container = document.getElementById('comprobantes-preview');
  mostrarToast('Guardando comprobante...');

  for (const file of files) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      mostrarError('reg-error', 'Solo se aceptan imágenes o PDF.');
      continue;
    }

    const id = Date.now() + Math.random().toString(36).substr(2,5);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const dataUrl = e.target.result;

      // Guardar en IndexedDB
      await guardarComprobante({
        id,
        fecha: new Date().toISOString().split('T')[0],
        mes: getMesActual(),
        nombre: file.name,
        tipo: file.type,
        data: dataUrl,
        timestamp: Date.now()
      });

      comprobantesTemp.push({ id, nombre: file.name, dataUrl, tipo: file.type });
      renderizarComprobante(id, file.name, dataUrl, file.type, container);
      mostrarToast('✅ Comprobante guardado');
    };

    reader.readAsDataURL(file);
  }
}

function renderizarComprobante(id, nombre, dataUrl, tipo, container) {
  const div = document.createElement('div');
  div.className = 'comprobante-item';
  div.id = `comp-${id}`;

  const esPDF = tipo === 'application/pdf';
  const preview = esPDF
    ? `<div class="comp-pdf">📄 PDF</div>`
    : `<img src="${dataUrl}" class="comp-img" onclick="verComprobante('${id}')">`;

  div.innerHTML = `
    ${preview}
    <div class="comp-info">
      <div class="comp-nombre">${nombre.length > 20 ? nombre.substr(0,20)+'...' : nombre}</div>
      <div class="comp-fecha">Hoy</div>
    </div>
    <button class="comp-eliminar" onclick="eliminarComprobante('${id}')">✕</button>
  `;
  container.appendChild(div);
}

async function eliminarComprobante(id) {
  const db = await openDB();
  const tx = db.transaction('comprobantes', 'readwrite');
  tx.objectStore('comprobantes').delete(id);
  document.getElementById(`comp-${id}`)?.remove();
  comprobantesTemp = comprobantesTemp.filter(c => c.id !== id);
  mostrarToast('Comprobante eliminado');
}

function verComprobante(id) {
  const comp = comprobantesTemp.find(c => c.id === id);
  if (!comp) return;
  const modal = document.getElementById('modal-comprobante');
  document.getElementById('modal-img').src = comp.dataUrl;
  modal.style.display = 'flex';
}

function cerrarModal() {
  document.getElementById('modal-comprobante').style.display = 'none';
}

async function cargarComprobantesHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  try {
    const db = await openDB();
    const tx = db.transaction('comprobantes', 'readonly');
    const idx = tx.objectStore('comprobantes').index('fecha');
    const req = idx.getAll(hoy);
    req.onsuccess = () => {
      const container = document.getElementById('comprobantes-preview');
      container.innerHTML = '';
      comprobantesTemp = [];
      req.result.forEach(c => {
        comprobantesTemp.push({ id: c.id, nombre: c.nombre, dataUrl: c.data, tipo: c.tipo });
        renderizarComprobante(c.id, c.nombre, c.data, c.tipo, container);
      });
    };
  } catch(e) {}
}
