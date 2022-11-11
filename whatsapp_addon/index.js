const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const { WhatsappClient } = require("./whatsapp");

var logger = require("log4js").getLogger();
logger.level = "info";

var qrimage = require("qr-image");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const clients = {};

const onReady = (key) => {
  logger.info(key, "client is ready.");
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
}

const onQr = (qr, key) => {
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
}

const onMsg = (msg, key) => {
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
}

const onPresenceUpdate = (presence, key) => {
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
}

const onLogout = async (key) => {
  logger.info(`Client ${key} was logged out. Restarting...`);
  fs.unlinkSync(`/data/${key}.json`);

  init(key);
}

const init = (key) => {
  clients[key] = new WhatsappClient({ path: `/data/${key}.json` });

  clients[key].on('restart', () => logger.debug(`${key} client restarting...`))
  clients[key].on("qr", (qr) => onQr(qr, key));
  clients[key].once("ready", () => onReady(key));
  clients[key].on("msg", (msg) => onMsg(msg, key));
  clients[key].on("logout", () => onLogout(key));
  clients[key].on("presence_update", (presence) => onPresenceUpdate(presence, key));
}

fs.readFile("data/options.json", function (error, content) {
  var options = JSON.parse(content);

  options.clients.forEach((key) => {
    init(key);
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
            logger.error(error.message);
          });
      } else {
        logger.error("Error in sending message. Client ID not found.");
        res.send("KO");
      }
    } else {
      logger.error("Error in sending message. Please specify client ID.");
      res.send("KO");
    }
  });

  app.post("/setStatus", (req, res) => {
    const status = req.body.status;
    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.updateProfileStatus(status).then(() => {
          res.send("OK");
        }).catch((error) => {
          res.send("KO");
          logger.error(error.message);
        });
      } else {
        logger.error("Error in set status. Client ID not found.");
        res.send("KO");
      }
    } else {
      logger.error("Error in set status. Please specify client ID.");
      res.send("KO");
    }
  });

  app.post("/presenceSubscribe", (req, res) => {
    const request = req.body;

    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.presenceSubscribe(request.userId).then(() => {
          res.send("OK");
        }).catch((error) => {
          res.send("KO");
          logger.error(error.message);
        });
      } else {
        logger.error("Error in subscribe presence. Client ID not found.");
        res.send("KO");
      }
    } else {
      logger.error("Error in subscribe presence. Please specify client ID.");
      res.send("KO");
    }
  });

  app.post("/sendPresenceUpdate", (req, res) => {
    const request = req.body;

    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.sendPresenceUpdate(request.type, request.to).then(() => {
          res.send("OK");
        }).catch((error) => {
          res.send("KO");
          logger.error(error.message)
        });
      } else {
        logger.error("Error in presence update. Client ID not found.");
        res.send("KO");
      }
    } else {
      logger.error("Error in presence update. Please specify client ID.");
      res.send("KO");
    }
  });

  app.post("/sendInfinityPresenceUpdate", (req, res) => {
    const request = req.body;

    if (req.body.hasOwnProperty("clientId")) {
      if (clients.hasOwnProperty(req.body.clientId)) {
        const wapp = clients[req.body.clientId];

        wapp.setSendPresenceUpdateInterval(request.type, request.to).then(() => {
          res.send("OK");
        }).catch((error) => {
          res.send("KO");
          logger.error(error.message)
        });
      } else {
        logger.error("Error in presence update. Client ID not found.");
        res.send("KO");
      }
    } else {
      logger.error("Error in presence update. Please specify client ID.");
      res.send("KO");
    }
  });
});