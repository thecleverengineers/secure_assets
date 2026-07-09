import express from 'express';
import pkg from 'pg';

const { Pool } = pkg;
const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://secure_assets:secure_assets@localhost:5432/secure_assets'
});

app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/search', (_req, res) => {
  res.json({ items: [{ id: 'listing-1', title: 'Luxury Secure Vault Suite' }] });
});

app.listen(3000, () => console.log('API running on :3000'));
