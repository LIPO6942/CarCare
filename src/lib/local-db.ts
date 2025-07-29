import { openDB, type IDBPDatabase } from 'idb';
import type { Document } from './types';

const DB_NAME = 'CarCareProDB';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('vehicleId', 'vehicleId', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}


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
    await db.add(STORE_NAME, docData);
}

export async function getLocalDocumentsForVehicle(vehicleId: string): Promise<Document[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('vehicleId');
  const documents = await index.getAll(vehicleId);
  await tx.done;
  return documents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateLocalDocument(id: number, data: Partial<Omit<Document, 'id' | 'fileRecto' | 'fileVerso'>>): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const currentDoc = await store.get(id);
    if (currentDoc) {
        const updatedDoc = { ...currentDoc, ...data };
        await store.put(updatedDoc);
    }
    await tx.done;
}

export async function deleteLocalDocument(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function deleteLocalDocumentsForVehicle(vehicleId: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.store.index('vehicleId');
    let cursor = await index.openCursor(vehicleId);
    while(cursor) {
        cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}
