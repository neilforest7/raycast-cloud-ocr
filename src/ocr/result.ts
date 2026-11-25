import { Clipboard } from "@raycast/api";
import { showFailureToast, showSuccessToast } from "../utils";
import { pasteTextAndRestoreClipboard } from "./macos";
import { RecognitionOutcome } from "./types";

export async function handleRecognitionOutcome(
  outcome: RecognitionOutcome,
  options: { subject?: string; action?: "copy" | "paste-restore" } = {},
): Promise<void> {
  if (outcome.status === "cancelled") return;
  if (outcome.status === "no-text") {
    await showFailureToast("No text detected", { title: "No text detected" });
    return;
  }
  if (outcome.status === "error") {
    await showFailureToast(outcome.message, {
      title: options.subject
        ? `Failed ${options.subject}`
        : "Failed detecting text",
    });
    return;
  }

  if (options.action === "paste-restore") {
    try {
      await pasteTextAndRestoreClipboard(outcome.text);
      await showSuccessToast("Pasted recognized text");
    } catch (error) {
      await showFailureToast(error, {
        title: "Failed to paste recognized text",
      });
    }
    return;
  }

  try {
    await Clipboard.copy(outcome.text);
    await showSuccessToast("Copied text to clipboard");
  } catch (error) {
    await showFailureToast(error, { title: "Failed to copy recognized text" });
  }
}
