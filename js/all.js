/* ============================================================
   HABIT QUEST – all.js
   Frontend JavaScript – connected to Flask backend via fetch()

   HOW IT WORKS:
   - All data is now stored in MySQL (not localStorage)
   - Every action (login, add habit, toggle, etc.) calls a
     Flask API endpoint using fetch()
   - The UI renders exactly the same as before
   - API base URL: http://localhost:5000
   ============================================================ */

// ── API helper ──────────────────────────────────────────────
// All fetch calls go through this one function.
// It automatically sends cookies (credentials:'include') so
// Flask sessions work correctly.
const API = {
  BASE: '',   // empty = same origin (localhost:5000)

  async get(path) {
    const res = await fetch(this.BASE + path, {
      credentials: 'include'   // send session cookie
    });
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(this.BASE + path, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body)
    });
    return res.json();
  },

  async put(path, body) {
    const res = await fetch(this.BASE + path, {
      method:      'PUT',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body)
    });
    return res.json();
  },

  async del(path) {
    const res = await fetch(this.BASE + path, {
      method:      'DELETE',
      credentials: 'include'
    });
    return res.json();
  }
};

// ── In-memory cache ─────────────────────────────────────────
// After login we keep the user object and habits array in memory
// so the UI can render synchronously (same as before with localStorage).
// We refresh from the server whenever something changes.
const Store = (() => {

  // Category definitions (same as original – no DB needed for this)
  const CATEGORIES = [
    { key: 'health',       emoji: '💚', label: 'Health' },
    { key: 'fitness',      emoji: '💪', label: 'Fitness' },
    { key: 'learning',     emoji: '📚', label: 'Learning' },
    { key: 'productivity', emoji: '🚀', label: 'Productivity' },
    { key: 'mindfulness',  emoji: '🧘', label: 'Mindfulness' },
    { key: 'social',       emoji: '🤝', label: 'Social' },
    { key: 'finance',      emoji: '💰', label: 'Finance' },
    { key: 'other',        emoji: '✨', label: 'Other' },
  ];

  // In-memory state (populated after login)
  let _currentUser = null;
  let _habits      = [];
  let _leaderboard = [];

  /* ── Getters (synchronous – used by render functions) ── */
  function getCurrentUser()        { return _currentUser; }
  function getHabits()             { return _habits; }
  function getLeaderboard()        { return _leaderboard; }
  function getTheme()              { return localStorage.getItem('hq_theme') || 'light'; }

  function setTheme(t) {
    localStorage.setItem('hq_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  function isCompletedToday(habit) {
    const today = new Date().toISOString().slice(0, 10);
    return habit.completedDates.includes(today);
  }

  /* ── Setters (called after API responses) ── */
  function setCurrentUser(user) { _currentUser = user; }
  function setHabits(habits)    { _habits = habits; }
  function setLeaderboard(lb)   { _leaderboard = lb; }

  /* ── Suggested habits (static list, no DB needed) ── */
  function getSuggestedHabits() {
    return [
      { title: 'Morning Meditation', description: 'Start the day with 10 min of mindfulness', category: 'mindfulness', color: '#845EC2', emoji: '🧘' },
      { title: 'Read 20 Pages',      description: 'Read from a non-fiction book',             category: 'learning',     color: '#3A86FF', emoji: '📚' },
      { title: 'Drink 8 Glasses',    description: 'Stay hydrated throughout the day',         category: 'health',       color: '#4ECDC4', emoji: '💧' },
      { title: 'Workout 30 min',     description: 'Strength or cardio exercise session',      category: 'fitness',      color: '#FF6B6B', emoji: '💪' },
      { title: 'Journal Entry',      description: 'Reflect on your day in a journal',         category: 'mindfulness',  color: '#FF9F1C', emoji: '✍️' },
    ];
  }

  return {
    CATEGORIES,
    getCurrentUser, getHabits, getLeaderboard, getTheme, setTheme,
    isCompletedToday,
    setCurrentUser, setHabits, setLeaderboard,
    getSuggestedHabits,
  };
})();


/* ============================================
   HABIT QUEST – habits.js
   Habits CRUD UI, modal, filter & categories
   ============================================ */

const Habits = (() => {
  let activeFilter = 'all';

  function render() {
    const user = Store.getCurrentUser();
    if (!user) return '';
    const habits = Store.getHabits();
    const today  = new Date().toISOString().slice(0, 10);

    const filtered = activeFilter === 'all'
      ? habits
      : habits.filter(h => h.category === activeFilter);

    return `
    <div class="page" id="page-habits">
      <!-- Toolbar -->
      <div class="habits-toolbar">
        <button class="filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
        ${Store.CATEGORIES.map(c => `
          <button class="filter-btn ${activeFilter === c.key ? 'active' : ''}" data-filter="${c.key}">
            ${c.emoji} ${c.label}
          </button>
        `).join('')}
      </div>

      <!-- Habits Grid -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="icon">🌿</div>
          <h3>No habits here</h3>
          <p>Click the + button to create a new habit</p>
        </div>
      ` : `
        <div class="habits-grid">
          ${filtered.map(h => {
            const done = h.completedDates.includes(today);
            const cat  = Store.CATEGORIES.find(c => c.key === h.category) || Store.CATEGORIES[7];
            const days = Math.max(1, Math.ceil((Date.now() - new Date(h.createdAt).getTime()) / 86400000));
            const completionRate = h.completedDates.length > 0
              ? Math.round((h.completedDates.length / days) * 100)
              : 0;
            return `
              <div class="habit-card" style="border-top-color:${h.color}" data-id="${h.id}">
                <div class="habit-card-top">
                  <div>
                    <span class="badge badge-${h.category}">${cat.emoji} ${cat.label}</span>
                    <h3 class="habit-title" style="margin-top:8px;">${h.title}</h3>
                  </div>
                  <div class="habit-streak-badge">🔥 ${h.streak}</div>
                </div>
                <p class="habit-desc">${h.description || 'No description'}</p>
                <div style="margin-bottom:12px;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-size:.78rem;color:var(--text-muted);">Completion rate</span>
                    <span style="font-size:.78rem;font-weight:700;color:${h.color}">${Math.min(completionRate,100)}%</span>
                  </div>
                  <div class="progress-wrap">
                    <div class="progress-bar" style="background:${h.color};width:${Math.min(completionRate,100)}%"></div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:.78rem;color:var(--text-muted);margin-bottom:12px;">
                  <span>Best: 🏆 ${h.bestStreak} days</span>
                  <span>${h.completedDates.length} total completions</span>
                </div>
                <div class="habit-actions">
                  <button class="btn btn-sm ${done ? 'btn-secondary' : 'btn-outline'}" data-toggle="${h.id}">
                    ${done ? '✓ Done' : '○ Mark Done'}
                  </button>
                  <button class="btn btn-sm btn-outline" data-edit="${h.id}" style="margin-left:auto;">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${h.id}">🗑️</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      `}
      <!-- FAB -->
      <button class="fab" id="fab-add-habit" title="Add Habit">＋</button>
    </div>`;
  }

  function bind() {
    // Filter buttons
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        App.navigate('habits');
      });
    });

    // Toggle done/undone
    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const habitId = btn.dataset.toggle;
        const res = await API.post(`/api/habits/${habitId}/toggle`, {});
        if (res.ok) {
          // Update in-memory habit
          const habits = Store.getHabits();
          const h = habits.find(x => x.id == habitId);
          if (h) {
            h.completedDates = res.completedDates;
            h.streak         = res.streak;
            h.bestStreak     = res.bestStreak;
          }
          // Update user XP in memory
          const user = Store.getCurrentUser();
          if (user && res.user) {
            user.level    = res.user.level;
            user.xp       = res.user.xp;
            user.xpToNext = res.user.xpToNext;
            user.total_xp = res.user.total_xp;
          }
          if (res.completed) {
            App.toast('Habit completed! +25 XP ⚡', 'success');
          } else {
            App.toast('Habit unchecked', 'info');
          }
          Notifications.refreshBadge(); // update bell badge
        } else {
          App.toast(res.msg || 'Error', 'error');
        }
        App.navigate('habits');
      });
    });

    // Delete habit
    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this habit?')) return;
        const habitId = btn.dataset.del;
        const res = await API.del(`/api/habits/${habitId}`);
        if (res.ok) {
          Store.setHabits(Store.getHabits().filter(h => h.id != habitId));
          App.toast('Habit deleted 🗑️', 'info');
          Notifications.refreshBadge(); // update bell badge
        } else {
          App.toast(res.msg || 'Error', 'error');
        }
        App.navigate('habits');
      });
    });

    // Edit habit
    document.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const habit = Store.getHabits().find(h => h.id == btn.dataset.edit);
        if (habit) _showModal(habit);
      });
    });

    // FAB – open create modal
    document.getElementById('fab-add-habit')?.addEventListener('click', () => _showModal(null));
  }

  function _showModal(habit) {
    const isEdit = !!habit;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'habit-modal-overlay';

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${isEdit ? '✏️ Edit Habit' : '✨ New Habit'}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <form id="habit-modal-form">
          <div class="form-group">
            <label>Habit Title</label>
            <input class="form-control" id="hm-title" placeholder="e.g. Morning Run" required value="${isEdit ? habit.title : ''}" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea class="form-control" id="hm-desc" rows="2" placeholder="What does this habit involve?">${isEdit ? habit.description : ''}</textarea>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select class="form-control" id="hm-cat">
              ${Store.CATEGORIES.map(c => `<option value="${c.key}" ${isEdit && habit.category === c.key ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Color</label>
            <div class="color-picker-row" id="hm-colors">
              ${['#FF6B6B','#6BCB77','#3A86FF','#FF9F1C','#FFD93D','#845EC2','#4ECDC4','#E84393'].map(c => `
                <div class="color-dot ${isEdit && habit.color === c ? 'selected' : (!isEdit && c === '#FF6B6B' ? 'selected' : '')}"
                     style="background:${c}" data-color="${c}"></div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="modal-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Habit'}</button>
          </div>
        </form>
      </div>`;

    document.body.appendChild(overlay);

    // Color picker
    overlay.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        overlay.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
      });
    });

    const close = () => overlay.remove();
    overlay.querySelector('#modal-close-btn').addEventListener('click', close);
    overlay.querySelector('#modal-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Form submit → call API
    overlay.querySelector('#habit-modal-form').addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        title:       document.getElementById('hm-title').value.trim(),
        description: document.getElementById('hm-desc').value.trim(),
        category:    document.getElementById('hm-cat').value,
        color:       overlay.querySelector('.color-dot.selected')?.dataset.color || '#FF6B6B',
      };

      if (isEdit) {
        // Update existing habit
        const res = await API.put(`/api/habits/${habit.id}`, data);
        if (res.ok) {
          const habits = Store.getHabits();
          const idx = habits.findIndex(h => h.id == habit.id);
          if (idx !== -1) habits[idx] = res.habit;
          App.toast('Habit updated! ✏️', 'success');
        } else {
          App.toast(res.msg || 'Error updating habit', 'error');
        }
      } else {
        // Create new habit
        const res = await API.post('/api/habits', data);
        if (res.ok) {
          Store.getHabits().push(res.habit);
          // Update user XP (50 XP for creating)
          const user = Store.getCurrentUser();
          if (user) {
            const meRes = await API.get('/api/me');
            if (meRes.ok) Store.setCurrentUser(meRes.user);
          }
          App.toast('New habit created! +50 XP ✨', 'success');
          Notifications.refreshBadge(); // update bell badge
        } else {
          App.toast(res.msg || 'Error creating habit', 'error');
        }
      }
      close();
      App.navigate('habits');
    });
  }

  return { render, bind };
})();


