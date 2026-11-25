import { closeMainWindow, getPreferenceValues } from "@raycast/api";
import { recognizeText } from "./ocr/macos";
import { handleRecognitionOutcome } from "./ocr/result";

export default async function command() {
  const { closeRaycast } = getPreferenceValues<Preferences.RecognizeText>();
  if (closeRaycast) await closeMainWindow();
  await handleRecognitionOutcome(await recognizeText());
}
