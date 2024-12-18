import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';

const MainNavigation = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">DCO Article Analysis Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <Link 
                to="/precedent" 
                className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
              >
                <h2 className="text-xl font-semibold mb-2">Find DCO Article Precedent</h2>
                <p className="text-gray-600">Compare articles across different DCOs and find similar precedents.</p>
              </Link>
              
              <Link 
                to="/search" 
                className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
              >
                <h2 className="text-xl font-semibold mb-2">Search</h2>
                <p className="text-gray-600">Search through DCO articles and content.</p>
              </Link>

              <Link 
                to="/article-search" 
                className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
              >
                <h2 className="text-xl font-semibold mb-2">Article Search</h2>
                <p className="text-gray-600">Filter articles by their heading across all DCOs.</p>
              </Link>
              
              <Link 
                to="/compare" 
                className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all"
              >
                <h2 className="text-xl font-semibold mb-2">Compare Text</h2>
                <p className="text-gray-600">Compare specific text passages from DCO articles.</p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MainNavigation;