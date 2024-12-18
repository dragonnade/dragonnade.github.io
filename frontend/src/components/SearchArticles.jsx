import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const truncateToWord = (text, targetLength) => {
  if (!text || text.length <= targetLength) return text;
  const truncated = text.substr(0, targetLength).split(' ');
  truncated.pop();
  return truncated.join(' ') + '...';
};

const SearchArticles = () => {
  const [articles, setArticles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArticles, setSelectedArticles] = useState(new Set());
  const [exactMatch, setExactMatch] = useState(false);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/article-titles');
        if (!response.ok) throw new Error('Failed to fetch articles');
        const data = await response.json();
        setArticles(data);
      } catch (error) {
        console.error('Error fetching articles:', error);
      }
    };
    fetchArticles();
  }, []);

  const handleArticleClick = (articleId, event) => {
    setSelectedArticles(prev => {
      const newSelection = new Set(prev);
      if (event.ctrlKey) {
        if (newSelection.has(articleId)) {
          newSelection.delete(articleId);
        } else {
          newSelection.add(articleId);
        }
      } else {
        newSelection.clear();
        newSelection.add(articleId);
      }
      return newSelection;
    });
  };

  const filteredArticles = articles.filter(article => {
    if (!searchTerm) return true;
    
    const title = article.article_title.toLowerCase();
    const search = searchTerm.toLowerCase();

    if (exactMatch) {
      return title.includes(search);
    } else {
      // Split search terms and check if all words appear in any order
      const searchWords = search.split(' ').filter(word => word.length > 0);
      return searchWords.every(word => title.includes(word));
    }
  });

  const groupedArticles = filteredArticles.reduce((acc, article) => {
    const year = article.order_year;
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(article);
    return acc;
  }, {});

  const sortedYears = Object.keys(groupedArticles).sort((a, b) => b - a);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Search Articles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <Input
                placeholder="Search article titles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="exact-match" 
                  checked={exactMatch} 
                  onCheckedChange={setExactMatch}
                />
                <Label htmlFor="exact-match">
                  Exact phrase match (otherwise searches for all words in any order)
                </Label>
              </div>
            </div>
            <ScrollArea className="h-[600px] rounded-md border p-4">
              <div className="space-y-6">
                {sortedYears.map(year => (
                  <div key={year} className="space-y-2">
                    <h3 className="text-lg font-semibold sticky top-0 bg-white py-2 z-10">
                      {year}
                    </h3>
                    {groupedArticles[year].map(article => (
                      <div
                        key={article.article_id}
                        className={`p-3 rounded-lg cursor-pointer ${
                          selectedArticles.has(article.article_id)
                            ? 'bg-blue-100 hover:bg-blue-200'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <div className="font-medium">
                          <a 
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={e => e.stopPropagation()} // Prevent the selection handler from firing
                          >
                            Article {article.article_number} - {article.article_title}
                          </a>
                        </div>
                        <div className="text-lg text-gray-500 mt-1">
                          {article.order_name}
                        </div>
                        <div className="mt-2 text-sm text-gray-600">
                          {truncateToWord(article.first_paragraph, 100)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="text-sm text-gray-500">
              {selectedArticles.size} article{selectedArticles.size !== 1 ? 's' : ''} selected
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SearchArticles;