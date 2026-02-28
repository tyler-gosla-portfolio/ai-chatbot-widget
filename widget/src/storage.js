export class NamespacedStorage {
  constructor(apiKey) {
    this.prefix = `chatbot_widget_${apiKey.slice(0, 8)}_`;
  }

  get(key) {
    try {
      const val = localStorage.getItem(this.prefix + key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  }

  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {}
  }

  remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {}
  }
}