/* ============================================
   HABIT QUEST – dashboard.js
   Dashboard rendering, stats, charts, tasks
   ============================================ */

const Dashboard = (() => {

  function render() {
    const user   = Store.getCurrentUser();
    if (!user) return '';
    const habits = Store.getHabits();
    const today  = new Date().toISOString().slice(0, 10);

    const totalHabits    = habits.length;
    const completedToday = habits.filter(h => h.completedDates.includes(today)).length;
    const currentStreaks  = habits.reduce((s, h) => s + h.streak, 0);
    const completionPct  = totalHabits ? Math.round((completedToday / totalHabits) * 100) : 0;
    const suggestions    = Store.getSuggestedHabits();

    return `
    <div class="page" id="page-dashboard">
      ${totalHabits === 0 ? `
        <div class="hero-add-section">
          <h2 class="hero-add-title">Welcome to Your Quest, ${user.name.split(' ')[0]}!</h2>
          <p class="hero-add-subtitle">Your journey to a better you starts with a single habit.</p>
          <button class="btn btn-primary btn-hero-add" id="hero-create-habit">
            <span>✨ Create Your First Habit</span>
          </button>
        </div>
      ` : ''}

      <!-- Stats Row -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg,#FF6B6B22,#FFD93D22);color:#FF6B6B;">🎯</div>
          <div class="stat-info">
            <div class="value">${totalHabits}</div>
            <div class="label">Active Habits</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg,#6BCB7722,#4D96FF22);color:#6BCB77;">✅</div>
          <div class="stat-info">
            <div class="value">${completedToday}/${totalHabits}</div>
            <div class="label">Done Today</div>
            ${totalHabits > 0 ? `<div class="change up">↑ ${completionPct}%</div>` : ''}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg,#FF9F1C22,#FF6B6B22);color:#FF9F1C;">🔥</div>
          <div class="stat-info">
            <div class="value">${currentStreaks || '0'}</div>
            <div class="label">${currentStreaks > 0 ? 'Total Streaks' : 'Start your journey'}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:linear-gradient(135deg,#845EC222,#3A86FF22);color:#845EC2;">🏆</div>
          <div class="stat-info">
            <div class="value">Lv ${user.level}</div>
            <div class="label">Current Level</div>
            <div class="change up">${user.xp}/${user.xpToNext} XP</div>
          </div>
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="dashboard-grid">
        <!-- Today's Tasks -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">📋 Today's Habits</span>
            ${totalHabits > 0 ? `<span class="badge badge-health">${completedToday} done</span>` : ''}
          </div>
          ${totalHabits === 0 ? `
            <div class="empty-state">
              <div class="icon">🌿</div>
              <h3>No habits active</h3>
              <p>Your daily tasks will appear here.</p>
            </div>
          ` : `
            <div class="task-list" id="dashboard-tasks">
              ${habits.map(h => {
                const done = h.completedDates.includes(today);
                const cat  = Store.CATEGORIES.find(c => c.key === h.category) || Store.CATEGORIES[7];
                const streakText = h.streak > 0 ? `🔥 ${h.streak} day streak` : 'Complete today to start streak';
                return `
                  <div class="task-item ${done ? 'done' : ''}" data-id="${h.id}">
                    <div class="task-cb ${done ? 'checked' : ''}" data-habit="${h.id}">${done ? '✓' : ''}</div>
                    <div>
                      <div class="task-title">${h.title}</div>
                      <div class="task-meta">${cat.emoji} ${cat.label} · ${streakText}</div>
                    </div>
                    <div class="task-cat-dot" style="background:${h.color}"></div>
                  </div>`;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Streak Cards -->
        <div class="card">
          <div class="card-header"><span class="card-title">🔥 Streak Tracker</span></div>
          ${totalHabits === 0 ? `
            <div class="empty-state">
              <div class="icon">🌊</div>
              <h3>No streaks yet</h3>
              <p>Consistency builds momentum!</p>
            </div>
          ` : `
            <div class="streak-grid">
              ${habits.slice(0, 4).map(h => {
                const pct = h.bestStreak > 0 ? Math.round((h.streak / h.bestStreak) * 100) : 0;
                return `
                  <div class="streak-card">
                    <div class="streak-head">
                      <span class="streak-name" title="${h.title}">${h.title.length > 15 ? h.title.slice(0,15)+'…' : h.title}</span>
                      <span class="streak-count" style="color:${h.color}">🔥${h.streak}</span>
                    </div>
                    <div class="streak-label">Best: ${h.bestStreak} days</div>
                    <div class="progress-wrap">
                      <div class="progress-bar" style="background:${h.color};width:${pct||5}%"></div>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Weekly Chart -->
        <div class="card col-wide">
          <div class="card-header"><span class="card-title">📊 Weekly Activity</span></div>
          <div class="chart-container">
            ${totalHabits === 0 || habits.every(h => h.completedDates.length === 0) ? `
              <div class="empty-chart-placeholder">
                <div class="empty-chart-icon">📈</div>
                <p>Your progress analytics will appear here<br>after you complete your first habits.</p>
              </div>
            ` : `<canvas id="weeklyChart" height="220"></canvas>`}
          </div>
        </div>
      </div>

      <!-- Suggested Habits -->
      <div class="suggested-section">
        <div class="section-header">
          <h2 class="section-title">✨ Suggested Starter Habits</h2>
          <span class="badge badge-productivity">Recommended for you</span>
        </div>
        <div class="suggested-grid">
          ${suggestions.map(s => `
            <div class="suggested-card">
              <div class="suggested-card-icon">${s.emoji}</div>
              <h3 class="suggested-habit-name">${s.title}</h3>
              <p class="suggested-habit-desc">${s.description}</p>
              <button class="btn btn-outline btn-sm btn-add-suggested"
                      data-title="${s.title}"
                      data-desc="${s.description}"
                      data-cat="${s.category}"
                      data-color="${s.color}">
                ＋ Add Habit
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
  }

  function bind() {
    // Hero button
    document.getElementById('hero-create-habit')?.addEventListener('click', () => {
      App.navigate('habits');
      setTimeout(() => document.getElementById('fab-add-habit')?.click(), 100);
    });

    // Add suggested habit
    document.querySelectorAll('.btn-add-suggested').forEach(btn => {
      btn.addEventListener('click', async () => {
        const data = {
          title:       btn.dataset.title,
          description: btn.dataset.desc,
          category:    btn.dataset.cat,
          color:       btn.dataset.color,
        };
        const res = await API.post('/api/habits', data);
        if (res.ok) {
          Store.getHabits().push(res.habit);
          // Refresh user XP from server
          const meRes = await API.get('/api/me');
          if (meRes.ok) Store.setCurrentUser(meRes.user);
          App.toast(`Habit "${data.title}" added! +50 XP ✨`, 'success');
          Notifications.refreshBadge(); // update bell badge
        } else {
          App.toast(res.msg || 'Error', 'error');
        }
        App.navigate('dashboard');
      });
    });

    // Task toggle (dashboard checkboxes)
    document.querySelectorAll('#dashboard-tasks .task-cb').forEach(cb => {
      cb.addEventListener('click', async e => {
        e.stopPropagation();
        const habitId = cb.dataset.habit;
        const res = await API.post(`/api/habits/${habitId}/toggle`, {});
        if (res.ok) {
          const habits = Store.getHabits();
          const h = habits.find(x => x.id == habitId);
          if (h) {
            h.completedDates = res.completedDates;
            h.streak         = res.streak;
            h.bestStreak     = res.bestStreak;
          }
          const user = Store.getCurrentUser();
          if (user && res.user) {
            user.level    = res.user.level;
            user.xp       = res.user.xp;
            user.xpToNext = res.user.xpToNext;
            user.total_xp = res.user.total_xp;
          }
          if (res.completed) {
            App.toast('Habit completed! +25 XP ⚡', 'success');
          } else {
            App.toast('Habit unchecked', 'info');
          }
          Notifications.refreshBadge(); // update bell badge
        } else {
          App.toast(res.msg || 'Error', 'error');
        }
        App.navigate('dashboard');
      });
    });

    // Draw chart using data from server
    _drawWeeklyChart();
  }

  async function _drawWeeklyChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;

    // Fetch weekly data from Flask
    const res = await API.get('/api/weekly');
    if (!res.ok) return;

    const days   = res.days;
    const counts = res.counts;

    const ctx = canvas.getContext('2d');
    const max = Math.max(...counts, 1);
    const W   = canvas.width  = canvas.offsetWidth * (window.devicePixelRatio || 1);
    const H   = canvas.height = 220 * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    const w = canvas.offsetWidth;
    const h = 220;

    const pad   = { top: 20, right: 20, bottom: 36, left: 40 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top  - pad.bottom;
    const barW  = plotW / days.length * 0.55;
    const gap   = plotW / days.length;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#E2E8F0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    // Bars
    const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    grad.addColorStop(0, '#FF6B6B');
    grad.addColorStop(1, '#FFD93D');

    days.forEach((day, i) => {
      const x    = pad.left + i * gap + (gap - barW) / 2;
      const barH = (counts[i] / max) * plotH;
      const y    = pad.top + plotH - barH;
      ctx.fillStyle = grad;
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, pad.top + plotH);
      ctx.lineTo(x, pad.top + plotH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#1A202C';
      ctx.font = '700 12px Poppins, sans-serif';
      ctx.textAlign = 'center';
      if (counts[i] > 0) ctx.fillText(counts[i], x + barW / 2, y - 6);

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#A0AEC0';
      ctx.font = '600 11px Poppins, sans-serif';
      ctx.fillText(day, x + barW / 2, h - pad.bottom + 18);
    });
  }

  return { render, bind };
})();


/* ============================================
   HABIT QUEST – auth.js
   Login & Signup form logic (calls Flask API)
   ============================================ */

const Auth = (() => {
  function render() {
    return `
    <div id="auth-screen">
      <div class="auth-container">
        <!-- Left branding panel -->
        <div class="auth-brand">
          <div class="auth-brand-icon">
            <img src="logo.png" alt="Habit Quest" class="auth-logo-img" />
          </div>
          <p>Level up your life by building powerful habits.<br>Track, streak, and conquer your goals every day!</p>
          <div class="auth-brand-features">
            <div class="auth-feature"><span>🔥</span> Track Daily Streaks</div>
            <div class="auth-feature"><span>🏆</span> Climb Leaderboards</div>
            <div class="auth-feature"><span>⭐</span> Earn XP & Level Up</div>
          </div>
        </div>

        <!-- Right form panel -->
        <div class="auth-form-wrap">
          <!-- LOGIN -->
          <div id="login-view">
            <h2>Welcome Back! 👋</h2>
            <p class="subtitle">Login to continue your quest</p>
            <form id="login-form" class="auth-form" autocomplete="off">
              <div class="form-group">
                <label for="login-email">Email</label>
                <div class="input-group">
                  <span class="input-icon">📧</span>
                  <input id="login-email" class="form-control" type="email" placeholder="you@example.com" required />
                </div>
              </div>
              <div class="form-group">
                <label for="login-pass">Password</label>
                <div class="input-group">
                  <span class="input-icon">🔒</span>
                  <input id="login-pass" class="form-control" type="password" placeholder="Enter password" required />
                </div>
                <span class="forgot-link" id="forgot-link">Forgot password?</span>
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full mt-md">Login <span>→</span></button>
            </form>
            <div class="auth-switch">Don't have an account? <span id="show-signup">Sign Up</span></div>
          </div>

          <!-- SIGNUP -->
          <div id="signup-view" class="hidden">
            <h2>Join the Quest! 🚀</h2>
            <p class="subtitle">Create your hero profile</p>
            <form id="signup-form" class="auth-form" autocomplete="off">
              <div class="form-group">
                <label for="signup-name">Full Name</label>
                <div class="input-group">
                  <span class="input-icon">👤</span>
                  <input id="signup-name" class="form-control" type="text" placeholder="Your hero name" required />
                </div>
              </div>
              <div class="form-group">
                <label for="signup-email">Email</label>
                <div class="input-group">
                  <span class="input-icon">📧</span>
                  <input id="signup-email" class="form-control" type="email" placeholder="you@example.com" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="signup-pass">Password</label>
                  <div class="input-group">
                    <span class="input-icon">🔒</span>
                    <input id="signup-pass" class="form-control" type="password" placeholder="Min 6 chars" required minlength="6" />
                  </div>
                </div>
                <div class="form-group">
                  <label for="signup-pass2">Confirm</label>
                  <div class="input-group">
                    <span class="input-icon">🔒</span>
                    <input id="signup-pass2" class="form-control" type="password" placeholder="Repeat" required minlength="6" />
                  </div>
                </div>
              </div>
              <button type="submit" class="btn btn-secondary btn-lg w-full mt-md">Create Account <span>🎉</span></button>
            </form>
            <div class="auth-switch">Already have an account? <span id="show-login">Login</span></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function bind() {
    // Toggle login / signup views
    document.getElementById('show-signup')?.addEventListener('click', () => {
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('signup-view').classList.remove('hidden');
    });
    document.getElementById('show-login')?.addEventListener('click', () => {
      document.getElementById('signup-view').classList.add('hidden');
      document.getElementById('login-view').classList.remove('hidden');
    });
    document.getElementById('forgot-link')?.addEventListener('click', () => {
      App.toast('Password reset is not available in this demo.', 'info');
    });

    // ── LOGIN ──────────────────────────────────────────────
    document.getElementById('login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pass  = document.getElementById('login-pass').value;

      const res = await API.post('/api/login', { email, password: pass });
      if (!res.ok) {
        App.toast(res.msg, 'error');
        document.getElementById('login-form').classList.add('shake');
        setTimeout(() => document.getElementById('login-form').classList.remove('shake'), 500);
        return;
      }

      // Store user in memory
      Store.setCurrentUser(res.user);

      // Load habits from server
      const habitsRes = await API.get('/api/habits');
      Store.setHabits(habitsRes.ok ? habitsRes.habits : []);

      App.toast(`Welcome back, ${res.user.name}! ⚔️`, 'success');
      setTimeout(() => App.navigate('dashboard'), 400);
    });

    // ── SIGNUP ─────────────────────────────────────────────
    document.getElementById('signup-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name  = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const pass  = document.getElementById('signup-pass').value;
      const pass2 = document.getElementById('signup-pass2').value;

      if (pass !== pass2) { App.toast('Passwords do not match!', 'error'); return; }

      const res = await API.post('/api/register', { name, email, password: pass });
      if (!res.ok) { App.toast(res.msg, 'error'); return; }

      Store.setCurrentUser(res.user);
      Store.setHabits([]);   // new user has no habits yet

      App.toast(`Account created! Welcome, ${name}! 🎉`, 'success');
      setTimeout(() => App.navigate('dashboard'), 400);
    });
  }

  return { render, bind };
})();


/* ============================================
   HABIT QUEST – profile.js
   Profile view, edit form, avatar & settings
   ============================================ */

const Profile = (() => {

  function render() {
    const user = Store.getCurrentUser();
    if (!user) return '';
    const habits          = Store.getHabits();
    const totalCompletions = habits.reduce((s, h) => s + h.completedDates.length, 0);
    const bestStreak       = habits.reduce((b, h) => Math.max(b, h.bestStreak), 0);
    const initials         = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isDark           = Store.getTheme() === 'dark';

    return `
    <div class="page" id="page-profile">
      <!-- Profile Header -->
      <div class="profile-header">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" id="profile-avatar">
            ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : initials}
          </div>
          <div class="avatar-edit-btn" id="avatar-edit-btn" title="Change Avatar">📷</div>
          <input type="file" id="avatar-input" accept="image/*" style="display:none" />
        </div>
        <h2>${user.name}</h2>
        <p class="profile-level">⚡ Level ${user.level} Quester · ${user.xp}/${user.xpToNext} XP</p>
        <p style="opacity:.7;font-size:.85rem;margin-top:4px;">${user.bio || 'No bio yet – tell us about yourself!'}</p>
      </div>

      <!-- Stats -->
      <div class="profile-stats">
        <div class="p-stat">
          <div class="val" style="color:var(--primary);">${habits.length}</div>
          <div class="lbl">Active Habits</div>
        </div>
        <div class="p-stat">
          <div class="val" style="color:var(--secondary);">${totalCompletions}</div>
          <div class="lbl">Completions</div>
        </div>
        <div class="p-stat">
          <div class="val" style="color:var(--orange);">🔥 ${bestStreak}</div>
          <div class="lbl">Best Streak</div>
        </div>
      </div>

      <!-- Edit Profile -->
      <div class="profile-form-card" style="margin-bottom:20px;">
        <h3>✏️ Edit Profile</h3>
        <form id="profile-form">
          <div class="form-row">
            <div class="form-group">
              <label for="pf-name">Full Name</label>
              <input class="form-control" id="pf-name" value="${user.name}" required />
            </div>
            <div class="form-group">
              <label for="pf-email">Email</label>
              <input class="form-control" id="pf-email" value="${user.email}" type="email" required />
            </div>
          </div>
          <div class="form-group" style="margin-top:16px;">
            <label for="pf-bio">Bio</label>
            <textarea class="form-control" id="pf-bio" rows="3" placeholder="Tell everyone about your quest...">${user.bio || ''}</textarea>
          </div>
          <button type="submit" class="btn btn-primary mt-md">Save Changes</button>
        </form>
      </div>

      <!-- Settings -->
      <div class="profile-form-card">
        <h3>⚙️ Settings</h3>
        <div class="toggle-row">
          <div>
            <div class="toggle-label">Dark Mode</div>
            <div class="toggle-sub">Switch between light and dark themes</div>
          </div>
          <div class="theme-toggle ${isDark ? 'active' : ''}" id="profile-theme-toggle"></div>
        </div>
        <div style="margin-top:24px;">
          <button class="btn btn-danger" id="logout-btn">🚪 Logout</button>
        </div>
      </div>
    </div>`;
  }

  function bind() {
    // ── Save profile ───────────────────────────────────────
    document.getElementById('profile-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name  = document.getElementById('pf-name').value.trim();
      const email = document.getElementById('pf-email').value.trim();
      const bio   = document.getElementById('pf-bio').value.trim();

      const res = await API.put('/api/profile', { name, email, bio });
      if (res.ok) {
        Store.setCurrentUser(res.user);
        App.toast('Profile updated! ✨', 'success');
        Notifications.refreshBadge(); // update bell badge
      } else {
        App.toast(res.msg || 'Error updating profile', 'error');
      }
      App.navigate('profile');
    });

    // ── Avatar upload ──────────────────────────────────────
    document.getElementById('avatar-edit-btn')?.addEventListener('click', () => {
      document.getElementById('avatar-input')?.click();
    });
    document.getElementById('profile-avatar')?.addEventListener('click', () => {
      document.getElementById('avatar-input')?.click();
    });
    document.getElementById('avatar-input')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        const res = await API.put('/api/profile', {
          name:   Store.getCurrentUser().name,
          email:  Store.getCurrentUser().email,
          bio:    Store.getCurrentUser().bio || '',
          avatar: ev.target.result,   // base64 string
        });
        if (res.ok) {
          Store.setCurrentUser(res.user);
          App.toast('Avatar updated! 📸', 'success');
        } else {
          App.toast(res.msg || 'Error', 'error');
        }
        App.navigate('profile');
      };
      reader.readAsDataURL(file);
    });

    // ── Theme toggle ───────────────────────────────────────
    document.getElementById('profile-theme-toggle')?.addEventListener('click', () => {
      App.toggleTheme();
      App.navigate('profile');
    });

    // ── Logout ─────────────────────────────────────────────
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await API.post('/api/logout', {});
      Store.setCurrentUser(null);
      Store.setHabits([]);
      App.toast('Logged out. See you soon! 👋', 'info');
      setTimeout(() => App.navigate('auth'), 400);
    });
  }

  return { render, bind };
})();


