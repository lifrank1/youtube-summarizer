// Popup JavaScript
import { getApiKey, getVideoCache, getChatHistory } from '../lib/storage.js';

// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[YT-AI Popup]', ...args);
const logError = (...args) => console.error('[YT-AI Popup ERROR]', ...args);

// State
let currentTab = null;
let videoId = null;
let transcript = null;
let chatHistory = [];
let cachedSummary = null;

// DOM Elements
const views = {
  notYoutube: document.getElementById('not-youtube'),
  noApiKey: document.getElementById('no-api-key'),
  loading: document.getElementById('loading'),
  noTranscript: document.getElementById('no-transcript'),
  mainUI: document.getElementById('main-ui')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

// Listen for storage changes to sync with sidebar
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !videoId) return;
  
  // Sync video cache (transcript/summary)
  if (changes.video_cache) {
    const newCache = changes.video_cache.newValue || {};
    const videoCache = newCache[videoId];
    
    if (videoCache) {
      // Update summary if changed
      if (videoCache.summary && videoCache.summary !== cachedSummary) {
        log('Storage sync: new summary detected');
        cachedSummary = videoCache.summary;
        renderCachedSummary();
      }
      
      // Update transcript if changed
      if (videoCache.transcript && !transcript) {
        log('Storage sync: new transcript detected');
        transcript = videoCache.transcript;
        renderTranscript();
      }
    }
  }
  
  // Sync chat history
  if (changes.chat_history) {
    const newHistory = changes.chat_history.newValue || {};
    const videoChatHistory = newHistory[videoId];
    
    if (videoChatHistory && videoChatHistory.length !== chatHistory.length) {
      log('Storage sync: chat history updated');
      chatHistory = videoChatHistory;
      renderChatHistory();
    }
  }
});

async function init() {
  // Setup event listeners
  setupEventListeners();
  
  // Check current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  
  if (!currentTab?.url?.includes('youtube.com/watch')) {
    showView('notYoutube');
    return;
  }
  
  // Check API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    showView('noApiKey');
    return;
  }
  
  // Extract video ID
  const url = new URL(currentTab.url);
  videoId = url.searchParams.get('v');
  
  if (!videoId) {
    showView('notYoutube');
    return;
  }
  
  // Load transcript
  showView('loading');
  await loadTranscript();
}

function setupEventListeners() {
  // Settings button
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('setup-api-key')?.addEventListener('click', openSettings);
  
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Copy transcript
  document.getElementById('copy-transcript').addEventListener('click', copyTranscript);
  
  // Generate buttons
  document.getElementById('generate-summary').addEventListener('click', generateSummary);
  
  // Chat
  document.getElementById('chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  
  // Auto-resize chat input
  document.getElementById('chat-input').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
  });
}

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  
  switch (viewName) {
    case 'notYoutube':
      views.notYoutube.classList.remove('hidden');
      break;
    case 'noApiKey':
      views.noApiKey.classList.remove('hidden');
      break;
    case 'loading':
      views.loading.classList.remove('hidden');
      break;
    case 'noTranscript':
      views.noTranscript.classList.remove('hidden');
      break;
    case 'main':
      views.mainUI.classList.remove('hidden');
      break;
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `${tabName}-panel`);
  });
}

async function loadTranscript() {
  log('Loading transcript for video:', videoId);
  
  try {
    // Check storage cache first for transcript and summary
    log('Checking storage cache...');
    const cache = await getVideoCache(videoId);
    if (cache.transcript) {
      log('Found cached transcript with', cache.transcript.segments?.length, 'segments');
      transcript = cache.transcript;
    }
    if (cache.summary) {
      log('Found cached summary');
      cachedSummary = cache.summary;
    }
    
    // Also load chat history from storage
    chatHistory = await getChatHistory(videoId);
    log('Loaded', chatHistory.length, 'chat messages from storage');
    
    // Try to get transcript from content script (may have fresher data)
    log('Attempting to get transcript from content script...');
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'getTranscript' });
      log('Content script response:', response ? 'received' : 'empty');
      
      if (response?.transcript?.segments?.length) {
        log('Got transcript from content script with', response.transcript.segments.length, 'segments');
        transcript = response.transcript;
        document.getElementById('video-title').textContent = response.title || 'Video';
        renderTranscript();
        renderChatHistory();
        if (cachedSummary) {
          renderCachedSummary();
        }
        showView('main');
        return;
      } else {
        log('Content script has no transcript yet');
      }
    } catch (e) {
      log('Content script not ready or error:', e.message);
    }
    
    // If we have cached transcript, use it
    if (transcript?.segments?.length) {
      log('Using cached transcript');
      renderTranscript();
      renderChatHistory();
      if (cachedSummary) {
        renderCachedSummary();
      }
      showView('main');
      return;
    }
    
    // Fallback: Fetch the video page directly
    log('Fallback: fetching video page directly...');
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    log('Fetch status:', response.status);
    const html = await response.text();
    log('Fetched HTML length:', html.length);
    
    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Video';
    document.getElementById('video-title').textContent = title;
    
    // Extract transcript
    transcript = await extractTranscript(html);
    
    if (!transcript || !transcript.segments.length) {
      log('No transcript found');
      showView('noTranscript');
      return;
    }
    
    log('Transcript loaded with', transcript.segments.length, 'segments');
    
    // Render transcript
    renderTranscript();
    renderChatHistory();
    if (cachedSummary) {
      renderCachedSummary();
    }
    showView('main');
    
  } catch (error) {
    logError('Error loading transcript:', error);
    showView('noTranscript');
  }
}

