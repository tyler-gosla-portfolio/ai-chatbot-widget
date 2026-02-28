export class ChatApi {
  constructor(apiUrl, apiKey) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.currentController = null;
  }

  async sendMessage(message, sessionId, { onToken, onDone, onError, onStart }) {
    // Abort any ongoing stream
    if (this.currentController) {
      this.currentController.abort();
    }
    this.currentController = new AbortController();

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({ message, sessionId }),
        signal: this.currentController.signal,
      });

      if (!response.ok) {
        let errData;
        try { errData = await response.json(); } catch { errData = {}; }
        throw new Error(errData.message || `HTTP ${response.status}`);
      }

      const newSessionId = response.headers.get('X-Session-Id') || sessionId;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let returnedSessionId = newSessionId;
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'start') {
              returnedSessionId = data.sessionId || returnedSessionId;
              if (onStart) onStart(data.sessionId);
            } else if (data.type === 'token') {
              if (onToken) onToken(data.content);
            } else if (data.type === 'done') {
              receivedDone = true;
              if (onDone) onDone({ messageId: data.messageId, sessionId: returnedSessionId });
            } else if (data.type === 'error') {
              if (onError) onError(data.message || 'An error occurred');
            }
          } catch {}
        }
      }

      // Stream ended without a 'done' event — signal interruption
      if (!receivedDone) {
        if (onError) onError('Response interrupted. Please retry.');
      }

      return returnedSessionId;
    } catch (err) {
      if (err.name === 'AbortError') return sessionId;
      if (onError) onError(err.message || 'Unable to connect. Please try again.');
      return sessionId;
    } finally {
      this.currentController = null;
    }
  }

  abort() {
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
  }
}
