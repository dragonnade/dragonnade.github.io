import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Calendar } from 'lucide-react';

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [filters, setFilters] = useState({
    lawFirm: '',
    promoter: '',
    applicantType: '',
    projectType: ''
  });
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          dateRange,
          filters
        }),
      });
      
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error performing search:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Advanced Search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search Input */}
            <div className="space-y-2">
              <Input
                placeholder="Enter your search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
              
              {/* Search Syntax Guide */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="syntax-guide">
                  <AccordionTrigger>Search Syntax Guide</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 text-sm text-gray-600">
                      <div>
                        <h4 className="font-medium text-gray-900">Basic Search</h4>
                        <p>Simply type words to find articles containing all those words.</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Exact Phrases</h4>
                        <p>Use quotes for exact matches: "environmental impact"</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Required Terms</h4>
                        <p>Use + before a term to require it: +railway construction</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Excluded Terms</h4>
                        <p>Use - before a term to exclude it: construction -temporary</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Combinations</h4>
                        <p>Mix and match: "flood risk" +assessment -preliminary</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Filters Section */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                      className="pl-10"
                    />
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                  <div className="relative">
                    <Input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                      className="pl-10"
                    />
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Future Filters (Currently Disabled) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Law Firm (Coming Soon)</label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Select law firm..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Coming Soon</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Promoter (Coming Soon)</label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Select promoter..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Coming Soon</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Applicant Type (Coming Soon)</label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Select applicant type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="statutory">Statutory Undertaker</SelectItem>
                    <SelectItem value="private">Private Applicant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={handleSearch} 
              disabled={isLoading || !searchQuery.trim()} 
              className="w-full"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </Button>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <ScrollArea className="h-[400px] rounded-md border p-4">
                <div className="space-y-4">
                  {searchResults.map((result, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-2">
                        <div className="font-medium">
                          <a 
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {result.order_name} - Article {result.article_number}
                          </a>
                        </div>
                        <div className="text-sm text-gray-500">{result.article_title}</div>
                        <div className="text-sm">{result.excerpt}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SearchPage;
