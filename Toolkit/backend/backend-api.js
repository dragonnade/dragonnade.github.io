// server.js
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// import diff from 'diff';
import { diffWords } from 'diff';

// const { diffWords } = diff;



const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'postgres',
  database: 'dcos',
  user: process.env.DB_USER || 'draggy',
  password: process.env.DB_PASSWORD || 'catscats',
  port: 5432
});

const romanNumeralPattern = 'i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx';



const preprocessText = (text) => {
  // Split text into lines, preserving paragraph structure
  const lines = text
    .replace(/\r\n/g, '\n')     // Normalize line endings
    .split(/\n/)                // Split on line breaks
    .map(line => line.trim())   // Trim whitespace
    .filter(line => line.length > 0); // Remove empty lines

  // Don't remove numbering - just return the cleaned lines
  return lines;
};

// // Test function to verify the preprocessing
// const testPreprocess = () => {
//   const testCases = [
//     "43.—(1) Nothing in this Order...\n(a)belonging to His Majesty...;\n(b)belonging to His Majesty in...; or\n(c)belonging to a government department.\n(2) Paragraph (1) does not apply to the...\n(3) A consent under paragraph (1) may ...",
//     "14. The undertaker must...\n(1) First condition...\n(2) Second condition...",
//     "144.—(1) Subject to paragraph (2)...\n(i) first item...\n(ii) second item...\n(a) sub-item...",
//     "43 - (1) Another format...\n(a) with different spacing...\n(1) Reference to paragraph (2) should stay"
//   ];

//   testCases.forEach((test, index) => {
//     console.log(`\nTest Case ${index + 1}:`);
//     console.log('Original:');
//     console.log(test);
//     console.log('\nProcessed:');
//     console.log(preprocessText(test).join('\n'));
//   });
// };

const checkLengthRatio = (sourceLength, targetLength) => {
  const ratio = targetLength / sourceLength;
  return 0.8 <= ratio && ratio <= 1.2;
};

const checkWordOverlap = (sourceText, targetText) => {
  const sourceWords = new Set(sourceText.toLowerCase().split(/\s+/));
  const targetWords = new Set(targetText.toLowerCase().split(/\s+/));
  const intersection = new Set([...sourceWords].filter(x => targetWords.has(x)));
  return intersection.size / Math.min(sourceWords.size, targetWords.size);
};

const countIdenticalParagraphs = (sourceParagraphs, targetParagraphs) => {
  return sourceParagraphs.reduce((count, source) => {
    return count + (targetParagraphs.some(target => 
      source.toLowerCase().trim() === target.toLowerCase().trim()) ? 1 : 0);
  }, 0);
};

// Add after other utility functions:
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define processMatch function first, using function declaration for hoisting
// function processMatch(bestMatches, article, similarity, reordered) {
//   if (!bestMatches.has(article.order_id) || 
//       similarity > bestMatches.get(article.order_id).similarity) {
//     bestMatches.set(article.order_id, {
//       similarity,
//       article_number: article.article_number,
//       article_title: article.article_title,
//       first_paragraph: article.first_paragraph,
//       category: article.category,
//       word_count: article.word_count,
//       order_id: article.order_id,
//       order_name: article.order_name,
//       year: article.year
//     });
//     console.log(`- Saved as best match (${similarity.toFixed(2)}%) for order ${article.order_id}`);
//   }
// }

// Function to call Python script for Levenshtein comparison
const compareArticles = (sourceParagraphs, targetParagraphs) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [join(__dirname, 'levenshtein_compare.py')]);
    
    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python process error:', error);
        reject(new Error('Failed to compare texts'));
        return;
      }
      
      try {
        const { similarity, reordered } = JSON.parse(result);
        resolve([similarity, reordered]);
      } catch (err) {
        reject(err);
      }
    });

    // Send data to Python script
    const data = {
      source: sourceParagraphs,
      target: targetParagraphs
    };
    
    pythonProcess.stdin.write(JSON.stringify(data));
    pythonProcess.stdin.end();
  });
};

// Add to backend-api.js

