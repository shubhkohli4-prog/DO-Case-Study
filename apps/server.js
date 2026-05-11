const express = require('express');
const os = require('os');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint (used by Kubernetes liveness/readiness probes)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Readiness probe
app.get('/ready', (req, res) => {
  res.status(200).json({ status: 'ready' });
});

// Main dashboard
app.get('/', (req, res) => {
  const hostname = os.hostname();
  const uptime = process.uptime();
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SaaS Dashboard - DOKS Demo</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0069FF; min-height: 100vh;
               display: flex; align-items: center; justify-content: center; }
        .card { background: #fff; border-radius: 16px; padding: 40px 50px; max-width: 600px;
                width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
        h1 { color: #0069FF; font-size: 2rem; margin-bottom: 8px; }
        .subtitle { color: #666; margin-bottom: 32px; font-size: 0.95rem; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .stat { background: #f4f8ff; border-radius: 10px; padding: 18px; border-left: 4px solid #0069FF; }
        .stat-label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 1.1rem; font-weight: 600; color: #1a1a2e; margin-top: 4px; word-break: break-all; }
        .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 6px 14px;
                 border-radius: 20px; font-size: 0.85rem; font-weight: 500; }
        .footer { margin-top: 24px; font-size: 0.8rem; color: #aaa; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>SaaS Platform</h1>
        <p class="subtitle">Deployed on DigitalOcean Kubernetes (DOKS)</p>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-label">Pod Hostname</div>
            <div class="stat-value">${hostname}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Status</div>
            <div class="stat-value"><span class="badge">✓ Running</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">Uptime</div>
            <div class="stat-value">${Math.floor(uptime)}s</div>
          </div>
          <div class="stat">
            <div class="stat-label">Timestamp</div>
            <div class="stat-value">${new Date().toISOString()}</div>
          </div>
        </div>
        <div class="footer">Powered by Node.js · Docker · Kubernetes · DigitalOcean</div>
      </div>
    </body>
    </html>
  `);
});

// CPU stress endpoint to trigger HPA (for demo purposes)
app.get('/stress', (req, res) => {
  const duration = parseInt(req.query.duration) || 10;
  const start = Date.now();
  // Burn CPU for `duration` seconds
  while ((Date.now() - start) / 1000 < duration) {
    Math.sqrt(Math.random() * 1000000);
  }
  res.json({ message: `CPU stressed for ${duration}s`, pod: os.hostname() });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    pod: os.hostname(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} | Pod: ${os.hostname()}`);
});