async function extractTranscript(html) {
  log('Extracting transcript from HTML...');
  
  try {
    let captionUrl = null;
    
    // Method 1: Extract from ytInitialPlayerResponse
    log('Looking for ytInitialPlayerResponse...');
    const patterns = [
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let|<\/script>)/s,
      /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s
    ];
    
    for (let i = 0; i < patterns.length; i++) {
      const match = html.match(patterns[i]);
      if (match) {
        log('Pattern', i, 'matched');
        try {
          const jsonStr = extractValidJson(match[1]);
          if (jsonStr) {
            log('Extracted JSON, length:', jsonStr.length);
            const playerResponse = JSON.parse(jsonStr);
            const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
            
            if (captions?.captionTracks?.length) {
              log('Found', captions.captionTracks.length, 'caption tracks');
              const track = captions.captionTracks.find(t => 
                t.languageCode === 'en' || t.languageCode?.startsWith('en')
              ) || captions.captionTracks[0];
              captionUrl = track.baseUrl;
              log('Selected track:', track.languageCode);
              break;
            } else {
              log('No caption tracks in playerResponse');
            }
          }
        } catch (e) {
          log('Pattern', i, 'parse failed:', e.message);
        }
      }
    }
    
    // Method 2: Look for baseUrl directly
    if (!captionUrl) {
      log('Looking for baseUrl directly...');
      const urlMatch = html.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
      if (urlMatch) {
        captionUrl = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        log('Found baseUrl directly');
      }
    }
    
    // Method 3: Try innertube API
    if (!captionUrl) {
      log('Trying innertube API...');
      captionUrl = await fetchCaptionUrlFromApi(videoId);
    }
    
    if (!captionUrl) {
      log('No caption URL found');
      return null;
    }
    
    // Add json3 format
    const transcriptUrl = captionUrl.includes('&fmt=') ? captionUrl : `${captionUrl}&fmt=json3`;
    log('Fetching transcript from URL...');
    const transcriptResponse = await fetch(transcriptUrl);
    log('Transcript fetch status:', transcriptResponse.status);
    const transcriptText = await transcriptResponse.text();
    log('Transcript text length:', transcriptText.length);
    
    return parseTranscript(transcriptText);
  } catch (error) {
    logError('Transcript extraction error:', error);
    return null;
  }
}

function extractValidJson(str) {
  let braceCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) return str.substring(0, i + 1);
      }
    }
  }
  return null;
}

async function fetchCaptionUrlFromApi(vid) {
  log('Calling innertube API for:', vid);
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: { hl: 'en', gl: 'US', clientName: 'WEB', clientVersion: '2.20240101.00.00' }
        },
        videoId: vid
      })
    });
    
    log('Innertube response status:', response.status);
    const data = await response.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (tracks?.length) {
      log('Innertube found', tracks.length, 'tracks');
      const track = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en')) || tracks[0];
      return track.baseUrl;
    } else {
      log('Innertube: no caption tracks');
    }
  } catch (e) {
    logError('Innertube API error:', e);
  }
  return null;
}

