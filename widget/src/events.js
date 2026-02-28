export class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (!this._listeners[event]) return this;
    this._listeners[event] = this._listeners[event].filter(l => l !== fn);
    return this;
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); } catch {}
    });
  }
}
