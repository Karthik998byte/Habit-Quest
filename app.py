# ============================================================
#  HABIT QUEST – Flask Backend (SQLite version)
#  app.py  ← single file, all routes + DB setup
#
#  WHAT THIS FILE DOES:
#  1. Creates a local SQLite database file (habit_quest.db)
#  2. Creates all required tables automatically on first run
#  3. Provides REST API endpoints that the frontend calls
#  4. Manages user sessions (login / logout)
#  5. Returns JSON responses to JavaScript fetch() calls
#
#  NO MySQL, NO XAMPP needed – SQLite is built into Python!
# ============================================================

from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3      # built-in Python module – no install needed
import hashlib      # for hashing passwords (SHA-256)
import math
import os
from datetime import date, timedelta

# ── App setup ──────────────────────────────────────────────
app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'habitquest_sqlite_secret_2024'  # change in production
CORS(app, supports_credentials=True)              # allow cookies from browser

# ── Database file path ─────────────────────────────────────
# The .db file will be created in the same folder as app.py
DB_PATH = os.path.join(os.path.dirname(__file__), 'habit_quest.db')


# ════════════════════════════════════════════════════════════
#  DATABASE HELPERS
# ════════════════════════════════════════════════════════════

def get_db():
    """
    Open a connection to the SQLite database.
    row_factory = sqlite3.Row lets us access columns by name (like a dict).
    Called at the start of every route that needs the DB.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # access columns as row['column_name']
    conn.execute("PRAGMA foreign_keys = ON")  # enforce FK constraints
    return conn


def init_db():
    """
    Create all tables if they don't already exist.
    This runs once when you start the server.
    Safe to call every time – uses IF NOT EXISTS.
    """
    conn = get_db()
    cur  = conn.cursor()

    # ── Table 1: users ──────────────────────────────────────
    # Stores account info + lifetime XP for leveling
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL,
            email      TEXT    UNIQUE NOT NULL,
            password   TEXT    NOT NULL,   -- SHA-256 hex hash
            bio        TEXT    DEFAULT '',
            avatar     TEXT    DEFAULT '', -- base64 image string
            total_xp   INTEGER DEFAULT 0,  -- lifetime XP earned
            created_at TEXT    DEFAULT (date('now'))
        )
    """)

    # ── Table 2: habits ─────────────────────────────────────
    # Each row = one habit belonging to a user
    cur.execute("""
        CREATE TABLE IF NOT EXISTS habits (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            title       TEXT    NOT NULL,
            description TEXT    DEFAULT '',
            category    TEXT    DEFAULT 'other',
            color       TEXT    DEFAULT '#FF6B6B',
            streak      INTEGER DEFAULT 0,
            best_streak INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # ── Table 3: task_completions ───────────────────────────
    # One row per (habit, date) when a habit was completed.
    # UNIQUE(habit_id, done_date) prevents double-completion on same day.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_completions (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id  INTEGER NOT NULL,
            user_id   INTEGER NOT NULL,
            done_date TEXT    NOT NULL,   -- stored as 'YYYY-MM-DD'
            UNIQUE(habit_id, done_date),
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
        )
    """)

    # ── Table 4: notifications ──────────────────────────────
    # Stores in-app notifications for each user.
    # is_read = 0 means unread (shows red dot on bell icon).
    # is_read = 1 means the user has seen it.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            message    TEXT    NOT NULL,   -- e.g. "Habit completed! +25 XP"
            icon       TEXT    DEFAULT '🔔', -- emoji shown in the dropdown
            is_read    INTEGER DEFAULT 0,  -- 0 = unread, 1 = read
            created_at TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print("✅ SQLite database ready →", DB_PATH)
# ── Helper: hash a password ────────────────────────────────
def hash_password(password):
    """SHA-256 hash. Simple and good enough for a college project."""
    return hashlib.sha256(password.encode()).hexdigest()


