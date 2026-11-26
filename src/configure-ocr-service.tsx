import {
  Action,
  ActionPanel,
  environment,
  Form,
  Icon,
  Keyboard,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { recognizeImage } from "./ocr/cloud";
import {
  fetchModels,
  findService,
  missingFields,
  ServiceConfig,
  SERVICES,
} from "./ocr/services";
import {
  loadSettings,
  saveServiceSettings,
  SettingsStore,
} from "./ocr/settings";

const CUSTOM_MODEL = "__custom__";
const TEST_TEXT = "cloudocr2026";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function Command() {
  const [store, setStore] = useState<SettingsStore>();
  const [serviceId, setServiceId] = useState("");
  const [config, setConfig] = useState<ServiceConfig>({
    baseUrl: "",
    apiKey: "",
    secretKey: "",
    model: "",
  });
  const [customModel, setCustomModel] = useState(false);
  const [revealKeys, setRevealKeys] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const service = findService(serviceId);
  const update = (patch: Partial<ServiceConfig>) =>
    setConfig((current) => ({ ...current, ...patch }));

  // Fills every field from what was saved for the service, or its defaults.
  const selectService = (id: string, from: SettingsStore) => {
    const preset = findService(id);
    setServiceId(preset.id);
    setConfig(
      from.services[preset.id] ?? {
        baseUrl: preset.baseUrl,
        apiKey: "",
        secretKey: "",
        model: preset.models[0] ?? "",
      },
    );
    setCustomModel(false);
    setShowErrors(false);
  };

  useEffect(() => {
    loadSettings().then((loaded) => {
      setStore(loaded);
      selectService(loaded.active, loaded);
    });
  }, []);

  const baseUrl = useDebounced(config.baseUrl.trim(), 500);
  const apiKey = useDebounced(config.apiKey.trim(), 500);
  const abortable = useRef<AbortController>(null);
  const {
    data: fetchedModels = [],
    isLoading: modelsLoading,
    revalidate: reloadModels,
  } = usePromise(
    (id: string, url: string, key: string) =>
      fetchModels(
        findService(id),
        { baseUrl: url, apiKey: key },
        abortable.current?.signal,
      ),
    [service.id, baseUrl, apiKey],
    {
      execute:
        Boolean(store && service.listModels) &&
        /^https?:\/\/[^<>\s]+$/.test(baseUrl) &&
        Boolean(apiKey || service.apiKeyOptional),
      abortable,
      failureToastOptions: { title: "Could not load models" },
    },
  );

  const current = (): ServiceConfig => ({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    secretKey: config.secretKey.trim(),
    model: config.model.trim(),
  });
  const missing = missingFields(service, current());
  const errorFor = (title: string) =>
    showErrors && missing.includes(title) ? "Required" : undefined;

  const checkComplete = async () => {
    if (missing.length === 0) return true;
    setShowErrors(true);
    await showToast({
      style: Toast.Style.Failure,
      title: `Missing ${missing.join(", ")}`,
    });
    return false;
  };

  const save = async () => {
    if (!(await checkComplete())) return;
    setStore(await saveServiceSettings(service.id, current()));
    await showToast({ style: Toast.Style.Success, title: "Saved" });
  };

  const test = async () => {
    if (!(await checkComplete())) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Testing…",
    });
    const data = await readFile(join(environment.assetsPath, "ocr-test.png"));
    const outcome = await recognizeImage(
      { service, config: current() },
      { data, mime: "image/png" },
    );
    const passed =
      outcome.status === "recognized" &&
      outcome.text.toLowerCase().replace(/\s+/g, "").includes(TEST_TEXT);
    toast.style = passed ? Toast.Style.Success : Toast.Style.Failure;
    toast.title = passed ? "Test passed" : "Test failed";
    toast.message =
      outcome.status === "recognized"
        ? outcome.text
        : outcome.status === "error"
          ? outcome.message
          : "No text recognized";
  };

  if (!store) return <Form isLoading />;

  const models = [
    ...new Set([
      ...service.models,
      ...fetchedModels,
      ...(config.model ? [config.model] : []),
    ]),
  ];
  const manualModel = customModel || !config.model;
  const modelTitle = service.modelTitle ?? "Model";
  const apiKeyTitle = service.apiKeyTitle ?? "API Key";
  const KeyField = revealKeys ? Form.TextField : Form.PasswordField;

  return (
    <Form
      isLoading={modelsLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" icon={Icon.Check} onSubmit={save} />
          <Action
            title="Test Recognition"
            icon={Icon.Bolt}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={test}
          />
          <ActionPanel.Section>
            <Action
              title={revealKeys ? "Hide Keys" : "Show Keys"}
              icon={revealKeys ? Icon.EyeDisabled : Icon.Eye}
              shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
              onAction={() => setRevealKeys(!revealKeys)}
            />
            <Action
              title="Clear Keys"
              icon={Icon.XMarkCircle}
              shortcut={Keyboard.Shortcut.Common.Remove}
              onAction={() => update({ apiKey: "", secretKey: "" })}
            />
            {service.listModels && (
              <Action
                title="Reload Models"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={reloadModels}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="service"
        title="OCR Service"
        value={service.id}
        onChange={(id) => id !== service.id && selectService(id, store)}
      >
        {SERVICES.map((item) => (
          <Form.Dropdown.Item
            key={item.id}
            value={item.id}
            title={item.title}
          />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="baseUrl"
        title="Base URL"
        placeholder="https://example.com/v1"
        value={config.baseUrl}
        error={errorFor("Base URL")}
        onChange={(baseUrl) => update({ baseUrl })}
      />
      <KeyField
        key={`apiKey-${revealKeys}`}
        id="apiKey"
        title={apiKeyTitle}
        placeholder={service.apiKeyOptional ? "Optional" : undefined}
        value={config.apiKey}
        error={errorFor(apiKeyTitle)}
        onChange={(apiKey) => update({ apiKey })}
      />
      {service.secretKeyTitle && (
        <KeyField
          key={`secretKey-${revealKeys}`}
          id="secretKey"
          title={service.secretKeyTitle}
          value={config.secretKey}
          error={errorFor(service.secretKeyTitle)}
          onChange={(secretKey) => update({ secretKey })}
        />
      )}
      <Form.Description text="⌘⇧E Show or hide keys  ·  ⌃X Clear keys" />
      <Form.Dropdown
        id="model"
        title={modelTitle}
        value={manualModel ? CUSTOM_MODEL : config.model}
        isLoading={modelsLoading}
        filtering
        onChange={(value) => {
          if (value === CUSTOM_MODEL) {
            setCustomModel(true);
            return;
          }
          setCustomModel(false);
          update({ model: value });
        }}
      >
        {models.map((id) => (
          <Form.Dropdown.Item key={id} value={id} title={id} />
        ))}
        <Form.Dropdown.Item
          value={CUSTOM_MODEL}
          title="Custom…"
          icon={Icon.Pencil}
        />
      </Form.Dropdown>
      {manualModel && (
        <Form.TextField
          id="customModel"
          title={`${modelTitle} Name`}
          value={config.model}
          error={errorFor(modelTitle)}
          onChange={(model) => update({ model })}
        />
      )}
      <Form.Description text="⌘T Test recognition" />
    </Form>
  );
}
