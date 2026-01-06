# CipherMate AI Training Framework

## Overview

This document describes how to train your own agentic AI model for CipherMate's security analysis capabilities. The model will be trained specifically for repository scanning and vulnerability fixing.

## Training Data Structure

### 1. Security Analysis Training Data

Your training dataset should include examples of:

#### Repository Scanning Tasks

```json
{
  "instruction": "Scan this repository for security vulnerabilities",
  "input": {
    "repository_path": "/path/to/repo",
    "files": ["src/app.js", "src/auth.py"],
    "code_samples": {
      "src/app.js": "const query = 'SELECT * FROM users WHERE id = ' + userId;",
      "src/auth.py": "password = input('Password: ')\nif password == 'admin123':\n    login()"
    }
  },
  "output": {
    "vulnerabilities": [
      {
        "type": "SQL_INJECTION",
        "severity": "CRITICAL",
        "file": "src/app.js",
        "line": 42,
        "description": "SQL injection vulnerability - user input concatenated into query",
        "code": "const query = 'SELECT * FROM users WHERE id = ' + userId;",
        "explanation": "Direct string concatenation allows SQL injection attacks",
        "fix": "Use parameterized queries: const query = 'SELECT * FROM users WHERE id = ?'; db.query(query, [userId]);"
      },
      {
        "type": "WEAK_PASSWORD",
        "severity": "HIGH",
        "file": "src/auth.py",
        "line": 1,
        "description": "Hardcoded password comparison",
        "code": "if password == 'admin123':",
        "explanation": "Hardcoded passwords are security risks",
        "fix": "Use password hashing: if bcrypt.checkpw(password.encode(), stored_hash):"
      }
    ],
    "summary": {
      "total": 2,
      "critical": 1,
      "high": 1,
      "medium": 0,
      "low": 0
    }
  }
}
```

#### Code Analysis Tasks

```json
{
  "instruction": "Analyze this code for security issues",
  "input": {
    "code": "function login(username, password) {\n  const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;\n  return db.query(query);\n}",
    "language": "javascript",
    "context": "User authentication function"
  },
  "output": {
    "issues": [
      {
        "type": "SQL_INJECTION",
        "severity": "CRITICAL",
        "description": "Template literal allows SQL injection",
        "explanation": "User input directly interpolated into SQL query",
        "fix": "Use parameterized queries with placeholders"
      },
      {
        "type": "PASSWORD_PLAINTEXT",
        "severity": "CRITICAL",
        "description": "Passwords stored/compared in plaintext",
        "explanation": "Passwords should be hashed before comparison",
        "fix": "Hash passwords using bcrypt or similar"
      }
    ],
    "secure_code": "async function login(username, password) {\n  const query = 'SELECT * FROM users WHERE username = ?';\n  const user = await db.query(query, [username]);\n  if (user && bcrypt.compareSync(password, user.password_hash)) {\n    return user;\n  }\n  return null;\n}"
  }
}
```

#### Vulnerability Fixing Tasks

```json
{
  "instruction": "Generate a secure fix for this vulnerability",
  "input": {
    "vulnerability": {
      "type": "XSS",
      "severity": "HIGH",
      "file": "src/comment.js",
      "line": 15,
      "code": "document.getElementById('comment').innerHTML = userComment;",
      "context": "User comment display function"
    }
  },
  "output": {
    "original_code": "document.getElementById('comment').innerHTML = userComment;",
    "fixed_code": "document.getElementById('comment').textContent = userComment;",
    "explanation": "Using textContent prevents HTML injection. For rich text, use DOMPurify.sanitize(userComment)",
    "security_improvements": [
      "Prevents XSS attacks",
      "Sanitizes user input",
      "Uses safe DOM manipulation"
    ],
    "testing_notes": "Test with: <script>alert('XSS')</script>",
    "confidence": 0.95
  }
}
```

### 2. Tool Calling Training Data

Train the model to understand when to use which tools:

