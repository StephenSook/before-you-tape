import { describe, expect, it } from "vitest";
import { isValidUpc, readBarcode } from "./barcode";

describe("isValidUpc", () => {
  it.each(["036000291452", "4006381333931", "96385074"])(
    "accepts %s with a valid check digit",
    (code) => expect(isValidUpc(code)).toBe(true),
  );

  it.each(["036000291453", "abc", "03600029145 2", "", "0000000", "0000000\n"])(
    "rejects %j",
    (code) => expect(isValidUpc(code)).toBe(false),
  );
});

describe("readBarcode", () => {
  const img = document.createElement("canvas");

  it("returns the first value with a valid check digit", async () => {
    await expect(readBarcode(img, async () => [
      { rawValue: "036000291453", format: "upc_a" },
      { rawValue: "036000291452", format: "upc_a" },
    ])).resolves.toBe("036000291452");
  });

  it("returns null when the detector finds nothing", async () => {
    await expect(readBarcode(img, async () => [])).resolves.toBeNull();
  });

  it("returns null when detection fails", async () => {
    await expect(readBarcode(img, async () => {
      throw new Error("Detection failed");
    })).resolves.toBeNull();
  });
});
