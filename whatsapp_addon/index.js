const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");

const execSync = require("child_process").execSync;

var logger = require("log4js").getLogger();
logger.level = "info";

const qrcode = require("qrcode-terminal");
var qrimage = require("qr-image");

const {
  Client,
  LocalAuth,
  MessageMedia,
  Location,
} = require("whatsapp-web.js");

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const wapp = new Client({
  authStrategy: new LocalAuth({
    dataPath: "/data/.wwebjs_auth/",
  }),
  puppeteer: {
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

const port = 3000;

wapp.on("qr", (qr) => {
  logger.info(
    "Addon require authentication over QRCode, please see your notifications..."
  );
  var code = qrimage.image(qr, { type: "png" });

  code.on("readable", function () {
    var img_string = code.read().toString("base64");
    axios.post(
      "http://supervisor/core/api/services/persistent_notification/create",
      {
        title: "Whatsapp Addon",
        message: `Please scan the following QRCode... ![QRCode](data:image/png;base64,${img_string})`,
        notification_id: "whatsapp_addon_qrcode",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        },
      }
    );
  });
});

wapp.on("authenticated", () => {
  axios.post(
    "http://supervisor/core/api/services/persistent_notification/dismiss",
    {
      notification_id: "whatsapp_addon_qrcode",
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
      },
    }
  );
});

wapp.on("ready", () => {
  app.listen(port, () => logger.info(`Whatsapp Addon started.`));

  app.post("/sendMessage", (req, res) => {
    const message = req.body;

    if (message.body.type == "text") {
      wapp
        .sendMessage(message.to, message.body.text, {
          linkPreview: message.body.link_preview,
          sendAudioAsVoice: message.body.send_audio_as_voice,
          sendVideoAsGif: message.body.send_video_as_gif,
          sendMediaAsSticker: message.body.send_media_as_sticker,
          sendMediaAsDocument: message.body.send_media_as_document,
          parseVCards: message.body.parse_vcards,
          caption: message.body.caption,
          quotedMessageId: message.body.quoted_message_id,
          mentions: message.body.mentions,
          sendSeen: message.body.send_seen,
          stickerAuthor: message.body.sticker_author,
          stickerName: message.body.sticker_name,
          stickerCategories: message.body.sticker_categories,
          media: message.body.media

        })
        .then(() => {
          res.send("OK");
          logger.info("Text message successfully sended from addon.");
        })
        .catch((error) => {
          res.send("KO");
          logger.error(error);
        });
    } else if (message.body.type == "media") {
      const media = new MessageMedia(
        message.body.mimetype,
        message.body.data,
        message.body.filename
      );

      wapp
        .sendMessage(message.to, media, {
          linkPreview: message.body.link_preview,
          sendAudioAsVoice: message.body.send_audio_as_voice,
          sendVideoAsGif: message.body.send_video_as_gif,
          sendMediaAsSticker: message.body.send_media_as_sticker,
          sendMediaAsDocument: message.body.send_media_as_document,
          parseVCards: message.body.parse_vcards,
          caption: message.body.caption,
          quotedMessageId: message.body.quoted_message_id,
          mentions: message.body.mentions,
          sendSeen: message.body.send_seen,
          stickerAuthor: message.body.sticker_author,
          stickerName: message.body.sticker_name,
          stickerCategories: message.body.sticker_categories,
          media: message.body.media

        })
        .then(() => {
          res.send("OK");
          logger.info("Media message successfully sended from addon.");
        })
        .catch((error) => {
          res.send("KO");
          logger.error(error);
        });
    } else if (message.body.type == "media_url") {
      MessageMedia.fromUrl(message.body.url).then((media) => {
        wapp
          .sendMessage(message.to, media, {
            linkPreview: message.body.link_preview,
            sendAudioAsVoice: message.body.send_audio_as_voice,
            sendVideoAsGif: message.body.send_video_as_gif,
            sendMediaAsSticker: message.body.send_media_as_sticker,
            sendMediaAsDocument: message.body.send_media_as_document,
            parseVCards: message.body.parse_vcards,
            caption: message.body.caption,
            quotedMessageId: message.body.quoted_message_id,
            mentions: message.body.mentions,
            sendSeen: message.body.send_seen,
            stickerAuthor: message.body.sticker_author,
            stickerName: message.body.sticker_name,
            stickerCategories: message.body.sticker_categories,
            media: message.body.media

          })
          .then(() => {
            res.send("OK");
            logger.info("Media message successfully sended from addon.");
          })
          .catch((error) => {
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

      wapp
        .sendMessage(message.to, location, {
          linkPreview: message.body.link_preview,
          sendAudioAsVoice: message.body.send_audio_as_voice,
          sendVideoAsGif: message.body.send_video_as_gif,
          sendMediaAsSticker: message.body.send_media_as_sticker,
          sendMediaAsDocument: message.body.send_media_as_document,
          parseVCards: message.body.parse_vcards,
          caption: message.body.caption,
          quotedMessageId: message.body.quoted_message_id,
          mentions: message.body.mentions,
          sendSeen: message.body.send_seen,
          stickerAuthor: message.body.sticker_author,
          stickerName: message.body.sticker_name,
          stickerCategories: message.body.sticker_categories,
          media: message.body.media

        })
        .then(() => {
          res.send("OK");
          logger.info("Location message successfully sended from addon.");
        })
        .catch((error) => {
          res.send("NOK");
          logger.error(error);
        });
    } else {
      logger.error("Incompatible media type.");
      res.status(422).send("Incompatible media type.");
    }
  });

  app.get('/state', (req, res) => {
    wapp.getState().then((state) => {
      res.send(state)
    })
  })
});

wapp.on("message", (msg) => {
  if (msg.body !== "") {
    axios.post("http://supervisor/core/api/events/new_whatsapp_message", msg, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
      },
    });
    logger.info("New message event fired from addon.");
  }
});

// Handling uninstallation or stop
process.on("SIGTERM", async () => {
  logger.info("Shutting down Whatsapp addon...");
  execSync("./finish.sh", { encoding: "utf-8" });
  await wapp.destroy();
  process.exit(0);
});

wapp.initialize();