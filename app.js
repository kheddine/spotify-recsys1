// Global state
let recsys = null;
let llm = null;
let transformer = null;
let HF_API_KEY = '';

const moodKeywords = [
  'energetic', 'sad', 'acoustic', 'chill', 'dance', 'electronic',
  'upbeat', 'melancholic', 'relaxing', 'happy', 'slow', 'fast', 'quiet'
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  const initBtn = document.getElementById('initBtn');
  const apiKeyInput = document.getElementById('apiKey');
  
  if (initBtn) {
    initBtn.addEventListener('click', initializeSystem);
  }
  
  if (apiKeyInput) {
    apiKeyInput.addEventListener('change', function() {
      HF_API_KEY = this.value.trim();
    });
  }
});

// Load CSV from GitHub repository
async function initializeSystem() {
  try {
    const setupPanel = document.getElementById('setupPanel');
    const statusDiv = setupPanel.querySelector('.input-group');
    
    statusDiv.innerHTML = '<p style="font-size: 14px; color: #333; margin: 20px 0;"><span class="loading"></span> Loading data from GitHub...</p>';

    // GitHub raw content URL
    const csvUrl = 'https://raw.githubusercontent.com/kheddine/spotify-recsys1/main/data.csv';
    
    console.log('Fetching CSV from GitHub...');
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to load CSV: ${response.status}`);
    }

    const csvText = await response.text();
    console.log(`CSV loaded: ${csvText.length} bytes`);

    const df = loadData(csvText);
    if (!df || df.length === 0) {
      throw new Error('Failed to parse CSV data');
    }

    console.log(`Creating recommendation system with ${df.length} tracks...`);
    
    recsys = new SpotifyRecSysConstrained(df);
    llm = new HuggingFaceLLM(HF_API_KEY);

    const initialIndices = getRandomIndices(df.length, Math.min(5, df.length));
    transformer = new PlaylistTransformer(recsys, llm);
    transformer.setInitialPlaylist(initialIndices);

    showInitialPlaylist(initialIndices);
    document.getElementById('setupPanel').classList.remove('active');
    document.getElementById('chatArea').style.display = 'flex';
    populateMoodKeywords();
    updatePlaylistDisplay();
    document.getElementById('userInput').focus();
    
    console.log('✓ RecSys ready!');
  } catch (e) {
    alert('Error: ' + e.message + '\n\nMake sure data.csv is in your GitHub repository.');
    console.error(e);
  }
}

// Parse CSV data - with sampling for large files
function loadData(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const MAX_TRACKS = 5000; // Limit to 5000 tracks for browser performance
  const data = [];
  
  // If file is too large, sample it
  const sampleRate = Math.max(1, Math.ceil((lines.length - 1) / MAX_TRACKS));
  
  console.log(`CSV has ${lines.length - 1} lines, sampling every ${sampleRate}th row`);
  
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    // Skip lines based on sample rate
    if (sampleRate > 1 && lineIdx % sampleRate !== 0 && lineIdx !== 1) continue;
    
    const line = lines[lineIdx];
    if (!line.trim()) continue;
    
    const values = line.split(',').map(v => v.trim());
    const obj = {};

    for (let i = 0; i < headers.length; i++) {
      const value = values[i];
      obj[headers[i]] = isNaN(value) || value === '' ? value : parseFloat(value);
    }

    data.push(obj);
    
    if (data.length >= MAX_TRACKS) break;
  }

  console.log(`Loaded ${data.length} tracks`);
  return data;
}

// Get random indices for initial playlist
function getRandomIndices(max, count) {
  const indices = new Set();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * max));
  }
  return Array.from(indices);
}

// Display initial playlist
function showInitialPlaylist(indices) {
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'message bot';

  let html = '<div class="content"><strong>🎵 Initial Playlist (' + indices.length + ' tracks):</strong>';
  for (const idx of indices) {
    const info = recsys.getTrackInfo(idx);
    html += `<div style="margin-top: 8px; font-size: 13px;">• ${escapeHtml(info.name)} - ${escapeHtml(info.artist)}</div>`;
  }
  html += '</div>';

  msg.innerHTML = html;
  messagesDiv.appendChild(msg);
}

// Populate mood keyword buttons
function populateMoodKeywords() {
  const container = document.getElementById('moodKeywords');
  container.innerHTML = moodKeywords
    .map(kw => `<button class="mood-tag" onclick="insertKeyword('${kw}')">${kw}</button>`)
    .join('');
}

// Insert keyword into input
function insertKeyword(keyword) {
  const input = document.getElementById('userInput');
  input.value = (input.value + ' ' + keyword).trim();
  input.focus();
}

// Send message and get recommendations
async function sendMessage() {
  const input = document.getElementById('userInput');
  const userMessage = input.value.trim();

  if (!userMessage || !transformer) return;

  input.value = '';
  addMessageToChat(userMessage, 'user');
  showStatus(true);

  try {
    const result = await transformer.chat(userMessage);
    addMessageToChat(result, 'bot');
  } catch (e) {
    addMessageToChat('Error: ' + e.message, 'bot');
    console.error(e);
  }

  showStatus(false);
}

// Add message to chat
function addMessageToChat(content, role) {
  const messagesDiv = document.getElementById('messages');
  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  if (role === 'user') {
    msg.innerHTML = `<div class="content">${escapeHtml(content)}</div>`;
  } else if (typeof content === 'string') {
    msg.innerHTML = `<div class="content">${escapeHtml(content)}</div>`;
  } else {
    let html = '<div class="content"><div><strong>' + escapeHtml(content.interpretation) + '</strong></div>';

    if (content.newRecommendations && content.newRecommendations.length > 0) {
      html += '<div class="recommendations"><strong style="color: #667eea; display: block; margin-bottom: 8px;">🎵 Recommendations:</strong>';

      content.newRecommendations.slice(0, 5).forEach((track, i) => {
        html += `<div class="recommendation-item">
          <strong>${i + 1}. ${escapeHtml(track.name)}</strong><br>
          ${escapeHtml(track.artist)} | ${escapeHtml(track.genre)}<br>
          <span style="color: #999; font-size: 12px;">Similarity: ${track.similarity}</span>
          <button onclick="addToPlaylist(${track.index}, '${escapeHtml(track.name)}', '${escapeHtml(track.artist)}')" style="display: block; margin-top: 5px; padding: 3px 8px; background: #667eea; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">+ Add</button>
        </div>`;
      });

      html += '</div>';
    }

    html += '</div>';
    msg.innerHTML = html;
  }

  messagesDiv.appendChild(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Add track to playlist
function addToPlaylist(trackIndex, trackName, artistName) {
  if (!transformer) return;
  
  transformer.addTracksToPlaylist([trackIndex]);
  
  // Update playlist display
  updatePlaylistDisplay();
  
  // Show notification
  showStatus(true);
  document.getElementById('status').innerHTML = '<span style="color: green;">✓ Added to playlist!</span>';
  setTimeout(() => {
    document.getElementById('status').classList.remove('active');
  }, 2000);
}

// Update playlist display
function updatePlaylistDisplay() {
  const playlistDisplay = document.getElementById('playlistDisplay');
  const playlistCount = document.getElementById('playlistCount');
  
  if (!transformer) return;
  
  const playlist = transformer.currentPlaylist;
  playlistCount.textContent = playlist.length;
  
  let html = '';
  playlist.slice(-10).reverse().forEach(idx => {
    const info = recsys.getTrackInfo(idx);
    html += `<div style="padding: 4px 0; border-bottom: 1px solid #eee;">
      • ${escapeHtml(info.name)} - ${escapeHtml(info.artist)}
    </div>`;
  });
  
  playlistDisplay.innerHTML = html || '<p style="color: #ccc;">No tracks yet</p>';
}

// Show/hide loading status
function showStatus(show) {
  document.getElementById('status').classList.toggle('active', show);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Reset chat
function resetChat() {
  if (transformer) {
    document.getElementById('messages').innerHTML = '';
    document.getElementById('userInput').value = '';
    document.getElementById('userInput').focus();
    showInitialPlaylist(transformer.currentPlaylist.slice(0, 5));
    updatePlaylistDisplay();
  }
}

// Enter key to send message
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && document.getElementById('userInput') === document.activeElement) {
    sendMessage();
  }
});
