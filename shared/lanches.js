/* lanches.js — Favela Brass Lanches Dashboard v2
 *
 * Full daily ordering workflow: plan → confirm → deliver/cancel.
 * Drives: Pedido, Histórico, Notas Fiscais, Configuração tabs.
 */

// ── API client ──────────────────────────────────────────────────────────────

var LanchesAPI = {
    BASE: '/api/lanches',

    request: function(method, path, body) {
        var opts = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch(this.BASE + path, opts).then(function(resp) {
            if (!resp.ok) {
                return resp.text().then(function(txt) { throw new Error(txt); });
            }
            return resp.json();
        });
    },

    // Config
    getConfig: function()           { return this.request('GET', '/config'); },
    updateConfig: function(data)    { return this.request('PUT', '/config', data); },

    // Activities
    getActivities: function()       { return this.request('GET', '/activities'); },
    toggleActivity: function(id, d) { return this.request('PUT', '/activities/' + id, d); },

    // Daily
    getDaily: function(week)        { return this.request('GET', '/daily?week=' + (week || '')); },
    confirmDaily: function(id, d)   { return this.request('PUT', '/daily/' + id + '/confirm', d); },
    recordActual: function(id, d)   { return this.request('PUT', '/daily/' + id + '/actual', d); },
    cancelDaily: function(id, d)    { return this.request('PUT', '/daily/' + id + '/cancel', d || {}); },
    addExtra: function(d)           { return this.request('POST', '/daily/extra', d); },

    // Defaults
    getDefaults: function()         { return this.request('GET', '/defaults'); },
    updateDefault: function(day, d) { return this.request('PUT', '/defaults/' + encodeURIComponent(day), d); },

    // History
    getHistory: function(year, month) {
        return this.request('GET', '/history?year=' + year + '&month=' + month);
    },

    // Invoices
    getInvoices: function(year)     { return this.request('GET', '/invoices?year=' + year); },
    updateInvoice: function(id, d)  { return this.request('PUT', '/invoices/' + id, d); },
    generateInvoices: function(d)   { return this.request('POST', '/invoices/generate', d); },

    // Budget
    getBudget: function()           { return this.request('GET', '/budget'); },
};


// ── Toast ───────────────────────────────────────────────────────────────────

function showToast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 2500);
}


// ── Helpers ─────────────────────────────────────────────────────────────────

var WEEKDAY_PT = {
    '2a - Segunda': 'Segunda', '3a - Terça': 'Terça',
    '4a - Quarta': 'Quarta',  '5a - Quinta': 'Quinta',
    '6a - Sexta': 'Sexta',    'Sábado': 'Sábado',
};

var MONTH_NAMES = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatDate(dateStr) {
    var parts = dateStr.split('-');
    return parts[2] + '/' + parts[1];
}

function formatBRL(amount) {
    if (amount == null || amount === 0) return 'R$ 0,00';
    return 'R$ ' + amount.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getMondayOfWeek(d) {
    var dt = new Date(d + 'T12:00:00');
    var day = dt.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    return dt.toISOString().slice(0, 10);
}

function addWeeks(dateStr, n) {
    var dt = new Date(dateStr + 'T12:00:00');
    dt.setDate(dt.getDate() + 7 * n);
    return dt.toISOString().slice(0, 10);
}

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
}


// ── Main App ────────────────────────────────────────────────────────────────

