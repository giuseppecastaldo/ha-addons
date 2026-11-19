"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const POLICY = Object.freeze({
  maxEntries: 128,
  maxBytes: 1024 * 1024,
  maxMessageBytes: 64 * 1024,
  maxFileBytes: 2 * 1024 * 1024,
  ttlMs: 24 * 60 * 60 * 1000,
  sweepMs: 5 * 60 * 1000,
  logIntervalMs: 60 * 1000,
});

/** Keep bounded, private protobuf bytes for Baileys retry requests. */
class SentMessageStore {
  /** Create one store per account; codecs and infrastructure are injectable. */
  constructor({
    directory,
    encode,
    decode,
    normalizeJid,
    clock = Date.now,
    fileSystem = fs,
    logger = console.warn,
    timers = globalThis,
    policy = {},
  }) {
    this.policy = { ...POLICY, ...policy };
    for (const value of Object.values(this.policy)) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error("RETRY_CACHE_POLICY_INVALID");
    }
    if (
      this.policy.maxMessageBytes > this.policy.maxBytes ||
      this.policy.maxBytes > this.policy.maxFileBytes ||
      typeof encode !== "function" ||
      typeof decode !== "function" ||
      typeof normalizeJid !== "function"
    )
      throw new Error("RETRY_CACHE_CONFIG_INVALID");
    this.fs = fileSystem;
    this.clock = clock;
    this.logger = logger;
    this.encode = encode;
    this.decode = decode;
    this.normalizeJid = normalizeJid;
    this.timers = timers;
    this.file = path.join(directory, "sent-messages.json");
    this.records = new Map();
    this.bytes = 0;
    this.closed = false;
    this.logTimes = new Map();
    this.counters = {
      hits: 0,
      misses: 0,
      stored: 0,
      evicted: 0,
      expired: 0,
      errors: 0,
    };
    // Retry storage is optional: a damaged/unwritable cache must not prevent
    // pairing or accepted sends. Keep memory recovery available on disk errors.
    try {
      this.fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      this.load();
    } catch {
      this.records.clear();
      this.bytes = 0;
      this.report("load-failed");
    }
    this.timer = this.timers.setInterval(() => {
      try {
        if (this.prune()) this.persist();
      } catch {
        this.report("retention-failed");
      }
    }, this.policy.sweepMs);
    this.timer.unref?.();
  }

  /** Return a private account-local lookup key without retaining addresses. */
  keyFor(key) {
    if (
      !key ||
      typeof key.id !== "string" ||
      !key.id ||
      key.id.length > 256 ||
      typeof key.remoteJid !== "string" ||
      !key.remoteJid ||
      key.remoteJid.length > 512
    ) {
      throw new Error("RETRY_CACHE_KEY_INVALID");
    }
    const jid = this.normalizeJid(key.remoteJid);
    if (typeof jid !== "string" || !jid)
      throw new Error("RETRY_CACHE_KEY_INVALID");
    return crypto
      .createHash("sha256")
      .update(jid + "\0" + key.id)
      .digest("hex");
  }

  /** Report fixed event codes and bounded aggregate metrics, never payloads. */
  report(event) {
    if (event.endsWith("failed")) this.counters.errors += 1;
    const now = this.clock();
    const previous = this.logTimes.get(event);
    if (
      previous !== undefined &&
      now >= previous &&
      now - previous < this.policy.logIntervalMs
    )
      return;
    this.logTimes.set(event, now);
    try {
      this.logger(
        JSON.stringify({
          event: "whatsapp.retry-cache." + event,
          ...this.stats(),
        }),
      );
    } catch {
      /* Diagnostics must not turn an accepted send into a failed send. */
    }
  }

  /** Return content-free current bounds and cumulative operation counts. */
  stats() {
    return {
      ...this.counters,
      entries: this.records.size,
      bytes: this.bytes,
      closed: this.closed,
    };
  }

  /** Remove one owned record and maintain exact byte accounting. */
  remove(key) {
    const record = this.records.get(key);
    if (!record) return;
    this.bytes -= record.bytes.length;
    this.records.delete(key);
  }

  /** Expire records without renewing their lifetime when they are retried. */
  prune() {
    const now = this.clock();
    let changed = false;
    for (const [key, record] of this.records) {
      if (now < record.savedAt || now - record.savedAt >= this.policy.ttlMs) {
        this.remove(key);
        this.counters.expired += 1;
        changed = true;
      }
    }
    return changed;
  }

  /** Load only a size-bounded, validated file; reject corrupt private state. */
  load() {
    let stat;
    try {
      stat = this.fs.lstatSync(this.file);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw new Error("RETRY_CACHE_READ_FAILED");
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > this.policy.maxFileBytes
    ) {
      throw new Error("RETRY_CACHE_FILE_INVALID");
    }
    let data;
    try {
      data = JSON.parse(this.fs.readFileSync(this.file, "utf8"));
    } catch {
      throw new Error("RETRY_CACHE_FORMAT_INVALID");
    }
    if (
      data.schemaVersion !== 1 ||
      !Array.isArray(data.records) ||
      data.records.length > this.policy.maxEntries
    ) {
      throw new Error("RETRY_CACHE_FORMAT_INVALID");
    }
    for (const record of data.records) {
      if (
        !record ||
        typeof record.key !== "string" ||
        !/^[a-f0-9]{64}$/.test(record.key) ||
        this.records.has(record.key) ||
        !Number.isSafeInteger(record.savedAt) ||
        record.savedAt < 0 ||
        typeof record.data !== "string" ||
        record.data.length > Math.ceil(this.policy.maxMessageBytes / 3) * 4
      ) {
        throw new Error("RETRY_CACHE_RECORD_INVALID");
      }
      const bytes = Buffer.from(record.data, "base64");
      if (
        !bytes.length ||
        bytes.length > this.policy.maxMessageBytes ||
        bytes.toString("base64") !== record.data
      ) {
        throw new Error("RETRY_CACHE_RECORD_INVALID");
      }
      this.records.set(record.key, { savedAt: record.savedAt, bytes });
      this.bytes += bytes.length;
      if (this.bytes > this.policy.maxBytes)
        throw new Error("RETRY_CACHE_LIMIT_EXCEEDED");
    }
    if (this.prune()) this.persist();
  }

  /** Atomically replace a capped snapshot and clean only the owned temp file. */
  persist() {
    const records = Array.from(this.records, ([key, record]) => ({
      key,
      savedAt: record.savedAt,
      data: record.bytes.toString("base64"),
    }));
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, records }));
    if (bytes.length > this.policy.maxFileBytes)
      throw new Error("RETRY_CACHE_LIMIT_EXCEEDED");
    const temporary =
      this.file +
      "." +
      process.pid +
      "." +
      crypto.randomBytes(8).toString("hex") +
      ".tmp";
    let descriptor;
    let owned = false;
    let failure;
    try {
      this.fs.mkdirSync(path.dirname(this.file), {
        recursive: true,
        mode: 0o700,
      });
      descriptor = this.fs.openSync(temporary, "wx", 0o600);
      owned = true;
      this.fs.writeFileSync(descriptor, bytes);
      this.fs.fsyncSync(descriptor);
      this.fs.closeSync(descriptor);
      descriptor = undefined;
      this.fs.renameSync(temporary, this.file);
      owned = false;
    } catch (error) {
      failure = error;
    } finally {
      try {
        if (descriptor !== undefined) this.fs.closeSync(descriptor);
      } catch (error) {
        failure ||= error;
        this.report("cleanup-failed");
      }
      try {
        if (owned) this.fs.unlinkSync(temporary);
      } catch (error) {
        failure ||= error;
        this.report("cleanup-failed");
      }
    }
    if (failure) throw failure;
  }

  /** Record an accepted send; storage failure must never trigger a duplicate send. */
  remember(key, message) {
    if (this.closed) return false;
    try {
      const digest = this.keyFor(key);
      const bytes = Buffer.from(this.encode(message));
      if (!bytes.length || bytes.length > this.policy.maxMessageBytes) {
        this.report("oversized");
        return false;
      }
      this.prune();
      this.remove(digest);
      while (
        this.records.size >= this.policy.maxEntries ||
        this.bytes + bytes.length > this.policy.maxBytes
      ) {
        this.remove(this.records.keys().next().value);
        this.counters.evicted += 1;
      }
      this.records.set(digest, { bytes, savedAt: this.clock() });
      this.bytes += bytes.length;
      this.persist();
      this.counters.stored += 1;
      return true;
    } catch {
      this.report("store-failed");
      return false;
    }
  }

  /** Supply exact protobuf content to Baileys, or an explicit cache miss. */
  getMessage(key) {
    if (this.closed) return undefined;
    try {
      if (this.prune()) {
        try {
          this.persist();
        } catch {
          this.report("retention-failed");
        }
      }
      const record = this.records.get(this.keyFor(key));
      if (!record) {
        this.counters.misses += 1;
        this.report("miss");
        return undefined;
      }
      const message = this.decode(Buffer.from(record.bytes));
      this.counters.hits += 1;
      this.report("hit");
      return message;
    } catch {
      this.report("read-failed");
      return undefined;
    }
  }

  /** Release the single owned retention timer; repeated close is harmless. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.timers.clearInterval(this.timer);
    this.records.clear();
    this.bytes = 0;
  }
}

module.exports = { POLICY, SentMessageStore };
