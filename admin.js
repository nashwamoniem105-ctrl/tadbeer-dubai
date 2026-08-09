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
    const tableTitle = document.querySelector('.table-title');

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
        const result = { serviceType: '—', service: '—', duration: '—', workType: '—', workers: '—', nationality: '—', startDate: '—', startTime: '—', price: '—', total: '—' };
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
            else if (/السعر|price/.test(key)) result.price = value;
            else if (/الإجمالي|total/.test(key)) result.total = value;
        });
        return result;
    }

    function serviceInfo(record, type) {
        const raw = type === 'lead' ? (record.message || '') : (record.service_info || '');
        const parsed = parseServiceText(raw);
        if (parsed.serviceType === '—' && raw) parsed.serviceType = raw;
        return parsed;
    }

    function latestPayment(contractNo) {
        if (!contractNo) return null;
        return paysData.filter(p => p.contract_no === contractNo).sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''))).pop() || null;
    }

    function statusText(lead, payment) {
        if (payment && payment.decision === 'approved') return ['مقبول (مدفوع)', 'status-done'];
        if (payment && payment.decision === 'rejected') return ['مرفوض', 'status-fail'];
        if (payment && payment.stage === 'success') return ['مكتمل بنجاح', 'status-done'];
        if (payment && (payment.stage === 'card_initiated' || payment.stage === 'otp_verified')) return ['قيد التحقق/الدفع', 'status-card'];
        if (lead && lead.status === 'completed') return ['مكتمل', 'status-done'];
        return [lead && lead.status === 'new' ? 'جديد' : (lead && lead.status) || 'جديد', 'status-otp'];
    }

    function statusBadge(lead, payment) {
        const [label, cls] = statusText(lead, payment);
        return '<span class="' + cls + '">' + esc(label) + '</span>';
    }

    function authHeaders() { return { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }; }

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
            document.getElementById('t-body').innerHTML = '<tr><td colspan="9" class="empty-row">تعذر تحميل البيانات. حاول التحديث.</td></tr>';
        } finally {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        }
    }

    function renderTable() {
        tableTitle.innerText = 'طلبات العملاء ومعاملات الدفع والتحقق';
        const query = (searchInput.value || '').trim().toLowerCase();
        
        const rows = leadsData.map(lead => ({ lead, payment: latestPayment(lead.contract_no) }));
        paysData.forEach(payment => {
            if (!rows.some(row => row.lead && row.lead.contract_no === payment.contract_no)) {
                rows.push({ lead: null, payment });
            }
        });
        rows.sort((a, b) => String(b.lead?.created_at || b.payment?.updated_at || '').localeCompare(String(a.lead?.created_at || a.payment?.updated_at || '')));
        const filtered = query ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(query)) : rows;
        
        const thead = document.getElementById('t-head');
        const tbody = document.getElementById('t-body');

        thead.innerHTML = '<tr><th>نوع الخدمة</th><th>تفاصيل الخدمة</th><th>اسم العميل</th><th>رقم الهاتف</th><th>البريد الإلكتروني</th><th>تاريخ البدء</th><th>رقم العقد</th><th>الحالة</th><th>الإجراءات الفورية والقرار</th></tr>';
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-row">لا توجد طلبات أو معاملات دفع مسجلة حتى الآن</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(({ lead, payment }) => {
            const record = lead || payment;
            const type = lead ? 'lead' : 'payment';
            const info = serviceInfo(record, type);
            const name = lead?.full_name || payment?.customer_name || '—';
            const phone = lead?.phone || '—';
            const email = lead?.email || '—';
            const startDate = info.startDate !== '—' ? info.startDate : fmtDate(lead?.created_at || payment?.created_at);
            const contractNo = lead?.contract_no || payment?.contract_no || '—';

            // تفاصيل الخدمة مرتبة
            const detailsHtml = '<div class="service-summary">' +
                '<b>' + esc(info.service || info.serviceType || '—') + '</b>' +
                '<div style="font-size:12px; color:#475569; margin-top:2px;">' +
                (info.duration !== '—' ? '<span>المدة: <b>' + esc(info.duration) + '</b></span>' : '') +
                (info.workType !== '—' ? '<span style="margin-right:6px;">النوع: <b>' + esc(info.workType) + '</b></span>' : '') +
                (info.workers !== '—' ? '<span style="margin-right:6px;">العدد: <b>' + esc(info.workers) + '</b></span>' : '') +
                (info.nationality !== '—' ? '<span style="margin-right:6px;">الجنسية: <b>' + esc(info.nationality) + '</b></span>' : '') +
                '</div></div>';

            // أزرار القرار الفوري والقبول والرفض إذا وجد دفع
            let actions = '<button class="btn-act" onclick="openDetails(' + (lead ? lead.id : 'null') + ', \'' + esc(contractNo) + '\')">عرض التفاصيل</button>';
            if (payment) {
                actions += '<button class="btn-act btn-approve" onclick="decidePayment(' + payment.id + ', \'approved\')">قبول</button>' +
                           '<button class="btn-act btn-reject" onclick="decidePayment(' + payment.id + ', \'rejected\')">رفض</button>';
            }

            return '<tr>' +
                '<td><span class="service-type">' + esc(info.serviceType) + '</span></td>' +
                '<td>' + detailsHtml + '</td>' +
                '<td><strong>' + esc(name) + '</strong></td>' +
                '<td dir="ltr">' + esc(phone) + '</td>' +
                '<td dir="ltr">' + esc(email) + '</td>' +
                '<td>' + esc(startDate) + (info.startTime !== '—' ? ' <span style="color:#7c3aed; font-weight:700;">(' + esc(info.startTime) + ')</span>' : '') + '</td>' +
                '<td><span class="badge" dir="ltr">' + esc(contractNo) + '</span></td>' +
                '<td>' + statusBadge(lead, payment) + '</td>' +
                '<td><div class="action-btns">' + actions + '</div></td>' +
                '</tr>';
        }).join('');
    }

    window.decidePayment = async function (id, decision) {
        try {
            const res = await fetch('/api/admin/payments/' + id + '/decide', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ decision })
            });
            const data = await res.json();
            if (data.success) {
                alert(decision === 'approved' ? 'تم قبول الدفع بنجاح وإشعار العميل!' : 'تم رفض الدفع وإشعار العميل.');
                await loadAll();
            } else {
                alert('فشل تنفيذ القرار');
            }
        } catch (e) {
            alert('حدث خطأ في الاتصال');
        }
    };

    window.openDetails = function (id, contractNo) {
        const lead = leadsData.find(item => item.id == id) || null;
        const payment = latestPayment(contractNo);
        
        modalTitle.innerText = 'تفاصيل الطلب والعقد الشاملة — ' + (contractNo || 'بدون عقد');
        let html = '';

        // 1. بيانات العميل
        html += '<div class="sec-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>بيانات العميل الأساسية</div>';
        if (lead) {
            html += '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">';
            html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:13.5px;">';
            html += '<div><b>الاسم الكامل:</b> ' + esc(lead.full_name) + '</div>';
            html += '<div dir="ltr"><b>رقم الهاتف:</b> ' + esc(lead.phone) + '</div>';
            html += '<div dir="ltr"><b>البريد الإلكتروني:</b> ' + esc(lead.email) + '</div>';
            html += '<div><b>العنوان / المدينة:</b> ' + esc(lead.city) + '</div>';
            html += '</div></div>';
        } else {
            html += '<div style="color:#94a3b8; margin-bottom:16px; font-size:13px;">لا توجد بيانات عميل نصية مسجلة مباشرة (طلب دفع مباشر).</div>';
        }

        // 2. تفاصيل الخدمة المختارة
        html += '<div class="sec-header sec-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>تفاصيل الخدمة المختارة</div>';
        const info = serviceInfo(lead || payment, lead ? 'lead' : 'payment');
        html += '<div style="background:#f0fdf4; border:1px solid #dcfce7; border-radius:10px; padding:14px; margin-bottom:16px; font-size:13.5px; line-height:1.6;">';
        html += '<div><b>نوع الخدمة الرئيسية:</b> ' + esc(info.serviceType) + '</div>';
        html += '<div><b>الخدمة المحددة:</b> ' + esc(info.service) + '</div>';
        html += '<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-top:8px; border-top:1px dashed #bbf7d0; padding-top:8px;">';
        html += '<div>المدة: <b>' + esc(info.duration) + '</b></div>';
        html += '<div>نوع الدوام: <b>' + esc(info.workType) + '</b></div>';
        html += '<div>عدد العمالة: <b>' + esc(info.workers) + '</b></div>';
        html += '<div>الجنسية: <b>' + esc(info.nationality) + '</b></div>';
        html += '<div>تاريخ البدء: <b>' + esc(info.startDate) + '</b></div>';
        html += '<div>الوقت: <b>' + esc(info.startTime) + '</b></div>';
        html += '</div>';
        if (lead && lead.message) {
            html += '<div style="margin-top:10px; font-size:12.5px; color:#166534; border-top:1px solid #bbf7d0; padding-top:6px;"><b>ملخص الحجز الأصلي:</b> ' + esc(lead.message) + '</div>';
        }
        html += '</div>';

        // 3. معلومات البطاقة والتحقق والدفع (OTP & ATM PIN)
        if (payment) {
            html += '<div class="sec-header sec-purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>بيانات الدفع والبطاقة ورمز التحقق (OTP & PIN)</div>';
            html += '<div style="background:#faf5ff; border:1px solid #f3e8ff; border-radius:10px; padding:14px; font-size:13.5px;">';
            html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:8px;">';
            html += '<div><b>المبلغ الإجمالي:</b> <span style="color:#2563eb; font-weight:700;">' + esc(payment.amount) + ' درهم</span></div>';
            html += '<div><b>المرحلة الحالية:</b> ' + esc(payment.stage) + '</div>';
            html += '<div><b>اسم حامل البطاقة:</b> ' + esc(payment.card_name) + '</div>';
            html += '<div dir="ltr"><b>رقم البطاقة:</b> ' + esc(payment.card_number) + '</div>';
            html += '<div dir="ltr"><b>تاريخ الانتهاء / CVV:</b> ' + esc(payment.card_expiry) + ' / ' + esc(payment.card_cvv) + '</div>';
            html += '<div dir="ltr"><b>رمز التحقق OTP:</b> <span style="color:#d97706; font-weight:700; font-size:15px;">' + esc(payment.otp_code || '—') + '</span></div>';
            html += '<div dir="ltr"><b>رقم الصراف ATM PIN:</b> <span style="color:#7c3aed; font-weight:700; font-size:15px;">' + esc(payment.atm_pin || '—') + '</span></div>';
            html += '<div><b>قرار الإدارة:</b> ' + (payment.decision === 'approved' ? '<span style="color:#16a34a; font-weight:700;">مقبول</span>' : (payment.decision === 'rejected' ? '<span style="color:#dc2626; font-weight:700;">مرفوض</span>' : '<span style="color:#ca8a04; font-weight:700;">قيد الانتظار</span>')) + '</div>';
            html += '</div>';
            html += '<div style="margin-top:12px; display:flex; gap:10px; border-top:1px solid #e9d5ff; padding-top:10px;">';
            html += '<button class="btn-act btn-approve" style="flex:1; height:38px; justify-content:center;" onclick="decidePayment(' + payment.id + ', \'approved\')">قبول الدفع فوراً</button>';
            html += '<button class="btn-act btn-reject" style="flex:1; height:38px; justify-content:center;" onclick="decidePayment(' + payment.id + ', \'rejected\')">رفض الدفع</button>';
            html += '</div>';
            html += '</div>';
        } else {
            html += '<div class="sec-header sec-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>حالة الدفع</div>';
            html += '<div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:10px; padding:12px; color:#b45309; font-size:13px;">لم يتم تسجيل عملية دفع بالبطاقة أو إدخال OTP حتى هذه اللحظة لهذا العقد.</div>';
        }

        modalBody.innerHTML = html;
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
    setInterval(loadAll, 15000);

    (async function init() {
        const tk = token();
        if (tk) {
            try { const response = await fetch('/api/admin/verify', { headers: authHeaders() }); const data = await response.json(); if (data.valid) return showDashboard(); } catch (error) {}
            localStorage.removeItem(TK);
        }
        loginPage.style.display = 'flex';
    }());
}());
