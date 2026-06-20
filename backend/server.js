const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

// Explicitly permit the incoming traffic from Live Server port 5500
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Force fallback to standard local string with connection parameters
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fintwin';
// Fixed: Using a clear global variable string to prevent scoping lookup errors
const JWT_SECRET = process.env.JWT_SECRET || 'fintwin_secret_super_key';

console.log('⏳ Attempting to connect to MongoDB...');

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000 // If it can't connect in 5 seconds, throw an error instead of hanging!
})
.then(() => console.log('✅ Connected to MongoDB Database successfully'))
.catch(err => {
  console.error('❌ DB Connection error:', err.message);
  console.log('\n💡 TIP: Is your MongoDB Compass or MongoDB Community Server running?');
});

/* ─── 1. DATABASE MODELS & SCHEMAS ─── */

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  income: { type: Number, default: 0 },
  savings: { type: Number, default: 0 },
  hasConfiguredProfile: { type: Boolean, default: false },
  phone: { type: String, default: '' },
  joinedDate: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const SimulationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  item: { type: String, required: true },
  cost: { type: Number, required: true },
  type: { type: String, enum: ['Cash', 'EMI'], required: true },
  monthlyCommitment: { type: Number, default: 0 },
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Simulation = mongoose.model('Simulation', SimulationSchema);

const ExpenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', ExpenseSchema);

/* ─── 2. SECURITY MIDDLEWARE ─── */

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    console.log("⚠️ Auth Blocked: Request missing token header.");
    return res.status(401).json({ message: 'Access denied. Missing token.' });
  }

  // Explicit fallback string matching line 14 exactly
  const secretKey = process.env.JWT_SECRET || 'fintwin_secret_super_key';

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      console.log("⚠️ Auth Blocked: Token verification failed or expired.");
      return res.status(403).json({ message: 'Session expired. Please log in again.' });
    }
    req.user = user;
    next();
  });
};

/* ─── 3. ALL REQUIRED POST & GET ENDPOINTS ─── */


// A. USER AUTHENTICATION ROUTE (SIGNUP)
// Make sure you have this installed

app.post('/api/auth/signup', async (req, res) => {
  console.log("--- 1. Signup request reached server ---");
  
  try {
    const { name, email, password } = req.body;
    
    // Log the user data to see if the frontend sent it correctly
    console.log("--- 2. Data received:", { name, email });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    
    console.log("--- 3. Attempting to save to MongoDB ---");
    await newUser.save();
    
    console.log("--- 4. SUCCESS: Data saved! ---");
    res.status(201).json({ message: 'Signup complete!' });
    
  } catch (err) { 
    console.error("--- 5. ERROR in Signup route:", err.message); 
    res.status(500).json({ message: err.message }); 
  }
});

// B. USER AUTHENTICATION ROUTE (LOGIN)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`✉️ Login attempt received for: ${email}`);
    
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Incorrect email or password.' });
    }
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, hasConfiguredProfile: user.hasConfiguredProfile });
  } catch (err) { 
    res.status(500).json({ message: 'Server login error.' }); 
  }
});

// C. GET USER PROFILE OVERVIEW DETAILS
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (err) { 
    res.status(500).json({ message: 'Failed to fetch profile context.' }); 
  }
});

// D. UPDATE USER DETAILS / MATRIX CALIBRATION (SETUP & PROFILE PAGES)
app.post('/api/profile/setup', authenticateToken, async (req, res) => {
  try {
    const { name, income, savings, phone } = req.body;
    
    const updateData = { hasConfiguredProfile: true };
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (income !== undefined) updateData.income = Number(income);
    if (savings !== undefined) updateData.savings = Number(savings);

    await User.findByIdAndUpdate(req.user.userId, updateData);
    res.json({ message: 'Twin configurations successfully updated!' });
  } catch (err) { 
    res.status(500).json({ message: 'Update failed.' }); 
  }
});

// E. LOG AN UNPLANNED PURCHASE SIMULATION ENTRY
app.post('/api/simulations', authenticateToken, async (req, res) => {
  try {
    const { item, cost, type, monthlyCommitment, status } = req.body;
    const log = new Simulation({ userId: req.user.userId, item, cost, type, monthlyCommitment, status });
    await log.save();
    res.status(201).json(log);
  } catch (err) { 
    res.status(500).json({ message: 'Failed to record sandbox query log.' }); 
  }
});

// F. GET PAST EXECUTED SIMULATIONS LIST
app.get('/api/simulations', authenticateToken, async (req, res) => {
  try {
    const history = await Simulation.find({ userId: req.user.userId }).sort({ timestamp: -1 }).limit(10);
    res.json(history);
  } catch (err) { 
    res.status(500).json({ message: 'Failed to gather history logs.' }); 
  }
});

// G. MONGODB EXPENSE INPUT ROUTER
// G. MONGODB EXPENSE INPUT ROUTER
// G. MONGODB EXPENSE INPUT ROUTER
app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { title, amount, category } = req.body;
    
    // 1. Verification step
    if (!title || !amount || !category) {
      return res.status(400).json({ message: 'Missing title, amount, or category fields.' });
    }

    // 2. Create and save the new Expense document
    const newExpense = new Expense({
      userId: req.user.userId, 
      title,
      amount: Number(amount),
      category
    });
    await newExpense.save();

    // 3. Update User savings (Deduct total transaction volume)
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { savings: -Number(amount) }
    });

    console.log(`💸 Expense Logged: ${title} (-₹${amount}) for User: ${req.user.userId}`);
    res.status(200).json({ message: 'Expense tracked in MongoDB safely.' });

  } catch (err) {
    console.error("❌ MongoDB Expense Error:", err.message);
    res.status(500).json({ message: 'Server error while committing ledger.' });
  }
});

// H. GET ALL TRACKED EXPENSES STREAM 
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const records = await Expense.find({ userId: req.user.userId }).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Failed to extract expense tracking data arrays.' });
  }
});

/* ─── 4. SPIN UP EXPRESS RUNTIME ─── */
const PORT = 5000;
const HOST = '127.0.0.1'; // Explicitly bind to IPv4

app.listen(PORT, HOST, () => {
  console.log(`🚀Server running at http://${HOST}:5000 `);
});