import { getPreferenceValues } from "@raycast/api";
import { readFile, rm } from "node:fs/promises";
import { Image } from "./services";
import { ActiveService } from "./settings";
import { RecognitionOutcome } from "./types";

// Runs an OCR service and normalizes its text.
export async function recognizeImage(
  { service, config }: ActiveService,
  image: Image,
): Promise<RecognitionOutcome> {
  let text: string;
  try {
    text = await service.recognize(config, image);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  text = text
    .replace(/^\s*```[a-z]*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  if (getPreferenceValues<Preferences>().ignoreLineBreaks) {
    text = text.replace(/\s*\n\s*/g, " ");
  }
  return text ? { status: "recognized", text } : { status: "no-text" };
}

// Recognizes a captured image file and always deletes it afterwards.
export async function recognizeImageFile(
  active: ActiveService,
  path: string,
): Promise<RecognitionOutcome> {
  let data: Buffer;
  try {
    data = await readFile(path);
  } finally {
    await rm(path, { force: true });
  }
  const mime = path.endsWith(".jpg") ? "image/jpeg" : "image/png";
  return recognizeImage(active, { data, mime });
}
