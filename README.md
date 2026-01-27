# YouTube AI Summarizer

Chrome extension for instant YouTube transcripts with AI summaries, key points, and chat — powered by Gemini.

![Screenshot](sample.png)

## Quick Start

### 1. Get a Free Gemini API Key

Go to [Google AI Studio](https://aistudio.google.com/app/apikey) → Create API Key → Copy it

### 2. Install Extension

1. Clone this repo
2. Go to `chrome://extensions/` → Enable **Developer mode**
3. Click **Load unpacked** → Select this folder
4. Click extension icon → **Settings** → Paste your API key

### 3. Start Transcript Server

```bash
cd server
pip install -r requirements.txt
python server.py
```

### 4. Done!

Open any YouTube video — the AI panel appears above recommended videos.
Set "DEBUG = false" to turn logs off

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No transcript | Make sure `python server.py` is running |
| AI not working | Check your API key in Settings |

## License

MIT