/* ============================================
   HABIT QUEST – leaderboard.js
   Top players podium + ranked list
   ============================================ */

const Leaderboard = (() => {

  function render() {
    // Always sort descending by XP before rendering.
    // The server already returns sorted data, but this guarantees
    // the display is correct even if the array order ever shifts.
    const list = Store.getLeaderboard()
      .slice()   // copy so we don't mutate the stored array
      .sort((a, b) => {
        if (b.xp !== a.xp) return b.xp - a.xp;   // higher XP first
        return 0;   // tiebreaker is handled server-side (created_at ASC)
      });

    // Podium uses the top 3 from the sorted list.
    // list[0] = rank 1 (highest XP), list[1] = rank 2, list[2] = rank 3.
    //
    // Visual display order for the physical podium shape:
    //   left slot  → rank 2 (silver)
    //   centre slot → rank 1 (gold, tallest block)
    //   right slot  → rank 3 (bronze)
    //
    // We store each entry's TRUE rank alongside it so the medal,
    // CSS class, and block height always match the actual XP order,
    // regardless of which display slot it occupies.
    const top3 = list.slice(0, 3);

    // Build podium slots: each object carries { player, trueRank }
    // trueRank is 1-based (1 = highest XP).
    const podiumSlots = top3.length >= 3
      ? [
          { player: top3[1], trueRank: 2 },   // left  – silver
          { player: top3[0], trueRank: 1 },   // centre – gold
          { player: top3[2], trueRank: 3 },   // right  – bronze
        ]
      : top3.map((p, i) => ({ player: p, trueRank: i + 1 }));

    const medals        = ['🥇', '🥈', '🥉'];
    // CSS classes control block height: podium-1 is tallest (centre)
    const podiumClasses = { 1: 'podium-1', 2: 'podium-2', 3: 'podium-3' };

    return `
    <div class="page" id="page-leaderboard">
      ${list.length === 0 || (list.length === 1 && list[0].isMe && list[0].xp === 0) ? `
        <div class="card" style="text-align:center;padding:60px 20px;">
          <div style="font-size:4rem;margin-bottom:20px;">🏆</div>
          <h2 style="margin-bottom:10px;">Leaderboard Locked</h2>
          <p style="color:var(--text-muted);margin-bottom:30px;max-width:400px;margin-left:auto;margin-right:auto;">
            Complete habits and earn XP to appear on the leaderboard!
          </p>
          <button class="btn btn-primary" onclick="App.navigate('dashboard')">Start Your First Quest</button>
        </div>
      ` : `
        <!-- Podium -->
        <div class="card" style="margin-bottom:24px;">
          <div class="card-header">
            <span class="card-title">🏆 Top Questers</span>
            <span class="badge badge-fitness">All Time</span>
          </div>
          <div class="podium">
            ${podiumSlots.map(({ player: p, trueRank }) => {
              const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              return `
                <div class="podium-item ${podiumClasses[trueRank]}">
                  <div class="podium-avatar">${p.avatar ? `<img src="${p.avatar}" alt="${p.name}">` : initials}</div>
                  <div class="podium-name">${p.name}${p.isMe ? ' <span style="color:var(--primary);">(You)</span>' : ''}</div>
                  <div class="podium-pts">${p.xp.toLocaleString()} XP</div>
                  <div class="podium-block">${medals[trueRank - 1]}</div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Full list -->
        <div class="card">
          <div class="card-header"><span class="card-title">📋 Full Rankings</span></div>
          <div class="leaderboard-list">
            ${list.map((p, i) => {
              const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              return `
                <div class="lb-item ${p.isMe ? 'is-me' : ''}" style="animation-delay:${i * 0.05}s">
                  <span class="lb-rank">${i < 3 ? medals[i] : '#' + (i + 1)}</span>
                  <div class="lb-avatar" style="background:${_avatarGrad(i)}">${p.avatar ? `<img src="${p.avatar}" alt="${p.name}">` : initials}</div>
                  <div class="lb-info">
                    <div class="lb-name">${p.name}</div>
                    <div class="lb-level">Level ${p.level}</div>
                  </div>
                  <span class="lb-points">${p.xp.toLocaleString()} XP</span>
                  ${p.isMe ? '<span class="lb-you-tag">YOU</span>' : ''}
                </div>`;
            }).join('')}
          </div>
        </div>
      `}
    </div>`;
  }

  function _avatarGrad(i) {
    const grads = [
      'linear-gradient(135deg,#FFD93D,#FF9F1C)',
      'linear-gradient(135deg,#A0AEC0,#718096)',
      'linear-gradient(135deg,#CD7F32,#a0540a)',
      'var(--grad-primary)', 'var(--grad-secondary)',
      'var(--grad-purple)',  'var(--grad-ocean)', 'var(--grad-sunset)',
    ];
    return grads[i % grads.length];
  }

  function bind() { /* hover effects are CSS-only */ }

  return { render, bind };
})();


/* ============================================
   HABIT QUEST – app.js
   SPA router, toast, theme toggle, init
   ============================================ */

const App = (() => {

  const PAGE_TITLES = {
    dashboard:   'Dashboard',
    habits:      'My Habits',
    leaderboard: 'Leaderboard',
    profile:     'Profile',
  };

  const PAGE_RENDERERS = {
    dashboard:   Dashboard,
    habits:      Habits,
    leaderboard: Leaderboard,
    profile:     Profile,
  };

  let currentPage = 'dashboard';

  /* ── NAVIGATION ─────────────────────────────────────────── */
  async function navigate(page) {
    const authRoot = document.getElementById('auth-root');
    const appRoot  = document.getElementById('app');

    if (page === 'auth') {
      // Show auth screen, hide app
      appRoot.classList.add('hidden');
      authRoot.classList.remove('hidden');
      authRoot.innerHTML = Auth.render();
      Auth.bind();
      return;
    }

    // If leaderboard, refresh data from server first
    if (page === 'leaderboard') {
      const res = await API.get('/api/leaderboard');
      if (res.ok) Store.setLeaderboard(res.leaderboard);
    }

    // Show app, hide auth
    authRoot.classList.add('hidden');
    appRoot.classList.remove('hidden');

    currentPage = page;
    const renderer = PAGE_RENDERERS[page];
    if (!renderer) { navigate('dashboard'); return; }

    // Update page title
    document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;

    // Update active nav item
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update sidebar user info
    const user = Store.getCurrentUser();
    if (user) {
      const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const avatarEl = document.getElementById('sidebar-user-avatar');
      if (avatarEl) {
        avatarEl.innerHTML = user.avatar ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : initials;
      }
      const nameEl  = document.getElementById('sidebar-user-name');
      const emailEl = document.getElementById('sidebar-user-email');
      if (nameEl)  nameEl.textContent  = user.name;
      if (emailEl) emailEl.textContent = user.email;
    }

    // Render page content
    document.getElementById('page-content').innerHTML = renderer.render();
    renderer.bind();
  }

  /* ── SIDEBAR ────────────────────────────────────────────── */
  function _initSidebar() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.page));
    });

    document.querySelector('.user-mini[data-page]')?.addEventListener('click', () => navigate('profile'));

    // Hamburger (mobile)
    const hamburger = document.getElementById('hamburger');
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebar-overlay');

    hamburger?.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.style.display = 'none';
    });
  }

  /* ── THEME ──────────────────────────────────────────────── */
  function toggleTheme() {
    const next = Store.getTheme() === 'dark' ? 'light' : 'dark';
    Store.setTheme(next);
  }

  function _initTheme() {
    Store.setTheme(Store.getTheme());
    document.getElementById('navbar-theme-toggle')?.addEventListener('click', () => {
      toggleTheme();
      navigate(currentPage);
    });
  }

  /* ── TOAST ──────────────────────────────────────────────── */
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }

  /* ── SEARCH ─────────────────────────────────────────────── */
  function _initSearch() {
    const searchInput = document.getElementById('nav-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { navigate(currentPage); return; }
      if (currentPage !== 'habits') navigate('habits');
      setTimeout(() => {
        document.querySelectorAll('.habit-card').forEach(card => {
          const title = card.querySelector('.habit-title')?.textContent.toLowerCase() || '';
          card.style.display = title.includes(q) ? '' : 'none';
        });
      }, 50);
    });
  }

  /* ── INIT ───────────────────────────────────────────────── */
  async function init() {
    _initTheme();
    _initSidebar();
    _initSearch();

    // Check if user is already logged in (session cookie exists)
    const res = await API.get('/api/me');
    if (res.ok) {
      Store.setCurrentUser(res.user);
      // Load habits
      const habitsRes = await API.get('/api/habits');
      Store.setHabits(habitsRes.ok ? habitsRes.habits : []);
      // Start notification bell (loads count + wires click handlers)
      Notifications.init();
      navigate('dashboard');
    } else {
      navigate('auth');
    }
  }

  // Boot the app when the page loads
  document.addEventListener('DOMContentLoaded', init);

  return { navigate, toast, toggleTheme };
})();


/* ============================================================
   HABIT QUEST – notifications.js
   In-app notification bell, dropdown, badge counter

   HOW IT WORKS:
   1. Notifications.init() is called once after login.
   2. It fetches /api/notifications → updates the red badge.
   3. Bell click → dropdown opens, all notifications rendered.
   4. Opening auto-marks all as read (badge resets to 0).
   5. "Clear All" deletes all from DB and empties the list.
   6. Clicking outside the dropdown closes it.
   7. refreshBadge() is called after every habit/profile action.

   DEBUGGING: console.log lines are included so you can open
   DevTools (F12 → Console) and trace every step.
   ============================================================ */

const Notifications = (() => {

  // Track whether the dropdown is currently open
  let _isOpen = false;

  // ── Show/hide the dropdown ───────────────────────────────
  function _show() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) { console.warn('[Notif] dropdown element not found'); return; }
    dropdown.style.display = 'flex';
    _isOpen = true;
    console.log('[Notif] dropdown opened');
  }

  function _hide() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    dropdown.style.display = 'none';
    _isOpen = false;
    console.log('[Notif] dropdown closed');
  }

  // ── Update the red badge number on the bell ──────────────
  async function refreshBadge() {
    const user = Store.getCurrentUser();
    if (!user) return;

    console.log('[Notif] refreshBadge called');
    try {
      const res = await API.get('/api/notifications');
      console.log('[Notif] badge API response:', res);
      if (!res.ok) return;

      const badge = document.getElementById('notif-badge');
      if (!badge) { console.warn('[Notif] badge element not found'); return; }

      const count = res.unread_count;
      if (count > 0) {
        badge.textContent  = count > 99 ? '99+' : String(count);
        badge.style.display = 'flex';
        console.log('[Notif] badge showing:', count);
      } else {
        badge.style.display = 'none';
        console.log('[Notif] badge hidden (0 unread)');
      }
    } catch (err) {
      console.error('[Notif] refreshBadge error:', err);
    }
  }

  // ── Render notification rows inside the dropdown ─────────
  function _renderList(notifications) {
    const list = document.getElementById('notif-list');
    if (!list) { console.warn('[Notif] notif-list element not found'); return; }

    console.log('[Notif] rendering', notifications.length, 'notifications');

    if (!notifications || notifications.length === 0) {
      list.innerHTML = `
        <div class="notif-empty">
          <span style="font-size:2rem;display:block;text-align:center;">🔔</span>
          <p style="text-align:center;color:var(--text-muted);font-size:.88rem;margin-top:8px;">
            No notifications yet
          </p>
        </div>`;
      return;
    }

    // One row per notification
    list.innerHTML = notifications.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
        <span class="notif-item-icon">${n.icon || '🔔'}</span>
        <div class="notif-item-body">
          <p class="notif-item-msg">${n.message}</p>
        </div>
        ${!n.is_read ? '<span class="notif-unread-dot"></span>' : ''}
      </div>
    `).join('');

    // Click a row → mark it read
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        console.log('[Notif] marking read:', id);
        await API.put(`/api/notifications/${id}/read`, {});
        item.classList.remove('unread');
        item.querySelector('.notif-unread-dot')?.remove();
        refreshBadge();
      });
    });
  }

  // ── Open the dropdown and load notifications ─────────────
  async function _openDropdown() {
    console.log('[Notif] _openDropdown called, _isOpen =', _isOpen);

    // Toggle: if already open, close it
    if (_isOpen) {
      _hide();
      return;
    }

    // Fetch fresh notifications from Flask
    try {
      const res = await API.get('/api/notifications');
      console.log('[Notif] fetch response:', res);
      if (res.ok) {
        _renderList(res.notifications);
      } else {
        console.warn('[Notif] API returned not ok:', res);
        _renderList([]);
      }
    } catch (err) {
      console.error('[Notif] fetch error:', err);
      _renderList([]);
    }

    // Show the panel
    _show();

    // Auto-mark all as read
    try {
      await API.put('/api/notifications/read-all', {});
      refreshBadge();
    } catch (err) {
      console.error('[Notif] mark-all-read error:', err);
    }
  }

  // ── Wire all event listeners (called once after login) ───
  function init() {
    console.log('[Notif] init() called');

    // Initial badge load
    refreshBadge();

    // Bell click
    const bell = document.getElementById('notif-btn');
    if (!bell) {
      console.error('[Notif] #notif-btn not found in DOM');
      return;
    }
    console.log('[Notif] bell element found, attaching click listener');

    bell.addEventListener('click', e => {
      e.stopPropagation();
      console.log('[Notif] bell clicked');
      _openDropdown();
    });

    // "Clear All" button
    const clearBtn = document.getElementById('notif-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async e => {
        e.stopPropagation();
        console.log('[Notif] clear all clicked');
        await API.del('/api/notifications/clear');
        _renderList([]);
        refreshBadge();
      });
    }

    // Click outside → close dropdown
    document.addEventListener('click', e => {
      if (!_isOpen) return;
      const wrap = document.getElementById('notif-wrap');
      if (wrap && !wrap.contains(e.target)) {
        console.log('[Notif] outside click – closing dropdown');
        _hide();
      }
    });
  }

  return { init, refreshBadge };
})();
