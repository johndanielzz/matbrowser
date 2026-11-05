import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { firestoreClient } from "../config/firebase.js";

const memoryStore = new Map();
const storeDir = process.env.VERCEL ? "/tmp" : process.cwd();
const localStorePath = path.resolve(storeDir, process.env.LOCAL_DATA_FILE || "data/local-store.json");
let localStoreLoaded = false;
let localStoreWriteQueue = Promise.resolve();

function collectionStore(name) {
  if (!memoryStore.has(name)) memoryStore.set(name, new Map());
  return memoryStore.get(name);
}

async function loadLocalStore() {
  if (localStoreLoaded) return;
  localStoreLoaded = true;

  try {
    const raw = await fs.readFile(localStorePath, "utf8");
    const parsed = JSON.parse(raw);
    for (const [collection, records] of Object.entries(parsed.collections || {})) {
      collectionStore(collection).clear();
      for (const record of Array.isArray(records) ? records : []) {
        if (record?.id) collectionStore(collection).set(record.id, record);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function localStorePayload() {
  return {
    updatedAt: new Date().toISOString(),
    collections: Object.fromEntries([...memoryStore.entries()].map(([collection, records]) => [
      collection,
      [...records.values()]
    ]))
  };
}

async function persistLocalStore() {
  if (process.env.VERCEL) return;
  const payload = JSON.stringify(localStorePayload(), null, 2);
  const directory = path.dirname(localStorePath);
  const tempPath = `${localStorePath}.${process.pid}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, localStorePath);
}

async function queueLocalStorePersist() {
  if (process.env.VERCEL) return;
  localStoreWriteQueue = localStoreWriteQueue.then(persistLocalStore, persistLocalStore);
  return localStoreWriteQueue;
}

function applyWhere(items, where = []) {
  return items.filter((item) => where.every(({ field, op, value }) => {
    if (op !== "==") return true;
    return item[field] === value;
  }));
}

export class FirestoreRepository {
  constructor(collectionName) {
    this.collectionName = collectionName;
  }

  client() {
    return firestoreClient();
  }

  async create(data) {
    const id = data.id || randomUUID();
    const now = new Date().toISOString();
    const payload = { ...data, id, createdAt: data.createdAt || now, updatedAt: now };

    const client = this.client();
    if (client) {
      return client.set(this.collectionName, id, payload);
    }

    await loadLocalStore();
    collectionStore(this.collectionName).set(id, payload);
    await queueLocalStorePersist();
    return payload;
  }

  async upsert(id, data) {
    const now = new Date().toISOString();
    const existing = await this.findById(id);
    const payload = { ...(existing || {}), ...data, id, updatedAt: now, createdAt: existing?.createdAt || now };

    const client = this.client();
    if (client) {
      return client.set(this.collectionName, id, payload);
    }

    await loadLocalStore();
    collectionStore(this.collectionName).set(id, payload);
    await queueLocalStorePersist();
    return payload;
  }

  /**
   * Persist a set of records as one local-store write. Lead searches can
   * return up to 200 records; calling upsert for each one previously queued
   * a full JSON rewrite per record, which could make an otherwise successful
   * search exceed the HTTP deadline before the browser received its results.
   */
  async upsertMany(records = []) {
    const entries = records
      .map((record) => ({ id: String(record?.id || "").trim(), data: record?.data }))
      .filter(({ id, data }) => id && data && typeof data === "object");
    if (!entries.length) return [];

    const client = this.client();
    if (client) {
      const now = new Date().toISOString();
      return Promise.all(entries.map(async ({ id, data }) => {
        const existing = await client.get(this.collectionName, id);
        const payload = { ...(existing || {}), ...data, id, updatedAt: now, createdAt: existing?.createdAt || now };
        return client.set(this.collectionName, id, payload);
      }));
    }

    await loadLocalStore();
    const recordsById = collectionStore(this.collectionName);
    const now = new Date().toISOString();
    const saved = entries.map(({ id, data }) => {
      const existing = recordsById.get(id);
      const payload = { ...(existing || {}), ...data, id, updatedAt: now, createdAt: existing?.createdAt || now };
      recordsById.set(id, payload);
      return payload;
    });
    await queueLocalStorePersist();
    return saved;
  }

  async findById(id) {
    const client = this.client();
    if (client) {
      return client.get(this.collectionName, id);
    }

    await loadLocalStore();
    return collectionStore(this.collectionName).get(id) || null;
  }

  async list({ where = [], limit = 50, orderBy = "updatedAt" } = {}) {
    const client = this.client();
    if (client) {
      const items = await client.list(this.collectionName, { limit: Math.max(limit, 100) });
      return applyWhere(items, where)
        .sort((a, b) => String(b[orderBy] || "").localeCompare(String(a[orderBy] || "")))
        .slice(0, limit);
    }

    await loadLocalStore();
    const items = Array.from(collectionStore(this.collectionName).values());
    return applyWhere(items, where)
      .sort((a, b) => String(b[orderBy] || "").localeCompare(String(a[orderBy] || "")))
      .slice(0, limit);
  }

  async update(id, data) {
    const existing = await this.findById(id);
    if (!existing) return null;
    return this.upsert(id, { ...existing, ...data });
  }
}
