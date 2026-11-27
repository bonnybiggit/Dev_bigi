import fs from "node:fs";
import { promises as fsp } from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import mongoose from "mongoose";
import { fail } from "./schoolConfiguration.js";

const { serialize, deserialize } = mongoose.mongo.BSON;
const derive = promisify(scrypt);
const magic = Buffer.from("SCHOOLBK1\n");
const maximumFrame = 20 * 1024 * 1024;
const maximumExpanded = 100 * 1024 * 1024 * 1024;
const keyFor = (password, salt) =>
  derive(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
export function passwordCheck(password) {
  if (
    typeof password !== "string" ||
    password.length < 16 ||
    Buffer.byteLength(password) > 256
  )
    fail(
      400,
      "Use a recovery passphrase of at least 16 characters and at most 256 UTF-8 bytes.",
    );
}
const frame = (value) => {
  const bytes = serialize(value);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
};
export async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
const safeName = (name) =>
  typeof name === "string" &&
  name.length > 0 &&
  name.length < 200 &&
  !name.includes("\0") &&
  !name.startsWith("system.");
export async function exportArchive(db, client, file, password, metadata) {
  passwordCheck(password);
  const collections = (
    await db.listCollections({}, { nameOnly: false }).toArray()
  )
    .filter((c) => !c.name.startsWith("system."))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (
    collections.some(
      (c) =>
        c.type !== "collection" ||
        c.options.timeseries ||
        c.options.capped ||
        !safeName(c.name),
    )
  )
    fail(
      409,
      "This installation contains an unsupported view/time-series/capped namespace; no incomplete backup was created.",
    );
  const descriptors = [];
  for (const c of collections)
    descriptors.push({
      name: c.name,
      options: c.options,
      indexes: await db.collection(c.name).listIndexes().toArray(),
    });
  const header = Buffer.concat([magic, randomBytes(16), randomBytes(12)]);
  const key = await keyFor(
    password,
    header.subarray(magic.length, magic.length + 16),
  );
  const cipher = createCipheriv("aes-256-gcm", key, header.subarray(-12));
  cipher.setAAD(header);
  key.fill(0);
  await fsp.writeFile(file, header, { flag: "wx", mode: 0o600 });
  const manifest = {
    version: 1,
    createdAt: new Date(),
    ...metadata,
    collections: [],
  };
  const session = client.startSession();
  async function* frames() {
    session.startTransaction({ readConcern: { level: "snapshot" } });
    let completed = false;
    try {
      const schools = await db
        .collection("schools")
        .find({}, { session, projection: { _id: 1, name: 1 } })
        .sort({ _id: 1 })
        .toArray();
      manifest.schools = schools.map((s) => ({
        id: String(s._id),
        name: s.name,
      }));
      yield frame({
        kind: "manifest",
        manifest: { ...manifest, collections: undefined },
      });
      for (const descriptor of descriptors) {
        yield frame({ kind: "collection", descriptor });
        const hash = createHash("sha256");
        let count = 0;
        const cursor = db
          .collection(descriptor.name)
          .find({}, { session, raw: true })
          .sort({ _id: 1 });
        for await (const data of cursor) {
          if (!Buffer.isBuffer(data))
            throw new Error("Driver did not supply lossless BSON records.");
          hash.update(data);
          count++;
          yield frame({ kind: "document", data });
        }
        const entry = {
          name: descriptor.name,
          count,
          sha256: hash.digest("hex"),
        };
        manifest.collections.push(entry);
        yield frame({ kind: "endCollection", ...entry });
      }
      yield frame({ kind: "end", collections: manifest.collections });
      await session.commitTransaction();
      completed = true;
    } finally {
      if (!completed && session.inTransaction())
        await session.abortTransaction();
    }
  }
  try {
    await pipeline(
      Readable.from(frames()),
      createGzip(),
      cipher,
      fs.createWriteStream(file, { flags: "a" }),
    );
    await fsp.appendFile(file, cipher.getAuthTag());
    return {
      manifest,
      sha256: await fileHash(file),
      bytes: (await fsp.stat(file)).size,
    };
  } catch (error) {
    await fsp.unlink(file).catch(() => {});
    throw error;
  } finally {
    await session.endSession();
  }
}

async function* decodeFrames(file, password) {
  passwordCheck(password);
  const handle = await fsp.open(file, "r");
  let header, tag, size;
  try {
    size = (await handle.stat()).size;
    if (size < magic.length + 28 + 16 || size > 100 * 1024 * 1024 * 1024)
      fail(400, "Invalid backup size.");
    header = Buffer.alloc(magic.length + 28);
    tag = Buffer.alloc(16);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, magic.length).equals(magic))
    fail(400, "Unsupported backup format.");
  const key = await keyFor(
    password,
    header.subarray(magic.length, magic.length + 16),
  );
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(-12));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  key.fill(0);
  const input = fs.createReadStream(file, {
    start: header.length,
    end: size - 17,
  });
  const output = createGunzip();
  const pumping = pipeline(input, decipher, output);
  pumping.catch(() => {});
  let buffered = Buffer.alloc(0),
    expanded = 0;
  try {
    for await (const bytes of output) {
      expanded += bytes.length;
      if (expanded > maximumExpanded)
        fail(400, "Expanded backup exceeds the 100 GiB safety limit.");
      buffered = Buffer.concat([buffered, bytes]);
      while (buffered.length >= 4) {
        const length = buffered.readUInt32BE(0);
        if (length < 5 || length > maximumFrame)
          fail(400, "Invalid backup frame.");
        if (buffered.length < length + 4) break;
        yield deserialize(buffered.subarray(4, length + 4), {
          promoteBuffers: true,
        });
        buffered = buffered.subarray(length + 4);
      }
    }
    await pumping;
    if (buffered.length) fail(400, "Truncated backup frame.");
  } finally {
    input.destroy();
    decipher.destroy();
    output.destroy();
    await pumping.catch(() => {});
  }
}
export async function inspectArchive(file, password, onFrame = async () => {}) {
  let manifest,
    current,
    hash,
    count = 0,
    ended = false;
  const inventory = [],
    names = new Set();
  try {
    for await (const entry of decodeFrames(file, password)) {
      if (ended) fail(400, "Data follows the final backup manifest.");
      if (!manifest) {
        if (
          entry.kind !== "manifest" ||
          entry.manifest?.version !== 1 ||
          !Array.isArray(entry.manifest.schools)
        )
          fail(400, "Invalid backup manifest.");
        manifest = entry.manifest;
        if (
          manifest.schools.some(
            (s) => !/^[a-f\d]{24}$/i.test(s.id) || typeof s.name !== "string",
          ) ||
          new Set(manifest.schools.map((s) => s.id)).size !==
            manifest.schools.length
        )
          fail(400, "Invalid school identity manifest.");
      } else if (entry.kind === "collection") {
        if (
          current ||
          !safeName(entry.descriptor?.name) ||
          names.has(entry.descriptor.name) ||
          !Array.isArray(entry.descriptor.indexes)
        )
          fail(400, "Invalid collection inventory.");
        current = entry.descriptor.name;
        names.add(current);
        hash = createHash("sha256");
        count = 0;
      } else if (entry.kind === "document") {
        if (!current || !Buffer.isBuffer(entry.data))
          fail(400, "Document outside collection.");
        // Validate BSON now, before any restoration writes are allowed.
        deserialize(entry.data, { promoteValues: false });
        hash.update(entry.data);
        count++;
      } else if (entry.kind === "endCollection") {
        if (
          !current ||
          entry.name !== current ||
          entry.count !== count ||
          entry.sha256 !== hash.digest("hex")
        )
          fail(400, "Collection checksum/count mismatch.");
        inventory.push({ name: current, count, sha256: entry.sha256 });
        current = null;
      } else if (entry.kind === "end") {
        if (
          current ||
          JSON.stringify(entry.collections) !== JSON.stringify(inventory)
        )
          fail(400, "Backup inventory mismatch.");
        ended = true;
      } else fail(400, "Unexpected backup record.");
      await onFrame(entry);
    }
    if (!manifest || !ended) fail(400, "Incomplete backup.");
    return { ...manifest, collections: inventory };
  } catch (error) {
    if (error.status) throw error;
    fail(
      400,
      "Backup integrity verification failed or the recovery passphrase is incorrect.",
    );
  }
}

