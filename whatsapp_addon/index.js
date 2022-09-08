const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fs = require('fs');
const execSync = require("child_process").execSync;

var logger = require("log4js").getLogger();
logger.level = "info";

var qrimage = require("qr-image");
const QRCode = require('easyqrcodejs-nodejs');

const {
  Client,
  LocalAuth,
  MessageMedia,
  Location,
  Buttons
} = require("whatsapp-web.js");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

fs.readFile('data/options.json', function (error, content) {
  var options = JSON.parse(content);
  const clients = {};

  options.clients.forEach((client) => {
    clients[client] = new Client({
      authStrategy: new LocalAuth({
        dataPath: "/data/.wwebjs_auth/",
        clientId: client
      }),
      puppeteer: {
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });
  })

  Object.keys(clients).forEach(function (key, index) {
    const wapp = clients[key]

    wapp.on("qr", (qr) => {
      logger.info(key, "require authentication over QRCode, please see your notifications...");

      var options = {
        text: qr,
        quietZone: 15,
        quietZoneColor: '#ffffff',
        logo: "qr_icon.png",
        logoBackgroundTransparent: true
      };

      var qrcode = new QRCode(options);

      var qrcode = new QRCode(options);
      qrcode.toDataURL().then(data => {
        axios.post(
          "http://supervisor/core/api/services/persistent_notification/create",
          {
            title: `QRCode (${key})`,
            message: `Please scan the following QRCode for **${key}** client... ![QRCode](${data})`,
            notification_id: `whatsapp_addon_qrcode_${key}`,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
            },
          }
        );
      }).catch((error) => {
        logger.error(error)
      });
    });

    wapp.on("authenticated", () => {
      axios.post(
        "http://supervisor/core/api/services/persistent_notification/dismiss",
        {
          notification_id: `whatsapp_addon_qrcode_${key}`,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
          },
        }
      );
    });

    wapp.on("ready", () => {
      logger.info(key, "client is ready.")
    });

    wapp.on("message", (msg) => {
      if (msg.body !== "") {
        axios.post("http://supervisor/core/api/events/new_whatsapp_message", { client_id: key, ...msg }, {
          headers: {
            Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
          },
        });
        logger.debug(`New message event fired from ${key}.`);
      }
    });

    wapp.on("message_revoke_everyone", (after, before) => {
      axios.post("http://supervisor/core/api/events/whatsapp_message_revoke_everyone", { client_id: key, after: after, before: before }, {
        headers: {
          Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        },
      });
      logger.debug(`New message revoked event fired from ${key}.`);
    });

    wapp.on('disconnected', (reason) => {
      logger.info(`Client ${key} was logged out. Reason:`, reason);
    });

    wapp.initialize();
  });

  app.listen(port, () => logger.info(`Whatsapp Addon started.`));

  app.post("/sendMessage", (req, res) => {
    const message = req.body;
    const wapp = clients[message.client_id];

    if (message.body.type == "text") {
      wapp.sendMessage(message.to, message.body.text, {
        linkPreview: message.body.options?.link_preview,
        sendAudioAsVoice: message.body.options?.send_audio_as_voice,
        sendVideoAsGif: message.body.options?.send_video_as_gif,
        sendMediaAsSticker: message.body.options?.send_media_as_sticker,
        sendMediaAsDocument: message.body.options?.send_media_as_document,
        parseVCards: message.body.options?.parse_vcards,
        caption: message.body.options?.caption,
        quotedMessageId: message.body.options?.quoted_message_id,
        mentions: message.body.options?.mentions,
        sendSeen: message.body.options?.send_seen,
        stickerAuthor: message.body.options?.sticker_author,
        stickerName: message.body.options?.sticker_name,
        stickerCategories: message.body.options?.sticker_categories,
        media: message.body.options?.media
      }).then(() => {
        res.send("OK");
        logger.debug("Text message successfully sended from addon.");
      }).catch((error) => {
        res.send("KO");
        logger.error(error);
      });
    } else if (message.body.type == "media") {
      const media = new MessageMedia(
        message.body.mimetype,
        message.body.data,
        message.body.filename
      );

      wapp.sendMessage(message.to, media, {
        linkPreview: message.body.options?.link_preview,
        sendAudioAsVoice: message.body.options?.send_audio_as_voice,
        sendVideoAsGif: message.body.options?.send_video_as_gif,
        sendMediaAsSticker: message.body.options?.send_media_as_sticker,
        sendMediaAsDocument: message.body.options?.send_media_as_document,
        parseVCards: message.body.options?.parse_vcards,
        caption: message.body.options?.caption,
        quotedMessageId: message.body.options?.quoted_message_id,
        mentions: message.body.options?.mentions,
        sendSeen: message.body.options?.send_seen,
        stickerAuthor: message.body.options?.sticker_author,
        stickerName: message.body.options?.sticker_name,
        stickerCategories: message.body.options?.sticker_categories,
        media: message.body.options?.media

      }).then(() => {
        res.send("OK");
        logger.debug("Media message successfully sended from addon.");
      }).catch((error) => {
        res.send("KO");
        logger.error(error);
      });
    } else if (message.body.type == "media_url") {
      MessageMedia.fromUrl(message.body.url).then((media) => {
        wapp.sendMessage(message.to, media, {
          linkPreview: message.body.options?.link_preview,
          sendAudioAsVoice: message.body.options?.send_audio_as_voice,
          sendVideoAsGif: message.body.options?.send_video_as_gif,
          sendMediaAsSticker: message.body.options?.send_media_as_sticker,
          sendMediaAsDocument: message.body.options?.send_media_as_document,
          parseVCards: message.body.options?.parse_vcards,
          caption: message.body.options?.caption,
          quotedMessageId: message.body.options?.quoted_message_id,
          mentions: message.body.options?.mentions,
          sendSeen: message.body.options?.send_seen,
          stickerAuthor: message.body.options?.sticker_author,
          stickerName: message.body.options?.sticker_name,
          stickerCategories: message.body.options?.sticker_categories,
          media: message.body.options?.media

        }).then(() => {
          res.send("OK");
          logger.debug("Media message successfully sended from addon.");
        }).catch((error) => {
          res.send("KO");
          logger.error(error);
        });
      });
    } else if (message.body.type == "location") {
      const location = new Location(
        message.body.latitude,
        message.body.longitude,
        message.body.description
      );

      wapp.sendMessage(message.to, location, {
        linkPreview: message.body.options?.link_preview,
        sendAudioAsVoice: message.body.options?.send_audio_as_voice,
        sendVideoAsGif: message.body.options?.send_video_as_gif,
        sendMediaAsSticker: message.body.options?.send_media_as_sticker,
        sendMediaAsDocument: message.body.options?.send_media_as_document,
        parseVCards: message.body.options?.parse_vcards,
        caption: message.body.options?.caption,
        quotedMessageId: message.body.options?.quoted_message_id,
        mentions: message.body.options?.mentions,
        sendSeen: message.body.options?.send_seen,
        stickerAuthor: message.body.options?.sticker_author,
        stickerName: message.body.options?.sticker_name,
        stickerCategories: message.body.options?.sticker_categories,
        media: message.body.options?.media
      }).then(() => {
        res.send("OK");
        logger.debug("Location message successfully sended from addon.");
      }).catch((error) => {
        res.send("NOK");
        logger.error(error);
      });
    } else if (message.body.type == "buttons") {
      logger.debug(JSON.stringify(message))
      const buttons = new Buttons(
        message.body.buttons.body,
        message.body.buttons.buttons,
        message.body.buttons.title,
        message.body.buttons.footer
      )

      wapp.sendMessage(message.to, buttons, {
        linkPreview: message.body.options?.link_preview,
        sendAudioAsVoice: message.body.options?.send_audio_as_voice,
        sendVideoAsGif: message.body.options?.send_video_as_gif,
        sendMediaAsSticker: message.body.options?.send_media_as_sticker,
        sendMediaAsDocument: message.body.options?.send_media_as_document,
        parseVCards: message.body.options?.parse_vcards,
        caption: message.body.options?.caption,
        quotedMessageId: message.body.options?.quoted_message_id,
        mentions: message.body.options?.mentions,
        sendSeen: message.body.options?.send_seen,
        stickerAuthor: message.body.options?.sticker_author,
        stickerName: message.body.options?.sticker_name,
        stickerCategories: message.body.options?.sticker_categories,
        media: message.body.options?.media
      }).then(() => {
        res.send("OK");
        logger.debug("Buttons message successfully sended from addon.");
      }).catch((error) => {
        res.send("NOK");
        logger.error(error);
      });
    } else {
      logger.error("Incompatible media type.");
      res.status(422).send("Incompatible media type.");
    }
  });

  app.post("/setStatus", (req, res) => {
    const status = req.body.status
    const wapp = clients[req.body.client_id];

    wapp.setStatus(status).then(() => {
      res.send('OK')
    })
  })

  app.get('/state', (req, res) => {
    res.send('OK')
  })

  process.on("SIGTERM", async () => {
    Object.keys(clients).forEach(async (key, index) => {
      const wapp = clients[key]
      await wapp.destroy();
      logger.debug(`Client ${key} destroyed.`);
    })
    execSync("./finish.sh", { encoding: "utf-8" });
    process.exit(0);
  });
});