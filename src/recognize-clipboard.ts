import { closeMainWindow, getPreferenceValues } from "@raycast/api";
import { recognizeClipboard } from "./ocr/macos";
import { handleRecognitionOutcome } from "./ocr/result";

export default async function command() {
  await closeMainWindow();
  const { clipboardResultAction } =
    getPreferenceValues<Preferences.RecognizeClipboard>();
  await handleRecognitionOutcome(await recognizeClipboard(), {
    subject: "recognizing clipboard image",
    action:
      clipboardResultAction === "paste-restore" ? "paste-restore" : "copy",
  });
}
