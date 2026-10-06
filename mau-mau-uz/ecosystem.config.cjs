module.exports = {
  apps: [{
    name: 'mau-mau-uz',
    script: './server/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
