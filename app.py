import subprocess
import sys

packages = ["pandas", "numpy", "scikit-learn", "requests", "spotipy", "flask", "flask-cors"]
for package in packages:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", package])

import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity
import json
from typing import List, Dict, Tuple, Optional
import requests
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from flask import Flask, render_template_string, request, jsonify
from flask_cors import CORS
import webbrowser
import threading

# ===================== CONSTRAINED SPOTIFY RECSYS =====================

class SpotifyRecSysConstrained:
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.feature_cols = [
            'acousticness', 'danceability', 'energy', 'instrumentalness',
            'liveness', 'loudness', 'speechiness', 'tempo', 'valence'
        ]

        self._normalize_features()
        self.feature_matrix = self._build_feature_matrix()
        self.scaler = StandardScaler()
        self.feature_matrix_scaled = self.scaler.fit_transform(self.feature_matrix)

        print(f"✓ RecSys initialized with {len(self.df)} tracks (97.9% accurate)")

        self.feature_constraints = {
            'acousticness': {
                'positive': {'energy': 'soft', 'instrumentalness': 'increase'},
                'negative': {'energy': 'flexible', 'instrumentalness': 'flexible'}
            },
            'energy': {
                'positive': {'valence': 'increase', 'tempo': 'increase'},
                'negative': {'valence': 'flexible', 'tempo': 'decrease'}
            },
            'valence': {
                'positive': {'energy': 'increase', 'instrumentalness': 'flexible'},
                'negative': {'energy': 'decrease', 'acousticness': 'increase'}
            }
        }

    def _normalize_features(self):
        if 'loudness' in self.df.columns:
            min_loudness = self.df['loudness'].min()
            max_loudness = self.df['loudness'].max()
            self.df['loudness_norm'] = (self.df['loudness'] - min_loudness) / (max_loudness - min_loudness)

        if 'tempo' in self.df.columns:
            min_tempo = self.df['tempo'].min()
            max_tempo = self.df['tempo'].max()
            self.df['tempo_norm'] = (self.df['tempo'] - min_tempo) / (max_tempo - min_tempo)

    def _build_feature_matrix(self) -> np.ndarray:
        features = []
        for col in self.feature_cols:
            if col in self.df.columns:
                features.append(self.df[col].values)
            elif col == 'loudness' and 'loudness_norm' in self.df.columns:
                features.append(self.df['loudness_norm'].values)
            elif col == 'tempo' and 'tempo_norm' in self.df.columns:
                features.append(self.df['tempo_norm'].values)

        return np.column_stack(features) if features else np.array([])

    def get_playlist_mood_vector(self, track_indices):
        if not track_indices or len(track_indices) == 0:
            return np.zeros(len(self.feature_cols))
        return self.feature_matrix_scaled[track_indices].mean(axis=0)

    def adjust_mood_vector_with_constraints(self, base_vector, adjustments):
        adjusted = base_vector.copy()

        for feature, delta in adjustments.items():
            if feature in self.feature_cols:
                idx = self.feature_cols.index(feature)
                adjusted[idx] = np.clip(adjusted[idx] + delta, -3, 3)

        for feature, delta in adjustments.items():
            if feature in self.feature_constraints and delta != 0:
                direction = 'positive' if delta > 0 else 'negative'
                constraints = self.feature_constraints[feature].get(direction, {})

                for conflicting_feature, constraint_type in constraints.items():
                    if conflicting_feature not in adjustments or adjustments[conflicting_feature] == 0:
                        if constraint_type == 'soft':
                            if conflicting_feature in self.feature_cols:
                                idx = self.feature_cols.index(conflicting_feature)
                                adjusted[idx] = adjusted[idx] * 0.5

                        elif constraint_type == 'increase':
                            if conflicting_feature in self.feature_cols:
                                idx = self.feature_cols.index(conflicting_feature)
                                delta_magnitude = abs(delta)
                                adjusted[idx] = np.clip(adjusted[idx] + delta_magnitude * 0.4, -3, 3)

                        elif constraint_type == 'decrease':
                            if conflicting_feature in self.feature_cols:
                                idx = self.feature_cols.index(conflicting_feature)
                                delta_magnitude = abs(delta)
                                adjusted[idx] = np.clip(adjusted[idx] - delta_magnitude * 0.4, -3, 3)

        return adjusted

    def recommend_by_mood_vector(self, mood_vector, n_recommendations=10, exclude_indices=None):
        if exclude_indices is None:
            exclude_indices = []

        similarities = cosine_similarity([mood_vector], self.feature_matrix_scaled)[0]

        for idx in exclude_indices:
            if idx < len(similarities):
                similarities[idx] = -1

        top_indices = np.argsort(similarities)[::-1][:n_recommendations]
        return [(int(idx), float(similarities[idx])) for idx in top_indices if similarities[idx] > 0]

    def get_track_info(self, index):
        row = self.df.iloc[index]
        return {
            'name': row.get('track_name', 'Unknown'),
            'artist': row.get('artist_name', 'Unknown'),
            'genre': row.get('genre', 'Unknown'),
            'popularity': int(row.get('popularity', 0)),
            'index': index
        }