# ── Helper: calculate level from total XP ──────────────────
def calc_level(total_xp):
    """
    Level formula: each level needs 35% more XP than the previous.
      Level 1 → needs 100 XP
      Level 2 → needs 135 XP
      Level 3 → needs 182 XP  ... and so on.

    Returns (level, xp_in_current_level, xp_needed_for_next_level)
    """
    level      = 1
    xp_to_next = 100
    remaining  = total_xp

    while remaining >= xp_to_next:
        remaining  -= xp_to_next
        level      += 1
        xp_to_next  = math.ceil(xp_to_next * 1.35)

    return level, remaining, xp_to_next


# ── Helper: build a user dict for JSON responses ───────────
def user_to_dict(row):
    """Convert a users DB row into the shape the frontend expects."""
    level, xp_current, xp_to_next = calc_level(row['total_xp'])
    return {
        'id':       row['id'],
        'name':     row['name'],
        'email':    row['email'],
        'bio':      row['bio']    or '',
        'avatar':   row['avatar'] or '',
        'level':    level,
        'xp':       xp_current,
        'xpToNext': xp_to_next,
        'total_xp': row['total_xp'],
    }


# ── Helper: build a habit dict for JSON responses ──────────
def habit_to_dict(row, completed_dates):
    """
    Combine a habits DB row with its list of completion date strings.
    Shape matches what the JavaScript Store / render functions expect.
    """
    return {
        'id':             row['id'],
        'title':          row['title'],
        'description':    row['description'] or '',
        'category':       row['category'],
        'color':          row['color'],
        'streak':         row['streak'],
        'bestStreak':     row['best_streak'],
        'completedDates': completed_dates,   # list of 'YYYY-MM-DD' strings
        'createdAt':      row['created_at'],
    }


# ════════════════════════════════════════════════════════════
#  SERVE FRONTEND
# ════════════════════════════════════════════════════════════

@app.route('/')
def index():
    """Serve index.html when you open http://localhost:5000"""
    return app.send_static_file('index.html')


# ════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ════════════════════════════════════════════════════════════

@app.route('/api/register', methods=['POST'])
def register():
    """
    Register a new user account.
    Expects JSON: { name, email, password }
    Returns:      { ok, user }  or  { ok, msg }
    """
    data     = request.get_json()
    name     = (data.get('name')     or '').strip()
    email    = (data.get('email')    or '').strip().lower()
    password = (data.get('password') or '')

    # Basic validation
    if not name or not email or not password:
        return jsonify({'ok': False, 'msg': 'All fields are required.'}), 400
    if len(password) < 6:
        return jsonify({'ok': False, 'msg': 'Password must be at least 6 characters.'}), 400

    conn = get_db()
    cur  = conn.cursor()

    # Check if email already exists
    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cur.fetchone():
        conn.close()
        return jsonify({'ok': False, 'msg': 'Email already registered.'}), 409

    # Insert new user
    hashed = hash_password(password)
    cur.execute(
        "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
        (name, email, hashed)
    )
    conn.commit()
    user_id = cur.lastrowid

    # Fetch the new user back
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    conn.close()

    # Save session (like a login cookie)
    session['user_id'] = user_id

    return jsonify({'ok': True, 'user': user_to_dict(user)})


@app.route('/api/login', methods=['POST'])
def login():
    """
    Login with email + password.
    Expects JSON: { email, password }
    Returns:      { ok, user }  or  { ok, msg }
    """
    data     = request.get_json()
    email    = (data.get('email')    or '').strip().lower()
    password = (data.get('password') or '')

    conn   = get_db()
    cur    = conn.cursor()
    hashed = hash_password(password)

    cur.execute(
        "SELECT * FROM users WHERE email = ? AND password = ?",
        (email, hashed)
    )
    user = cur.fetchone()
    conn.close()

    if not user:
        return jsonify({'ok': False, 'msg': 'Invalid email or password.'}), 401

    session['user_id'] = user['id']
    return jsonify({'ok': True, 'user': user_to_dict(user)})


@app.route('/api/logout', methods=['POST'])
def logout():
    """Clear the session (log the user out)."""
    session.clear()
    return jsonify({'ok': True})


