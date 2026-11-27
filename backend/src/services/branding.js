import { z } from "zod";
import { inflateSync } from "node:zlib";
import { SchoolLogo } from "../models/SchoolLogo.js";
import { fail } from "./schoolConfiguration.js";

export const schoolBranding = (school) =>
  school
    ? Object.fromEntries(
        ["name", "logoUrl", "address", "city", "country", "phone", "email"].map(
          (key) => [key, school[key] || ""],
        ),
      )
    : null;
export const localLogoPattern =
  /^\/api\/branding\/schools\/([a-f\d]{24})\/logos\/([a-f\d]{24})$/i;
export async function validateLogoOwner(url, schoolId, session) {
  const match = url.match(localLogoPattern);
  if (
    match &&
    (match[1].toLowerCase() !== String(schoolId).toLowerCase() ||
      !(await SchoolLogo.exists({ _id: match[2], schoolId }).session(session)))
  )
    fail(400, "Choose a logo uploaded for this school.");
}
export const logoInput = z
  .object({
    contentType: z.enum(["image/png", "image/jpeg"]),
    data: z
      .string()
      .min(4)
      .max(349528)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict();
export function decodeLogo(input) {
  const data = Buffer.from(input.data, "base64");
  if (data.length > 256 * 1024) fail(400, "Logo must be at most 256 KiB.");
  let width = 0,
    height = 0;
  if (input.contentType === "image/png") {
    if (
      data.length < 45 ||
      data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      data.readUInt32BE(8) !== 13 ||
      data.toString("ascii", 12, 16) !== "IHDR" ||
      data.subarray(-12).toString("hex") !== "0000000049454e44ae426082"
    )
      fail(400, "Upload a valid PNG or JPEG image.");
    width = data.readUInt32BE(16);
    height = data.readUInt32BE(20);
    if (!width || !height || width > 1024 || height > 1024)
      fail(400, "Use a PNG or JPEG logo no larger than 1024 × 1024 pixels.");
    const compressed = [];
    for (let offset = 8; offset < data.length;) {
      if (offset + 12 > data.length) fail(400, "Invalid PNG image.");
      const length = data.readUInt32BE(offset),
        end = offset + 8 + length;
      if (end + 4 > data.length) fail(400, "Invalid PNG image.");
      let crc = 0xffffffff;
      for (const byte of data.subarray(offset + 4, end)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      if ((crc ^ 0xffffffff) >>> 0 !== data.readUInt32BE(end))
        fail(400, "Invalid PNG checksum.");
      if (data.toString("ascii", offset + 4, offset + 8) === "IDAT")
        compressed.push(data.subarray(offset + 8, end));
      offset = end + 4;
    }
    if (!compressed.length) fail(400, "Invalid PNG image.");
    try {
      inflateSync(Buffer.concat(compressed), {
        maxOutputLength: 16 * 1024 * 1024,
      });
    } catch {
      fail(400, "Invalid or oversized PNG image data.");
    }
  } else {
    if (
      data.length < 4 ||
      data.readUInt16BE(0) !== 0xffd8 ||
      data.readUInt16BE(data.length - 2) !== 0xffd9
    )
      fail(400, "Upload a valid PNG or JPEG image.");
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 0xff) break;
      while (data[offset] === 0xff) offset++;
      if (offset + 3 > data.length) break;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        height = data.readUInt16BE(offset + 3);
        width = data.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (!width || !height || width > 1024 || height > 1024)
    fail(400, "Use a PNG or JPEG logo no larger than 1024 × 1024 pixels.");
  return data;
}
