import { closeMainWindow, getPreferenceValues } from "@raycast/api";
import { recognizeText } from "./ocr/macos";
import { handleRecognitionOutcome } from "./ocr/result";
import { showFailureToast } from "./utils";

export default async function command() {
  const { includeRaycast } =
    getPreferenceValues<Preferences.RecognizeTextFullscreen>();
  if (!includeRaycast) await closeMainWindow();
  const outcome = await recognizeText(true);
  let closeFailed = false;
  let closeError: unknown;
  if (includeRaycast) {
    try {
      await closeMainWindow();
    } catch (error) {
      closeFailed = true;
      closeError = error;
    }
  }
  await handleRecognitionOutcome(outcome);
  if (closeFailed) {
    await showFailureToast(closeError, { title: "Could not close Raycast" });
  }
}
