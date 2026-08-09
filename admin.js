(function () {
    'use strict';

    const TK = 'tdAdminToken';
    let leadsData = [];
    let paysData = [];

    const loginPage = document.getElementById('login-page');
    const dashPage = document.getElementById('dashboard-page');
    const pwInput = document.getElementById('pw-input');
    const loginBtn = document.getElementById('login-btn');
    const loginBtnText = document.getElementById('login-btn-text');
    const loginErr = document.getElementById('login-err');
    const eyeBtn = document.getElementById('eye-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('search-input');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    function token() { return localStorage.getItem(TK) || ''; }
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function fmtDate(value) {
        if (!value) return '—';
        const text = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split('-').reverse().join('/');
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('ar-AE');
    }
    function fmtDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ar-AE');
    }

    function parseServiceText(raw) {
        const source = String(raw || '').replace(/[\u200f\u200e]/g, '').trim();
        const result = { serviceType: '—', service: '—', duration: '—', workType: '—', workers: '—', nationality: '—', startDate: '—', startTime: '—' };
        if (!source) return result;
        source.split(/\s*\|\s*/).forEach(part => {
            const match = part.match(/^\s*([^:：]+)\s*[:：]\s*(.*)$/);
            if (!match) return;
            const key = match[1].trim().toLowerCase();
            const value = match[2].trim() || '—';
            if (/نوع الخدمة|service type/.test(key)) result.serviceType = value;
            else if (/^الخدمة$|^service$/.test(key)) result.service = value;
            else if (/المدة|duration/.test(key)) result.duration = value;
            else if (/نوع الدوام|work type/.test(key)) result.workType = value;
            else if (/عدد العمالة|workers?/.test(key)) result.workers = value;
            else if (/الجنسية|nationality/.test(key)) result.nationality = value;
            else if (/التاريخ|^date$|start date/.test(key)) result.startDate = value;
            else if (/الوقت|^time$|start time/.test(key)) result.startTime = value;
        });
        result.isHourly = /بالساعة|hourly/i.test(result.serviceType + ' ' + source);
        return result;
    }

    function serviceInfo(record, type) {
        const raw = type === 'lead' ? (record.message || '') : (record.service_info || '');
        const parsed = parseServiceText(raw);
        if (parsed.serviceType === '—' && raw) parsed.serviceType = raw;
        return parsed;
    }
    function latestPayment(contractNo) {
        return paysData.filter(p => p.contract_no === contractNo).sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''))).pop() || null;
    }
    function statusText(lead, payment) {
        if (payment && payment.decision === 'approved') return ['مقبول', 'status-done'];
        if (payment && payment.decision === 'rejected') return ['مرفوض', 'status-fail'];
        if (payment && payment.stage === 'success') return ['مكتمل', 'status-done'];
        if (payment && (payment.stage === 'card_initiated' || payment.stage === 'otp_verified')) return ['قيد المعالجة', 'status-card'];
        if (lead && lead.status === 'completed') return ['مكتمل', 'status-done'];
        return [lead && lead.status === 'new' ? 'جديد' : (lead && lead.status) || 'جديد', 'status-otp'];
    }
    function statusBadge(lead, payment) {
        const [label, cls] = statusText(lead, payment);
        return '<span class="' + cls + '">' + esc(label) + '</span>';
    }
    function authHeaders() { return { Authorization: 'Bearer ' + token() }; }

    async function doLogin(password) {
        const response = await fetch('/api/admin/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
        });
        return { ok: response.ok, data: await response.json() };
    }
    async function showDashboard() {
        loginPage.style.display = 'none';
        dashPage.style.display = 'block';
        await loadAll();
    }
    async function loadAll() {
        refreshBtn.classList.add('spinning');
        try {
            const [stats, leads, pays] = await Promise.all([
                fetch('/api/admin/stats', { headers: authHeaders() }).then(r => r.json()),
                fetch('/api/admin/leads', { headers: authHeaders() }).then(r => r.json()),
                fetch('/api/admin/payments', { headers: authHeaders() }).then(r => r.json())
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
        } catch (error) {
            console.error('Admin data load error:', error);
            document.getElementById('t-body').innerHTML = '<tr><td colspan="8" class="empty-row">تعذر تحميل البيانات. حاول التحديث.</td></tr>';
        } finally {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        }
    }

    function renderTable() {
        const query = (searchInput.value || '').trim().toLowerCase();
        const rows = leadsData.map(lead => ({ lead, payment: latestPayment(lead.contract_no) }));
        paysData.forEach(payment => {
            if (!rows.some(row => row.lead.contract_no === payment.contract_no)) rows.push({ lead: null, payment });
        });
        rows.sort((a, b) => String(b.lead?.created_at || b.payment?.updated_at || '').localeCompare(String(a.lead?.created_at || a.payment?.updated_at || '')));
        const filtered = query ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(query)) : rows;
        const thead = document.getElementById('t-head');
        const tbody = document.getElementById('t-body');
        thead.innerHTML = '<tr><th>نوع الخدمة</th><th>تفاصيل الخدمة</th><th>الاسم</th><th>الهاتف</th><th>البريد الإلكتروني</th><th>تاريخ البدء</th><th>الحالة</th><th>الإجراءات</th></tr>';
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-row">لا توجد طلبات مطابقة</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(({ lead, payment }) => {
            const record = lead || payment;
            const type = lead ? 'lead' : 'payment';
            const info = serviceInfo(record, type);
            const name = lead?.full_name || payment?.customer_name || '—';
            const phone = lead?.phone || '—';
            const email = lead?.email || '—';
            const date = info.startDate !== '—' ? info.startDate : fmtDate(lead?.created_at || payment?.created_at);
            const time = info.isHourly && info.startTime !== '—' ? '<span class="service-time">الساعة: ' + esc(info.startTime) + '</span>' : '';
            const details = '<div class="service-summary"><b>' + esc(info.service || '—') + '</b>' +
                '<span>المدة: ' + esc(info.duration) + '</span><span>العدد: ' + esc(info.workers) + '</span><span>الجنسية: ' + esc(info.nationality) + '</span>' + time + '</div>';
            const actions = lead
                ? '<button class="btn-act" onclick="openDetails(' + lead.id + ')">تفاصيل العميل</button>'
                : '<span class="muted-action">بيانات خدمة فقط</span>';
            return '<tr><td><span class="service-type">' + esc(info.serviceType) + '</span></td><td>' + details + '</td><td><strong>' + esc(name) + '</strong></td><td dir="ltr">' + esc(phone) + '</td><td dir="ltr">' + esc(email) + '</td><td>' + esc(date) + '</td><td>' + statusBadge(lead, payment) + '</td><td><div class="action-btns">' + actions + '</div></td></tr>';
        }).join('');
    }

    function detailField(label, value, direction) {
        return '<div class="detail-row"><div class="detail-label">' + esc(label) + '</div><div class="detail-value"' + (direction ? ' dir="' + direction + '"' : '') + '>' + esc(value || '—') + '</div></div>';
    }
    window.openDetails = function (id) {
        const lead = leadsData.find(item => item.id == id);
        if (!lead) return;
        modalTitle.innerText = 'بيانات العميل — ' + (lead.full_name || 'طلب جديد');
        modalBody.innerHTML = '<div class="detail-section-title">بيانات العميل</div>' +
            detailField('الاسم', lead.full_name) + detailField('رقم الهاتف', lead.phone, 'ltr') +
            detailField('البريد الإلكتروني', lead.email, 'ltr') + detailField('المدينة', lead.city);
        modal.classList.add('show');
    };
    function closeModal() { modal.classList.remove('show'); }
    document.getElementById('modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

    loginBtn.addEventListener('click', async () => {
        const password = pwInput.value.trim();
        if (!password) { loginErr.innerText = 'الرجاء إدخال كلمة المرور'; loginErr.style.display = 'block'; return; }
        loginBtn.disabled = true; loginBtnText.innerText = 'جاري الدخول...'; loginErr.style.display = 'none';
        try {
            const result = await doLogin(password);
            if (result.ok && result.data.token) { localStorage.setItem(TK, result.data.token); await showDashboard(); }
            else { loginErr.innerText = 'كلمة المرور غير صحيحة'; loginErr.style.display = 'block'; }
        } catch (error) { loginErr.innerText = 'تعذر الاتصال بالخادم'; loginErr.style.display = 'block'; }
        finally { loginBtn.disabled = false; loginBtnText.innerText = 'تسجيل الدخول'; }
    });
    pwInput.addEventListener('keydown', event => { if (event.key === 'Enter') loginBtn.click(); });
    eyeBtn.addEventListener('click', () => { pwInput.type = pwInput.type === 'password' ? 'text' : 'password'; });
    document.getElementById('logout-btn').addEventListener('click', () => { localStorage.removeItem(TK); dashPage.style.display = 'none'; loginPage.style.display = 'flex'; pwInput.value = ''; });
    refreshBtn.addEventListener('click', loadAll);
    searchInput.addEventListener('input', renderTable);
    setInterval(loadAll, 30000);
    (async function init() {
        const tk = token();
        if (tk) {
            try { const response = await fetch('/api/admin/verify', { headers: authHeaders() }); const data = await response.json(); if (data.valid) return showDashboard(); } catch (error) {}
            localStorage.removeItem(TK);
        }
        loginPage.style.display = 'flex';
    }());
}());

// لا تُعرض بيانات البطاقات أو رموز OTP/PIN في لوحة الإدارة.
