const EventEmitter = require("eventemitter2");

const makeWASocket = require("@giuseppecastaldo/baileys").default;
const {
    DisconnectReason,
    useSingleFileAuthState
} = require("@giuseppecastaldo/baileys");

const MessageType = {
    text: "conversation",
    location: "locationMessage",
    liveLocation: "liveLocationMessage",
    image: "imageMessage",
    video: "videoMessage",
    document: "documentMessage",
    contact: "contactMessage"
}

class WhatsappClient extends EventEmitter {
    #conn;
    #path;
    #refreshInterval;
    #sendPresenceUpdateInterval;
    #timeout;
    #attempts;
    #offline;
    #refreshMs;

    #status = {
        attempt: 0,
        connected: false,
        disconnected: false,
        reconnecting: false
    }

    #toMilliseconds = (hrs, min, sec) => (hrs * 60 * 60 + min * 60 + sec) * 1000;

    constructor({ path, timeout = 1e3, attempts = Infinity, offline = true, refreshMs }) {
        super();
        this.#path = path;
        this.#timeout = timeout;
        this.#attempts = attempts;
        this.#offline = offline;
        this.#refreshMs = refreshMs || this.#toMilliseconds(6, 0, 0);
        this.connect()
    }

    connect = async () => {
        if (this.#status.connected) return

        const { state, saveState } = useSingleFileAuthState(this.#path)

        this.#conn = makeWASocket({
            auth: state,
            syncFullHistory: false,
            markOnlineOnConnect: !this.#offline,
            browser: ['Ubuntu', 'Desktop', '20.0.04'],
            logger: require("pino")({ level: "silent" }),
            defaultQueryTimeoutMs: undefined
        })

        this.#conn.ev.on('creds.update', (state) => {
            if (state.me) {
                this.emit("pair", { phone: state.me.id.split(':')[0], name: state.me.name });
            }

            saveState(state);
        })

        this.#conn.ev.on('connection.update', this.#onConnectionUpdate)
    }

    disconnect = reconnect => {
        if (this.#status.disconnected) return

        this.#status.connected = false
        this.#status.disconnected = !reconnect
        this.#status.reconnecting = !!reconnect

        return this.#conn.end()
    }

    restart = () => {
        this.emit('restart')
        return this.disconnect(true)
    }

    #toId = phone => {
        phone = phone.toString()
        if (!phone) throw new Error('Invalid phone')

        return `${phone.replace('+', '')}${(!phone.endsWith('@s.whatsapp.net') && !phone.endsWith('@g.us') && !phone.endsWith('@broadcast')) ? '@s.whatsapp.net' : ''}`
    }

    #reconnect = () => {
        if (this.#status.attempt++ > this.#attempts || this.#status.disconnected) {
            this.#status.reconnecting = false
            this.#status.disconnected = true
            return
        }

        setTimeout(this.connect, this.#timeout)
    }

    #onConnectionUpdate = (event) => {
        if (event.qr) this.#onQr(event.qr)
        if (event.connection === 'open') this.#onConnected(event)
        else if (event.connection === 'close') this.#onDisconnected(event)
    }

    #onQr = (qr) => {
        this.emit('qr', qr)
    }

    #onConnected = (event) => {
        this.#status.attempt = 0
        this.#status.connected = true
        this.#status.disconnected = false
        this.#status.reconnecting = false

        this.#refreshInterval = setInterval(() => this.restart(), this.#refreshMs)
        if (this.#offline) this.setSendPresenceUpdateInterval('unavailable')

        this.#conn.ev.on('messages.upsert', msgs => {
            const msg = msgs.messages[0]
            const messageType = Object.keys(msg.message)[0]
            if (!msg.key.fromMe) this.emit('msg', { type: messageType, ...msgs.messages[0] })
        })

        this.#conn.ev.on("presence.update", (presence) => {
            this.emit("presence_update", presence);
        });

        this.emit('ready')
    }

    #onDisconnected = ({ lastDisconnect }) => {
        this.#status.connected = false

        clearInterval(this.#refreshInterval)
        this.setSendPresenceUpdateInterval()

        const statusCode = lastDisconnect?.error?.output?.statusCode

        if (statusCode === DisconnectReason.restartRequired) {
            this.waitFor('ready').then(() => { 
                setTimeout(() => {
                    this.restart()
                }, 5000)
            });
        }

        if (statusCode === DisconnectReason.loggedOut) {
            this.#status.reconnecting = false
            this.#status.disconnected = true

            this.emit('logout')
            return
        }

        this.emit('disconnected', statusCode)
        this.#reconnect()
    }

    setSendPresenceUpdateInterval = (status, id) => {
        clearInterval(this.#sendPresenceUpdateInterval)

        if (status) {
            try {
                this.sendPresenceUpdate(status, id)
            } catch (err) {
                clearInterval(this.#sendPresenceUpdateInterval)
            }

            this.#sendPresenceUpdateInterval = setInterval(() => {
                try {
                    this.sendPresenceUpdate(status, id)
                } catch (err) {
                    clearInterval(this.#sendPresenceUpdateInterval)
                }
            }, 10000)
        }
    }

    sendMessage = async (phone, msg, options) => {
        phone = phone.toString()
        if (this.#status.disconnected || !this.#status.connected) {
            throw new WhatsappDisconnectedError()
        }

        const id = this.#toId(phone)

        const [result] = await this.#conn.onWhatsApp(id);

        if (result || phone.endsWith('@g.us') || phone.endsWith('@broadcast')) {
            try {
                return await this.#conn.sendMessage(id, msg, options);
            } catch (err) {
                throw new WhatsappError(err.output.payload.statusCode)
            }
        }

        throw new WhatsappNumberNotFoundError(phone);
    }

    waitForMessage(from, callback) {
        this.once('msg', msg => {
            if (msg.key.remoteJid === this.#toId(from)) callback(msg)
        })
    }

    sendPresenceUpdate = async (type, id) => {
        if (this.#status.disconnected || !this.#status.connected) {
            throw new WhatsappDisconnectedError()
        }

        try {
            await this.#conn.sendPresenceUpdate(type, id);
        } catch (err) {
            throw new WhatsappError(err.output.payload.statusCode)
        }
    }

    presenceSubscribe = async (phone) => {
        if (this.#status.disconnected || !this.#status.connected) {
            throw new WhatsappDisconnectedError()
        }

        const id = this.#toId(phone)

        const [result] = await this.#conn.onWhatsApp(id);

        if (result) {
            try {
                await this.#conn.presenceSubscribe(id);
            } catch (err) {
                throw new WhatsappError(err.output.payload.statusCode)
            }
        } else {
            throw new WhatsappNumberNotFoundError(phone);
        }
    }

    updateProfileStatus = async (status) => {
        if (this.#status.disconnected || !this.#status.connected) {
            throw new WhatsappDisconnectedError()
        }

        try {
            await this.#conn.updateProfileStatus(status);
        } catch (err) {
            throw new WhatsappError(err.output.payload.statusCode)
        }
    }
}

class WhatsappNumberNotFoundError extends Error {
    constructor(phone = "", ...args) {
        super(phone, ...args);
        this.name = 'WhatsappNumberNotFoundError';
        this.message = `Send message failed. Number ${phone} is not on Whatsapp.`;
        this.code = 404;
    }
}

class WhatsappDisconnectedError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);
        this.name = 'WhatsappDisconnectedError';
        this.code = 401;
        this.message = `Send message failed. Whatsapp disconnected error.`;
    }
}

class WhatsappError extends Error {
    #errors = {
        428: "Connection Closed",
        408: "Connection Lost",
        440: "Connection Replaced",
        408: "Timed Out",
        401: "Logged Out",
        500: "Bad Session",
        515: "Restart Required",
        411: "Multidevice Mismatch"
    }

    constructor(message = "", ...args) {
        super(message, ...args);
        this.name = 'WhatsappError';
        this.code = Number(this.message);
        this.message = `Send message failed. Whatsapp error ${this.message}: ${this.#errors[this.code]}`;
    }
}

module.exports = { WhatsappClient, MessageType }