# CipherMate Interaction Flow

## 🎯 User Interaction Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER OPENS CIPHERMATE                    │
│              (Cmd+Shift+P → "CipherMate")                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │      WELCOME SCREEN            │
        │  ┌─────────────────────────┐  │
        │  │   CipherMate Logo        │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │  Chat Input Box          │  │
        │  │  (with rotating hints)    │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │  Quick Action Buttons    │  │
        │  │  [Scan] [Secrets] [etc] │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │  Configure AI Provider   │  │
        │  └─────────────────────────┘  │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────┐            ┌──────────────────┐
│  METHOD 1:    │            │   METHOD 2:      │
│  Click Button │            │   Type Command   │
└───────┬───────┘            └────────┬─────────┘
        │                             │
        │                             │
        └───────────────┬─────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   MESSAGE SENT TO AI          │
        │   (via vscode.postMessage)    │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   REQUEST TYPE DETECTION      │
        │                               │
        │   Is it a scan request?       │
        │   ├─ YES → AgenticCore        │
        │   └─ NO  → CyberAgent         │
        │                               │
        │   Mode detection:             │
        │   ├─ Smart contract?         │
        │   ├─ Web security?            │
        │   └─ General?                 │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐        ┌──────────────────────┐
│  SCAN REQUEST    │        │  CONVERSATIONAL      │
│                  │        │                      │
│  AgenticCore     │        │  CyberAgent          │
│  ├─ Uses tools   │        │  ├─ Mode switching   │
│  ├─ Runs scans   │        │  ├─ Natural language │
│  └─ Returns data │        │  └─ Educational      │
└────────┬─────────┘        └──────────┬───────────┘
         │                             │
         │                             │
         └───────────────┬─────────────┘
                         │
                         ▼
        ┌───────────────────────────────┐
        │   REPOSITORY SCANNER          │
        │   (if scan requested)         │
        │                               │
        │   Runs 4 scanners:            │
        │   ├─ Dependency Scanner       │
        │   ├─ Secrets Scanner         │
        │   ├─ Smart Contract Scanner   │
        │   └─ Code Pattern Scanner     │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   RESULTS AGGREGATED          │
        │   ├─ Vulnerabilities found    │
        │   ├─ Severity calculated      │
        │   └─ Summary generated        │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   RESPONSE DISPLAYED          │
        │                               │
        │   ┌─────────────────────────┐ │
        │   │  Chat Message           │ │
        │   │  (User-friendly text)   │ │
        │   └─────────────────────────┘ │
        │                               │
        │   ┌─────────────────────────┐ │
        │   │  Results Panel          │ │
        │   │  (Detailed findings)    │ │
        │   └─────────────────────────┘ │
        │                               │
        │   ┌─────────────────────────┐ │
        │   │  Inline Diagnostics     │ │
        │   │  (Editor highlights)   │ │
        │   └─────────────────────────┘ │
        └───────────────────────────────┘
```

---

## 🔄 Interaction Methods

### Method 1: Quick Action Buttons (Fastest)

```
User clicks button
    ↓
Button sends message via vscode.postMessage
    ↓
Extension receives message
    ↓
Processes request
    ↓
Returns results
```

**Example**:
- Click **"Scan Repository"** → Full scan runs → Results appear

---

### Method 2: Natural Language Chat (Most Flexible)

```
User types message
    ↓
Press Enter or click Send
    ↓
Message sent to extension
    ↓
AI analyzes intent
    ↓
Routes to appropriate handler
    ↓
Returns conversational response
```

**Example**:
- Type: `"scan my repository"` → Scan runs → Results + explanation

---

### Method 3: Command Palette (Power Users)

```
Cmd+Shift+P
    ↓
Type "CipherMate"
    ↓
Select command
    ↓
Action executes
    ↓
Results displayed
```

**Example**:
- `Cmd+Shift+P` → `CipherMate: Intelligent Scan` → Scan runs

---

## 💬 Conversation Flow Examples

### Example 1: Simple Scan
```
User: [Clicks "Scan Repository"]
    ↓
System: "Scanning repository..."
    ↓
System: "Found 12 vulnerabilities (3 critical, 5 high)"
    ↓