@app.route('/api/me', methods=['GET'])
def get_me():
    """
    Return the currently logged-in user.
    The frontend calls this on every page load to check login state.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    conn.close()

    if not user:
        session.clear()
        return jsonify({'ok': False, 'msg': 'User not found.'}), 404

    return jsonify({'ok': True, 'user': user_to_dict(user)})


@app.route('/api/profile', methods=['PUT'])
def update_profile():
    """
    Update name, email, bio, and optionally avatar (base64 string).
    Expects JSON: { name, email, bio, avatar? }
    Returns:      { ok, user }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    data   = request.get_json()
    name   = (data.get('name')  or '').strip()
    email  = (data.get('email') or '').strip().lower()
    bio    = data.get('bio',    '')
    avatar = data.get('avatar', None)   # base64 string or None

    if not name or not email:
        return jsonify({'ok': False, 'msg': 'Name and email are required.'}), 400

    conn = get_db()
    cur  = conn.cursor()

    # Make sure email isn't taken by another user
    cur.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user_id))
    if cur.fetchone():
        conn.close()
        return jsonify({'ok': False, 'msg': 'Email already in use.'}), 409

    if avatar is not None:
        cur.execute(
            "UPDATE users SET name=?, email=?, bio=?, avatar=? WHERE id=?",
            (name, email, bio, avatar, user_id)
        )
    else:
        cur.execute(
            "UPDATE users SET name=?, email=?, bio=? WHERE id=?",
            (name, email, bio, user_id)
        )

    # 🔔 Notify: profile updated
    add_notification(conn, user_id, 'Your profile was updated ✨', '👤')

    conn.commit()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    conn.close()

    return jsonify({'ok': True, 'user': user_to_dict(user)})


# ════════════════════════════════════════════════════════════
#  HABIT ROUTES
# ════════════════════════════════════════════════════════════

@app.route('/api/habits', methods=['GET'])
def get_habits():
    """
    Return all habits for the logged-in user,
    each with their list of completed dates.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    cur  = conn.cursor()

    cur.execute(
        "SELECT * FROM habits WHERE user_id = ? ORDER BY created_at ASC",
        (user_id,)
    )
    habits = cur.fetchall()

    result = []
    for h in habits:
        # Get all completion dates for this habit
        cur.execute(
            "SELECT done_date FROM task_completions WHERE habit_id = ? ORDER BY done_date ASC",
            (h['id'],)
        )
        dates = [row['done_date'] for row in cur.fetchall()]
        result.append(habit_to_dict(h, dates))

    conn.close()
    return jsonify({'ok': True, 'habits': result})


@app.route('/api/habits', methods=['POST'])
def create_habit():
    """
    Create a new habit and award +50 XP.
    Expects JSON: { title, description, category, color }
    Returns:      { ok, habit }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    data  = request.get_json()
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'ok': False, 'msg': 'Title is required.'}), 400

    description = data.get('description', '')
    category    = data.get('category',    'other')
    color       = data.get('color',       '#FF6B6B')

    conn = get_db()
    cur  = conn.cursor()

    # Insert the habit
    cur.execute(
        "INSERT INTO habits (user_id, title, description, category, color) VALUES (?,?,?,?,?)",
        (user_id, title, description, category, color)
    )
    habit_id = cur.lastrowid

    # Award 50 XP for creating a habit
    cur.execute("UPDATE users SET total_xp = total_xp + 50 WHERE id = ?", (user_id,))

    # 🔔 Notify: habit created
    add_notification(conn, user_id,
        f'New habit "{title}" created! +50 XP ✨', '🎯')

    conn.commit()

    # Fetch the new habit to return it
    cur.execute("SELECT * FROM habits WHERE id = ?", (habit_id,))
    habit = cur.fetchone()
    conn.close()

    return jsonify({'ok': True, 'habit': habit_to_dict(habit, [])})


