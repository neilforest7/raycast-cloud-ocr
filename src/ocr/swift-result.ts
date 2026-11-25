// Swift returns a JSON envelope so recognized content can never be mistaken for a
// status. Keep these shapes in sync with swift/Sources/CloudOCR/CloudOCR.swift.
type Payload = Record<string, unknown>;

class ProtocolError extends Error {}

function decode(raw: string | null | undefined): Payload {
  const text = (raw ?? "").trim();
  if (!text) {
    throw new ProtocolError("The Swift helper returned an empty response.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProtocolError("The Swift helper returned an invalid response.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolError("The Swift helper returned an invalid response.");
  }
  return value as Payload;
}

const shape = (payload: Payload) => Object.keys(payload).sort().join(",");

function errorMessage(payload: Payload): string | undefined {
  if (
    payload.status === "error" &&
    shape(payload) === "message,status" &&
    typeof payload.message === "string" &&
    payload.message.trim().length > 0
  ) {
    return payload.message;
  }
  return undefined;
}

export type CapturedImage =
  | { path: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export function parseCapturedImage(
  raw: string | null | undefined,
): CapturedImage {
  let payload: Payload;
  try {
    payload = decode(raw);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The Swift helper returned an invalid response.",
    };
  }

  const message = errorMessage(payload);
  if (message !== undefined) return { status: "error", message };

  if (shape(payload) === "status" && payload.status === "cancelled") {
    return { status: "cancelled" };
  }
  if (
    shape(payload) === "path,status" &&
    payload.status === "image" &&
    typeof payload.path === "string" &&
    payload.path.length > 0
  ) {
    return { path: payload.path };
  }
  return {
    status: "error",
    message: "The Swift helper returned an invalid result.",
  };
}

export function parseSnapshotId(raw: string | null | undefined): string {
  const payload = decode(raw);
  if (
    shape(payload) === "id,status" &&
    payload.status === "snapshot" &&
    typeof payload.id === "string" &&
    payload.id.trim().length > 0
  ) {
    return payload.id;
  }
  throw new Error(
    errorMessage(payload) ??
      "The Swift helper returned an invalid clipboard snapshot.",
  );
}

export function parseRestoreResult(
  raw: string | null | undefined,
): "restored" | "skipped" {
  const payload = decode(raw);
  if (shape(payload) === "status") {
    if (payload.status === "restored") return "restored";
    if (payload.status === "skipped") return "skipped";
  }
  throw new Error(
    errorMessage(payload) ??
      "The Swift helper returned an invalid restore result.",
  );
}

export function parseClipboardChangeCount(
  raw: string | null | undefined,
): number | undefined {
  let payload: Payload;
  try {
    payload = decode(raw);
  } catch {
    return undefined;
  }
  if (
    shape(payload) === "count,status" &&
    payload.status === "count" &&
    typeof payload.count === "number" &&
    Number.isInteger(payload.count) &&
    payload.count >= 0
  ) {
    return payload.count;
  }
  return undefined;
}
