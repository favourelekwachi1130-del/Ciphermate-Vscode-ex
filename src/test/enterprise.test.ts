import * as assert from 'assert';
import * as vscode from 'vscode';
import { EnterpriseLogger, EnterpriseConfiguration, ServiceContainer, ErrorHandler, PerformanceMonitor } from '../extension';

suite('Enterprise Architecture Tests', () => {
  let logger: EnterpriseLogger;
  let config: EnterpriseConfiguration;
  let container: ServiceContainer;
  let errorHandler: ErrorHandler;
  let performanceMonitor: PerformanceMonitor;

  setup(() => {
    logger = new EnterpriseLogger();
    config = new EnterpriseConfiguration();
    container = new ServiceContainer();
    errorHandler = new ErrorHandler(logger, config);
    performanceMonitor = new PerformanceMonitor(logger);
  });

  test('Logger should log messages correctly', () => {
    // Test that logger doesn't throw errors
    assert.doesNotThrow(() => {
      logger.info('Test info message');
      logger.warn('Test warning message');
      logger.error('Test error message', new Error('Test error'));
      logger.debug('Test debug message');
    });
  });

  test('Configuration should validate correctly', () => {
    assert.strictEqual(config.validate(), true);
    
    // Test valid configuration values
    assert.doesNotThrow(() => {
      config.set('logging.level', 'debug');
      config.set('scanning.timeout', 60000);
      config.set('scanning.maxConcurrency', 5);
    });
  });

  test('Configuration should reject invalid values', () => {
    assert.throws(() => {
      config.set('logging.level', 'invalid');
    });

    assert.throws(() => {
      config.set('scanning.timeout', -1);
    });

    assert.throws(() => {
      config.set('scanning.maxConcurrency', 15);
    });
  });

  test('Service container should register and retrieve services', () => {
    const testService = { name: 'test' };
    
    container.register('testService', testService);
    assert.strictEqual(container.has('testService'), true);
    assert.strictEqual(container.get('testService'), testService);
  });

  test('Service container should throw error for missing service', () => {
    assert.throws(() => {
      container.get('nonExistentService');
    });
  });

  test('Performance monitor should track metrics', () => {
    const stopTimer = performanceMonitor.startTimer('test_operation');
    
    // Simulate some work
    setTimeout(() => {
      stopTimer();
      
      const metrics = performanceMonitor.getMetrics();
      assert.strictEqual(metrics['test_operation'].count, 1);
      assert.ok(metrics['test_operation'].average > 0);
    }, 10);
  });

  test('Error handler should handle errors gracefully', async () => {
    const testError = new Error('Test error');
    
    // Should not throw
    await assert.doesNotReject(async () => {
      await errorHandler.handleError(testError, 'test_context', false);
    });
  });
});

suite('Integration Tests', () => {
  test('Extension should activate without errors', async () => {
    const extension = vscode.extensions.getExtension('ciphermate.ciphermate');
    if (extension) {
      await extension.activate();
      assert.ok(true, 'Extension activated successfully');
    }
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    const ciphermateCommands = commands.filter(cmd => cmd.startsWith('ciphermate.'));
    
    assert.ok(ciphermateCommands.length > 0, 'CipherMate commands should be registered');
  });
});




