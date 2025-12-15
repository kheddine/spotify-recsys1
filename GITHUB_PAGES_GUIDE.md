# 🎵 Spotify RecSys - GitHub Pages Deployment Guide

Deploy your React web app directly to GitHub Pages (free hosting, no backend server needed).

---

## What You Need

✅ React frontend code (already created)
✅ Your Spotify CSV data (for mock recommendations)
✅ GitHub repository (you already have: `spotify-recsys1`)
✅ GitHub Pages enabled (automatic)

---

## Step 1: Prepare Your React App for GitHub Pages

### 1.1 Update `frontend/package.json`

Add this line after `"version"`:
```json
{
  "name": "spotify-recsys",
  "version": "1.0.0",
  "homepage": "https://kheddine.github.io/spotify-recsys1",
  ...
}
```

### 1.2 Install GitHub Pages Package

```bash
cd frontend
npm install --save-dev gh-pages
```

### 1.3 Add Deploy Scripts to `package.json`

Add these scripts:
```json
{
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "deploy": "npm run build && gh-pages -d build",
    "predeploy": "npm run build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  }
}
```

---

## Step 2: Update API Configuration

Since GitHub Pages is **frontend-only**, we need to use mock data (no live API).

### 2.1 Create `frontend/src/mockData.js`

```javascript
// Mock recommendation data - simulating backend responses
export const mockTracks = [
  {
    name: "Blinding Lights",
    artist: "The Weeknd",
    genre: "Synthwave",
    popularity: 95,
    index: 1,
    acousticness: 0.1,
    danceability: 0.8,
    energy: 0.8,
    valence: 0.7
  },
  {
    name: "Levitating",
    artist: "Dua Lipa",
    genre: "Disco-Pop",
    popularity: 92,
    index: 2,
    acousticness: 0.05,
    danceability: 0.9,
    energy: 0.7,
    valence: 0.9
  },
  {
    name: "Good as Hell",
    artist: "Lizzo",
    genre: "Hip Hop",
    popularity: 88,
    index: 3,
    acousticness: 0.05,
    danceability: 0.7,
    energy: 0.8,
    valence: 0.9
  },
  {
    name: "Sunroof",
    artist: "Nicky Youre",
    genre: "Indie Pop",
    popularity: 85,
    index: 4,
    acousticness: 0.3,
    danceability: 0.6,
    energy: 0.6,
    valence: 0.8
  },
  {
    name: "Anti-Hero",
    artist: "Taylor Swift",
    genre: "Pop",
    popularity: 93,
    index: 5,
    acousticness: 0.1,
    danceability: 0.7,
    energy: 0.7,
    valence: 0.4
  },
  // Add more tracks as needed...
];

// Mock recommendation logic
export const getMockRecommendations = (mood) => {
  const moodLower = mood.toLowerCase();
  
  const moodMap = {
    energetic: [1, 2, 3],      // High energy tracks
    happy: [2, 3, 4],          // Happy/upbeat
    sad: [5, 6],               // Melancholic
    chill: [4, 7],             // Relaxing
    dance: [1, 2],             // Danceable
    acoustic: [4, 8],          // Acoustic
  };
  
  let selectedIndices = [1, 2, 3]; // Default
  
  for (const [key, indices] of Object.entries(moodMap)) {
    if (moodLower.includes(key)) {
      selectedIndices = indices;
      break;
    }
  }
  
  return selectedIndices
    .map(idx => mockTracks[idx - 1])
    .filter(t => t)
    .slice(0, 5);
};
```

### 2.2 Update `frontend/src/App.jsx` to Use Mock Data

Replace the API calls with mock data:

