import { LocalStorage } from "@raycast/api";
import { findService, missingFields, Service, ServiceConfig } from "./services";

// Settings are kept per service, so switching back restores its keys and model.
export type SettingsStore = {
  active: string;
  services: Record<string, ServiceConfig>;
};

const STORAGE_KEY = "ocr-services";

export async function loadSettings(): Promise<SettingsStore> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  return raw
    ? (JSON.parse(raw) as SettingsStore)
    : { active: "qwen", services: {} };
}

export async function saveServiceSettings(
  serviceId: string,
  config: ServiceConfig,
): Promise<SettingsStore> {
  const store = await loadSettings();
  const next: SettingsStore = {
    active: serviceId,
    services: { ...store.services, [serviceId]: config },
  };
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export type ActiveService = { service: Service; config: ServiceConfig };

// The saved service, or undefined when it is not fully set up.
export async function loadActiveService(): Promise<ActiveService | undefined> {
  const store = await loadSettings();
  const config = store.services[store.active];
  if (!config) return undefined;
  const service = findService(store.active);
  return missingFields(service, config).length === 0
    ? { service, config }
    : undefined;
}
