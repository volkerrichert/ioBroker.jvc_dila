/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

// @ts-ignore: no TS definition
import { JVC } from './lib/JVC';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noOp = () => {
};

const POWER = {
    command: 'PW',
    onAck: noOp,
    onResponse: noOp
};

class JvcDila extends utils.Adapter {
    protected projector: JVC | undefined;
    private interval: ioBroker.Interval | undefined;
    private timeout: ioBroker.Timeout | undefined;
    private apiConnected = false;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'jvc_dila',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        //this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        this.setState('info.connection', { val: false, ack: true });
        this.apiConnected = false;
        if (this.config.ip) {
            this.projector = new JVC(this.log, this.config.ip, this.config.port);
            this.addListeners();
            this.connect();
            this.subscribeStates('*');
        } else {
            this.log.warn('IP of projector is not configured. Please edit configuration!');
        }
    }

    private onProjectorConnected() {
        this.setState('info.connection', { val: true, ack: true });
        this.apiConnected = true;
        if (this.timeout) {
            this.clearTimeout(this.timeout);
            delete this.timeout;
        }
        this.log.debug('projector connected');
    }

    private onProjectorDisconnected() {
        this.setState('info.connection', { val: false, ack: true });
        this.apiConnected = false;
        if (this.interval) this.clearInterval(this.interval);
        this.timeout = this.setTimeout(() => {
            this.connect();
        }, 30 * 1000);
        this.log.info('projector disconnected.');
    }

    private onProjectorError(e: any) {
        switch (e.code) {
            case 'ETIMEDOUT':
            case 'ENETUNREACH':
            case 'EHOSTUNREACH':
                this.log.silly(`unable to connect to ${e.address}`);
                break;
            default:
                this.log.error(`connection error ${e}`);
                this.setState('info.connection', { val: false, ack: true });
                this.apiConnected = false;
                if (this.interval) this.clearInterval(this.interval);
                if (this.timeout) this.clearTimeout(this.timeout);
        }
    }

    private onProjectorReady() {
        this.log.info('projector is ready');
        this.interval = this.setInterval(this.updater.bind(this), 5000);
    }

    private onAck(state: string) {
        this.log.silly(`ack for ${Buffer.from(state).toString('hex')} received`);
    }

    private onResponse(state: string, value: string) {
        switch (state) {
            case POWER.command:
                this.setState('state', value, true);
                if (value === '1' || value === '0') {
                    this.setState('on', value === '1', true);
                }
                break;
        }
        this.log.debug(`response for ${state} received: ${value}`);
    }

    private onUnknown() {
        this.log.error('unable to handle response from projector');
    }

    private addListeners() {
        if (this.projector) {
            this.projector.on('connected', this.onProjectorConnected.bind(this));
            this.projector.on('disconnected', this.onProjectorDisconnected.bind(this));
            this.projector.on('error', this.onProjectorError.bind(this));
            this.projector.on('ready', this.onProjectorReady.bind(this));
            this.projector.on('ack', this.onAck.bind(this));
            this.projector.on('response', this.onResponse.bind(this));
            this.projector.on('unknown', this.onUnknown.bind(this));
        }
    }

    private connect(): void {
        this.projector?.connect();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.setState('info.connection', { val: false, ack: true });
            this.apiConnected = false;
            if (this.interval) this.clearInterval(this.interval);
            if (this.timeout) this.clearTimeout(this.timeout);


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

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (id && state && !state.ack) {
            const localId = this.removeNamespace(id);
            if (this.apiConnected) {
                // The state was changed
                this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                if (localId === 'on') {
                    this.projector?.requestOperation(POWER.command, state.val === true ? '1' : '0');
                }
            } else {
                this.log.error(`Unable to perform action for ${localId} - API is not connected (device not reachable?)`);
            }

        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

    private updater() {
        this.projector?.requestReference(POWER.command);
    }

    private removeNamespace(id: string) {
        const re = new RegExp(this.namespace + '*\\.', 'g');
        return id.replace(re, '');
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new JvcDila(options);
} else {
    // otherwise start the instance directly
    (() => new JvcDila())();
}