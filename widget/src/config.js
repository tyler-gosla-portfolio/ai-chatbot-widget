export function parseConfig(script) {
  if (!script) {
    script = document.currentScript || document.querySelector('script[data-api-key]');
  }
  return {
    apiKey: script?.dataset.apiKey || '',
    apiUrl: script?.dataset.apiUrl || window.location.origin,
    themeColor: script?.dataset.themeColor || '#4F46E5',
    position: script?.dataset.position || 'bottom-right',
    welcome: script?.dataset.welcome || 'Hi! How can I help you today?',
    botName: script?.dataset.botName || 'AI Assistant',
  };
}
