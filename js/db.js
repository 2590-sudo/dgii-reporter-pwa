// Base de datos local IndexedDB — funciona 100% offline
const DB_NAME = 'dgii_reporter';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('registros')) {
        const store = db.createObjectStore('registros', { keyPath: 'id', autoIncrement: true });
        store.createIndex('fecha', 'fecha', { unique: false });
        store.createIndex('mes', 'mes', { unique: false });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardarRegistro(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['registros', 'sync_queue'], 'readwrite');
    tx.objectStore('registros').add(data);
    tx.objectStore('sync_queue').add({ tipo: 'registro', data, timestamp: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getRegistrosMes(mes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('registros', 'readonly');
    const idx = tx.objectStore('registros').index('mes');
    const req = idx.getAll(mes);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getConfig(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readonly');
    const req = tx.objectStore('config').get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => reject(req.error);
  });
}

async function setConfig(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').put({ key, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getRegistroHoy() {
  const db = await openDB();
  const hoy = new Date().toISOString().split('T')[0];
  return new Promise((resolve, reject) => {
    const tx = db.transaction('registros', 'readonly');
    const idx = tx.objectStore('registros').index('fecha');
    const req = idx.getAll(hoy);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
