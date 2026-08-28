const context = require('./context');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function colorize(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function createRunner(sharedContext = context) {
  const totals = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };
  const suiteTimings = [];

  function logPass(name) {
    console.log(colorize('green', `✅ PASS ${name}`));
  }

  function logFail(name, error) {
    console.log(colorize('red', `❌ FAIL ${name}`));
    if (error) {
      console.log(colorize('gray', `  ${error.message}`));
    }
  }

  function logSkip(name, reason) {
    console.log(colorize('yellow', `⚠️  SKIP ${name}${reason ? ` - ${reason}` : ''}`));
  }

  async function runTest(name, fn) {
    totals.total += 1;

    try {
      const result = await fn(sharedContext);

      if (result && result.skip) {
        totals.skipped += 1;
        logSkip(name, result.reason);
        return { status: 'skipped' };
      }

      totals.passed += 1;
      logPass(name);
      return { status: 'passed' };
    } catch (error) {
      totals.failed += 1;
      logFail(name, error);
      return { status: 'failed', error };
    }
  }

  async function skip(name, reason) {
    totals.total += 1;
    totals.skipped += 1;
    logSkip(name, reason);
    return { status: 'skipped' };
  }

  async function runSuite(name, suiteFn, options = {}) {
    const startedAt = Date.now();
    const before = { ...totals };

    console.log(colorize('cyan', `\nSuite: ${name}`));

    try {
      await suiteFn({
        context: sharedContext,
        test: runTest,
        skip,
      });
    } catch (error) {
      const failedCount = Math.max(Number(options.crashFailureCount) || 1, 1);

      totals.total += failedCount;
      totals.failed += failedCount;
      logFail(`${name} suite crashed`, error);
    }

    const elapsedMs = Date.now() - startedAt;
    const result = {
      name,
      passed: totals.passed - before.passed,
      failed: totals.failed - before.failed,
      skipped: totals.skipped - before.skipped,
      total: totals.total - before.total,
      durationMs: elapsedMs,
    };

    suiteTimings.push(result);
    return result;
  }

  function printSummary() {
    console.log(colorize('cyan', '\nSummary'));
    console.log(
      `${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped out of ${totals.total} total`,
    );
  }

  function printSuiteTimings() {
    console.log(colorize('cyan', '\nSuite Timing'));
    for (const suite of suiteTimings) {
      console.log(
        `${suite.name}: ${suite.total} total in ${suite.durationMs}ms ` +
          `(${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped)`,
      );
    }
  }

  function finalize() {
    printSuiteTimings();
    printSummary();
    process.exitCode = totals.failed > 0 ? 1 : 0;
  }

  return {
    context: sharedContext,
    totals,
    suiteTimings,
    test: runTest,
    skip,
    runSuite,
    printSuiteTimings,
    printSummary,
    finalize,
  };
}

module.exports = {
  createRunner,
};
