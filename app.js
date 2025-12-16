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
    let html = '<div class="content"><div><strong>🎵 ' + escapeHtml(content.interpretation) + '</strong></div>';

    if (content.newRecommendations && content.newRecommendations.length > 0) {
      html += '<div class="recommendations"><strong style="color: #667eea; display: block; margin-bottom: 12px;">Top Recommendations:</strong>';

      content.newRecommendations.slice(0, 5).forEach((track, i) => {
        const matchPercent = Math.round(track.similarity * 100);
        const barLength = Math.round(track.similarity * 20);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        
        html += `
          <div class="recommendation-item">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div style="flex: 1;">
                <strong style="color: #667eea; font-size: 14px;">${i + 1}. ${escapeHtml(track.name)}</strong><br>
                <span style="color: #999; font-size: 12px;">${escapeHtml(track.artist)}</span><br>
                <span style="color: #999; font-size: 11px;">🎼 ${escapeHtml(track.genre)}</span>
              </div>
              <div style="text-align: right; margin-left: 10px;">
                <span style="font-weight: bold; color: #667eea; font-size: 14px;">${matchPercent}%</span><br>
                <span style="font-size: 10px; color: #999;">${bar}</span>
              </div>
            </div>
            <button onclick="addToPlaylist(${track.index}, '${escapeHtml(track.name)}', '${escapeHtml(track.artist)}')" style="margin-top: 8px; padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; width: 100%;">+ Add to Playlist</button>
          </div>
        `;
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
  
  // Show notification with track details
  showStatus(true);
  document.getElementById('status').innerHTML = `
    <span style="color: #4CAF50;">✓ Added: <strong>${escapeHtml(trackName)}</strong> - ${escapeHtml(artistName)}</span>
  `;
  setTimeout(() => {
    document.getElementById('status').classList.remove('active');
  }, 3000);
}

// Update playlist display
function updatePlaylistDisplay() {
  const playlistDisplay = document.getElementById('playlistDisplay');
  const playlistCount = document.getElementById('playlistCount');
  
  if (!transformer) return;
  
  const playlist = transformer.currentPlaylist;
  playlistCount.textContent = playlist.length;
  
  let html = '';
  
  if (playlist.length === 0) {
    html = '<p style="color: #ccc; font-size: 11px;">No tracks yet. Add some!</p>';
  } else {
    // Show last 15 tracks (most recent first)
    const recentTracks = playlist.slice(-15).reverse();
    recentTracks.forEach((idx, position) => {
      const info = recsys.getTrackInfo(idx);
      html += `
        <div style="padding: 6px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12px; font-weight: 500; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(info.name)}
            </div>
            <div style="font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(info.artist)}
            </div>
          </div>
          <button onclick="removeFromPlaylist(${idx})" style="margin-left: 5px; padding: 2px 5px; background: #ff4444; color: white; border: none; border-radius: 2px; cursor: pointer; font-size: 10px; white-space: nowrap;">✕</button>
        </div>
      `;
    });
  }
  
  playlistDisplay.innerHTML = html;
}

// Remove track from playlist
function removeFromPlaylist(trackIndex) {
  if (!transformer) return;
  
  const idx = transformer.currentPlaylist.indexOf(trackIndex);
  if (idx > -1) {
    transformer.currentPlaylist.splice(idx, 1);
    updatePlaylistDisplay();
    
    // Show feedback
    showStatus(true);
    document.getElementById('status').innerHTML = '<span style="color: #ff4444;">✓ Removed from playlist</span>';
    setTimeout(() => {
      document.getElementById('status').classList.remove('active');
    }, 2000);
  }
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
