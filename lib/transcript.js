// YouTube Transcript Extraction
// Fetches and parses video transcripts from YouTube

/**
 * Extract video ID from YouTube URL
 * @param {string} url 
 * @returns {string|null}
 */
export function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Format seconds to timestamp string (MM:SS or HH:MM:SS)
 * @param {number} seconds 
 * @returns {string}
 */
export function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fetch transcript for a YouTube video
 * @param {string} videoId 
 * @returns {Promise<{segments: Array, fullText: string}|null>}
 */
export async function fetchTranscript(videoId) {
  try {
    // Fetch the video page
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const videoPageHtml = await videoPageResponse.text();
    
    // Try multiple methods to extract caption URL
    const captionUrl = await extractCaptionUrl(videoPageHtml, videoId);
    
    if (!captionUrl) {
      console.log('No caption URL found');
      return null;
    }
    
    // Fetch the transcript with json3 format for easier parsing
    const transcriptUrl = captionUrl.includes('&fmt=') ? captionUrl : `${captionUrl}&fmt=json3`;
    const transcriptResponse = await fetch(transcriptUrl);
    const transcriptData = await transcriptResponse.text();
    
    return parseTranscript(transcriptData);
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return null;
  }
}

/**
 * Extract caption URL from video page HTML using multiple methods
 * @param {string} html 
 * @param {string} videoId
 * @returns {Promise<string|null>}
 */
async function extractCaptionUrl(html, videoId) {
  // Method 1: Extract from ytInitialPlayerResponse
  let captionUrl = extractFromInitialPlayerResponse(html);
  if (captionUrl) return captionUrl;
  
  // Method 2: Look for caption URL directly in HTML
  captionUrl = extractCaptionUrlDirect(html);
  if (captionUrl) return captionUrl;
  
  // Method 3: Try the innertube API
  captionUrl = await fetchFromInnertubeApi(videoId);
  if (captionUrl) return captionUrl;
  
  return null;
}

/**
 * Extract caption URL from ytInitialPlayerResponse
 * @param {string} html 
 * @returns {string|null}
 */
function extractFromInitialPlayerResponse(html) {
  try {
    // Multiple patterns to find ytInitialPlayerResponse
    const patterns = [
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let|<\/script>)/s,
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
      /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          // Try to parse - need to find the correct JSON end
          const jsonStr = extractValidJson(match[1]);
          if (jsonStr) {
            const data = JSON.parse(jsonStr);
            const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            
            if (captionTracks && captionTracks.length > 0) {
              // Prefer English, fallback to first
              const track = captionTracks.find(t => 
                t.languageCode === 'en' || t.languageCode?.startsWith('en')
              ) || captionTracks[0];
              
              return track.baseUrl;
            }
          }
        } catch (e) {
          console.log('Parse attempt failed, trying next pattern');
        }
      }
    }
  } catch (error) {
    console.error('Error extracting from initial player response:', error);
  }
  return null;
}

/**
 * Extract valid JSON from a potentially malformed string
 * @param {string} str 
 * @returns {string|null}
 */
function extractValidJson(str) {
  let braceCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return str.substring(0, i + 1);
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract caption URL directly from HTML
 * @param {string} html 
 * @returns {string|null}
 */
function extractCaptionUrlDirect(html) {
  try {
    // Look for timedtext URLs in the page
    const urlPatterns = [
      /"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/,
      /"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/,
      /timedtext[^"]*v=([^"&]+)[^"]*/
    ];
    
    for (const pattern of urlPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // Decode unicode escapes
        return match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      }
    }
  } catch (error) {
    console.error('Error extracting caption URL directly:', error);
  }
  return null;
}

/**
 * Fetch caption URL from YouTube's innertube API
 * @param {string} videoId 
 * @returns {Promise<string|null>}
 */
async function fetchFromInnertubeApi(videoId) {
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00'
          }
        },
        videoId: videoId
      })
    });
    
    const data = await response.json();
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (captionTracks && captionTracks.length > 0) {
      const track = captionTracks.find(t => 
        t.languageCode === 'en' || t.languageCode?.startsWith('en')
      ) || captionTracks[0];
      
      return track.baseUrl;
    }
  } catch (error) {
    console.error('Error fetching from innertube API:', error);
  }
  return null;
}

/**
 * Parse transcript data (handles both XML and JSON3 formats)
 * @param {string} data 
 * @returns {{segments: Array, fullText: string}}
 */
function parseTranscript(data) {
  const segments = [];
  
  // Try JSON3 format first (preferred)
  if (data.trim().startsWith('{')) {
    try {
      const json = JSON.parse(data);
      
      // JSON3 format has events array
      if (json.events) {
        for (const event of json.events) {
          if (event.segs) {
            const text = event.segs
              .map(seg => seg.utf8 || '')
              .join('')
              .trim();
            
            if (text && text !== '\n') {
              segments.push({
                start: (event.tStartMs || 0) / 1000,
                duration: (event.dDurationMs || 0) / 1000,
                text: cleanText(text)
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('JSON parse error:', e);
    }
  }
  
  // Fallback to XML format
  if (segments.length === 0) {
    const textRegex = /<text start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([^<]*)<\/text>/g;
    let match;
    
    while ((match = textRegex.exec(data)) !== null) {
      const start = parseFloat(match[1]);
      const duration = match[2] ? parseFloat(match[2]) : 0;
      const text = cleanText(decodeHtmlEntities(match[3]));
      
      if (text) {
        segments.push({ start, duration, text });
      }
    }
  }
  
  // Merge very short consecutive segments for better readability
  const mergedSegments = mergeShortSegments(segments);
  
  return {
    segments: mergedSegments,
    fullText: mergedSegments.map(s => s.text).join(' ')
  };
}

/**
 * Merge short consecutive segments
 * @param {Array} segments 
 * @returns {Array}
 */
function mergeShortSegments(segments) {
  if (segments.length === 0) return [];
  
  const merged = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    
    // If current segment is very short and close to next, merge them
    if (current.text.length < 20 && seg.start - current.start < 3) {
      current.text = current.text + ' ' + seg.text;
      current.duration = (seg.start + seg.duration) - current.start;
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);
  
  return merged;
}

/**
 * Clean text - remove extra whitespace and newlines
 * @param {string} text 
 * @returns {string}
 */
function cleanText(text) {
  return text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decode HTML entities
 * @param {string} text 
 * @returns {string}
 */
function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#32;': ' ',
    '&nbsp;': ' '
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  
  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));
  decoded = decoded.replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return decoded;
}

/**
 * Get transcript with timestamps formatted for display
 * @param {Array} segments 
 * @returns {Array}
 */
export function formatTranscriptForDisplay(segments) {
  return segments.map(segment => ({
    timestamp: formatTimestamp(segment.start),
    startSeconds: segment.start,
    text: segment.text
  }));
}

/**
 * Get timestamped transcript for AI processing
 * @param {Array} segments 
 * @returns {string}
 */
export function getTimestampedTranscript(segments) {
  return segments.map(s => `[${formatTimestamp(s.start)}] ${s.text}`).join('\n');
}
