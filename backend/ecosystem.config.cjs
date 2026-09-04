module.exports = {
  apps: [
    {
      name: 'dms-backend',
      cwd: __dirname,
      script: 'src/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '900M',
      max_restarts: 20,
      min_uptime: '60s',
      restart_delay: 4000,
      kill_timeout: 8000,
      listen_timeout: 15000,
      wait_ready: true,
      exp_backoff_restart_delay: 1500,
      node_args: '--max-old-space-size=900 --expose-gc --gc-interval=1200',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      time: true,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};

