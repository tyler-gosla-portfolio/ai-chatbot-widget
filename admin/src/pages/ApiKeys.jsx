import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newOrigins, setNewOrigins] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);

  useEffect(() => {
    api.getKeys().then(k => { setKeys(k); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const allowedOrigins = newOrigins.trim()
        ? newOrigins.split(',').map(o => o.trim()).filter(Boolean)
        : [];
      const key = await api.createKey(newKeyName.trim(), allowedOrigins);
      setCreatedKey(key.apiKey);
      setKeys(prev => [{ ...key, is_active: 1 }, ...prev]);
      setNewKeyName('');
      setNewOrigins('');
    } catch (err) {
      alert(err.message);
    }
    setCreating(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await api.deleteKey(id);
      setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: 0 } : k));
    } catch (err) { alert(err.message); }
  };

  const handleRotate = async (id) => {
    if (!confirm('Rotate this key? The old key will stop working immediately.')) return;
    try {
      const result = await api.rotateKey(id);
      setCreatedKey(result.apiKey);
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">API Keys</h2>
      
      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-green-700 mb-1">API Key Created — Copy it now, it won't be shown again:</p>
          <code className="text-sm font-mono text-green-900 break-all">{createdKey}</code>
          <button onClick={() => setCreatedKey(null)} className="ml-4 text-xs text-green-600 hover:text-green-800">Dismiss</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Create New Key</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production Website)"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <input
            type="text"
            value={newOrigins}
            onChange={e => setNewOrigins(e.target.value)}
            placeholder="Allowed origins (comma-separated, e.g. https://example.com)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Key'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">All Keys</h3>
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-4">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No API keys yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Last Used</th>
                <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(key => (
                <tr key={key.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900 font-medium">{key.name}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${key.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {key.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">{new Date(key.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-sm text-gray-400">{key.last_used ? new Date(key.last_used).toLocaleDateString() : 'Never'}</td>
                  <td className="py-3 px-4 flex gap-3">
                    {key.is_active && (
                      <>
                        <button onClick={() => handleRotate(key.id)} className="text-sm text-blue-500 hover:text-blue-700">Rotate</button>
                        <button onClick={() => handleDelete(key.id)} className="text-sm text-red-500 hover:text-red-700">Revoke</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
