import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { createHash, createHmac } from "node:crypto";

const REQUEST_TIMEOUT_MS = 60_000;

export type ServiceConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  secretKey: string;
};

export type Image = { data: Buffer; mime: string };

const trimSlash = (url: string) => url.trim().replace(/\/+$/, "");
const dataUri = (image: Image) =>
  `data:${image.mime};base64,${image.data.toString("base64")}`;

type Json = Record<string, unknown> | undefined;

// Every provider names its error message differently.
function errorDetail(body: Json): string | undefined {
  const b = body as {
    error?: string | { message?: string };
    error_msg?: string;
    error_description?: string;
    message?: string;
    detail?: string;
    Response?: { Error?: { Message?: string } };
  };
  if (typeof b?.error === "string") return b.error_description ?? b.error;
  return (
    b?.error?.message ??
    b?.error_msg ??
    b?.Response?.Error?.Message ??
    b?.message ??
    b?.detail
  );
}

async function request(url: string, init: RequestInit): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "The OCR service did not respond in time."
        : "Could not reach the OCR service. Check the Base URL and your network.",
    );
  }
  const body = (await response.json().catch(() => undefined)) as Json;
  const detail = errorDetail(body);
  if (!response.ok) {
    throw new Error(
      `OCR error ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return body;
}

const postJson = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
) =>
  request(url, {
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const bearer = (apiKey: string): Record<string, string> =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

function ocrPrompt(): string {
  const { customWordsList } = getPreferenceValues<Preferences>();
  const lines = [
    "Extract all text from this image exactly as it appears.",
    "Keep the original language, reading order and line breaks.",
    "Output only the extracted text, with no explanation, translation or Markdown code fences.",
    "If the image contains no text, output nothing.",
  ];
  const words = (customWordsList ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length > 0) {
    lines.push(`These terms may appear in the image: ${words.join(", ")}.`);
  }
  return lines.join("\n");
}

// Dedicated OCR models expect their own short task prompt; any other vision
// model gets the full instruction.
function promptFor(model: string): string {
  if (/deepseek-ocr/i.test(model)) return "Free OCR.";
  if (/paddleocr/i.test(model)) return "OCR:";
  if (/glm-ocr/i.test(model)) return "Text Recognition:";
  return ocrPrompt();
}

// OpenAI-compatible /chat/completions.
async function chat(config: ServiceConfig, image: Image): Promise<string> {
  const body = await postJson(
    `${trimSlash(config.baseUrl)}/chat/completions`,
    bearer(config.apiKey),
    {
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri(image) } },
            { type: "text", text: promptFor(config.model) },
          ],
        },
      ],
    },
  );
  const content = (body as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("The OCR service returned no text.");
  }
  return content;
}

async function mistral(config: ServiceConfig, image: Image): Promise<string> {
  const body = await postJson(
    `${trimSlash(config.baseUrl)}/ocr`,
    bearer(config.apiKey),
    {
      model: config.model,
      document: { type: "image_url", image_url: dataUri(image) },
      include_image_base64: false,
    },
  );
  const pages = (body as { pages?: { markdown?: string }[] })?.pages ?? [];
  return pages
    .map((page) => page.markdown ?? "")
    .join("\n\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "");
}

async function zhipu(config: ServiceConfig, image: Image): Promise<string> {
  const body = await postJson(
    `${trimSlash(config.baseUrl)}/layout_parsing`,
    bearer(config.apiKey),
    { model: config.model, file: dataUri(image) },
  );
  return (body as { md_results?: string })?.md_results ?? "";
}

// Model selects the feature: DOCUMENT_TEXT_DETECTION or TEXT_DETECTION.
async function google(config: ServiceConfig, image: Image): Promise<string> {
  const body = await postJson(
    `${trimSlash(config.baseUrl)}/images:annotate`,
    { "X-goog-api-key": config.apiKey },
    {
      requests: [
        {
          image: { content: image.data.toString("base64") },
          features: [{ type: config.model }],
        },
      ],
    },
  );
  const result = (
    body as {
      responses?: {
        fullTextAnnotation?: { text?: string };
        error?: { message?: string };
      }[];
    }
  )?.responses?.[0];
  if (result?.error?.message) throw new Error(result.error.message);
  return result?.fullTextAnnotation?.text ?? "";
}

// Azure AI Vision Image Analysis 4.0, synchronous Read. Takes raw bytes.
async function azure(config: ServiceConfig, image: Image): Promise<string> {
  const body = await request(
    `${trimSlash(config.baseUrl)}/computervision/imageanalysis:analyze?features=read&api-version=${encodeURIComponent(config.model)}`,
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Ocp-Apim-Subscription-Key": config.apiKey,
      },
      body: new Uint8Array(image.data),
    },
  );
  const blocks =
    (body as { readResult?: { blocks?: { lines?: { text?: string }[] }[] } })
      ?.readResult?.blocks ?? [];
  return blocks
    .flatMap((block) => block.lines ?? [])
    .map((line) => line.text ?? "")
    .join("\n");
}

// Baidu issues 30-day access tokens; cache them per API key.
async function baiduToken(config: ServiceConfig, refresh: boolean) {
  const cacheKey = `baidu-token:${createHash("sha256").update(config.apiKey).digest("hex")}`;
  if (!refresh) {
    const cached = await LocalStorage.getItem<string>(cacheKey);
    if (cached) {
      const { token, expiresAt } = JSON.parse(cached) as {
        token: string;
        expiresAt: number;
      };
      if (Date.now() < expiresAt) return token;
    }
  }
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.apiKey,
    client_secret: config.secretKey,
  });
  const body = (await request(
    `https://aip.baidubce.com/oauth/2.0/token?${params}`,
    {},
  )) as { access_token?: string; expires_in?: number } | undefined;
  if (!body?.access_token)
    throw new Error("Baidu did not return an access token.");
  const expiresAt = Date.now() + ((body.expires_in ?? 86_400) - 3_600) * 1000;
  await LocalStorage.setItem(
    cacheKey,
    JSON.stringify({ token: body.access_token, expiresAt }),
  );
  return body.access_token;
}

