module.exports = {
  apps: [{
    name: 'device-rental',
    script: 'node_modules/.bin/next',
    args: 'start -p 3000',
    cwd: '/opt/app',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
