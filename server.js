const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'data.json');

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], requests: [], contacts: [] }));
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// معالجة يدوية لكافة طلبات الـ API
app.use('/api', (req, res, next) => {
    // إذا كان الطلب POST لإنشاء مستخدم أو طلب، نمرره للمرحلة التالية
    if (req.method === 'POST') return next();

    // استخراج المنفذ والمسار من URL
    // URL format: /8002/api/content/Search/en/homePage.html
    const parts = req.path.split('/').filter(p => p);
    if (parts.length < 1) return res.status(404).send('Not Found');

    const port = parts[0];
    const rest = parts.slice(1).join('/');
    
    const possiblePaths = [
        path.join(__dirname, 'api', port, 'api', rest),
        path.join(__dirname, 'api', port, 'api', rest + '.html'),
        path.join(__dirname, 'api', port, rest),
        path.join(__dirname, 'api', port, rest + '.html')
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
            return res.sendFile(p);
        }
    }
    
    res.status(404).json({ error: 'Not Found in cache', port, path: rest });
});

app.post('/api/users', (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const newUser = { id: data.users.length + 1, ...req.body, created_at: new Date() };
    data.users.push(newUser);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.status(201).json(newUser);
});

app.post('/api/requests', (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const newRequest = { id: data.requests.length + 1, ...req.body, status: 'pending', created_at: new Date() };
    data.requests.push(newRequest);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.status(201).json(newRequest);
});

app.get(/^((?!\.).)*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
