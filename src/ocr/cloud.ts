import { getPreferenceValues } from "@raycast/api";
import { readFile, rm } from "node:fs/promises";
import { RecognitionOutcome } from "./types";

const REQUEST_TIMEOUT_MS = 60_000;

function prompt(customWords: string): string {
  const lines = [
    "Extract all text from this image exactly as it appears.",
    "Keep the original language, reading order and line breaks.",
    "Output only the extracted text, with no explanation, translation or Markdown code fences.",
    "If the image contains no text, output nothing.",
  ];
  const words = customWords
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length > 0) {
    lines.push(`These terms may appear in the image: ${words.join(", ")}.`);
  }
  return lines.join("\n");
}

// Sends an image file to an OpenAI-compatible chat completions endpoint and
// always deletes the file afterwards.
export async function recognizeImageFile(
  path: string,
): Promise<RecognitionOutcome> {
  const { apiKey, baseUrl, model, customWordsList, ignoreLineBreaks } =
    getPreferenceValues<Preferences>();
  let image: Buffer;
  try {
    image = await readFile(path);
  } finally {
    await rm(path, { force: true });
  }
  const mime = path.endsWith(".jpg") ? "image/jpeg" : "image/png";

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${image.toString("base64")}`,
                },
              },
              { type: "text", text: prompt(customWordsList ?? "") },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut
        ? "The OCR API did not respond in time."
        : "Could not reach the OCR API. Check the Base URL and your network.",
    };
  }

  const body = (await response.json().catch(() => undefined)) as
    | {
        choices?: { message?: { content?: unknown } }[];
        error?: { message?: string };
        message?: string;
      }
    | undefined;
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message;
    return {
      status: "error",
      message: `OCR API error ${response.status}${detail ? `: ${detail}` : ""}`,
    };
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { status: "error", message: "The OCR API returned no text." };
  }
  let text = content
    .replace(/^\s*```[a-z]*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  if (ignoreLineBreaks) text = text.replace(/\s*\n\s*/g, " ");
  return text ? { status: "recognized", text } : { status: "no-text" };
}
