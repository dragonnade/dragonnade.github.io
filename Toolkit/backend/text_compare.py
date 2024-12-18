from Levenshtein import ratio

def compare_texts(input_text, target_texts):
    """
    Compare input text with a list of target texts.
    Returns similarity score and whether text was reordered.
    """
    source_paragraphs = input_text.split('\n\n')
    similarity, reordered = compare_articles(source_paragraphs, target_texts)
    return similarity, reordered

def compare_articles(source_paragraphs, target_paragraphs):
    """
    Compare two articles by their paragraphs.
    Returns (similarity_score, is_reordered).
    """
    source_text = ' '.join(source_paragraphs).lower().strip()
    target_text = ' '.join(target_paragraphs).lower().strip()
    
    similarity = ratio(source_text, target_text) * 100
    
    reordered = False
    if similarity > 50:
        source_order = [hash_paragraph(p) for p in source_paragraphs]
        target_order = [hash_paragraph(p) for p in target_paragraphs]
        reordered = source_order != target_order
        
    return similarity, reordered

def hash_paragraph(text):
    """Generate a hash for a paragraph of text."""
    from hashlib import md5
    return md5(text.encode()).hexdigest()

# If run directly, provide a simple CLI interface
if __name__ == "__main__":
    import sys
    import json
    
    # Read input from stdin (allows larger texts than command line args)
    input_data = json.loads(sys.stdin.read())
    result = compare_texts(input_data['text'], input_data['target_texts'])
    print(json.dumps(result))