"""
YouTube Transcript Server
A simple Flask server that fetches YouTube transcripts using youtube-transcript-api
"""

from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable
)

app = Flask(__name__)
# Enable CORS for all origins (needed for Chrome extension)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Accept')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

@app.route('/transcript', methods=['GET'])
def get_transcript():
    """
    Fetch transcript for a YouTube video
    
    Query params:
        v: YouTube video ID (required)
        lang: Language code (optional, defaults to 'en')
    
    Returns:
        JSON with segments array and metadata
    """
    video_id = request.args.get('v')
    lang = request.args.get('lang', 'en')
    
    if not video_id:
        return jsonify({
            'error': 'Missing video ID. Use ?v=VIDEO_ID',
            'success': False
        }), 400
    
    try:
        ytt_api = YouTubeTranscriptApi()
        
        # Try to get transcript list first to see available languages
        transcript_list = ytt_api.list(video_id)
        
        # Try to find transcript in preferred language order
        languages_to_try = [lang, 'en', 'en-US', 'en-GB']
        transcript = None
        used_language = None
        is_generated = False
        
        # First try manually created transcripts
        for try_lang in languages_to_try:
            try:
                transcript = transcript_list.find_manually_created_transcript([try_lang])
                used_language = try_lang
                is_generated = False
                break
            except NoTranscriptFound:
                continue
        
        # If no manual transcript, try auto-generated
        if transcript is None:
            for try_lang in languages_to_try:
                try:
                    transcript = transcript_list.find_generated_transcript([try_lang])
                    used_language = try_lang
                    is_generated = True
                    break
                except NoTranscriptFound:
                    continue
        
        # If still no transcript in English, try any available transcript
        if transcript is None:
            try:
                # Get first available transcript
                for t in transcript_list:
                    transcript = t
                    used_language = t.language_code
                    is_generated = t.is_generated
                    break
            except:
                pass
        
        if transcript is None:
            return jsonify({
                'error': 'No transcript available for this video',
                'success': False
            }), 404
        
        # Fetch the actual transcript data
        fetched = transcript.fetch()
        
        # Convert to our format
        segments = []
        for snippet in fetched:
            segments.append({
                'start': snippet.start,
                'duration': snippet.duration,
                'text': snippet.text
            })
        
        return jsonify({
            'success': True,
            'video_id': video_id,
            'language': used_language,
            'is_generated': is_generated,
            'segments': segments,
            'full_text': ' '.join([s['text'] for s in segments])
        })
        
    except TranscriptsDisabled:
        return jsonify({
            'error': 'Transcripts are disabled for this video',
            'success': False
        }), 404
        
    except VideoUnavailable:
        return jsonify({
            'error': 'Video is unavailable',
            'success': False
        }), 404
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'youtube-transcript-server'
    })


@app.route('/', methods=['GET'])
def index():
    """API info endpoint"""
    return jsonify({
        'name': 'YouTube Transcript Server',
        'version': '1.0.0',
        'endpoints': {
            '/transcript?v=VIDEO_ID': 'Get transcript for a video',
            '/health': 'Health check'
        }
    })


if __name__ == '__main__':
    print('=' * 50)
    print('YouTube Transcript Server')
    print('=' * 50)
    print('Server running at http://localhost:5000')
    print('')
    print('Endpoints:')
    print('  GET /transcript?v=VIDEO_ID  - Fetch transcript')
    print('  GET /health                 - Health check')
    print('')
    print('Press Ctrl+C to stop')
    print('=' * 50)
    
    app.run(host='127.0.0.1', port=5050, debug=True)

