# 🚀 DEPLOY IN 5 MINUTES - DO THIS NOW!

## ⏰ STEP-BY-STEP (5 MINUTES EXACTLY)

### MINUTE 1: GitHub Account
1. Go: **https://github.com/signup**
2. Sign up (30 seconds)
3. Verify email (done in background)

### MINUTE 2: Create Repo
1. Go: **https://github.com/new**
2. Name: `spotify-recsys`
3. Click **Create**

### MINUTE 3: Upload Files
1. Click **Add file** → **Upload files**
2. Upload these 4 files:
   - `app_enhanced.py`
   - `eda_cleaner.py`
   - `recsys_core.py`
   - `requirements.txt`
3. Click **Commit**

### MINUTE 4: Deploy to Render
1. Go: **https://render.com/dashboard**
2. Click **New +** → **Web Service**
3. Click **Connect GitHub**
4. Select `spotify-recsys`
5. Fill in:
   - Name: `spotify-recsys`
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn app:app`
6. Click **Create**

### MINUTE 5: WAIT & GET LINK
- Render builds (3-5 min automatic)
- You get: `https://spotify-recsys-xxxxx.onrender.com`
- **DONE!** 🎉

---

## FILES YOU NEED

Create `requirements.txt`:
```
Flask==3.0.0
Flask-CORS==4.0.0
pandas==2.1.0
numpy==1.26.0
scikit-learn==1.3.2
requests==2.31.0
gunicorn==21.2.0
python-dotenv==1.0.0
```

Create `Procfile`:
```
web: gunicorn app:app
```

Create `runtime.txt`:
```
python-3.10.13
```

---

## RENAME YOUR FILE

In GitHub, rename `app_enhanced.py` to `app.py`
(Click file → pencil icon → change name)

---

## THAT'S IT! 

Your link will be: `https://spotify-recsys-xxxxx.onrender.com`

Anyone can access it! 🌐