export async function restoreArchive(file, password, target) {
  let current,
    batch = [],
    batchBytes = 0;
  const flush = async () => {
    if (batch.length) {
      await target
        .collection(current)
        .insertMany(batch, { ordered: true, bypassDocumentValidation: true });
      batch = [];
      batchBytes = 0;
    }
  };
  const indexes = [];
  const manifest = await inspectArchive(file, password, async (entry) => {
    if (entry.kind === "collection") {
      current = entry.descriptor.name;
      await target.createCollection(current, entry.descriptor.options || {});
      indexes.push({ name: current, indexes: entry.descriptor.indexes });
    } else if (entry.kind === "document") {
      if (batchBytes + entry.data.length > 8 * 1024 * 1024) await flush();
      batch.push(deserialize(entry.data, { promoteValues: false }));
      batchBytes += entry.data.length;
      if (batch.length >= 200) await flush();
    } else if (entry.kind === "endCollection") await flush();
  });
  for (const item of indexes) {
    const definitions = item.indexes
      .filter((i) => i.name !== "_id_")
      .map((i) => {
        const copy = { ...i };
        delete copy.v;
        delete copy.ns;
        return copy;
      });
    if (definitions.length)
      await target.collection(item.name).createIndexes(definitions);
  }
  // Read back all BSON bytes and counts, not merely the inserted counts.
  for (const collection of manifest.collections) {
    const hash = createHash("sha256");
    let count = 0;
    for await (const data of target
      .collection(collection.name)
      .find({}, { raw: true })
      .sort({ _id: 1 })) {
      hash.update(data);
      count++;
    }
    if (count !== collection.count || hash.digest("hex") !== collection.sha256)
      fail(
        409,
        "Restored record checksum verification failed. Recovery database has not been activated.",
      );
  }
  const actual = await target
    .collection("schools")
    .find({}, { projection: { _id: 1, name: 1 } })
    .sort({ _id: 1 })
    .toArray();
  if (
    JSON.stringify(actual.map((s) => ({ id: String(s._id), name: s.name }))) !==
    JSON.stringify(manifest.schools)
  )
    fail(409, "Restored school identity does not match the archive.");
  return manifest;
}
