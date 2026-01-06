# Configure CipherMate for Ollama - Step by Step

Quick guide to configure CipherMate extension to use your Ollama server.

---

## 🎯 Step-by-Step Configuration

### Step 1: Open VS Code Settings

**Method 1: Keyboard Shortcut**
- Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)

**Method 2: Command Palette**
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type: `Preferences: Open Settings (UI)`
- Press Enter

**Method 3: Menu**
- Go to: `Code` → `Preferences` → `Settings` (Mac)
- Or: `File` → `Preferences` → `Settings` (Windows/Linux)

---

### Step 2: Search for CipherMate

1. In the settings search bar at the top, type: **`CipherMate`**
2. You'll see all CipherMate settings appear below

---

### Step 3: Configure AI Provider

Find and configure these settings:

#### 3.1 Set AI Provider to Ollama

Look for:
```
CipherMate: AI Provider
```

**Change it to:** `ollama`

(It's a dropdown - click and select "ollama")

---

#### 3.2 Configure Ollama API URL

Look for:
```
CipherMate: AI > Ollama > Api Url
```

**Enter:** `http://64.225.56.89:11434`

(Replace with your server IP if different)

---

#### 3.3 Set the Model

Look for:
```
CipherMate: AI > Ollama > Model
```

**Enter:** `deepseek-coder:6.7b`

(Or whatever model you downloaded)

---

#### 3.4 Set Timeout (Optional)

Look for:
```
CipherMate: AI > Ollama > Timeout
```

**Enter:** `120000`

(This is 120 seconds - local models may need more time)

---

## 📸 Visual Guide

Your settings should look like this:

```
✅ CipherMate: AI Provider
   → ollama

✅ CipherMate: AI > Ollama > Api Url
   → http://64.225.56.89:11434

✅ CipherMate: AI > Ollama > Model
   → deepseek-coder:6.7b

✅ CipherMate: AI > Ollama > Timeout
   → 120000
```

---

## ✅ Test the Connection

### Method 1: Test in CipherMate Chat

1. Open CipherMate chat:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: `CipherMate`
   - Press Enter

2. Type a test message:
   ```
   Hello, test connection
   ```

3. You should get a response from DeepSeek Coder! 🎉

### Method 2: Test via Terminal

```bash
# Test if Ollama is accessible
curl http://64.225.56.89:11434/api/tags

# Should return: {"models":[]} or list of models
```

---

## 🔧 Alternative: Edit settings.json Directly

If you prefer editing JSON:

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `Preferences: Open User Settings (JSON)`
3. Add or update:

```json
{
  "ciphermate.ai.provider": "ollama",
  "ciphermate.ai.ollama.apiUrl": "http://64.225.56.89:11434",
  "ciphermate.ai.ollama.model": "deepseek-coder:6.7b",
  "ciphermate.ai.ollama.timeout": 120000
}
```

---

## 🐛 Troubleshooting

### Settings Not Saving

- Make sure you're editing **User Settings**, not Workspace Settings
- Try restarting VS Code

### Connection Failed

**Check:**
1. Ollama is running on server: `curl http://64.225.56.89:11434/api/tags`
2. Firewall allows port 11434
3. IP address is correct

**Test from terminal:**
```bash
curl http://64.225.56.89:11434/api/tags
```

### Model Not Found

**On your server, verify model is downloaded:**
```bash
ollama list
```

**If not listed, download it:**
```bash
ollama pull deepseek-coder:6.7b
```

---

## 🔒 Security Note

**Important:** Port 11434 is now exposed publicly. For better security:

### Option 1: Use SSH Tunnel (Recommended)

On your Mac, run:
```bash
ssh -L 11434:localhost:11434 root@64.225.56.89
```

Then in CipherMate settings, use:
```
http://localhost:11434
```

### Option 2: Restrict Firewall

On your server:
```bash
# Only allow your IP
sudo ufw allow from YOUR_MAC_IP to any port 11434
```

---

## ✅ You're Done!

Once configured, CipherMate will use DeepSeek Coder running on your server for all AI requests.

**Try it:**
- `"Scan my repository"`
- `"Fix vulnerabilities"`
- `"Explain this code"`

Enjoy! 🚀

