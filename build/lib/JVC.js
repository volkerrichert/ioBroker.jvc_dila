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
  constructor(logger, ip, port, timeout = 3e4) {
    super();
    this.logger = logger;
    this.ip = ip;
    this.port = port;
    this.timeout = timeout;
    this.working = true;
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
  }
  async requestReference(state) {
    this.logger.debug(`request ${state}`);
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
    this.logger.info("Try to connect to JVC projector");
    this.socket = new import_net.default.Socket();
    this.socket.setTimeout(this.timeout);
    this.socket.on("error", (e) => {
      this.emit("error", e);
    });
    this.socket.on("connect", () => {
      this.emit("connected");
    });
    this.socket.on("close", () => {
      var _a;
      (_a = this.socket) == null ? void 0 : _a.removeAllListeners();
      clearInterval(this.interval);
      delete this.socket;
      this.emit("disconnected");
    });
    this.socket.on("data", this.received.bind(this));
    this.socket.connect({
      host: this.ip,
      port: this.port || 20554
    });
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
        this.working = false;
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
    this.working = true;
    this.logger.silly(`sending ${d.toString("hex")}`);
    (_a = this.socket) == null ? void 0 : _a.write(d);
  }
  messageReceived(message) {
    const header = message[0];
    if (header === 6) {
      const operation = message.slice(3, 5).toString();
      this.emit("ack", operation, message.slice(5).toString());
      this.working = false;
      this.handleQueue();
    } else if (header === 64) {
      this.emit("response", message.slice(3, 5).toString(), message.slice(5).toString());
    } else {
      this.logger.error("Failed to parse packet");
      this.emit("unknown", message);
    }
  }
  disconnect() {
    var _a, _b;
    this.acked = false;
    this.working = true;
    clearInterval(this.interval);
    (_a = this.socket) == null ? void 0 : _a.end();
    (_b = this.socket) == null ? void 0 : _b.removeAllListeners();
    delete this.socket;
  }
  async checkWorking() {
    await this.write(Buffer.concat([this.setPrefix, Buffer.from([0, 0]), this.commandPostfix]));
  }
  async handleQueue() {
    if (this.queue.length > 0 && !this.working) {
      const next = this.queue.pop();
      this.logger.debug(`queue ${this.queue.length}`);
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
