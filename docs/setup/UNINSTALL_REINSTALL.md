# How to Uninstall and Reinstall CipherMate

## Uninstall Current Version

### Method 1: From Extensions View (Easiest)

1. **Open Extensions view**: Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows)
2. **Find CipherMate** in the installed extensions list
3. **Click the gear icon** (⚙) next to CipherMate
4. **Select "Uninstall"**
5. **Reload VS Code** when prompted (or press `Cmd+R` / `Ctrl+R`)

### Method 2: From Command Palette

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
2. Type: `Extensions: Uninstall Extension`
3. Select "CipherMate"
4. Confirm uninstall
5. Reload VS Code

### Method 3: Command Line

```bash
code --uninstall-extension ciphermate.ciphermate
```

Then reload VS Code.

---

## Install New Version

### Method 1: Install from VSIX (Recommended)

1. **Open Extensions view**: `Cmd+Shift+X`
2. **Click the "..." menu** (three dots, top right of Extensions panel)
3. **Select "Install from VSIX..."**
4. **Navigate to**: `/Users/manny/Desktop/FILES/Developer/Cip3rmate/ciphermate/`
5. **Select**: `ciphermate-1.0.2.vsix`
6. **Click "Install"**
7. **Reload VS Code** when prompted

### Method 2: Command Line

```bash
code --install-extension /Users/manny/Desktop/FILES/Developer/Cip3rmate/ciphermate/ciphermate-1.0.2.vsix --force
```

The `--force` flag will overwrite the existing installation.

### Method 3: Drag and Drop

1. Open Extensions view (`Cmd+Shift+X`)
2. Drag `ciphermate-1.0.2.vsix` file into the Extensions panel
3. VS Code will install it automatically

---

## If Uninstall Button Doesn't Work

### Force Remove via Command Line

```bash
# Find extension location
code --list-extensions --show-versions | grep ciphermate

# Remove manually (if needed)
rm -rf ~/.vscode/extensions/ciphermate.ciphermate-*
```

Then install the new VSIX.

---

## Verify Installation

After installing:

1. Check Extensions view - should show version 1.0.2
2. Click CipherMate icon in activity bar
3. Welcome screen should open with new UI
4. Check that settings panel has sidebar navigation

---

## Quick Command (All in One)

```bash
# Uninstall old version
code --uninstall-extension ciphermate.ciphermate

# Install new version (force overwrite)
code --install-extension /Users/manny/Desktop/FILES/Developer/Cip3rmate/ciphermate/ciphermate-1.0.2.vsix --force

# Reload VS Code
code -r
```

---

**After reinstalling, click the CipherMate icon to see the new welcome screen!**

