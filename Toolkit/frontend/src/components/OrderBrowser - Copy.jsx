import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, MessageSquare, Search } from 'lucide-react';
import RedlineComparison from './RedlineComparison';


const OrderBrowser = () => {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderName, setSelectedOrderName] = useState("");
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [similarities, setSimilarities] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'similarity', direction: 'desc' });
  const [orderSearch, setOrderSearch] = useState('');
  const [articleSearch, setArticleSearch] = useState('');
  const [comments, setComments] = useState({});
  const [selectedComparisonArticles, setSelectedComparisonArticles] = useState(new Set());
  const [showComparison, setShowComparison] = useState(false);

  // Fetch functions remain the same
  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/orders');
      if (!response.ok) throw new Error('Failed to fetch orders');
      const data = await response.json();
      setOrders(data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchArticles = async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/articles/${orderId}`);
      if (!response.ok) throw new Error('Failed to fetch articles');
      const data = await response.json();
      setArticles(data);
    } catch (error) {
      console.error('Error fetching articles:', error);
    }
  };

  const fetchSimilarities = async (articleId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/similarities/${articleId}`);
      if (!response.ok) throw new Error('Failed to fetch similarities');
      const data = await response.json();
      setSimilarities(data);
    } catch (error) {
      console.error('Error fetching similarities:', error);
    }
  };

  const sortedSimilarities = similarities
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

  const handleArticleClick = (article, event) => {
    if (event.ctrlKey || event.metaKey) {
      setSelectedComparisonArticles(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(article.article_id)) {
          newSelection.delete(article.article_id);
        } else if (newSelection.size < 5) {
          newSelection.add(article.article_id);
        }
        return newSelection;
      });
    } else {
      setSelectedArticle(article.article_id.toString());
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (selectedOrder) {
      fetchArticles(selectedOrder);
      const orderData = orders.flatMap(y => y.orders).find(o => o.id === parseInt(selectedOrder));
      if (orderData) {
        setSelectedOrderName(orderData.name);
      }
    }
  }, [selectedOrder]);

  useEffect(() => {
    if (selectedArticle) {
      fetchSimilarities(selectedArticle);
    }
  }, [selectedArticle]);

  // Filter orders based on search
  const filteredOrders = orders.map(yearGroup => ({
    ...yearGroup,
    orders: yearGroup.orders.filter(order => {
      const searchTerm = orderSearch.toLowerCase();
      const orderName = order.name.toLowerCase().replace(/^the\s+/, '');
      return orderName.includes(searchTerm);
    })
  })).filter(yearGroup => yearGroup.orders.length > 0);

  // Filter articles based on search
  const filteredArticles = articles.filter(article => {
    const searchTerm = articleSearch.toLowerCase();
    return (
      article.article_title?.toLowerCase().includes(searchTerm) ||
      article.article_number?.toString().includes(searchTerm)
    );
  });

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-50">
      <div className="w-full max-w-3xl mx-auto space-y-6">
        <Card className="shadow-md">
          <CardHeader className="border-b">
            <CardTitle>Order Browser</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-4">
            {/* Order Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Select Order</label>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search orders..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="border rounded-md max-h-60 overflow-y-auto bg-white">
                  {filteredOrders.map(yearGroup => (
                    <div key={yearGroup.year}>
                      <div className="sticky top-0 bg-gray-100 px-3 py-1.5 text-sm font-bold border-b">
                        {yearGroup.year}
                      </div>
                      {yearGroup.orders.map(order => (
                        <div
                          key={order.id}
                          onClick={() => setSelectedOrder(order.id.toString())}
                          className={`px-3 py-2 cursor-pointer transition-colors ${
                            selectedOrder === order.id.toString()
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {order.name}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Article Selection */}
            {selectedOrder && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Select Article
                  <span className="text-sm text-gray-500 ml-2">
                    ({articles.length} articles)
                  </span>
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search articles..."
                      value={articleSearch}
                      onChange={(e) => setArticleSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <div className="border rounded-md max-h-60 overflow-y-auto bg-white">
                    {filteredArticles.map(article => (
                      <div
                        key={article.article_id}
                        onClick={() => setSelectedArticle(article.article_id.toString())}
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          selectedArticle === article.article_id.toString()
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-mono text-gray-500">{article.article_number}</span>
                        <span className="mx-2">-</span>
                        <span>{article.article_title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

              {selectedArticle && similarities.length > 0 && (
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">
                    Similar Articles ({similarities.length})
                  </h3>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedComparisonArticles.size === 0}
                      onClick={() => setShowComparison(true)}
                    >
                      Show Redline Comparison ({selectedComparisonArticles.size})
                    </Button>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSort('similarity')}
                      className="hover:bg-gray-100"
                    >
                      Similarity <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSort('date')}
                      className="hover:bg-gray-100"
                    >
                      Date <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {sortedSimilarities.map(item => (
                    <Card key={item.similarity_id} className="p-4">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newComments = { ...comments };
                              newComments[item.similarity_id] = newComments[item.similarity_id] || '';
                              setComments(newComments);
                            }}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {comments[item.similarity_id] !== undefined && (
                        <div className="mt-4">
                          <Input
                            value={comments[item.similarity_id]}
                            onChange={(e) => {
                              const newComments = { ...comments };
                              newComments[item.similarity_id] = e.target.value;
                              setComments(newComments);
                            }}
                            placeholder="Add a comment..."
                          />
                        </div>
                      )}
                    </Card>
                  ))}
                </div>

                {showComparison && (
                  <RedlineComparison
                    baseArticle={similarities.find(s => s.article_id === selectedArticle)}
                    comparisonArticles={similarities.filter(s => 
                      selectedComparisonArticles.has(s.article_id)
                    )}
                    onClose={() => {
                      setShowComparison(false);
                      setSelectedComparisonArticles(new Set());
                    }}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OrderBrowser;