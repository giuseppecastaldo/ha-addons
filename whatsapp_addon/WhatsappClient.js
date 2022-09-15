const EventEmitter = require("events");

const makeWASocket = require("@adiwajshing/baileys").default;
const {
  DisconnectReason,
  useSingleFileAuthState,
  Browsers,
} = require("@adiwajshing/baileys");

class WhatsappClient extends EventEmitter {
  #sock;

  constructor(sessionPath) {
    super();
    var self = this;
    async function connectToWhatsApp() {
      const { state, saveState } = useSingleFileAuthState(sessionPath);

      self.#sock = makeWASocket({
        auth: state,
        syncFullHistory: false,
        browser: Browsers.macOS("Desktop"),
        logger: require("pino")({ level: "silent" }),
      });

      self.#sock.ev.on("creds.update", saveState);

      self.#sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          self.emit("qr", qr);
        }

        if (connection === "close") {
          const shouldReconnect =
            lastDisconnect.error.output?.statusCode !==
            DisconnectReason.loggedOut;
          if (shouldReconnect) {
            connectToWhatsApp();
          } else {
            self.emit("disconnected");
          }
        } else if (connection === "open") {
          self.emit("ready");
        }
      });

      self.#sock.ev.on("messages.upsert", (Message) => {
        let msg = Message.messages[0];
        if (!msg.key.fromMe) self.emit("message", msg);
      });

      self.#sock.ev.on("presence.update", (presence) => {
        self.emit("presence_update", presence);
      });
    }

    connectToWhatsApp();
  }

  async sendMessage(chatId, msg, options) {
    return await this.#sock.sendMessage(chatId, msg, options);
  }

  async presenceSubscribe(chatId) {
    return await this.#sock.presenceSubscribe(chatId);
  }

  async updateProfileStatus(status) {
    return await this.#sock.updateProfileStatus(status);
  }

  async updateProfileName(name) {
    return await this.#sock.updateProfileName(name);
  }

  async isOnWhatsapp(id) {
    return await this.#sock.onWhatsApp(id);
  }

  async updateBlockStatus(id, status) {
    return await this.#sock.updateBlockStatus(id, status);
  }

  async sendPresenceUpdate(type, id) {
    return await this.#sock.sendPresenceUpdate(type, id);
  }
}

module.exports = WhatsappClient;
