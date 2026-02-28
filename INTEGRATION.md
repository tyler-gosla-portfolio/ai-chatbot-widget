# Widget Integration Guide

## Basic Integration

Add this `<script>` tag to your website, just before `</body>`:

```html
<script
  src="https://your-chatbot-server.com/widget/chatbot.js"
  data-api-key="pk_live_your_api_key_here"
  defer
></script>
```

That's it. The widget will appear in the bottom-right corner of your page.

## Configuration Options

```html
<script
  src="https://your-chatbot-server.com/widget/chatbot.js"
  data-api-key="pk_live_your_key"
  data-api-url="https://your-chatbot-server.com"
  data-theme-color="#4F46E5"
  data-position="bottom-right"
  data-welcome="Hi! How can I help you today?"
  data-bot-name="Support Bot"
  defer
></script>
```

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-api-key` | *(required)* | API key from admin panel |
| `data-api-url` | `window.location.origin` | Chatbot API server URL |
| `data-theme-color` | `#4F46E5` | Hex color for the widget theme |
| `data-position` | `bottom-right` | Widget position |
| `data-welcome` | `Hi! How can I help you today?` | First message shown |
| `data-bot-name` | `AI Assistant` | Name shown in the chat header |

## JavaScript API

After the widget loads, control it via `window.ChatbotWidget`:

```js
// Open/close programmatically
ChatbotWidget.open();
ChatbotWidget.close();
ChatbotWidget.toggle();

// Send a message programmatically
ChatbotWidget.sendMessage('Tell me about your pricing');

// Remove the widget from the page
ChatbotWidget.destroy();

// Listen to events
ChatbotWidget.on('open', () => console.log('Chat opened'));
ChatbotWidget.on('close', () => console.log('Chat closed'));
ChatbotWidget.on('message:sent', ({ message }) => console.log('User sent:', message));
ChatbotWidget.on('message:received', ({ message }) => console.log('Bot replied:', message));
ChatbotWidget.on('error', ({ error }) => console.error('Error:', error));

// Remove event listener
const handler = (data) => console.log(data);
ChatbotWidget.on('message:sent', handler);
ChatbotWidget.off('message:sent', handler);
```

## Content Security Policy (CSP)

If your site uses a Content Security Policy, add these directives:

```
Content-Security-Policy:
  connect-src 'self' https://your-chatbot-server.com;
  script-src 'self' https://your-chatbot-server.com;
  style-src 'self' 'unsafe-inline';
```

The `style-src 'unsafe-inline'` is required because the widget injects styles into a Shadow DOM. The styles are scoped and cannot affect your page layout.

## API Key Security

Always restrict API keys to your domain in the admin panel:

1. Go to Admin Panel → API Keys
2. When creating a key, set **Allowed Origins** to your site URL (e.g., `https://example.com`)
3. The server will reject widget requests from other origins

An API key with no allowed origins works in **development mode only** and logs a warning on every request.

## Session Persistence

The widget stores sessions in `localStorage` under namespaced keys:

```
chatbot_widget_{apiKeyPrefix}_session   → Session ID
chatbot_widget_{apiKeyPrefix}_messages  → Cached message history  
chatbot_widget_{apiKeyPrefix}_state     → Open/closed state
```

Sessions are preserved across page refreshes. Users can clear their history by calling `ChatbotWidget.destroy()` or clearing localStorage.

## Accessibility

The widget is built for WCAG 2.1 AA compliance:

- **Screen readers:** `aria-live="polite"` announces new messages
- **Keyboard navigation:** Tab cycles through controls; Escape closes the window
- **Focus management:** Opening moves focus to the input; closing returns focus to the trigger bubble
- **Focus trap:** Tab is trapped within the open chat window

## Network Error Handling

The widget handles network errors gracefully:

- **API unreachable:** Shows "Unable to connect. Please try again." with a retry button. The user's message is preserved.
- **Mid-stream SSE drop:** Shows partial response with error message and retry option.
- **Concurrent requests:** Each new message aborts any in-progress stream.

## Example: React Integration

```jsx
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://your-chatbot-server.com/widget/chatbot.js';
    script.dataset.apiKey = 'pk_live_your_key';
    script.dataset.themeColor = '#4F46E5';
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      if (window.ChatbotWidget) window.ChatbotWidget.destroy();
    };
  }, []);

  return <div>My App</div>;
}
```

## Example: Open on Button Click

```html
<button onclick="ChatbotWidget.open()">Chat with us</button>

<script
  src="https://your-chatbot-server.com/widget/chatbot.js"
  data-api-key="pk_live_your_key"
  defer
></script>
```

## Troubleshooting

**Widget doesn't appear:**
- Check browser console for errors
- Ensure the API key is valid and active
- Verify the `data-api-url` is correct if the chatbot is on a different domain

**CORS errors:**
- Ensure your origin is in the API key's `allowedOrigins`
- Check that the API server has CORS configured

**Messages fail with 401:**
- The API key may be revoked — create a new one in the admin panel

**No context from knowledge base:**
- Upload documents in the admin panel
- Wait for them to reach `processed` status
- Try lowering the `similarityThreshold` in Settings
