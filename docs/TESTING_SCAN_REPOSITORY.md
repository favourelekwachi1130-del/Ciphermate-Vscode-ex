# Testing Repository Scan Functionality

## Quick Test Steps

### 1. **Open VS Code with a Workspace**
   - Open VS Code
   - File → Open Folder
   - Select a folder that contains code (e.g., your CipherMate project folder)

### 2. **Open CipherMate Chat**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: `CipherMate`
   - Press Enter
   - The chat panel should open

### 3. **Test the Scan**
   Type one of these commands in the chat:
   ```
   scan my repository
   ```
   or
   ```
   scan my codebase
   ```
   or click the **"Scan Repository"** button

### 4. **What to Expect**
   You should see:
   - ✅ Scan starts immediately
   - ✅ Results appear within 5-10 seconds
   - ✅ Formatted output showing:
     - Total vulnerabilities found
     - Critical/High/Medium/Low counts
     - Scanners used
     - Next steps

---

## Detailed Testing Guide

### Test Case 1: Basic Scan
**Input**: `scan my repository`

**Expected Output**:
```
🔍 **Repository Scan Complete**

📁 **Location**: /path/to/your/workspace

📊 **Results**:
- **Total**: X vulnerabilities found
- **Critical**: X
- **High**: X
- **Medium**: X
- **Low**: X

**Scanners Used**: dependency-scanner, secrets-scanner, ...

💡 **Next Steps**:
- Say "fix vulnerabilities" to generate fixes
- Say "show critical vulnerabilities" to see details
- Say "explain [vulnerability]" for more information
```

### Test Case 2: Check Console Logs
1. Open VS Code Developer Tools:
   - Help → Toggle Developer Tools
   - Go to "Console" tab

2. Look for these logs:
   ```
   AgenticCore: Detected direct scan request, immediately executing scan_repository tool
   AgenticCore: Scanning repository at: /path/to/workspace
   Running scanner: dependency-scanner...
   Running scanner: secrets-scanner...
   AgenticCore: Scan completed, result: {...}
   AgenticCore: Returning success message
   ```

### Test Case 3: Error Handling
**Test without workspace**:
1. Close all folders in VS Code
2. Open CipherMate chat
3. Type: `scan my repository`

**Expected**: Error message explaining you need to open a folder

---

## Troubleshooting

### Issue: No response in chat
**Check**:
1. Open Developer Tools (Help → Toggle Developer Tools)
2. Check Console tab for errors
3. Look for logs starting with `AgenticCore:`

**Common causes**:
- Workspace not open → Open a folder first
- Extension not activated → Reload VS Code window
- Scan hanging → Check console for timeout errors

### Issue: Scan takes too long
**Expected**: Should complete in 5-10 seconds
**If longer**: Check console for which scanner is hanging

### Issue: "No workspace path available"
**Fix**:
1. File → Open Folder
2. Select your project folder
3. Try scan again

---

## Manual Testing Checklist

- [ ] Open VS Code with a workspace folder
- [ ] Open CipherMate chat (`Cmd+Shift+P` → `CipherMate`)
- [ ] Type "scan my repository"
- [ ] See results appear within 10 seconds
- [ ] Results show vulnerability counts
- [ ] Can see scanner names used
- [ ] Next steps are displayed
- [ ] Console shows execution logs
- [ ] No errors in console

---

## Testing Different Scenarios

### Scenario 1: Empty Repository
- Create empty folder
- Open in VS Code
- Scan should return "0 vulnerabilities"

### Scenario 2: Repository with Vulnerabilities
- Use a test repository with known issues
- Scan should find vulnerabilities
- Check that counts match

### Scenario 3: Large Repository
- Test with a large codebase
- Scan should complete (may take longer)
- Check timeout doesn't trigger too early

---

## Debug Mode

To see detailed logs:

1. Open Developer Tools (Help → Toggle Developer Tools)
2. Go to Console tab
3. Filter by "AgenticCore" to see scan logs
4. Filter by "Scanner" to see individual scanner logs

---

## Quick Test Script

You can also test programmatically:

```typescript
// In VS Code Developer Console (Help → Toggle Developer Tools)
// This simulates what happens when you type "scan my repository"

// The extension should automatically:
// 1. Detect "scan my repository" command
// 2. Execute scan_repository tool immediately
// 3. Return formatted results
```

---

## Expected Behavior Summary

✅ **Should Work**:
- Immediate response (no waiting for AI)
- Results appear in 5-10 seconds
- Formatted output with emojis
- Clear next steps
- Console logs show execution

❌ **Should NOT Happen**:
- AI asking for JSON configuration
- "I don't have access" messages
- Hanging with no response
- Timeout errors (unless scan takes >60 seconds)
- Empty responses

---

## Next Steps After Testing

Once scan works:
1. Test "fix vulnerabilities" command
2. Test "show critical vulnerabilities"
3. Test file-specific scans: "scan file X"
4. Test other commands

---

## Report Issues

If something doesn't work:
1. Check console logs
2. Note the exact error message
3. Check if workspace is open
4. Try reloading VS Code window (`Cmd+R` or `Ctrl+R`)

