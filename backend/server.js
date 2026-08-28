const buildApp = require('./src/app');
const env = require('./src/config/env');
const { startSubscriptionExpiry } = require('./src/jobs/subscriptionExpiry');
const { startTrialLifecycle } = require('./src/jobs/trialLifecycle');

async function start() {
  const app = await buildApp();
  const timers = [];

  try {
    await app.listen({
      port: env.port,
      host: '0.0.0.0',
    });

    if (env.nodeEnv !== 'test') {
      timers.push(startSubscriptionExpiry());
      timers.push(startTrialLifecycle());
    }
  } catch (error) {
    timers.forEach((timer) => clearInterval(timer));
    app.log.error(error);
    process.exit(1);
  }
}

start();
