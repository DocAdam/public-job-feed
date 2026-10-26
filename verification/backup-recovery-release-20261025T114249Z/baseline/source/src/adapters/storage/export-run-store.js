const path = require("path");
const { Worker } = require("worker_threads");

class ExportRunStore {
  constructor(worker) {
    this.worker = worker;
    this.nextRequestId = 1;
    this.pending = new Map();
    worker.on("message", (message) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message);
        error.stack = message.error.stack || error.stack;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
    });
    worker.on("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  static async open(options) {
    const worker = new Worker(path.join(__dirname, "export-run-store-worker.js"));
    const store = new ExportRunStore(worker);
    await store.request("initialize", options);
    return store;
  }

  static async resume(options) {
    const worker = new Worker(path.join(__dirname, "export-run-store-worker.js"));
    const store = new ExportRunStore(worker);
    await store.request("initializeExisting", options);
    return store;
  }

  request(method, params = {}) {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, params });
    });
  }

  insertBatch(rows, metadata) {
    return this.request("insertBatch", { rows, metadata });
  }

  getSummary() {
    return this.request("getSummary");
  }

  resolveDedupe() {
    return this.request("resolveDedupe");
  }

  recomputeDedupe() { return this.request("recomputeDedupe"); }

  async close() {
    await this.request("close");
    await this.worker.terminate();
  }
}

module.exports = { ExportRunStore };
