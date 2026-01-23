// Background Service Worker
// Handles message passing and API coordination

import { getApiKey, getChatHistory, saveChatHistory } from '../lib/storage.js';
import { 
  generateSummary, 
  extractKeyPoints, 
  generateTimestamps, 
  chatWithContent,
  truncateTranscript 
} from '../lib/gemini.js';

// Debug logging - view in chrome://extensions -> service worker -> Inspect
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[YT-AI BG]', ...args);
const logError = (...args) => console.error('[YT-AI BG ERROR]', ...args);

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('Received message:', request.action);
  
  handleMessage(request, sender)
    .then(response => {
      log('Sending response for:', request.action, response?.error ? '(error)' : '(success)');
      sendResponse(response);
    })
    .catch(error => {
      logError('Handler error for', request.action, ':', error.message);
      sendResponse({ error: error.message });
    });
  
  // Return true to indicate async response
  return true;
});

async function handleMessage(request, sender) {
  const { action, data } = request;
  
  switch (action) {
    case 'getApiKey':
      return { apiKey: await getApiKey() };
    
    case 'generateSummary':
      return await handleGenerateSummary(data);
    
    case 'extractKeyPoints':
      return await handleExtractKeyPoints(data);
    
    case 'generateTimestamps':
      return await handleGenerateTimestamps(data);
    
    case 'chat':
      return await handleChat(data);
    
    case 'getChatHistory':
      return { history: await getChatHistory(data.videoId) };
    
    case 'saveChatHistory':
      await saveChatHistory(data.videoId, data.history);
      return { success: true };
    
    case 'openSettings':
      chrome.runtime.openOptionsPage();
      return { success: true };
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function handleGenerateSummary({ transcript, videoTitle }) {
  log('handleGenerateSummary called');
  log('  Transcript length:', transcript?.length, 'chars');
  log('  Video title:', videoTitle?.substring(0, 50));
  
  const apiKey = await getApiKey();
  log('  API key:', apiKey ? 'present (' + apiKey.substring(0, 8) + '...)' : 'MISSING');
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  const truncatedTranscript = truncateTranscript(transcript);
  log('  Truncated transcript length:', truncatedTranscript?.length, 'chars');
  
  log('  Calling Gemini API...');
  const summary = await generateSummary(apiKey, truncatedTranscript, videoTitle);
  log('  Summary generated, length:', summary?.length, 'chars');
  
  return { summary };
}

async function handleExtractKeyPoints({ transcript }) {
  log('handleExtractKeyPoints called');
  log('  Transcript length:', transcript?.length, 'chars');
  
  const apiKey = await getApiKey();
  log('  API key:', apiKey ? 'present' : 'MISSING');
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  const truncatedTranscript = truncateTranscript(transcript);
  log('  Truncated transcript length:', truncatedTranscript?.length, 'chars');
  
  log('  Calling Gemini API...');
  const keyPoints = await extractKeyPoints(apiKey, truncatedTranscript);
  log('  Key points extracted, length:', keyPoints?.length, 'chars');
  
  return { keyPoints };
}

async function handleGenerateTimestamps({ timestampedTranscript }) {
  log('handleGenerateTimestamps called');
  
  const apiKey = await getApiKey();
  log('  API key:', apiKey ? 'present' : 'MISSING');
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  const truncated = truncateTranscript(timestampedTranscript);
  
  log('  Calling Gemini API...');
  const timestamps = await generateTimestamps(apiKey, truncated);
  log('  Timestamps generated');
  
  return { timestamps };
}

async function handleChat({ transcript, message, videoId }) {
  log('handleChat called');
  log('  Message:', message?.substring(0, 50));
  log('  Video ID:', videoId);
  
  const apiKey = await getApiKey();
  log('  API key:', apiKey ? 'present' : 'MISSING');
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  // Get existing chat history
  const history = await getChatHistory(videoId);
  log('  Chat history length:', history?.length || 0);
  
  // Generate response
  const truncatedTranscript = truncateTranscript(transcript);
  log('  Calling Gemini API...');
  const response = await chatWithContent(apiKey, truncatedTranscript, message, history);
  log('  Response received, length:', response?.length, 'chars');
  
  // Save updated history
  const newHistory = [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content: response }
  ];
  
  // Keep only last 20 messages to prevent storage bloat
  const trimmedHistory = newHistory.slice(-20);
  await saveChatHistory(videoId, trimmedHistory);
  
  return { response, history: trimmedHistory };
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open settings page on first install
    chrome.runtime.openOptionsPage();
  }
});

// Handle clicking the extension icon when not on YouTube
chrome.action.onClicked.addListener((tab) => {
  // This fires when popup is not defined, which won't happen for us
  // But keeping for potential future use
});

