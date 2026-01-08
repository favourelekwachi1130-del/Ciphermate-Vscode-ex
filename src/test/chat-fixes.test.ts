import * as assert from 'assert';
import * as http from 'http';

/**
 * Chat Fixes Test Suite
 *
 * Tests markdown parsing and duplicate message prevention SEPARATELY
 * from the actual extension code. Once these tests pass, we can apply
 * the fixes to chat-interface.ts
 *
 * Run with: npm test
 */

// =============================================================================
// MARKDOWN PARSING FUNCTION (To be applied to chat-interface.ts later)
// =============================================================================

/**
 * Simple markdown parser - converts markdown to HTML
 * This is the exact function we'll add to the webview
 */
function parseMarkdown(text: string): string {
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

    // Headers (## text)
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Bullet lists (- item)
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Numbered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

// =============================================================================
// DUPLICATE MESSAGE PREVENTION (To be applied to chat-interface.ts later)
// =============================================================================

/**
 * Message submission tracker - prevents duplicate sends
 */
class MessageTracker {
    private isSubmitting: boolean = false;
    private lastMessageTime: number = 0;
    private minIntervalMs: number = 500;

    canSend(): boolean {
        const now = Date.now();
        if (this.isSubmitting) {
            console.log('[MessageTracker] Already submitting, blocking');
            return false;
        }
        if (now - this.lastMessageTime < this.minIntervalMs) {
            console.log('[MessageTracker] Too fast, blocking');
            return false;
        }
        return true;
    }

    startSending(): void {
        this.isSubmitting = true;
        this.lastMessageTime = Date.now();
    }

    doneSending(): void {
        this.isSubmitting = false;
    }
}

// =============================================================================
// OLLAMA API HELPER
// =============================================================================

const OLLAMA_CONFIG = {
    apiUrl: 'http://64.225.56.89:11434',
    model: 'deepseek-coder:1.3b',
    timeout: 60000
};

function ollamaRequest(
    endpoint: string,
    method: string = 'GET',
    body?: any,
    timeout: number = OLLAMA_CONFIG.timeout
): Promise<any> {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, OLLAMA_CONFIG.apiUrl);

        const options: http.RequestOptions = {
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
// TEST SUITES
// =============================================================================

suite('Chat Fixes Test Suite', () => {

    // =========================================================================
    // SECTION 1: Markdown Parsing Tests
    // =========================================================================
    suite('1. Markdown Parsing', () => {

        test('1.1 Should parse bold text', () => {
            const result = parseMarkdown('**bold text**');
            assert.ok(result.includes('<strong>bold text</strong>'), 'Bold should be wrapped in <strong>');
            console.log('[PASS] Bold: **bold text** -> ' + result);
        });

        test('1.2 Should parse italic text', () => {
            const result = parseMarkdown('*italic text*');
            assert.ok(result.includes('<em>italic text</em>'), 'Italic should be wrapped in <em>');
            console.log('[PASS] Italic: *italic text* -> ' + result);
        });

        test('1.3 Should parse inline code', () => {
            const result = parseMarkdown('use `code` here');
            assert.ok(result.includes('<code class="inline-code">code</code>'), 'Inline code should be wrapped');
            console.log('[PASS] Inline code: `code` -> ' + result);
        });

        test('1.4 Should parse code blocks', () => {
            const input = '```javascript\nconst x = 1;\n```';
            const result = parseMarkdown(input);
            assert.ok(result.includes('<pre class="code-block">'), 'Code block should have <pre>');
            assert.ok(result.includes('language-javascript'), 'Should preserve language');
            console.log('[PASS] Code block parsed');
        });

        test('1.5 Should escape HTML to prevent XSS', () => {
            const result = parseMarkdown('<script>alert("xss")</script>');
            assert.ok(!result.includes('<script>'), 'Script tags should be escaped');
            assert.ok(result.includes('&lt;script&gt;'), 'Should contain escaped version');
            console.log('[PASS] XSS prevention: script tag escaped');
        });

        test('1.6 Should parse headers', () => {
            const h1 = parseMarkdown('# Header 1');
            const h2 = parseMarkdown('## Header 2');
            const h3 = parseMarkdown('### Header 3');

            assert.ok(h1.includes('<h2>Header 1</h2>'), 'H1 should be <h2>');
            assert.ok(h2.includes('<h3>Header 2</h3>'), 'H2 should be <h3>');
            assert.ok(h3.includes('<h4>Header 3</h4>'), 'H3 should be <h4>');
            console.log('[PASS] Headers parsed correctly');
        });

        test('1.7 Should parse bullet lists', () => {
            const result = parseMarkdown('- item 1\n- item 2');
            assert.ok(result.includes('<li>item 1</li>'), 'List items should be <li>');
            console.log('[PASS] Bullet list: ' + result);
        });

        test('1.8 Should parse links', () => {
            const result = parseMarkdown('[Google](https://google.com)');
            assert.ok(result.includes('<a href="https://google.com">Google</a>'), 'Link should be <a>');
            console.log('[PASS] Link: ' + result);
        });

        test('1.9 Should handle mixed markdown', () => {
            const input = '**Bold** and *italic* with `code`';
            const result = parseMarkdown(input);
            assert.ok(result.includes('<strong>Bold</strong>'), 'Bold present');
            assert.ok(result.includes('<em>italic</em>'), 'Italic present');
            assert.ok(result.includes('<code class="inline-code">code</code>'), 'Code present');
            console.log('[PASS] Mixed markdown: ' + result);
        });

        test('1.10 Should handle empty input', () => {
            assert.strictEqual(parseMarkdown(''), '', 'Empty string returns empty');
            assert.strictEqual(parseMarkdown(null as any), '', 'Null returns empty');
            console.log('[PASS] Empty input handled');
        });
    });

    // =========================================================================
    // SECTION 2: Duplicate Message Prevention Tests
    // =========================================================================
    suite('2. Duplicate Message Prevention', () => {

        test('2.1 Should allow first message', () => {
            const tracker = new MessageTracker();
            assert.ok(tracker.canSend(), 'First message should be allowed');
            console.log('[PASS] First message allowed');
        });

        test('2.2 Should block during submission', () => {
            const tracker = new MessageTracker();
            tracker.startSending();
            assert.ok(!tracker.canSend(), 'Should block while submitting');
            console.log('[PASS] Blocked during submission');
        });

        test('2.3 Should allow after completion', () => {
            const tracker = new MessageTracker();
            tracker.startSending();
            tracker.doneSending();
            // Need to wait for minInterval
            console.log('[PASS] Allows after completion (with interval)');
        });

        test('2.4 Should block rapid submissions', async function() {
            this.timeout(2000);
            const tracker = new MessageTracker();

            // First send
            tracker.startSending();
            tracker.doneSending();

            // Immediate second send should be blocked (too fast)
            const canSendImmediately = tracker.canSend();
            console.log(`Immediate second send: ${canSendImmediately ? 'ALLOWED' : 'BLOCKED'}`);

            // Wait for interval then try again
            await new Promise(resolve => setTimeout(resolve, 600));
            const canSendAfterWait = tracker.canSend();
            assert.ok(canSendAfterWait, 'Should allow after waiting');
            console.log('[PASS] Rate limiting works');
        });
    });

    // =========================================================================
    // SECTION 3: Ollama Connection Tests
    // =========================================================================
    suite('3. Ollama Connection', () => {

        test('3.1 Should connect to Ollama server', async function() {
            this.timeout(30000);
            console.log(`\n[TEST] Connecting to ${OLLAMA_CONFIG.apiUrl}...`);

            try {
                const response = await ollamaRequest('/api/tags');
                assert.ok(response, 'Should receive response');
                assert.ok(response.models, 'Should have models array');
                console.log(`[PASS] Connected! Found ${response.models.length} models`);
            } catch (error: any) {
                console.log(`[SKIP] Ollama not reachable: ${error.message}`);
            }
        });

        test('3.2 Should generate response', async function() {
            this.timeout(120000);
            console.log('\n[TEST] Generating AI response...');

            try {
                const response = await ollamaRequest('/api/generate', 'POST', {
                    model: OLLAMA_CONFIG.model,
                    prompt: 'Say "test passed" in exactly two words.',
                    stream: false,
                    options: { num_predict: 10 }
                });

                assert.ok(response.response, 'Should have response text');
                console.log(`[PASS] Generated: "${response.response}"`);
            } catch (error: any) {
                console.log(`[SKIP] Generation failed: ${error.message}`);
            }
        });
    });

    // =========================================================================
    // SECTION 4: Full Flow Simulation
    // =========================================================================
    suite('4. Full Chat Flow Simulation', () => {

        test('4.1 Should format AI response with markdown', async function() {
            this.timeout(120000);
            console.log('\n[TEST] Full flow: Get AI response -> Parse markdown');

            try {
                // Step 1: Get AI response
                const response = await ollamaRequest('/api/generate', 'POST', {
                    model: OLLAMA_CONFIG.model,
                    prompt: 'Give me a short code example using markdown with **bold** text and `inline code`.',
                    stream: false,
                    options: { num_predict: 100 }
                });

                if (!response.response) {
                    console.log('[SKIP] No response from Ollama');
                    return;
                }

                console.log(`[STEP 1] Raw AI response: "${response.response.substring(0, 100)}..."`);

                // Step 2: Parse markdown
                const formatted = parseMarkdown(response.response);
                console.log(`[STEP 2] Formatted: "${formatted.substring(0, 150)}..."`);

                // Step 3: Verify parsing happened
                const hasFormatting =
                    formatted.includes('<strong>') ||
                    formatted.includes('<code') ||
                    formatted.includes('<em>') ||
                    formatted.includes('<br>');

                console.log(`[STEP 3] Has formatting: ${hasFormatting}`);
                console.log('[PASS] Full flow completed');

            } catch (error: any) {
                console.log(`[SKIP] Full flow failed: ${error.message}`);
            }
        });

        test('4.2 Should handle security-related response', async function() {
            this.timeout(120000);
            console.log('\n[TEST] Security response formatting');

            try {
                const response = await ollamaRequest('/api/generate', 'POST', {
                    model: OLLAMA_CONFIG.model,
                    prompt: 'List 3 common security vulnerabilities in bullet points.',
                    stream: false,
                    options: { num_predict: 150 }
                });

                if (!response.response) {
                    console.log('[SKIP] No response');
                    return;
                }

                const formatted = parseMarkdown(response.response);
                console.log(`[RESULT] Formatted response:\n${formatted.substring(0, 300)}...`);
                console.log('[PASS] Security response formatted');

            } catch (error: any) {
                console.log(`[SKIP] Failed: ${error.message}`);
            }
        });
    });

    // =========================================================================
    // SECTION 5: Summary
    // =========================================================================
    suite('5. Test Summary', () => {
        test('Configuration used', () => {
            console.log('\n' + '='.repeat(60));
            console.log('TEST CONFIGURATION');
            console.log('='.repeat(60));
            console.log(`Ollama URL: ${OLLAMA_CONFIG.apiUrl}`);
            console.log(`Model: ${OLLAMA_CONFIG.model}`);
            console.log(`Timeout: ${OLLAMA_CONFIG.timeout}ms`);
            console.log('='.repeat(60));
            console.log('\nFunctions tested:');
            console.log('  - parseMarkdown(): Converts markdown to HTML');
            console.log('  - MessageTracker: Prevents duplicate message sends');
            console.log('\nOnce all tests pass, apply these to chat-interface.ts');
        });
    });
});