```json
{
  "instruction": "I need to secure my codebase",
  "conversation": [
    {
      "role": "user",
      "content": "I need to secure my codebase"
    },
    {
      "role": "assistant",
      "content": "I'll help you secure your codebase. Let me start by scanning the repository for vulnerabilities.",
      "tool_calls": [
        {
          "id": "call_123",
          "type": "function",
          "function": {
            "name": "scan_repository",
            "arguments": "{\"path\": \".\", \"includePatterns\": [\"*.js\", \"*.py\", \"*.ts\"]}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_123",
      "name": "scan_repository",
      "content": "{\"vulnerabilities\": [{\"type\": \"SQL_INJECTION\", \"severity\": \"CRITICAL\", \"file\": \"src/app.js\", \"line\": 42}]}"
    },
    {
      "role": "assistant",
      "content": "Found 1 critical SQL injection vulnerability in src/app.js. Let me generate a fix for it.",
      "tool_calls": [
        {
          "id": "call_124",
          "type": "function",
          "function": {
            "name": "generate_fix",
            "arguments": "{\"vulnerability\": {\"type\": \"SQL_INJECTION\", \"severity\": \"CRITICAL\", \"file\": \"src/app.js\", \"line\": 42}}"
          }
        }
      ]
    }
  ]
}
```

## Training Prompt Templates

### System Prompt for Security Analysis

```
You are CipherMate, an expert security analysis AI specialized in:

1. Repository Security Scanning
   - Identify vulnerabilities in codebases
   - Use multiple analysis techniques (static analysis, pattern recognition, semantic analysis)
   - Prioritize findings by severity and exploitability

2. Vulnerability Detection
   - SQL Injection, XSS, CSRF, Authentication flaws
   - Cryptographic weaknesses, insecure configurations
   - Business logic vulnerabilities
   - Data exposure risks

3. Secure Code Generation
   - Generate fixes that are secure by default
   - Follow security best practices
   - Provide explanations and testing guidance

4. Code Analysis
   - Deep semantic understanding of code
   - Context-aware vulnerability detection
   - Multi-file analysis for complex vulnerabilities

Your responses should be:
- Technical and precise
- Security-focused
- Actionable with clear fixes
- Educational (explain why something is vulnerable)

Always prioritize security over convenience. When in doubt, choose the more secure option.
```

### Example Training Prompts

#### Prompt 1: Repository Scan

```
System: [System prompt above]

User: Scan this repository for security vulnerabilities:

Repository structure:
- src/app.js (Express.js application)
- src/auth.py (Authentication module)
- config/database.js (Database configuration)

Code samples:
app.js:
const express = require('express');
const db = require('./config/database');
app.get('/user/:id', (req, res) => {
  const query = 'SELECT * FROM users WHERE id = ' + req.params.id;
  db.query(query, (err, results) => {
    res.json(results);
  });
});

Assistant: I'll analyze the code for security vulnerabilities.

[Tool call: scan_file on src/app.js]
[Tool call: scan_file on src/auth.py]

Analysis complete. Found critical SQL injection vulnerability in src/app.js at line 4. The user ID parameter is directly concatenated into the SQL query without sanitization.

Vulnerability details:
- Type: SQL_INJECTION
- Severity: CRITICAL
- Location: src/app.js:4
- Code: const query = 'SELECT * FROM users WHERE id = ' + req.params.id;
- Risk: Attackers can manipulate the query to extract or modify data

Secure fix:
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [req.params.id], (err, results) => {
  res.json(results);
});
```

#### Prompt 2: Fix Generation

```
System: [System prompt above]

User: Generate a secure fix for this SQL injection vulnerability:

Vulnerable code:
const query = 'SELECT * FROM users WHERE id = ' + userId;
db.query(query);

Context: Node.js Express application using MySQL database

Assistant: I'll generate a secure fix using parameterized queries.

Original code:
const query = 'SELECT * FROM users WHERE id = ' + userId;
db.query(query);

Fixed code:
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);

Explanation:
- Parameterized queries prevent SQL injection by separating code from data
- The database driver handles escaping and type checking
- This is the standard secure approach for database queries

Security improvements:
1. Prevents SQL injection attacks
2. Automatic input sanitization
3. Type safety
4. Follows OWASP best practices

Testing:
Test with malicious input: userId = "1 OR 1=1" should not affect query behavior.
```

