import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Record, RecordError, normalizeToken } from "./models.js";

export class Storage {
  constructor(filePath) {
    this.path = path.resolve(filePath);
    this._records = new Map();
    this._writing = Promise.resolve();
    this._load();
  }

  _load() {
    if (!fs.existsSync(this.path)) return;
    const raw = JSON.parse(fs.readFileSync(this.path, "utf8"));
    for (const entry of raw.records ?? []) {
      const record = Record.fromJSON(entry);
      this._records.set(record.token, record);
    }
  }

  async _flush() {
    const payload = {
      records: [...this._records.values()]
        .sort((a, b) => a.token.localeCompare(b.token))
        .map((r) => r.toJSON()),
    };
    const dir = path.dirname(this.path);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.exprsndns-${process.pid}-${Date.now()}.tmp`);
    await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fsp.rename(tmp, this.path);
  }

  _serialize(work) {
    const next = this._writing.then(work, work);
    this._writing = next.catch(() => {});
    return next;
  }

  get(token) {
    return this._records.get(normalizeToken(token)) ?? null;
  }

  list() {
    return [...this._records.values()];
  }

  get size() {
    return this._records.size;
  }

  async create(record) {
    if (this._records.has(record.token)) {
      throw new RecordError(`token already registered: ${record.token}`);
    }
    this._records.set(record.token, record);
    await this._serialize(() => this._flush());
    return record;
  }

  async upsert(record) {
    const existing = this._records.get(record.token);
    if (existing) {
      record.createdAt = existing.createdAt;
      record.ownerId = record.ownerId ?? existing.ownerId;
      record.certificateId = record.certificateId ?? existing.certificateId;
    }
    record.touch();
    this._records.set(record.token, record);
    await this._serialize(() => this._flush());
    return record;
  }

  async delete(token) {
    const key = normalizeToken(token);
    if (!this._records.has(key)) return false;
    this._records.delete(key);
    await this._serialize(() => this._flush());
    return true;
  }
}
