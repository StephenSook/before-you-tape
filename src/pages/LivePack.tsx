// The Pack page under live config: Remote Config's kill_cloud and model names take effect as soon as they
// change, with no reload. The item-read models are rebuilt only when a model name (main or fallback) changes.
import { useMemo, useSyncExternalStore } from "react";
import type { ItemModels } from "../ai/port";
import type { ConfigSource } from "../config/remoteConfig";
import { PackPage, type PackPageProps } from "./PackPage";

export interface LivePackProps extends Omit<PackPageProps, "models" | "config"> {
  source: ConfigSource;
  makeModels: (cloudModelItem: string, cloudModelItemFallback: string) => ItemModels;
}

export function LivePack({ source, makeModels, ...page }: LivePackProps) {
  const config = useSyncExternalStore(source.subscribe, source.get);
  const models = useMemo(
    () => makeModels(config.cloudModelItem, config.cloudModelItemFallback),
    [makeModels, config.cloudModelItem, config.cloudModelItemFallback],
  );
  return <PackPage {...page} models={models} config={{ killCloud: config.killCloud, secondLook: config.secondLook }} />;
}
