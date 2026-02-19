/**
 * Project Generation Service
 * 
 * Generates complete projects, files, and code structures.
 * Works without repository open - creates files as needed.
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

import * as path from 'path';
import * as os from 'os';
import { getFileOperationsService, FileOperationsService } from './file-operations-service';
import { getCodeGenerationService, CodeGenerationService } from './code-generation-service';
import { getHashingService, HashingService } from './hashing-service';

export interface ProjectStructure {
  name: string;
  type: 'web' | 'api' | 'library' | 'cli' | 'fullstack';
  language: 'javascript' | 'typescript' | 'python' | 'java' | 'go' | 'rust';
  files: ProjectFile[];
}

export interface ProjectFile {
  path: string;
  content: string;
  type: 'code' | 'config' | 'documentation' | 'test';
  language?: string;
}

export interface ProjectGenerationResult {
  success: boolean;
  projectPath: string;
  filesCreated: string[];
  errors?: string[];
}

export class ProjectGenerationService {
  private fileService: FileOperationsService;
  private codeGenService: CodeGenerationService;
  private hashingService: HashingService;

  constructor() {
    this.fileService = getFileOperationsService();
    this.codeGenService = getCodeGenerationService();
    this.hashingService = getHashingService();
  }

  /**
   * Generate a complete project structure
   */
  async generateProject(
    structure: ProjectStructure,
    basePath?: string
  ): Promise<ProjectGenerationResult> {
    const projectPath = basePath || path.join(os.tmpdir(), structure.name);
    const filesCreated: string[] = [];
    const errors: string[] = [];

    try {
      // Create project directory
      await this.fileService.ensureDirectoryExists(projectPath);

      // Generate all files
      for (const file of structure.files) {
        try {
          const fullPath = path.join(projectPath, file.path);
          const dir = path.dirname(fullPath);
          
          // Ensure directory exists
          await this.fileService.ensureDirectoryExists(dir);
          
          // Write file
          const result = await this.fileService.writeFile(fullPath, file.content);
          if (result.success) {
            filesCreated.push(fullPath);
          } else {
            errors.push(`Failed to create ${file.path}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Error creating ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return {
        success: errors.length === 0,
        projectPath,
        filesCreated,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        projectPath,
        filesCreated,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Generate secure project template
   */
  generateSecureProjectTemplate(
    name: string,
    type: ProjectStructure['type'],
    language: ProjectStructure['language']
  ): ProjectStructure {
    const files: ProjectFile[] = [];

    // Package.json / requirements.txt / pom.xml based on language
    if (language === 'javascript' || language === 'typescript') {
      files.push({
        path: 'package.json',
        content: this.generatePackageJson(name, language === 'typescript'),
        type: 'config',
      });

      if (language === 'typescript') {
        files.push({
          path: 'tsconfig.json',
          content: this.generateTsConfig(),
          type: 'config',
        });
      }
    } else if (language === 'python') {
      files.push({
        path: 'requirements.txt',
        content: this.generateRequirementsTxt(),
        type: 'config',
      });
    }

    // Main application file
    files.push({
      path: this.getMainFilePath(language),
      content: this.generateMainFile(type, language),
      type: 'code',
      language,
    });

    // Security utilities
    files.push({
      path: this.getSecurityUtilsPath(language),
      content: this.generateSecurityUtils(language),
      type: 'code',
      language,
    });

    // README
    files.push({
      path: 'README.md',
      content: this.generateReadme(name, type, language),
      type: 'documentation',
    });

    // .gitignore
    files.push({
      path: '.gitignore',
      content: this.generateGitignore(language),
      type: 'config',
    });

    // .env.example
    files.push({
      path: '.env.example',
      content: this.generateEnvExample(),
      type: 'config',
    });

    return {
      name,
      type,
      language,
      files,
    };
  }

  /**
   * Hash file contents for integrity
   */
  async hashFile(filePath: string): Promise<string> {
    const content = await this.fileService.readFile(filePath);
    return this.hashingService.sha256(content);
  }

  /**
   * Generate package.json
   */
  private generatePackageJson(name: string, isTypeScript: boolean): string {
    return JSON.stringify({
      name,
      version: '1.0.0',
      description: 'Secure application',
      main: isTypeScript ? 'dist/index.js' : 'index.js',
      scripts: {
        start: isTypeScript ? 'node dist/index.js' : 'node index.js',
        build: isTypeScript ? 'tsc' : 'echo "No build step"',
        test: 'echo "No tests yet"',
      },
      dependencies: {
        'bcrypt': '^5.1.1',
        'express': '^4.18.2',
        'helmet': '^7.1.0',
        'cors': '^2.8.5',
      },
      devDependencies: isTypeScript ? {
        '@types/node': '^20.10.0',
        '@types/express': '^4.17.21',
        'typescript': '^5.3.3',
      } : {},
    }, null, 2);
  }

  /**
   * Generate TypeScript config
   */
  private generateTsConfig(): string {
    return JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    }, null, 2);
  }

  /**
   * Generate requirements.txt
   */
  private generateRequirementsTxt(): string {
    return `bcrypt==4.1.2
flask==3.0.0
python-dotenv==1.0.0
`;
  }

  /**
   * Get main file path based on language
   */
  private getMainFilePath(language: string): string {
    const paths: Record<string, string> = {
      javascript: 'index.js',
      typescript: 'src/index.ts',
      python: 'app.py',
      java: 'src/main/java/App.java',
      go: 'main.go',
      rust: 'src/main.rs',
    };
    return paths[language] || 'index.js';
  }

  /**
   * Get security utils path
   */
  private getSecurityUtilsPath(language: string): string {
    const paths: Record<string, string> = {
      javascript: 'utils/security.js',
      typescript: 'src/utils/security.ts',
      python: 'utils/security.py',
      java: 'src/main/java/utils/Security.java',
      go: 'utils/security.go',
      rust: 'src/utils/security.rs',
    };
    return paths[language] || 'utils/security.js';
  }

  /**
   * Generate main file
   */
  private generateMainFile(type: ProjectStructure['type'], language: string): string {
    if (language === 'javascript' || language === 'typescript') {
      return this.codeGenService.generateSecureSQLCode('javascript');
    } else if (language === 'python') {
      return this.codeGenService.generateSecureSQLCode('python');
    }
    return '// Main application file\n';
  }

  /**
   * Generate security utilities
   */
  private generateSecurityUtils(language: string): string {
    if (language === 'javascript' || language === 'typescript') {
      return this.codeGenService.generatePasswordHashCode('javascript') + '\n' +
             this.codeGenService.generateSecureTokenCode('javascript') + '\n' +
             this.codeGenService.generateInputValidationCode('javascript');
    } else if (language === 'python') {
      return this.codeGenService.generatePasswordHashCode('python') + '\n' +
             this.codeGenService.generateSecureTokenCode('python') + '\n' +
             this.codeGenService.generateInputValidationCode('python');
    }
    return '// Security utilities\n';
  }

  /**
   * Generate README
   */
  private generateReadme(name: string, type: string, language: string): string {
    return `# ${name}

Secure ${type} application written in ${language}.

## Security Features

- Password hashing with bcrypt
- Secure token generation
- Input validation
- SQL injection prevention
- XSS protection

## Setup

\`\`\`bash
npm install  # or pip install -r requirements.txt
\`\`\`

## Run

\`\`\`bash
npm start  # or python app.py
\`\`\`
`;
  }

  /**
   * Generate .gitignore
   */
  private generateGitignore(language: string): string {
    const base = `node_modules/
dist/
build/
.env
*.log
.DS_Store
`;

    if (language === 'python') {
      return base + `__pycache__/
*.pyc
venv/
.venv/
`;
    }

    return base;
  }

  /**
   * Generate .env.example
   */
  private generateEnvExample(): string {
    return `# Environment Variables
# Copy this file to .env and fill in your values

DATABASE_URL=
SECRET_KEY=
API_KEY=
`;
  }
}

// Singleton instance
let projectGenerationServiceInstance: ProjectGenerationService | null = null;

export function getProjectGenerationService(): ProjectGenerationService {
  if (!projectGenerationServiceInstance) {
    projectGenerationServiceInstance = new ProjectGenerationService();
  }
  return projectGenerationServiceInstance;
}
