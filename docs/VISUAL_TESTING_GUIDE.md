# Visual Testing Guide - See Everything in Action

Complete guide to test and view all CipherMate UI components visually in VS Code.

## Quick Start - Run Extension

### Step 1: Build the Extension
```bash
cd ciphermate
npm install  # If not already done
npm run compile
```

### Step 2: Launch Extension Development Host
1. Press `F5` in VS Code (or `Cmd+F5` on Mac)
2. This opens a new VS Code window: **"[Extension Development Host]"**
3. This is where you'll test the extension

### Step 3: Test All Components

---

## Visual Testing Checklist

### 1. Chat Interface (Main UI)
**Command**: `Cmd/Ctrl + Shift + P` -> `CipherMate` or `CipherMate: Open Chat`

**What to Check**:
- [ ] Header shows "CipherMate" title
- [ ] Subtitle: "AI-powered security assistant..."
- [ ] Welcome message from "CM" avatar
- [ ] Input textarea expands when typing
- [ ] Send button works
- [ ] Quick action buttons visible (4 buttons)
- [ ] Messages appear on right (user) and left (assistant)
- [ ] "Thinking..." indicator shows when processing
- [ ] Enter key sends message
- [ ] Shift+Enter creates new line
- [ ] Messages scroll automatically
- [ ] VS Code theme colors applied correctly

**Test Messages**:
- "Hello, test connection"
- "scan my code"
- "show results"
- "fix vulnerabilities"

---

### 2. Results Panel
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Show Results Panel`

**What to Check**:
- [ ] Panel opens in new tab
- [ ] Shows "Security Scan Results" header
- [ ] Filter buttons visible (All, Critical, High, Medium, Low)
- [ ] Search input field works
- [ ] Vulnerability cards display correctly
- [ ] Severity badges show correct colors
- [ ] File paths and line numbers visible
- [ ] Action buttons work (Fix, Explain, View Code)
- [ ] Code preview expands/collapses
- [ ] Statistics summary visible

**To Generate Test Results**:
1. Run a scan first: `CipherMate: Intelligent Repository Scan`
2. Then open results panel

---

###     3. Settings Panel
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Settings`

**What to Check**:
- [ ] Panel opens correctly
- [ ] Toggle switches work (Semgrep, Bandit, Scan on Save)
- [ ] Input fields editable
- [ ] LM Studio URL field visible
- [ ] Save button works
- [ ] Cancel button works
- [ ] Settings persist after save

---

###     4. Advanced Settings
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Advanced Settings`

**What to Check**:
- [ ] All basic settings visible
- [ ] AI Provider dropdown works
- [ ] Multi-provider options visible
- [ ] Cloud AI configuration section
- [ ] Team settings section
- [ ] Notification preferences
- [ ] Performance settings
- [ ] All inputs save correctly

---

###     5. Home Dashboard
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Home Dashboard`

**What to Check**:
- [ ] Dashboard opens in new tab
- [ ] Statistics cards display (Total, Critical, High, Medium, Low)
- [ ] Numbers update correctly
- [ ] Quick action buttons work
- [ ] Recent scans section visible
- [ ] Navigation links work
- [ ] Icons display correctly
- [ ] Layout responsive

---

###     6. Team Dashboard
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Team Dashboard`

**What to Check**:
- [ ] Dashboard opens
- [ ] Team member list visible
- [ ] Vulnerability reports display
- [ ] Statistics show correctly
- [ ] Reporting configuration visible
- [ ] Team lead controls work (if applicable)

**Note**: Requires team setup first

---

###     7. User Profile
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: User Profile` or `CipherMate: Show Developer Profile`

**What to Check**:
- [ ] Profile panel opens
- [ ] Security learning progress visible
- [ ] Vulnerability history displays
- [ ] Common mistakes tracked
- [ ] Improvement suggestions show
- [ ] Statistics charts render
- [ ] Achievement badges display (if any)

---

