import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainNavigation from './components/MainNavigation';
import OrderBrowser from './components/OrderBrowser';
import { SearchPage } from './components/PlaceholderPages';
import CompareText from './components/CompareText'
import SearchArticles from './components/SearchArticles'

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainNavigation />} />
        <Route path="/precedent" element={<OrderBrowser />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/compare" element={<CompareText />} />
        <Route path="/article-search" element={<SearchArticles />} />
      </Routes>
    </Router>
  );
};

export default App;