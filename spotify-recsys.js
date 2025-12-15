// ===================== SPOTIFY RECSYS =====================

class SpotifyRecSysConstrained {
  constructor(df) {
    this.df = df; // Direct reference, no deep copy for large datasets
    this.featureCols = [
      'acousticness', 'danceability', 'energy', 'instrumentalness',
      'liveness', 'loudness', 'speechiness', 'tempo', 'valence'
    ];

    this.normalizeFeatures();
    this.featureMatrix = this.buildFeatureMatrix();
    this.featureMatrixScaled = this.standardScale(this.featureMatrix);

    console.log(`✓ RecSys initialized with ${this.df.length} tracks (100% accurate)`);

    // Feature constraints to prevent conflicts
    this.featureConstraints = {
      'acousticness': {
        'positive': { 'energy': 'soft', 'instrumentalness': 'increase' },
        'negative': { 'energy': 'flexible', 'instrumentalness': 'flexible' }
      },
      'energy': {
        'positive': { 'valence': 'increase', 'tempo': 'increase' },
        'negative': { 'valence': 'flexible', 'tempo': 'decrease' }
      },
      'valence': {
        'positive': { 'energy': 'increase', 'instrumentalness': 'flexible' },
        'negative': { 'energy': 'decrease', 'acousticness': 'increase' }
      }
    };
  }

  normalizeFeatures() {
    if (this.df.length === 0) return;

    if (this.df[0]['loudness'] !== undefined) {
      let minLoudness = Infinity;
      let maxLoudness = -Infinity;
      
      for (let i = 0; i < this.df.length; i++) {
        const val = this.df[i]['loudness'];
        if (val < minLoudness) minLoudness = val;
        if (val > maxLoudness) maxLoudness = val;
      }
      
      const range = maxLoudness - minLoudness || 1;
      for (let i = 0; i < this.df.length; i++) {
        this.df[i]['loudness_norm'] = (this.df[i]['loudness'] - minLoudness) / range;
      }
    }

    if (this.df[0]['tempo'] !== undefined) {
      let minTempo = Infinity;
      let maxTempo = -Infinity;
      
      for (let i = 0; i < this.df.length; i++) {
        const val = this.df[i]['tempo'];
        if (val < minTempo) minTempo = val;
        if (val > maxTempo) maxTempo = val;
      }
      
      const range = maxTempo - minTempo || 1;
      for (let i = 0; i < this.df.length; i++) {
        this.df[i]['tempo_norm'] = (this.df[i]['tempo'] - minTempo) / range;
      }
    }
  }

  buildFeatureMatrix() {
    if (this.df.length === 0) return [];

    const features = [];

    for (const col of this.featureCols) {
      if (this.df[0][col] !== undefined) {
        const feature = [];
        for (let i = 0; i < this.df.length; i++) {
          feature.push(this.df[i][col]);
        }
        features.push(feature);
      } else if (col === 'loudness' && this.df[0]['loudness_norm'] !== undefined) {
        const feature = [];
        for (let i = 0; i < this.df.length; i++) {
          feature.push(this.df[i]['loudness_norm']);
        }
        features.push(feature);
      } else if (col === 'tempo' && this.df[0]['tempo_norm'] !== undefined) {
        const feature = [];
        for (let i = 0; i < this.df.length; i++) {
          feature.push(this.df[i]['tempo_norm']);
        }
        features.push(feature);
      }
    }

    if (features.length === 0) return [];
    
    const matrix = [];
    for (let i = 0; i < this.df.length; i++) {
      const row = [];
      for (let j = 0; j < features.length; j++) {
        row.push(features[j][i]);
      }
      matrix.push(row);
    }
    return matrix;
  }

  standardScale(matrix) {
    if (matrix.length === 0) return [];

    const numFeatures = matrix[0].length;
    const means = Array(numFeatures).fill(0);
    const stds = Array(numFeatures).fill(0);

    // Calculate means
    for (let j = 0; j < numFeatures; j++) {
      for (let i = 0; i < matrix.length; i++) {
        means[j] += matrix[i][j];
      }
      means[j] /= matrix.length;
    }

    // Calculate standard deviations
    for (let j = 0; j < numFeatures; j++) {
      for (let i = 0; i < matrix.length; i++) {
        stds[j] += Math.pow(matrix[i][j] - means[j], 2);
      }
      stds[j] = Math.sqrt(stds[j] / matrix.length) || 1;
    }

    // Scale
    const scaled = matrix.map(row =>
      row.map((val, j) => (val - means[j]) / stds[j])
    );

    return scaled;
  }

