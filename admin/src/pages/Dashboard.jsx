import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard() {
  const [docs, setDocs] = useState(null);
  const [keys, setKeys] = useState(null);

  useEffect(() => {
    api.getDocuments(5).then(d => setDocs(d)).catch(() => {});
    api.getKeys().then(k => setKeys(k)).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Documents" value={docs?.total ?? '—'} color="bg-blue-50 text-blue-700" />
        <StatCard label="Active API Keys" value={keys?.filter(k => k.is_active)?.length ?? '—'} color="bg-green-50 text-green-700" />
        <StatCard label="Total Chunks" value={docs?.documents?.reduce((s, d) => s + (d.chunkCount || 0), 0) ?? '—'} color="bg-purple-50 text-purple-700" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Recent Documents</h3>
        {docs?.documents?.length === 0 && <p className="text-gray-400 text-sm">No documents yet.</p>}
        {docs?.documents?.map(doc => (
          <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-700">{doc.filename}</span>
            <span className={`text-xs px-2 py-1 rounded-full ${
              doc.status === 'processed' ? 'bg-green-50 text-green-600' :
              doc.status === 'error' ? 'bg-red-50 text-red-600' :
              'bg-yellow-50 text-yellow-600'
            }`}>{doc.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`${color} rounded-xl p-6`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium mt-1 opacity-80">{label}</p>
    </div>
  );
}
