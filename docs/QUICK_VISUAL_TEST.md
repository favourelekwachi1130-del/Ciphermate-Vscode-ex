# Quick Visual Test - 3 Steps

## Step 1: Launch Extension Development Host

**In VS Code:**
1. Open the `ciphermate` folder in VS Code
2. Press **`F5`** (or `Cmd+F5` on Mac)
3. Wait for new VS Code window: **"[Extension Development Host]"**

This is your test environment!

---

## Step 2: Test Chat Interface (Main UI)

**In the Extension Development Host window:**

1. Press **`Cmd+Shift+P`** (Mac) or **`Ctrl+Shift+P`** (Windows/Linux)
2. Type: **`CipherMate`** and press Enter
3. **Chat panel opens** - You should see:
   - Header: "CipherMate"
   - Welcome message from "CM"
   - Input box at bottom
   - 4 quick action buttons

**Try these:**
- Type: `"Hello, test"`
- Click Send or press Enter
- Click quick action: "Scan Repository"

---

## Step 3: Test All Components

**Open each component:**

| Component | Command |
|-----------|---------|
| **Chat** | `CipherMate` |
| **Results** | `CipherMate: Show Results Panel` |
| **Settings** | `CipherMate: Settings` |
| **Dashboard** | `CipherMate: Home Dashboard` |
| **Profile** | `CipherMate: User Profile` |
| **Team** | `CipherMate: Team Dashboard` |
| **Red Team** | `CipherMate: Red Team Operations Center` |

**Quick Access:**
- Press `Cmd/Ctrl + Shift + P`
- Type component name
- Press Enter

---

## What to Look For

### Chat Interface
- [ ] Clean, modern design
- [ ] Messages appear correctly
- [ ] Input expands when typing
- [ ] Quick actions work
- [ ] VS Code theme colors applied

### Results Panel
- [ ] Filters visible
- [ ] Vulnerability cards display
- [ ] Action buttons work
- [ ] Code preview works

### Settings
- [ ] All toggles work
- [ ] Inputs save correctly
- [ ] Layout clean

### Dashboard
- [ ] Stats cards show
- [ ] Quick actions work
- [ ] Recent scans visible

---

## If Something Doesn't Work

1. **Check Developer Console:**
   - `Help -> Toggle Developer Tools`
   - Look for errors in Console tab

2. **Check Output:**
   - `View -> Output`
   - Select "CipherMate" from dropdown

3. **Rebuild:**
   ```bash
   npm run compile
   ```
   Then press F5 again

---

## Take Screenshots

Capture screenshots of each component for reference:
- Chat interface
- Results panel
- Settings
- Dashboard
- Any issues you find

---

**Ready! Press F5 and start testing!**

