// ══ VALIDACIÓN DE TOKENS LOCAL (sin servidor) ═══════════
// Mismo algoritmo criptográfico que el panel admin
const SALT = "DGRD$2026xK9";
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function validarFormatoToken(token) {
  if (!token) return false;
  const clean = token.replace(/-/g, '').toUpperCase().trim();
  // Token formato DGRD-XXXX-XXXX-XXXX (16 chars sin guiones)
  if (clean.length !== 16 || !clean.startsWith('DGRD')) return false;
  const body = clean.substring(4, 12);
  const check = clean.substring(12, 16);
  let hash = 0;
  const str = body + SALT;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  hash = Math.abs(hash) % 9999;
  return String(hash).padStart(4, '0') === check;
}

async function verificarLicencia() {
  try {
    const token = await getConfig('token');
    if (!token) return false;

    // Verificar si el token fue marcado como suspendido localmente
    const status = await getConfig('license_status');
    if (status === 'suspended') return false;

    // Validación criptográfica local — no requiere servidor
    const valido = validarFormatoToken(token);
    if (valido) {
      await setConfig('license_status', 'active');
      return true;
    }

    return false;
  } catch (err) {
    // Error de DB — permitir si hay token guardado
    return true;
  }
}

// Función para suspender localmente (cuando el admin lo requiera)
async function suspenderLicenciaLocal() {
  await setConfig('license_status', 'suspended');
}

// Intentar sincronizar estado con servidor (silencioso, no bloquea)
async function sincronizarConServidor() {
  try {
    const token = await getConfig('token');
    if (!token) return;

    const lastCheck = await getConfig('last_sync');
    const ahora = Date.now();
    const SYNC_INTERVAL = 12 * 60 * 60 * 1000; // 12 horas

    if (lastCheck && (ahora - lastCheck) < SYNC_INTERVAL) return;

    // Intentar con el servidor (si está disponible)
    const resp = await fetch(`https://dgii-admin-panel.vercel.app/api/check?token=${token}`, {
      signal: AbortSignal.timeout(5000) // timeout 5 segundos
    });

    if (resp.ok) {
      const data = await resp.json();
      await setConfig('license_status', data.active ? 'active' : 'suspended');
      await setConfig('last_sync', ahora);
    }
  } catch (e) {
    // Sin internet o sin servidor — no hacer nada, validación local ya pasó
  }
}

async function inicializarSync() {
  const activo = await verificarLicencia();
  if (!activo) return false;
  // Sync en background sin bloquear
  sincronizarConServidor();
  return true;
}