// Utility function to parse search query
const parseSearchQuery = (query) => {
  const terms = [];
  let currentTerm = '';
  let inQuotes = false;

  // Helper to add term to array
  const addTerm = (term) => {
    term = term.trim();
    if (term) {
      const prefix = term[0];
      if (prefix === '+' || prefix === '-') {
        terms.push({
          text: term.slice(1),
          required: prefix === '+',
          excluded: prefix === '-'
        });
      } else {
        terms.push({
          text: term,
          required: false,
          excluded: false
        });
      }
    }
  };

  // Parse query character by character
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (char === '"') {
      if (inQuotes) {
        addTerm(currentTerm);
        currentTerm = '';
      }
      inQuotes = !inQuotes;
    } else if (char === ' ' && !inQuotes) {
      addTerm(currentTerm);
      currentTerm = '';
    } else {
      currentTerm += char;
    }
  }
  
  addTerm(currentTerm);
  return terms;
};



app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.order_id, o.order_name, 
             EXTRACT(YEAR FROM TO_TIMESTAMP(CONCAT(o.order_year, '0101'), 'YYYYMMDD')) as year
      FROM orders o
      JOIN articles a ON o.order_id = a.order_id
      GROUP BY o.order_id, o.order_name, year
      ORDER BY year DESC, o.order_id DESC
    `);

    // Group by year
    const grouped = result.rows.reduce((acc, order) => {
      const year = order.year;
      if (!acc[year]) {
        acc[year] = {
          year,
          orders: []
        };
      }
      acc[year].orders.push({
        id: order.order_id,
        name: order.order_name
      });
      return acc;
    }, {});

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/articles/:orderId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT article_id, article_number, article_title, category, word_count, url
      FROM articles
      WHERE order_id = $1
      ORDER BY article_number::int
    `, [req.params.orderId]);
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.get('/api/similarities/:articleId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.similarity_score as similarity,
        ta.article_number as article_number,
        ta.article_title as article_title,
        ta.first_paragraph,
        ta.category,
        ta.word_count,
        ta.url,
        o.order_name,
        o.order_id,
        s.id as similarity_id
      FROM similarities s
      JOIN articles ta ON s.target_article_id = ta.article_id
      JOIN orders o ON s.target_order_id = o.order_id
      WHERE s.source_article_id = $1
      ORDER BY s.similarity_score DESC
    `, [req.params.articleId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error in /api/similarities/:articleId:', err);
    res.status(500).json({ error: err.message });
  }
});



app.get('/api/article-titles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.article_title,
        a.article_id,
        o.order_name,
        o.order_year,
        a.article_number,
        a.article_id,
        a.first_paragraph,
        a.url
      FROM articles a
      JOIN orders o ON a.order_id = o.order_id
      GROUP BY 
        a.article_title,
        a.article_id,
        o.order_name,
        o.order_year,
        a.article_number,
        a.first_paragraph,
        a.url
      ORDER BY o.order_year DESC, a.article_number
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error in /api/article-titles:', err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/compare', async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, text, category } = req.body;
    console.log("Received comparison request");
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Utility functions should be defined at the start of the handler
    function processMatch(bestMatches, article, similarity, reordered) {
      if (!bestMatches.has(article.order_id) || 
          similarity > bestMatches.get(article.order_id).similarity) {
        bestMatches.set(article.order_id, {
          similarity,
          article_number: article.article_number,
          article_title: article.article_title,
          first_paragraph: article.first_paragraph,
          category: article.category,
          word_count: article.word_count,
          order_id: article.order_id,
          order_name: article.order_name,
          year: article.year,
          url: article.url
        });
        // console.log(`- Saved as best match (${similarity.toFixed(2)}%) for order ${article.order_id}`);
      }
    }
    
    // Preprocess input text into paragraphs array matching database format
    const sourceParagraphs = preprocessText(text);
    console.log('Preprocessed into paragraphs:', sourceParagraphs);

    // Get word count from processed paragraphs to match database counting
    const wordCount = Math.floor(sourceParagraphs.join(' ').split(/\s+/).length);
    console.log('Word count:', wordCount);

    // Calculate ranges as integers
    let minWords, maxWords;
    if (wordCount < 50) {
      minWords = Math.floor(wordCount * 0.5);
      maxWords = Math.floor(wordCount * 2.0);
    } else if (wordCount < 200) {
      minWords = Math.floor(wordCount * 0.6);
      maxWords = Math.floor(wordCount * 1.6);
    } else {
      minWords = Math.floor(wordCount * 0.7);
      maxWords = Math.floor(wordCount * 1.3);
    }

    const queryParams = [
      category || 'Other',
      wordCount,
      minWords,
      maxWords
    ];

    console.log('Query parameters:', {
      category: queryParams[0],
      wordCount: queryParams[1],
      minWords: queryParams[2],
      maxWords: queryParams[3]
    });

    // Get all articles in word count range
    const result = await client.query(`
      SELECT 
        a.article_id,
        a.article_number,
        a.article_title,
        a.article_text,
        a.first_paragraph,
        a.category,
        a.word_count,
        o.order_id,
        o.order_name,
        EXTRACT(YEAR FROM TO_TIMESTAMP(CONCAT(o.order_year, '0101'), 'YYYYMMDD')) as year,
        a.url
      FROM articles a
      JOIN orders o ON a.order_id = o.order_id
      WHERE a.word_count BETWEEN ($3::integer) AND ($4::integer)
      ORDER BY 
        CASE 
          WHEN a.category = $1 THEN 0 
          ELSE 1 
        END,
        ABS(a.word_count - ($2::integer))
    `, queryParams);

    console.log(`Query returned ${result.rows.length} candidate articles`);
    
    const bestMatches = new Map();
    
    for (const article of result.rows) {
      // console.log(`\nProcessing article ${article.article_id}:`);
      
      // Skip if category doesn't match (when category is specified)
      if (category && article.category !== category) {
        // console.log('- Skipping due to category mismatch');
        continue;
      }

      // Clean up database paragraphs
      const targetParagraphs = article.article_text
        .map(p => p.trim())
        .filter(p => p.length > 0);

      // Check text length ratio
      const sourceLength = sourceParagraphs.join(' ').length;
      const targetLength = targetParagraphs.join(' ').length;
      if (!checkLengthRatio(sourceLength, targetLength)) {
        // console.log('- Skipping due to length ratio mismatch');
        continue;
      }

      // Check for identical paragraphs
      const identicalCount = countIdenticalParagraphs(sourceParagraphs, targetParagraphs);
      if (sourceParagraphs.length >= 5 && identicalCount > sourceParagraphs.length / 2) {
        // If more than half paragraphs match in longer texts, do full comparison
        try {
          const [similarity, reordered] = await compareArticles(sourceParagraphs, targetParagraphs);
          // Process similarity result...
          processMatch(bestMatches, article, similarity, reordered);
        } catch (err) {
          console.error(`Error comparing article ${article.article_id}:`, err);
        }
        continue;
      }

      // Check word overlap for remaining articles
      const overlap = checkWordOverlap(
        sourceParagraphs.join(' '), 
        targetParagraphs.join(' ')
      );
      
      if (overlap < 0.6) {
        // console.log('- Skipping due to low word overlap:', overlap.toFixed(2));
        continue;
      }

      // Only now do we perform the expensive Levenshtein comparison
      try {
        const [similarity, reordered] = await compareArticles(sourceParagraphs, targetParagraphs);
        if (similarity > 50) {
          processMatch(bestMatches, article, similarity, reordered);
        }
      } catch (err) {
        console.error(`Error comparing article ${article.article_id}:`, err);
      }
    }


      // // Helper function to process matches
      // const processMatch = (article, similarity, reordered) => {
      //   if (!bestMatches.has(article.order_id) || 
      //       similarity > bestMatches.get(article.order_id).similarity) {
      //     bestMatches.set(article.order_id, {
      //       similarity,
      //       article_number: article.article_number,
      //       article_title: article.article_title,
      //       first_paragraph: article.first_paragraph,
      //       category: article.category,
      //       word_count: article.word_count,
      //       order_id: article.order_id,
      //       order_name: article.order_name,
      //       year: article.year
      //     });
      //     console.log(`- Saved as best match (${similarity.toFixed(2)}%) for order ${article.order_id}`);
      //   }
      // };

    const similarities = Array.from(bestMatches.values())
      .sort((a, b) => b.similarity - a.similarity)
      .filter(match => match.similarity > 0);

    // console.log(`\nReturning ${similarities.length} matches`);
    if (similarities.length > 0) {
      console.log('Top match:', {
        orderName: similarities[0].order_name,
        similarity: similarities[0].similarity,
        wordCount: similarities[0].word_count
      });
    }

    res.json(similarities);
  } catch (err) {
    console.error('Error in /api/compare:', err);
    res.status(500).json({ error: 'Failed to compare text', details: err.message });
  } finally {
    client.release();
  }
});



app.post('/api/compare-articles', async (req, res) => {
  try {
    const { baseText, comparisonText } = req.body;
    
    if (!baseText || !comparisonText) {
      return res.status(400).json({ 
        error: 'Both baseText and comparisonText are required' 
      });
    }

    // Perform the diff while preserving line breaks
    const diff = diffWords(comparisonText, baseText, { // Note order switched here
      newlineIsToken: true,
      ignoreCase: false
    });
    
    // Convert diff to HTML with appropriate styling and preserve whitespace
    let html = '<div class="LegSnippet" style="white-space: pre-wrap;">';
    diff.forEach(part => {
      if (part.added) {
        // New text in the base article (additions)
        html += `<span class="LegAddition" style="background-color: #e6ffe6;">${part.value}</span>`;
      } else if (part.removed) {
        // Text that was in the comparison but removed in base
        html += `<span class="LegRepeal" style="background-color: #ffe6e6; text-decoration: line-through;">${part.value}</span>`;
      } else {
        // Unchanged text
        html += part.value;
      }
    });
    html += '</div>';

    res.json({ html });
  } catch (error) {
    console.error('Error comparing articles:', error);
    res.status(500).json({ 
      error: 'Failed to compare articles',
      details: error.message 
    });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Add the search endpoint
app.post('/api/search', async (req, res) => {
  const client = await pool.connect();
  try {
    const { query, dateRange, filters } = req.body;
    const searchTerms = parseSearchQuery(query);
    
    // Build the SQL query
    let sql = `
      SELECT DISTINCT
        a.article_id,
        a.article_number,
        a.article_title,
        a.first_paragraph as excerpt,
        o.order_name,
        o.order_year,
        a.url
      FROM articles a
      JOIN orders o ON a.order_id = o.order_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    // Add search conditions
    searchTerms.forEach(term => {
      const searchPattern = `%${term.text}%`;
      if (term.excluded) {
        sql += `
          AND NOT (
            a.article_title ILIKE $${paramIndex}
            OR a.article_text::text ILIKE $${paramIndex}
          )
        `;
      } else if (term.required) {
        sql += `
          AND (
            a.article_title ILIKE $${paramIndex}
            OR a.article_text::text ILIKE $${paramIndex}
          )
        `;
      } else {
        // For exact phrases (in quotes) or regular terms
        if (term.text.includes(' ')) {
          sql += `
            AND (
              a.article_title ILIKE $${paramIndex}
              OR a.article_text::text ILIKE $${paramIndex}
            )
          `;
        } else {
          sql += `
            AND (
              a.article_title ~* $${paramIndex}
              OR a.article_text::text ~* $${paramIndex}
            )
          `;
        }
      }
      params.push(searchPattern);
      paramIndex++;
    });

    // Add date range conditions if provided
    if (dateRange.start) {
      sql += ` AND o.order_year >= $${paramIndex}`;
      params.push(new Date(dateRange.start).getFullYear());
      paramIndex++;
    }
    if (dateRange.end) {
      sql += ` AND o.order_year <= $${paramIndex}`;
      params.push(new Date(dateRange.end).getFullYear());
      paramIndex++;
    }

    // Add order and limit
    sql += `
      ORDER BY o.order_year DESC, a.article_number
      LIMIT 100
    `;

    const result = await client.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error in search:', err);
    res.status(500).json({ error: 'Search failed', details: err.message });
  } finally {
    client.release();
  }
});