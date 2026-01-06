# How to Test CipherMate Extension

## Launching the Extension (Mac)

Since F5 triggers Siri on Mac, use one of these methods:

### Method 1: Command Palette (Recommended)
1. Press `Cmd+Shift+P` (Command + Shift + P)
2. Type: `Debug: Start Debugging`
3. Press Enter
4. Select "Extension Development Host" if prompted

### Method 2: Menu Bar
1. Go to: `Run` → `Start Debugging`
2. Or: `Run` → `Run Without Debugging`

### Method 3: Keyboard Shortcut
- Press `Cmd+F5` (Command + F5) - This should work instead of just F5

### Method 4: Disable Siri Shortcut (Optional)
If you want to use F5:
1. Go to System Settings → Keyboard → Keyboard Shortcuts
2. Find "Siri" or "Dictation"
3. Disable or change the F5 shortcut

---

## After Launching

Once Extension Development Host opens:

### Test Welcome Screen
1. **Auto-opens**: Welcome screen should appear automatically
2. **Or click**: CipherMate icon in activity bar (left sidebar)
3. **You should see**:
   - Logo
   - Quick Start Guide
   - Two option cards (Configure API Key, Start Chatting)

### Test Activity Bar
1. Click **CipherMate icon** in left sidebar
2. You should see:
   - **Welcome** section with quick actions
   - **Findings** section

### Test Settings
1. Click "Configure API Key" card on welcome screen
2. OR: `Cmd+Shift+P` → `CipherMate: Advanced Settings`
3. Should see sidebar-based settings panel

### Test Chat
1. Click "Start Chatting" card
2. OR: Type in quick input field
3. Should switch to chat interface

---

## Troubleshooting

**If welcome screen doesn't auto-open:**
- Check Output panel: `View → Output → Select "CipherMate"`
- Check Developer Console: `Help → Toggle Developer Tools`

**If extension doesn't load:**
- Make sure you're in the `ciphermate` folder
- Run `npm run compile` first
- Check for errors in terminal

**If you see errors:**
- Check Developer Console for JavaScript errors
- Check Output panel for extension logs
- Rebuild: `npm run compile`

---

## Quick Commands

All accessible via `Cmd+Shift+P`:

- `CipherMate` - Open welcome screen
- `CipherMate: Advanced Settings` - Open settings
- `CipherMate: Show Results Panel` - View results
- `Debug: Start Debugging` - Launch extension host

---

**Ready to test! Use `Cmd+Shift+P` → "Debug: Start Debugging"**

