import { openDB, type IDBPDatabase } from 'idb';
import type { Document } from './types';

const DB_NAME = 'CarCareProDB';
const DB_VERSION = 2; // Increment version for schema change
const DOC_STORE_NAME = 'documents';
const IMG_STORE_NAME = 'vehicle_images';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            if (!db.objectStoreNames.contains(DOC_STORE_NAME)) {
              const store = db.createObjectStore(DOC_STORE_NAME, {
                keyPath: 'id',
                autoIncrement: true,
              });
              store.createIndex('vehicleId', 'vehicleId', { unique: false });
            }
        }
        if (oldVersion < 2) {
             if (!db.objectStoreNames.contains(IMG_STORE_NAME)) {
                // Use vehicleId as the key path, as it's a unique 1-to-1 relationship
                db.createObjectStore(IMG_STORE_NAME, { keyPath: 'vehicleId' });
            }
        }
      },
    });
  }
  return dbPromise;
}


// --- Document Functions ---

export async function addLocalDocument(
  vehicleId: string,
  files: { recto: File; verso?: File | null },
  documentInfo: Partial<Omit<Document, 'id' | 'fileRecto' | 'fileVerso' | 'createdAt'>>
): Promise<void> {
    const db = await getDb();
    const docData: Omit<Document, 'id'> = {
        vehicleId,
        name: documentInfo.name!,
        type: documentInfo.type!,
        fileRecto: files.recto,
        fileVerso: files.verso || undefined,
        createdAt: new Date().toISOString(),
        invoiceDate: documentInfo.invoiceDate,
        invoiceAmount: documentInfo.invoiceAmount,
    };
    await db.add(DOC_STORE_NAME, docData);
}

export async function getLocalDocumentsForVehicle(vehicleId: string): Promise<Document[]> {
  const db = await getDb();
  const tx = db.transaction(DOC_STORE_NAME, 'readonly');
  const index = tx.store.index('vehicleId');
  const documents = await index.getAll(vehicleId);
  await tx.done;
  return documents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateLocalDocument(id: number, data: Partial<Omit<Document, 'id' | 'fileRecto' | 'fileVerso'>>): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(DOC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(DOC_STORE_NAME);
    const currentDoc = await store.get(id);
    if (currentDoc) {
        const updatedDoc = { ...currentDoc, ...data };
        await store.put(updatedDoc);
    }
    await tx.done;
}

export async function deleteLocalDocument(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(DOC_STORE_NAME, id);
}

export async function deleteLocalDocumentsForVehicle(vehicleId: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(DOC_STORE_NAME, 'readwrite');
    const index = tx.store.index('vehicleId');
    let cursor = await index.openCursor(vehicleId);
    while(cursor) {
        cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}


// --- Vehicle Image Functions ---

export async function saveVehicleImage(vehicleId: string, imageBlob: Blob): Promise<void> {
    const db = await getDb();
    await db.put(IMG_STORE_NAME, { vehicleId, imageBlob });
}

export async function getVehicleImage(vehicleId: string): Promise<Blob | null> {
    const db = await getDb();
    const result = await db.get(IMG_STORE_NAME, vehicleId);
    return result ? result.imageBlob : null;
}

export async function deleteVehicleImage(vehicleId: string): Promise<void> {
    const db = await getDb();
    await db.delete(IMG_STORE_NAME, vehicleId);
}