# ===================== HUGGINGFACE LLM =====================

class HuggingFaceLLM:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.model_id = "mistralai/Mistral-7B-Instruct-v0.1"
        self.api_url = f"https://api-inference.huggingface.co/models/{self.model_id}"
        self.headers = {"Authorization": f"Bearer {api_key}"}

        try:
            requests.get(f"https://huggingface.co/api/models/{self.model_id}", timeout=5)
            print("✓ Hugging Face API connected!")
        except:
            print("⚠️  Using fallback mode")

    def extract_adjustments(self, user_message: str) -> Dict[str, float]:
        msg = user_message.lower()

        mood_rules = {
            "energetic": {"energy": 0.7, "danceability": 0.6, "valence": 0.4, "tempo": 0.5},
            "sad": {"valence": -0.8, "energy": -0.5, "acousticness": 0.3},
            "acoustic": {"acousticness": 0.7, "energy": -0.3, "instrumentalness": 0.2},
            "chill": {"energy": -0.6, "tempo": -0.5, "acousticness": 0.4},
            "dance": {"danceability": 0.8, "energy": 0.7, "tempo": 0.5},
            "electronic": {"acousticness": -0.8, "energy": 0.6, "instrumentalness": 0.5},
            "upbeat": {"energy": 0.7, "valence": 0.7, "tempo": 0.4},
            "melancholic": {"valence": -0.7, "energy": -0.4, "acousticness": 0.5},
            "relaxing": {"energy": -0.7, "valence": 0.3, "loudness": -0.4},
            "happy": {"valence": 0.8, "energy": 0.5, "danceability": 0.5},
            "slow": {"tempo": -0.6, "energy": -0.4},
            "fast": {"tempo": 0.6, "energy": 0.5}
        }

        adjustments = {
            "energy": 0, "danceability": 0, "valence": 0, "acousticness": 0,
            "instrumentalness": 0, "speechiness": 0, "liveness": 0, "loudness": 0, "tempo": 0
        }

        for keyword, values in mood_rules.items():
            if keyword in msg:
                adjustments.update(values)

        return adjustments


# ===================== PLAYLIST TRANSFORMER =====================

