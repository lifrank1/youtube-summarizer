# YouTube Transcript Server

A simple Python server that fetches YouTube transcripts using the [youtube-transcript-api](https://pypi.org/project/youtube-transcript-api/) library.

## Setup

1. **Install Python dependencies:**

```bash
cd server
pip install -r requirements.txt
```

2. **Run the server:**

```bash
python server.py
```

The server will start at `http://localhost:5000`

## API Endpoints

### GET /transcript

Fetch transcript for a YouTube video.

**Query Parameters:**
- `v` (required): YouTube video ID
- `lang` (optional): Preferred language code (default: `en`)

**Example:**
```
http://localhost:5000/transcript?v=dQw4w9WgXcQ
```

**Response:**
```json
{
  "success": true,
  "video_id": "dQw4w9WgXcQ",
  "language": "en",
  "is_generated": false,
  "segments": [
    {
      "start": 0.0,
      "duration": 1.54,
      "text": "We're no strangers to love"
    }
  ],
  "full_text": "We're no strangers to love..."
}
```

### GET /health

Health check endpoint.

### GET /

API information.

## Usage with Chrome Extension

1. Start the server: `python server.py`
2. Keep it running while using the extension
3. The extension will automatically use this server for transcript fetching

## Troubleshooting

**Server not starting?**
- Make sure you have Python 3.8+ installed
- Install dependencies: `pip install -r requirements.txt`

**Transcript not found?**
- Some videos don't have transcripts available
- Try a different video

