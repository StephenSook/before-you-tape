import { extensionChrome, onToolbarClick, tabStorageKey } from "./tabInfo";

const api = extensionChrome();
const latestClick = new Map<number, symbol>();

api.action.onClicked.addListener((tab) => {
  const { windowId } = tab;
  if (windowId === undefined) return;
  const click = Symbol();
  latestClick.set(windowId, click);
  onToolbarClick(tab, {
    open: (options) => api.sidePanel.open(options),
    canCapture: async () => (await api.storage.local.get(["agreed"])).agreed === true,
    setSession: async ({ tab }) => {
      if (latestClick.get(windowId) === click) await api.storage.session.set({ [tabStorageKey(windowId)]: tab });
    },
  }, Date.now());
});
