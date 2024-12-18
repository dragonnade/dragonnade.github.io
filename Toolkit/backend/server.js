import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Connection pool configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  database: 'dcos',
  user: process.env.DB_USER || 'draggy',
  password: process.env.DB_PASSWORD || 'catscats',
  port: 5432,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware to handle database connection errors
app.use(async (req, res, next) => {
  req.db = await pool.connect();
  next();
});

// GET /api/orders - Get all orders grouped by year
app.get('/api/orders', async (req, res) => {
  const client = req.db;
  try {
    const result = await client.query(`
      SELECT o.order_id, o.order_name
      FROM orders o
      ORDER BY o.order_id DESC
    `);

    // Group by ID (since we don't have year data)
    const orders = [{
      year: new Date().getFullYear(),
      orders: result.rows.map(order => ({
        id: order.order_id,
        name: order.order_name
      }))
    }];

    res.json(orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  } finally {
    client.release();
  }
});


// GET /api/articles/:orderId - Get articles for a specific order
app.get('/api/articles/:orderId', async (req, res) => {
  const client = req.db;
  try {
    const result = await client.query(`
      SELECT 
        article_id,
        article_number,
        article_title,
        category,
        word_count,
        first_paragraph,
        url
      FROM articles
      WHERE order_id = $1
      ORDER BY 
        CASE 
          WHEN article_number ~ '^[0-9]+$' THEN CAST(article_number AS INTEGER)
          ELSE 999999
        END,
        article_number
    `, [req.params.orderId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching articles:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  } finally {
    client.release();
  }
});

// GET /api/similarities/:articleId - Get similar articles
app.get('/api/similarities/:articleId', async (req, res) => {
  const client = req.db;
  try {
    const result = await client.query(`
      SELECT 
        s.id as similarity_id,
        s.similarity_score as similarity,
        ta.article_number,
        ta.article_title,
        ta.first_paragraph,
        ta.category,
        ta.word_count,
        ta.url,
        o.order_name,
        o.order_id,
        c.comment
      FROM similarities s
      JOIN articles ta ON s.target_article_id = ta.article_id
      JOIN orders o ON s.target_order_id = o.order_id
      LEFT JOIN article_comments c ON s.id = c.similarity_id
      WHERE s.source_article_id = $1
    `, [req.params.articleId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching similarities:', err);
    res.status(500).json({ error: 'Failed to fetch similarities' });
  } finally {
    client.release();
  }
});

// POST /api/comments/:similarityId - Save or update a comment
app.post('/api/comments/:similarityId', async (req, res) => {
  const client = req.db;
  try {
    await client.query(`
      INSERT INTO article_comments (similarity_id, comment)
      VALUES ($1, $2)
      ON CONFLICT (similarity_id)
      DO UPDATE SET comment = EXCLUDED.comment
    `, [req.params.similarityId, req.body.comment]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving comment:', err);
    res.status(500).json({ error: 'Failed to save comment' });
  } finally {
    client.release();
  }
});

app.post('/api/compare-articles', async (req, res) => {
  const { baseText, comparisonText } = req.body;
  // Use diff-match-patch or similar to generate redline HTML
  // Return the redlined HTML
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.info('SIGTERM signal received. Closing HTTP server and DB pool...');
  await pool.end();
  process.exit(0);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
