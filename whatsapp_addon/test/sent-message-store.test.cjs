"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const v8 = require("node:v8");
const { EventEmitter } = require("node:events");
const { test, afterEach } = require("node:test");
const { SentMessageStore } = require("../sent-message-store.cjs");

const ROOT = path.join(__dirname, ".tmp");
const SOURCE = path.resolve(__dirname, "../whatsapp.js");
const directories = [];
const stores = [];

/** Allocate only test-owned directories in this development worktree. */
function temporaryDirectory() {
  fs.mkdirSync(ROOT, { recursive: true });
  const directory = fs.mkdtempSync(path.join(ROOT, "case-"));
  directories.push(directory);
  return directory;
}

/** Create a cache with deterministic time and content-free captured diagnostics. */
function fixture(options = {}) {
  const directory = options.directory || temporaryDirectory();
  const logs = [];
  const now = { value: 1000000 };
  const store = new SentMessageStore({
    directory,
    encode: Buffer.from,
    decode: (bytes) => bytes.toString("utf8"),
    normalizeJid: (jid) => jid.replace(/:\d+@/, "@"),
    clock: () => now.value,
    logger: (line) => logs.push(line),
    ...options,
  });
  stores.push(store);
  return { store, directory, logs, now };
}

/** Supply a synthetic retry key, never a real account or message identifier. */
function key(id = "test-message", jid = "user@example.test") {
  return { id, remoteJid: jid };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) {
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(ROOT + path.sep));
    fs.rmSync(absolute, { recursive: true, force: true });
  }
});

test("cache returns exact binary content and survives close/reopen", () => {
  const bytes = Buffer.from([0, 255, 1, 128, 0, 10]);
  const a = fixture({ decode: (value) => value });
  assert.equal(a.store.remember(key(), bytes), true);
  const retrieved = a.store.getMessage(key());
  assert.deepEqual(retrieved, bytes);
  retrieved[0] = 99;
  assert.deepEqual(a.store.getMessage(key()), bytes);
  a.store.close();
  const b = fixture({ directory: a.directory, decode: (value) => value });
  assert.deepEqual(b.store.getMessage(key()), bytes);
});

test("lookup is isolated by recipient and account while normalizing device addresses", () => {
  const a = fixture();
  const b = fixture();
  a.store.remember(key("id", "user:2@example.test"), "original");
  assert.equal(a.store.getMessage(key("id", "user@example.test")), "original");
  assert.equal(a.store.getMessage(key("id", "other@example.test")), undefined);
  assert.equal(b.store.getMessage(key("id", "user@example.test")), undefined);
});

test("a miss returns undefined rather than an empty fabricated message", () => {
  const { store } = fixture();
  assert.equal(store.getMessage(key()), undefined);
  assert.equal(store.stats().misses, 1);
});

test("reads do not renew TTL and idle retention persists expiry", () => {
  let sweep;
  let unrefs = 0;
  let clears = 0;
  const timers = {
    setInterval(callback) {
      sweep = callback;
      return {
        unref() {
          unrefs++;
        },
      };
    },
    clearInterval() {
      clears++;
    },
  };
  const { store, now, directory } = fixture({ policy: { ttlMs: 100 }, timers });
  store.remember(key(), "message");
  now.value += 99;
  assert.equal(store.getMessage(key()), "message");
  now.value += 1;
  sweep();
  assert.equal(store.getMessage(key()), undefined);
  assert.equal(JSON.parse(fs.readFileSync(store.file)).records.length, 0);
  store.close();
  store.close();
  assert.equal(unrefs, 1);
  assert.equal(clears, 1);
  assert.equal(fixture({ directory }).store.stats().entries, 0);
});

test("unwritable storage keeps accepted content available in memory", () => {
  const fake = Object.create(fs);
  fake.mkdirSync = () => {
    throw new Error("PRIVATE DIRECTORY FAILURE");
  };
  const { store, logs } = fixture({ fileSystem: fake });
  assert.equal(store.stats().errors, 1);
  assert.equal(store.remember(key(), "accepted message"), false);
  assert.equal(store.getMessage(key()), "accepted message");
  assert.ok(!logs.join("").includes("PRIVATE"));
});

