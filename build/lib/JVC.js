"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var JVC_exports = {};
__export(JVC_exports, {
  JVC: () => JVC
});
module.exports = __toCommonJS(JVC_exports);
var import_events = require("events");
var import_net = __toESM(require("net"));
var import_timers = require("timers");
class JVC extends import_events.EventEmitter {
  constructor(logger, ip, port, timeout = 5e3) {
    super();
    this.logger = logger;
    this.ip = ip;
    this.port = port;
    this.timeout = timeout;
    this.requestPrefix = Buffer.from([
      63,
      137,
      1
    ]);
    this.setPrefix = Buffer.from([
      33,
      137,
      1
    ]);
    this.commandPostfix = Buffer.from([
      10
    ]);
    this.acked = false;
    this.queue = [];
    this.checking = void 0;
  }
  async requestReference(state) {
    this.logger.silly(`request ${state}`);
    this.queue.push(Buffer.concat([this.requestPrefix, Buffer.from(state), this.commandPostfix]));
    await this.handleQueue();
  }
  async requestOperation(operation, value) {
    if (value)
      this.queue.push(Buffer.concat([this.setPrefix, Buffer.from(operation), Buffer.from(value), this.commandPostfix]));
    else
      this.queue.push(Buffer.concat([this.setPrefix, Buffer.from(operation), this.commandPostfix]));
    await this.handleQueue();
  }
  async connect() {
    this.logger.debug("Try to connect to JVC projector");
    this.socket = new import_net.default.Socket();
    this.socket.on("error", (e) => {
      clearTimeout(this.connectTimeout);
      this.emit("error", e);
    }).on("connect", () => {
      clearTimeout(this.connectTimeout);
      this.emit("connected");
    }).on("close", () => {
      clearTimeout(this.connectTimeout);
      this.disconnect();
      this.emit("disconnected");
    }).on("timeout", () => {
      this.disconnect();
    }).on("data", this.received.bind(this)).connect({
      host: this.ip,
      port: this.port || 20554
    });
    this.connectTimeout = setTimeout(() => {
      var _a, _b;
      if ((_a = this.socket) == null ? void 0 : _a.connecting) {
        (_b = this.socket) == null ? void 0 : _b.destroy();
      }
    }, this.timeout);
  }
  disconnect() {
    var _a, _b;
    this.acked = false;
    this.checking = void 0;
    clearInterval(this.interval);
    clearTimeout(this.connectTimeout);
    (_a = this.socket) == null ? void 0 : _a.destroy();
    (_b = this.socket) == null ? void 0 : _b.removeAllListeners();
    delete this.socket;
  }
  received(d) {
    var _a;
    if (d.length === 0) {
      return;
    }
    this.logger.silly("received " + d.toString("hex"));
    if (!this.acked) {
      const str = d.toString("utf8");
      debugger;
      if (str.startsWith("PJ_OK")) {
        this.logger.silly("received PJ_OK");
        (_a = this.socket) == null ? void 0 : _a.write(Buffer.from("PJREQ"));
      } else if (str.startsWith("PJACK")) {
        this.acked = true;
        this.checking = void 0;
        this.emit("ready");
        this.interval = (0, import_timers.setInterval)(this.checkWorking.bind(this), 1e3);
      } else if (str.startsWith("PJNAK")) {
        this.logger.silly("Received NAK");
      }
      if (d.length > 5) {
        this.received(d.slice(5));
      }
    } else {
      const fullMessage = this.partial ? Buffer.concat([this.partial, d]) : d;
      delete this.partial;
      const endOf = fullMessage.indexOf(10);
      if (endOf < 0) {
        this.logger.silly(`Partial message received: ${fullMessage.toString("hex")}`);
        this.partial = fullMessage;
      } else {
        const thisMessage = fullMessage.slice(0, endOf);
        this.messageReceived(thisMessage);
        if (endOf < fullMessage.length) {
          this.received(fullMessage.slice(endOf + 1));
        }
      }
    }
  }
  async write(d) {
    var _a;
    if (!this.socket) {
      await this.connect();
    }
    this.logger.silly(`sending ${d.toString("hex")}`);
    (_a = this.socket) == null ? void 0 : _a.write(d);
  }
  messageReceived(message) {
    const header = message[0];
    if (header === 6) {
      const operation = message.slice(3, 5).toString();
      this.emit("ack", operation, message.slice(5).toString());
      this.checking = void 0;
      this.handleQueue();
    } else if (header === 64) {
      this.emit("response", message.slice(3, 5).toString(), message.slice(5).toString());
    } else {
      this.logger.error("Failed to parse packet");
      this.emit("unknown", message);
    }
  }
  async checkWorking() {
    var _a;
    if (!this.checking) {
      this.checking = Date.now();
    } else if (this.checking + this.timeout > Date.now()) {
      (_a = this.socket) == null ? void 0 : _a.destroy();
      return;
    }
    await this.write(Buffer.concat([this.setPrefix, Buffer.from([0, 0]), this.commandPostfix]));
  }
  async handleQueue() {
    if (this.queue.length > 0 && !this.checking) {
      const next = this.queue.pop();
      this.logger.silly(`queue ${this.queue.length}`);
      if (next)
        await this.write(next);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  JVC
});
//# sourceMappingURL=JVC.js.map
