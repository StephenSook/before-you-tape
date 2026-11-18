export interface TabInfo {
  tabId: number;
  title: string;
  url: string;
  atMs: number;
}

interface ToolbarTab {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
}

interface ToolbarApi {
  open(options: { tabId: number }): Promise<void>;
  setSession(value: { tab: TabInfo | null }): Promise<void>;
  canCapture?(): Promise<boolean>;
}

interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  clear(): Promise<void>;
}

interface ExtensionChrome {
  action: { onClicked: { addListener(listener: (tab: ToolbarTab) => void): void } };
  sidePanel: Pick<ToolbarApi, "open">;
  windows: { getCurrent(): Promise<{ id?: number }> };
  storage: {
    local: StorageArea;
    session: StorageArea;
    onChanged: {
      addListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
      removeListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
    };
  };
}

export function extensionChrome(): ExtensionChrome {
  return (globalThis as typeof globalThis & { chrome: ExtensionChrome }).chrome;
}

export function tabStorageKey(windowId: number): string {
  return `tab:${windowId}`;
}

export function tabInfoFrom(tab: ToolbarTab, nowMs: number): TabInfo | null {
  const { id, url } = tab;
  if (id === undefined || !url || !/^https?:\/\//.test(url)) return null;
  return { tabId: id, title: tab.title ?? "", url, atMs: nowMs };
}

export function onToolbarClick(tab: ToolbarTab, api: ToolbarApi, nowMs: number): void {
  if (tab.id === undefined) return;
  const opened = api.open({ tabId: tab.id });
  const allowed = api.canCapture?.() ?? Promise.resolve(true);
  void Promise.all([opened, allowed]).then(async ([, canCapture]) => {
    if (!canCapture) return;
    await api.setSession({ tab: tabInfoFrom(tab, nowMs) });
  }).catch(() => {
    // Chrome can reject if the clicked tab closes before the panel opens.
  });
}
