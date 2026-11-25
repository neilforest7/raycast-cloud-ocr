import { getPreferenceValues, showToast, Toast } from "@raycast/api";
import { showFailureToast as showRaycastFailureToast } from "@raycast/utils";

export const showSuccessToast = async (title: string) => {
  const preference = getPreferenceValues<Preferences>();
  if (preference.showToast)
    await showToast({ style: Toast.Style.Success, title });
};

export const showFailureToast = async (
  error: unknown,
  options?: { title?: string },
) => {
  const preference = getPreferenceValues<Preferences>();
  if (preference.showToast) await showRaycastFailureToast(error, options);
};

export const RECOGNIZING_TOAST_TITLE = "Recognizing…";

// Caller must hide the returned toast; undefined when toasts are disabled.
export const showRecognizingToast = async (): Promise<Toast | undefined> => {
  const preference = getPreferenceValues<Preferences>();
  if (!preference.showToast) return undefined;
  return showToast({
    style: Toast.Style.Animated,
    title: RECOGNIZING_TOAST_TITLE,
  });
};

export const hideToast = async (toast: Toast | undefined) => {
  await toast?.hide();
};
