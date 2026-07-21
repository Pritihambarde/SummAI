require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   MONGODB CONNECTION
   =========================
   The connection string is now read from an environment variable
   instead of being hardcoded. Create a .env file in this folder
   (see .env.example) with your own MONGO_URI before running.
========================= */

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.log('❌ MONGO_URI is not set. Create a .env file — see .env.example for the format.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => {
    console.log('❌ MongoDB Error:', err.message);
    console.log('👉 Check that MONGO_URI in your .env file is correct.');
  });

/* =========================
   SCHEMAS
========================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  password: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const historySchema = new mongoose.Schema({
  userId: String,
  inputType: String,
  inputPreview: String,
  summary: String,
  lang: String,
  length: String,
  createdAt: { type: Date, default: Date.now }
});

const History = mongoose.model('History', historySchema);

/* =========================
   ROUTES
========================= */

// SIGNUP
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.json({ error: 'Email already registered' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    const { password: _pw, ...userSafe } = user.toObject();
    res.json({ user: userSafe });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ error: 'Invalid email or password' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ error: 'Invalid email or password' });
    const { password: _pw, ...userSafe } = user.toObject();
    res.json({ user: userSafe });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// SAVE HISTORY
app.post('/api/history', async (req, res) => {
  try {
    const entry = await History.create(req.body);
    res.json({ entry });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// GET HISTORY
app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await History.find({ userId: req.params.userId })
      .sort({ createdAt: -1 });
    res.json({ history });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// DELETE HISTORY
app.delete('/api/history/:id', async (req, res) => {
  try {
    await History.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
