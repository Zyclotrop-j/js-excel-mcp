module.exports = {
    apps: [{
        name: 'js-excel-mcp',
        script: 'node_modules/tsx/dist/cli.mjs',
        args: 'src/index.ts',
        cwd: __dirname,
        watch: false,
        autorestart: true,
        max_restarts: 10
    }]
};