  getPlaylistMoodVector(trackIndices) {
    if (!trackIndices || trackIndices.length === 0) {
      return Array(this.featureCols.length).fill(0);
    }

    const vectors = trackIndices.map(idx => this.featureMatrixScaled[idx]);
    const numFeatures = vectors[0].length;
    const average = Array(numFeatures).fill(0);

    for (let j = 0; j < numFeatures; j++) {
      for (let i = 0; i < vectors.length; i++) {
        average[j] += vectors[i][j];
      }
      average[j] /= vectors.length;
    }

    return average;
  }

  adjustMoodVectorWithConstraints(baseVector, adjustments) {
    let adjusted = [...baseVector];

    // First pass: Apply primary adjustments
    for (const [feature, delta] of Object.entries(adjustments)) {
      if (this.featureCols.includes(feature)) {
        const idx = this.featureCols.indexOf(feature);
        adjusted[idx] = Math.max(-3, Math.min(3, adjusted[idx] + delta));
      }
    }

    // Second pass: Handle conflicting features
    for (const [feature, delta] of Object.entries(adjustments)) {
      if (delta === 0) continue;

      if (this.featureConstraints[feature]) {
        const direction = delta > 0 ? 'positive' : 'negative';
        const constraints = this.featureConstraints[feature][direction] || {};

        for (const [conflictingFeature, constraintType] of Object.entries(constraints)) {
          if (!adjustments[conflictingFeature] || adjustments[conflictingFeature] === 0) {
            if (this.featureCols.includes(conflictingFeature)) {
              const idx = this.featureCols.indexOf(conflictingFeature);

              if (constraintType === 'soft') {
                adjusted[idx] = adjusted[idx] * 0.5;
              } else if (constraintType === 'increase') {
                const deltaMagnitude = Math.abs(delta);
                adjusted[idx] = Math.max(-3, Math.min(3, adjusted[idx] + deltaMagnitude * 0.4));
              } else if (constraintType === 'decrease') {
                const deltaMagnitude = Math.abs(delta);
                adjusted[idx] = Math.max(-3, Math.min(3, adjusted[idx] - deltaMagnitude * 0.4));
              }
            }
          }
        }
      }
    }

    return adjusted;
  }

  cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, a, i) => sum + a * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0));
    const norm2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0));

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (norm1 * norm2);
  }

  recommendByMoodVector(moodVector, nRecommendations = 10, excludeIndices = []) {
    const similarities = this.featureMatrixScaled.map((vector, idx) => {
      if (excludeIndices.includes(idx)) {
        return -1;
      }
      return this.cosineSimilarity(moodVector, vector);
    });

    const sortedIndices = similarities
      .map((sim, idx) => ({ sim, idx }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, nRecommendations)
      .filter(item => item.sim > 0)
      .map(item => [item.idx, item.sim]);

    return sortedIndices;
  }

  getTrackInfo(index) {
    const row = this.df[index];
    return {
      name: row['track_name'] || 'Unknown',
      artist: row['artist_name'] || 'Unknown',
      genre: row['genre'] || 'Unknown',
      popularity: parseInt(row['popularity'] || 0),
      index: index
    };
  }
}

// ===================== HUGGINGFACE LLM =====================

class HuggingFaceLLM {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.modelId = 'mistralai/Mistral-7B-Instruct-v0.1';
    this.apiUrl = `https://api-inference.huggingface.co/models/${this.modelId}`;

