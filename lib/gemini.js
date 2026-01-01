// Gemini API Integration
// Handles AI-powered summarization, key points extraction, and chat

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash';

/**
 * Make a request to Gemini API
 * @param {string} apiKey 
 * @param {string} prompt 
 * @param {Array} history - Optional chat history
 * @returns {Promise<string>}
 */
async function callGemini(apiKey, prompt, history = []) {
  const url = `${GEMINI_API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`;
  
  const contents = [];
  
  // Add chat history if provided
  for (const msg of history) {
    contents.push({
      role: msg.role,
      parts: [{ text: msg.content }]
    });
  }
  
  // Add current prompt
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API request failed');
  }
  
  const data = await response.json();
  
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response generated');
  }
  
  return data.candidates[0].content.parts[0].text;
}

/**
 * Generate a summary of the transcript
 * @param {string} apiKey 
 * @param {string} transcript 
 * @param {string} videoTitle - Optional video title for context
 * @returns {Promise<string>}
 */
export async function generateSummary(apiKey, transcript, videoTitle = '') {
  const prompt = `You are an expert content summarizer. Please provide a concise but comprehensive summary of the following YouTube video transcript.

${videoTitle ? `Video Title: ${videoTitle}\n\n` : ''}Transcript:
${transcript}

Please provide:
1. A brief overview (2-3 sentences)
2. Main topics covered
3. Key conclusions or takeaways

Format the response in a clear, readable manner using markdown.`;

  return callGemini(apiKey, prompt);
}

/**
 * Extract key points from the transcript
 * @param {string} apiKey 
 * @param {string} transcript 
 * @returns {Promise<string>}
 */
export async function extractKeyPoints(apiKey, transcript) {
  const prompt = `Analyze the following YouTube video transcript and extract the most important key points.

Transcript:
${transcript}

Please provide:
- 5-10 key points that capture the essential information
- Each point should be concise but informative
- Order them by importance or chronologically as appropriate

Format as a bulleted list using markdown.`;

  return callGemini(apiKey, prompt);
}

/**
 * Generate important timestamps/moments from the transcript
 * @param {string} apiKey 
 * @param {string} timestampedTranscript - Transcript with timestamps
 * @returns {Promise<string>}
 */
export async function generateTimestamps(apiKey, timestampedTranscript) {
  const prompt = `Analyze the following timestamped YouTube video transcript and identify the most important moments.

Transcript with timestamps:
${timestampedTranscript}

Please identify 5-10 key moments in the video with their timestamps. For each moment:
- Include the exact timestamp from the transcript
- Provide a brief description of what happens at that point
- Explain why this moment is significant

Format each entry as:
**[TIMESTAMP]** - Description of the key moment

List them in chronological order.`;

  return callGemini(apiKey, prompt);
}

/**
 * Chat with the video content
 * @param {string} apiKey 
 * @param {string} transcript 
 * @param {string} userMessage 
 * @param {Array} chatHistory 
 * @returns {Promise<string>}
 */
export async function chatWithContent(apiKey, transcript, userMessage, chatHistory = []) {
  // Build context with transcript
  const systemContext = `You are a helpful assistant that answers questions about a YouTube video based on its transcript. You have access to the full transcript and should provide accurate, helpful responses based on the video content.

Video Transcript:
${transcript}

---

When answering:
- Reference specific parts of the transcript when relevant
- If the question cannot be answered from the transcript, say so
- Be concise but thorough
- Include timestamps if they help answer the question`;

  // Format history for Gemini
  const formattedHistory = [];
  
  // Add system context as first user message
  formattedHistory.push({
    role: 'user',
    content: systemContext
  });
  formattedHistory.push({
    role: 'model',
    content: 'I have reviewed the video transcript and I\'m ready to answer your questions about the content. What would you like to know?'
  });
  
  // Add previous chat messages
  for (const msg of chatHistory) {
    formattedHistory.push({
      role: msg.role === 'user' ? 'user' : 'model',
      content: msg.content
    });
  }
  
  return callGemini(apiKey, userMessage, formattedHistory);
}

/**
 * Test if the API key is valid
 * @param {string} apiKey 
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function testApiKey(apiKey) {
  try {
    const response = await callGemini(apiKey, 'Say "API key is valid" in exactly those words.');
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Truncate transcript if too long for API
 * @param {string} transcript 
 * @param {number} maxChars 
 * @returns {string}
 */
export function truncateTranscript(transcript, maxChars = 100000) {
  if (transcript.length <= maxChars) {
    return transcript;
  }
  
  // Truncate and add notice
  const truncated = transcript.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return truncated.substring(0, lastSpace) + '\n\n[Transcript truncated due to length]';
}

