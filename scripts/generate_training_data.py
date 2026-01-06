#!/usr/bin/env python3
"""
Generate training data for CipherMate AI model
Creates JSONL file in OpenAI fine-tuning format
"""

import json
import random
from typing import List, Dict

# Vulnerability patterns with vulnerable and secure code examples
VULNERABILITY_PATTERNS = {
    "SQL_INJECTION": {
        "vulnerable": [
            "const query = 'SELECT * FROM users WHERE id = ' + userId;",
            "const sql = `SELECT * FROM products WHERE name='${productName}'`;",
            "query = f\"SELECT * FROM users WHERE email='{email}'\"",
            "String sql = \"SELECT * FROM users WHERE id = \" + userId;",
            "$query = \"SELECT * FROM users WHERE id = \" . $userId;"
        ],
        "secure": [
            "const query = 'SELECT * FROM users WHERE id = ?';\ndb.query(query, [userId]);",
            "const sql = 'SELECT * FROM products WHERE name=?';\ndb.query(sql, [productName]);",
            "query = 'SELECT * FROM users WHERE email=?'\ncursor.execute(query, (email,))",
            "String sql = \"SELECT * FROM users WHERE id = ?\";\nPreparedStatement stmt = conn.prepareStatement(sql);\nstmt.setString(1, userId);",
            "$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');\n$stmt->execute([$userId]);"
        ],
        "languages": ["javascript", "python", "java", "php"]
    },
    "XSS": {
        "vulnerable": [
            "document.getElementById('output').innerHTML = userInput;",
            "element.innerHTML = comment;",
            "response.write(userData);",
            "out.println(userInput);",
            "echo $userComment;"
        ],
        "secure": [
            "document.getElementById('output').textContent = userInput;",
            "element.textContent = comment;",
            "response.write(escapeHtml(userData));",
            "out.println(escapeHtml(userInput));",
            "echo htmlspecialchars($userComment, ENT_QUOTES, 'UTF-8');"
        ],
        "languages": ["javascript", "python", "java", "php"]
    },
    "HARDCODED_PASSWORD": {
        "vulnerable": [
            "if (password === 'admin123') { login(); }",
            "if password == 'secret': login()",
            "if (password.equals(\"password123\")) { authenticate(); }",
            "if ($password === 'admin') { login(); }"
        ],
        "secure": [
            "if (bcrypt.compareSync(password, storedHash)) { login(); }",
            "if bcrypt.checkpw(password.encode(), stored_hash): login()",
            "if (BCrypt.checkpw(password, storedHash)) { authenticate(); }",
            "if (password_verify($password, $storedHash)) { login(); }"
        ],
        "languages": ["javascript", "python", "java", "php"]
    },
    "COMMAND_INJECTION": {
        "vulnerable": [
            "exec('ls ' + userInput);",
            "os.system('ping ' + hostname)",
            "Runtime.getRuntime().exec('ping ' + hostname);",
            "exec('ping ' . $hostname);"
        ],
        "secure": [
            "exec(['ls', userInput]);",
            "subprocess.run(['ping', hostname], check=True)",
            "Runtime.getRuntime().exec(new String[]{\"ping\", hostname});",
            "exec(['ping', $hostname]);"
        ],
        "languages": ["javascript", "python", "java", "php"]
    },
    "PATH_TRAVERSAL": {
        "vulnerable": [
            "fs.readFileSync('/data/' + filename);",
            "open('/uploads/' + filename)",
            "new FileInputStream('/data/' + filename);",
            "file_get_contents('/uploads/' . $filename);"
        ],
        "secure": [
            "const path = require('path');\nfs.readFileSync(path.join('/data', path.basename(filename)));",
            "import os\nopen(os.path.join('/uploads', os.path.basename(filename)))",
            "new FileInputStream(new File('/data', new File(filename).getName()));",
            "file_get_contents('/uploads/' . basename($filename));"
        ],
        "languages": ["javascript", "python", "java", "php"]
    }
}

