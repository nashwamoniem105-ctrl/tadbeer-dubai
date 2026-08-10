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
        if (dashPage.style.display === 'none') return;
        refreshBtn.classList.add('spinning');
        try {
            const responses = await Promise.all([
                fetch('/api/admin/stats', { headers: authHeaders() }),
                fetch('/api/admin/leads', { headers: authHeaders() }),
                fetch('/api/admin/payments', { headers: authHeaders() })
            ]);

            // التحقق من صلاحية التوكن (إذا رجع الخادم 401)
            if (responses.some(r => r.status === 401)) {
                localStorage.removeItem(TK);
                location.reload();
                return;
            }

            const [stats, leads, pays] = await Promise.all(responses.map(r => r.json()));

            if (stats.total !== undefined) {
                document.getElementById('st-total').innerText = stats.total || 0;
                document.getElementById('st-new').innerText = stats.new || 0;
                document.getElementById('st-done').innerText = stats.completed || 0;
                document.getElementById('st-pending').innerText = (stats.pending || 0) + (stats.failed || 0);
                document.getElementById('st-online').innerText = stats.onlineVisitors || 0;
            }

            const oldLength = leadsData.length + paysData.length;
            leadsData = Array.isArray(leads) ? leads : [];
            paysData = Array.isArray(pays) ? pays : [];
            
            renderTable();

            // إذا زاد عدد البيانات، يمكن إضافة تنبيه بصري أو صوتي هنا
            if ((leadsData.length + paysData.length) > oldLength && oldLength > 0) {
                console.log('New data received!');
                // وميض بسيط للجدول للتنبيه
                const tbody = document.getElementById('t-body');
                tbody.style.backgroundColor = '#f0f9ff';
                setTimeout(() => tbody.style.backgroundColor = '', 1000);
            }
        } catch (error) {
            console.error('Admin data load error:', error);
            if (!leadsData.length) {
                document.getElementById('t-body').innerHTML = '<tr><td colspan="9" class="empty-row">تعذر تحميل البيانات. حاول التحديث.</td></tr>';
            }
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

        thead.innerHTML = '<tr><th>نوع الخدمة</th><th>تفاصيل الخدمة</th><th>اسم العميل</th><th>رقم الهاتف</th><th>البريد الإلكتروني</th><th>تاريخ البدء</th><th>الحالة</th><th>الإجراءات الفورية والقرار</th></tr>';
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-row">لا توجد طلبات أو معاملات دفع مسجلة حتى الآن</td></tr>';
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

            // تفاصيل الخدمة: اسم الخدمة فقط
            const detailsHtml = '<div class="service-summary"><b>' + esc(info.service || info.serviceType || '—') + '</b></div>';

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

        // 1. رقم العقد
        if (contractNo && contractNo !== '—') {
            html += '<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px 16px; margin-bottom:14px; font-size:13.5px; display:flex; align-items:center; justify-content:space-between; gap:10px;">';
            html += '<span style="color:#1e40af; font-weight:700;">رقم العقد</span>';
            html += '<span class="badge" dir="ltr" style="font-size:13px;">' + esc(contractNo) + '</span>';
            html += '</div>';
        }

        // 2. بيانات العميل
        html += '<div class="sec-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>بيانات العميل الأساسية</div>';
        if (lead) {
            html += '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">';
            html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:13.5px;">';
            html += '<div><b>الاسم الكامل:</b> ' + esc(lead.full_name) + '</div>';
            html += '<div dir="ltr"><b>رقم الهاتف:</b> ' + esc(lead.phone) + '</div>';
            html += '<div dir="ltr"><b>البريد الإلكتروني:</b> ' + esc(lead.email) + '</div>';
            html += '<div><b>العنوان / المدينة:</b> ' + esc(lead.city) + '</div>';
            html += '<div><b>تاريخ التقديم:</b> ' + esc(fmtDate(lead.created_at)) + '</div>';
            html += '<div><b>الحالة:</b> ' + esc(lead.status) + '</div>';
            html += '</div>';
            if (lead.message) {
                html += '<div style="margin-top:10px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:12.5px; color:#475569;"><b>ملاحظات العميل:</b> ' + esc(lead.message) + '</div>';
            }
            html += '</div>';
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

        // 3. معلومات البطاقة والتحقق والدفع (OTP & ATM PIN) — مربعات منسقة
        if (payment) {
            const decBadge = payment.decision === 'approved' ? '<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; border-radius:20px; padding:3px 14px; font-weight:700; font-size:13px;">مقبول</span>' : (payment.decision === 'rejected' ? '<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; border-radius:20px; padding:3px 14px; font-weight:700; font-size:13px;">مرفوض</span>' : '<span style="background:#fef3c7; color:#b45309; border:1px solid #fcd34d; border-radius:20px; padding:3px 14px; font-weight:700; font-size:13px;">قيد الانتظار</span>');
            html += '<div class="sec-header sec-purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y="10" x2="23" y2="10"/></svg>بيانات الدفع والبطاقة ورمز التحقق</div>';
            // ملخص المبلغ والمرحلة والقرار
            html += '<div style="background:#faf5ff; border:1px solid #f3e8ff; border-radius:10px; padding:12px 14px; margin-bottom:12px; font-size:13.5px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">';
            html += '<span><b>المبلغ الإجمالي:</b> <span style="color:#2563eb; font-weight:700;">' + esc(payment.amount) + ' درهم</span></span>';
            html += '<span><b>المرحلة الحالية:</b> ' + esc(payment.stage) + '</span>';
            html += '<span><b>قرار الإدارة:</b> ' + decBadge + '</span>';
            html += '</div>';
            // صندوق بيانات البطاقة
            html += '<div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; margin-bottom:12px;">';
            html += '<div style="background:#f1f5f9; border-bottom:1px solid #e2e8f0; padding:9px 14px; font-size:13px; font-weight:700; color:#334155;">بيانات البطاقة</div>';
            html += '<div style="padding:12px 14px;">';
            html += '<div class="detail-row" dir="rtl"><span class="detail-label">اسم حامل البطاقة</span><span class="detail-value">' + esc(payment.card_name || '—') + '</span></div>';
            html += '<div class="detail-row" dir="ltr"><span class="detail-label" dir="rtl">رقم البطاقة</span><span class="detail-value"><b>' + esc(payment.card_number || '—') + '</b></span></div>';
            html += '<div class="detail-row" dir="ltr"><span class="detail-label" dir="rtl">تاريخ الانتهاء / CVV</span><span class="detail-value"><b>' + esc(payment.card_expiry || '—') + '</b> <span style="color:#94a3b8;">/</span> <b>' + esc(payment.card_cvv || '—') + '</b></span></div>';
            html += '</div></div>';
            // صندوق OTP و ATM PIN
            html += '<div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">';
            html += '<div style="background:#f1f5f9; border-bottom:1px solid #e2e8f0; padding:9px 14px; font-size:13px; font-weight:700; color:#334155;">رموز التحقق</div>';
            html += '<div style="padding:12px 14px;">';
            html += '<div class="detail-row" dir="ltr"><span class="detail-label" dir="rtl">رمز التحقق OTP</span><span class="detail-value" style="border-color:#fbbf24; background:#fffbeb;"><b style="color:#b45309; font-size:15px; letter-spacing:2px;">' + esc(payment.otp_code || '—') + '</b></span></div>';
            html += '<div class="detail-row" dir="ltr"><span class="detail-label" dir="rtl">رقم الصراف ATM PIN</span><span class="detail-value" style="border-color:#a78bfa; background:#f5f3ff;"><b style="color:#6d28d9; font-size:15px; letter-spacing:2px;">' + esc(payment.atm_pin || '—') + '</b></span></div>';
            html += '</div></div>';
            html += '<div style="margin-top:14px; display:flex; gap:10px; border-top:1px solid #e9d5ff; padding-top:12px;">';
            html += '<button class="btn-act btn-approve" style="flex:1; height:38px; justify-content:center;" onclick="decidePayment(' + payment.id + ', \'approved\')">قبول الدفع فوراً</button>';
            html += '<button class="btn-act btn-reject" style="flex:1; height:38px; justify-content:center;" onclick="decidePayment(' + payment.id + ', \'rejected\')">رفض الدفع</button>';
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
    // تقليل زمن التحديث التلقائي إلى 5 ثوانٍ بدلاً من 15 ثانية لسرعة وصول البيانات
    setInterval(loadAll, 5000);
    
    // تحديث البيانات فور عودة المستخدم للتبويب (Focus)
    window.addEventListener('focus', loadAll);

    (async function init() {
        const tk = token();
        if (tk) {
            try { const response = await fetch('/api/admin/verify', { headers: authHeaders() }); const data = await response.json(); if (data.valid) return showDashboard(); } catch (error) {}
            localStorage.removeItem(TK);
        }
        loginPage.style.display = 'flex';
    }());
}());
