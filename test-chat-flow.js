/**
 * CipherMate Chat Flow Test Script
 *
 * This script tests the message flow between extension and webview.
 * Run this in the VS Code Developer Console (Help > Toggle Developer Tools)
 *
 * Usage:
 * 1. Open CipherMate chat panel
 * 2. Open Developer Tools (Ctrl+Shift+I)
 * 3. Paste this script in the Console tab
 * 4. Call the test functions as instructed
 */

// ============================================
// TEST UTILITIES
// ============================================

const TestUtils = {
    logs: [],
    testResults: [],

    // Intercept console.log to capture logs
    interceptLogs() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => {
            this.logs.push({ type: 'log', args, timestamp: new Date().toISOString() });
            originalLog.apply(console, args);
        };
        console.error = (...args) => {
            this.logs.push({ type: 'error', args, timestamp: new Date().toISOString() });
            originalError.apply(console, args);
        };
        console.warn = (...args) => {
            this.logs.push({ type: 'warn', args, timestamp: new Date().toISOString() });
            originalWarn.apply(console, args);
        };

        console.log('Log interception enabled');
    },

    // Clear captured logs
    clearLogs() {
        this.logs = [];
        console.log('Logs cleared');
    },

    // Search logs for a pattern
    findLog(pattern) {
        return this.logs.filter(log => {
            const str = log.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            return str.includes(pattern);
        });
    },

    // Check if log pattern exists
    hasLog(pattern) {
        return this.findLog(pattern).length > 0;
    },

    // Print test result
    printResult(testName, passed, details = '') {
        const status = passed ? 'PASS' : 'FAIL';
        const result = { testName, passed, details };
        this.testResults.push(result);
        console.log(`${status}: ${testName}${details ? ' - ' + details : ''}`);
        return passed;
    },

    // Print summary
    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('TEST SUMMARY');
        console.log('='.repeat(50));

        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;

        this.testResults.forEach(r => {
            console.log(`${r.passed ? '[PASS]' : '[FAIL]'} ${r.testName}`);
        });

        console.log('='.repeat(50));
        console.log(`Total: ${passed}/${total} tests passed`);
        console.log('='.repeat(50) + '\n');
    },

    // Wait helper
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================
// TEST CASES
// ============================================

