import runTests from './set-context.test.js';
(async () => {
    await runTests();
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
