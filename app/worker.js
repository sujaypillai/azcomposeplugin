const { Pool } = require('pg');

// Worker service that uses the same Azure PostgreSQL provider
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

async function ensureTableExists() {
  const maxRetries = 30;
  const retryDelay = 2000; // 2 seconds
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1 FROM visitors LIMIT 1');
      console.log('✓ Table "visitors" is ready');
      return true;
    } catch (err) {
      if (err.code === '42P01') { // Table doesn't exist
        console.log(`Waiting for table "visitors" to be created... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw err; // Different error, propagate it
      }
    }
  }
  
  throw new Error('Timeout waiting for table "visitors" to be created');
}

async function processVisitors() {
  try {
    const result = await pool.query(`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM visitors
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);
    
    console.log('=== Visitor Analytics (Last 7 Days) ===');
    if (result.rows.length === 0) {
      console.log('No visitors in the last 7 days');
    } else {
      result.rows.forEach(row => {
        console.log(`${row.date}: ${row.count} visitors`);
      });
    }
    console.log('====================================\n');
  } catch (err) {
    console.error('Error processing visitors:', err);
  }
}

async function startWorker() {
  console.log('Worker starting...');
  console.log(`Connected to: ${process.env.POSTGRES_HOST}/${process.env.POSTGRES_DATABASE}`);
  
  // Wait for table to be ready
  try {
    await ensureTableExists();
  } catch (err) {
    console.error('Failed to initialize:', err.message);
    process.exit(1);
  }
  
  console.log('Worker started - Processing visitor data every 30 seconds');
  
  // Run analytics every 30 seconds
  setInterval(processVisitors, 30000);
  
  // Run immediately after startup
  processVisitors();
}

startWorker();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool');
  await pool.end();
  process.exit(0);
});