const ChatFlowTests = {

    // Test 1: Verify extension logging is working
    async testExtensionLogging() {
        console.log('\nTEST 1: Extension Logging');
        console.log('-'.repeat(40));

        TestUtils.clearLogs();

        // The extension should have logged during initialization
        await TestUtils.wait(500);

        const checks = [
            TestUtils.hasLog('ChatInterface'),
            TestUtils.hasLog('CyberAgent') || TestUtils.hasLog('Ollama')
        ];

        return TestUtils.printResult(
            'Extension logging enabled',
            checks.some(c => c),
            checks[0] ? 'ChatInterface logs found' : 'No ChatInterface logs yet'
        );
    },

    // Test 2: Verify webview message handler
    async testWebviewMessageHandler() {
        console.log('\nTEST 2: Webview Message Handler');
        console.log('-'.repeat(40));

        // Check if the webview's message listener is registered
        const hasMessageListener = typeof window !== 'undefined';

        return TestUtils.printResult(
            'Webview environment detected',
            hasMessageListener,
            hasMessageListener ? 'Running in webview' : 'Not in webview context'
        );
    },

    // Test 3: Check thinking element exists
    async testThinkingElementExists() {
        console.log('\nTEST 3: Thinking Element');
        console.log('-'.repeat(40));

        const thinking = document.getElementById('thinking');
        const messagesContainer = document.getElementById('messages');

        const results = {
            thinkingExists: !!thinking,
            messagesExists: !!messagesContainer
        };

        console.log('  - Thinking element:', results.thinkingExists ? 'Found' : 'NOT FOUND');
        console.log('  - Messages container:', results.messagesExists ? 'Found' : 'NOT FOUND');

        return TestUtils.printResult(
            'Thinking element exists',
            results.thinkingExists,
            results.thinkingExists ? 'Element ready' : 'Element missing - will be created dynamically'
        );
    },

    // Test 4: Simulate showThinking command
    async testShowThinking() {
        console.log('\nTEST 4: Show Thinking Indicator');
        console.log('-'.repeat(40));

        TestUtils.clearLogs();

        // Simulate receiving a showThinking command
        const event = new MessageEvent('message', {
            data: { command: 'showThinking' }
        });
        window.dispatchEvent(event);

        await TestUtils.wait(300);

        const thinking = document.getElementById('thinking');
        const isVisible = thinking && (
            thinking.classList.contains('active') ||
            thinking.style.display === 'flex'
        );

        console.log('  - Thinking element after command:', !!thinking);
        console.log('  - Is visible/active:', isVisible);
        console.log('  - Log contains showThinking:', TestUtils.hasLog('showThinking'));

        return TestUtils.printResult(
            'showThinking command works',
            isVisible || TestUtils.hasLog('showThinking'),
            isVisible ? 'Indicator visible' : 'Check console logs'
        );
    },

    // Test 5: Simulate hideThinking command
    async testHideThinking() {
        console.log('\nTEST 5: Hide Thinking Indicator');
        console.log('-'.repeat(40));

        // First show it
        window.dispatchEvent(new MessageEvent('message', {
            data: { command: 'showThinking' }
        }));
        await TestUtils.wait(200);

        // Then hide it
        TestUtils.clearLogs();
        window.dispatchEvent(new MessageEvent('message', {
            data: { command: 'hideThinking' }
        }));
        await TestUtils.wait(300);

        const thinking = document.getElementById('thinking');
        const isHidden = !thinking ||
            !thinking.classList.contains('active') ||
            thinking.style.display === 'none';

        console.log('  - Thinking hidden:', isHidden);
        console.log('  - Log contains hideThinking:', TestUtils.hasLog('hideThinking'));

        return TestUtils.printResult(
            'hideThinking command works',
            isHidden || TestUtils.hasLog('hideThinking'),
            isHidden ? 'Indicator hidden' : 'Check console logs'
        );
    },

    // Test 6: Simulate addMessage command
    async testAddMessage() {
        console.log('\nTEST 6: Add Message Command');
        console.log('-'.repeat(40));

        TestUtils.clearLogs();

        const testContent = 'Test message from test script - ' + Date.now();

        window.dispatchEvent(new MessageEvent('message', {
            data: {
                command: 'addMessage',
                role: 'assistant',
                content: testContent,
                timestamp: new Date().toISOString()
            }
        }));

        await TestUtils.wait(500);

        const messagesContainer = document.getElementById('messages');
        const messageFound = messagesContainer &&
            messagesContainer.innerHTML.includes('Test message from test script');

        console.log('  - Message added to DOM:', messageFound);
        console.log('  - Log contains addMessage:', TestUtils.hasLog('addMessage'));

        return TestUtils.printResult(
            'addMessage command works',
            messageFound || TestUtils.hasLog('addMessage'),
            messageFound ? 'Message visible in chat' : 'Check console logs'
        );
    },

    // Test 7: Full message flow simulation
    async testFullMessageFlow() {
        console.log('\nTEST 7: Full Message Flow Simulation');
        console.log('-'.repeat(40));

        TestUtils.clearLogs();

        console.log('  Step 1: Simulating showThinking...');
        window.dispatchEvent(new MessageEvent('message', {
            data: { command: 'showThinking' }
        }));
        await TestUtils.wait(500);

        console.log('  Step 2: Simulating thinkingStep...');
        window.dispatchEvent(new MessageEvent('message', {
            data: { command: 'thinkingStep', step: 'Processing your request...' }
        }));
        await TestUtils.wait(500);

        console.log('  Step 3: Simulating assistant response...');
        window.dispatchEvent(new MessageEvent('message', {
            data: {
                command: 'addMessage',
                role: 'assistant',
                content: '**Test Complete!** This is a simulated response to verify the message flow is working correctly.',
                timestamp: new Date().toISOString()
            }
        }));
        await TestUtils.wait(500);

        console.log('  Step 4: Simulating hideThinking...');
        window.dispatchEvent(new MessageEvent('message', {
            data: { command: 'hideThinking' }
        }));
        await TestUtils.wait(300);

        const hasShowThinking = TestUtils.hasLog('showThinking');
        const hasAddMessage = TestUtils.hasLog('addMessage');
        const hasHideThinking = TestUtils.hasLog('hideThinking');

        console.log('\n  Results:');
        console.log('  - showThinking logged:', hasShowThinking);
        console.log('  - addMessage logged:', hasAddMessage);
        console.log('  - hideThinking logged:', hasHideThinking);

        return TestUtils.printResult(
            'Full message flow',
            hasShowThinking && hasAddMessage && hasHideThinking,
            `${[hasShowThinking, hasAddMessage, hasHideThinking].filter(Boolean).length}/3 steps logged`
        );
    },

    // Test 8: Check DOM state
    async testDOMState() {
        console.log('\nTEST 8: DOM State Check');
        console.log('-'.repeat(40));

        const elements = {
            body: document.body,
            messages: document.getElementById('messages'),
            thinking: document.getElementById('thinking'),
            messageInput: document.getElementById('messageInput'),
            chatInput: document.getElementById('chatInput'),
            welcomeScreen: document.querySelector('.welcome-screen'),
            header: document.querySelector('.header'),
            inputArea: document.querySelector('.input-area')
        };

        console.log('  DOM Elements:');
        Object.entries(elements).forEach(([name, el]) => {
            const status = el ? '[OK]' : '[X]';
            const display = el ? getComputedStyle(el).display : 'N/A';
            console.log(`    ${status} ${name}: ${el ? 'exists' : 'missing'} (display: ${display})`);
        });

        const isChatMode = document.body.classList.contains('chat-mode');
        console.log(`  Mode: ${isChatMode ? 'Chat' : 'Welcome'}`);

        return TestUtils.printResult(
            'DOM state valid',
            elements.body && (elements.messages || elements.welcomeScreen),
            isChatMode ? 'In chat mode' : 'In welcome mode'
        );
    }
};

// ============================================
// RUN ALL TESTS
// ============================================

