import React, { useRef, useState } from 'react';
import { api } from '../api.js';

export default function FileUpload({ onUploaded }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const doc = await api.uploadDocument(formData);
      if (onUploaded) onUploaded(doc);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        uploading ? 'border-gray-300 bg-gray-50' : 'border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50'
      }`}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !uploading && fileRef.current?.click()}
      role="button"
      aria-label="Upload document"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !uploading && fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      {uploading ? (
        <p className="text-gray-500">Uploading...</p>
      ) : (
        <>
          <p className="text-gray-700 font-medium">Drop a file or click to upload</p>
          <p className="text-gray-400 text-sm mt-1">PDF, TXT, MD — max 10MB</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
