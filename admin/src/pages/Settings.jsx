import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getConfig().then(c => setConfig(c)).catch(() => {});
  }, []);

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateConfig({
        botName: config.bot_name,
        systemPrompt: config.system_prompt,
        welcomeMessage: config.welcome_message,
        model: config.model,
        temperature: parseFloat(config.temperature),
        maxTokens: parseInt(config.max_tokens),
        similarityThreshold: parseFloat(config.similarity_threshold),
      });
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  if (!config) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Bot Settings</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <form onSubmit={handleSave} className="space-y-5">
          <Field label="Bot Name" id="bot_name">
            <input
              type="text"
              id="bot_name"
              value={config.bot_name || ''}
              onChange={e => handleChange('bot_name', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </Field>

          <Field label="System Prompt" id="system_prompt">
            <textarea
              id="system_prompt"
              rows={5}
              value={config.system_prompt || ''}
              onChange={e => handleChange('system_prompt', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
            />
          </Field>

          <Field label="Welcome Message" id="welcome_message">
            <input
              type="text"
              id="welcome_message"
              value={config.welcome_message || ''}
              onChange={e => handleChange('welcome_message', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </Field>

          <Field label="Model" id="model">
            <select
              id="model"
              value={config.model || 'gpt-4o-mini'}
              onChange={e => handleChange('model', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
            </select>
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Temperature" id="temperature">
              <input
                type="number"
                id="temperature"
                min="0" max="2" step="0.1"
                value={config.temperature ?? 0.7}
                onChange={e => handleChange('temperature', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </Field>
            <Field label="Max Tokens" id="max_tokens">
              <input
                type="number"
                id="max_tokens"
                min="1" max="4096"
                value={config.max_tokens ?? 500}
                onChange={e => handleChange('max_tokens', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </Field>
            <Field label="Similarity Threshold" id="similarity_threshold">
              <input
                type="number"
                id="similarity_threshold"
                min="0" max="1" step="0.05"
                value={config.similarity_threshold ?? 0.7}
                onChange={e => handleChange('similarity_threshold', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </Field>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {saved && <p className="text-green-600 text-sm">Settings saved!</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
