// Sincronización cada 12 horas con el servidor de control
const SYNC_URL = 'https://dgii-admin-panel.vercel.app/api';
const SYNC_INTERVAL = 12 * 60 * 60 * 1000; // 12 horas en ms

async function verificarLicencia() {
  try {
    const token = await getConfig('token');
    if (!token) return false;

    const lastCheck = await getConfig('last_sync');
    const ahora = Date.now();

    // Si no han pasado 12 horas, usar cache local
    if (lastCheck && (ahora - lastCheck) < SYNC_INTERVAL) {
      const status = await getConfig('license_status');
      return status === 'active';
    }

    // Consultar al servidor
    const resp = await fetch(`${SYNC_URL}/check?token=${token}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!resp.ok) {
      // Sin internet — usar último estado conocido
      const status = await getConfig('license_status');
      return status === 'active';
    }

    const data = await resp.json();
    await setConfig('license_status', data.active ? 'active' : 'suspended');
    await setConfig('last_sync', ahora);
    await setConfig('cliente_info', data.cliente || {});

    return data.active;
  } catch (err) {
    // Sin conexión — usar último estado guardado
    const status = await getConfig('license_status');
    return status === 'active';
  }
}

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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ registros: pendientes })
      });

      // Limpiar queue si subió bien
      const tx2 = db.transaction('sync_queue', 'readwrite');
      tx2.objectStore('sync_queue').clear();
    };
  } catch (e) {
    // Silencioso — se reintenta próxima vez
  }
}

// Verificar al abrir la app
async function inicializarSync() {
  const activo = await verificarLicencia();
  if (!activo) {
    mostrarPantallaBloqueo();
    return false;
  }
  // Intentar sincronizar datos pendientes
  sincronizarDatos();
  return true;
}