var LanchesApp = {

    currentWeek: null,    // YYYY-MM-DD (Monday)
    currentYear: null,
    currentMonth: null,
    weekData: null,       // last API response for pedido
    costPerHead: 10.0,

    // ── Init ────────────────────────────────────────────────────────────────

    init: function() {
        var today = todayStr();
        this.currentWeek = getMondayOfWeek(today);
        this.currentYear = new Date().getFullYear();
        this.currentMonth = new Date().getMonth() + 1;
        this.loadWeek();
        this.initHistorySelector();
        this.initNFSESelector();
    },

    // ── Pedido tab ──────────────────────────────────────────────────────────

    prevWeek: function() {
        this.currentWeek = addWeeks(this.currentWeek, -1);
        this.loadWeek();
    },

    nextWeek: function() {
        this.currentWeek = addWeeks(this.currentWeek, 1);
        this.loadWeek();
    },

    loadWeek: function() {
        var self = this;
        var container = document.getElementById('pedido-content');
        container.innerHTML = '<div class="loading">Carregando</div>';

        LanchesAPI.getDaily(this.currentWeek).then(function(data) {
            self.weekData = data;
            self.costPerHead = data.cost_per_head || 10;
            self.renderWeek(data);
        }).catch(function(err) {
            container.innerHTML = '<div class="empty-state">Erro ao carregar: ' + err.message + '</div>';
        });
    },

    renderWeek: function(data) {
        var days = data.days || [];
        var container = document.getElementById('pedido-content');

        // Week label
        var label = document.getElementById('week-label');
        if (label) {
            var ws = data.week_start.split('-');
            var we = data.week_end.split('-');
            label.textContent = ws[2] + '/' + ws[1] + ' — ' + we[2] + '/' + we[1] + '/' + we[0];
        }

        // Stats
        var totalSessions = 0, totalPlanned = 0, totalConfirmed = 0;
        days.forEach(function(day) {
            totalSessions += day.entries.length;
            totalPlanned += day.total_planned || 0;
            totalConfirmed += day.total_confirmed || 0;
        });
        var bestTotal = totalConfirmed || totalPlanned;

        this._setText('stat-sessions', totalSessions);
        this._setText('stat-planned', totalPlanned);
        this._setText('stat-confirmed', totalConfirmed || '—');
        this._setText('stat-cost', formatBRL(bestTotal * this.costPerHead));

        if (!days.length) {
            container.innerHTML = '<div class="empty-state">Nenhuma atividade com lanche nesta semana.</div>';
            return;
        }

        var html = '';
        days.forEach(function(day) {
            html += LanchesApp.renderDayCard(day);
        });
        container.innerHTML = html;
    },

    renderDayCard: function(day) {
        var dayName = WEEKDAY_PT[day.weekday] || day.weekday;
        var dateDisplay = formatDate(day.date);
        var today = todayStr();
        var isToday = day.date === today;
        var isPast = day.date < today;

        // Aggregate status for the day
        var statuses = day.entries.map(function(e) { return e.status; });
        var dayStatus = 'planned';
        if (statuses.every(function(s) { return s === 'cancelled'; })) dayStatus = 'cancelled';
        else if (statuses.every(function(s) { return s === 'delivered' || s === 'cancelled'; })) dayStatus = 'delivered';
        else if (statuses.some(function(s) { return s === 'confirmed' || s === 'delivered'; })) dayStatus = 'confirmed';

        var statusLabel = { planned: 'Planejado', confirmed: 'Confirmado', delivered: 'Entregue', cancelled: 'Cancelado' };
        var cancelledClass = dayStatus === 'cancelled' ? ' cancelled' : '';
        var todayBorder = isToday ? ' style="border-color: var(--yellow);"' : '';

        var html = '<div class="day-card' + cancelledClass + '"' + todayBorder + '>';

        // Header
        html += '<div class="day-card-header">';
        html += '<div class="day-card-title"><span class="day-name">' + dayName + '</span>' + dateDisplay + '</div>';
        html += '<span class="status-badge ' + dayStatus + '">' + (statusLabel[dayStatus] || dayStatus) + '</span>';
        html += '</div>';

        // Entry rows
        day.entries.forEach(function(entry) {
            html += LanchesApp.renderEntryRow(entry, dayStatus);
        });

        // Day totals
        var bestConfirmed = day.total_confirmed || day.total_planned;
        html += '<div class="day-totals">';
        html += '<div class="day-total-kit"><span class="kit-label">KIT LANCHE &nbsp;</span>' + bestConfirmed + '</div>';
        html += '<div class="day-actions">';

        // Action buttons based on status
        if (dayStatus === 'planned' && !isPast) {
            html += '<button class="btn btn-confirm" onclick="LanchesApp.startConfirm(\'' + day.date + '\')">Confirmar</button>';
        }
        if (dayStatus === 'confirmed') {
            html += '<button class="btn btn-deliver" onclick="LanchesApp.startActual(\'' + day.date + '\')">Registrar entrega</button>';
        }
        if (dayStatus !== 'cancelled' && dayStatus !== 'delivered') {
            html += '<button class="btn btn-extra btn-sm" onclick="LanchesApp.startExtra(\'' + day.date + '\')">+ Extra</button>';
        }
        if (dayStatus === 'planned' && !isPast) {
            html += '<button class="btn btn-cancel btn-sm" onclick="LanchesApp.cancelDay(\'' + day.date + '\')">Cancelar</button>';
        }

        html += '</div></div>';
        html += '</div>';
        return html;
    },

    renderEntryRow: function(entry, dayStatus) {
        var isCancelled = entry.status === 'cancelled';
        var style = isCancelled ? ' style="opacity:0.35;"' : '';

        var students = entry.planned_students || 0;
        var staff = entry.planned_staff || 0;
        var vegan = entry.planned_vegan || 0;
        var prod = entry.planned_production || 0;
        var total = entry.planned_total || 0;

        // Show confirmed numbers if available
        if (entry.status === 'confirmed' || entry.status === 'delivered') {
            if (entry.confirmed_students != null) students = entry.confirmed_students;
            if (entry.confirmed_staff != null) staff = entry.confirmed_staff;
            if (entry.confirmed_vegan != null) vegan = entry.confirmed_vegan;
            if (entry.confirmed_production != null) prod = entry.confirmed_production;
            total = entry.confirmed_total || total;
        }

        var extras = entry.confirmed_extras || 0;
        var source = entry.source === 'extra' ? ' (extra)' : '';

        var html = '<div class="entry-row" data-id="' + entry.id + '"' + style + '>';
        html += '<div class="entry-name">' + entry.name + source + '</div>';
        html += '<div class="entry-count"><div class="count-val">' + students + '</div><div class="count-label">Alunos</div></div>';
        html += '<div class="entry-count"><div class="count-val">' + staff + '</div><div class="count-label">Profs</div></div>';
        html += '<div class="entry-count"><div class="count-val">' + vegan + '</div><div class="count-label">Vegano</div></div>';
        html += '<div class="entry-count"><div class="count-val">' + prod + '</div><div class="count-label">Prod</div></div>';

        if (extras > 0) {
            html += '<div class="entry-count"><div class="count-val">' + extras + '</div><div class="count-label">Extra</div></div>';
        }

        if (entry.status === 'delivered' && entry.actual_total != null) {
            html += '<div class="entry-count" style="border-left: 1px solid rgba(255,255,255,0.1); padding-left: 10px;">';
            html += '<div class="count-val" style="color: var(--yellow);">' + entry.actual_total + '</div>';
            html += '<div class="count-label">Entregue</div></div>';
        }

        html += '</div>';
        return html;
    },

    // ── Confirm flow ────────────────────────────────────────────────────────

    startConfirm: function(dateStr) {
        var self = this;
        var day = this._findDay(dateStr);
        if (!day) return;

        // Build modal/inline form
        var entries = day.entries.filter(function(e) { return e.status !== 'cancelled'; });
        if (!entries.length) { showToast('Nenhuma entrada para confirmar'); return; }

        var html = '<div class="day-card" style="border-color: var(--green);">';
        html += '<div class="day-card-header"><div class="day-card-title">';
        html += '<span class="day-name">Confirmar pedido</span>' + formatDate(dateStr);
        html += '</div></div>';

        entries.forEach(function(entry) {
            html += '<div class="entry-row" data-confirm-id="' + entry.id + '">';
            html += '<div class="entry-name">' + entry.name + '</div>';
            html += '<div class="entry-count"><input type="number" class="edit-field cf-students" value="' + (entry.planned_students || 0) + '" min="0"><div class="count-label">Alunos</div></div>';
            html += '<div class="entry-count"><input type="number" class="edit-field cf-staff" value="' + (entry.planned_staff || 0) + '" min="0"><div class="count-label">Profs</div></div>';
            html += '<div class="entry-count"><input type="number" class="edit-field cf-vegan" value="' + (entry.planned_vegan || 0) + '" min="0"><div class="count-label">Vegano</div></div>';
            html += '<div class="entry-count"><input type="number" class="edit-field cf-prod" value="' + (entry.planned_production || 0) + '" min="0"><div class="count-label">Prod</div></div>';
            html += '</div>';
        });

        // Extras row
        html += '<div class="entry-row">';
        html += '<div class="entry-name" style="color:rgba(255,255,255,0.5);">Extras</div>';
        html += '<div class="entry-count" style="grid-column: 2 / -1;"><input type="number" class="edit-field" id="cf-extras-' + dateStr + '" value="0" min="0" style="width:60px;">';
        html += '<input type="text" class="edit-field" id="cf-extras-note-' + dateStr + '" placeholder="Obs" style="width:120px; margin-left:8px; text-align:left;"></div>';
        html += '</div>';

        html += '<div class="day-totals">';
        html += '<div></div>';
        html += '<div class="day-actions">';
        html += '<button class="btn btn-confirm" onclick="LanchesApp.submitConfirm(\'' + dateStr + '\')">Salvar confirma\u00e7\u00e3o</button>';
        html += '<button class="btn btn-extra btn-sm" onclick="LanchesApp.loadWeek()">Cancelar</button>';
        html += '</div></div></div>';

        // Replace the day card
        var cards = document.querySelectorAll('.day-card');
        var container = document.getElementById('pedido-content');
        // Find the card for this date and replace
        var replaced = false;
        for (var i = 0; i < cards.length && !replaced; i++) {
            var title = cards[i].querySelector('.day-card-title');
            if (title && title.textContent.indexOf(formatDate(dateStr)) !== -1) {
                cards[i].outerHTML = html;
                replaced = true;
            }
        }
        if (!replaced) {
            container.insertAdjacentHTML('beforeend', html);
        }
    },

    submitConfirm: function(dateStr) {
        var self = this;
        var rows = document.querySelectorAll('[data-confirm-id]');
        var extras = parseInt(document.getElementById('cf-extras-' + dateStr).value) || 0;
        var extrasNote = document.getElementById('cf-extras-note-' + dateStr).value || '';

        var promises = [];
        rows.forEach(function(row) {
            var id = row.getAttribute('data-confirm-id');
            var data = {
                confirmed_students: parseInt(row.querySelector('.cf-students').value) || 0,
                confirmed_staff: parseInt(row.querySelector('.cf-staff').value) || 0,
                confirmed_vegan: parseInt(row.querySelector('.cf-vegan').value) || 0,
                confirmed_production: parseInt(row.querySelector('.cf-prod').value) || 0,
                confirmed_extras: extras,
                confirmed_extras_note: extrasNote,
            };
            promises.push(LanchesAPI.confirmDaily(id, data));
        });

        // If there are extras beyond the per-entry extras, also add as separate entry
        // Actually the extras field goes on each entry in the confirm call

        Promise.all(promises).then(function() {
            showToast('Pedido confirmado!');
            self.loadWeek();
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    // ── Record actual delivery ──────────────────────────────────────────────

    startActual: function(dateStr) {
        var self = this;
        var day = this._findDay(dateStr);
        if (!day) return;

        var entries = day.entries.filter(function(e) { return e.status === 'confirmed'; });
        if (!entries.length) { showToast('Nenhuma entrada confirmada'); return; }

        var dayTotal = day.total_confirmed || day.total_planned;

        var html = '<div class="day-card" style="border-color: var(--yellow);">';
        html += '<div class="day-card-header"><div class="day-card-title">';
        html += '<span class="day-name">Registrar entrega</span>' + formatDate(dateStr);
        html += '</div></div>';

        entries.forEach(function(entry) {
            var confTotal = entry.confirmed_total || entry.planned_total || 0;
            html += '<div class="entry-row" data-actual-id="' + entry.id + '">';
            html += '<div class="entry-name">' + entry.name + ' <span style="color:rgba(255,255,255,0.4);">(confirmado: ' + confTotal + ')</span></div>';
            html += '<div class="entry-count"><input type="number" class="edit-field act-total" value="' + confTotal + '" min="0"><div class="count-label">Entregue</div></div>';
            html += '<div class="entry-count" style="grid-column: 3 / -1;"><input type="text" class="edit-field act-note" placeholder="Obs" style="width:160px; text-align:left;"></div>';
            html += '</div>';
        });

        html += '<div class="day-totals"><div></div><div class="day-actions">';
        html += '<button class="btn btn-deliver" onclick="LanchesApp.submitActual(\'' + dateStr + '\')">Salvar entrega</button>';
        html += '<button class="btn btn-extra btn-sm" onclick="LanchesApp.loadWeek()">Cancelar</button>';
        html += '</div></div></div>';

        var cards = document.querySelectorAll('.day-card');
        var replaced = false;
        for (var i = 0; i < cards.length && !replaced; i++) {
            var title = cards[i].querySelector('.day-card-title');
            if (title && title.textContent.indexOf(formatDate(dateStr)) !== -1) {
                cards[i].outerHTML = html;
                replaced = true;
            }
        }
    },

    submitActual: function(dateStr) {
        var self = this;
        var rows = document.querySelectorAll('[data-actual-id]');
        var promises = [];

        rows.forEach(function(row) {
            var id = row.getAttribute('data-actual-id');
            var data = {
                actual_total: parseInt(row.querySelector('.act-total').value) || 0,
                actual_note: row.querySelector('.act-note').value || '',
            };
            promises.push(LanchesAPI.recordActual(id, data));
        });

        Promise.all(promises).then(function() {
            showToast('Entrega registrada!');
            self.loadWeek();
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    // ── Cancel ──────────────────────────────────────────────────────────────

    cancelDay: function(dateStr) {
        if (!confirm('Cancelar lanches de ' + formatDate(dateStr) + '?')) return;

        var self = this;
        var day = this._findDay(dateStr);
        if (!day) return;

        var promises = day.entries
            .filter(function(e) { return e.status !== 'cancelled'; })
            .map(function(e) { return LanchesAPI.cancelDaily(e.id); });

        Promise.all(promises).then(function() {
            showToast('Dia cancelado');
            self.loadWeek();
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    // ── Add extra ───────────────────────────────────────────────────────────

    startExtra: function(dateStr) {
        var name = prompt('Nome do extra (ex: Evento, Visita):');
        if (!name) return;
        var count = prompt('Quantidade:', '5');
        if (count == null) return;

        var self = this;
        LanchesAPI.addExtra({
            date: dateStr,
            name: name,
            confirmed_extras: parseInt(count) || 0,
            confirmed_extras_note: name,
        }).then(function() {
            showToast('Extra adicionado!');
            self.loadWeek();
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    // ── Histórico tab ───────────────────────────────────────────────────────

    initHistorySelector: function() {
        var sel = document.getElementById('history-month');
        if (!sel) return;

        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth() + 1;

        // Populate months: current month going back 12 months
        for (var i = 0; i < 12; i++) {
            var m = month - i;
            var y = year;
            if (m <= 0) { m += 12; y -= 1; }
            var opt = document.createElement('option');
            opt.value = y + '-' + m;
            opt.textContent = MONTH_NAMES[m] + ' ' + y;
            if (i === 0) opt.selected = true;
            sel.appendChild(opt);
        }
    },

    prevMonth: function() {
        var sel = document.getElementById('history-month');
        if (!sel || sel.selectedIndex >= sel.options.length - 1) return;
        sel.selectedIndex += 1;
        this.loadHistory();
    },

    nextMonth: function() {
        var sel = document.getElementById('history-month');
        if (!sel || sel.selectedIndex <= 0) return;
        sel.selectedIndex -= 1;
        this.loadHistory();
    },

    loadHistory: function() {
        var sel = document.getElementById('history-month');
        if (!sel) return;

        var val = sel.value.split('-');
        var year = parseInt(val[0]);
        var month = parseInt(val[1]);
        var container = document.getElementById('history-content');
        container.innerHTML = '<div class="loading">Carregando</div>';

        LanchesAPI.getHistory(year, month).then(function(data) {
            LanchesApp.renderHistory(data);
        }).catch(function(err) {
            container.innerHTML = '<div class="empty-state">Erro: ' + err.message + '</div>';
        });
    },

    renderHistory: function(data) {
        var container = document.getElementById('history-content');
        var rows = data.rows || [];

        if (!rows.length) {
            container.innerHTML = '<div class="empty-state">Nenhum registro neste m\u00eas.</div>';
            return;
        }

        var statusLabel = { planned: 'Planejado', confirmed: 'Confirmado', delivered: 'Entregue', cancelled: 'Cancelado' };

        var html = '<table class="history-table">';
        html += '<thead><tr>';
        html += '<th>Data</th><th>Atividade</th><th>Planejado</th><th>Confirmado</th><th>Entregue</th><th>Status</th>';
        html += '</tr></thead><tbody>';

        rows.forEach(function(r) {
            var statusClass = r.status || 'planned';
            html += '<tr>';
            html += '<td>' + formatDate(r.date) + '</td>';
            html += '<td>' + r.name + '</td>';
            html += '<td>' + (r.planned_total || 0) + '</td>';
            html += '<td>' + (r.confirmed_total != null ? r.confirmed_total : '\u2014') + '</td>';
            html += '<td>' + (r.actual_total != null ? r.actual_total : '\u2014') + '</td>';
            html += '<td><span class="status-badge ' + statusClass + '">' + (statusLabel[statusClass] || statusClass) + '</span></td>';
            html += '</tr>';
        });

        // Summary footer
        var s = data.summary || {};
        html += '</tbody><tfoot><tr>';
        html += '<td colspan="2">Total</td>';
        html += '<td>' + (s.total_planned || 0) + '</td>';
        html += '<td>' + (s.total_confirmed || 0) + '</td>';
        html += '<td>' + (s.total_actual || 0) + '</td>';
        html += '<td>' + formatBRL(s.total_cost || 0) + '</td>';
        html += '</tr></tfoot></table>';

        container.innerHTML = html;
    },

    // ── Notas Fiscais tab ───────────────────────────────────────────────────

    initNFSESelector: function() {
        // Year selector is static HTML, just load
    },

    loadInvoices: function() {
        var sel = document.getElementById('nfse-year');
        var year = sel ? parseInt(sel.value) : 2026;
        var container = document.getElementById('nfse-content');
        container.innerHTML = '<div class="loading">Carregando</div>';

        LanchesAPI.getInvoices(year).then(function(data) {
            LanchesApp.renderInvoices(data, year);
        }).catch(function(err) {
            container.innerHTML = '<div class="empty-state">Erro: ' + err.message + '</div>';
        });
    },

    renderInvoices: function(invoices, year) {
        var container = document.getElementById('nfse-content');

        if (!invoices || !invoices.length) {
            container.innerHTML = '<div class="empty-state">Nenhuma nota fiscal gerada para ' + year + '.<br><br>' +
                '<button class="btn btn-confirm" onclick="LanchesApp.generateAllInvoices(' + year + ')">Gerar notas para ' + year + '</button></div>';
            return;
        }

        var html = '';
        invoices.forEach(function(inv) {
            var periodLabel = MONTH_NAMES[inv.month] + ' — Per\u00edodo ' + inv.period;
            var dateRange = formatDate(inv.period_start) + ' a ' + formatDate(inv.period_end);

            html += '<div class="invoice-card" data-invoice-id="' + inv.id + '">';
            html += '<div class="invoice-header">';
            html += '<div><div class="invoice-period">' + periodLabel + '</div>';
            html += '<div style="font-size:12px; color:rgba(255,255,255,0.4);">' + dateRange + '</div></div>';
            html += '<div class="invoice-totals">' + inv.total_lanches + ' lanches &bull; <strong>' + formatBRL(inv.total_amount) + '</strong></div>';
            html += '</div>';

            html += '<div class="invoice-fields">';
            html += '<div><label>N\u00ba NF-se</label><input type="text" class="inv-number" value="' + (inv.invoice_number || '') + '"></div>';
            html += '<div><label>Data NF-se</label><input type="date" class="inv-date" value="' + (inv.invoice_date || '') + '"></div>';
            html += '<div><label>Valor NF-se</label><input type="number" class="inv-amount" value="' + (inv.invoice_amount || '') + '" step="0.01"></div>';
            html += '</div>';

            html += '<div class="invoice-status">';
            html += '<label><input type="checkbox" class="inv-paid" ' + (inv.paid ? 'checked' : '') + '> Pago</label>';
            if (inv.paid && inv.paid_date) {
                html += '<span style="font-size:12px; color:rgba(255,255,255,0.4);">em ' + formatDate(inv.paid_date) + '</span>';
            }
            html += '<div style="flex:1;"></div>';
            html += '<button class="btn btn-confirm btn-sm" onclick="LanchesApp.saveInvoice(' + inv.id + ')">Salvar</button>';
            html += '<button class="btn btn-extra btn-sm" onclick="LanchesApp.refreshInvoiceTotals(' + inv.id + ', ' + year + ', ' + inv.month + ')">Recalcular</button>';
            html += '</div>';

            html += '</div>';
        });

        container.innerHTML = html;
    },

    saveInvoice: function(invoiceId) {
        var card = document.querySelector('[data-invoice-id="' + invoiceId + '"]');
        if (!card) return;

        var data = {
            invoice_number: card.querySelector('.inv-number').value || null,
            invoice_date: card.querySelector('.inv-date').value || null,
            invoice_amount: parseFloat(card.querySelector('.inv-amount').value) || null,
            paid: card.querySelector('.inv-paid').checked ? 1 : 0,
        };

        if (data.paid) {
            data.paid_date = data.paid_date || todayStr();
        }

        LanchesAPI.updateInvoice(invoiceId, data).then(function() {
            showToast('Nota fiscal salva!');
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    refreshInvoiceTotals: function(invoiceId, year, month) {
        LanchesAPI.generateInvoices({ year: year, month: month }).then(function() {
            showToast('Totais recalculados');
            LanchesApp.loadInvoices();
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    generateAllInvoices: function(year) {
        var self = this;
        var promises = [];
        for (var m = 1; m <= 12; m++) {
            promises.push(LanchesAPI.generateInvoices({ year: year, month: m }));
        }
        Promise.all(promises).then(function() {
            showToast('Notas geradas!');
            self.loadInvoices();
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    // ── Config tab ──────────────────────────────────────────────────────────

    saveCostPerHead: function() {
        var input = document.getElementById('costInput');
        if (!input) return;
        var val = parseFloat(input.value);
        if (isNaN(val) || val < 0) { showToast('Valor inv\u00e1lido'); return; }

        LanchesAPI.updateConfig({ cost_per_head: val.toFixed(2) }).then(function() {
            showToast('Custo salvo: R$ ' + val.toFixed(2).replace('.', ','));
        }).catch(function(err) {
            showToast('Erro ao salvar');
        });
    },

    saveDefaults: function() {
        var rows = document.querySelectorAll('.defaults-table tbody tr[data-day]');
        var promises = [];

        rows.forEach(function(row) {
            var day = row.getAttribute('data-day');
            var data = {
                staff_lanches: parseInt(row.querySelector('.dd-staff').value) || 0,
                vegan_lanches: parseInt(row.querySelector('.dd-vegan').value) || 0,
                production_lanches: parseInt(row.querySelector('.dd-prod').value) || 0,
                notes: row.querySelector('.dd-notes').value || '',
            };
            promises.push(LanchesAPI.updateDefault(day, data));
        });

        Promise.all(promises).then(function() {
            showToast('Padr\u00f5es salvos!');
        }).catch(function(err) {
            showToast('Erro: ' + err.message);
        });
    },

    toggleActivity: function(checkbox) {
        var id = checkbox.dataset.id;
        var lanche = checkbox.checked ? 1 : 0;

        LanchesAPI.toggleActivity(id, { lanche: lanche }).then(function() {
            showToast(lanche ? 'Lanche ativado' : 'Lanche desativado');
        }).catch(function(err) {
            checkbox.checked = !checkbox.checked;
            showToast('Erro ao salvar');
        });
    },

    // ── Utility ─────────────────────────────────────────────────────────────

    _findDay: function(dateStr) {
        if (!this.weekData || !this.weekData.days) return null;
        for (var i = 0; i < this.weekData.days.length; i++) {
            if (this.weekData.days[i].date === dateStr) return this.weekData.days[i];
        }
        return null;
    },

    _setText: function(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    },
};


// ── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    LanchesApp.init();

    // Lazy-load history and invoices when those tabs are clicked
    var histLoaded = false, nfLoaded = false;
    document.querySelectorAll('.fb-tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (btn.dataset.tab === 'historico' && !histLoaded) {
                histLoaded = true;
                LanchesApp.loadHistory();
            }
            if (btn.dataset.tab === 'nfse' && !nfLoaded) {
                nfLoaded = true;
                LanchesApp.loadInvoices();
            }
        });
    });

    // Also check hash on load
    var hash = window.location.hash.slice(1);
    if (hash === 'historico') { LanchesApp.loadHistory(); }
    if (hash === 'nfse') { LanchesApp.loadInvoices(); }
});
