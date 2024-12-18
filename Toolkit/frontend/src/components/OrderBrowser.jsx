import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, MessageSquare, Search } from 'lucide-react';
import RedlineComparison from './RedlineComparison';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const [commentDialogs, setCommentDialogs] = useState({});
  const [commentForms, setCommentForms] = useState({});

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_id, order_name, order_year')
        .order('order_id', { ascending: false })

      if (error) throw error

      // Group by year as before
      const grouped = data.reduce((acc, order) => {
        const year = new Date(order.order_year, 0).getFullYear()
        if (!acc[year]) {
          acc[year] = {
            year,
            orders: []
          }
        }
        acc[year].orders.push({
          id: order.order_id,
          name: order.order_name
        })
        return acc
      }, {})

      setOrders(Object.values(grouped))
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  const fetchArticles = async (orderId) => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          article_id,
          article_number,
          article_title,
          category,
          word_count,
          first_paragraph
        `)
        .eq('order_id', orderId)
        .order('article_id', { ascending: true })  // Sort by article_id instead
  
      if (error) throw error
      setArticles(data)
    } catch (error) {
      console.error('Error fetching articles:', error)
    }
  }

  const fetchSimilarities = async (articleId) => {
    try {
      const { data, error } = await supabase
        .from('similarities')
        .select(`
          id,
          similarity_score,
          target_articles:articles!target_article_id (
            article_number,
            article_title,
            first_paragraph,
            category,
            word_count,
            url
          ),
          orders!target_order_id (
            order_name,
            order_id
          ),
          article_comments (
            comment,
            user_name
          )
        `)
        .eq('source_article_id', articleId);
  
      if (error) throw error;
  
      const transformedData = data.map(item => ({
        similarity_id: item.id,
        similarity: item.similarity_score,
        ...item.target_articles,
        order_name: item.orders.order_name,
        order_id: item.orders.order_id,
        comment: item.article_comments?.[0]?.comment || null,
        user_name: item.article_comments?.[0]?.user_name || null
      }));
  
      setSimilarities(transformedData);
    } catch (error) {
      console.error('Error fetching similarities:', error);
    }
  };

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  const handleCommentSubmit = async (similarityId) => {
    try {
      const formData = commentForms[similarityId];
      if (!formData?.userName?.trim() || !formData?.comment?.trim()) {
        alert("Please provide both your name and a comment");
        return;
      }
  
      const { error } = await supabase
        .from('article_comments')
        .upsert({
          similarity_id: similarityId,
          user_name: formData.userName.trim(),
          comment: formData.comment.trim()
        }, {
          onConflict: 'similarity_id'
        });
  
      if (error) throw error;
  
      // Close dialog and refresh similarities
      setCommentDialogs(prev => ({
        ...prev,
        [similarityId]: false
      }));
      
      // Refresh similarities to show new comment
      if (selectedArticle) {
        fetchSimilarities(selectedArticle);
      }
  
    } catch (error) {
      console.error('Error saving comment:', error);
      alert('Failed to save comment. Please try again.');
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
      setSelectedComparisonArticles(new Set());
    }
  }, [selectedArticle]);

  const handleArticleClick = (articleId, event) => {
    setSelectedArticle(articleId.toString());
  };

  const handleSimilarArticleClick = (article, event) => {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      setSelectedComparisonArticles(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(article.similarity_id)) {
          newSelection.delete(article.similarity_id);
        } else if (newSelection.size < 5) {
          newSelection.add(article.similarity_id);
        }
        return newSelection;
      });
    } else {
      // Single select without Ctrl/Cmd
      setSelectedComparisonArticles(new Set([article.similarity_id]));
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

  const filteredOrders = orders.map(yearGroup => ({
    ...yearGroup,
    orders: yearGroup.orders.filter(order => {
      const searchTerm = orderSearch.toLowerCase();
      const orderName = order.name.toLowerCase().replace(/^the\s+/, '');
      return orderName.includes(searchTerm);
    })
  })).filter(yearGroup => yearGroup.orders.length > 0);

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
                        onClick={(e) => handleArticleClick(article.article_id, e)}
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

            {/* Comparison Section */}
            {showComparison && (
              <div className="border rounded-lg p-4 bg-white">
                <RedlineComparison
                  baseArticle={articles.find(a => a.article_id.toString() === selectedArticle)}
                  comparisonArticles={similarities.filter(s => 
                    selectedComparisonArticles.has(s.similarity_id)
                  )}
                  onClose={() => {
                    setShowComparison(false);
                    setSelectedComparisonArticles(new Set());
                  }}
                />
              </div>
            )}

            {/* Similarities Section */}
            {selectedArticle && similarities.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Similar Articles ({similarities.length})</h3>
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
                    {selectedComparisonArticles.size > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          console.log("Compare button clicked");
                          const baseArticleData = articles.find(a => a.article_id.toString() === selectedArticle);
                          console.log("Base article data:", baseArticleData);
                          const comparisonData = similarities.filter(s => 
                            selectedComparisonArticles.has(s.similarity_id)
                          );
                          console.log("Comparison articles data:", comparisonData);
                          if (baseArticleData && comparisonData.length > 0) {
                            setShowComparison(true);
                          } else {
                            console.error("Missing article data", { baseArticleData, comparisonData });
                          }
                        }}
                      >
                        Compare Selected ({selectedComparisonArticles.size})
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                {sortedSimilarities.map(item => (
                  <Card 
                    key={item.similarity_id} 
                    className={`p-4 cursor-pointer ${
                      selectedComparisonArticles.has(item.similarity_id)
                        ? 'border-blue-500'
                        : ''
                    }`}
                    onClick={(e) => handleSimilarArticleClick(item, e)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          <a 
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={(e) => e.stopPropagation()}
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
                        <Dialog 
                          open={commentDialogs[item.similarity_id]}
                          onOpenChange={(open) => {
                            setCommentDialogs(prev => ({
                              ...prev,
                              [item.similarity_id]: open
                            }));
                            if (open) {
                              setCommentForms(prev => ({
                                ...prev,
                                [item.similarity_id]: {
                                  userName: item.user_name || '',
                                  comment: item.comment || ''
                                }
                              }));
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Add Comment</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2">
                                <Label htmlFor="name">Your Name</Label>
                                <Input
                                  id="name"
                                  value={commentForms[item.similarity_id]?.userName || ''}
                                  onChange={(e) => setCommentForms(prev => ({
                                    ...prev,
                                    [item.similarity_id]: {
                                      ...prev[item.similarity_id],
                                      userName: e.target.value
                                    }
                                  }))}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="comment">Comment</Label>
                                <Textarea
                                  id="comment"
                                  value={commentForms[item.similarity_id]?.comment || ''}
                                  onChange={(e) => setCommentForms(prev => ({
                                    ...prev,
                                    [item.similarity_id]: {
                                      ...prev[item.similarity_id],
                                      comment: e.target.value
                                    }
                                  }))}
                                  className="col-span-3"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-3">
                              <Button
                                variant="outline"
                                onClick={() => setCommentDialogs(prev => ({
                                  ...prev,
                                  [item.similarity_id]: false
                                }))}
                              >
                                Cancel
                              </Button>
                              <Button 
                                onClick={() => handleCommentSubmit(item.similarity_id)}
                              >
                                Save Comment
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    {item.comment && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-md">
                        <div className="text-sm font-medium text-gray-500">
                          Comment by {item.user_name}:
                        </div>
                        <div className="mt-1 text-sm">
                          {item.comment}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}

                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OrderBrowser;