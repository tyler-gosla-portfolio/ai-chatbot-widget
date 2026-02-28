import { parseConfig } from './config.js';
import { ChatUI } from './ui.js';
import { ChatApi } from './api.js';
import { NamespacedStorage } from './storage.js';
import { EventEmitter } from './events.js';

class ChatbotWidgetInstance extends EventEmitter {
  constructor() {
    super();
    this._config = parseConfig();
    this._storage = new NamespacedStorage(this._config.apiKey);
    this._api = new ChatApi(this._config.apiUrl, this._config.apiKey);
    this._sessionId = this._storage.get('session') || null;
    this._pendingMessage = null;
    this._streamBubble = null;

    this._initDOM();
    this._restoreHistory();

    // Restore window state
    const savedState = this._storage.get('state');
    if (savedState === 'open') {
      this._ui.open();
    }
  }

  _initDOM() {
    const root = document.createElement('div');
    root.id = 'chatbot-widget-root';
    document.body.appendChild(root);

    const shadow = root.attachShadow({ mode: 'open' });

    this._ui = new ChatUI({
      shadowRoot: shadow,
      config: this._config,
      onSend: (msg) => this._handleSend(msg),
      onOpen: () => {
        this._storage.set('state', 'open');
        this.emit('open');
      },
      onClose: () => {
        this._storage.set('state', 'closed');
        this.emit('close');
      },
    });

    // Show welcome message if no history
    const cachedMessages = this._storage.get('messages') || [];
    if (cachedMessages.length === 0) {
      this._ui.addMessage('assistant', this._config.welcome);
    }
  }

  _restoreHistory() {
    const messages = this._storage.get('messages') || [];
    for (const msg of messages) {
      this._ui.addMessage(msg.role, msg.content, msg.timestamp);
    }
  }

  async _handleSend(message) {
    this._pendingMessage = message;
    this._ui.addMessage('user', message);
    this._ui.setInputDisabled(true);
    this._ui.showTyping();

    this.emit('message:sent', { message });

    // Cache user message
    const MAX_CACHED_MESSAGES = 100;
    const userMsg = { role: 'user', content: message, timestamp: new Date().toISOString() };
    const history = this._storage.get('messages') || [];
    history.push(userMsg);
    if (history.length > MAX_CACHED_MESSAGES) {
      history.splice(0, history.length - MAX_CACHED_MESSAGES);
    }

    let streamBubble = null;
    let fullResponse = '';

    const newSessionId = await this._api.sendMessage(message, this._sessionId, {
      onStart: (sid) => {
        if (sid) {
          this._sessionId = sid;
          this._storage.set('session', sid);
        }
        this._ui.removeTyping();
        streamBubble = this._ui.startStreamingMessage();
      },
      onToken: (token) => {
        if (streamBubble) {
          fullResponse += token;
          this._ui.appendToken(streamBubble, token);
        }
      },
      onDone: ({ sessionId }) => {
        if (sessionId) {
          this._sessionId = sessionId;
          this._storage.set('session', sessionId);
        }
        if (fullResponse) {
          const botMsg = { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() };
          history.push(botMsg);
          this._storage.set('messages', history);
          this.emit('message:received', { message: fullResponse });
        }
        this._ui.setInputDisabled(false);
        this._pendingMessage = null;
      },
      onError: (errMsg) => {
        this._ui.removeTyping();
        // If streaming already started, mark the bubble as interrupted
        if (streamBubble && fullResponse) {
          streamBubble.textContent += ' (response interrupted)';
        }
        this._ui.setInputDisabled(false);
        this._ui.showError(errMsg || 'Unable to connect. Please try again.', () => {
          this._ui.hideError();
          if (this._pendingMessage) this._handleSend(this._pendingMessage);
        });
        this.emit('error', { error: errMsg });
      },
    });

    // Update history in storage
    this._storage.set('messages', history);
  }

  // Public API
  open() { this._ui.open(); }
  close() { this._ui.close(); }
  toggle() { this._ui.toggle(); }

  sendMessage(msg) {
    if (msg) this._handleSend(String(msg));
  }

  destroy() {
    const root = document.getElementById('chatbot-widget-root');
    if (root) root.remove();
    this._api.abort();
  }
}

// Initialize widget
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  const instance = new ChatbotWidgetInstance();
  window.ChatbotWidget = {
    open: () => instance.open(),
    close: () => instance.close(),
    toggle: () => instance.toggle(),
    sendMessage: (msg) => instance.sendMessage(msg),
    destroy: () => instance.destroy(),
    on: (event, fn) => instance.on(event, fn),
    off: (event, fn) => instance.off(event, fn),
  };
}
