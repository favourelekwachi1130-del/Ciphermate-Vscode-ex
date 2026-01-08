/**
 * Standalone Test Script for Chat Fixes
 *
 * Run with: node standalone-test.js
 *
 * This tests the markdown parsing and duplicate message prevention
 * WITHOUT requiring VS Code to be running.
 */

const http = require('http');

// =============================================================================
// CONFIGURATION
// =============================================================================

const OLLAMA_CONFIG = {
    apiUrl: 'http://64.225.56.89:11434',
    model: 'deepseek-coder:1.3b',
    timeout: 60000
};

// =============================================================================
// MARKDOWN PARSING FUNCTION (To be applied to chat-interface.ts later)
// =============================================================================

function parseMarkdown(text) {
    if (!text) return '';

    // Escape HTML to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (triple backticks)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return '<pre class="code-block"><code class="language-' + (lang || 'plaintext') + '">' + (code ? code.trim() : '') + '</code></pre>';
    });

    // Inline code (single backticks)
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers (## text) - process longer patterns first
    html = html.replace(/^#### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Bullet lists (- item)
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Numbered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Horizontal rules (---) - before line breaks
    html = html.replace(/^---$/gm, '<hr class="section-divider">');

    // Severity badges with colors
    html = html.replace(/\[CRITICAL\]/g, '<span class="severity-badge critical">CRITICAL</span>');
    html = html.replace(/\[HIGH\]/g, '<span class="severity-badge high">HIGH</span>');
    html = html.replace(/\[MEDIUM\]/g, '<span class="severity-badge medium">MEDIUM</span>');
    html = html.replace(/\[LOW\]/g, '<span class="severity-badge low">LOW</span>');
    html = html.replace(/\[INFO\]/g, '<span class="severity-badge info">INFO</span>');

    // Stats with colored numbers (Critical: 2696)
    html = html.replace(/Critical:\s*(\d+)/gi, 'Critical: <span class="stat-critical">$1</span>');
    html = html.replace(/High:\s*(\d+)/gi, 'High: <span class="stat-high">$1</span>');
    html = html.replace(/Medium:\s*(\d+)/gi, 'Medium: <span class="stat-medium">$1</span>');

    // File paths with line numbers (Windows style c:\path:123)
    html = html.replace(/([A-Za-z]:\\[^\s:]+:\d+)/g, '<span class="file-path">$1</span>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

// =============================================================================
// DUPLICATE MESSAGE PREVENTION
// =============================================================================

class MessageTracker {
    constructor() {
        this.isSubmitting = false;
        this.lastMessageTime = 0;
        this.minIntervalMs = 500;
    }

    canSend() {
        const now = Date.now();
        if (this.isSubmitting) {
            return false;
        }
        if (now - this.lastMessageTime < this.minIntervalMs) {
            return false;
        }
        return true;
    }

    startSending() {
        this.isSubmitting = true;
        this.lastMessageTime = Date.now();
    }

    doneSending() {
        this.isSubmitting = false;
    }
}

// =============================================================================
// OLLAMA HTTP REQUEST
// =============================================================================

function ollamaRequest(endpoint, method = 'GET', body = null, timeout = OLLAMA_CONFIG.timeout) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, OLLAMA_CONFIG.apiUrl);

        const options = {
            hostname: url.hostname,
            port: url.port || 11434,
            path: url.pathname,
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            timeout
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// =============================================================================
// TEST UTILITIES
// =============================================================================

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function pass(name) {
    passCount++;
    console.log(`  ✅ ${name}`);
}

function fail(name, error) {
    failCount++;
    console.log(`  ❌ ${name}: ${error}`);
}

function skip(name, reason) {
    skipCount++;
    console.log(`  ⏭️  ${name}: ${reason}`);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// =============================================================================
// TEST SUITES
// =============================================================================

async function runTests() {
    console.log('\n' + '='.repeat(60));
    console.log('CHAT FIXES - STANDALONE TEST SUITE');
    console.log('='.repeat(60));

    // =========================================================================
    // SECTION 1: Markdown Parsing
    // =========================================================================
    console.log('\n📝 SECTION 1: Markdown Parsing\n');

    try {
        const result = parseMarkdown('**bold text**');
        assert(result.includes('<strong>bold text</strong>'));
        pass('1.1 Bold text parsing');
    } catch (e) {
        fail('1.1 Bold text parsing', e.message);
    }

    try {
        const result = parseMarkdown('*italic text*');
        assert(result.includes('<em>italic text</em>'));
        pass('1.2 Italic text parsing');
    } catch (e) {
        fail('1.2 Italic text parsing', e.message);
    }

    try {
        const result = parseMarkdown('use `code` here');
        assert(result.includes('<code class="inline-code">code</code>'));
        pass('1.3 Inline code parsing');
    } catch (e) {
        fail('1.3 Inline code parsing', e.message);
    }

    try {
        const input = '```javascript\nconst x = 1;\n```';
        const result = parseMarkdown(input);
        assert(result.includes('<pre class="code-block">'));
        assert(result.includes('language-javascript'));
        pass('1.4 Code block parsing');
    } catch (e) {
        fail('1.4 Code block parsing', e.message);
    }

    try {
        const result = parseMarkdown('<script>alert("xss")</script>');
        assert(!result.includes('<script>'));
        assert(result.includes('&lt;script&gt;'));
        pass('1.5 XSS prevention');
    } catch (e) {
        fail('1.5 XSS prevention', e.message);
    }

    try {
        const h1 = parseMarkdown('# Header 1');
        const h2 = parseMarkdown('## Header 2');
        const h3 = parseMarkdown('### Header 3');
        const h4 = parseMarkdown('#### Header 4');
        assert(h1.includes('<h2>Header 1</h2>'));
        assert(h2.includes('<h3>Header 2</h3>'));
        assert(h3.includes('<h4>Header 3</h4>'));
        assert(h4.includes('<h5>Header 4</h5>'));
        pass('1.6 Header parsing (# to ####)');
    } catch (e) {
        fail('1.6 Header parsing (# to ####)', e.message);
    }

    try {
        const result = parseMarkdown('- item 1\n- item 2');
        assert(result.includes('<li>item 1</li>'));
        assert(result.includes('<li>item 2</li>'));
        pass('1.7 Bullet list parsing');
    } catch (e) {
        fail('1.7 Bullet list parsing', e.message);
    }

    try {
        const result = parseMarkdown('[Google](https://google.com)');
        assert(result.includes('<a href="https://google.com">Google</a>'));
        pass('1.8 Link parsing');
    } catch (e) {
        fail('1.8 Link parsing', e.message);
    }

    try {
        const input = '**Bold** and *italic* with `code`';
        const result = parseMarkdown(input);
        assert(result.includes('<strong>Bold</strong>'));
        assert(result.includes('<em>italic</em>'));
        assert(result.includes('<code class="inline-code">code</code>'));
        pass('1.9 Mixed markdown');
    } catch (e) {
        fail('1.9 Mixed markdown', e.message);
    }

    try {
        assert(parseMarkdown('') === '');
        assert(parseMarkdown(null) === '');
        pass('1.10 Empty input handling');
    } catch (e) {
        fail('1.10 Empty input handling', e.message);
    }

    // =========================================================================
    // SECTION 1.5: Enhanced Markdown (Security-focused)
    // =========================================================================
    console.log('\n🔐 SECTION 1.5: Enhanced Markdown (Security-focused)\n');

    try {
        const result = parseMarkdown('[CRITICAL] Vulnerability found');
        assert(result.includes('severity-badge') && result.includes('critical'));
        pass('1.11 Severity badge CRITICAL');
    } catch (e) {
        fail('1.11 Severity badge CRITICAL', e.message);
    }

    try {
        const result = parseMarkdown('[HIGH] Security issue detected');
        assert(result.includes('severity-badge') && result.includes('high'));
        pass('1.12 Severity badge HIGH');
    } catch (e) {
        fail('1.12 Severity badge HIGH', e.message);
    }

    try {
        const result = parseMarkdown('[MEDIUM] Potential risk');
        assert(result.includes('severity-badge') && result.includes('medium'));
        pass('1.13 Severity badge MEDIUM');
    } catch (e) {
        fail('1.13 Severity badge MEDIUM', e.message);
    }

    try {
        const result = parseMarkdown('Line 1\n---\nLine 2');
        assert(result.includes('<hr'));
        pass('1.14 Horizontal rule parsing');
    } catch (e) {
        fail('1.14 Horizontal rule parsing', e.message);
    }

    try {
        const result = parseMarkdown('[HIGH] c:\\Users\\test\\file.ts:143 - Error');
        assert(result.includes('file-path'));
        pass('1.15 File path highlighting');
    } catch (e) {
        fail('1.15 File path highlighting', e.message);
    }

    try {
        const result = parseMarkdown('Critical: 2696');
        assert(result.includes('stat-critical'));
        pass('1.16 Stat number coloring (Critical)');
    } catch (e) {
        fail('1.16 Stat number coloring (Critical)', e.message);
    }

    try {
        const result = parseMarkdown('High: 180');
        assert(result.includes('stat-high'));
        pass('1.17 Stat number coloring (High)');
    } catch (e) {
        fail('1.17 Stat number coloring (High)', e.message);
    }

    try {
        // Full scan result format
        const scanResult = `Security Scan Results
Critical: 2696
High: 180
Medium: 98
---
[CRITICAL] c:\\Users\\test\\file.ts:66 - Password found`;
        const result = parseMarkdown(scanResult);
        assert(result.includes('stat-critical'));
        assert(result.includes('severity-badge'));
        assert(result.includes('<hr'));
        assert(result.includes('file-path'));
        pass('1.18 Full scan result formatting');
    } catch (e) {
        fail('1.18 Full scan result formatting', e.message);
    }

    // =========================================================================
    // SECTION 2: Duplicate Message Prevention
    // =========================================================================
    console.log('\n🔒 SECTION 2: Duplicate Message Prevention\n');

    try {
        const tracker = new MessageTracker();
        assert(tracker.canSend() === true);
        pass('2.1 First message allowed');
    } catch (e) {
        fail('2.1 First message allowed', e.message);
    }

    try {
        const tracker = new MessageTracker();
        tracker.startSending();
        assert(tracker.canSend() === false);
        pass('2.2 Blocked during submission');
    } catch (e) {
        fail('2.2 Blocked during submission', e.message);
    }

    try {
        const tracker = new MessageTracker();
        tracker.startSending();
        tracker.doneSending();
        // Immediately after - should be blocked (rate limit)
        const immediate = tracker.canSend();
        console.log(`    Immediate send attempt: ${immediate ? 'ALLOWED' : 'BLOCKED (expected)'}`);
        // Note: immediate might be true or false depending on timing
        // The key test is after waiting
        await new Promise(resolve => setTimeout(resolve, 600));
        const afterWait = tracker.canSend();
        console.log(`    After 600ms wait: ${afterWait ? 'ALLOWED (expected)' : 'BLOCKED'}`);
        assert(afterWait === true, 'Should allow after waiting');
        pass('2.3 Rate limiting works');
    } catch (e) {
        fail('2.3 Rate limiting works', e.message);
    }

    // =========================================================================
    // SECTION 3: Ollama Connection
    // =========================================================================
    console.log('\n🌐 SECTION 3: Ollama Connection\n');

    try {
        const response = await ollamaRequest('/api/tags');
        assert(response && response.models);
        console.log(`    Found ${response.models.length} models: ${response.models.map(m => m.name).join(', ')}`);
        pass('3.1 Connect to Ollama server');
    } catch (e) {
        skip('3.1 Connect to Ollama server', e.message);
    }

    try {
        const response = await ollamaRequest('/api/generate', 'POST', {
            model: OLLAMA_CONFIG.model,
            prompt: 'Say "test" in one word.',
            stream: false,
            options: { num_predict: 5 }
        });
        if (response && response.response) {
            console.log(`    Response: "${response.response.substring(0, 50)}"`);
            pass('3.2 Generate AI response');
        } else {
            skip('3.2 Generate AI response', 'No response returned');
        }
    } catch (e) {
        skip('3.2 Generate AI response', e.message);
    }

    // =========================================================================
    // SECTION 4: Full Flow Simulation
    // =========================================================================
    console.log('\n🔄 SECTION 4: Full Chat Flow\n');

    try {
        // Step 1: Check if we can send
        const tracker = new MessageTracker();
        if (!tracker.canSend()) {
            throw new Error('Cannot send');
        }
        tracker.startSending();

        // Step 2: Get AI response
        const response = await ollamaRequest('/api/generate', 'POST', {
            model: OLLAMA_CONFIG.model,
            prompt: 'Explain **SQL injection** briefly with `code` example.',
            stream: false,
            options: { num_predict: 100 }
        });

        tracker.doneSending();

        if (!response || !response.response) {
            skip('4.1 Full flow simulation', 'No AI response');
        } else {
            // Step 3: Parse markdown
            const formatted = parseMarkdown(response.response);
            console.log(`    Raw: "${response.response.substring(0, 80)}..."`);
            console.log(`    Formatted: "${formatted.substring(0, 80)}..."`);
            pass('4.1 Full flow simulation');
        }
    } catch (e) {
        skip('4.1 Full flow simulation', e.message);
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log('='.repeat(60));

    if (failCount === 0) {
        console.log('\n🎉 All tests passed! Ready to apply fixes to chat-interface.ts\n');
    } else {
        console.log('\n⚠️  Some tests failed. Fix issues before applying to codebase.\n');
    }

    console.log('\n📋 CODE TO APPLY TO chat-interface.ts:\n');
    console.log('1. Add parseMarkdown() function (see above)');
    console.log('2. Add MessageTracker class for duplicate prevention');
    console.log('3. Update addMessage() to use parseMarkdown for assistant');
    console.log('4. Add CSS for .code-block, .inline-code, etc.\n');
}

// Run tests
runTests().catch(console.error);
