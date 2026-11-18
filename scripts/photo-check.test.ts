import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jpegMetadataBlocks } from "./photo-check";

// A JPEG is FFD8, then segments FFxx with a two-byte length, up to the image data.
const seg = (marker: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
const jpeg = (...segments: Buffer[]) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, Buffer.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])]);
const jfif = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));

describe("jpegMetadataBlocks", () => {
  it("finds no metadata in a plain JPEG", () => expect(jpegMetadataBlocks(jpeg(jfif))).toEqual([]));

  it("finds Exif, XMP and IPTC blocks", () => {
    const exif = seg(0xe1, Buffer.from("Exif\0\0MM\0*", "latin1"));
    const xmp = seg(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>", "latin1"));
    const iptc = seg(0xed, Buffer.from("Photoshop 3.0\0", "latin1"));
    expect(jpegMetadataBlocks(jpeg(jfif, exif, xmp, iptc))).toEqual(["Exif", "XMP", "IPTC"]);
  });

  it("finds a comment block, which can carry a name", () =>
    expect(jpegMetadataBlocks(jpeg(jfif, seg(0xfe, Buffer.from("Taken by someone", "latin1"))))).toEqual(["Comment"]));

  it("refuses a file that is not a JPEG", () => expect(() => jpegMetadataBlocks(Buffer.from("not a jpeg"))).toThrow(/not a JPEG/));

  it("reads a real JPEG from the repository", () => expect(jpegMetadataBlocks(readFileSync("tests/e2e/fixtures/lotion-label.jpg"))).toEqual([]));
});
