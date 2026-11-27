import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { School } from "../src/models/School.js";
import { SchoolLogo } from "../src/models/SchoolLogo.js";
import { User } from "../src/models/User.js";
import { blankDocument } from "../src/services/documents.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "branding-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  school,
  other,
  admin,
  foreign,
  pending,
  teacher,
  student,
  logoUrl,
  png;
const cookie = (user) =>
  `dev_bigi_session=${jwt.sign({ version: 0 }, config.JWT_SECRET, { subject: user.id, issuer: "dev-bigi", audience: "dev-bigi-web", expiresIn: "1h" })}`;
const write = (user, method, path, body) => {
  const client = request(app);
  return client[method](path)
    .set("Cookie", cookie(user))
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body);
};
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, bytes, checksum]);
}
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all([School, SchoolLogo, User].map((m) => m.init()));
    const passwordHash = await bcrypt.hash("Branding-password-123!", 4);
    const owner = await User.create({
      name: "Owner",
      email: "owner@branding.test",
      role: "super_admin",
      passwordHash,
    });
    school = await School.create({
      name: "Branding School",
      city: "Lagos",
      country: "Nigeria",
      address: "1 School Road",
      phone: "08012345678",
      email: "school@example.test",
      schoolType: "Primary",
      createdBy: owner._id,
    });
    other = await School.create({
      name: "Other School",
      city: "Abuja",
      country: "Nigeria",
      schoolType: "Primary",
      createdBy: owner._id,
    });
    [admin, foreign, pending] = await User.create([
      {
        name: "Admin",
        email: "admin@branding.test",
        role: "school_admin",
        schoolId: school.id,
        passwordHash,
      },
      {
        name: "Foreign",
        email: "foreign@branding.test",
        role: "school_admin",
        schoolId: other.id,
        passwordHash,
      },
      {
        name: "Pending",
        email: "pending@branding.test",
        role: "school_admin",
        schoolId: school.id,
        passwordHash,
        mustChangePassword: true,
      },
    ]);
    // Only identity endpoints are exercised for these roles; no academic fixtures needed.
    const staffId = new mongoose.Types.ObjectId(),
      studentId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection("staffs").insertOne({
      _id: staffId,
      schoolId: school._id,
      category: "teaching",
      status: "active",
      classIds: [],
      subjectIds: [],
    });
    await mongoose.connection
      .collection("students")
      .insertOne({ _id: studentId, schoolId: school._id, status: "active" });
    teacher = await User.create({
      name: "Teacher",
      email: "teacher@branding.test",
      role: "teacher",
      schoolId: school.id,
      staffId,
      passwordHash,
    });
    student = await User.create({
      name: "Student",
      email: "student@branding.test",
      role: "student",
      schoolId: school.id,
      studentId,
      passwordHash,
    });
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    png = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(Buffer.from([0, 40, 80, 120, 255]))),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    app = createApp(config);
  },
  { timeout: 90000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("public school branding exposes only deliberate identity fields without account data", async () => {
  const r = await request(app)
    .get(`/api/branding/schools/${school.id}`)
    .expect(200);
  assert.deepEqual(
    Object.keys(r.body.school).sort(),
    ["name", "logoUrl", "address", "city", "country", "phone", "email"].sort(),
  );
  assert.equal(r.body.school.name, school.name);
  await request(app).get("/api/branding/schools/invalid").expect(400);
  await request(app)
    .get(`/api/branding/schools/${school.id}?schoolId=${other.id}`)
    .expect(400);
});
test("login branding is scoped to selected school and authenticated school is authoritative", async () => {
  const r = await request(app)
    .post("/api/auth/school-login")
    .set("Origin", config.FRONTEND_ORIGIN)
    .send({
      email: admin.email,
      password: "Branding-password-123!",
      schoolId: school.id,
    })
    .expect(200);
  assert.equal(r.body.school.name, school.name);
  await request(app)
    .post("/api/auth/school-login")
    .set("Origin", config.FRONTEND_ORIGIN)
    .send({
      email: admin.email,
      password: "Branding-password-123!",
      schoolId: other.id,
    })
    .expect(401);
  for (const user of [admin, foreign, pending, teacher, student]) {
    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie(user))
      .expect(200);
    assert.equal(
      me.body.school.name,
      user.id === foreign.id ? other.name : school.name,
    );
  }
});
test("administrator uploads a local PNG and the exact bytes are available without external services", async () => {
  const r = await write(admin, "post", "/api/school/profile/logo", {
    contentType: "image/png",
    data: png.toString("base64"),
  }).expect(201);
  logoUrl = r.body.profile.logoUrl;
  assert.match(
    logoUrl,
    new RegExp(`^/api/branding/schools/${school.id}/logos/[a-f0-9]{24}$`),
  );
  const logo = await request(app)
    .get(logoUrl)
    .expect(200)
    .expect("Content-Type", /image\/png/)
    .expect("X-Content-Type-Options", "nosniff");
  assert.deepEqual(logo.body, png);
  assert.equal(logo.headers["cache-control"], "no-store");
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", cookie(admin))).body
      .school.logoUrl,
    logoUrl,
  );
  assert.equal(
    (await SchoolLogo.findOne({ schoolId: school.id })).data,
    undefined,
  );
});
test("uploads reject active content, MIME spoofing, corruption, oversize images and ownership injection", async () => {
  for (const body of [
    {
      contentType: "image/svg+xml",
      data: Buffer.from('<svg onload="alert(1)"/>').toString("base64"),
    },
    {
      contentType: "image/png",
      data: Buffer.from("<html>not an image</html>").toString("base64"),
    },
    { contentType: "image/jpeg", data: png.toString("base64") },
    {
      contentType: "image/png",
      data: png.toString("base64"),
      schoolId: other.id,
    },
    {
      contentType: "image/png",
      data: Buffer.alloc(256 * 1024 + 1).toString("base64"),
    },
  ])
    await write(admin, "post", "/api/school/profile/logo", body).expect(400);
  const corrupt = Buffer.from(png);
  corrupt[35] ^= 1;
  await write(admin, "post", "/api/school/profile/logo", {
    contentType: "image/png",
    data: corrupt.toString("base64"),
  }).expect(400);
  const huge = Buffer.from(png);
  huge.writeUInt32BE(10000, 16);
  await write(admin, "post", "/api/school/profile/logo", {
    contentType: "image/png",
    data: huge.toString("base64"),
  }).expect(400);
  await write(admin, "post", "/api/school/profile/logo", {
    contentType: "image/png",
    data: "!invalid!",
  }).expect(400);
});
test("logo mutations require administrator role, password setup, authentication and trusted origin", async () => {
  const body = { contentType: "image/png", data: png.toString("base64") };
  for (const user of [teacher, student, pending])
    await write(user, "post", "/api/school/profile/logo", body).expect(403);
  await request(app)
    .post("/api/school/profile/logo")
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body)
    .expect(401);
  await request(app)
    .post("/api/school/profile/logo")
    .set("Cookie", cookie(admin))
    .send(body)
    .expect(403);
});
test("local logo paths cannot be reassigned across schools or used with another school ID", async () => {
  await request(app).get(logoUrl.replace(school.id, other.id)).expect(404);
  const p = (
    await request(app).get("/api/school/profile").set("Cookie", cookie(foreign))
  ).body.profile;
  await write(foreign, "put", "/api/school/profile", { ...p, logoUrl }).expect(
    400,
  );
  await write(admin, "put", "/api/school/profile", {
    ...(
      await request(app).get("/api/school/profile").set("Cookie", cookie(admin))
    ).body.profile,
    logoUrl: logoUrl.replace(
      /[^/]+$/,
      new mongoose.Types.ObjectId().toString(),
    ),
  }).expect(400);
  assert.equal(await SchoolLogo.countDocuments({ schoolId: other.id }), 0);
});
test("logo replacement and removal preserve immutable document branding and previous image bytes", async () => {
  const original = blankDocument(await School.findById(school.id));
  const r = await write(admin, "post", "/api/school/profile/logo", {
    contentType: "image/png",
    data: png.toString("base64"),
  }).expect(201);
  assert.notEqual(r.body.profile.logoUrl, logoUrl);
  assert.equal(original.school.logoUrl, logoUrl);
  await write(admin, "put", "/api/school/profile", {
    ...r.body.profile,
    logoUrl: "",
  }).expect(200);
  assert.deepEqual((await request(app).get(logoUrl).expect(200)).body, png);
  assert.equal((await School.findById(school.id)).logoUrl, "");
});
test("suspended schools expose neither public branding nor logo bytes and cannot upload", async () => {
  await School.updateOne({ _id: school.id }, { $set: { status: "suspended" } });
  try {
    await request(app).get(`/api/branding/schools/${school.id}`).expect(404);
    await request(app).get(logoUrl).expect(404);
    await write(admin, "post", "/api/school/profile/logo", {
      contentType: "image/png",
      data: png.toString("base64"),
    }).expect(403);
  } finally {
    await School.updateOne({ _id: school.id }, { $set: { status: "active" } });
  }
});