def create_training_example(vulnerable_code: str, secure_code: str, vuln_type: str, language: str) -> Dict:
    """Create a training example in OpenAI fine-tuning format"""
    
    explanation = get_explanation(vuln_type, language)
    
    return {
        "messages": [
            {
                "role": "system",
                "content": "You are CipherMate, an expert security analysis AI specialized in finding and fixing vulnerabilities in code. Be precise, technical, and security-focused. Always provide secure fixes that follow best practices."
            },
            {
                "role": "user",
                "content": f"Analyze this {language} code for security vulnerabilities:\n\n```{language}\n{vulnerable_code}\n```"
            },
            {
                "role": "assistant",
                "content": f"Found {vuln_type} vulnerability.\n\n{explanation}\n\n**Vulnerable Code:**\n```{language}\n{vulnerable_code}\n```\n\n**Secure Fix:**\n```{language}\n{secure_code}\n```"
            }
        ]
    }

def get_explanation(vuln_type: str, language: str) -> str:
    """Get explanation for vulnerability type"""
    explanations = {
        "SQL_INJECTION": "SQL Injection vulnerability: User input is directly concatenated into SQL query without sanitization. Attackers can manipulate the query to extract or modify data. Use parameterized queries/prepared statements to separate code from data.",
        "XSS": "Cross-Site Scripting (XSS) vulnerability: User input is rendered as HTML without sanitization. Attackers can inject malicious scripts. Use textContent instead of innerHTML, or sanitize with libraries like DOMPurify.",
        "HARDCODED_PASSWORD": "Hardcoded password vulnerability: Passwords are stored in plaintext or compared directly. This is a critical security risk. Always hash passwords using bcrypt, argon2, or similar secure hashing algorithms.",
        "COMMAND_INJECTION": "Command injection vulnerability: User input is directly passed to system commands. Attackers can execute arbitrary commands. Use parameterized command execution with arrays/lists instead of string concatenation.",
        "PATH_TRAVERSAL": "Path traversal vulnerability: User input is used in file paths without validation. Attackers can access files outside intended directory. Use path.basename() or similar to sanitize filenames, and validate against allowlists."
    }
    return explanations.get(vuln_type, "Security vulnerability detected.")

def generate_training_examples(count: int = 1000) -> List[Dict]:
    """Generate training examples"""
    examples = []
    
    for _ in range(count):
        vuln_type = random.choice(list(VULNERABILITY_PATTERNS.keys()))
        pattern = VULNERABILITY_PATTERNS[vuln_type]
        language = random.choice(pattern["languages"])
        
        vulnerable = random.choice(pattern["vulnerable"])
        secure = random.choice(pattern["secure"])
        
        example = create_training_example(vulnerable, secure, vuln_type, language)
        examples.append(example)
    
    return examples

def save_training_data(examples: List[Dict], filename: str = "training_data.jsonl"):
    """Save training examples to JSONL file"""
    with open(filename, 'w') as f:
        for example in examples:
            f.write(json.dumps(example) + '\n')
    print(f"✅ Created {len(examples)} training examples in {filename}")

def main():
    print("🚀 Generating CipherMate Training Data\n")
    
    # Generate different sizes
    sizes = {
        "small": 100,
        "medium": 1000,
        "large": 10000
    }
    
    for size_name, count in sizes.items():
        print(f"Generating {size_name} dataset ({count} examples)...")
        examples = generate_training_examples(count)
        filename = f"training_data_{size_name}.jsonl"
        save_training_data(examples, filename)
        print()

    print("✨ Training data generation complete!")
    print("\nNext steps:")
    print("1. Review the generated files")
    print("2. Upload to OpenAI: openai api fine_tunes.create -t training_data_medium.jsonl -m gpt-3.5-turbo")
    print("3. Or use with Hugging Face training scripts")

if __name__ == "__main__":
    main()


