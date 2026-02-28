export function getStyles(themeColor) {
  return `
    :host {
      --theme-color: ${themeColor};
      --theme-dark: color-mix(in srgb, ${themeColor} 80%, black);
      --bg: #ffffff;
      --text: #1a1a1a;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --user-bubble: var(--theme-color);
      --user-text: #ffffff;
      --bot-bubble: #f3f4f6;
      --bot-text: #1a1a1a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
    }

    *, *::before, *::after { box-sizing: border-box; }

    #chatbot-bubble {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--theme-color);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    #chatbot-bubble:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0,0,0,0.25);
    }

    #chatbot-bubble:focus-visible {
      outline: 3px solid var(--theme-color);
      outline-offset: 3px;
    }

    #chatbot-bubble svg { pointer-events: none; }

    #chatbot-window {
      position: fixed;
      bottom: 88px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 560px;
      max-height: calc(100vh - 110px);
      background: var(--bg);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      z-index: 999998;
      overflow: hidden;
      transition: opacity 0.2s, transform 0.2s;
    }

    #chatbot-window[aria-hidden="true"] {
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px) scale(0.98);
    }

    #chatbot-header {
      background: var(--theme-color);
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    #chatbot-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    #chatbot-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    #chatbot-close:hover { opacity: 1; }
    #chatbot-close:focus-visible {
      outline: 2px solid white;
      outline-offset: 2px;
    }

    #chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      display: flex;
      flex-direction: column;
      max-width: 80%;
    }

    .message.user { align-self: flex-end; }
    .message.assistant { align-self: flex-start; }

    .message-bubble {
      padding: 10px 14px;
      border-radius: 18px;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .message.user .message-bubble {
      background: var(--user-bubble);
      color: var(--user-text);
      border-bottom-right-radius: 4px;
    }

    .message.assistant .message-bubble {
      background: var(--bot-bubble);
      color: var(--bot-text);
      border-bottom-left-radius: 4px;
    }

    .message-time {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      padding: 0 4px;
    }

    .message.user .message-time { text-align: right; }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
      background: var(--bot-bubble);
      border-radius: 18px;
      border-bottom-left-radius: 4px;
      width: fit-content;
    }

    .typing-indicator span {
      width: 8px;
      height: 8px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: typing 1.2s infinite;
    }

    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    #chatbot-error {
      padding: 8px 16px;
      background: #fef2f2;
      color: #dc2626;
      font-size: 13px;
      display: none;
      align-items: center;
      gap: 8px;
    }

    #chatbot-error.visible { display: flex; }

    #chatbot-retry {
      background: none;
      border: 1px solid #dc2626;
      color: #dc2626;
      border-radius: 4px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 12px;
    }

    #chatbot-input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    #chatbot-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 24px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      resize: none;
      line-height: 1.4;
      max-height: 120px;
      overflow-y: auto;
      background: var(--bg);
      color: var(--text);
    }

    #chatbot-input:focus {
      border-color: var(--theme-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-color) 20%, transparent);
    }

    #chatbot-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--theme-color);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      align-self: flex-end;
      transition: background 0.2s;
    }

    #chatbot-send:hover { background: var(--theme-dark); }
    #chatbot-send:disabled { opacity: 0.5; cursor: not-allowed; }
    #chatbot-send:focus-visible {
      outline: 3px solid var(--theme-color);
      outline-offset: 2px;
    }
  `;
}
