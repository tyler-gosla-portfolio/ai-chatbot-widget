import { getStyles } from './styles.js';

export class ChatUI {
  constructor({ shadowRoot, config, onSend, onClose, onOpen }) {
    this.shadowRoot = shadowRoot;
    this.config = config;
    this.onSend = onSend;
    this.onClose = onClose;
    this.onOpen = onOpen;
    this.isOpen = false;
    this._render();
  }

  _render() {
    const { themeColor, botName } = this.config;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getStyles(themeColor);
    this.shadowRoot.appendChild(style);

    // Chat bubble
    this.bubble = document.createElement('button');
    this.bubble.id = 'chatbot-bubble';
    this.bubble.setAttribute('aria-label', `Open chat with ${botName}`);
    this.bubble.setAttribute('aria-expanded', 'false');
    this.bubble.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
    this.bubble.addEventListener('click', () => this.toggle());
    this.shadowRoot.appendChild(this.bubble);

    // Chat window
    this.window = document.createElement('div');
    this.window.id = 'chatbot-window';
    this.window.setAttribute('role', 'dialog');
    this.window.setAttribute('aria-label', `Chat with ${botName}`);
    this.window.setAttribute('aria-hidden', 'true');
    this.window.innerHTML = `
      <div id="chatbot-header">
        <h2 id="chatbot-title">${this._escape(botName)}</h2>
        <button id="chatbot-close" aria-label="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="chatbot-messages" role="log" aria-live="polite" aria-label="Chat messages"></div>
      <div id="chatbot-error" role="alert">
        <span id="chatbot-error-msg"></span>
        <button id="chatbot-retry">Retry</button>
      </div>
      <div id="chatbot-input-area">
        <textarea
          id="chatbot-input"
          placeholder="Type a message..."
          rows="1"
          aria-label="Message input"
          aria-multiline="true"
          maxlength="2000"
        ></textarea>
        <button id="chatbot-send" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    `;
    this.shadowRoot.appendChild(this.window);

    // Bind elements
    this.messagesEl = this.shadowRoot.getElementById('chatbot-messages');
    this.inputEl = this.shadowRoot.getElementById('chatbot-input');
    this.sendBtn = this.shadowRoot.getElementById('chatbot-send');
    this.closeBtn = this.shadowRoot.getElementById('chatbot-close');
    this.errorEl = this.shadowRoot.getElementById('chatbot-error');
    this.errorMsgEl = this.shadowRoot.getElementById('chatbot-error-msg');
    this.retryBtn = this.shadowRoot.getElementById('chatbot-retry');

    // Events
    this.closeBtn.addEventListener('click', () => this.close());
    this.sendBtn.addEventListener('click', () => this._handleSend());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });
    this.inputEl.addEventListener('input', () => this._autoResize());

    // Focus trap
    this.window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Tab') this._trapFocus(e);
    });
  }

  _trapFocus(e) {
    const focusable = Array.from(this.window.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  _autoResize() {
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
  }

  _handleSend() {
    const message = this.inputEl.value.trim();
    if (!message || this.sendBtn.disabled) return;
    this.inputEl.value = '';
    this._autoResize();
    this.hideError();
    if (this.onSend) this.onSend(message);
  }

  open() {
    this.isOpen = true;
    this.window.setAttribute('aria-hidden', 'false');
    this.bubble.setAttribute('aria-expanded', 'true');
    this.inputEl.focus();
    if (this.onOpen) this.onOpen();
  }

  close() {
    this.isOpen = false;
    this.window.setAttribute('aria-hidden', 'true');
    this.bubble.setAttribute('aria-expanded', 'false');
    this.bubble.focus();
    if (this.onClose) this.onClose();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  addMessage(role, content, timestamp) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content; // Safe - never innerHTML

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = this._formatTime(timestamp || new Date());

    wrapper.appendChild(bubble);
    wrapper.appendChild(time);
    this.messagesEl.appendChild(wrapper);
    this._scrollToBottom();
    return { wrapper, bubble };
  }

  showTyping() {
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.id = 'typing-indicator';
    el.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    this.messagesEl.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  removeTyping() {
    const el = this.shadowRoot.getElementById('typing-indicator');
    if (el) el.remove();
  }

  startStreamingMessage() {
    this.removeTyping();
    const wrapper = document.createElement('div');
    wrapper.className = 'message assistant';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = this._formatTime(new Date());
    wrapper.appendChild(bubble);
    wrapper.appendChild(time);
    this.messagesEl.appendChild(wrapper);
    this._scrollToBottom();
    return bubble;
  }

  appendToken(bubble, token) {
    bubble.textContent += token;
    this._scrollToBottom();
  }

  showError(msg, onRetry) {
    this.errorMsgEl.textContent = msg;
    this.errorEl.classList.add('visible');
    if (onRetry) {
      this.retryBtn.onclick = onRetry;
      this.retryBtn.style.display = '';
    } else {
      this.retryBtn.style.display = 'none';
    }
  }

  hideError() {
    this.errorEl.classList.remove('visible');
  }

  setInputDisabled(disabled) {
    this.inputEl.disabled = disabled;
    this.sendBtn.disabled = disabled;
  }

  _scrollToBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _formatTime(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