@app.route('/api/habits/<int:habit_id>', methods=['PUT'])
def update_habit(habit_id):
    """
    Edit an existing habit's title, description, category, or color.
    Expects JSON: { title, description, category, color }
    Returns:      { ok, habit }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    data        = request.get_json()
    title       = (data.get('title') or '').strip()
    description = data.get('description', '')
    category    = data.get('category',    'other')
    color       = data.get('color',       '#FF6B6B')

    if not title:
        return jsonify({'ok': False, 'msg': 'Title is required.'}), 400

    conn = get_db()
    cur  = conn.cursor()

    # Verify this habit belongs to the logged-in user
    cur.execute("SELECT id FROM habits WHERE id = ? AND user_id = ?", (habit_id, user_id))
    if not cur.fetchone():
        conn.close()
        return jsonify({'ok': False, 'msg': 'Habit not found.'}), 404

    cur.execute(
        "UPDATE habits SET title=?, description=?, category=?, color=? WHERE id=?",
        (title, description, category, color, habit_id)
    )
    conn.commit()

    # Return updated habit with its completion dates
    cur.execute("SELECT * FROM habits WHERE id = ?", (habit_id,))
    habit = cur.fetchone()
    cur.execute(
        "SELECT done_date FROM task_completions WHERE habit_id = ? ORDER BY done_date ASC",
        (habit_id,)
    )
    dates = [row['done_date'] for row in cur.fetchall()]
    conn.close()

    return jsonify({'ok': True, 'habit': habit_to_dict(habit, dates)})


@app.route('/api/habits/<int:habit_id>', methods=['DELETE'])
def delete_habit(habit_id):
    """
    Delete a habit.
    SQLite CASCADE deletes its task_completions automatically.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    cur  = conn.cursor()

    # Verify ownership
    cur.execute("SELECT id FROM habits WHERE id = ? AND user_id = ?", (habit_id, user_id))
    if not cur.fetchone():
        conn.close()
        return jsonify({'ok': False, 'msg': 'Habit not found.'}), 404

    cur.execute("DELETE FROM habits WHERE id = ?", (habit_id,))

    # 🔔 Notify: habit deleted
    add_notification(conn, user_id, 'A habit was deleted 🗑️', '🗑️')

    conn.commit()
    conn.close()

    return jsonify({'ok': True})


# ════════════════════════════════════════════════════════════
#  TASK COMPLETION  (toggle done / undone)
# ════════════════════════════════════════════════════════════

