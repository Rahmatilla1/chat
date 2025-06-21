const WebSocket = require('ws');
const PORT = process.env.PORT || 4001; // Render uchun PORT o‘zgaruvchisi

const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', function connection(ws) {
   ws.on('message', function incoming(message) {
    console.log('Qabul qilindi:', message.toString());
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
  });
});

console.log(`WebSocket server ${PORT}-portda ishlayapti`);