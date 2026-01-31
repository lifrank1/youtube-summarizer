// Storage utility for Chrome extension
// Handles API key and settings persistence

const STORAGE_KEYS = {
  API_KEY: 'gemini_api_key',
  SETTINGS: 'extension_settings',
  CHAT_HISTORY: 'chat_history',
  VIDEO_CACHE: 'video_cache'  // Stores transcripts and summaries per video
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

// ============================================
// Video Cache (Transcripts & Summaries)
// ============================================

const MAX_CACHED_VIDEOS = 50;  // Keep last 50 videos

/**
 * Get cached data for a video
 * @param {string} videoId 
 * @returns {Promise<{transcript: object|null, summary: string|null, cachedAt: number|null}>}
 */
export async function getVideoCache(videoId) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.VIDEO_CACHE);
    const cache = result[STORAGE_KEYS.VIDEO_CACHE] || {};
    
    // Update lastAccessed timestamp
    if (cache[videoId]) {
      cache[videoId].lastAccessed = Date.now();
      await chrome.storage.local.set({ [STORAGE_KEYS.VIDEO_CACHE]: cache });
    }
    
    return cache[videoId] || { transcript: null, summary: null, cachedAt: null };
  } catch (error) {
    console.error('Error getting video cache:', error);
    return { transcript: null, summary: null, cachedAt: null };
  }
}

/**
 * Evict oldest entries if cache exceeds max size (LRU)
 */
async function evictOldEntries(cache) {
  const videoIds = Object.keys(cache);
  
  if (videoIds.length <= MAX_CACHED_VIDEOS) {
    return cache;
  }
  
  // Sort by lastAccessed (oldest first)
  const sorted = videoIds.sort((a, b) => {
    const timeA = cache[a].lastAccessed || cache[a].cachedAt || 0;
    const timeB = cache[b].lastAccessed || cache[b].cachedAt || 0;
    return timeA - timeB;
  });
  
  // Remove oldest entries
  const toRemove = sorted.slice(0, videoIds.length - MAX_CACHED_VIDEOS);
  for (const id of toRemove) {
    delete cache[id];
  }
  
  console.log(`[YT-AI Cache] Evicted ${toRemove.length} old entries`);
  return cache;
}

/**
 * Save transcript to cache
 * @param {string} videoId 
 * @param {object} transcript - { segments, fullText, language }
 * @returns {Promise<boolean>}
 */
export async function cacheTranscript(videoId, transcript) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.VIDEO_CACHE);
    let cache = result[STORAGE_KEYS.VIDEO_CACHE] || {};
    
    cache[videoId] = {
      ...cache[videoId],
      transcript,
      cachedAt: Date.now(),
      lastAccessed: Date.now()
    };
    
    // Evict old entries if needed
    cache = await evictOldEntries(cache);
    
    await chrome.storage.local.set({ [STORAGE_KEYS.VIDEO_CACHE]: cache });
    return true;
  } catch (error) {
    console.error('Error caching transcript:', error);
    return false;
  }
}

/**
 * Save summary to cache
 * @param {string} videoId 
 * @param {string} summary 
 * @returns {Promise<boolean>}
 */
export async function cacheSummary(videoId, summary) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.VIDEO_CACHE);
    let cache = result[STORAGE_KEYS.VIDEO_CACHE] || {};
    
    cache[videoId] = {
      ...cache[videoId],
      summary,
      cachedAt: Date.now(),
      lastAccessed: Date.now()
    };
    
    // Evict old entries if needed
    cache = await evictOldEntries(cache);
    
    await chrome.storage.local.set({ [STORAGE_KEYS.VIDEO_CACHE]: cache });
    return true;
  } catch (error) {
    console.error('Error caching summary:', error);
    return false;
  }
}

/**
 * Clear video cache (all or specific video)
 * @param {string|null} videoId - If null, clears all video cache
 * @returns {Promise<boolean>}
 */
export async function clearVideoCache(videoId = null) {
  try {
    if (videoId) {
      const result = await chrome.storage.local.get(STORAGE_KEYS.VIDEO_CACHE);
      const cache = result[STORAGE_KEYS.VIDEO_CACHE] || {};
      delete cache[videoId];
      await chrome.storage.local.set({ [STORAGE_KEYS.VIDEO_CACHE]: cache });
    } else {
      await chrome.storage.local.remove(STORAGE_KEYS.VIDEO_CACHE);
    }
    return true;
  } catch (error) {
    console.error('Error clearing video cache:', error);
    return false;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<{videoCount: number, totalSize: string}>}
 */
export async function getCacheStats() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.VIDEO_CACHE);
    const cache = result[STORAGE_KEYS.VIDEO_CACHE] || {};
    const videoCount = Object.keys(cache).length;
    const totalSize = JSON.stringify(cache).length;
    
    return {
      videoCount,
      totalSize: totalSize > 1024 * 1024 
        ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB`
        : `${(totalSize / 1024).toFixed(1)} KB`
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { videoCount: 0, totalSize: '0 KB' };
  }
}

export { STORAGE_KEYS, DEFAULT_SETTINGS };

