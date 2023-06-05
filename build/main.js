"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_JVC = require("./lib/JVC");
const noOp = () => {
};
const POWER = {
  command: "PW",
  onAck: noOp,
  onResponse: noOp
};
class JvcDila extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "jvc_dila"
    });
    this.apiConnected = false;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.setState("info.connection", { val: false, ack: true });
    this.apiConnected = false;
    if (this.config.ip) {
      this.projector = new import_JVC.JVC(this.log, this.config.ip, this.config.port);
      this.addListeners();
      this.connect();
      this.subscribeStates("*");
    } else {
      this.log.warn("IP of projector is not configured. Please edit configuration!");
    }
  }
  onProjectorConnected() {
    this.setState("info.connection", { val: true, ack: true });
    this.apiConnected = true;
    if (this.timeout) {
      this.clearTimeout(this.timeout);
      delete this.timeout;
    }
    this.log.debug("projector connected");
  }
  onProjectorDisconnected() {
    this.setState("info.connection", { val: false, ack: true });
    this.apiConnected = false;
    if (this.interval)
      this.clearInterval(this.interval);
    this.timeout = this.setTimeout(() => {
      this.connect();
    }, 30 * 1e3);
    this.log.info("projector disconnected.");
  }
  onProjectorError(e) {
    switch (e.code) {
      case "ETIMEDOUT":
      case "ENETUNREACH":
      case "EHOSTUNREACH":
        this.log.silly(`unable to connect to ${e.address}`);
        break;
      default:
        this.log.error(`connection error ${e}`);
        this.setState("info.connection", { val: false, ack: true });
        this.apiConnected = false;
        if (this.interval)
          this.clearInterval(this.interval);
        if (this.timeout)
          this.clearTimeout(this.timeout);
    }
  }
  onProjectorReady() {
    this.log.info("projector is ready");
    this.interval = this.setInterval(this.updater.bind(this), 5e3);
  }
  onAck(state) {
    this.log.silly(`ack for ${Buffer.from(state).toString("hex")} received`);
  }
  onResponse(state, value) {
    switch (state) {
      case POWER.command:
        this.setState("state", value, true);
        if (value === "1" || value === "0") {
          this.setState("on", value === "1", true);
        }
        break;
    }
    this.log.debug(`response for ${state} received: ${value}`);
  }
  onUnknown() {
    this.log.error("unable to handle response from projector");
  }
  addListeners() {
    if (this.projector) {
      this.projector.on("connected", this.onProjectorConnected.bind(this));
      this.projector.on("disconnected", this.onProjectorDisconnected.bind(this));
      this.projector.on("error", this.onProjectorError.bind(this));
      this.projector.on("ready", this.onProjectorReady.bind(this));
      this.projector.on("ack", this.onAck.bind(this));
      this.projector.on("response", this.onResponse.bind(this));
      this.projector.on("unknown", this.onUnknown.bind(this));
    }
  }
  connect() {
    var _a;
    (_a = this.projector) == null ? void 0 : _a.connect();
  }
  onUnload(callback) {
    try {
      this.setState("info.connection", { val: false, ack: true });
      this.apiConnected = false;
      if (this.interval)
        this.clearInterval(this.interval);
      if (this.timeout)
        this.clearTimeout(this.timeout);
      if (this.projector) {
        this.projector.disconnect();
        this.projector.removeAllListeners();
        delete this.projector;
      }
      callback();
    } catch (e) {
      callback();
    }
  }
  onStateChange(id, state) {
    var _a;
    if (id && state && !state.ack) {
      const localId = this.removeNamespace(id);
      if (this.apiConnected) {
        this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        if (localId === "on") {
          (_a = this.projector) == null ? void 0 : _a.requestOperation(POWER.command, state.val === true ? "1" : "0");
        }
      } else {
        this.log.error(`Unable to perform action for ${localId} - API is not connected (device not reachable?)`);
      }
    }
  }
  updater() {
    var _a;
    (_a = this.projector) == null ? void 0 : _a.requestReference(POWER.command);
  }
  removeNamespace(id) {
    const re = new RegExp(this.namespace + "*\\.", "g");
    return id.replace(re, "");
  }
}
if (require.main !== module) {
  module.exports = (options) => new JvcDila(options);
} else {
  (() => new JvcDila())();
}
//# sourceMappingURL=main.js.map