@app.route('/api/habits/<int:habit_id>/toggle', methods=['POST'])
def toggle_habit(habit_id):
    """
    Mark a habit as done OR undo it for today.

    XP RULES (prevents XP farming):
    ─────────────────────────────────────────────────────────
    • First completion today  → INSERT into task_completions + +25 XP
    • Undo (mark incomplete)  → DELETE from task_completions + -25 XP
    • XP never goes below 0   → MAX(0, total_xp - 25)
    • The UNIQUE(habit_id, done_date) constraint in the DB
      physically prevents a second INSERT for the same day,
      so double-XP is impossible even if the button is clicked fast.
    ─────────────────────────────────────────────────────────

    Returns: { ok, completed, streak, bestStreak, completedDates, user }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    today = date.today().isoformat()   # 'YYYY-MM-DD'

    conn = get_db()
    cur  = conn.cursor()

    # Verify ownership
    cur.execute("SELECT * FROM habits WHERE id = ? AND user_id = ?", (habit_id, user_id))
    habit = cur.fetchone()
    if not habit:
        conn.close()
        return jsonify({'ok': False, 'msg': 'Habit not found.'}), 404

    # Check if already completed today
    cur.execute(
        "SELECT id FROM task_completions WHERE habit_id = ? AND done_date = ?",
        (habit_id, today)
    )
    existing = cur.fetchone()

    if existing:
        # ── UNDO: remove today's completion, deduct XP ──────
        cur.execute(
            "DELETE FROM task_completions WHERE habit_id = ? AND done_date = ?",
            (habit_id, today)
        )
        # Deduct 25 XP but never go below 0
        cur.execute(
            "UPDATE users SET total_xp = MAX(0, total_xp - 25) WHERE id = ?",
            (user_id,)
        )
        completed = False
    else:
        # ── COMPLETE: add completion, award XP ──────────────
        cur.execute(
            "INSERT INTO task_completions (habit_id, user_id, done_date) VALUES (?,?,?)",
            (habit_id, user_id, today)
        )
        cur.execute(
            "UPDATE users SET total_xp = total_xp + 25 WHERE id = ?",
            (user_id,)
        )
        completed = True

    conn.commit()

    # ── Recalculate streak ───────────────────────────────────
    # Fetch all completion dates for this habit (newest first)
    cur.execute(
        "SELECT done_date FROM task_completions WHERE habit_id = ? ORDER BY done_date DESC",
        (habit_id,)
    )
    all_date_strs = [row['done_date'] for row in cur.fetchall()]
    # Convert to date objects for arithmetic
    all_dates = [date.fromisoformat(d) for d in all_date_strs]

    streak = 0
    check  = date.today()
    for i in range(400):
        if check in all_dates:
            streak += 1
            check  -= timedelta(days=1)
        elif i == 0:
            # Today not done yet – check if yesterday keeps the streak alive
            check -= timedelta(days=1)
            if check in all_dates:
                streak += 1
                check  -= timedelta(days=1)
            else:
                break
        else:
            break

    best_streak = max(habit['best_streak'], streak)

    # Save updated streak values
    cur.execute(
        "UPDATE habits SET streak = ?, best_streak = ? WHERE id = ?",
        (streak, best_streak, habit_id)
    )

    # 🔔 Notifications based on what just happened
    if completed:
        # Always notify on completion with XP
        add_notification(conn, user_id,
            f'"{habit["title"]}" completed! +25 XP ⚡', '✅')
        # Bonus notification for streak milestones
        if streak in (3, 7, 14, 30, 60, 100):
            add_notification(conn, user_id,
                f'🔥 {streak}-day streak on "{habit["title"]}"! Keep it up!', '🔥')
    else:
        # Notified on undo
        add_notification(conn, user_id,
            f'"{habit["title"]}" marked incomplete. -25 XP', '↩️')

    conn.commit()

    # Fetch updated user XP for the response
    cur.execute("SELECT total_xp FROM users WHERE id = ?", (user_id,))
    user_row = cur.fetchone()
    level, xp_current, xp_to_next = calc_level(user_row['total_xp'])

    conn.close()

    return jsonify({
        'ok':             True,
        'completed':      completed,
        'streak':         streak,
        'bestStreak':     best_streak,
        'completedDates': all_date_strs,   # newest first from DB, JS handles display
        'user': {
            'level':    level,
            'xp':       xp_current,
            'xpToNext': xp_to_next,
            'total_xp': user_row['total_xp'],
        }
    })


# ════════════════════════════════════════════════════════════
#  LEADERBOARD
# ════════════════════════════════════════════════════════════

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    """
    Return all users sorted by XP descending.
    Tiebreaker: earlier created_at wins (they earned the same XP first).
    Marks the current user with isMe: true.
    Only includes users who have earned XP, plus the current user always.

    The ORDER BY is done entirely in SQLite so the result is always
    authoritative – no client-side re-sorting needed or done.
    """
    user_id = session.get('user_id')

    conn = get_db()
    cur  = conn.cursor()

    # Sort by total_xp DESC, then by created_at ASC as tiebreaker.
    # Both columns live in the DB – no session order, no login time.
    cur.execute(
        """SELECT id, name, avatar, total_xp, created_at
           FROM users
           ORDER BY total_xp DESC, created_at ASC"""
    )
    users = cur.fetchall()
    conn.close()

    result = []
    for u in users:
        level, _, _ = calc_level(u['total_xp'])
        result.append({
            'name':   u['name'],
            'avatar': u['avatar'] or '',
            'level':  level,
            'xp':     u['total_xp'],
            'isMe':   (u['id'] == user_id),
        })

    # Keep users who have XP > 0, but always include the current user
    # so they can see their own rank even if they haven't earned XP yet.
    # The filter preserves the ORDER BY order – no re-sorting here.
    result = [r for r in result if r['xp'] > 0 or r['isMe']]

    return jsonify({'ok': True, 'leaderboard': result})


# ════════════════════════════════════════════════════════════
#  WEEKLY ACTIVITY  (dashboard bar chart)
# ════════════════════════════════════════════════════════════

@app.route('/api/weekly', methods=['GET'])
def weekly_activity():
    """
    Return how many habits were completed on each of the last 7 days.
    Used by the Dashboard's bar chart.
    Returns: { ok, days: ['Mon','Tue',...], counts: [2,0,3,...] }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    cur  = conn.cursor()

    days   = []
    counts = []

    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        d_str = d.isoformat()   # 'YYYY-MM-DD'

        # Count completions for this user on this date
        cur.execute(
            """SELECT COUNT(*) AS cnt
               FROM task_completions tc
               JOIN habits h ON h.id = tc.habit_id
               WHERE h.user_id = ? AND tc.done_date = ?""",
            (user_id, d_str)
        )
        row = cur.fetchone()
        days.append(d.strftime('%a'))    # 'Mon', 'Tue', ...
        counts.append(row['cnt'])

    conn.close()
    return jsonify({'ok': True, 'days': days, 'counts': counts})


