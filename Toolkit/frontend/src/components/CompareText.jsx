import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CompareText = () => {
  const [inputTitle, setInputTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [category, setCategory] = useState('');
  const [similarities, setSimilarities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'similarity', direction: 'desc' });
  const [filters, setFilters] = useState({
    category: '',
    minSimilarity: 0,
    minWordCount: 0,
    maxWordCount: Infinity
  });

  const categories = [
    'Administrative',
    'Infrastructure',
    'Rights',
    'Environmental',
    'Interpretation',
    'Operation',
    'Other'
  ];

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: inputTitle,
          text: inputText,
          category: category
        }),
      });
      
      if (!response.ok) throw new Error('Failed to compare text');
      const data = await response.json();
      setSimilarities(data);
    } catch (error) {
      console.error('Error comparing text:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  const sortedSimilarities = similarities
    .filter(item => {
      return (
        (!filters.category || item.category === filters.category) &&
        (item.similarity >= filters.minSimilarity) &&
        (!filters.yearLimit || parseInt(item.year) >= new Date().getFullYear() - filters.yearLimit) &&
        (item.word_count >= filters.minWordCount) &&
        (item.word_count <= filters.maxWordCount)
      );
    })
    .sort((a, b) => {
      const direction = sortConfig.direction === 'desc' ? -1 : 1;
      if (sortConfig.key === 'similarity') {
        return direction * (a.similarity - b.similarity);
      }
      if (sortConfig.key === 'date') {
        return direction * (a.order_id - b.order_id);
      }
      return 0;
    });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Compare Text</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title (Optional)</label>
                <Input
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  placeholder="Enter a title..."
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Category (Optional)</label>
                <Select onValueChange={setCategory} value={category}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Text</label>
                <Textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Enter the text to compare..."
                  className="mt-1 min-h-[200px]"
                />
              </div>

              <Button 
                onClick={handleSubmit} 
                disabled={!inputText.trim() || isLoading}
                className="w-full"
              >
                {isLoading ? 'Comparing... This may take up to 60 seconds...' : 'Compare Text'}
              </Button>
            </div>

            {similarities.length > 0 ? (
              <div className="space-y-4 mt-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Similar Articles ({similarities.length})</h3>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSort('similarity')}
                    >
                      Similarity <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSort('date')}
                    >
                      Date <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
                


                <div className="space-y-4">
                {sortedSimilarities.map(item => (
                  <Card key={`${item.order_id}-${item.article_number}`} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          <a 
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {item.order_name} - Article {item.article_number}
                          </a>
                        </div>
                        <div className="text-sm text-gray-500">{item.article_title}</div>
                        <div className="mt-2 text-sm">{item.first_paragraph}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">
                          {(item.similarity).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                </div>
              </div>
            ) : inputText.trim() && !isLoading && (
                <div className="mt-8 text-center text-gray-600">
                  No similar articles found
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompareText;