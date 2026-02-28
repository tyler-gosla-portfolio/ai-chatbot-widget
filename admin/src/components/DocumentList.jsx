import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const STATUS_COLORS = {
  queued: 'text-yellow-600 bg-yellow-50',
  processing: 'text-blue-600 bg-blue-50',
  processed: 'text-green-600 bg-green-50',
  error: 'text-red-600 bg-red-50',
};

function DocumentRow({ doc, onDelete, onStatusChange }) {
  useEffect(() => {
    if (doc.status === 'queued' || doc.status === 'processing') {
      const interval = setInterval(async () => {
        try {
          const status = await api.getDocumentStatus(doc.id);
          if (status.status !== doc.status) {
            onStatusChange(doc.id, status);
          }
          if (status.status === 'processed' || status.status === 'error') {
            clearInterval(interval);
          }
        } catch {}
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [doc.status, doc.id, onStatusChange]);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4 text-sm text-gray-900 font-medium">{doc.filename}</td>
      <td className="py-3 px-4">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[doc.status] || 'text-gray-600 bg-gray-50'}`}>
          {doc.status}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-500">{doc.chunkCount || 0} chunks</td>
      <td className="py-3 px-4 text-sm text-gray-400">
        {new Date(doc.createdAt).toLocaleDateString()}
      </td>
      <td className="py-3 px-4">
        <button
          onClick={() => onDelete(doc.id)}
          className="text-sm text-red-500 hover:text-red-700 transition-colors"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export default function DocumentList({ documents, onDelete, onStatusChange }) {
  if (!documents || documents.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No documents uploaded yet.</p>;
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="text-left border-b border-gray-200">
          <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">File</th>
          <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
          <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Chunks</th>
          <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
          <th className="py-2 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
        </tr>
      </thead>
      <tbody>
        {documents.map(doc => (
          <DocumentRow key={doc.id} doc={doc} onDelete={onDelete} onStatusChange={onStatusChange} />
        ))}
      </tbody>
    </table>
  );
}
