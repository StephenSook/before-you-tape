// Whether the page runs on a phone, so the camera opens the back lens and the photo picker opens the camera.
// The browser's own mobile flag wins when it gives one (Chromium); otherwise the user agent names a phone.
export interface NavigatorLike { userAgent: string; userAgentData?: { mobile?: boolean } }

export function isPhoneDevice(nav: NavigatorLike): boolean {
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return /\b(iPhone|iPod)\b/i.test(nav.userAgent) || /\bAndroid\b.*\bMobile\b/i.test(nav.userAgent);
}