test("expiry write failures do not block retry of a still-valid message", () => {
  const fake = Object.create(fs);
  const { store, now } = fixture({ fileSystem: fake, policy: { ttlMs: 100 } });
  store.remember(key("expired"), "old");
  now.value += 50;
  store.remember(key("valid"), "new");
  now.value += 50;
  fake.renameSync = () => {
    throw new Error("PRIVATE RENAME FAILURE");
  };
  assert.equal(store.getMessage(key("valid")), "new");
  assert.equal(store.getMessage(key("expired")), undefined);
  assert.equal(store.stats().errors, 1);
});

test(
  "cache creates private directory and snapshot permissions on POSIX",
  {
    skip:
      process.platform === "win32"
        ? "Windows does not implement POSIX modes"
        : false,
  },
  () => {
    const directory = path.join(temporaryDirectory(), "private-cache");
    const { store } = fixture({ directory });
    store.remember(key(), "synthetic");
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
  },
);

test("oldest entries are evicted at count and total-byte bounds", () => {
  const { store } = fixture({
    policy: { maxEntries: 2, maxBytes: 6, maxMessageBytes: 4 },
  });
  store.remember(key("a"), "aa");
  store.remember(key("b"), "bb");
  store.remember(key("c"), "cccc");
  assert.equal(store.getMessage(key("a")), undefined);
  assert.equal(store.getMessage(key("b")), "bb");
  assert.equal(store.getMessage(key("c")), "cccc");
  assert.equal(store.stats().bytes, 6);
  store.remember(key("c"), "c");
  assert.equal(store.stats().bytes, 3);
  assert.equal(store.stats().entries, 2);
});

test("oversized and invalid entries preserve admitted data without throwing", () => {
  const { store } = fixture({ policy: { maxMessageBytes: 4 } });
  assert.equal(store.remember(key(), "kept"), true);
  assert.equal(store.remember(key(), "oversized"), false);
  assert.equal(store.remember({}, "bad"), false);
  assert.equal(store.getMessage(null), undefined);
  assert.equal(store.getMessage(key()), "kept");
});

test("restart removes expired data and discards corrupt, oversized and symlink cache files", () => {
  const a = fixture({ policy: { ttlMs: 100 } });
  a.store.remember(key(), "expired");
  a.store.close();
  const b = fixture({ directory: a.directory, clock: () => a.now.value + 100 });
  // Reopen with the same explicit TTL as the original instance.
  b.store.close();
  const c = fixture({
    directory: a.directory,
    clock: () => a.now.value + 100,
    policy: { ttlMs: 100 },
  });
  assert.equal(c.store.getMessage(key()), undefined);
  c.store.close();
  fs.writeFileSync(c.store.file, "{bad json");
  const corrupt = fixture({ directory: a.directory });
  assert.equal(corrupt.store.stats().entries, 0);
  assert.equal(corrupt.store.stats().errors, 1);
  corrupt.store.close();
  fs.writeFileSync(c.store.file, "x".repeat(64));
  const oversized = fixture({
    directory: a.directory,
    policy: { maxFileBytes: 32, maxBytes: 16, maxMessageBytes: 8 },
  });
  assert.equal(oversized.store.stats().entries, 0);
  assert.equal(oversized.store.stats().errors, 1);
  oversized.store.close();
  const fake = Object.create(fs);
  fake.lstatSync = () => ({
    isFile: () => false,
    isSymbolicLink: () => true,
    size: 10,
  });
  const symlink = fixture({ directory: a.directory, fileSystem: fake });
  assert.equal(symlink.store.stats().entries, 0);
  assert.equal(symlink.store.stats().errors, 1);
});

test("failed atomic replacement retains the prior file, closes descriptors and removes owned temp files", () => {
  const a = fixture();
  a.store.remember(key("old"), "old");
  a.store.close();
  const prior = fs.readFileSync(a.store.file);
  const fake = Object.create(fs);
  let open = 0;
  fake.openSync = (...args) => {
    const fd = fs.openSync(...args);
    open++;
    return fd;
  };
  fake.closeSync = (fd) => {
    fs.closeSync(fd);
    open--;
  };
  fake.renameSync = () => {
    throw new Error("SYNTHETIC SECRET ERROR");
  };
  const b = fixture({ directory: a.directory, fileSystem: fake });
  assert.equal(b.store.remember(key("new"), "new"), false);
  assert.equal(b.store.getMessage(key("new")), "new");
  assert.deepEqual(fs.readFileSync(a.store.file), prior);
  assert.deepEqual(fs.readdirSync(a.directory), ["sent-messages.json"]);
  assert.equal(open, 0);
  assert.equal(b.store.stats().errors, 1);
  assert.ok(!b.logs.join("").includes("SYNTHETIC SECRET ERROR"));
});