```javascript
import React, { useState, useEffect } from 'react';
import './App.css';
import PlaylistViewer from './components/PlaylistViewer';
import ChatInterface from './components/ChatInterface';
import RecommendationCard from './components/RecommendationCard';
import { mockTracks, getMockRecommendations } from './mockData';

function App() {
  const [playlist, setPlaylist] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [stats, setStats] = useState({ total_tracks: mockTracks.length, playlist_size: 0 });

  // Initialize with random tracks
  const initializePlaylist = (count = 5) => {
    setLoading(true);
    setTimeout(() => {
      const shuffled = [...mockTracks].sort(() => 0.5 - Math.random());
      setPlaylist(shuffled.slice(0, count));
      setInitialized(true);
      setStats(prev => ({ ...prev, playlist_size: count }));
      setLoading(false);
    }, 300);
  };

  // Get recommendations based on mood
  const getRecommendations = (message) => {
    if (!initialized) {
      alert('Please initialize a playlist first');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const recs = getMockRecommendations(message);
      setRecommendations(recs);
      setLoading(false);
    }, 300);
  };

  // Add tracks to playlist
  const addTracksToPlaylist = (indices) => {
    setLoading(true);
    setTimeout(() => {
      const newTracks = indices.map(idx => mockTracks[idx]);
      setPlaylist([...playlist, ...newTracks]);
      setStats(prev => ({ ...prev, playlist_size: playlist.length + indices.length }));
      setRecommendations([]);
      setLoading(false);
    }, 300);
  };

  const clearPlaylist = () => {
    if (window.confirm('Clear entire playlist?')) {
      setPlaylist([]);
      setRecommendations([]);
      setInitialized(false);
      setStats(prev => ({ ...prev, playlist_size: 0 }));
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🎵 Spotify Mood Mixer</h1>
          <p>Transform your playlist with AI-powered mood adjustments</p>
        </div>
        <div className="header-stats">
          <span>📊 {stats.total_tracks} tracks available</span>
          <span>🎼 {stats.playlist_size} in playlist</span>
        </div>
      </header>

      <main className="app-main">
        <div className="left-panel">
          <section className="panel-section">
            <h2>🎯 Initialize Playlist</h2>
            {!initialized ? (
              <div className="init-controls">
                <input
                  type="number"
                  min="1"
                  max="10"
                  defaultValue="5"
                  id="playlistCount"
                />
                <button
                  onClick={() => {
                    const count = document.getElementById('playlistCount').value;
                    initializePlaylist(parseInt(count));
                  }}
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? '⏳ Loading...' : 'Create Playlist'}
                </button>
              </div>
            ) : (
              <div className="init-status">
                <p>✓ Playlist initialized with {playlist.length} tracks</p>
                <button onClick={clearPlaylist} className="btn-secondary">
                  Clear Playlist
                </button>
              </div>
            )}
          </section>

          {initialized && (
            <section className="panel-section">
              <h2>🎼 Current Playlist</h2>
              <PlaylistViewer tracks={playlist} />
            </section>
          )}
        </div>

        <div className="right-panel">
          {initialized ? (
            <>
              <section className="panel-section">
                <h2>💬 Adjust Mood</h2>
                <ChatInterface
                  onSubmit={getRecommendations}
                  loading={loading}
                  placeholder="e.g., 'make it more energetic and dance-y'"
                />
                <div className="mood-keywords">
                  <p>Try: energetic, sad, acoustic, chill, dance, happy, relaxing, upbeat</p>
                </div>
              </section>

              {recommendations.length > 0 && (
                <section className="panel-section">
                  <div className="recommendations-header">
                    <h2>🎵 Recommendations</h2>
                    <button
                      onClick={() => {
                        const indices = recommendations.map(r => mockTracks.indexOf(r));
                        addTracksToPlaylist(indices);
                      }}
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? '⏳ Adding...' : '✓ Add All'}
                    </button>
                  </div>
                  <div className="recommendations-grid">
                    {recommendations.map((track, idx) => (
                      <RecommendationCard
                        key={idx}
                        track={{
                          ...track,
                          similarity: 0.85 + Math.random() * 0.15
                        }}
                        onAdd={() => {
                          const idx = mockTracks.indexOf(track);
                          addTracksToPlaylist([idx]);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {recommendations.length === 0 && !loading && (
                <section className="empty-state">
                  <p>💭 Send a mood request to get recommendations</p>
                </section>
              )}
            </>
          ) : (
            <section className="empty-state">
              <p>👉 Start by creating a playlist on the left</p>
            </section>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>🎵 Spotify Mood Mixer - Powered by React & Mock Data</p>
      </footer>
    </div>
  );
}

export default App;
```

---

## Step 3: Deploy to GitHub Pages

### 3.1 Build and Deploy

```bash
cd frontend
npm run deploy
```

This command:
1. Builds the React app
2. Creates optimized files in `build/` folder
3. Automatically pushes to GitHub Pages

### 3.2 Verify Deployment

Your site will be live at:
```
https://kheddine.github.io/spotify-recsys1
```

Wait 1-2 minutes, then refresh!

---

## Step 4: Update GitHub Repository

### 4.1 Push Updated Files

```bash
# From root directory
git add frontend/
git commit -m "Add GitHub Pages deployment"
git push origin main
```

### 4.2 Verify Settings

