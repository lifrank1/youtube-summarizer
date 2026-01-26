// Content Script - Injects sidebar into YouTube pages
(function() {
  'use strict';
  
  // Debug logging - all logs prefixed with [YT-AI] for easy filtering
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[YT-AI]', ...args);
  const logError = (...args) => console.error('[YT-AI ERROR]', ...args);
  const logWarn = (...args) => console.warn('[YT-AI WARN]', ...args);
  
  // State
  let sidebar = null;
  let currentVideoId = null;
  let transcript = null;
  let chatHistory = [];
  let isCollapsed = false;
  
  // Icons as SVG strings
  const icons = {
    chevronLeft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    sparkles: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M5.5 8l13 8M5.5 16l13-8"/></svg>',
    play: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
  };
  
  // Initialize
  function init() {
    log('=== Initializing YT AI Summarizer ===');
    log('URL:', location.href);
    
    const videoId = getVideoId();
    log('Video ID:', videoId);
    
    if (!videoId) {
      logWarn('No video ID found, aborting');
      return;
    }
    
    if (videoId !== currentVideoId) {
      log('New video detected, resetting state');
      currentVideoId = videoId;
      transcript = null;
      chatHistory = [];
      resetPanels();
    }
    
    if (!sidebar) {
      log('Creating sidebar');
      createSidebar();
    }
    
    loadTranscript();
  }
  
  // Get video ID from URL
  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }
  
  // Get video title
  function getVideoTitle() {
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata');
    return titleElement?.textContent?.trim() || '';
  }
  
  // Icons for collapse
  const chevronDown = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  const chevronUp = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>';

  // Create sidebar HTML
  function createSidebar() {
    sidebar = document.createElement('div');
    sidebar.id = 'yt-ai-summarizer-sidebar';
    
    sidebar.innerHTML = `
      <div class="yt-ai-header">
        <h2>
          <span class="yt-ai-header-logo">${icons.play}</span>
          AI Summarizer
        </h2>
        <div class="yt-ai-header-actions">
          <button class="yt-ai-icon-btn" id="yt-ai-settings-btn" title="Settings">
            ${icons.settings}
          </button>
          <button class="yt-ai-collapse-btn" id="yt-ai-collapse-btn" title="Collapse">
            ${chevronUp}
          </button>
        </div>
      </div>
      
      <div class="yt-ai-tabs">
        <button class="yt-ai-tab active" data-tab="transcript">Transcript</button>
        <button class="yt-ai-tab" data-tab="summary">Summary</button>
        <button class="yt-ai-tab" data-tab="keypoints">Key Points</button>
        <button class="yt-ai-tab" data-tab="chat">Chat</button>
      </div>
      
      <div class="yt-ai-content">
        <div class="yt-ai-panel active" id="yt-ai-transcript-panel">
          <div class="yt-ai-loading">
            <div class="yt-ai-spinner"></div>
            <p>Loading transcript...</p>
          </div>
        </div>
        
        <div class="yt-ai-panel" id="yt-ai-summary-panel">
          <button class="yt-ai-generate-btn" id="yt-ai-generate-summary">
            ${icons.sparkles}
            Generate Summary
          </button>
          <div class="yt-ai-result" id="yt-ai-summary-result"></div>
        </div>
        
        <div class="yt-ai-panel" id="yt-ai-keypoints-panel">
          <button class="yt-ai-generate-btn" id="yt-ai-generate-keypoints">
            ${icons.sparkles}
            Extract Key Points
          </button>
          <div class="yt-ai-result" id="yt-ai-keypoints-result"></div>
        </div>
        
        <div class="yt-ai-panel" id="yt-ai-chat-panel">
          <div class="yt-ai-chat-container">
            <div class="yt-ai-chat-messages" id="yt-ai-chat-messages">
              <div class="yt-ai-empty">
                <p>Ask questions about the video content. The AI will answer based on the transcript.</p>
              </div>
            </div>
            <div class="yt-ai-chat-input-container">
              <textarea 
                class="yt-ai-chat-input" 
                id="yt-ai-chat-input" 
                placeholder="Ask a question about this video..."
                rows="1"
              ></textarea>
              <button class="yt-ai-chat-send" id="yt-ai-chat-send" title="Send">
                ${icons.send}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Insert into YouTube's secondary column (recommended videos area)
    insertIntoSecondary();
    setupEventListeners();
    loadSettings();
  }
  
  // Insert sidebar into YouTube's secondary column
  function insertIntoSecondary() {
    const secondary = document.querySelector('#secondary, #secondary-inner, ytd-watch-next-secondary-results-renderer');
    
    if (secondary) {
      // Insert at the beginning of the secondary column
      secondary.insertBefore(sidebar, secondary.firstChild);
      log('Sidebar inserted into #secondary');
    } else {
      // Fallback: wait for secondary to appear
      log('Waiting for #secondary element...');
      const observer = new MutationObserver((mutations, obs) => {
        const sec = document.querySelector('#secondary, #secondary-inner');
        if (sec) {
          sec.insertBefore(sidebar, sec.firstChild);
          log('Sidebar inserted into #secondary (via observer)');
          obs.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      
      // Timeout fallback - append to body if secondary never appears
      setTimeout(() => {
        if (!sidebar.parentElement) {
          log('Secondary never found, appending to body');
          document.body.appendChild(sidebar);
        }
      }, 5000);
    }
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Collapse sidebar
    sidebar.querySelector('#yt-ai-collapse-btn').addEventListener('click', toggleSidebar);
    
    // Settings button
    sidebar.querySelector('#yt-ai-settings-btn').addEventListener('click', openSettings);
    
    // Tab switching
    sidebar.querySelectorAll('.yt-ai-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Generate buttons
    sidebar.querySelector('#yt-ai-generate-summary').addEventListener('click', generateSummary);
    sidebar.querySelector('#yt-ai-generate-keypoints').addEventListener('click', generateKeyPoints);
    
    // Chat
    const chatInput = sidebar.querySelector('#yt-ai-chat-input');
    const chatSend = sidebar.querySelector('#yt-ai-chat-send');
    
    chatSend.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    
    // Auto-resize chat input
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    });
  }
  
  // Load settings
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('extension_settings');
      const settings = result.extension_settings || {};
      
      // Start collapsed if user preference
      if (settings.startCollapsed) {
        isCollapsed = true;
        sidebar.classList.add('collapsed');
        const btn = sidebar.querySelector('#yt-ai-collapse-btn');
        btn.innerHTML = chevronDown;
        btn.title = 'Expand';
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }
  
  // Toggle sidebar visibility
  function toggleSidebar() {
    isCollapsed = !isCollapsed;
    sidebar.classList.toggle('collapsed', isCollapsed);
    
    // Update button icon
    const btn = sidebar.querySelector('#yt-ai-collapse-btn');
    btn.innerHTML = isCollapsed ? chevronDown : chevronUp;
    btn.title = isCollapsed ? 'Expand' : 'Collapse';
  }
  
  // Open settings
  function openSettings() {
    chrome.runtime.sendMessage({ action: 'openSettings' });
  }
  
  // Switch tab
  function switchTab(tabName) {
    sidebar.querySelectorAll('.yt-ai-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    sidebar.querySelectorAll('.yt-ai-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `yt-ai-${tabName}-panel`);
    });
  }

  // Reset panels when navigating to a new video
  function resetPanels() {
    if (!sidebar) return;

    log('Resetting panels for new video');

    // Reset Summary panel
    const summaryBtn = sidebar.querySelector('#yt-ai-generate-summary');
    const summaryResult = sidebar.querySelector('#yt-ai-summary-result');
    if (summaryBtn) {
      summaryBtn.style.display = '';
      summaryBtn.disabled = false;
      summaryBtn.innerHTML = `${icons.sparkles} Generate Summary`;
    }
    if (summaryResult) {
      summaryResult.innerHTML = '';
    }

    // Reset Key Points panel
    const keypointsBtn = sidebar.querySelector('#yt-ai-generate-keypoints');
    const keypointsResult = sidebar.querySelector('#yt-ai-keypoints-result');
    if (keypointsBtn) {
      keypointsBtn.style.display = '';
      keypointsBtn.disabled = false;
      keypointsBtn.innerHTML = `${icons.sparkles} Extract Key Points`;
    }
    if (keypointsResult) {
      keypointsResult.innerHTML = '';
    }

    // Reset Chat panel
    const chatMessages = sidebar.querySelector('#yt-ai-chat-messages');
    const chatInput = sidebar.querySelector('#yt-ai-chat-input');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="yt-ai-empty">
          <p>Ask questions about the video content. The AI will answer based on the transcript.</p>
        </div>
      `;
    }
    if (chatInput) {
      chatInput.value = '';
      chatInput.style.height = 'auto';
    }

    // Switch back to Transcript tab
    switchTab('transcript');
  }
  
  // Python server URL
  const PYTHON_SERVER_URL = 'http://127.0.0.1:5050';
  
  // Load transcript
  async function loadTranscript() {
    const panel = sidebar.querySelector('#yt-ai-transcript-panel');
    log('=== Starting transcript load ===');
    log('Video ID:', currentVideoId);
    
    try {
      // Method 0: Try Python server first (most reliable)
      log('Method 0: Trying Python server...');
      transcript = await fetchFromPythonServer(currentVideoId);
      
      // Method 1: Try to get from current page DOM
      if (!transcript) {
        log('Python server failed. Method 1: Trying to extract from current page DOM...');
        transcript = await extractFromCurrentPage(currentVideoId);
      }
      
      // Method 2: Fallback to fetching the page
      if (!transcript) {
        log('Method 1 failed. Method 2: Fetching page HTML...');
        const response = await fetch(`https://www.youtube.com/watch?v=${currentVideoId}`);
        log('Fetch response status:', response.status);
        const html = await response.text();
        log('Fetched HTML length:', html.length);
        
        transcript = await extractTranscript(html, currentVideoId);
      }
      
      if (!transcript || !transcript.segments || transcript.segments.length === 0) {
        logWarn('No transcript found after all methods');
        panel.innerHTML = `
          <div class="yt-ai-empty">
            <p>No transcript available for this video.</p>
            <p style="font-size:11px;margin-top:8px;opacity:0.7">
              Make sure the Python server is running:<br>
              <code style="background:#333;padding:2px 6px;border-radius:3px;">cd server && python server.py</code>
            </p>
            <p style="font-size:11px;margin-top:8px;opacity:0.7">Check console (F12) for debug logs: filter by [YT-AI]</p>
          </div>
        `;
        return;
      }
      
      log('SUCCESS! Transcript loaded with', transcript.segments.length, 'segments');
      log('First segment:', transcript.segments[0]);
      
      // Render transcript
      renderTranscript(panel);
      
    } catch (error) {
      logError('Error loading transcript:', error);
      panel.innerHTML = `
        <div class="yt-ai-error">
          <div class="yt-ai-error-title">Failed to load transcript</div>
          <p>${error.message}</p>
          <p style="font-size:11px;margin-top:8px;opacity:0.7">
            Make sure the Python server is running:<br>
            <code style="background:#333;padding:2px 6px;border-radius:3px;">cd server && python server.py</code>
          </p>
        </div>
      `;
    }
  }
  
  // Fetch transcript from Python server
  async function fetchFromPythonServer(videoId) {
    try {
      const url = `${PYTHON_SERVER_URL}/transcript?v=${videoId}`;
      log('Fetching from Python server:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      log('Python server response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logWarn('Python server error:', errorData.error || response.statusText);
        return null;
      }
      
      const data = await response.json();
      log('Python server response:', {
        success: data.success,
        language: data.language,
        is_generated: data.is_generated,
        segments: data.segments?.length
      });
      
      if (!data.success || !data.segments || data.segments.length === 0) {
        logWarn('Python server returned no segments');
        return null;
      }
      
      // Convert to our format
      const segments = data.segments.map(seg => ({
        start: seg.start,
        duration: seg.duration,
        text: seg.text
      }));
      
      log(`SUCCESS from Python server! Got ${segments.length} segments in ${data.language}`);
      
      return {
        segments,
        fullText: data.full_text || segments.map(s => s.text).join(' '),
        language: data.language,
        isGenerated: data.is_generated
      };
      
    } catch (error) {
      // Server not running or network error
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        logWarn('Python server not running or unreachable');
      } else {
        logError('Python server error:', error.message);
      }
      return null;
    }
  }
  
  // Extract transcript from the current page DOM (we're already on YouTube)
  async function extractFromCurrentPage(videoId) {
    log('Scanning page scripts for ytInitialPlayerResponse...');
    
    const scripts = document.querySelectorAll('script');
    log('Found', scripts.length, 'script tags');
    
    let playerResponse = null;
    
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const text = script.textContent || '';
      
      if (text.includes('ytInitialPlayerResponse')) {
        log('Found ytInitialPlayerResponse in script', i);
        
        // Try to extract the JSON
        const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
        if (match) {
          try {
            const jsonStr = extractValidJson(match[1]);
            if (jsonStr) {
              log('Extracted JSON length:', jsonStr.length);
              playerResponse = JSON.parse(jsonStr);
              log('Successfully parsed playerResponse');
              break;
            }
          } catch (e) {
            logWarn('Failed to parse script', i, ':', e.message);
          }
        }
      }
    }
    
    // Try script injection as fallback
    if (!playerResponse) {
      log('Trying script injection method...');
      playerResponse = await getPlayerResponseViaInjection();
    }
    
    if (!playerResponse) {
      logWarn('Could not find playerResponse in current page');
      return null;
    }
    
    return extractCaptionsFromPlayerResponse(playerResponse, videoId);
  }
  
  // Inject script to get ytInitialPlayerResponse from page context
  function getPlayerResponseViaInjection() {
    return new Promise((resolve) => {
      const msgId = 'yt-ai-' + Date.now();
      
      const handler = (event) => {
        if (event.data?.type === msgId) {
          window.removeEventListener('message', handler);
          if (event.data.data) {
            log('Got playerResponse via injection');
          } else {
            logWarn('Injection returned null - ytInitialPlayerResponse not available');
          }
          resolve(event.data.data);
        }
      };
      
      window.addEventListener('message', handler);
      
      const script = document.createElement('script');
      script.textContent = `
        window.postMessage({
          type: '${msgId}',
          data: typeof ytInitialPlayerResponse !== 'undefined' ? ytInitialPlayerResponse : null
        }, '*');
      `;
      document.documentElement.appendChild(script);
      script.remove();
      
      // Timeout after 2 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 2000);
    });
  }
  
  // Extract captions from playerResponse object
  async function extractCaptionsFromPlayerResponse(playerResponse, videoId) {
    log('Checking playerResponse for captions...');
    
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
    
    if (!captions) {
      logWarn('No captions object in playerResponse');
      log('playerResponse keys:', Object.keys(playerResponse || {}));
      return null;
    }
    
    if (!captions.captionTracks || captions.captionTracks.length === 0) {
      logWarn('No caption tracks available');
      log('captions object:', captions);
      return null;
    }
    
    log('Found', captions.captionTracks.length, 'caption tracks:');
    captions.captionTracks.forEach((t, i) => {
      log(`  ${i}: ${t.languageCode} - ${t.name?.simpleText || t.name?.runs?.[0]?.text || 'Unknown'} ${t.kind === 'asr' ? '(auto-generated)' : ''}`);
    });
    
    // Find best track (prefer English)
    const track = captions.captionTracks.find(t => 
      t.languageCode === 'en' || t.languageCode?.startsWith('en')
    ) || captions.captionTracks[0];
    
    log('Selected track:', track.languageCode, track.kind === 'asr' ? '(auto-generated)' : '');
    
    // Try multiple URL strategies
    const transcript = await fetchTranscriptWithRetries(track, videoId);
    return transcript;
  }
  
  // Try multiple strategies to fetch transcript
  async function fetchTranscriptWithRetries(track, videoId) {
    const strategies = [
      // Strategy 1: Use baseUrl directly with json3
      () => {
        let url = track.baseUrl;
        if (!url.includes('&fmt=')) url += '&fmt=json3';
        return { url, name: 'baseUrl + json3' };
      },
      // Strategy 2: Construct simple URL with lang parameter
      () => {
        const isAsr = track.kind === 'asr';
        let url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${track.languageCode}&fmt=json3`;
        if (isAsr) url += '&kind=asr';
        return { url, name: 'simple URL' };
      },
      // Strategy 3: Use baseUrl but request XML instead
      () => {
        let url = track.baseUrl;
        // Remove fmt parameter if present and don't add json3
        url = url.replace(/&fmt=[^&]+/, '');
        return { url, name: 'baseUrl XML' };
      },
      // Strategy 4: Try with tlang for translation (sometimes helps)
      () => {
        let url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${track.languageCode}`;
        if (track.kind === 'asr') url += '&kind=asr';
        return { url, name: 'simple URL XML' };
      }
    ];
    
    // Try each strategy with credentials included (sends cookies)
    for (const strategy of strategies) {
      const { url, name } = strategy();
      log(`Trying strategy: ${name}`);
      log('URL:', url.substring(0, 120) + '...');
      
      try {
        // Include credentials to send YouTube cookies with request
        const response = await fetch(url, { credentials: 'include' });
        log(`  Response status: ${response.status}`);
        
        if (!response.ok) {
          log(`  Failed: HTTP ${response.status}`);
          continue;
        }
        
        const data = await response.text();
        log(`  Data length: ${data.length}`);
        
        if (data.length === 0) {
          log('  Empty response, trying next strategy...');
          continue;
        }
        
        log('  Data preview:', data.substring(0, 150));
        
        const transcript = parseTranscript(data);
        if (transcript && transcript.segments.length > 0) {
          log(`  SUCCESS! Got ${transcript.segments.length} segments`);
          return transcript;
        } else {
          log('  Parsed but no segments, trying next...');
        }
      } catch (e) {
        logError(`  Strategy ${name} error:`, e.message);
      }
    }
    
    // Last resort: Try fetching via XMLHttpRequest from page context
    log('Trying XMLHttpRequest via page injection...');
    const xhrResult = await fetchViaPageContext(track.baseUrl + '&fmt=json3');
    if (xhrResult) {
      log('XHR result length:', xhrResult.length);
      const transcript = parseTranscript(xhrResult);
      if (transcript && transcript.segments.length > 0) {
        log(`SUCCESS via XHR! Got ${transcript.segments.length} segments`);
        return transcript;
      }
    }
    
    logWarn('All transcript fetch strategies failed');
    return null;
  }
  
  // Fetch via injected script in page context (has full cookie access)
  function fetchViaPageContext(url) {
    return new Promise((resolve) => {
      const msgId = 'yt-ai-xhr-' + Date.now();
      
      const handler = (event) => {
        if (event.data?.type === msgId) {
          window.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      
      window.addEventListener('message', handler);
      
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          fetch('${url}', { credentials: 'include' })
            .then(r => r.text())
            .then(data => {
              window.postMessage({ type: '${msgId}', data: data }, '*');
            })
            .catch(e => {
              window.postMessage({ type: '${msgId}', data: null, error: e.message }, '*');
            });
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 5000);
    });
  }
  
  // Extract transcript from fetched page HTML (fallback method)
  async function extractTranscript(html, videoId) {
    log('Extracting transcript from fetched HTML...');
    
    try {
      let captionUrl = null;
      let playerResponse = null;
      
      // Method 2a: Extract from ytInitialPlayerResponse in fetched HTML
      log('Looking for ytInitialPlayerResponse in HTML...');
      const patterns = [
        /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let|<\/script>)/s,
        /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s
      ];
      
      for (let i = 0; i < patterns.length; i++) {
        const match = html.match(patterns[i]);
        if (match) {
          log('Pattern', i, 'matched, extracting JSON...');
          try {
            const jsonStr = extractValidJson(match[1]);
            if (jsonStr) {
              log('JSON extracted, length:', jsonStr.length);
              playerResponse = JSON.parse(jsonStr);
              const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
              
              if (captions?.captionTracks?.length) {
                log('Found', captions.captionTracks.length, 'caption tracks in fetched HTML');
                const track = captions.captionTracks.find(t => 
                  t.languageCode === 'en' || t.languageCode?.startsWith('en')
                ) || captions.captionTracks[0];
                captionUrl = track.baseUrl;
                log('Selected track:', track.languageCode);
                break;
              } else {
                logWarn('playerResponse found but no caption tracks');
              }
            }
          } catch (e) {
            logWarn('Pattern', i, 'parse failed:', e.message);
          }
        } else {
          log('Pattern', i, 'did not match');
        }
      }
      
      // Get track info for retry strategies
      let trackInfo = null;
      if (playerResponse) {
        const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
        if (captions?.captionTracks?.length) {
          const track = captions.captionTracks.find(t => 
            t.languageCode === 'en' || t.languageCode?.startsWith('en')
          ) || captions.captionTracks[0];
          trackInfo = {
            languageCode: track.languageCode,
            kind: track.kind,
            baseUrl: track.baseUrl
          };
          log('Track info:', trackInfo.languageCode, trackInfo.kind || '');
        }
      }
      
      // Method 2b: Look for baseUrl directly in HTML
      if (!captionUrl && !trackInfo) {
        log('Looking for baseUrl directly in HTML...');
        const urlMatch = html.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
        if (urlMatch) {
          captionUrl = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
          log('Found baseUrl directly:', captionUrl.substring(0, 80) + '...');
        } else {
          logWarn('No baseUrl found in HTML');
        }
      }
      
      // Method 2c: Try innertube API
      if (!captionUrl && !trackInfo) {
        log('Trying innertube API...');
        const apiResult = await fetchCaptionUrlFromApi(videoId);
        if (apiResult) {
          captionUrl = apiResult.url;
          trackInfo = apiResult.trackInfo;
        }
      }
      
      if (!captionUrl && !trackInfo) {
        logWarn('All methods failed to find caption URL');
        return null;
      }
      
      // Use retry strategies if we have track info
      if (trackInfo) {
        return await fetchTranscriptWithRetries(
          { baseUrl: trackInfo.baseUrl || captionUrl, languageCode: trackInfo.languageCode, kind: trackInfo.kind },
          videoId
        );
      }
      
      // Fallback: just try the URL we have
      const transcriptUrl = captionUrl.includes('&fmt=') ? captionUrl : `${captionUrl}&fmt=json3`;
      log('Fetching transcript from:', transcriptUrl.substring(0, 80) + '...');
      
      const transcriptResponse = await fetch(transcriptUrl);
      log('Transcript fetch status:', transcriptResponse.status);
      
      if (!transcriptResponse.ok) {
        logError('Transcript fetch failed:', transcriptResponse.status);
        return null;
      }
      
      const transcriptText = await transcriptResponse.text();
      log('Transcript text length:', transcriptText.length);
      
      if (transcriptText.length === 0) {
        logWarn('Empty transcript response');
        return null;
      }
      
      log('Transcript preview:', transcriptText.substring(0, 150));
      
      return parseTranscript(transcriptText);
    } catch (error) {
      logError('Transcript extraction error:', error);
      return null;
    }
  }
  
  // Extract valid JSON from string
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
  
  // Fetch caption URL from innertube API
  async function fetchCaptionUrlFromApi(videoId) {
    log('Calling innertube API for video:', videoId);
    
    try {
      const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: { hl: 'en', gl: 'US', clientName: 'WEB', clientVersion: '2.20240101.00.00' }
          },
          videoId: videoId
        })
      });
      
      log('Innertube API response status:', response.status);
      
      if (!response.ok) {
        logError('Innertube API request failed:', response.status);
        return null;
      }
      
      const data = await response.json();
      log('Innertube API response keys:', Object.keys(data));
      
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      
      if (tracks?.length) {
        log('Innertube API found', tracks.length, 'caption tracks');
        const track = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en')) || tracks[0];
        log('Selected track from innertube:', track.languageCode, track.kind || '');
        return {
          url: track.baseUrl,
          trackInfo: {
            languageCode: track.languageCode,
            kind: track.kind,
            baseUrl: track.baseUrl
          }
        };
      } else {
        logWarn('Innertube API: no caption tracks found');
        if (data.playabilityStatus) {
          log('Playability status:', data.playabilityStatus.status, data.playabilityStatus.reason);
        }
      }
    } catch (e) {
      logError('Innertube API error:', e);
    }
    return null;
  }
  
  // Parse transcript XML/JSON
  function parseTranscript(text) {
    log('Parsing transcript data...');
    const segments = [];
    
    // Try JSON3 format first
    if (text.trim().startsWith('{')) {
      log('Detected JSON format');
      try {
        const data = JSON.parse(text);
        log('JSON parsed, keys:', Object.keys(data));
        
        if (data.events) {
          log('Found events array with', data.events.length, 'events');
          let segCount = 0;
          
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
                segCount++;
              }
            }
          }
          log('Extracted', segCount, 'text segments from JSON');
        } else {
          logWarn('JSON has no events array');
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
      logWarn('No segments found in transcript data');
      log('Raw data sample:', text.substring(0, 500));
      return null;
    }
    
    // Merge short consecutive segments for readability
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
    
    log('Final segment count after merging:', merged.length);
    log('Total transcript length:', merged.map(s => s.text).join(' ').length, 'chars');
    
    return {
      segments: merged,
      fullText: merged.map(s => s.text).join(' ')
    };
  }
  
  // Decode HTML entities
  function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
  
  // Format timestamp
  function formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Render transcript
  function renderTranscript(panel) {
    const copyBtn = `
      <button class="yt-ai-copy-btn" id="yt-ai-copy-transcript">
        ${icons.copy}
        <span>Copy transcript</span>
      </button>
    `;
    
    const items = transcript.segments.map(seg => `
      <div class="yt-ai-transcript-item" data-time="${seg.start}">
        <span class="yt-ai-timestamp">${formatTimestamp(seg.start)}</span>
        <span class="yt-ai-transcript-text">${seg.text}</span>
      </div>
    `).join('');
    
    panel.innerHTML = copyBtn + items;
    
    // Add click handlers for timestamps
    panel.querySelectorAll('.yt-ai-transcript-item').forEach(item => {
      item.addEventListener('click', () => {
        const time = parseFloat(item.dataset.time);
        seekVideo(time);
      });
    });
    
    // Copy button handler
    panel.querySelector('#yt-ai-copy-transcript').addEventListener('click', copyTranscript);
  }
  
  // Seek video to time
  function seekVideo(time) {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = time;
    }
  }
  
  // Copy transcript
  function copyTranscript() {
    const text = transcript.segments
      .map(s => `[${formatTimestamp(s.start)}] ${s.text}`)
      .join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      const btn = sidebar.querySelector('#yt-ai-copy-transcript');
      btn.classList.add('copied');
      btn.innerHTML = `${icons.check}<span>Copied!</span>`;
      
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `${icons.copy}<span>Copy transcript</span>`;
      }, 2000);
    });
  }
  
  // Generate summary
  async function generateSummary() {
    log('=== Generate Summary clicked ===');
    
    if (!transcript) {
      logWarn('No transcript available for summary');
      showError('summary', 'No transcript available');
      return;
    }
    
    log('Transcript length:', transcript.fullText?.length, 'chars');
    
    const btn = sidebar.querySelector('#yt-ai-generate-summary');
    const resultDiv = sidebar.querySelector('#yt-ai-summary-result');
    
    btn.disabled = true;
    btn.innerHTML = `<div class="yt-ai-spinner" style="width:20px;height:20px;border-width:2px;margin:0"></div> Generating...`;
    resultDiv.innerHTML = '';
    
    try {
      log('Sending generateSummary message to background script...');
      const response = await chrome.runtime.sendMessage({
        action: 'generateSummary',
        data: {
          transcript: transcript.fullText,
          videoTitle: getVideoTitle()
        }
      });
      
      log('Background script response:', response ? 'received' : 'null/undefined');
      
      if (response.error) {
        logError('Summary generation error:', response.error);
        throw new Error(response.error);
      }
      
      log('Summary generated successfully, length:', response.summary?.length);
      
      btn.style.display = 'none';
      resultDiv.innerHTML = `
        <button class="yt-ai-copy-btn" id="yt-ai-copy-summary">
          ${icons.copy}
          <span>Copy summary</span>
        </button>
        ${marked(response.summary)}
      `;
      
      resultDiv.querySelector('#yt-ai-copy-summary').addEventListener('click', () => {
        copyText(response.summary, '#yt-ai-copy-summary');
      });
      
    } catch (error) {
      logError('generateSummary failed:', error.message);
      showError('summary', error.message);
      btn.disabled = false;
      btn.innerHTML = `${icons.sparkles} Generate Summary`;
    }
  }
  
  // Generate key points
  async function generateKeyPoints() {
    log('=== Extract Key Points clicked ===');
    
    if (!transcript) {
      logWarn('No transcript available for key points');
      showError('keypoints', 'No transcript available');
      return;
    }
    
    log('Transcript length:', transcript.fullText?.length, 'chars');
    
    const btn = sidebar.querySelector('#yt-ai-generate-keypoints');
    const resultDiv = sidebar.querySelector('#yt-ai-keypoints-result');
    
    btn.disabled = true;
    btn.innerHTML = `<div class="yt-ai-spinner" style="width:20px;height:20px;border-width:2px;margin:0"></div> Extracting...`;
    resultDiv.innerHTML = '';
    
    try {
      log('Sending extractKeyPoints message to background script...');
      const response = await chrome.runtime.sendMessage({
        action: 'extractKeyPoints',
        data: {
          transcript: transcript.fullText
        }
      });
      
      log('Background script response:', response ? 'received' : 'null/undefined');
      
      if (response.error) {
        logError('Key points extraction error:', response.error);
        throw new Error(response.error);
      }
      
      log('Key points extracted successfully, length:', response.keyPoints?.length);
      
      btn.style.display = 'none';
      resultDiv.innerHTML = `
        <button class="yt-ai-copy-btn" id="yt-ai-copy-keypoints">
          ${icons.copy}
          <span>Copy key points</span>
        </button>
        ${marked(response.keyPoints)}
      `;
      
      resultDiv.querySelector('#yt-ai-copy-keypoints').addEventListener('click', () => {
        copyText(response.keyPoints, '#yt-ai-copy-keypoints');
      });
      
    } catch (error) {
      logError('generateKeyPoints failed:', error.message);
      showError('keypoints', error.message);
      btn.disabled = false;
      btn.innerHTML = `${icons.sparkles} Extract Key Points`;
    }
  }
  
  // Send chat message
  async function sendChatMessage() {
    const input = sidebar.querySelector('#yt-ai-chat-input');
    const message = input.value.trim();
    
    log('=== Chat message sent ===');
    log('Message:', message?.substring(0, 50) + (message?.length > 50 ? '...' : ''));
    
    if (!message || !transcript) {
      logWarn('Chat aborted: no message or transcript', { hasMessage: !!message, hasTranscript: !!transcript });
      return;
    }
    
    const messagesDiv = sidebar.querySelector('#yt-ai-chat-messages');
    const sendBtn = sidebar.querySelector('#yt-ai-chat-send');
    
    // Clear empty state
    messagesDiv.querySelector('.yt-ai-empty')?.remove();
    
    // Add user message
    messagesDiv.innerHTML += `
      <div class="yt-ai-chat-message user">
        <div class="yt-ai-chat-bubble">${escapeHtml(message)}</div>
      </div>
    `;
    
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Add loading indicator
    const loadingId = 'yt-ai-chat-loading';
    messagesDiv.innerHTML += `
      <div class="yt-ai-chat-message assistant" id="${loadingId}">
        <div class="yt-ai-chat-bubble">
          <div class="yt-ai-spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div>
        </div>
      </div>
    `;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    try {
      log('Sending chat message to background script...');
      const response = await chrome.runtime.sendMessage({
        action: 'chat',
        data: {
          transcript: transcript.fullText,
          message,
          videoId: currentVideoId
        }
      });
      
      log('Background script response:', response ? 'received' : 'null/undefined');
      
      if (response.error) {
        logError('Chat error:', response.error);
        throw new Error(response.error);
      }
      
      log('Chat response received, length:', response.response?.length);
      
      // Remove loading
      document.getElementById(loadingId)?.remove();
      
      // Add assistant response
      messagesDiv.innerHTML += `
        <div class="yt-ai-chat-message assistant">
          <div class="yt-ai-chat-bubble">${marked(response.response)}</div>
        </div>
      `;
      
      chatHistory = response.history;
      
    } catch (error) {
      logError('sendChatMessage failed:', error.message);
      document.getElementById(loadingId)?.remove();
      messagesDiv.innerHTML += `
        <div class="yt-ai-chat-message assistant">
          <div class="yt-ai-chat-bubble" style="color: var(--sidebar-error)">
            Error: ${escapeHtml(error.message)}
          </div>
        </div>
      `;
    }
    
    sendBtn.disabled = false;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  
  // Show error
  function showError(panel, message) {
    const resultDiv = sidebar.querySelector(`#yt-ai-${panel}-result`);
    resultDiv.innerHTML = `
      <div class="yt-ai-error">
        <div class="yt-ai-error-title">Error</div>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
  
  // Copy text helper
  function copyText(text, buttonSelector) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = sidebar.querySelector(buttonSelector);
      btn.classList.add('copied');
      btn.innerHTML = `${icons.check}<span>Copied!</span>`;
      
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `${icons.copy}<span>Copy</span>`;
      }, 2000);
    });
  }
  
  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Simple markdown parser
  function marked(text) {
    if (!text) return '';
    
    return text
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```[\s\S]*?```/g, match => {
        const code = match.slice(3, -3).trim();
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
      })
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Unordered lists
      .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
      // Ordered lists
      .replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // Wrap in paragraphs
      .replace(/^(.+)$/gm, (match) => {
        if (match.startsWith('<')) return match;
        return match;
      });
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request.action);
    
    if (request.action === 'getTranscript') {
      const title = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata')?.textContent?.trim() || '';
      log('Returning transcript to popup, has transcript:', !!transcript);
      sendResponse({ 
        transcript: transcript,
        title: title,
        videoId: currentVideoId
      });
    }
    
    if (request.action === 'ping') {
      sendResponse({ status: 'ok', videoId: currentVideoId, hasTranscript: !!transcript });
    }
    
    return true;
  });
  
  // Watch for navigation (YouTube is SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('URL changed to:', location.href);
      if (location.pathname === '/watch') {
        setTimeout(init, 1000); // Wait for page to load
      } else if (sidebar) {
        log('Not a watch page, removing sidebar');
        sidebar.remove();
        sidebar = null;
      }
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Initial load
  log('Content script loaded on:', location.pathname);
  if (location.pathname === '/watch') {
    // Wait for page to be ready
    if (document.readyState === 'complete') {
      log('Document ready, initializing...');
      init();
    } else {
      log('Waiting for document load...');
      window.addEventListener('load', () => {
        log('Document loaded, initializing...');
        init();
      });
    }
  } else {
    log('Not a watch page, waiting for navigation');
  }
})();