###     8. Team Setup
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Setup Team Collaboration`

**What to Check**:
- [ ] Setup wizard opens
- [ ] Team lead configuration form
- [ ] Member addition/removal works
- [ ] Role assignment dropdowns
- [ ] Reporting preferences visible
- [ ] Policy settings accessible
- [ ] Save/Next buttons work

---

###     9. Red Team Operations Center
**Command**: `Cmd/Ctrl + Shift + P`  �  `CipherMate: Red Team Operations Center`

**What to Check**:
- [ ] Operations center opens
- [ ] Sidebar with modules visible
- [ ] Module switching works
- [ ] Command & Control chat interface
- [ ] Command input works
- [ ] Execute button functions
- [ ] Status indicators show
- [ ] Terminal output displays

---

###     10. Activity Bar Integration
**Location**: Left sidebar in VS Code

**What to Check**:
- [ ] CipherMate icon visible
- [ ] Clicking icon opens Findings panel
- [ ] Findings list displays vulnerabilities
- [ ] Clicking findings opens file at line
- [ ] Panel refreshes after scans

---

###     11. Command Palette Integration
**Location**: `Cmd/Ctrl + Shift + P`

**What to Check**:
- [ ] All CipherMate commands visible
- [ ] Commands grouped correctly
- [ ] Command descriptions accurate
- [ ] Commands execute correctly
- [ ] No duplicate commands

**Key Commands to Test**:
- `CipherMate` - Opens chat
- `CipherMate: Scan Code` - Quick scan
- `CipherMate: Intelligent Repository Scan` - Full scan
- `CipherMate: Show Results Panel` - Results view
- `CipherMate: Settings` - Settings panel
- `CipherMate: Home Dashboard` - Dashboard

---

###     12. Status Bar Integration
**Location**: Bottom of VS Code window

**What to Check**:
- [ ] Status bar item visible
- [ ] Shows scan status
- [ ] Shows vulnerability count
- [ ] Clicking opens results
- [ ] Updates after scans

---

###     13. Notifications
**What to Check**:
- [ ] Toast notifications appear
- [ ] Scan completion notifications
- [ ] Vulnerability found alerts
- [ ] Fix applied confirmations
- [ ] Error messages display
- [ ] Notification styling correct

---

##      Visual Design Testing

### Theme Compatibility
Test with different VS Code themes:

1. **Dark Theme** (Default Dark+)
   - [ ] All components readable
   - [ ] Colors contrast well
   - [ ] Borders visible
   - [ ] Text readable

2. **Light Theme** (Default Light+)
   - [ ] All components readable
   - [ ] Colors work in light mode
   - [ ] No white-on-white issues

3. **High Contrast Theme**
   - [ ] Accessibility maintained
   - [ ] All elements visible

### Responsive Design
- [ ] Panels resize correctly
- [ ] Text wraps properly
- [ ] Buttons remain accessible
- [ ] No horizontal scrolling
- [ ] Mobile-friendly (if applicable)

### Typography
- [ ] Fonts load correctly
- [ ] Code font renders properly
- [ ] Text sizes appropriate
- [ ] Line heights readable
- [ ] No text overflow

### Colors & Contrast
- [ ] VS Code theme variables used
- [ ] Sufficient contrast ratios
- [ ] Color-blind friendly
- [ ] Status colors clear (red/yellow/green)

---

##      Common Issues to Check

### Chat Interface
- [ ] Messages don't disappear on panel switch
- [ ] Input clears after sending
- [ ] Quick actions trigger correctly
- [ ] Thinking indicator shows/hides
- [ ] Long messages wrap correctly
- [ ] Code in messages displays (if any)

### Results Panel
- [ ] Filters work correctly
- [ ] Search finds vulnerabilities
- [ ] Cards expand/collapse
- [ ] Code preview scrolls
- [ ] Action buttons respond
- [ ] No duplicate results

### Settings
- [ ] Changes save correctly
- [ ] Validation works
- [ ] Error messages clear
- [ ] Defaults restore properly
- [ ] Settings persist across sessions

---

##      Screenshot Checklist

Take screenshots of:
1.     Chat Interface (empty state)
2.     Chat Interface (with messages)
3.     Results Panel (with vulnerabilities)
4.     Settings Panel
5.     Advanced Settings
6.     Home Dashboard
7.     Team Dashboard
8.     User Profile
9.     Red Team Operations Center
10.     Activity Bar Findings Panel

---

##      Debugging Tips

### If Extension Doesn't Load:
1. Check `npm run compile` completed successfully
2. Check for TypeScript errors
3. Check VS Code Developer Console: `Help  �  Toggle Developer Tools`
4. Look for errors in Output panel

### If UI Doesn't Show:
1. Check webview panel created correctly
2. Check HTML rendering in Developer Tools
3. Check for JavaScript errors
4. Verify VS Code API calls work

### If Styling Looks Wrong:
1. Check VS Code theme variables used
2. Check CSS in Developer Tools
3. Verify theme compatibility
4. Check for CSS conflicts

---

##      Quick Test Script

Run these commands in sequence:

```bash
# 1. Build
npm run compile

# 2. Press F5 to launch Extension Development Host

# 3. In Extension Development Host, test:
# - Cmd+Shift+P  �  "CipherMate" (opens chat)
# - Type: "scan my code"
# - Cmd+Shift+P  �  "CipherMate: Show Results Panel"
# - Cmd+Shift+P  �  "CipherMate: Settings"
# - Cmd+Shift+P  �  "CipherMate: Home Dashboard"
```

---

##      Testing Notes Template

```
Date: ___________
VS Code Version: ___________
Theme: ___________

Issues Found:
1. 
2. 
3. 

Visual Improvements Needed:
1. 
2. 
3. 

Working Well:
1. 
2. 
3. 
```

---

##     Final Checklist

Before considering testing complete:

- [ ] All 9 main UI components tested
- [ ] All VS Code integrations tested
- [ ] Dark and light themes tested
- [ ] Responsive design verified
- [ ] All commands work
- [ ] No console errors
- [ ] No visual glitches
- [ ] Accessibility maintained
- [ ] Performance acceptable
- [ ] Screenshots taken

---

**Ready to test! Press F5 and start exploring!**     

