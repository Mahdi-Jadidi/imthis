const { createRunner } = require('./test-runner');

const suites = [
  { name: 'health', fn: require('./suites/health') },
  { name: 'auth', fn: require('./suites/auth') },
  { name: 'refresh', fn: require('./suites/refresh') },
  { name: 'upload', fn: require('./suites/upload') },
  { name: 'parse', fn: require('./suites/parse') },
  { name: 'billing', fn: require('./suites/billing') },
  { name: 'analytics', fn: require('./suites/analytics') },
  { name: 'deploy', fn: require('./suites/deploy') },
  { name: 'edge-cases', fn: require('./suites/edge-cases') },
];

async function warmupTarget() {
  // The first request after a fresh Fastify boot can pay connection warmup costs
  // for the local stack. We warm the target quietly so the health perf check
  // measures steady-state behavior instead of cold-start jitter.
  try {
    await fetch('http://127.0.0.1:3000/health');
  } catch (error) {
    // Let the health suite report unreachable targets with its normal failure output.
  }
}

async function cleanup() {
  console.log('\nCleanup note:');
  console.log("  Test data is left in place for debugging. Remove users matching '%test.drop.cv' after review.");
}

async function main() {
  const runner = createRunner();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  drop.cv Backend Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${new Date().toISOString()}`);
  console.log('  Target: http://127.0.0.1:3000');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await warmupTarget();

  for (const suite of suites) {
    await runner.runSuite(suite.name, async (tools) => {
      try {
        await suite.fn(tools);
      } catch (error) {
        throw new Error(`${suite.name} crashed: ${error.message}`);
      }
    }, {
      crashFailureCount: suite.fn.expectedTests || 1,
    });
  }

  await cleanup();
  runner.finalize();

  if (runner.totals.failed === 0) {
    console.log('\nAll tests passed ✅');
  }
}

main().catch((error) => {
  console.error(`Fatal test runner error: ${error.message}`);
  process.exit(1);
});