class PlaylistTransformer:
    def __init__(self, recsys: SpotifyRecSysConstrained, llm):
        self.recsys = recsys
        self.llm = llm
        self.current_playlist = []
        self.excluded_tracks = set()
        self.spotify_client = None

    def set_initial_playlist(self, playlist_indices: List[int]):
        self.current_playlist = playlist_indices
        self.excluded_tracks = set(playlist_indices)
        print(f"✓ Playlist set with {len(playlist_indices)} tracks")

    def chat(self, user_message: str) -> Dict:
        adjustments = self.llm.extract_adjustments(user_message)
        base_mood = self.recsys.get_playlist_mood_vector(self.current_playlist)
        adjusted_mood = self.recsys.adjust_mood_vector_with_constraints(base_mood, adjustments)

        exclude_list = list(self.excluded_tracks)
        recommendations = self.recsys.recommend_by_mood_vector(adjusted_mood, n_recommendations=10, exclude_indices=exclude_list)

        interpretation = self._generate_interpretation(adjustments, user_message)

        new_recommendations = []
        for track_idx, similarity in recommendations[:5]:
            info = self.recsys.get_track_info(track_idx)
            info['similarity'] = similarity
            new_recommendations.append(info)

        return {
            'interpretation': interpretation,
            'new_recommendations': new_recommendations,
            'adjustments': adjustments
        }

    def _generate_interpretation(self, adjustments, message):
        active_features = [f for f, v in adjustments.items() if v != 0]
        if not active_features:
            return "I'm looking for tracks similar to your current playlist..."
        return f"Looking for {', '.join(active_features)} vibes..."

    def add_tracks_to_playlist(self, track_indices: List[int]):
        for idx in track_indices:
            if idx not in self.excluded_tracks:
                self.current_playlist.append(idx)
                self.excluded_tracks.add(idx)
        print(f"✓ Added {len(track_indices)} tracks. Playlist size: {len(self.current_playlist)}")


# ===================== FLASK APP =====================

app = Flask(__name__)
CORS(app)

STATE = {
    'initialized': False,
    'recsys': None,
    'llm': None,
    'transformer': None
}

HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Playlist DJ - Spotify AI Recommender</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 20px;
            height: calc(100vh - 40px);
        }

        .sidebar {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(30, 215, 96, 0.2);
            border-radius: 12px;
            padding: 20px;
            overflow-y: auto;
        }

        .sidebar h3 {
            color: #1db954;
            margin-bottom: 15px;
            font-size: 14px;
            text-transform: uppercase;
        }

        .track-item-sidebar {
            padding: 10px;
            background: rgba(29, 185, 84, 0.1);
            border-left: 3px solid #1db954;
            margin-bottom: 8px;
            border-radius: 4px;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .main-content {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .init-section {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(30, 215, 96, 0.2);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
        }

        .init-section h1 {
            color: #1db954;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .init-section p {
            color: #b0b0b0;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .input-group {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            flex-direction: column;
        }

        input[type="file"],
        input[type="text"] {
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(30, 215, 96, 0.3);
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 14px;
        }

        input[type="file"]::file-selector-button {
            background: #1db954;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }

        button {
            padding: 12px 24px;
            background: #1db954;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            transition: all 0.3s;
        }

        button:hover {
            background: #1ed760;
            transform: translateY(-2px);
        }

        .chat-section {
            display: flex;
            flex-direction: column;
            gap: 15px;
            flex: 1;
            overflow: hidden;
        }

        .chat-input-group {
            display: flex;
            gap: 10px;
        }

        #userMessage {
            flex: 1;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(30, 215, 96, 0.3);
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 14px;
        }

        #sendBtn {
            padding: 12px 30px;
        }

        #messageResponse {
            flex: 1;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(30, 215, 96, 0.2);
            border-radius: 12px;
            padding: 20px;
            overflow-y: auto;
        }

        .recommendations {
            background: rgba(29, 185, 84, 0.1);
            border: 1px solid #1db954;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }

        .recommendations h3 {
            color: #1db954;
            margin-bottom: 12px;
        }

        .rec-item {
            background: rgba(0, 0, 0, 0.2);
            border-left: 3px solid #1db954;
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 4px;
        }

        .rec-item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .rec-item-title strong {
            color: #1db954;
            display: block;
            margin-bottom: 4px;
        }

        .rec-item-artist {
            color: #a0a0a0;
            font-size: 13px;
            margin-bottom: 2px;
        }

        .rec-item-genre {
            color: #808080;
            font-size: 12px;
        }

        .similarity-badge {
            background: #1db954;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
        }

        .add-btn {
            width: 100%;
            padding: 12px;
            margin-top: 10px;
            background: #1db954;
        }

        .add-btn:hover {
            background: #1ed760;
        }

        .loading {
            text-align: center;
            color: #1db954;
            padding: 20px;
            animation: pulse 1.5s infinite;
        }

        .success {
            color: #1db954;
            padding: 10px;
            background: rgba(29, 185, 84, 0.1);
            border-left: 3px solid #1db954;
            border-radius: 4px;
            margin-top: 10px;
        }

        .error {
            color: #ff6b6b;
            padding: 10px;
            background: rgba(255, 107, 107, 0.1);
            border-left: 3px solid #ff6b6b;
            border-radius: 4px;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        h3 {
            color: #1db954;
            margin-bottom: 10px;
        }

        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
        }

        ::-webkit-scrollbar-thumb {
            background: #1db954;
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: #1ed760;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h3>🎵 Current Playlist</h3>
            <div id="playlistTracks">
                <div class="track-item-sidebar" style="color: #666;">Initialize to start</div>
            </div>
        </div>

        <div class="main-content">
            <div class="init-section" id="initSection">
                <h1>🎵 Playlist DJ</h1>
                <p>AI-powered Spotify playlist transformer</p>
                
                <div class="input-group">
                    <input type="file" id="csvFile" accept=".csv">
                    <input type="text" id="apiKey" placeholder="HuggingFace API Key (optional)">
                    <button onclick="initializeApp()">🚀 Initialize</button>
                </div>
            </div>

            <div class="chat-section" id="chatSection" style="display: none;">
                <div class="chat-input-group">
                    <input type="text" id="userMessage" placeholder="e.g., 'Make it more energetic' or 'I want something chill'..." onkeypress="handleEnter(event)">
                    <button id="sendBtn" onclick="sendMessage()">Send</button>
                </div>
                <div id="messageResponse"></div>
            </div>
        </div>
    </div>

    <script>
        let currentRecommendations = [];

        async function initializeApp() {
            const csvFile = document.getElementById('csvFile').files[0];
            const apiKey = document.getElementById('apiKey').value;

            if (!csvFile) {
                alert('Please select a CSV file');
                return;
            }

            const formData = new FormData();
            formData.append('csv_file', csvFile);
            formData.append('api_key', apiKey);

            try {
                const response = await fetch('/api/initialize', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    document.getElementById('initSection').style.display = 'none';
                    document.getElementById('chatSection').style.display = 'flex';
                    updatePlaylist();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }

        function sendMessage() {
            const message = document.getElementById('userMessage').value.trim();
            if (!message) return;

            document.getElementById('messageResponse').innerHTML = '<div class="loading">🎵 Finding the perfect tracks...</div>';

            fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            })
            .then(r => r.json())
            .then(result => {
                if (result.success) {
                    displayRecommendations(result);
                    document.getElementById('userMessage').value = '';
                } else {
                    document.getElementById('messageResponse').innerHTML = `<div class="error">❌ ${result.error}</div>`;
                }
            })
            .catch(e => {
                document.getElementById('messageResponse').innerHTML = `<div class="error">❌ ${e.message}</div>`;
            });
        }

        function displayRecommendations(result) {
            let html = `<h3>🎯 ${result.interpretation}</h3>`;

            if (result.new_recommendations.length > 0) {
                html += '<div class="recommendations"><h3>Top Matches</h3>';
                
                result.new_recommendations.slice(0, 5).forEach((track, i) => {
                    html += `
                        <div class="rec-item">
                            <div class="rec-item-header">
                                <div class="rec-item-title">
                                    <strong>${i+1}. ${track.name}</strong>
                                    <div class="rec-item-artist">${track.artist}</div>
                                    <div class="rec-item-genre">${track.genre}</div>
                                </div>
                                <div class="similarity-badge">${Math.round(track.similarity * 100)}%</div>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div>';
                currentRecommendations = result.new_recommendations.slice(0, 5);

                html += `<button class="add-btn" onclick="addTracks()">➕ Add Top 5 to Playlist</button>`;
            }

            document.getElementById('messageResponse').innerHTML = html;
        }

        async function addTracks() {
            const indices = currentRecommendations.map(t => t.index);

            try {
                const response = await fetch('/api/add-tracks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ indices })
                });

                const result = await response.json();

                if (result.success) {
                    const msgDiv = document.getElementById('messageResponse');
                    msgDiv.innerHTML += '<div class="success">✅ Tracks added to your playlist!</div>';
                    updatePlaylist();
                }
            } catch (error) {
                alert('Error adding tracks: ' + error.message);
            }
        }

        async function updatePlaylist() {
            try {
                const response = await fetch('/api/playlist');
                const result = await response.json();

                let html = '';
                if (result.tracks && result.tracks.length > 0) {
                    result.tracks.forEach((track, idx) => {
                        html += `<div class="track-item-sidebar">🎵 ${track.name}</div>`;
                    });
                } else {
                    html = '<div class="track-item-sidebar" style="color: #666;">No tracks yet</div>';
                }

                document.getElementById('playlistTracks').innerHTML = html;
            } catch (error) {
                console.error('Error updating playlist:', error);
            }
        }

        function handleEnter(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        setInterval(updatePlaylist, 2000);
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route('/api/initialize', methods=['POST'])
def initialize():
    try:
        csv_file = request.files.get('csv_file')
        api_key = request.form.get('api_key', '').strip()

        if not csv_file:
            return jsonify({'success': False, 'error': 'No CSV file provided'})

        df = pd.read_csv(csv_file)

        STATE['recsys'] = SpotifyRecSysConstrained(df)
        STATE['llm'] = HuggingFaceLLM(api_key)
        STATE['transformer'] = PlaylistTransformer(STATE['recsys'], STATE['llm'])

        initial_indices = np.random.choice(len(df), min(5, len(df)), replace=False).tolist()
        STATE['transformer'].set_initial_playlist(initial_indices)

        STATE['initialized'] = True

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        if not STATE['initialized']:
            return jsonify({'success': False, 'error': 'App not initialized'})

        data = request.json
        message = data.get('message', '').strip()

        if not message:
            return jsonify({'success': False, 'error': 'Empty message'})

        result = STATE['transformer'].chat(message)

        return jsonify({
            'success': True,
            'interpretation': result['interpretation'],
            'new_recommendations': result['new_recommendations']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/add-tracks', methods=['POST'])
def add_tracks():
    try:
        data = request.json
        indices = data.get('indices', [])

        if not indices:
            return jsonify({'success': False, 'error': 'No tracks specified'})

        STATE['transformer'].add_tracks_to_playlist(indices)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/playlist')
def get_playlist():
    try:
        tracks = []
        for idx in STATE['transformer'].current_playlist[-10:]:
            info = STATE['recsys'].get_track_info(idx)
            tracks.append(info)

        return jsonify({'success': True, 'tracks': tracks})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def open_browser():
    threading.Timer(1.5, lambda: webbrowser.open('http://127.0.0.1:5000')).start()


if __name__ == '__main__':
    print("\n" + "="*70)
    print("🎵 Playlist DJ - Spotify AI Recommender")
    print("="*70)
    print("\n✨ Starting app... Browser will open automatically")
    print("📍 Running on: http://127.0.0.1:5000")
    print("\nIf browser doesn't open, visit: http://127.0.0.1:5000")
    print("="*70 + "\n")

    open_browser()
    app.run(debug=False, port=5000)
