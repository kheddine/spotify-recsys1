import React, { useState } from 'react';
import './App.css';
import PlaylistViewer from './components/PlaylistViewer';
import ChatInterface from './components/ChatInterface';
import RecommendationCard from './components/RecommendationCard';
import { mockTracks, getMockRecommendations, shuffleArray } from './mockData';

function App() {
  const [playlist, setPlaylist] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ 
    total_tracks: mockTracks.length, 
    playlist_size: 0 
  });

  const initializePlaylist = (count = 5) => {
    setLoading(true);
    setError('');
    
    // Simulate API delay
    setTimeout(() => {
      const shuffled = shuffleArray(mockTracks);
      const newPlaylist = shuffled.slice(0, Math.min(count, mockTracks.length));
      setPlaylist(newPlaylist);
      setInitialized(true);
      setStats(prev => ({ ...prev, playlist_size: newPlaylist.length }));
      setLoading(false);
    }, 400);
  };

  const getRecommendations = (message) => {
    if (!initialized) {
      setError('Please initialize a playlist first');
      return;
    }

    if (!message.trim()) {
      setError('Please enter a mood');
      return;
    }

    setLoading(true);
    setError('');
    
    // Simulate API delay
    setTimeout(() => {
      try {
        const recs = getMockRecommendations(message);
        setRecommendations(recs);
      } catch (err) {
        setError('Failed to get recommendations');
        console.error(err);
      }
      setLoading(false);
    }, 500);
  };

  const addTracksToPlaylist = (indices) => {
    setLoading(true);
    
    setTimeout(() => {
      const newTracks = indices
        .map(idx => mockTracks.find(t => t.index === idx))
        .filter(Boolean);
      
      setPlaylist([...playlist, ...newTracks]);
      setStats(prev => ({ 
        ...prev, 
        playlist_size: playlist.length + newTracks.length 
      }));
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

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

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
                    const count = parseInt(document.getElementById('playlistCount').value);
                    if (count >= 1 && count <= mockTracks.length) {
                      initializePlaylist(count);
                    } else {
                      setError(`Please enter a number between 1 and ${mockTracks.length}`);
                    }
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

          <section className="panel-section">
            <h2>ℹ️ About</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              This is a demo of the Spotify Recommendation System running on GitHub Pages.
              All data is mock data for demonstration purposes. Start by creating a playlist and requesting mood-based recommendations!
            </p>
          </section>
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
                  <p>Try these moods: <br />
                  energetic, sad, acoustic, chill, dance, happy, relaxing, upbeat, slow, fast, loud, quiet, electronic, rock, pop, indie</p>
                </div>
              </section>

              {recommendations.length > 0 && (
                <section className="panel-section">
                  <div className="recommendations-header">
                    <h2>🎵 Recommendations</h2>
                    <button
                      onClick={() => {
                        const indices = recommendations.map(r => r.index);
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
                        track={track}
                        onAdd={() => addTracksToPlaylist([track.index])}
                      />
                    ))}
                  </div>
                </section>
              )}

              {recommendations.length === 0 && !loading && (
                <section className="empty-state">
                  <p>💭 Send a mood request to get recommendations</p>
                  <small>The system will analyze your current playlist and suggest similar tracks based on the mood you describe.</small>
                </section>
              )}
            </>
          ) : (
            <section className="empty-state">
              <p>👉 Start by creating a playlist on the left</p>
              <small>Click "Create Playlist" to generate 5 random tracks to work with</small>
            </section>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>🎵 Spotify Mood Mixer | Demo Version | Running on GitHub Pages</p>
      </footer>
    </div>
  );
}

export default App;