test("diagnostics are rate-limited and exclude content, keys and addresses", () => {
  const { store, logs } = fixture();
  store.remember(
    key("PRIVATE-ID", "PRIVATE-ADDRESS@example.test"),
    "PRIVATE-CONTENT",
  );
  for (let i = 0; i < 100; i++) {
    store.getMessage(key("PRIVATE-ID", "PRIVATE-ADDRESS@example.test"));
    store.getMessage(key("missing-" + i));
  }
  assert.equal(logs.length, 2);
  assert.equal(store.stats().hits, 100);
  assert.equal(store.stats().misses, 100);
  assert.ok(!logs.join("").includes("PRIVATE"));
  assert.ok(!fs.readFileSync(store.file, "utf8").includes("PRIVATE-ADDRESS"));
});

test("default upper limits bound memory payload and on-disk bytes across reload", () => {
  const a = fixture({ decode: (bytes) => bytes });
  const payload = Buffer.alloc(a.store.policy.maxMessageBytes, 65);
  for (let index = 0; index < 17; index++)
    assert.equal(a.store.remember(key("full-" + index), payload), true);
  assert.equal(a.store.stats().bytes, a.store.policy.maxBytes);
  assert.ok(fs.statSync(a.store.file).size <= a.store.policy.maxFileBytes);
  assert.equal(
    a.store.remember(key("too-large"), Buffer.alloc(payload.length + 1)),
    false,
  );
  a.store.close();
  const b = fixture({ directory: a.directory, decode: (bytes) => bytes });
  assert.equal(b.store.getMessage(key("full-0")), undefined);
  assert.deepEqual(b.store.getMessage(key("full-16")), payload);
  assert.equal(b.store.stats().bytes, b.store.policy.maxBytes);
});

test("write and decode failures remain private and close partial file resources", () => {
  const directory = temporaryDirectory();
  const fake = Object.create(fs);
  let open = 0;
  fake.openSync = (...args) => {
    const fd = fs.openSync(...args);
    open++;
    return fd;
  };
  fake.closeSync = (fd) => {
    fs.closeSync(fd);
    open--;
  };
  fake.writeFileSync = () => {
    throw new Error("PRIVATE WRITE FAILURE");
  };
  const a = fixture({
    directory,
    fileSystem: fake,
    decode() {
      throw new Error("PRIVATE DECODE FAILURE");
    },
  });
  assert.equal(a.store.remember(key(), "message"), false);
  assert.equal(open, 0);
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.equal(a.store.getMessage(key()), undefined);
  assert.ok(!a.logs.join("").includes("PRIVATE"));
});

test("repeated sends plateau at configured cache bounds and retain no temp files", () => {
  const { store, directory } = fixture({
    policy: { maxEntries: 16, maxBytes: 2048, maxMessageBytes: 128 },
  });
  let warmedSize;
  for (let i = 0; i < 160; i++) {
    assert.equal(store.remember(key("message-" + i), "x".repeat(64)), true);
    assert.ok(store.stats().entries <= 16);
    assert.ok(store.stats().bytes <= 2048);
    if (i === 31) warmedSize = fs.statSync(store.file).size;
  }
  assert.equal(fs.statSync(store.file).size, warmedSize);
  assert.deepEqual(fs.readdirSync(directory), ["sent-messages.json"]);
  assert.equal(store.stats().stored, 160);
  assert.equal(store.stats().evicted, 144);
  store.close();
  assert.equal(store.stats().entries, 0);
  assert.equal(store.getMessage(key("message-159")), undefined);
  assert.equal(store.remember(key(), "closed"), false);
});

