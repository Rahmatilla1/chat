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
const CHATS_FILE = 'chats.json';
let users = [];
let sessions = {};
let chats = {}; // { "user1|user2": [ {from, to, text, time}, ... ] }

// Foydalanuvchilarni va chatlarni yuklash
if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
if (fs.existsSync(CHATS_FILE)) chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));

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

// Kontaktlar
app.get('/contacts', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const user = users.find(u => u.username === username);
    res.json(user.contacts || []);
});
app.get('/users', (req, res) => {
    res.json(users.map(u => ({ username: u.username })));
});
app.post('/contacts/add', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const { contact } = req.body;
    const user = users.find(u => u.username === username);
    if (!user.contacts.includes(contact) && contact !== username) {
        user.contacts.push(contact);
        // YANGI QATOR: Faylga yozishdan oldin users massivini konsolda tekshiring
        console.log('Yangi contacts:', users);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
    res.json({ success: true });
});

// Chat tarixini olish (faqat ikki user o‘rtasida)
app.get('/chat/:withUser', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const withUser = req.params.withUser;
    const key = [username, withUser].sort().join('|');
    res.json(chats[key] || []);
});

// Xabar yuborish (faqat ikki user o‘rtasida)
app.post('/chat/send', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const { to, text } = req.body;
    const key = [username, to].sort().join('|');
    if (!chats[key]) chats[key] = [];
    chats[key].push({ from: username, to, text, time: Date.now() });
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
    res.json({ success: true });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        // Bu joyda umumiy chat uchun kod bo‘lsa, uni olib tashlang yoki faqat private chat uchun ishlating
    });
});
server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlayapti`);
});