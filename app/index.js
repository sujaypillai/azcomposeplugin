const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Connection configuration using environment variables injected by the provider
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: {
    rejectUnauthorized: false // Azure PostgreSQL requires SSL
  }
});

// Alternative: Use the full connection URL if provided
// const pool = new Pool({
//   connectionString: process.env.POSTGRES_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45)
      )
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Routes
// Main page - serve React frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint for stats
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM visitors');
    res.json({
      message: 'Hello from Azure PostgreSQL Provider Service!',
      totalVisitors: result.rows[0].count,
      database: process.env.POSTGRES_DATABASE,
      host: process.env.POSTGRES_HOST
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint for analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM visitors
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/visit', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await pool.query('INSERT INTO visitors (ip_address) VALUES ($1)', [clientIp]);
    res.json({ message: 'Visit recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  console.log('Environment variables received:');
  console.log(`- POSTGRES_HOST: ${process.env.POSTGRES_HOST}`);
  console.log(`- POSTGRES_DATABASE: ${process.env.POSTGRES_DATABASE}`);
  console.log(`- POSTGRES_USER: ${process.env.POSTGRES_USER}`);
  console.log(`- POSTGRES_PASSWORD: ${process.env.POSTGRES_PASSWORD ? '***' : 'not set'}`);
  
  await initDB();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool');
  await pool.end();
  process.exit(0);
});
