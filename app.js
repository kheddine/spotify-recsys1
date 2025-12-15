// Global state
let recsys = null;
let llm = null;
let transformer = null;

const moodKeywords = [
  'energetic', 'sad', 'acoustic', 'chill', 'dance', 'electronic',
  'upbeat', 'melancholic', 'relaxing', 'happy', 'slow', 'fast', 'quiet'
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  const csvFile = document.getElementById('csvFile');
  const initBtn = document.getElementById('initBtn');
  const sampleBtn = document.getElementById('sampleBtn');

  csvFile.addEventListener('change', function() {
    const fileName = this.files[0]?.name || '';
    document.getElementById('fileName').textContent = fileName ? `✓ ${fileName}` : '';
    initBtn.disabled = !this.files.length;
  });

  initBtn.addEventListener('click', initializeSystem);
  sampleBtn.addEventListener('click', loadSampleData);
});

// Load CSV file and initialize system
async function initializeSystem() {
  const fileInput = document.getElementById('csvFile');
  const apiKey = document.getElementById('apiKey').value.trim();

  if (!fileInput.files.length) {
    alert('Please select a CSV file');
    return;
  }

  try {
    const file = fileInput.files[0];
    const csvText = await file.text();
    
    const df = loadData(csvText);
    if (!df || df.length === 0) {
      alert('Failed to parse CSV. Check column names.');
      return;
    }

    recsys = new SpotifyRecSysConstrained(df);
    llm = new HuggingFaceLLM(apiKey);

    const initialIndices = getRandomIndices(df.length, Math.min(5, df.length));
    transformer = new PlaylistTransformer(recsys, llm);
    transformer.setInitialPlaylist(initialIndices);

    showInitialPlaylist(initialIndices);
    document.getElementById('setupPanel').classList.remove('active');
    document.getElementById('chatArea').style.display = 'flex';
    populateMoodKeywords();
    document.getElementById('userInput').focus();
  } catch (e) {
    alert('Error: ' + e.message);
    console.error(e);
  }
}

// Load sample data
function loadSampleData() {
  const sampleData = `track_name,artist_name,genre,acousticness,danceability,energy,instrumentalness,liveness,loudness,speechiness,tempo,valence,popularity
Blinding Lights,The Weeknd,Pop,0.31,0.84,0.73,0.0,0.07,-5.97,0.04,163.0,0.73,90
Levitating,Dua Lipa,Pop,0.14,0.80,0.74,0.08,0.10,-6.67,0.04,103.0,0.81,88
Don't Start Now,Dua Lipa,Pop/Dance,0.07,0.80,0.75,0.07,0.09,-6.44,0.04,104.0,0.88,84
Shape of You,Ed Sheeran,Pop,0.08,0.75,0.65,0.09,0.10,-8.27,0.05,95.0,0.84,82
Someone Like You,Adele,Pop/Soul,0.65,0.36,0.23,0.04,0.16,-7.50,0.06,92.0,0.21,80
Bohemian Rhapsody,Queen,Rock,0.09,0.42,0.73,0.03,0.20,-11.04,0.02,55.0,0.79,91
Imagine,John Lennon,Rock/Pop,0.59,0.53,0.54,0.57,0.10,-7.79,0.03,84.0,0.74,85
Stairway to Heaven,Led Zeppelin,Rock,0.08,0.37,0.66,0.11,0.18,-8.06,0.03,82.0,0.55,90
Wish You Were Here,Pink Floyd,Rock,0.47,0.29,0.34,0.68,0.10,-10.80,0.03,95.0,0.39,79
Smells Like Teen Spirit,Nirvana,Grunge,0.08,0.59,0.91,0.04,0.28,-4.48,0.07,120.0,0.31,88`;

  const blob = new Blob([sampleData], { type: 'text/csv' });
  const file = new File([blob], 'sample.csv', { type: 'text/csv' });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const fileInput = document.getElementById('csvFile');
  fileInput.files = dataTransfer.files;
  document.getElementById('fileName').textContent = '✓ sample.csv';
  document.getElementById('initBtn').disabled = false;
}

// Parse CSV data
function loadData(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const data = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};

    headers.forEach((header, i) => {
      const value = values[i];
      obj[header] = isNaN(value) ? value : parseFloat(value);
    });

    return obj;
  });

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
      html += '<div class="recommendations"><strong style="color: #667eea; display: block; margin-bottom: 8px;">🎵 Top:</strong>';

      content.newRecommendations.slice(0, 5).forEach((track, i) => {
        html += `<div class="recommendation-item"><strong>${i + 1}. ${escapeHtml(track.name)}</strong><br>${escapeHtml(track.artist)} | ${escapeHtml(track.genre)}<br><span style="color: #999; font-size: 12px;">Similarity: ${track.similarity}</span></div>`;
      });

      html += '</div>';
    }

    html += '</div>';
    msg.innerHTML = html;
  }

  messagesDiv.appendChild(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
  }
}

// Enter key to send message
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && document.getElementById('userInput') === document.activeElement) {
    sendMessage();
  }
});
