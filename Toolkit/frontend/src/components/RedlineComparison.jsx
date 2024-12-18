import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const extractArticleText = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Find the article container
  const articleSection = doc.querySelector('[id^="article-"]');
  if (!articleSection) {
    console.error('No article section found');
    return null;
  }

  // Extract the article title and number
  const heading = articleSection.querySelector('.heading');
  const number = articleSection.querySelector('.num');
  let text = '';
  
  // Add the article title and number
  if (heading && number) {
    text += `${number.textContent} ${heading.textContent}\n\n`;
  }

  // Function to process a paragraph section
  const processParagraph = (para) => {
    let paraText = '';
    
    // Get paragraph number if present
    const paraNum = para.querySelector('.num');
    if (paraNum) {
      paraText += paraNum.textContent + ' ';
    }

    // Get intro text if present
    const intro = para.querySelector('.intro');
    if (intro) {
      paraText += intro.textContent.trim() + '\n';
    }

    // Get all content sections
    const contents = para.querySelectorAll('.content');
    contents.forEach(content => {
      // Get the parent level element to check for sub-paragraph lettering
      const level = content.closest('.level');
      if (level) {
        const levelNum = level.querySelector('.num');
        if (levelNum) {
          paraText += levelNum.textContent + ' ';
        }
      }
      paraText += content.textContent.trim() + '\n';
    });

    return paraText;
  };

  // Process all paragraphs
  const paragraphs = articleSection.querySelectorAll('.paragraph');
  paragraphs.forEach(para => {
    text += processParagraph(para) + '\n';
  });

  return text;
};

const RedlineComparison = ({ baseArticle, comparisonArticles, onClose }) => {
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const compareArticles = async () => {
      setLoading(true);
      
      if (!baseArticle?.url) {
        setError('Base article URL is missing');
        setLoading(false);
        return;
      }
  
      if (!comparisonArticles?.length) {
        setError('No comparison articles provided');
        setLoading(false);
        return;
      }
  
      try {
        console.log('Starting comparison with:', {
          baseArticle: baseArticle,
          comparisonArticles: comparisonArticles
        });
  
        // Fetch and parse articles 
        const baseResponse = await fetch(`${baseArticle.url}/data.html`);
        if (!baseResponse.ok) throw new Error('Failed to fetch base article');
        const baseHtml = await baseResponse.text();
        console.log('Base article HTML received, parsing...');
        const baseText = extractArticleText(baseHtml);
  
        if (!baseText) {
          throw new Error('Could not extract text from base article');
        }
  
        // Process comparisons
        const results = await Promise.all(
          comparisonArticles.map(async (article) => {
            console.log('Processing comparison article:', article.article_number);
            
            const compResponse = await fetch(`${article.url}/data.html`);
            if (!compResponse.ok) {
              throw new Error(`Failed to fetch comparison article ${article.article_number}`);
            }
            
            const compHtml = await compResponse.text();
            console.log('Comparison article HTML received, parsing...');
            const compText = extractArticleText(compHtml);
  
            if (!compText) {
              throw new Error(`Could not extract text from comparison article ${article.article_number}`);
            }
  
            console.log('Making comparison API request');
            const compareResponse = await fetch('http://localhost:3000/api/compare-articles', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                baseText: baseText,        // Later text (what it changed to)
                comparisonText: compText,  // Earlier text (what it changed from)
              }),
            });
  
            if (!compareResponse.ok) {
              const errorData = await compareResponse.json();
              throw new Error(errorData.error || 'Comparison failed');
            }
  
            const result = await compareResponse.json();
            return {
              article,
              html: result.html
            };
          })
        );
  
        setComparisons(results);
      } catch (err) {
        console.error('Error in comparison:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    compareArticles();
  }, [baseArticle, comparisonArticles]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center">Loading comparison...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-red-500">Error: {error}</div>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Article Comparison</h3>
          <Button onClick={onClose} variant="outline">Close</Button>
        </div>
        
        <ScrollArea className="h-[600px]">
          <div className="space-y-6">
            {comparisons.map(({ article, html }, index) => (
              <div key={article.similarity_id} className="border rounded-lg p-4">
                <div className="mb-4 text-sm text-gray-600">
                  Showing changes from: {article.order_name} - Article {article.article_number}
                </div>
                <div 
                  className="comparison-content" 
                  dangerouslySetInnerHTML={{ 
                    __html: html 
                  }}
                  style={{
                    padding: '1rem',
                    lineHeight: '1.5',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default RedlineComparison;