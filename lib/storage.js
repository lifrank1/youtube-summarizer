// Storage utility for Chrome extension
// Handles API key and settings persistence

const STORAGE_KEYS = {
  API_KEY: 'gemini_api_key',
  SETTINGS: 'extension_settings',
  CHAT_HISTORY: 'chat_history'
};

const DEFAULT_SETTINGS = {
  sidebarPosition: 'right',
  autoSummarize: false,
  theme: 'dark'
};

/**
 * Get the Gemini API key from storage
 * @returns {Promise<string|null>}
 */
export async function getApiKey() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
    return result[STORAGE_KEYS.API_KEY] || null;
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Save the Gemini API key to storage
 * @param {string} apiKey 
 * @returns {Promise<boolean>}
 */
export async function saveApiKey(apiKey) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey });
    return true;
  } catch (error) {
    console.error('Error saving API key:', error);
    return false;
  }
}

/**
 * Remove the API key from storage
 * @returns {Promise<boolean>}
 */
export async function removeApiKey() {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.API_KEY);
    return true;
  } catch (error) {
    console.error('Error removing API key:', error);
    return false;
  }
}

/**
 * Get extension settings
 * @returns {Promise<object>}
 */
export async function getSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
  } catch (error) {
    console.error('Error getting settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings
 * @param {object} settings 
 * @returns {Promise<boolean>}
 */
export async function saveSettings(settings) {
  try {
    const current = await getSettings();
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: { ...current, ...settings }
    });
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

/**
 * Get chat history for a video
 * @param {string} videoId 
 * @returns {Promise<Array>}
 */
export async function getChatHistory(videoId) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
    const allHistory = result[STORAGE_KEYS.CHAT_HISTORY] || {};
    return allHistory[videoId] || [];
  } catch (error) {
    console.error('Error getting chat history:', error);
    return [];
  }
}

/**
 * Save chat history for a video
 * @param {string} videoId 
 * @param {Array} history 
 * @returns {Promise<boolean>}
 */
export async function saveChatHistory(videoId, history) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
    const allHistory = result[STORAGE_KEYS.CHAT_HISTORY] || {};
    allHistory[videoId] = history;
    await chrome.storage.local.set({ [STORAGE_KEYS.CHAT_HISTORY]: allHistory });
    return true;
  } catch (error) {
    console.error('Error saving chat history:', error);
    return false;
  }
}

/**
 * Clear all chat history
 * @returns {Promise<boolean>}
 */
export async function clearChatHistory() {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.CHAT_HISTORY);
    return true;
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return false;
  }
}

/**
 * Clear all extension data
 * @returns {Promise<boolean>}
 */
export async function clearAllData() {
  try {
    await chrome.storage.local.clear();
    return true;
  } catch (error) {
    console.error('Error clearing all data:', error);
    return false;
  }
}

export { STORAGE_KEYS, DEFAULT_SETTINGS };

