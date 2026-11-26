import {
  Clipboard,
  getPreferenceValues,
  launchCommand,
  LaunchType,
  showToast,
  Toast,
} from "@raycast/api";
import * as swiftBridge from "swift:../../swift";
import { hideToast, showRecognizingToast } from "../utils";
import { recognizeImageFile } from "./cloud";
import { ActiveService, loadActiveService } from "./settings";
import {
  parseCapturedImage,
  parseClipboardChangeCount,
  parseRestoreResult,
  parseSnapshotId,
} from "./swift-result";
import { RecognitionOutcome } from "./types";

const {
  captureImage: captureImageSwift,
  clipboardChangeCount: clipboardChangeCountSwift,
  clipboardImage: clipboardImageSwift,
  restoreClipboard: restoreClipboardSwift,
  snapshotClipboard: snapshotClipboardSwift,
} = swiftBridge;

const PASTE_SETTLE_MS = 400;

// Opens the setup form instead of capturing when no service is set up.
async function requireService(): Promise<ActiveService | undefined> {
  const active = await loadActiveService();
  if (active) return active;
  await showToast({
    style: Toast.Style.Failure,
    title: "Set up an OCR service first",
  });
  await launchCommand({
    name: "configure-ocr-service",
    type: LaunchType.UserInitiated,
  });
  return undefined;
}

async function recognizeCaptured(
  capture: () => Promise<string>,
): Promise<RecognitionOutcome> {
  const active = await requireService();
  if (!active) return { status: "cancelled" };
  let captured: ReturnType<typeof parseCapturedImage>;
  try {
    captured = parseCapturedImage(await capture());
  } catch (error) {
    console.error(error);
    return { status: "error", message: "Failed to capture image" };
  }
  if (!("path" in captured)) return captured;
  const toast = await showRecognizingToast();
  try {
    return await recognizeImageFile(active, captured.path);
  } finally {
    await hideToast(toast);
  }
}

export const recognizeText = (
  isFullScreen = false,
): Promise<RecognitionOutcome> => {
  const preference = getPreferenceValues<Preferences>();
  return recognizeCaptured(() =>
    captureImageSwift(
      isFullScreen,
      preference.keepImage,
      Boolean(preference.playSound),
    ),
  );
};

export const recognizeClipboard = (): Promise<RecognitionOutcome> =>
  recognizeCaptured(() => clipboardImageSwift());

// Pastes text into the frontmost app, then puts the original clipboard back.
// Nothing is pasted if the clipboard cannot be snapshotted, so the original
// contents are never lost. The snapshot is restored only while the clipboard
// still holds the paste, so a newer copy taken meanwhile is never overwritten.
export const pasteTextAndRestoreClipboard = async (text: string) => {
  const describe = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  let snapshotId: string;
  try {
    snapshotId = parseSnapshotId(await snapshotClipboardSwift());
  } catch (error) {
    throw new Error(`Could not save the clipboard: ${describe(error)}`);
  }

  let pasteError: unknown;
  try {
    await Clipboard.paste(text);
  } catch (error) {
    pasteError = error;
  }

  // Record the pasteboard version our paste produced before waiting.
  let expectedChangeCount: number | undefined;
  try {
    expectedChangeCount = parseClipboardChangeCount(
      await clipboardChangeCountSwift(),
    );
  } catch {
    expectedChangeCount = undefined;
  }

  // Give the target app time to read the pasteboard before it is restored.
  if (!pasteError) {
    await new Promise((resolve) => setTimeout(resolve, PASTE_SETTLE_MS));
  }

  // Restore even when pasting failed; this also deletes the snapshot file.
  try {
    parseRestoreResult(
      await restoreClipboardSwift(snapshotId, expectedChangeCount ?? -1),
    );
  } catch (error) {
    throw new Error(
      `Text was pasted, but the clipboard could not be restored: ${describe(error)}`,
    );
  }
  if (pasteError) throw pasteError;
};