// Model is the endpoint name: accurate_basic or general_basic.
async function baidu(config: ServiceConfig, image: Image): Promise<string> {
  const call = async (refresh: boolean) => {
    const token = await baiduToken(config, refresh);
    return (await request(
      `${trimSlash(config.baseUrl)}/${config.model}?access_token=${encodeURIComponent(token)}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ image: image.data.toString("base64") }),
      },
    )) as
      | {
          error_code?: number;
          error_msg?: string;
          words_result?: { words?: string }[];
        }
      | undefined;
  };
  let body = await call(false);
  // 110/111: token invalid or expired.
  if (body?.error_code === 110 || body?.error_code === 111)
    body = await call(true);
  if (body?.error_code)
    throw new Error(`OCR error ${body.error_code}: ${body.error_msg}`);
  return (body?.words_result ?? []).map((line) => line.words ?? "").join("\n");
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();

// Tencent Cloud API v3 signature (TC3-HMAC-SHA256).
export function tencentAuthorization(
  secretId: string,
  secretKey: string,
  host: string,
  payload: string,
  timestamp: number,
) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const service = host.split(".")[0];
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:application/json; charset=utf-8\nhost:${host}\n`,
    "content-type;host",
    sha256(payload),
  ].join("\n");
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(`TC3${secretKey}`, date), service),
    "tc3_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  return `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`;
}

// Model is the API action: GeneralAccurateOCR or GeneralBasicOCR.
async function tencent(config: ServiceConfig, image: Image): Promise<string> {
  const url = new URL(trimSlash(config.baseUrl));
  const payload = JSON.stringify({
    ImageBase64: image.data.toString("base64"),
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const body = (await request(url.href, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: tencentAuthorization(
        config.apiKey,
        config.secretKey,
        url.host,
        payload,
        timestamp,
      ),
      "X-TC-Action": config.model,
      "X-TC-Version": "2018-11-19",
      "X-TC-Timestamp": String(timestamp),
    },
    body: payload,
  })) as
    | {
        Response?: {
          Error?: { Message?: string };
          TextDetections?: { DetectedText?: string }[];
        };
      }
    | undefined;
  if (body?.Response?.Error) {
    throw new Error(`OCR error: ${body.Response.Error.Message}`);
  }
  return (body?.Response?.TextDetections ?? [])
    .map((line) => line.DetectedText ?? "")
    .join("\n");
}

export type Service = {
  id: string;
  title: string;
  baseUrl: string;
  // Suggested models; the first is the default.
  models: string[];
  modelTitle?: string;
  apiKeyTitle?: string;
  apiKeyOptional?: boolean;
  // Set when the service needs a second credential.
  secretKeyTitle?: string;
  // Load more models from GET {baseUrl}/models, keeping only OCR models
  // unless "all".
  listModels?: "ocr" | "all";
  recognize: (config: ServiceConfig, image: Image) => Promise<string>;
};

export const SERVICES: Service[] = [
  {
    id: "qwen",
    title: "Qwen-OCR · Alibaba Cloud",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-vl-ocr", "qwen3.5-ocr"],
    listModels: "ocr",
    recognize: chat,
  },
  {
    id: "qwen-intl",
    title: "Qwen-OCR · Alibaba Cloud International",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-vl-ocr", "qwen3.5-ocr"],
    listModels: "ocr",
    recognize: chat,
  },
  {
    id: "siliconflow",
    title: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: ["deepseek-ai/DeepSeek-OCR", "PaddlePaddle/PaddleOCR-VL-1.5"],
    listModels: "ocr",
    recognize: chat,
  },
  {
    id: "mistral",
    title: "Mistral OCR",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-ocr-latest", "mistral-ocr-4-1"],
    listModels: "ocr",
    recognize: mistral,
  },
  {
    id: "zhipu",
    title: "GLM-OCR · Zhipu AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-ocr"],
    recognize: zhipu,
  },
  {
    id: "zai",
    title: "GLM-OCR · Z.ai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    models: ["glm-ocr"],
    recognize: zhipu,
  },
  {
    id: "ollama",
    title: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    models: ["glm-ocr", "deepseek-ocr"],
    apiKeyOptional: true,
    listModels: "ocr",
    recognize: chat,
  },
  {
    id: "google",
    title: "Google Cloud Vision",
    baseUrl: "https://vision.googleapis.com/v1",
    models: ["DOCUMENT_TEXT_DETECTION", "TEXT_DETECTION"],
    modelTitle: "Feature",
    recognize: google,
  },
  {
    id: "azure",
    title: "Azure AI Vision",
    baseUrl: "https://<resource>.cognitiveservices.azure.com",
    models: ["2024-02-01"],
    modelTitle: "API Version",
    recognize: azure,
  },
  {
    id: "baidu",
    title: "Baidu OCR",
    baseUrl: "https://aip.baidubce.com/rest/2.0/ocr/v1",
    models: ["accurate_basic", "general_basic"],
    modelTitle: "Endpoint",
    secretKeyTitle: "Secret Key",
    recognize: baidu,
  },
  {
    id: "tencent",
    title: "Tencent Cloud OCR",
    baseUrl: "https://ocr.tencentcloudapi.com",
    models: ["GeneralAccurateOCR", "GeneralBasicOCR"],
    modelTitle: "Action",
    apiKeyTitle: "SecretId",
    secretKeyTitle: "SecretKey",
    recognize: tencent,
  },
  {
    id: "custom",
    title: "Custom (OpenAI-compatible)",
    baseUrl: "",
    models: [],
    apiKeyOptional: true,
    listModels: "all",
    recognize: chat,
  },
];

export const findService = (id: string): Service =>
  SERVICES.find((service) => service.id === id) ?? SERVICES[0];

// Returns what is still missing before the service can be used.
export function missingFields(service: Service, config: ServiceConfig) {
  const missing: string[] = [];
  if (!/^https?:\/\/[^<>\s]+$/.test(config.baseUrl)) missing.push("Base URL");
  if (!config.apiKey && !service.apiKeyOptional) {
    missing.push(service.apiKeyTitle ?? "API Key");
  }
  if (service.secretKeyTitle && !config.secretKey) {
    missing.push(service.secretKeyTitle);
  }
  if (!config.model) missing.push(service.modelTitle ?? "Model");
  return missing;
}

// Lists model IDs from an OpenAI-compatible /models endpoint.
export async function fetchModels(
  service: Service,
  config: Pick<ServiceConfig, "baseUrl" | "apiKey">,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch(`${trimSlash(config.baseUrl)}/models`, {
    headers: bearer(config.apiKey),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => undefined)) as Json;
  if (!response.ok) {
    const detail = errorDetail(body);
    throw new Error(`Error ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const ids = ((body as { data?: { id?: unknown }[] })?.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string")
    .filter((id) => service.listModels === "all" || /ocr/i.test(id));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
