# Change Log

All notable changes to the "ciphermate" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.0] - 2025-12-27

### Added
- **Unified Repository Scanner Architecture**: Comprehensive security scanning system
- **Dependency Vulnerability Scanner**: Scans npm, Python, Rust, Go, Java, Ruby, PHP dependencies for CVEs
- **Hardcoded Secrets Detection**: Detects 12+ secret types (AWS keys, GitHub tokens, API keys, passwords, etc.)
- **Smart Contract Security Scanner**: Scans Solidity files for 6 vulnerability types (Reentrancy, Access Control, etc.)
- **Code Pattern Scanner**: OWASP Top 10 detection (SQL Injection, XSS, Command Injection, Path Traversal, etc.)
- **CyberAgent Integration**: Conversational AI with mode support (base, smartcontract, webpentest, osint, etc.)
- **Enhanced Frontend Design**: Mature, professional UI with improved spacing, typography, and interactions
- **Context-Aware Mode Switching**: Automatically switches AI modes based on request type
- **5 Quick Action Buttons**: One-click access to common scanning tasks
- **Comprehensive Documentation**: User interaction guides, quick reference, and flow diagrams

### Enhanced
- **Chat Interface**: Improved welcome screen, better message display, enhanced quick actions
- **Results Aggregation**: Unified results from all scanners with severity-based prioritization
- **AI Integration**: Better integration between AgenticCore and CyberAgent
- **Error Handling**: Graceful scanner failures, continues with other scanners

### Technical
- **New Scanner Architecture**: Modular, extensible scanner system
- **Type Safety**: Comprehensive TypeScript types for all scanners
- **Performance**: Parallel scanner execution, optimized file discovery
- **Integration**: Seamless integration with existing Results Panel and inline diagnostics

## [1.0.0] - 2024-09-09

### Added
- **Intelligent Security Scanning**: Multi-tool integration with Semgrep, Bandit, and AI analysis
- **AI-Powered Analysis**: LM Studio integration for advanced pattern detection and personalized learning
- **Team Collaboration**: Team dashboard, automated reporting, and progress tracking
- **Encrypted Storage**: AES-256-CBC encryption for all sensitive data
- **Modern UI**: Interactive results panel with VSCode-themed interface
- **Export Functionality**: JSON, CSV, and HTML report export capabilities
- **Real-time Detection**: Configurable scan-on-save with intelligent intervals
- **Cross-language Support**: JavaScript, TypeScript, Python, PHP, Java, C/C++, Go, Rust, Ruby, Shell
- **Comprehensive Error Handling**: Robust error handling with detailed user feedback
- **Unit Testing Framework**: Complete test suite for core functionality
- **Background Processing**: Non-blocking scans with progress indicators and task management
- **Intelligent Caching**: 24-hour cache system with file hash validation for faster repeated scans
- **Incremental Scanning**: Smart file change detection to scan only modified files
- **Progress Tracking**: Real-time progress indicators for long-running operations
- **Cache Management**: Commands to view cache status, clear cache, and monitor background tasks

### Features
- **Security Scanning**: 
  - Semgrep static analysis integration
  - Bandit Python security scanning
  - AI-powered pattern analysis
  - Real-time vulnerability detection
- **AI Integration**:
  - LM Studio local AI model support
  - Personalized learning progress tracking
  - Intelligent code fix suggestions
  - Conversation memory system
- **Team Features**:
  - Team lead dashboard
  - Automated vulnerability reporting
  - Member progress tracking
  - Security policy management
- **Privacy & Security**:
  - Local AI processing (no external API calls)
  - Encrypted data storage
  - Secure memory system
- **User Experience**:
  - Modern webview interfaces
  - Contextual notifications
  - Export capabilities
  - Settings management

### Technical
- TypeScript implementation
- Webpack bundling
- ESLint code quality
- Comprehensive error handling
- VS Code extension API integration
- Encrypted global state management

## [0.0.1] - 2024-09-09

### Added
- Initial development version
- Basic eval() detection
- Simple notification system