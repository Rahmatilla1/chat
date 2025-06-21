const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const PORT = process.env.PORT || 4001;

const app = express();
app.use(bodyParser.json());

const vapidKeys = {
  publicKey: 'BO9Yb27493XMq3AOqzZ67k81BELQxTjULRSoymwwi0W4ihVg4yFkcEgeoZTKXvfVdVM4_yhC_QVYQc54-THfkSY',
  privateKey: 'QbxrsqzodqIcq9gvk0LQRzMGknahZCvzcJFdI0cr3hU'
};

webpush.setVapidDetails(
  'mailto:your@email.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

let subscriptions = [];

// Subscription qabul qilish endpointi
app.post('/subscribe', (req, res) => {
  subscriptions.push(req.body);
  res.status(201).json({});
});

// HTTP server va WebSocket birga ishlashi uchun
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log('Qabul qilindi:', message.toString());
    // WebSocket orqali xabarlarni barcha clientlarga yuborish
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    // Push notification yuborish
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, JSON.stringify({
        title: 'Yangi xabar!',
        body: message.toString()
      })).catch(err => console.error(err));
    });
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server ${PORT}-portda ishlayapti`);
});