# YouTube AI Summarizer

A Chrome extension that provides instant YouTube video transcripts with AI-powered summaries, key points extraction, and chat features using Google's Gemini API.

## Setup

### 1. Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked** and select this project folder
4. Click the extension icon and add your Gemini API key in Settings

### 2. Start the Transcript Server

```bash
cd server
pip install -r requirements.txt
python server.py
```

### 3. Use It

Navigate to any YouTube video, click the extension icon, and get transcripts, summaries, key points, or chat with the AI about the video content.

