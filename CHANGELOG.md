# Cloud OCR Changelog

## [OCR Services] - {PR_MERGE_DATE}

- Add the Configure OCR Service command: pick Qwen-OCR, SiliconFlow (DeepSeek-OCR, PaddleOCR-VL), Mistral OCR, GLM-OCR (Zhipu, Z.ai), Ollama, Google Cloud Vision, Azure AI Vision, Baidu OCR, Tencent Cloud OCR or a custom OpenAI-compatible endpoint; the URL and model fill in automatically, OCR models load from the provider, and a test recognizes a sample image
- Move API key, Base URL and Model out of the extension preferences

## [Initial Version] - {PR_MERGE_DATE}

- Recognize text from a screen area, the current display or a clipboard image with an OpenAI-compatible vision model (default: Alibaba Cloud Model Studio `qwen-vl-ocr`)