test("add-on supplies exact sent content to getMessage and retains its accepted response", async () => {
  const sockets = [];
  const response = {
    key: key("SYNTHETIC-ID", "123@s.whatsapp.net"),
    message: { conversation: "SYNTHETIC", blob: Buffer.from([0, 255]) },
  };
  const wire = {
    Message: {
      encode: (message) => ({ finish: () => v8.serialize(message) }),
      decode: v8.deserialize,
    },
  };
  const originalStore = SentMessageStore;
  const directory = temporaryDirectory();
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console,
    Buffer,
    setInterval: () => ({ unref() {} }),
    clearInterval() {},
    setTimeout: () => ({ unref() {} }),
    require(name) {
      if (name === "eventemitter2") return EventEmitter;
      if (name === "pino") return () => ({});
      if (name === "./sent-message-store.cjs")
        return {
          SentMessageStore: class extends originalStore {
            constructor(options) {
              super({ ...options, directory, logger() {} });
              stores.push(this);
            }
          },
        };
      if (name === "./Baileys")
        return {
          proto: wire,
          jidNormalizedUser: (jid) => jid.replace(/:\d+@/, "@"),
          DisconnectReason: { loggedOut: 401 },
          fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
          useMultiFileAuthState: async () => ({
            state: {
              creds: {
                me: { id: "123:8@s.whatsapp.net", lid: "own-alias:8@lid" },
              },
            },
            saveCreds() {},
          }),
          default(options) {
            const socket = {
              options,
              ev: new EventEmitter(),
              onWhatsApp: async () => [true],
              sendPresenceUpdate: async () => {},
              sendMessage: async () => response,
              end() {
                socket.ev.emit("connection.update", {
                  connection: "close",
                  lastDisconnect: {},
                });
              },
            };
            sockets.push(socket);
            return socket;
          },
        };
      throw new Error("Unexpected import " + name);
    },
  };
  vm.runInNewContext(fs.readFileSync(SOURCE, "utf8"), sandbox);
  const client = new module.exports.WhatsappClient({ path: directory });
  await new Promise(setImmediate);
  sockets[0].ev.emit("connection.update", { connection: "open" });
  assert.equal(
    await client.sendMessage("user@example.test", { text: "SYNTHETIC" }),
    response,
  );
  assert.deepEqual(
    sockets[0].options.getMessage(response.key),
    response.message,
  );
  assert.deepEqual(
    sockets[0].options.getMessage({
      ...response.key,
      remoteJid: "own-alias:0@lid",
    }),
    response.message,
  );
  assert.equal(
    sockets[0].options.getMessage({
      ...response.key,
      remoteJid: "someone-else@lid",
    }),
    undefined,
  );
  assert.equal(
    sockets[0].options.getMessage({
      ...response.key,
      remoteJid: "999@s.whatsapp.net",
    }),
    undefined,
  );
  assert.equal(
    sockets[0].options.getMessage({ ...response.key, id: "OLD-NOT-CACHED" }),
    undefined,
  );
  const currentStore = stores[stores.length - 1];
  const failingFs = Object.create(fs);
  failingFs.renameSync = () => {
    throw new Error("PRIVATE CACHE FAILURE");
  };
  currentStore.fs = failingFs;
  assert.equal(
    await client.sendMessage("user@example.test", { text: "SYNTHETIC" }),
    response,
  );
  assert.deepEqual(
    sockets[0].options.getMessage(response.key),
    response.message,
  );
  currentStore.fs = fs;
  sockets[0].ev.emit("creds.update", {
    me: { id: "123:8@s.whatsapp.net", lid: "new-own-alias@lid" },
  });
  assert.deepEqual(
    sockets[0].options.getMessage({
      ...response.key,
      remoteJid: "new-own-alias@lid",
    }),
    response.message,
  );
  assert.equal(
    sockets[0].options.getMessage({
      ...response.key,
      remoteJid: "own-alias@lid",
    }),
    undefined,
  );
  client.restart();
  await client.connect();
  sockets[1].ev.emit("connection.update", { connection: "open" });
  assert.deepEqual(
    sockets[1].options.getMessage(response.key),
    response.message,
  );
  assert.deepEqual(
    sockets[1].options.getMessage({
      ...response.key,
      remoteJid: "own-alias@lid",
    }),
    response.message,
  );
  client.disconnect(false);
  assert.equal(stores[stores.length - 1].stats().closed, true);
  const nextClient = new module.exports.WhatsappClient({ path: directory });
  await new Promise(setImmediate);
  sockets[2].ev.emit("connection.update", { connection: "open" });
  assert.deepEqual(
    sockets[2].options.getMessage(response.key),
    response.message,
  );
  sockets[2].ev.emit("connection.update", {
    connection: "close",
    lastDisconnect: { error: { output: { statusCode: 401 } } },
  });
  assert.equal(stores[stores.length - 1].stats().closed, true);
  assert.ok(nextClient);
  const finalClient = new module.exports.WhatsappClient({
    path: directory,
    attempts: -1,
  });
  await new Promise(setImmediate);
  sockets[3].ev.emit("connection.update", {
    connection: "close",
    lastDisconnect: {},
  });
  assert.equal(stores[stores.length - 1].stats().closed, true);
  assert.ok(finalClient);
});
