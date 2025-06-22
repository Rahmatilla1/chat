const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const cors = require('cors');
const PORT = process.env.PORT || 4001;

const app = express();
app.use(bodyParser.json());
app.use(cors());

const USERS_FILE = 'users.json';
let users = []; // { username, password, contacts: [] }
let sessions = {}; // { token: username }

// Foydalanuvchilarni fayldan yuklash
if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

// Ro'yxatdan o'tish
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    users.push({ username, password, contacts: [] });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// Login
function generateToken() {
    return Math.random().toString(36).substr(2, 16);
}
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken();
    sessions[token] = username;
    res.json({ token, username });
});

// Barcha foydalanuvchilar ro'yxati (parolsiz)
app.get('/users', (req, res) => {
    res.json(users.map(u => ({ username: u.username })));
});

// Foydalanuvchining kontaktlari
app.get('/contacts', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const user = users.find(u => u.username === username);
    res.json(user.contacts || []);
});

// Kontaktga qo'shish
app.post('/contacts/add', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const { contact } = req.body;
    const user = users.find(u => u.username === username);
    if (!user.contacts.includes(contact) && contact !== username) {
        user.contacts.push(contact);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
    res.json({ success: true });
});

// WebSocket va chat kodlari (o'zgarmaydi)
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        let msgObj;
        try { msgObj = JSON.parse(message); } catch (e) { return; }
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msgObj));
            }
        });
    });
});
server.listen(PORT, () => {
    console.log(`WebSocket server ${PORT}-portda ishlayapti`);
});