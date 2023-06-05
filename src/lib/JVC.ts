import { EventEmitter } from 'events';
import net from 'net';
import { setInterval } from 'timers';

export class JVC extends EventEmitter {
    public working = true;

    readonly requestPrefix = Buffer.from([
        0x3F, 0x89, 0x01,
    ]);

    readonly setPrefix = Buffer.from([
        0x21, 0x89, 0x01,
    ]);
    readonly commandPostfix = Buffer.from([
        0x0A,
    ]);
    private acked = false;
    private socket: net.Socket | undefined;
    private partial: Buffer | undefined;
    private interval: NodeJS.Timeout | undefined;
    private queue: Buffer[] = [];

    constructor(
        private logger: ioBroker.Logger,
        private ip: string,
        private port: number,
        private timeout: number = 30000) {
        super();
    }

    public async requestReference(state: string): Promise<void> {
        this.logger.debug(`request ${state}`);
        this.queue.push(Buffer.concat([this.requestPrefix, Buffer.from(state), this.commandPostfix]));
        await this.handleQueue();
    }

    public async requestOperation(operation: string, value?: string ): Promise<void> {
        if (value) this.queue.push(Buffer.concat([this.setPrefix, Buffer.from(operation), Buffer.from(value), this.commandPostfix]));
        else this.queue.push(Buffer.concat([this.setPrefix, Buffer.from(operation), this.commandPostfix]));
        await this.handleQueue();
    }

    async connect(): Promise<void> {
        this.logger.info('Try to connect to JVC projector');
        this.socket = new net.Socket();
        //this.socket.setTimeout(this.timeout);
        this.socket.on('error', (e) => {
            this.emit('error', e);
        });
        this.socket.on('connect', () => {
            this.emit('connected');
        });
        // this.socket.on('timeout', () => {
        //     this.socket?.end();
        //     this.emit('timeout');
        // });
        this.socket.on('close', () => {
            this.socket?.removeAllListeners();
            clearInterval(this.interval);
            delete this.socket;
            this.emit('disconnected');
        });
        this.socket.on('data', this.received.bind(this));
        this.socket.connect({
            host: this.ip,
            port: this.port || 20554,
        });
    }

    private received(d: Buffer): void {
        if (d.length === 0) {
            return;
        }
        this.logger.silly('received ' + d.toString('hex'))
        if (!this.acked) {
            const str = d.toString('utf8');
            debugger;
            if (str.startsWith('PJ_OK')) {
                this.logger.silly('received PJ_OK')
                this.socket?.write(Buffer.from('PJREQ'));
            } else if (str.startsWith('PJACK')) {
                this.acked = true;
                this.working = false;
                this.emit('ready');
                this.interval = setInterval(this.checkWorking.bind(this), 1000);
            } else if (str.startsWith('PJNAK')) {
                this.logger.silly('Received NAK');
            }
            if (d.length > 5) {
                this.received(d.slice(5));
            }
        } else {
            const fullMessage = this.partial ? Buffer.concat([this.partial, d]) : d;
            delete this.partial;
            const endOf = fullMessage.indexOf(0x0A);
            if (endOf < 0) {
                this.logger.silly(`Partial message received: ${fullMessage.toString('hex')}`);
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

    private async write(d: Buffer): Promise<void> {
        if (!this.socket) {
            await this.connect();
        }
        this.working = true;
        this.logger.silly(`sending ${d.toString('hex')}`)
        this.socket?.write(d);
    }

    private messageReceived(message: Buffer): void {
        const header = message[0];
        if (header === 0x06) {
            const operation = message.slice(3, 5).toString()
            this.emit('ack', operation, message.slice(5).toString());
            this.working = false;
            this.handleQueue();
        } else if (header === 0x40) {
            this.emit('response', message.slice(3, 5).toString(), message.slice(5).toString());
        } else {
            this.logger.error('Failed to parse packet');
            this.emit('unknown', message);
        }
    }

    disconnect(): void {
        this.acked = false;
        this.working = true;
        clearInterval(this.interval);
        this.socket?.end();
        this.socket?.removeAllListeners();
        delete this.socket;
    }

    private async checkWorking() {
        await this.write(Buffer.concat([this.setPrefix, Buffer.from([0x00, 0x00]), this.commandPostfix]))
    }

    private async handleQueue() {
        if (this.queue.length > 0 && !this.working) {
            const next = this.queue.pop();
            this.logger.debug(`queue ${this.queue.length}`);
            if (next) await this.write(next);
        }
    }
}
