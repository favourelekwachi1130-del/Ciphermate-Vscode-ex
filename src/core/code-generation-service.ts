/**
 * Code Generation Service
 * 
 * Owns all code generation logic:
 * - Secure code templates
 * - Pattern-based generation
 * - Code transformation
 * - Template substitution
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  language: string;
}

export interface GenerationResult {
  code: string;
  templateId: string;
  variables: Record<string, string>;
}

export class CodeGenerationService {
  private templates: Map<string, CodeTemplate> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Register a code template
   */
  registerTemplate(template: CodeTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Generate code from template
   */
  generateFromTemplate(templateId: string, variables: Record<string, string>): GenerationResult {
    const template = this.templates.get(templateId);
    
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Validate all required variables are provided
    for (const varName of template.variables) {
      if (!(varName in variables)) {
        throw new Error(`Missing required variable: ${varName}`);
      }
    }

    // Substitute variables in template
    let code = template.template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      code = code.replace(new RegExp(placeholder, 'g'), value);
    }

    return {
      code,
      templateId,
      variables,
    };
  }

  /**
   * Generate secure password hash code
   */
  generatePasswordHashCode(language: 'javascript' | 'python' | 'java'): string {
    switch (language) {
      case 'javascript':
        return `const bcrypt = require('bcrypt');
const saltRounds = 10;

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(saltRounds);
  return await bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}`;
      
      case 'python':
        return `import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password: str, hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), hash.encode())`;
      
      case 'java':
        return `import org.mindrot.jbcrypt.BCrypt;

public class PasswordHasher {
    private static final int ROUNDS = 10;
    
    public static String hashPassword(String password) {
        String salt = BCrypt.gensalt(ROUNDS);
        return BCrypt.hashpw(password, salt);
    }
    
    public static boolean verifyPassword(String password, String hash) {
        return BCrypt.checkpw(password, hash);
    }
}`;
      
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Generate secure SQL query code
   */
  generateSecureSQLCode(language: 'javascript' | 'python' | 'java'): string {
    switch (language) {
      case 'javascript':
        return `// Use parameterized queries to prevent SQL injection
async function getUserById(userId) {
  const query = 'SELECT * FROM users WHERE id = ?';
  const result = await db.query(query, [userId]);
  return result[0];
}

async function createUser(username, email) {
  const query = 'INSERT INTO users (username, email) VALUES (?, ?)';
  const result = await db.query(query, [username, email]);
  return result.insertId;
}`;
      
      case 'python':
        return `# Use parameterized queries to prevent SQL injection
import sqlite3

def get_user_by_id(user_id):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    return cursor.fetchone()

def create_user(username, email):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO users (username, email) VALUES (?, ?)', (username, email))
    conn.commit()
    return cursor.lastrowid`;
      
      case 'java':
        return `// Use PreparedStatement to prevent SQL injection
import java.sql.*;

public class UserDAO {
    public User getUserById(int userId) throws SQLException {
        String sql = "SELECT * FROM users WHERE id = ?";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setInt(1, userId);
            ResultSet rs = stmt.executeQuery();
            if (rs.next()) {
                return new User(rs.getInt("id"), rs.getString("username"));
            }
        }
        return null;
    }
}`;
      
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Generate secure random token code
   */
  generateSecureTokenCode(language: 'javascript' | 'python' | 'java'): string {
    switch (language) {
      case 'javascript':
        return `const crypto = require('crypto');

function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}`;
      
      case 'python':
        return `import secrets

def generate_secure_token(length: int = 32) -> str:
    return secrets.token_hex(length)

def generate_session_token() -> str:
    return secrets.token_urlsafe(32)`;
      
      case 'java':
        return `import java.security.SecureRandom;
import java.util.Base64;

public class TokenGenerator {
    private static final SecureRandom random = new SecureRandom();
    
    public static String generateSecureToken(int length) {
        byte[] bytes = new byte[length];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}`;
      
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Generate input validation code
   */
  generateInputValidationCode(language: 'javascript' | 'python' | 'java'): string {
    switch (language) {
      case 'javascript':
        return `function validateEmail(email) {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeInput(input) {
  // Remove potentially dangerous characters
  return input.replace(/[<>\"']/g, '');
}

function validateInput(input, maxLength = 255) {
  if (!input || typeof input !== 'string') {
    return false;
  }
  if (input.length > maxLength) {
    return false;
  }
  return true;
}`;
      
      case 'python':
        return `import re

def validate_email(email: str) -> bool:
    pattern = r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
    return bool(re.match(pattern, email))

def sanitize_input(input_str: str) -> str:
    # Remove potentially dangerous characters
    return re.sub(r'[<>\"\\']', '', input_str)

def validate_input(input_str: str, max_length: int = 255) -> bool:
    if not input_str or not isinstance(input_str, str):
        return False
    if len(input_str) > max_length:
        return False
    return True`;
      
      case 'java':
        return `import java.util.regex.Pattern;

public class InputValidator {
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$", Pattern.CASE_INSENSITIVE);
    
    public static boolean validateEmail(String email) {
        return EMAIL_PATTERN.matcher(email).matches();
    }
    
    public static String sanitizeInput(String input) {
        return input.replaceAll("[<>\"']", "");
    }
    
    public static boolean validateInput(String input, int maxLength) {
        if (input == null || input.isEmpty()) {
            return false;
        }
        return input.length() <= maxLength;
    }
}`;
      
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Get all templates
   */
  getAllTemplates(): CodeTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): CodeTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Initialize default templates
   */
  private initializeDefaultTemplates(): void {
    // Password hash template
    this.registerTemplate({
      id: 'password-hash',
      name: 'Password Hashing',
      description: 'Secure password hashing template',
      language: 'javascript',
      template: `const bcrypt = require('bcrypt');
const saltRounds = {{rounds}};

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(saltRounds);
  return await bcrypt.hash(password, salt);
}`,
      variables: ['rounds'],
    });

    // SQL query template
    this.registerTemplate({
      id: 'secure-sql-query',
      name: 'Secure SQL Query',
      description: 'Parameterized SQL query template',
      language: 'javascript',
      template: `async function {{functionName}}({{params}}) {
  const query = '{{sql}}';
  const result = await db.query(query, [{{values}}]);
  return result;
}`,
      variables: ['functionName', 'sql', 'params', 'values'],
    });
  }
}

// Singleton instance
let codeGenerationServiceInstance: CodeGenerationService | null = null;

export function getCodeGenerationService(): CodeGenerationService {
  if (!codeGenerationServiceInstance) {
    codeGenerationServiceInstance = new CodeGenerationService();
  }
  return codeGenerationServiceInstance;
}
