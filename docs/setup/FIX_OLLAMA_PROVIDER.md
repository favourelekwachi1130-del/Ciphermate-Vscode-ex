# Fix: Switch to Ollama Provider

The extension is still using OpenRouter. Here's how to switch to Ollama.

---

## 🔧 Quick Fix: Change VS Code Settings

### Method 1: Using Settings UI (Easiest)

1. **Open VS Code Settings:**
   - Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)

2. **Search for:** `ciphermate.ai.provider`

3. **Change it to:** `ollama`
   - Click the dropdown
   - Select **"ollama"**

4. **Also configure these settings:**
   - Search: `ciphermate.ai.ollama.apiUrl`
     - Set to: `http://64.225.56.89:11434`
   
   - Search: `ciphermate.ai.ollama.model`
     - Set to: `deepseek-coder:6.7b`
   
   - Search: `ciphermate.ai.ollama.timeout`
     - Set to: `120000`

5. **Reload VS Code** (or restart)

---

### Method 2: Edit settings.json Directly (Faster)

1. **Open settings.json:**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: `Preferences: Open User Settings (JSON)`
   - Press Enter

2. **Add or update these lines:**

```json
{
  "ciphermate.ai.provider": "ollama",
  "ciphermate.ai.ollama.apiUrl": "http://64.225.56.89:11434",
  "ciphermate.ai.ollama.model": "deepseek-coder:6.7b",
  "ciphermate.ai.ollama.timeout": 120000
}
```

3. **Save the file** (`Cmd+S` or `Ctrl+S`)

4. **Reload VS Code** (or restart)

---

## ✅ Verify It's Working

1. **Open CipherMate chat:**
   - Press `Cmd+Shift+P`
   - Type: `CipherMate`
   - Press Enter

2. **Test with:**
   ```
   Hello, test connection
   ```

3. **You should get a response from DeepSeek Coder!** 🎉

---

## 🐛 If Still Not Working

### Check Settings Are Saved

```bash
# In VS Code, open Command Palette
# Type: Preferences: Open User Settings (JSON)
# Verify the settings are there
```

### Check Ollama is Accessible

```bash
# Test from terminal
curl http://64.225.56.89:11434/api/tags

# Should return: {"models":[]} or list of models
```

### Check Extension Logs

1. Open Output panel: `View` → `Output`
2. Select "CipherMate" from dropdown
3. Look for errors

### Restart VS Code

Sometimes settings don't take effect until restart:
- `Cmd+Q` (Mac) or `Alt+F4` (Windows) to quit
- Reopen VS Code

---

## 📋 Complete Settings Checklist

Make sure ALL these are set:

- ✅ `ciphermate.ai.provider` = `"ollama"`
- ✅ `ciphermate.ai.ollama.apiUrl` = `"http://64.225.56.89:11434"`
- ✅ `ciphermate.ai.ollama.model` = `"deepseek-coder:6.7b"`
- ✅ `ciphermate.ai.ollama.timeout` = `120000`

---

## 💡 Pro Tip

After changing settings, you might need to:
1. Reload VS Code window: `Cmd+Shift+P` → `Developer: Reload Window`
2. Or fully restart VS Code

This ensures the extension picks up the new settings.

