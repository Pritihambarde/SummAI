const API = 'http://localhost:3000/api';

const Users = {
  async create({ name, email, password }) {
    const res = await fetch(`${API}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    return res.json();
  },

  async findByEmail(email, password) {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  }
};

const History = {
  async add(data) {
    const res = await fetch(`${API}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async getByUser(userId) {
    const res = await fetch(`${API}/history/${userId}`);
    const data = await res.json();
    return data.history || [];
  },

  async delete(id) {
    await fetch(`${API}/history/${id}`, { method: 'DELETE' });
  },

  clearByUser() {}
};

const Session = {
  get() {
    try { return JSON.parse(sessionStorage.getItem('summai_session') || 'null'); }
    catch { return null; }
  },
  set(user) {
    sessionStorage.setItem('summai_session', JSON.stringify({
      id:    user._id,
      name:  user.name,
      email: user.email
    }));
  },
  clear() { sessionStorage.removeItem('summai_session'); }
};

window.DB = { Users, History, Session };