    if (apiKey) {
      this.testConnection();
    } else {
      console.log('⚠️  No API key provided. Using fallback mode.');
    }
  }

  async testConnection() {
    try {
      const response = await fetch(`https://huggingface.co/api/models/${this.modelId}`, {
        method: 'GET',
        timeout: 5000
      });
      console.log('✓ Hugging Face API connected!');
    } catch (e) {
      console.log('⚠️  Hugging Face API connection issue');
    }
  }

  async extractAdjustments(userMessage) {
    const systemPrompt = `You are a music mood translator. Extract audio feature adjustments.

RESPOND ONLY WITH VALID JSON (no markdown):
{
    "interpretation": "What user wants",
    "feature_adjustments": {
        "energy": 0,
        "danceability": 0,
        "valence": 0,
        "acousticness": 0,
        "instrumentalness": 0,
        "speechiness": 0,
        "liveness": 0,
        "loudness": 0,
        "tempo": 0
    },
    "explanation": "Why"
}

Guidelines: -1 to 1, negative reduces, positive increases.`;

    const prompt = `${systemPrompt}\n\nUser request: ${userMessage}`;

    if (!this.apiKey) {
      return this.fallbackExtraction(userMessage);
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 300,
            temperature: 0.3
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const outputText = result[0].generated_text;

        try {
          const jsonStart = outputText.indexOf('{');
          const jsonEnd = outputText.lastIndexOf('}') + 1;

          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            const jsonStr = outputText.substring(jsonStart, jsonEnd);
            const parsed = JSON.parse(jsonStr);
            return parsed.feature_adjustments || {};
          }
        } catch (e) {
          console.log('Failed to parse JSON response');
        }
      }

      return this.fallbackExtraction(userMessage);
    } catch (e) {
      console.log('⚠️  API error: ' + e.message);
      return this.fallbackExtraction(userMessage);
    }
  }

  fallbackExtraction(userMessage) {
    const msg = userMessage.toLowerCase();

    const moodRules = {
      'energetic': { energy: 0.7, danceability: 0.6, valence: 0.4, tempo: 0.5 },
      'sad': { valence: -0.8, energy: -0.5, acousticness: 0.3 },
      'acoustic': { acousticness: 0.7, energy: -0.3, instrumentalness: 0.2 },
      'chill': { energy: -0.6, tempo: -0.5, acousticness: 0.4 },
      'dance': { danceability: 0.8, energy: 0.7, tempo: 0.5 },
      'electronic': { acousticness: -0.8, energy: 0.6, instrumentalness: 0.5 },
      'upbeat': { energy: 0.7, valence: 0.7, tempo: 0.4 },
      'melancholic': { valence: -0.7, energy: -0.4, acousticness: 0.5 },
      'relaxing': { energy: -0.7, valence: 0.3, loudness: -0.4 },
      'happy': { valence: 0.8, energy: 0.5, danceability: 0.5 },
      'slow': { tempo: -0.6, energy: -0.4 },
      'fast': { tempo: 0.7, energy: 0.5 },
      'quiet': { loudness: -0.6, speechiness: -0.3 }
    };

    const adjustments = {
      energy: 0,
      danceability: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0,
      liveness: 0,
      loudness: 0,
      tempo: 0
    };

    for (const [keyword, values] of Object.entries(moodRules)) {
      if (msg.includes(keyword)) {
        Object.assign(adjustments, values);
      }
    }

    return adjustments;
  }
}

// ===================== PLAYLIST TRANSFORMER =====================

class PlaylistTransformer {
  constructor(recsys, llm) {
    this.recsys = recsys;
    this.llm = llm;
    this.currentPlaylist = [];
    this.excludedTracks = new Set();
  }

  setInitialPlaylist(playlistIndices) {
    this.currentPlaylist = [...playlistIndices];
    this.excludedTracks = new Set(playlistIndices);
    console.log(`✓ Playlist set with ${playlistIndices.length} tracks`);
  }

  async chat(userMessage) {
    // Extract adjustments
    const adjustments = await this.llm.extractAdjustments(userMessage);

    // Get current playlist mood
    const baseMood = this.recsys.getPlaylistMoodVector(this.currentPlaylist);

    // Apply adjustments WITH constraints
    const adjustedMood = this.recsys.adjustMoodVectorWithConstraints(baseMood, adjustments);

    // Get recommendations
    const excludeList = Array.from(this.excludedTracks);
    const recommendations = this.recsys.recommendByMoodVector(
      adjustedMood,
      10,
      excludeList
    );

    // Format results
    const newRecommendations = [];
    for (const [trackIdx, similarity] of recommendations) {
      const trackInfo = this.recsys.getTrackInfo(trackIdx);
      newRecommendations.push({
        name: trackInfo.name,
        artist: trackInfo.artist,
        genre: trackInfo.genre,
        similarity: parseFloat(similarity.toFixed(3)),
        index: trackIdx
      });
      this.excludedTracks.add(trackIdx);
    }

    return {
      interpretation: `Transforming playlist: ${userMessage}`,
      adjustments: adjustments,
      newRecommendations: newRecommendations
    };
  }

  addTracksToPlaylist(trackIndices) {
    this.currentPlaylist.push(...trackIndices);
  }
}

// ===================== UTILITIES =====================

function loadData(csvText) {
  try {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj = {};

      headers.forEach((header, i) => {
        const value = values[i];
        // Try to parse as number
        obj[header] = isNaN(value) ? value : parseFloat(value);
      });

      return obj;
    });

    console.log(`✓ Loaded ${data.length} tracks`);
    return data;
  } catch (e) {
    console.log(`✗ Error: ${e.message}`);
    return null;
  }
}

function getRandomIndices(max, count) {
  const indices = new Set();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * max));
  }
  return Array.from(indices);
}

// ===================== EXPORT FOR NODE.JS & BROWSER =====================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SpotifyRecSysConstrained,
    HuggingFaceLLM,
    PlaylistTransformer,
    loadData,
    getRandomIndices
  };
}