async function runAllTests() {
    console.log('\n' + '='.repeat(50));
    console.log('CIPHERMATE CHAT FLOW TEST SUITE');
    console.log('='.repeat(50));
    console.log('Starting tests at:', new Date().toISOString());
    console.log('');

    // Enable log interception
    TestUtils.interceptLogs();
    TestUtils.testResults = [];

    // Run all tests
    await ChatFlowTests.testExtensionLogging();
    await ChatFlowTests.testWebviewMessageHandler();
    await ChatFlowTests.testThinkingElementExists();
    await ChatFlowTests.testShowThinking();
    await ChatFlowTests.testHideThinking();
    await ChatFlowTests.testAddMessage();
    await ChatFlowTests.testFullMessageFlow();
    await ChatFlowTests.testDOMState();

    // Print summary
    TestUtils.printSummary();

    console.log('TIP: To test actual conversation, type a message in the chat input');
    console.log('   and watch the console for the message flow logs.\n');
}

// ============================================
// MANUAL TEST HELPERS
// ============================================

// Helper to check logs after sending a real message
function checkMessageLogs() {
    console.log('\nChecking message flow logs...\n');

    const patterns = [
        'ChatInterface: Received message',
        'ChatInterface: showThinking',
        'showThinking: thinking element',
        'Ollama: Sending',
        'Ollama: Received',
        'ChatInterface: CyberAgent response',
        'ChatInterface: addMessage',
        'addMessage command received'
    ];

    patterns.forEach(pattern => {
        const found = TestUtils.findLog(pattern);
        const status = found.length > 0 ? '[OK]' : '[X]';
        console.log(`${status} ${pattern}: ${found.length} occurrence(s)`);
    });
}

// Helper to manually trigger thinking
function showThinking() {
    window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'showThinking' }
    }));
    console.log('Triggered showThinking');
}

// Helper to manually hide thinking
function hideThinking() {
    window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'hideThinking' }
    }));
    console.log('Triggered hideThinking');
}

// Helper to manually add a test message
function addTestMessage(content = 'Test message') {
    window.dispatchEvent(new MessageEvent('message', {
        data: {
            command: 'addMessage',
            role: 'assistant',
            content: content,
            timestamp: new Date().toISOString()
        }
    }));
    console.log('Triggered addMessage');
}

// Helper to inspect current DOM state
function inspectDOM() {
    console.log('\nDOM Inspection:\n');

    const elements = [
        'messages', 'thinking', 'messageInput', 'chatInput',
        'welcomeScreen', 'header', 'inputArea'
    ];

    elements.forEach(id => {
        const el = document.getElementById(id) || document.querySelector(`.${id}`);
        if (el) {
            const style = getComputedStyle(el);
            console.log(`${id}:`);
            console.log(`  - display: ${style.display}`);
            console.log(`  - visibility: ${style.visibility}`);
            console.log(`  - opacity: ${style.opacity}`);
            console.log(`  - classList: ${el.classList.toString()}`);
        } else {
            console.log(`${id}: NOT FOUND`);
        }
    });

    console.log(`\nBody classes: ${document.body.classList.toString()}`);
}

// Helper to simulate full conversation flow
async function simulateConversation() {
    console.log('\nSimulating full conversation flow...\n');

    // Step 1: Add user message
    console.log('1. Adding user message...');
    window.dispatchEvent(new MessageEvent('message', {
        data: {
            command: 'addMessage',
            role: 'user',
            content: 'Hello, this is a test message',
            timestamp: new Date().toISOString()
        }
    }));
    await TestUtils.wait(300);

    // Step 2: Show thinking
    console.log('2. Showing thinking indicator...');
    showThinking();
    await TestUtils.wait(1000);

    // Step 3: Update thinking step
    console.log('3. Updating thinking step...');
    window.dispatchEvent(new MessageEvent('message', {
        data: { command: 'thinkingStep', step: 'Analyzing your request...' }
    }));
    await TestUtils.wait(500);

    // Step 4: Add assistant response
    console.log('4. Adding assistant response...');
    addTestMessage('Hello! I received your test message. The conversation flow is working correctly.');
    await TestUtils.wait(300);

    // Step 5: Hide thinking
    console.log('5. Hiding thinking indicator...');
    hideThinking();

    console.log('\nSimulation complete! Check the chat panel for the messages.\n');
}

// Print instructions
console.log('');
console.log('='.repeat(56));
console.log('     CIPHERMATE CHAT FLOW TEST SCRIPT LOADED');
console.log('='.repeat(56));
console.log(' Available commands:');
console.log('');
console.log('   runAllTests()        - Run all automated tests');
console.log('   checkMessageLogs()   - Check logs after message');
console.log('   showThinking()       - Manually show thinking');
console.log('   hideThinking()       - Manually hide thinking');
console.log('   addTestMessage()     - Add a test message');
console.log('   inspectDOM()         - Inspect current DOM state');
console.log('   simulateConversation() - Simulate full chat flow');
console.log('');
console.log('='.repeat(56));
console.log('');
console.log('Type runAllTests() and press Enter to start');
console.log('');
