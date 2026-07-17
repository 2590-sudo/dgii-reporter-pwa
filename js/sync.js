// sync.js - Sincronizacion con backend DGII + API eCF MSeller
// Licencia + envio automatico de 606/607 + e-CF

const SYNC_URL = 'https://dgii-admin-panel.vercel.app/api';
const DGII_API = 'https://base44.app/api/apps/6a4fa2d8f496e4779f4037c2/functions/dgiiEcf';
const SYNC_INTERVAL = 12 * 60 * 60 * 1000;

// === VERIFICAR LICENCIA ===
async function verificarLicencia() {
  try {
    const token = await getConfig('token');
    if (!token) return false;
    const lastCheck = await getConfig('last_sync');
    const ahora = Date.now();
    if (lastCheck && (ahora - lastCheck) < SYNC_INTERVAL) {
      const status = await getConfig('license_status');
      return status === 'active';
    }
    const resp = await fetch(`${SYNC_URL}/check?token=${token}`, {
      method: 'GET', headers: { 'Content-Type': 'application/json' }
    });
    if (!resp.ok) {
      const status = await getConfig('license_status');
      return status === 'active';
    }
    const data = await resp.json();
    await setConfig('license_status', data.active ? 'active' : 'suspended');
    await setConfig('last_sync', ahora);
    await setConfig('cliente_info', data.cliente || {});
    return data.active;
  } catch (err) {
    const status = await getConfig('license_status');
    return status === 'active';
  }
}

// === SINCRONIZAR DATOS PENDIENTES ===
async function sincronizarDatos() {
  try {
    const token = await getConfig('token');
    if (!token) return;
    const db = await openDB();
    const tx = db.transaction('sync_queue', 'readonly');
    const req = tx.objectStore('sync_queue').getAll();
    req.onsuccess = async () => {
      const pendientes = req.result;
      if (!pendientes.length) return;
      await fetch(`${SYNC_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ registros: pendientes })
      });
      const tx2 = db.transaction('sync_queue', 'readwrite');
      tx2.objectStore('sync_queue').clear();
    };
  } catch (e) {}
}

// === ENVIAR 606 A DGII (via API) ===
async function enviar606DGII(registros, negocio) {
  try {
    const compras = registros.filter(r => r.compras > 0).map(r => {
      const c = calcularDesdeCompras(r.compras);
      return {
        rnc: negocio.rnc, razonSocial: negocio.nombre,
        ncf: r.ncfCompra || 'B0100000001', fecha: r.fecha.replace(/-/g, ''),
        monto: c.comprasNetas, itbis: c.itbisPagado, itbisRetenido: 0, tipoBienes: '01'
      };
    });
    if (!compras.length) return { success: false, message: 'No hay compras registradas' };
    const resp = await fetch(DGII_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generar606', data: { compras, periodo: getMesActual() }, entorno: 'TesteCF' })
    });
    return await resp.json();
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// === ENVIAR 607 A DGII (via API) ===
async function enviar607DGII(registros, negocio) {
  try {
    const ventas = registros.filter(r => r.ventas > 0).map(r => {
      const v = calcularDesdeVentas(r.ventas);
      return {
        rnc: negocio.rnc, razonSocial: negocio.nombre,
        ncf: r.ncfVenta || 'B0200000001', fecha: r.fecha.replace(/-/g, ''),
        monto: v.ventasNetas, itbis: v.itbisCobrado, itbisRetenido: 0, tipoBienes: '01'
      };
    });
    if (!ventas.length) return { success: false, message: 'No hay ventas registradas' };
    const resp = await fetch(DGII_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generar607', data: { ventas, periodo: getMesActual() }, entorno: 'TesteCF' })
    });
    return await resp.json();
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// === ENVIAR FACTURA e-CF A DGII ===
async function enviarFacturaECF(datosFactura) {
  try {
    const negocio = await getConfig('negocio');
    if (!negocio) return { success: false, message: 'Configura tu negocio primero' };
    const resp = await fetch(DGII_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createFacturaConsumo', entorno: 'TesteCF', validate: false,
        data: {
          rncEmisor: negocio.rnc, razonSocialEmisor: negocio.nombre,
          direccionEmisor: negocio.direccion || 'N/A',
          rncComprador: datosFactura.rncCliente || null,
          razonSocialComprador: datosFactura.nombreCliente || null,
          items: datosFactura.items, tipoPago: datosFactura.tipoPago || 1,
          tipoIngresos: '01', indicadorEnvioDiferido: 1
        }
      })
    });
    return await resp.json();
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// === VALIDAR FACTURA (no envia, solo verifica) ===
async function validarFacturaECF(datosFactura) {
  try {
    const negocio = await getConfig('negocio');
    if (!negocio) return { success: false, message: 'Configura tu negocio primero' };
    const resp = await fetch(DGII_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createFacturaConsumo', entorno: 'TesteCF', validate: true,
        data: {
          rncEmisor: negocio.rnc, razonSocialEmisor: negocio.nombre,
          direccionEmisor: negocio.direccion || 'N/A',
          rncComprador: datosFactura.rncCliente || null,
          razonSocialComprador: datosFactura.nombreCliente || null,
          items: datosFactura.items, tipoPago: datosFactura.tipoPago || 1,
          tipoIngresos: '01', indicadorEnvioDiferido: 1
        }
      })
    });
    return await resp.json();
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// === CONSULTAR e-CF ===
async function consultarECF(eNCF) {
  try {
    const resp = await fetch(DGII_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', entorno: 'TesteCF', data: { eNCF } })
    });
    return await resp.json();
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// === PROBAR CONEXION ===
async function probarConexionDGII() {
  try {
    const resp = await fetch(DGII_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auth', entorno: 'TesteCF' })
    });
    return await resp.json();
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// === INIT ===
async function inicializarSync() {
  const activo = await verificarLicencia();
  if (!activo) { mostrarPantallaBloqueo(); return false; }
  sincronizarDatos();
  return true;
}
