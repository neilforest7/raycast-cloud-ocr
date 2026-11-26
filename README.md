# Cloud OCR

Extract text from a screen area, the whole screen or a clipboard image, recognized by a cloud vision model instead of on-device OCR.

Cloud OCR is based on [ScreenOCR](https://www.raycast.com/huzef44/screenocr). Screen capture, clipboard handling and the commands work the same way; only text recognition moves to an OpenAI-compatible `/chat/completions` API.

## Commands

- **Recognize Text**: select a screen area and copy its text
- **Recognize Text on Entire Screen**: recognize text on the current display
- **Recognize Text in Clipboard Image**: recognize an image or copied image file in the clipboard, then copy the text or paste it and keep the image

## Setup

Run **Configure OCR Service**. Picking a service fills in its Base URL and model; enter the keys, press ⌘T to test on a sample image, then Save. Recognition commands open this form until a service is saved.

| OCR Service                                      | Models                                                      | Keys                                  |
| ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------- |
| Qwen-OCR · Alibaba Cloud (China / International) | `qwen-vl-ocr`, `qwen3.5-ocr`                                | API Key                               |
| SiliconFlow                                      | `deepseek-ai/DeepSeek-OCR`, `PaddlePaddle/PaddleOCR-VL-1.5` | API Key                               |
| Mistral OCR                                      | `mistral-ocr-latest`                                        | API Key                               |
| GLM-OCR · Zhipu AI / Z.ai                        | `glm-ocr`                                                   | API Key                               |
| Ollama                                           | `glm-ocr`, `deepseek-ocr`                                   | none                                  |
| Google Cloud Vision                              | `DOCUMENT_TEXT_DETECTION`, `TEXT_DETECTION`                 | API Key                               |
| Azure AI Vision                                  | Image Analysis 4.0 Read                                     | API Key, Base URL = resource endpoint |
| Baidu OCR                                        | `accurate_basic`, `general_basic`                           | API Key + Secret Key                  |
| Tencent Cloud OCR                                | `GeneralAccurateOCR`, `GeneralBasicOCR`                     | SecretId + SecretKey                  |
| Custom (OpenAI-compatible)                       | any                                                         | optional API Key                      |

For OpenAI-compatible services, more OCR models are loaded from the provider's `/models` endpoint. **Custom…** in the model list takes any name. Each service keeps its own URL, keys and model. Keys stay in Raycast's local encrypted storage; ⌘⇧E shows or hides them, ⌃X clears them.

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
