const DB_NAME = 'correos-db';
const DB_VERSION = 1;
const STORE_NAME = 'emails';
const ACTIVE_KEY = 'correoActiveId';

let dbPromise;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('templateId', 'templateId', { unique: false });
        store.createIndex('recipientKey', 'recipientKey', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function txStore(db, mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function allFromIndex(index) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const request = index.openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(rows); return; }
      rows.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sin-destinatario';
}

function buildRecipientKey(email) {
  if (email.recipientEmail) return `email-${normalizeText(email.recipientEmail)}`;
  return `name-${normalizeText(email.recipientName)}`;
}

export async function saveEmail(email, existingId = null) {
  const db = await openDatabase();
  const now = new Date().toISOString();
  const id = existingId || crypto.randomUUID();

  const record = {
    id,
    subject: email.subject || 'Sin asunto',
    recipientEmail: email.recipientEmail || '',
    recipientName: email.recipientName || '',
    templateId: email.templateId || 'general',
    recipientKey: buildRecipientKey(email),
    createdAt: now,
    updatedAt: now,
    email,
  };

  // Preserve createdAt if updating
  if (existingId) {
    const store = txStore(db, 'readonly');
    const existing = await promisify(store.get(existingId));
    if (existing) record.createdAt = existing.createdAt;
  }

  const store = txStore(db, 'readwrite');
  await promisify(store.put(record));
  localStorage.setItem(ACTIVE_KEY, id);
  return record;
}

export async function listEmails() {
  const db = await openDatabase();
  const store = txStore(db, 'readonly');
  const index = store.index('updatedAt');
  return allFromIndex(index);
}

export async function getEmailRecord(id) {
  const db = await openDatabase();
  const store = txStore(db, 'readonly');
  return promisify(store.get(id));
}

export async function getActiveEmailRecord() {
  const id = localStorage.getItem(ACTIVE_KEY);
  if (!id) return null;
  return getEmailRecord(id);
}

export async function deleteEmail(id) {
  const db = await openDatabase();
  const store = txStore(db, 'readwrite');
  await promisify(store.delete(id));
  if (localStorage.getItem(ACTIVE_KEY) === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function setActiveEmailId(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}
