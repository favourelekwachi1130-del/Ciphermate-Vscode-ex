// Test script to verify chat interface fixes
// Run with: node test-chat-interface.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/ai-agent/chat-interface.ts');

console.log('Running chat interface tests...\n');

let content;
try {
    content = fs.readFileSync(filePath, 'utf8');
} catch (err) {
    console.error('Failed to read file:', err.message);
    process.exit(1);
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch (err) {
        console.log(`  FAIL: ${name}`);
        console.log(`        ${err.message}`);
        failed++;
    }
}

// Test 1: No negative z-index on welcome screen (in actual code, not comments)
console.log('Test 1: No negative z-index...');
test('No negative z-index set on welcome screen', () => {
    // Check for setProperty call that sets z-index to -1 (the problematic pattern)
    const hasNegativeZIndex = content.includes("setProperty('z-index', '-1'");
    assert(!hasNegativeZIndex, 'Found setProperty z-index to -1 on welcome screen - this causes blank screen on back navigation');
});

// Test 2: Event delegation exists
console.log('\nTest 2: Event delegation pattern...');
test('Global event delegation is set up', () => {
    const hasEventDelegation = content.includes("document.addEventListener('click'") &&
                               content.includes('[DELEGATE]');
    assert(hasEventDelegation, 'Event delegation not found');
});

test('Event delegation handles quick actions', () => {
    const handlesQuickActions = content.includes("target.classList.contains('quick-action')");
    assert(handlesQuickActions, 'Event delegation does not handle quick actions');
});

test('Event delegation handles back button', () => {
    const handlesBackButton = content.includes("target.id === 'backButton'") ||
                              content.includes("closest('#backButton')");
    assert(handlesBackButton, 'Event delegation does not handle back button');
});

// Test 3: switchToChatMode called from handleQuickActionClick
console.log('\nTest 3: switchToChatMode integration...');
test('handleQuickActionClick calls switchToChatMode when not in chat mode', () => {
    // Find the handleQuickActionClick function
    const funcMatch = content.match(/function handleQuickActionClick[\s\S]*?^\s{12}\}/m);
    if (!funcMatch) {
        throw new Error('handleQuickActionClick function not found');
    }
    const funcBody = funcMatch[0];
    const callsSwitchToChatMode = funcBody.includes('switchToChatMode(actionText)');
    assert(callsSwitchToChatMode, 'handleQuickActionClick does not call switchToChatMode');
});

// Test 4: Inline styles are cleared in switchToWelcomeMode
console.log('\nTest 4: Inline styles cleared...');
test('switchToWelcomeMode clears z-index', () => {
    const clearsZIndex = content.includes("removeProperty('z-index')");
    assert(clearsZIndex, 'z-index not being cleared in switchToWelcomeMode');
});

test('switchToWelcomeMode clears visibility', () => {
    const clearsVisibility = content.includes("removeProperty('visibility')");
    assert(clearsVisibility, 'visibility not being cleared in switchToWelcomeMode');
});

test('switchToWelcomeMode clears opacity', () => {
    const clearsOpacity = content.includes("removeProperty('opacity')");
    assert(clearsOpacity, 'opacity not being cleared in switchToWelcomeMode');
});

// Test 5: No cloneNode pattern in setupWelcomeScreenButtons for quick actions
console.log('\nTest 5: Simplified setupWelcomeScreenButtons...');
test('setupWelcomeScreenButtons does not clone quick actions', () => {
    // Find the setupWelcomeScreenButtons function
    const funcMatch = content.match(/function setupWelcomeScreenButtons[\s\S]*?^\s{8}\}/m);
    if (!funcMatch) {
        throw new Error('setupWelcomeScreenButtons function not found');
    }
    const funcBody = funcMatch[0];
    // Should not have cloneNode for quick actions anymore
    const quickActionClone = funcBody.includes('newAction = action.cloneNode');
    assert(!quickActionClone, 'setupWelcomeScreenButtons still uses cloneNode for quick actions');
});

// Test 6: Only display:none used for hiding welcome screen
console.log('\nTest 6: Simplified welcome screen hiding...');
test('Welcome screen hiding uses only display:none', () => {
    // In sendWelcomeMessage, after hiding the welcome screen, we should only have display:none
    // Check that we don't have the problematic pattern
    const problematicPattern = content.includes("welcomeScreen.style.setProperty('visibility', 'hidden'") &&
                               content.includes("welcomeScreen.style.setProperty('opacity', '0'") &&
                               content.includes("welcomeScreen.style.setProperty('z-index', '-1'");
    assert(!problematicPattern, 'Welcome screen hiding still uses problematic visibility/opacity/z-index pattern');
});

// Summary
console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================');

if (failed > 0) {
    console.log('\nSome tests failed. Please review the fixes.');
    process.exit(1);
} else {
    console.log('\nAll tests passed!');
    process.exit(0);
}
