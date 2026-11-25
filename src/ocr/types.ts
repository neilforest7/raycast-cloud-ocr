export type RecognitionOutcome =
  | { status: "recognized"; text: string }
  | { status: "no-text" }
  | { status: "cancelled" }
  | { status: "error"; message: string };
