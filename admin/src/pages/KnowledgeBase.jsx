import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import FileUpload from '../components/FileUpload.jsx';
import DocumentList from '../components/DocumentList.jsx';

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDocuments();
      setDocuments(data.documents);
      setTotal(data.total);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleUploaded = (doc) => {
    setDocuments(prev => [doc, ...prev]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document and all its chunks?')) return;
    try {
      await api.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStatusChange = (id, status) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...status } : d));
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const { results } = await api.searchKb(searchQuery, 5);
      setSearchResults(results);
    } catch (err) {
      alert(err.message);
    }
    setSearching(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Knowledge Base</h2>
      
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Upload Document</h3>
        <FileUpload onUploaded={handleUploaded} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Test Retrieval</h3>
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Enter a query to test search..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>
        {searchResults && (
          <div className="mt-4 space-y-3">
            {searchResults.length === 0 && <p className="text-gray-400 text-sm">No results found.</p>}
            {searchResults.map(r => (
              <div key={r.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{r.metadata?.source_file || 'Unknown'}</span>
                  <span className="text-xs font-medium text-indigo-600">{(r.similarity * 100).toFixed(1)}%</span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-3">{r.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Documents ({total})</h3>
          <button onClick={loadDocuments} className="text-sm text-gray-500 hover:text-gray-700">Refresh</button>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
        ) : (
          <DocumentList documents={documents} onDelete={handleDelete} onStatusChange={handleStatusChange} />
        )}
      </div>
    </div>
  );
}
