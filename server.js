const express = require('express');
const path = require('path');
const app = express();
const PORT = 8080;

app.use(express.static(__dirname));

// استخدام Regex بدلاً من النجمة لتجنب مشاكل الإصدارات
app.get(/^((?!\.).)*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});
