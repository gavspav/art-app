/**
 * IndexedDB persistence for timeline audio files.
 * Stores the raw ArrayBuffer + metadata so the waveform can be
 * restored across page reloads without the user re-selecting a file.
 */

const DB_NAME = 'artapp-timeline-audio';
const DB_STORE = 'audioFile';
const DB_VERSION = 1;

const openDB = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
  });

/**
 * Save a File (or Blob) to IndexedDB for later restoration.
 * We store the raw ArrayBuffer + fileName + fileType so we can
 * reconstruct the File object on reload.
 */
export async function saveTimelineAudio(file) {
  try {
    const db = await openDB();
    const arrayBuffer = await file.arrayBuffer();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put(
      {
        arrayBuffer,
        fileName: file.name || 'audio',
        fileType: file.type || 'audio/mpeg',
        savedAt: Date.now(),
      },
      'timeline'
    );
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[timelineAudioStorage] Failed to save:', err);
  }
}

/**
 * Load the stored timeline audio and return a File object,
 * or null if nothing is stored.
 */
export async function loadTimelineAudio() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get('timeline');
    const result = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!result?.arrayBuffer) return null;
    const file = new File([result.arrayBuffer], result.fileName || 'audio', {
      type: result.fileType || 'audio/mpeg',
    });
    return file;
  } catch (err) {
    console.warn('[timelineAudioStorage] Failed to load:', err);
    return null;
  }
}

/**
 * Remove stored timeline audio from IndexedDB.
 */
export async function clearTimelineAudio() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete('timeline');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[timelineAudioStorage] Failed to clear:', err);
  }
}