## Training Dataset Categories

### 1. Vulnerability Patterns (10,000+ examples)

- SQL Injection variations
- XSS (reflected, stored, DOM-based)
- CSRF vulnerabilities
- Authentication/Authorization flaws
- Cryptographic weaknesses
- Insecure deserialization
- Path traversal
- Command injection
- XXE (XML External Entity)
- SSRF (Server-Side Request Forgery)

### 2. Language-Specific Patterns (5,000+ per language)

- JavaScript/TypeScript: Prototype pollution, prototype chain attacks
- Python: Pickle deserialization, eval() usage
- Java: Deserialization vulnerabilities, reflection abuse
- PHP: Magic hash vulnerabilities, type juggling
- Go: Unsafe pointer usage, race conditions

### 3. Framework-Specific Patterns (3,000+ per framework)

- Express.js security patterns
- Django security patterns
- Spring Boot security patterns
- React security patterns
- Next.js security patterns

### 4. Fix Generation Examples (15,000+ examples)

- Before/after code pairs
- Secure alternatives
- Best practice implementations
- Context-aware fixes

## Model Architecture Recommendations

### Option 1: Fine-tuned Base Model
- Start with: GPT-4, Claude, or Llama 3
- Fine-tune on security analysis dataset
- Add tool calling capabilities
- **Pros**: Faster to deploy, good results
- **Cons**: Dependent on base model, ongoing costs

### Option 2: Custom Trained Model
- Train from scratch or continue training
- Specialized architecture for code analysis
- **Pros**: Full control, optimized for security
- **Cons**: Requires more resources, longer development

### Option 3: Ensemble Approach
- Multiple specialized models
- One for scanning, one for fixing, one for explanation
- **Pros**: Best performance per task
- **Cons**: More complex deployment

## Deployment Architecture

```
                                                         
  ‚  CipherMate       ‚
  ‚  VS Code          ‚
  ‚  Extension        ‚
                             ¬                           
           ‚ HTTPS/REST API
           ‚ (Authenticated)
          –¼
                                                         
  ‚  API Gateway      ‚
  ‚  (Rate limiting)  ‚
                             ¬                           
           ‚
          –¼
                                                         
  ‚  AI Service       ‚
  ‚  (Your trained    ‚
  ‚   model)          ‚
                             ¬                           
           ‚
          –¼
                                                         
  ‚  Tool Executor    ‚
  ‚  (Security        ‚
  ‚   analysis        ‚
  ‚   tools)          ‚
                                                         
```

## API Endpoint Specification

Your AI service should implement:

```
POST /v1/chat/completions

Request:
{
  "model": "ciphermate-security-agent",
  "messages": [...],
  "tools": [...],
  "temperature": 0.7,
  "max_tokens": 2000
}

Response:
{
  "choices": [{
    "message": {
      "content": "...",
      "tool_calls": [...]
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

## Training Pipeline

1. **Data Collection**
   - Gather vulnerability examples from real codebases
   - Create fix examples
   - Generate synthetic vulnerabilities for edge cases

2. **Data Preprocessing**
   - Normalize code formats
   - Extract security patterns
   - Create tool calling examples

3. **Model Training**
   - Fine-tune base model
   - Train on security-specific tasks
   - Validate on holdout set

4. **Evaluation**
   - Test on unseen vulnerabilities
   - Measure false positive/negative rates
   - Validate fix quality

5. **Deployment**
   - Deploy as API service
   - Set up monitoring
   - Implement rate limiting

## Privacy Considerations

- Code sent to API should be encrypted in transit (HTTPS)
- Consider on-premise deployment option
- Option to hash/obfuscate sensitive code sections
- Audit logs for compliance
- Data retention policies

## Next Steps

1. Collect training dataset (start with 1,000 examples)
2. Set up training infrastructure
3. Fine-tune base model
4. Deploy as API service
5. Integrate with CipherMate extension
6. Scale based on usage

---

**Note**: The CloudAIService is already implemented in the extension. You just need to:
1. Train your model
2. Deploy it as an API
3. Configure the API URL in CipherMate settings
4. Start using it!


