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

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));
  
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
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  const truncatedTranscript = truncateTranscript(transcript);
  const summary = await generateSummary(apiKey, truncatedTranscript, videoTitle);
  
  return { summary };
}

async function handleExtractKeyPoints({ transcript }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  const truncatedTranscript = truncateTranscript(transcript);
  const keyPoints = await extractKeyPoints(apiKey, truncatedTranscript);
  
  return { keyPoints };
}

async function handleGenerateTimestamps({ timestampedTranscript }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  const truncated = truncateTranscript(timestampedTranscript);
  const timestamps = await generateTimestamps(apiKey, truncated);
  
  return { timestamps };
}

async function handleChat({ transcript, message, videoId }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key in settings.');
  }
  
  // Get existing chat history
  const history = await getChatHistory(videoId);
  
  // Generate response
  const truncatedTranscript = truncateTranscript(transcript);
  const response = await chatWithContent(apiKey, truncatedTranscript, message, history);
  
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

