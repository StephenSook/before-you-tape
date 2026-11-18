/**
 * A barcode is a hint for the customs worksheet only. It never changes a verdict.
 */

type DetectBarcode = (image: ImageBitmapSource) => Promise<{ rawValue: string; format: string }[]>;

export function isValidUpc(code: string): boolean {
  if (![8, 12, 13].includes(code.length) || /[^0-9]/.test(code)) return false;

  let sum = 0;
  for (let offset = 0; offset < code.length; offset += 1) {
    const digit = Number(code.charAt(code.length - 1 - offset));
    const weight = offset % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  return sum % 10 === 0;
}

async function detectBarcode(image: ImageBitmapSource) {
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  const detector = new BarcodeDetector({ formats: ["upc_a", "ean_13", "ean_8"] });
  return detector.detect(image);
}

export async function readBarcode(
  image: ImageBitmapSource,
  detect: DetectBarcode = detectBarcode,
): Promise<string | null> {
  try {
    const barcodes = await detect(image);
    return barcodes.find(({ rawValue }) => isValidUpc(rawValue))?.rawValue ?? null;
  } catch {
    return null;
  }
}
