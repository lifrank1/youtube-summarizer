// Settings Page JavaScript
import { 
  getApiKey, 
  saveApiKey, 
  removeApiKey,
  clearChatHistory, 
  clearAllData 
} from '../lib/storage.js';
import { testApiKey } from '../lib/gemini.js';

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const toggleVisibilityBtn = document.getElementById('toggleVisibility');
const eyeIcon = document.getElementById('eyeIcon');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const testApiKeyBtn = document.getElementById('testApiKey');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const clearChatHistoryBtn = document.getElementById('clearChatHistory');
const clearAllDataBtn = document.getElementById('clearAllData');

// Eye icons for password visibility
const eyeOpenPath = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
const eyeClosedPath = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

// Initialize settings on load
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
});

// Load existing settings
async function loadSettings() {
  // Load API key
  const apiKey = await getApiKey();
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
  
}

// Toggle password visibility
toggleVisibilityBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  eyeIcon.innerHTML = isPassword ? eyeClosedPath : eyeOpenPath;
});

// Save API Key
saveApiKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  saveApiKeyBtn.disabled = true;
  saveApiKeyBtn.textContent = 'Saving...';
  
  const success = await saveApiKey(apiKey);
  
  if (success) {
    showStatus('API key saved successfully!', 'success');
  } else {
    showStatus('Failed to save API key', 'error');
  }
  
  saveApiKeyBtn.disabled = false;
  saveApiKeyBtn.textContent = 'Save Key';
});

// Test API Key
testApiKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter an API key to test', 'error');
    return;
  }
  
  testApiKeyBtn.disabled = true;
  testApiKeyBtn.textContent = 'Testing...';
  
  const result = await testApiKey(apiKey);
  
  if (result.valid) {
    showStatus('API key is valid and working!', 'success');
  } else {
    showStatus(`Invalid API key: ${result.error}`, 'error');
  }
  
  testApiKeyBtn.disabled = false;
  testApiKeyBtn.textContent = 'Test Key';
});

// Show status message
function showStatus(message, type) {
  apiKeyStatus.textContent = message;
  apiKeyStatus.className = `status-message ${type}`;
  
  // Hide after 5 seconds
  setTimeout(() => {
    apiKeyStatus.classList.add('hidden');
  }, 5000);
}

// Clear chat history
clearChatHistoryBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all chat history?')) {
    const success = await clearChatHistory();
    if (success) {
      showStatus('Chat history cleared', 'success');
    } else {
      showStatus('Failed to clear chat history', 'error');
    }
  }
});

// Clear all data
clearAllDataBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear ALL extension data? This includes your API key and all settings.')) {
    const success = await clearAllData();
    if (success) {
      apiKeyInput.value = '';
      showStatus('All data cleared', 'success');
    } else {
      showStatus('Failed to clear data', 'error');
    }
  }
});