1. Go to: **Settings → Pages**
2. Under "Build and deployment":
   - **Source:** Deploy from a branch
   - **Branch:** gh-pages
   - **Folder:** / (root)
3. Click **Save**

---

## What This Gives You

✅ **Live Website** at `https://kheddine.github.io/spotify-recsys1`
✅ **Works Offline** - No server needed
✅ **Super Fast** - Hosted on GitHub CDN
✅ **Free Forever** - No hosting costs
✅ **Auto-Updates** - Push code → auto-deploys
✅ **Mobile Friendly** - Works on all devices

---

## Adding Your Own Spotify Data

### Option 1: Add Mock Tracks

Edit `frontend/src/mockData.js` and add your tracks:

```javascript
export const mockTracks = [
  {
    name: "Your Song Title",
    artist: "Artist Name",
    genre: "Genre",
    popularity: 85,
    index: 1,
    // ... audio features
  },
  // Add more...
];
```

### Option 2: Use CSV Data

Convert your CSV to JSON and embed it:

```javascript
// Load from CSV (if in public folder)
const loadTracksFromCSV = async () => {
  const response = await fetch('/SpotifyFeatures_cleaned.csv');
  const csv = await response.text();
  // Parse CSV and convert to array
  return parseCSV(csv);
};
```

---

## Customization Ideas

### Change the Theme

Edit `frontend/src/App.css` to customize colors:

```css
:root {
  --primary: #1DB954;        /* Spotify green - change this */
  --bg-dark: #0f0f0f;        /* Background - change this */
  --primary-dark: #1ed760;   /* Hover color - change this */
}
```

### Add Your Logo

Replace header in `App.jsx`:

```jsx
<img src="/logo.png" alt="Logo" className="logo" />
```

### Change Track Data

Edit `mockData.js` to add your favorite songs

---

## File Structure for GitHub Pages

```
spotify-recsys1/
├── frontend/
│   ├── src/
│   │   ├── App.jsx ✅ Updated with mock data
│   │   ├── App.css
│   │   ├── mockData.js ✅ NEW: Mock track data
│   │   └── components/
│   ├── package.json ✅ Updated with deploy script
│   ├── public/
│   │   ├── index.html
│   │   └── favicon.ico
│   └── build/ (created by npm run deploy)
├── .gitignore
└── README.md
```

---

## Troubleshooting

### "npm run deploy" fails

```bash
# Make sure gh-pages is installed
npm install --save-dev gh-pages

# Check package.json has homepage field
cat package.json | grep homepage

# If missing, add it:
npm pkg set homepage=https://kheddine.github.io/spotify-recsys1
```

### Site not updating

```bash
# Clear browser cache (Ctrl+Shift+Delete)
# OR hard refresh (Ctrl+Shift+R)
# Wait 2-3 minutes for GitHub to rebuild
```

### 404 on subpaths

GitHub Pages requires `BrowserRouter` with `basename`:

```jsx
import { BrowserRouter } from 'react-router-dom';

<BrowserRouter basename="/spotify-recsys1">
  <App />
</BrowserRouter>
```

---

## Performance Tips

### Optimize Bundle Size

```bash
npm install --save-dev webpack-bundle-analyzer

# Add to package.json scripts:
"analyze": "source-map-explorer 'build/static/js/*.js'"

npm run build && npm run analyze
```

### Lazy Load Components

```jsx
import { lazy, Suspense } from 'react';

const ChatInterface = lazy(() => import('./components/ChatInterface'));

<Suspense fallback={<div>Loading...</div>}>
  <ChatInterface />
</Suspense>
```

---

## Going Live Checklist

- [ ] `npm run deploy` completes successfully
- [ ] GitHub Pages shows "Deployed from main branch"
- [ ] Site loads at `https://kheddine.github.io/spotify-recsys1`
- [ ] All buttons work (no API errors)
- [ ] Playlist initializes with random tracks
- [ ] Recommendations appear on mood request
- [ ] Works on mobile (test on phone)
- [ ] No console errors (F12)

---

## Next Steps

1. Run `npm run deploy` → ✅ Goes live
2. Share URL with friends: `https://kheddine.github.io/spotify-recsys1`
3. Get feedback
4. Customize with your own tracks
5. Add features (search, filters, etc.)

---

## Support

- GitHub Pages docs: https://pages.github.com/
- React docs: https://react.dev/
- Troubleshooting: Check browser console (F12)

---

**You're ready to deploy! 🚀**
