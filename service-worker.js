// service-worker.js

const DB_NAME = 'GlowNotesDB';
const DB_VERSION = 1;
const NOTES_STORE_NAME = 'notes';
const META_STORE_NAME = 'meta';

// Helper function to open IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

// Helper to get all notes
async function getNotes(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([NOTES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(NOTES_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Helper to get a metadata value
async function getMeta(db, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([META_STORE_NAME], 'readonly');
        const store = transaction.objectStore(META_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error);
    });
}

// The main logic for the periodic sync
async function doBackupCheck() {
    console.log('Service Worker: Running daily backup check...');
    try {
        const db = await openDB();
        const notes = await getNotes(db);
        const lastBackupCount = await getMeta(db, 'lastBackupCount');

        console.log(`Current notes: ${notes.length}, Last backup count: ${lastBackupCount}`);

        // Check if new notes have been added since the last backup/check.
        // The check also triggers if lastBackupCount is null (first time running).
        if (notes.length > 0 && (lastBackupCount === null || notes.length > lastBackupCount)) {
            console.log('Service Worker: New notes found! Sending notification.');
            
            const newNotesCount = notes.length - (lastBackupCount || 0);

            self.registration.showNotification('GlowNotes Backup Ready', {
                body: `You've added ${newNotesCount} new note(s). Click here to download your backup.`,
                icon: 'https://placehold.co/192x192/007AFF/FFFFFF?text=GN',
                data: {
                    url: self.location.origin + '/index.html?action=download-backup'
                }
            });
        } else {
            console.log('Service Worker: No new notes to back up.');
        }
    } catch (error) {
        console.error('Service Worker: Error during backup check:', error);
    }
}

// Listener for the periodic sync event
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'daily-backup-check') {
        event.waitUntil(doBackupCheck());
    }
});

// Listener for notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data.url;
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // If the app is already open, focus it and navigate.
            if (clientList.length > 0) {
                let client = clientList.find(c => c.visibilityState === 'visible') || clientList[0];
                client.navigate(urlToOpen).then(c => c.focus());
            } else {
                // If the app is not open, open a new window.
                clients.openWindow(urlToOpen);
            }
        })
    );
});

// Basic install listener to make the SW take control faster
self.addEventListener('install', (event) => {
    self.skipWaiting();
});