function parseTranscript(text) {
  log('Parsing transcript...');
  const segments = [];
  
  // Try JSON3 format first
  if (text.trim().startsWith('{')) {
    log('Detected JSON format');
    try {
      const data = JSON.parse(text);
      if (data.events) {
        log('Found', data.events.length, 'events');
        for (const event of data.events) {
          if (event.segs) {
            const segmentText = event.segs
              .map(s => s.utf8 || '')
              .join('')
              .replace(/\n/g, ' ')
              .trim();
            
            if (segmentText && segmentText !== '\n') {
              segments.push({
                start: (event.tStartMs || 0) / 1000,
                text: segmentText
              });
            }
          }
        }
        log('Extracted', segments.length, 'segments from JSON');
      }
    } catch (e) {
      logError('JSON parse error:', e);
    }
  }
  
  // Fallback to XML format
  if (segments.length === 0) {
    log('Trying XML format...');
    const textRegex = /<text start="([^"]+)"[^>]*>([^<]*)<\/text>/g;
    let match;
    
    while ((match = textRegex.exec(text)) !== null) {
      const start = parseFloat(match[1]);
      const segmentText = decodeHtmlEntities(match[2]).replace(/\n/g, ' ').trim();
      
      if (segmentText) {
        segments.push({ start, text: segmentText });
      }
    }
    log('Extracted', segments.length, 'segments from XML');
  }
  
  if (segments.length === 0) {
    log('No segments found, raw preview:', text.substring(0, 200));
    return null;
  }
  
  // Merge short consecutive segments
  const merged = [];
  let current = segments[0] ? { ...segments[0] } : null;
  
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (current && current.text.length < 20 && seg.start - current.start < 3) {
      current.text = current.text + ' ' + seg.text;
    } else {
      if (current) merged.push(current);
      current = { ...seg };
    }
  }
  if (current) merged.push(current);
  
  log('Final segment count:', merged.length);
  
  return {
    segments: merged,
    fullText: merged.map(s => s.text).join(' ')
  };
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderTranscript() {
  const list = document.getElementById('transcript-list');
  
  list.innerHTML = transcript.segments.map(seg => `
    <div class="transcript-item" data-time="${seg.start}">
      <span class="timestamp">${formatTimestamp(seg.start)}</span>
      <span class="transcript-text">${escapeHtml(seg.text)}</span>
    </div>
  `).join('');
  
  // Add click handlers
  list.querySelectorAll('.transcript-item').forEach(item => {
    item.addEventListener('click', () => {
      const time = parseFloat(item.dataset.time);
      seekVideo(time);
    });
  });
}

function renderChatHistory() {
  if (!chatHistory || chatHistory.length === 0) return;
  
  const messagesDiv = document.getElementById('chat-messages');
  messagesDiv.querySelector('.chat-empty')?.remove();
  
  messagesDiv.innerHTML = chatHistory.map(msg => `
    <div class="chat-message ${msg.role === 'user' ? 'user' : 'assistant'}">
      <div class="chat-bubble">${msg.role === 'user' ? escapeHtml(msg.content) : marked(msg.content)}</div>
    </div>
  `).join('');
  
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderCachedSummary() {
  const btn = document.getElementById('generate-summary');
  const content = document.getElementById('summary-content');
  
  btn.classList.add('hidden');
  content.innerHTML = `<div class="cached-badge">Cached</div>${marked(cachedSummary)}`;
}

async function seekVideo(time) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (t) => {
        const video = document.querySelector('video');
        if (video) video.currentTime = t;
      },
      args: [time]
    });
  } catch (error) {
    console.error('Error seeking video:', error);
  }
}

function copyTranscript() {
  const text = transcript.segments
    .map(s => `[${formatTimestamp(s.start)}] ${s.text}`)
    .join('\n');
  
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-transcript');
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!
    `;
    
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy
      `;
    }, 2000);
  });
}

async function generateSummary() {
  const btn = document.getElementById('generate-summary');
  const content = document.getElementById('summary-content');
  
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></div> Generating...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateSummary',
      data: {
        transcript: transcript.fullText,
        videoTitle: document.getElementById('video-title').textContent
      }
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    btn.classList.add('hidden');
    content.innerHTML = marked(response.summary);
    
  } catch (error) {
    content.innerHTML = `<div class="error-message">${escapeHtml(error.message)}</div>`;
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3v18M5.5 8l13 8M5.5 16l13-8"/>
      </svg>
      Generate Summary
    `;
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  const messagesDiv = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send');
  
  // Clear empty state
  messagesDiv.querySelector('.chat-empty')?.remove();
  
  // Add user message
  messagesDiv.innerHTML += `
    <div class="chat-message user">
      <div class="chat-bubble">${escapeHtml(message)}</div>
    </div>
  `;
  
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  // Add loading
  const loadingId = 'chat-loading';
  messagesDiv.innerHTML += `
    <div class="chat-message assistant" id="${loadingId}">
      <div class="chat-bubble">
        <div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></div>
      </div>
    </div>
  `;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'chat',
      data: {
        transcript: transcript.fullText,
        message,
        videoId
      }
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    document.getElementById(loadingId)?.remove();
    
    messagesDiv.innerHTML += `
      <div class="chat-message assistant">
        <div class="chat-bubble">${marked(response.response)}</div>
      </div>
    `;
    
    chatHistory = response.history;
    
  } catch (error) {
    document.getElementById(loadingId)?.remove();
    messagesDiv.innerHTML += `
      <div class="chat-message assistant">
        <div class="chat-bubble" style="color: var(--error)">
          Error: ${escapeHtml(error.message)}
        </div>
      </div>
    `;
  }
  
  sendBtn.disabled = false;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Simple markdown parser
function marked(text) {
  if (!text) return '';
  
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/```[\s\S]*?```/g, match => {
      const code = match.slice(3, -3).trim();
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

