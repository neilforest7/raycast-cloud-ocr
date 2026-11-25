# Cloud OCR

Extract text from a screen area, the whole screen or a clipboard image, recognized by a cloud vision model instead of on-device OCR.

Cloud OCR is based on [ScreenOCR](https://www.raycast.com/huzef44/screenocr). Screen capture, clipboard handling and the commands work the same way; only text recognition moves to an OpenAI-compatible `/chat/completions` API.

## Commands

- **Recognize Text**: select a screen area and copy its text
- **Recognize Text on Entire Screen**: recognize text on the current display
- **Recognize Text in Clipboard Image**: recognize an image or copied image file in the clipboard, then copy the text or paste it and keep the image

## Setup

1. Create an API key in [Alibaba Cloud Model Studio](https://bailian.console.aliyun.com/) (or any provider with an OpenAI-compatible vision endpoint).
2. Open a command and enter the API key in the extension preferences.

| Preference | Default                                             |
| ---------- | --------------------------------------------------- |
| Base URL   | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Model      | `qwen-vl-ocr`                                       |

To switch provider, change Base URL and Model. Outside mainland China, use `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.

Screen capture requires the Screen Recording permission for Raycast (System Settings → Privacy & Security → Screen Recording).

## Privacy

Captured images are sent to the configured API provider for recognition. Temporary image files are deleted after each request.

## Development

Building the Swift helper requires Xcode.

```sh
npm install
npm run dev
```

## License

MIT
