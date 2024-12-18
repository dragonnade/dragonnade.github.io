import psycopg2
from psycopg2.extras import execute_values
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from XMLDataExtractor import parse_xml
import os
from Levenshtein import ratio #distance #seqratio, setratio
import logging
import time
# import multiprocessing
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import partial
from hashlib import md5
from dataclasses import dataclass
from typing import List, Tuple, Dict
from itertools import groupby
# import heapq
# import numpy as np


def create_database():
    try:
        # First connect to default 'postgres' database
        conn = psycopg2.connect(
            host="localhost",
            database="postgres",  # Connect to default postgres database
            user="draggy",
            password="catscats",
            port="5432"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        
        # Check if our target database exists
        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'dcos'")
        if not cur.fetchone():
            cur.execute('CREATE DATABASE dcos')
            print("Database 'dcos' created successfully")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error in create_database(): {str(e)}")
        raise




def setup_tables():
    try:
        # Try to connect to the database
        conn = psycopg2.connect(
            host="localhost",
            database="dcos",
            user="draggy",
            password="catscats",
            port="5432"
        )
        cur = conn.cursor()
        
        # Create original tables
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id SERIAL PRIMARY KEY,
                order_name TEXT UNIQUE,
                order_year INTEGER,
                order_SI_number INTEGER
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS articles (
                article_id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(order_id),
                article_number TEXT,
                article_title TEXT,
                article_text TEXT[],
                novel BOOLEAN DEFAULT NULL,
                UNIQUE(order_id, article_number)
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS similarities (
                id SERIAL PRIMARY KEY,
                source_article_id INTEGER REFERENCES articles(article_id),
                target_article_id INTEGER REFERENCES articles(article_id),
                target_order_id INTEGER REFERENCES orders(order_id),
                similarity_score FLOAT,
                UNIQUE(source_article_id, target_order_id)
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS paragraph_cache (
                hash_id TEXT PRIMARY KEY,
                paragraph_text TEXT,
                word_count INT,
                paragraph_index INT,
                article_id INT REFERENCES articles(article_id)
            )
        """)
        # Add new columns to articles table
        cur.execute("""
            DO $$
            BEGIN
                BEGIN
                    ALTER TABLE articles 
                    ADD COLUMN title_hash TEXT,
                    ADD COLUMN title_words TEXT[],
                    ADD COLUMN word_count INT,
                    ADD COLUMN first_paragraph TEXT,
                    ADD COLUMN category TEXT,
                    ADD COLUMN hash TEXT;
                EXCEPTION
                    WHEN duplicate_column THEN 
                        NULL;
                END;
            END $$;
        """)
        
        # Add new columns to similarities table
        cur.execute("""
            DO $$
            BEGIN
                BEGIN
                    ALTER TABLE similarities 
                    ADD COLUMN reordered BOOLEAN DEFAULT FALSE;
                EXCEPTION
                    WHEN duplicate_column THEN 
                        NULL;
                END;
            END $$;
        """)


        # Create new tables
        cur.execute("""
            CREATE TABLE IF NOT EXISTS title_patterns (
                id SERIAL PRIMARY KEY,
                source_hash TEXT,
                target_hash TEXT,
                frequency INT,
                avg_content_similarity FLOAT,
                UNIQUE(source_hash, target_hash)
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS category_relationships (
                source_category TEXT,
                target_category TEXT,
                frequency INT,
                avg_similarity FLOAT,
                PRIMARY KEY (source_category, target_category)
            )
        """)
        
        # Create indexes for original tables
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_articles_order_id 
            ON articles(order_id)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_paragraph_cache_hash
            ON paragraph_cache(hash_id)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_paragraph_cache_article
            ON paragraph_cache(article_id)
        """)

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_similarities_source_article_id 
            ON similarities(source_article_id)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_similarities_target_order_id 
            ON similarities(target_order_id)
        """)
        
        # Create indexes for new columns and tables
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_articles_title_hash 
            ON articles(title_hash)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_articles_category 
            ON articles(category)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_articles_word_count 
            ON articles(word_count)
        """)
        
        # Add indexes for title_patterns
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_title_patterns_source_hash 
            ON title_patterns(source_hash)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_title_patterns_target_hash 
            ON title_patterns(target_hash)
        """)
        
        # Add indexes for category_relationships
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_category_relationships_source 
            ON category_relationships(source_category)
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_category_relationships_target 
            ON category_relationships(target_category)
        """)
        
        logging.info("Database schema updated successfully")
        conn.commit()
        return conn, cur
    except psycopg2.OperationalError as e:
        if "database" in str(e) and "does not exist" in str(e):
            # Database doesn't exist, create it
            create_database()
            # Try connecting again
            return setup_tables()
        else:
            raise

@dataclass
class ComparisonResult:
    similarity: float
    method: str

@dataclass
class Article:
    id: int
    paragraphs: List[str]
    order_id: int
    hash: str
    joined_text: str
    length: int
    signature: tuple
    article_number: str = None
    title_hash: str = None
    category: str = None
    word_count: int = None
    first_paragraph: str = None
    title_words: List[str] = None
    article_title: str = None  # Add this line

@dataclass
class ParagraphMatch:
    source_idx: int
    target_idx: int
    similarity: float

def hash_paragraph(text: str) -> str:
    return md5(text.encode()).hexdigest()


def word_overlap(text1, text2):
    words1 = set(text1.split())
    words2 = set(text2.split())
    return len(words1 & words2) / max(len(words1), len(words2))


def compare_articles(source_paragraphs: List[str], target_paragraphs: List[str]) -> Tuple[float, bool]:
    source_text = ' '.join(source_paragraphs).lower().strip()
    target_text = ' '.join(target_paragraphs).lower().strip()
    global levcount
    similarity = ratio(source_text, target_text) * 100
    
    reordered = False
    if similarity > 50:
        source_order = [hash_paragraph(p) for p in source_paragraphs]
        target_order = [hash_paragraph(p) for p in target_paragraphs]
        reordered = source_order != target_order
    levcount += 1
    return similarity, reordered

def process_new_article(article_text: List[str], cur) -> None:
    # Cache paragraphs
    global totalparas
    for idx, paragraph in enumerate(article_text):
        hash_id = hash_paragraph(paragraph)
        cur.execute("""
            INSERT INTO paragraph_cache (hash_id, paragraph_text, word_count, paragraph_index, article_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (hash_id) DO NOTHING
        """, (hash_id, paragraph, len(paragraph.split()), idx, article_id))

def calculate_hash(paragraphs: List[str]) -> str:
    return md5(''.join(paragraphs).encode()).hexdigest()

def get_text_signature(joined_text: str) -> tuple:
    return (len(joined_text), joined_text[:50], joined_text[-50:])


def categorize_article(title: str) -> str:
    category_patterns = {
        "Administrative": ["citation", "commencement", "certification", "transfer", "benefit", 
                         "consent", "incorporation", "enforcement", "appeals", "procedure"],
        
        "Infrastructure": ["construction", "maintenance", "works", "bridge", "tunnel", 
                         "railway", "highway", "street", "road", "access"],
        
        "Rights": ["compulsory acquisition", "rights", "powers", "authority", "stopping up",
                  "closure", "suspension", "restrictions", "prohibition"],
        
        "Environmental": ["trees", "hedgerow", "conservation", "drainage", "water", 
                        "marine", "survey", "investigation", "environmental", "protection"],
        
        "Interpretation": ["interpret", "meaning", "definition"],
        
        "Operation": ["operation", "use", "generating", "operational"]
    }
    
    title_lower = title.lower()
    for category, patterns in category_patterns.items():
        if any(pattern in title_lower for pattern in patterns):
            return category
    return "Other"

def compute_title_signature(title: str) -> Tuple[str, List[str]]:
    """Compute title hash and word list"""
    words = [w.lower() for w in title.split()]
    return md5(' '.join(sorted(words)).encode()).hexdigest(), words

def get_word_count_range(word_count):
    if word_count < 50:
        return word_count * 0.5, word_count * 2.0  # More flexible for short articles
    elif word_count < 200:
        return word_count * 0.6, word_count * 1.6  # Moderately flexible
    else:
        return word_count * 0.7, word_count * 1.3  # Current strict range for longer articles


# def find_candidate_articles(cur, new_article: Article, target_order_id: int) -> List[Article]:
#     # First check for exact matches using hash
#     cur.execute("""
#         SELECT article_id, article_text, title_hash, word_count, article_title, category 
#         FROM articles 
#         WHERE order_id = %s AND hash = %s
#     """, (target_order_id, new_article.hash))
    
#     exact_match = cur.fetchone()
#     if exact_match:
#         article_id, article_text, title_hash, word_count, title, category = exact_match
#         # print("Exact match found")
#         return [Article(
#             id=article_id,
#             paragraphs=article_text,
#             order_id=target_order_id,
#             hash=new_article.hash,
#             joined_text=' '.join(article_text),
#             length=len(' '.join(article_text)),
#             signature=get_text_signature(' '.join(article_text)),
#             title_hash=title_hash,
#             word_count=word_count,
#             article_title=title
#         )]

#     # If no exact match, proceed with other checks
#     min_words, max_words = get_word_count_range(new_article.word_count)
    
#     cur.execute("""
#         SELECT article_id, article_text, title_hash, word_count, article_title, category
#         FROM articles 
#         WHERE order_id = %s
#         AND word_count BETWEEN %s AND %s
#     """, (target_order_id, min_words, max_words))

#     candidates = []
#     for row in cur.fetchall():
#         article_id, article_text, title_hash, word_count, title, category = row

#         # Check category match
#         if category != new_article.category:
#             continue

#         # Check length similarity (within 20%)
#         source_length = len(' '.join(new_article.paragraphs))
#         target_length = len(' '.join(article_text))
#         length_ratio = target_length / source_length if source_length > 0 else 0
        
#         if not (0.8 <= length_ratio <= 1.2):
#             continue

#         # Count identical paragraphs
#         identical_count = sum(1 for p1 in new_article.paragraphs
#                             for p2 in article_text
#                             if p1.lower().strip() == p2.lower().strip())
        
#         # Check if more than half are identical (for articles with 5+ paragraphs)
#         if len(new_article.paragraphs) >= 5:
#             if identical_count > len(new_article.paragraphs) / 2:
#                 candidates.append(Article(
#                     id=article_id,
#                     paragraphs=article_text,
#                     order_id=target_order_id,
#                     hash=calculate_hash(article_text),
#                     joined_text=' '.join(article_text),
#                     length=len(' '.join(article_text)),
#                     signature=get_text_signature(' '.join(article_text)),
#                     title_hash=title_hash,
#                     word_count=word_count,
#                     article_title=title
#                 ))
#                 continue
#         # For articles with fewer paragraphs, keep existing exact match check
#         elif any(p1.lower().strip() == p2.lower().strip()
#                 for p1 in new_article.paragraphs
#                 for p2 in article_text):
#             candidates.append(Article(
#                 id=article_id,
#                 paragraphs=article_text,
#                 order_id=target_order_id,
#                 hash=calculate_hash(article_text),
#                 joined_text=' '.join(article_text),
#                 length=len(' '.join(article_text)),
#                 signature=get_text_signature(' '.join(article_text)),
#                 title_hash=title_hash,
#                 word_count=word_count,
#                 article_title=title
#             ))
#             continue


#         # If no exact match, check word overlap
#         source_words = set(' '.join(new_article.paragraphs).lower().split())
#         target_words = set(' '.join(article_text).lower().split())
#         overlap = len(source_words & target_words) / min(len(source_words), len(target_words))

#         if overlap > 0.8:  # Threshold for word overlap
#             candidates.append(Article(
#                 id=article_id,
#                 paragraphs=article_text,
#                 order_id=target_order_id,
#                 hash=calculate_hash(article_text),
#                 joined_text=' '.join(article_text),
#                 length=len(' '.join(article_text)),
#                 signature=get_text_signature(' '.join(article_text)),
#                 title_hash=title_hash,
#                 word_count=word_count,
#                 article_title=title
#             ))

#     return candidates

def calculate_candidate_score(new_article: Article, candidate: Article) -> float:
    """
    Calculate a priority score for a candidate article based on multiple indicators.
    Higher score = more likely to be a match.
    """
    score = 0.0
    
    # Category match is a strong indicator
    if new_article.category == candidate.category:
        score += 30.0
    
    # Check length similarity
    length_ratio = candidate.length / new_article.length
    if 0.9 <= length_ratio <= 1.1:
        score += 20.0
    elif 0.8 <= length_ratio <= 1.2:
        score += 10.0
    
    # Count identical paragraphs
    identical_count = sum(1 for p1 in new_article.paragraphs
                         for p2 in candidate.paragraphs
                         if p1.lower().strip() == p2.lower().strip())
    
    # High paragraph overlap is a very strong indicator
    if identical_count > len(new_article.paragraphs) / 2:
        score += 40.0
    elif identical_count > 0:
        score += 20.0
    
    # Word overlap check
    source_words = set(' '.join(new_article.paragraphs).lower().split())
    target_words = set(' '.join(candidate.paragraphs).lower().split())
    overlap = len(source_words & target_words) / min(len(source_words), len(target_words))
    
    if overlap > 0.8:
        score += 30.0
    elif overlap > 0.6:
        score += 15.0
    
    return score

def find_candidate_articles(cur, new_article: Article, target_order_id: int) -> List[Tuple[float, Article]]:
    """
    Find and score candidate articles, returning them sorted by likelihood of matching.
    Returns: List of (score, article) tuples sorted by score descending.
    """
    # First check for exact hash matches
    cur.execute("""
        SELECT article_id, article_text, title_hash, word_count, article_title, category 
        FROM articles 
        WHERE order_id = %s AND hash = %s
    """, (target_order_id, new_article.hash))
    
    exact_match = cur.fetchone()
    if exact_match:
        article_id, article_text, title_hash, word_count, title, category = exact_match
        article = Article(
            id=article_id,
            paragraphs=article_text,
            order_id=target_order_id,
            hash=new_article.hash,
            joined_text=' '.join(article_text),
            length=len(' '.join(article_text)),
            signature=get_text_signature(' '.join(article_text)),
            title_hash=title_hash,
            word_count=word_count,
            article_title=title,
            category=category
        )
        return [(100.0, article)]  # Perfect match

    # Get potential candidates within word count range
    min_words, max_words = get_word_count_range(new_article.word_count)
    
    cur.execute("""
        SELECT article_id, article_text, title_hash, word_count, article_title, category
        FROM articles 
        WHERE order_id = %s
        AND word_count BETWEEN %s AND %s
        AND category = %s  -- Prioritize category matches first
    """, (target_order_id, min_words, max_words, new_article.category))

    scored_candidates = []
    for row in cur.fetchall():
        article_id, article_text, title_hash, word_count, title, category = row
        
        candidate = Article(
            id=article_id,
            paragraphs=article_text,
            order_id=target_order_id,
            hash=calculate_hash(article_text),
            joined_text=' '.join(article_text),
            length=len(' '.join(article_text)),
            signature=get_text_signature(' '.join(article_text)),
            title_hash=title_hash,
            word_count=word_count,
            article_title=title,
            category=category
        )
        
        score = calculate_candidate_score(new_article, candidate)
        if score > 0:  # Only include candidates with non-zero scores
            scored_candidates.append((score, candidate))
    
    # Sort by score descending
    return sorted(scored_candidates, key=lambda x: x[0], reverse=True)

levcount=0
total_paragraphs=0
total_db_paragraphs=0

def process_file(file_path: str, conn, cur) -> None:
    start_time = time.time()
    logging.info(f"Processing {file_path}")
    df = parse_xml(file_path)
    logging.info(f"Loaded {len(df)} articles from XML")

    global levcount
    global total_paragraphs
    global total_db_paragraphs

    cur.execute("""
        SELECT o.order_name, SUM(array_length(a.article_text, 1))
        FROM orders o 
        JOIN articles a ON o.order_id = a.order_id
        GROUP BY o.order_name
    """)
    # db_paragraphs = cur.fetchall()
    # total_db_paragraphs = sum(count for _, count in db_paragraphs)
    # logging.info(f"Total paragraphs in database: {total_db_paragraphs}")


    totalparas = 0
    levcount = 0
    # Process order
    order_data = [(
        df.iloc[0]['Order'],
        int(df.iloc[0]['Year']), 
        int(df.iloc[0]['No.'])
    )]
    log_order_name = df.iloc[0]['Order']

    execute_values(cur, """
        INSERT INTO orders (
            order_name, order_year, order_SI_number
        )
        VALUES %s
        ON CONFLICT (order_name) DO UPDATE SET 
            order_year = EXCLUDED.order_year,
            order_SI_number = EXCLUDED.order_SI_number
        RETURNING order_id
    """, order_data)

    result = cur.fetchone()
    order_id = result[0] if result else None

    if not order_id:
        cur.execute("SELECT order_id FROM orders WHERE order_name = %s", (order_name,))
        order_id = cur.fetchone()[0]

    article_data = []
    for _, row in df.iterrows():
        title_hash, title_words = compute_title_signature(row['Title'])
        category = categorize_article(row['Title'])
        word_count = len(' '.join(row['Text']).split())
        first_paragraph = row['Text'][0] if row['Text'] else ''
        hash = calculate_hash(row['Text'])

        article_data.append((
            order_id,
            row['Art'],
            row['Title'],
            row['Text'],
            title_hash,
            title_words,
            word_count,
            first_paragraph,
            category,
            hash
        ))
    # Batch insert articles with metadata
    execute_values(cur, """
        INSERT INTO articles (
            order_id, article_number, article_title, article_text,
            title_hash, title_words, word_count, first_paragraph, category, hash
        )
        VALUES %s
        ON CONFLICT (order_id, article_number) DO UPDATE SET
            article_title = EXCLUDED.article_title,
            article_text = EXCLUDED.article_text,
            title_hash = EXCLUDED.title_hash,
            title_words = EXCLUDED.title_words,
            word_count = EXCLUDED.word_count,
            first_paragraph = EXCLUDED.first_paragraph,
            category = EXCLUDED.category,
            hash = EXCLUDED.hash
        RETURNING article_id, article_text
    """, article_data)
    
    new_articles_raw = cur.fetchall()
    logging.info(f"Found {len(new_articles_raw)} new articles to process")

    if not new_articles_raw:
        logging.info("No new articles to process")
        return

    # Convert to Article objects with precomputed values
    new_articles = []
    for art_id, paragraphs in new_articles_raw:
        try:
            # Get article metadata from database
            cur.execute("""
                SELECT article_number, article_title, title_hash, category, word_count, title_words 
                FROM articles 
                WHERE article_id = %s
            """, (art_id,))
            metadata = cur.fetchone()
            article_number, article_title, title_hash, category, word_count, title_words = metadata
            
            joined_text = ' '.join(paragraphs)
            
            new_articles.append(Article(
                id=art_id,
                paragraphs=paragraphs,
                order_id=order_id,
                hash=calculate_hash(paragraphs),
                joined_text=joined_text,
                length=len(joined_text),
                signature=get_text_signature(joined_text),
                article_number=article_number,
                title_hash=title_hash,
                category=category,
                word_count=word_count,
                first_paragraph=paragraphs[0] if paragraphs else '',
                title_words=title_words
            ))
        except Exception as e:
            logging.error(f"Error processing article {art_id}: {str(e)}")
            continue

    if not new_articles:
        logging.warning("No articles to process after filtering")
        return

    # Get target articles with all needed fields
    cur.execute("""
        SELECT 
            a.article_id, 
            a.article_text, 
            a.order_id, 
            char_length(concat_ws(' ', a.article_text)),
            a.title_hash,
            a.category,
            a.word_count,
            a.title_words,
            o.order_name
        FROM articles a 
        JOIN orders o ON a.order_id = o.order_id 
        WHERE o.order_id != %s
        ORDER BY o.order_id
    """, (order_id,))
    target_articles_raw = cur.fetchall()

    # Group target articles by order_id
    target_articles_by_order = {}
    for t_order_id, group in groupby(target_articles_raw, key=lambda x: x[2]):
        target_articles_by_order[t_order_id] = [
            Article(
                id=art_id,
                paragraphs=text,
                order_id=o_id,
                hash=calculate_hash(text),
                joined_text=' '.join(text),
                length=precomputed_length,
                signature=get_text_signature(' '.join(text)),
                title_hash=t_hash,
                category=cat,
                word_count=w_count,
                first_paragraph=text[0] if text else '',
                title_words=t_words
            )
            for art_id, text, o_id, precomputed_length, t_hash, cat, w_count, t_words, _ in group
        ]
        # logging.debug(f"Number of target articles: {sum(len(articles) for articles in target_articles_by_order.values())}")

    total_paragraphs = sum(len(article.paragraphs) for article in new_articles)

    # Process similarities using new comparison logic
    for new_art in new_articles:
        best_matches = {}  # key: target_order_id, value: (similarity, target_id, reordered)

        for target_order_id, order_articles in target_articles_by_order.items():
            scored_candidates = find_candidate_articles(cur, new_art, target_order_id)
            
            # Process candidates in order of likelihood
            for score, candidate in scored_candidates:
                # Skip if we already found a very high similarity match for this order
                if target_order_id in best_matches and best_matches[target_order_id][0] >= 95:
                    continue
                    
                # Calculate actual similarity
                similarity, reordered = compare_articles(new_art.paragraphs, candidate.paragraphs)
                
                # Update best match if better
                if similarity > (best_matches.get(target_order_id, (0, None, None))[0]):
                    best_matches[target_order_id] = (similarity, candidate.id, reordered)
                    
                # Early termination if we found a very good match
                if similarity >= 95:
                    # logging.info(f"High similarity match found: {similarity:.2f}% - Article {new_art.id} - Order ID {target_order_id}, Article {candidate.id}")
                    break  # Stop processing candidates for this order
            

            # best_candidate = None
            # best_similarity = 0
            # is_reordered = False

            # # logging.debug(f"Source paragraphs: {new_art.paragraphs[:2]}")
            # for candidate in candidates:
            #     # logging.debug(f"Candidate paragraphs: {candidate.paragraphs[:2]}")
            # # for candidate in candidates:
            #     similarity, reordered = compare_articles(new_art.paragraphs, candidate.paragraphs)
            #     # logging.info(f"Raw similarity score: {similarity}")
            #     if similarity > best_similarity:
            #         best_similarity = similarity
            #         best_candidate = candidate
            #         is_reordered = reordered
            #     # logging.info(f"Current best similarity: {best_similarity}")
            #     if best_similarity > 50:
            #         best_matches[target_order_id] = (best_similarity, best_candidate.id, is_reordered)
        # Update article novelty status
        cur.execute("""
            UPDATE articles 
            SET novel = %s 
            WHERE article_id = %s
        """, (not best_matches, new_art.id))

        # Convert best_matches to similarity data for database insertion
        if best_matches:
            similarity_data = []
            for target_order_id, (similarity, target_id, reordered) in best_matches.items():
                similarity_data.append((
                    new_art.id,
                    target_id,
                    target_order_id,
                    similarity,
                    reordered
                ))
                
                # Get target article hash
                cur.execute("SELECT title_hash FROM articles WHERE article_id = %s", (target_id,))
                target_hash = cur.fetchone()[0]
                
                # Update title patterns
                cur.execute("""
                    INSERT INTO title_patterns (source_hash, target_hash, frequency, avg_content_similarity)
                    VALUES (%s, %s, 1, %s)
                    ON CONFLICT (source_hash, target_hash) 
                    DO UPDATE SET 
                        frequency = title_patterns.frequency + 1,
                        avg_content_similarity = 
                            (title_patterns.avg_content_similarity * title_patterns.frequency + %s) 
                            / (title_patterns.frequency + 1)
                """, (new_art.title_hash, target_hash, similarity, similarity))

            # Insert similarities with reordering flag
            execute_values(cur, """
                INSERT INTO similarities (
                    source_article_id, 
                    target_article_id, 
                    target_order_id, 
                    similarity_score,
                    reordered
                )
                VALUES %s
                ON CONFLICT (source_article_id, target_order_id) 
                DO UPDATE SET 
                    target_article_id = EXCLUDED.target_article_id,
                    similarity_score = EXCLUDED.similarity_score,
                    reordered = EXCLUDED.reordered
            """, similarity_data)

    conn.commit()
    end_time = time.time()
    logging.info(f"Completed {log_order_name} in {end_time - start_time:.2f} seconds. A total of {levcount} articles were checked using Levenshtein.")
    # logging.info(f"Completed in {end_time - start_time:.2f} seconds")    
    


def main():
    # Start timing the entire script
    total_start_time = time.time()
    logging.info("Script started")
    
    try:
        # create_database()
        conn, cur = setup_tables()
    
        directory = 'newfolderomg'
        files = sorted(os.listdir(directory), 
                    key=lambda x: (int(x.split('_')[0]), int(x.split('_')[1].split('.')[0])))
        
        for idx, filename in enumerate(files, 1):
            file_path = os.path.join(directory, filename)
            if os.path.isfile(file_path):
                process_file(file_path, conn, cur)
                
        cur.close()
        conn.close()
    finally:
        if 'cur' in locals() and cur is not None:
            cur.close()
        if 'conn' in locals() and conn is not None:
            conn.close()
        
        total_elapsed_time = time.time() - total_start_time
        logging.info(f"Total execution time: {total_elapsed_time:.2f} seconds ({total_elapsed_time/60:.2f} minutes)")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        # level=logging.DEBUG,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[logging.FileHandler('similarity_matcher.log'), logging.StreamHandler()]
    )
    main()