# ════════════════════════════════════════════════════════════
#  NOTIFICATION HELPER  (used internally by other routes)
# ════════════════════════════════════════════════════════════
def add_notification(conn, user_id, message, icon='🔔'):
    """
    Insert one notification row for a user.
    Called from inside other routes (toggle, create_habit, etc.)
    so we reuse the same open DB connection.

    Parameters:
      conn    – open SQLite connection (already in a transaction)
      user_id – which user gets the notification
      message – text shown in the dropdown, e.g. "Habit completed! +25 XP ⚡"
      icon    – emoji shown on the left of the notification row
    """
    conn.execute(
        "INSERT INTO notifications (user_id, message, icon) VALUES (?, ?, ?)",
        (user_id, message, icon)
    )
    # Note: caller is responsible for conn.commit()


# ════════════════════════════════════════════════════════════
#  NOTIFICATION ROUTES
# ════════════════════════════════════════════════════════════

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    """
    Return all notifications for the logged-in user, newest first.
    Also returns the count of unread notifications (for the badge).

    Response: {
      ok: true,
      notifications: [ { id, message, icon, is_read, created_at }, ... ],
      unread_count: 3
    }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    cur  = conn.cursor()

    # Fetch latest 30 notifications (enough for a mini project)
    cur.execute(
        """SELECT id, message, icon, is_read, created_at
           FROM notifications
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 30""",
        (user_id,)
    )
    rows = cur.fetchall()

    # Count unread ones for the red badge number
    cur.execute(
        "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0",
        (user_id,)
    )
    unread_count = cur.fetchone()['cnt']
    conn.close()

    notifications = [
        {
            'id':         row['id'],
            'message':    row['message'],
            'icon':       row['icon'],
            'is_read':    bool(row['is_read']),
            'created_at': row['created_at'],
        }
        for row in rows
    ]

    return jsonify({
        'ok':             True,
        'notifications':  notifications,
        'unread_count':   unread_count,
    })


@app.route('/api/notifications/<int:notif_id>/read', methods=['PUT'])
def mark_notification_read(notif_id):
    """
    Mark a single notification as read.
    Called when the user clicks on a notification in the dropdown.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
        (notif_id, user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/notifications/read-all', methods=['PUT'])
def mark_all_read():
    """
    Mark ALL notifications as read for the logged-in user.
    Called when the user opens the dropdown (auto-mark-read).
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
        (user_id,)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/notifications/clear', methods=['DELETE'])
def clear_notifications():
    """
    Delete ALL notifications for the logged-in user.
    Called when the user clicks "Clear All" in the dropdown.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'Not logged in.'}), 401

    conn = get_db()
    conn.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ════════════════════════════════════════════════════════════
#  ENTRY POINT
# ════════════════════════════════════════════════════════════

if __name__ == '__main__':
    init_db()   # create tables on first run (safe to call every time)
    print("🚀 Habit Quest running at http://localhost:5000")
    app.run(debug=True, port=5000)
