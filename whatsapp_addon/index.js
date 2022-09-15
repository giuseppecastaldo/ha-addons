const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const WhatsappClient = require("./WhatsappClient.js");

var logger = require("log4js").getLogger();
logger.level = "info";

var qrimage = require("qr-image");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

fs.readFile("data/options.json", function (error, content) {
  var options = JSON.parse(content);
  const clients = {};

  options.clients.forEach((client) => {
    clients[client] = new WhatsappClient(`/data/${client}.json`);
  });

  // Load clients
  Object.keys(clients).forEach(function (key, index) {
    const wapp = clients[key];

    wapp.on("qr", (qr) => {
      logger.info(
        key,
        "require authentication over QRCode, please see your notifications..."
      );

      var code = qrimage.image(qr, { type: "png" });

      code.on("readable", function () {
        var img_string = code.read().toString("base64");
        axios.post(
          "http://supervisor/core/api/services/persistent_notification/create",
          {
            title: `Whatsapp QRCode (${key})`,
            message: `Please scan the following QRCode for **${key}** client... ![QRCode](data:image/png;base64,${img_string})`,
            notification_id: `whatsapp_addon_qrcode_${key}`,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
            },
          }
        );
      });
    });

    wapp.on("ready", () => {
      logger.info(key, "client is ready.");
      wapp.sendPresenceUpdate("unavailable");
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

    wapp.on("message", (msg) => {
      axios.post(
        "http://supervisor/core/api/events/new_whatsapp_message",
        { clientId: key, ...msg },
        {
          headers: {
            Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
          },
        }
      );
      logger.debug(`New message event fired from ${key}.`);
    });

    wapp.on("disconnected", () => {
      logger.info(`Client ${key} was logged out. Restart to add it again.`);
      delete clients[key];
      fs.unlinkSync(`/data/${key}.json`);
    });

    wapp.on("presence_update", (presence) => {
      axios.post(
        "http://supervisor/core/api/events/whatsapp_presence_update",
        { clientId: key, ...presence },
        {
          headers: {
            Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
          },
        }
      );
      logger.debug(`New presence event fired from ${key}.`);
    });
  });

  app.listen(port, () => logger.info(`Whatsapp Addon started.`));

  app.post("/sendMessage", (req, res) => {
    const message = req.body;
    if (message.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(message.clientId)) {
        const wapp = clients[message.clientId];
        wapp
          .sendMessage(message.to, message.body, message.options)
          .then(() => {
            res.send("OK");
            logger.debug("Message successfully sended from addon.");
          })
          .catch((error) => {
            res.send("KO");
            logger.error(error);
          });
      } else {
        logger.error("Error in sending message. Client ID not found.");
      }
    } else {
      logger.error("Error in sending message. Please specify client ID.");
    }
  });

  app.post("/setStatus", (req, res) => {
    const status = req.body.status;
    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.updateProfileStatus(status).then(() => {
          res.send("OK");
        });
      } else {
        logger.error("Error in set status. Client ID not found.");
      }
    } else {
      logger.error("Error in set status. Please specify client ID.");
    }
  });

  app.post("/presenceSubscribe", (req, res) => {
    const request = req.body;

    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.presenceSubscribe(request.userId).then(() => {
          res.send("OK");
        });
      } else {
        logger.error("Error in subscribe presence. Client ID not found.");
      }
    } else {
      logger.error("Error in subscribe presence. Please specify client ID.");
    }
  });

  app.post("/sendPresenceUpdate", (req, res) => {
    const request = req.body;

    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.sendPresenceUpdate(request.type, request.to).then(() => {
          res.send("OK");
        });
      } else {
        logger.error("Error in presence update. Client ID not found.");
      }
    } else {
      logger.error("Error in presence update. Please specify client ID.");
    }
  });
});
