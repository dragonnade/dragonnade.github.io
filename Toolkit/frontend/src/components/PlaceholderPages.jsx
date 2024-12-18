import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export const SearchPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Search DCO Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">This feature is coming soon.</p>
            <Link 
              to="/" 
              className="text-blue-500 hover:text-blue-700 transition-colors"
            >
              ← Back to home
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const ComparePage = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Compare DCO Text</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">This feature is coming soon.</p>
            <Link 
              to="/" 
              className="text-blue-500 hover:text-blue-700 transition-colors"
            >
              ← Back to home
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};