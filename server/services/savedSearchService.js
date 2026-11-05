import { randomUUID } from "node:crypto";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { isAdminUser } from "../utils/entitlements.js";

const ALLOWED_CONFIG_KEYS = new Set([
  "mapLink", "countries", "state", "city", "zip", "businessTypes", "industry", "keyword",
  "radiusMeters", "searchDepth", "leadQuality", "sortBy", "minOpportunityScore", "limit",
  "requireContact", "missingWebsiteOnly"
]);

function cleanConfig(config = {}) {
  const result = {};
  for (const key of ALLOWED_CONFIG_KEYS) {
    if (!(key in config)) continue;
    const value = config[key];
    if (Array.isArray(value)) result[key] = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50);
    else if (typeof value === "boolean") result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "string") result[key] = value.trim().slice(0, 240);
  }
  return result;
}

export class SavedSearchService {
  constructor() {
    this.repository = new FirestoreRepository("savedSearches");
  }

  canAccess(record, user) {
    return Boolean(record && user?.uid && (isAdminUser(user) || String(record.ownerId) === String(user.uid)));
  }

  async list(user) {
    if (!user?.uid) return [];
    const records = await this.repository.list({
      where: isAdminUser(user) ? [] : [{ field: "ownerId", op: "==", value: user.uid }],
      limit: isAdminUser(user) ? 500 : 100,
      orderBy: "updatedAt"
    });
    return records.filter((record) => !record.deletedAt);
  }

  async create(user, { name, config }) {
    const normalizedName = String(name || "").trim().slice(0, 100);
    if (!normalizedName) {
      const error = new Error("A saved search name is required.");
      error.status = 422;
      error.code = "SAVED_SEARCH_NAME_REQUIRED";
      throw error;
    }
    const cleanedConfig = cleanConfig(config);
    return this.repository.create({
      id: randomUUID(),
      ownerId: user.uid,
      name: normalizedName,
      config: cleanedConfig,
      runCount: 0,
      lastRunAt: ""
    });
  }

  async markRun(id, user) {
    const record = await this.repository.findById(id);
    if (!this.canAccess(record, user)) return null;
    return this.repository.upsert(id, {
      ...record,
      runCount: Number(record.runCount || 0) + 1,
      lastRunAt: new Date().toISOString()
    });
  }

  async remove(id, user) {
    const record = await this.repository.findById(id);
    if (!this.canAccess(record, user)) return false;
    // The repository intentionally has no destructive primitive. Marking a
    // record deleted keeps local fallback storage recoverable and allows the
    // Firestore migration to preserve history without exposing it in lists.
    await this.repository.upsert(id, { ...record, deletedAt: new Date().toISOString() });
    return true;
  }
}
