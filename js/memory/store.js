const DB_NAME = 'anton';
const DB_VERSION = 2;
const SETTINGS_STORE = 'settings';
const HISTORY_STORE = 'history';
const API_KEY_ID = 'groq_api_key';
const STORED_HISTORY_LIMIT = 200;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getApiKey() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const req = tx.objectStore(SETTINGS_STORE).get(API_KEY_ID);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function setApiKey(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).put(key, API_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearApiKey() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).delete(API_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addMessage(role, content) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    tx.objectStore(HISTORY_STORE).add({ role, content, ts: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await trimHistory(db);
}

export async function getHistory() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readonly');
    const req = tx.objectStore(HISTORY_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearHistory() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    tx.objectStore(HISTORY_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function trimHistory(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - STORED_HISTORY_LIMIT;
      if (excess <= 0) return;
      let deleted = 0;
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && deleted < excess) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