User: "Show me the critical ones"
    ↓
System: [Lists critical vulnerabilities]
```

### Example 2: Educational Query
```
User: "What is SQL injection?"
    ↓
System: [Switches to conversational mode]
    ↓
System: "SQL injection is a code injection technique..."
    ↓
User: "How do I prevent it?"
    ↓
System: "To prevent SQL injection, use parameterized queries..."
```

### Example 3: Context-Aware
```
User: "Analyze my smart contract"
    ↓
System: [Detects "smart contract" keyword]
    ↓
System: [Switches to smartcontract mode]
    ↓
System: "Scanning Solidity files..."
    ↓
System: "Found reentrancy vulnerability in Withdraw.sol:42"
    ↓
User: "How do I fix it?"
    ↓
System: [Provides Solidity code fix with explanation]
```

---

## 🎯 Decision Tree

```
User Action
    │
    ├─ Click Button?
    │   └─ Yes → Send button's data-action text
    │
    ├─ Type Command?
    │   └─ Yes → Send typed text
    │
    └─ Use Command Palette?
        └─ Yes → Execute command directly

    ↓

Message Received
    │
    ├─ Contains "scan", "find", "check", "analyze"?
    │   └─ Yes → Use AgenticCore (tool calling)
    │
    ├─ Contains "smart contract", "solidity", "web3"?
    │   └─ Yes → Switch to smartcontract mode
    │
    ├─ Contains "web", "api", "http", "owasp"?
    │   └─ Yes → Switch to webpentest mode
    │
    └─ Otherwise → Use CyberAgent (conversational)

    ↓

Response Generated
    │
    ├─ Scan Request?
    │   └─ Yes → Run scanners → Aggregate → Display
    │
    └─ Conversational?
        └─ Yes → Generate response → Display
```

---

## 📊 Results Display Flow

```
Scan Completes
    ↓
Results Aggregated
    ↓
    ├─ Display in Chat
    │   └─ User-friendly summary
    │
    ├─ Update Results Panel
    │   └─ Detailed vulnerability cards
    │
    └─ Add Inline Diagnostics
        └─ Editor highlights
```

---

## 🎨 UI States

### State 1: Welcome Screen
- Logo visible
- Chat input with rotating placeholders
- Quick action buttons
- Settings card

### State 2: Chat Mode
- Welcome screen hidden
- Header visible ("CipherMate")
- Messages area visible
- Input area at bottom

### State 3: Results View
- Chat messages
- Results Panel open
- Inline diagnostics in editor

---

## 🔄 Complete User Journey

```
1. User opens VS Code
   ↓
2. Opens workspace
   ↓
3. Presses Cmd+Shift+P
   ↓
4. Types "CipherMate"
   ↓
5. Welcome screen appears
   ↓
6. User clicks "Scan Repository"
   ↓
7. System switches to chat mode
   ↓
8. Shows "Scanning..." message
   ↓
9. Runs 4 scanners in parallel
   ↓
10. Aggregates results
   ↓
11. Displays summary in chat
   ↓
12. Updates Results Panel
   ↓
13. Adds inline diagnostics
   ↓
14. User clicks vulnerability
   ↓
15. Jumps to code location
   ↓
16. User asks: "How do I fix this?"
   ↓
17. AI provides fix suggestion
   ↓
18. User applies fix
   ↓
19. Re-scans to verify
   ↓
20. Issue resolved! ✅
```

---

## 💡 Key Interaction Points

1. **Entry Point**: Command Palette or Activity Bar
2. **Primary Interface**: Chat window
3. **Quick Actions**: 5 buttons for common tasks
4. **Results View**: Panel + Inline diagnostics
5. **Settings**: VS Code settings or Settings card

---

## 🎓 Learning Curve

### Beginner (Day 1)
- Use buttons only
- Click "Scan Repository"
- Read results

### Intermediate (Week 1)
- Type natural language commands
- Ask follow-up questions
- Use Results Panel

### Advanced (Month 1)
- Customize AI provider
- Configure scanners
- Integrate with workflows

---

**The system is designed to be intuitive - start with buttons, progress to natural language!** 🚀

