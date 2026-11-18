import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidUpc, readBarcode } from "./barcode";

describe("the default detector", () => {
  afterEach(() => {
    vi.doUnmock("barcode-detector/ponyfill");
    vi.resetModules();
  });

  it("serves the WebAssembly from our own build, never a CDN", async () => {
    vi.resetModules();
    const prepare = vi.fn();
    const detect = vi.fn().mockResolvedValue([{ rawValue: "036000291452", format: "upc_a" }]);
    vi.doMock("barcode-detector/ponyfill", () => ({
      prepareZXingModule: prepare,
      BarcodeDetector: class { detect = detect; },
    }));
    const fresh = await import("./barcode");

    await expect(fresh.readBarcode(document.createElement("canvas"))).resolves.toBe("036000291452");
    expect(prepare).toHaveBeenCalledTimes(1);
    const locateFile = prepare.mock.calls[0]![0].overrides.locateFile as (path: string, prefix: string) => string;
    const url = locateFile("zxing_reader.wasm", "https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/");
    expect(url).not.toMatch(/jsdelivr|^https?:\/\//);
    expect(url).toMatch(/zxing_reader.*\.wasm/);

    await fresh.readBarcode(document.createElement("canvas"));
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});

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
