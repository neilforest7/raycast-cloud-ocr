# AGENTS.md

Raycast extension: screen/clipboard OCR via an OpenAI-compatible vision API. Commands live in `src/`, the native screen-capture helper in `swift/`.

## Develop

- `npm run dev` (`ray develop`) registers a **development** copy in Raycast with hot reload.
- Stop it with Ctrl+C. Killing the process leaves a stale dev entry, and Raycast then lists every command several times. Remove extras in Raycast Settings → Extensions.
- Uninstall the dev copy when done, so it doesn't duplicate the installed store version.
- `npm run lint` must pass before publishing.

## Publish

- Private extension in the `neilforest-team` organization (`owner` in `package.json`). Not on the public Store.
- Release: bump `version` in `package.json`, then `npm run publish` from a clean `main`. Installed copies update automatically.
- The CLI must be logged in as `neilforest` (`npx ray profile`; `npx ray login` if not).
- If Raycast shows "Extension not found" for `neilforest-team/cloud-ocr`, the app's sign-in is stale: sign out and back in under Settings → Account.
- Store page: https://www.raycast.com/neilforest-team/cloud-ocr
