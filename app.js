// Required packages
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const session = require('express-session');

const app = express();
const port = 4000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for JSON data
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'urbansolve-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 hour
}));

// Database connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Rahulgupta1975',
  database: 'urbansolve'
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
  
  // Create users table if it doesn't exist
  const createUsersTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fullname VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.query(createUsersTableQuery, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table ready');
    }
  });
  
  // Create the reports table if it doesn't exist
  const createReportsTableQuery = `
    CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      user_email VARCHAR(100),
      category VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      scheme_number VARCHAR(50),
      status VARCHAR(20) DEFAULT 'Pending',
      vendor VARCHAR(100) DEFAULT NULL,
      location VARCHAR(255) NOT NULL,
      lat DECIMAL(10,6) NULL,
      lng DECIMAL(10,6) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `;
  
  db.query(createReportsTableQuery, (err) => {
    if (err) {
      console.error('Error creating reports table:', err);
    } else {
      console.log('Reports table ready');
    }
  });
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Routes
// Signup route
app.post('/signup', async (req, res) => {
  try {
    const { fullname, email, password } = req.body;
    
    // Check if user already exists
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Insert new user
      db.query(
        'INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)',
        [fullname, email, hashedPassword],
        (err, result) => {
          if (err) {
            console.error('Error creating user:', err);
            return res.status(500).json({ success: false, message: 'Failed to create account' });
          }
          
          return res.status(201).json({ success: true, message: 'Account created successfully' });
        }
      );
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Updated Login route
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
      }
      
      if (results.length === 0) {
        return res.status(401).json({ success: false, message: 'User not found. Please sign up first' });
      }
      
      const user = results[0];
      
      // Compare passwords
      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }
      
      // Set session
      req.session.user = {
        id: user.id,
        fullname: user.fullname,
        email: user.email
      };
      
      return res.status(200).json({ success: true, message: 'Login successful', user: { id: user.id, fullname: user.fullname, email: user.email } });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Check if user is logged in
app.get('/check-auth', (req, res) => {
  if (req.session.user) {
    return res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    return res.status(200).json({ loggedIn: false });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Failed to logout' });
    }
    res.redirect('/');
  });
});

// API Routes for Reports
// POST a new report
app.post('/api/reports', isAuthenticated, (req, res) => {
  console.log('Received report submission:', req.body);
  
  const { title, category, description, scheme_no } = req.body;
  let { lat, lng } = req.body;
  
  // Convert empty strings to NULL for lat/lng
  lat = lat === '' || lat === undefined ? null : lat;
  lng = lng === '' || lng === undefined ? null : lng;
  
  // Create location string from coordinates
  const location = lat && lng ? `Latitude: ${lat}, Longitude: ${lng}` : 'Location not specified';
  
  // Validate required fields
  if (!title || !category || !description) {
    console.log('Missing required fields:', { title, category, description });
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  
  const query = `
    INSERT INTO reports (user_id, user_email, title, category, description, scheme_number, location, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.query(query, [
    req.session.user.id,
    req.session.user.email,
    title, 
    category, 
    description, 
    scheme_no, 
    location, 
    lat, 
    lng
  ], (err, result) => {
    if (err) {
      console.error('Error creating report:', err);
      return res.status(500).json({ success: false, message: 'Error submitting report: ' + err.message });
    }
    
    console.log('Report submitted successfully, ID:', result.insertId);
    res.json({ success: true, id: result.insertId });
  });
});

// Updated GET all reports for the current user
app.get('/api/user-reports', isAuthenticated, (req, res) => {
  const query = 'SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC';
  
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Error fetching user reports:', err);
      return res.status(500).json({ success: false, message: 'Error fetching reports' });
    }
    
    res.json(results);
  });
});

// Updated GET reports for the admin panel
app.get('/api/admin/reports', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  
  const isAdmin = req.session.user.email === 'admin@urbansolve.com'; // Replace with your admin check
  
  let query = 'SELECT * FROM reports';
  let params = [];
  
  // If not an admin, only show user's own reports
  if (!isAdmin) {
    query += ' WHERE user_email = ? OR user_id = ?';
    params = [req.session.user.email, req.session.user.id];
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching reports for admin panel:', err);
      return res.status(500).json({ success: false, message: 'Error fetching reports' });
    }
    
    res.json(results);
  });
});

// Updated PUT update report (assign vendor)
app.put('/api/reports/:id/assign', (req, res) => {
  const reportId = req.params.id;
  const { vendor } = req.body;
  
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  
  if (!vendor) {
    return res.status(400).json({ success: false, message: 'Vendor is required' });
  }
  
  // Check if the user is an admin
  const isAdmin = req.session.user.email === 'admin@urbansolve.com'; // Replace with your admin check
  
  let query = `
    UPDATE reports
    SET vendor = ?, status = 'In Progress'
    WHERE id = ?
  `;
  
  let params = [vendor, reportId];
  
  // If not an admin, make sure they can only update their own reports
  if (!isAdmin) {
    query += ' AND (user_email = ? OR user_id = ?)';
    params.push(req.session.user.email, req.session.user.id);
  }
  
  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Error assigning vendor:', err);
      return res.status(500).json({ success: false, message: 'Error assigning vendor' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Report not found or you do not have permission' });
    }
    
    res.json({ success: true });
  });
});

// Updated resolve report endpoint
app.put('/api/reports/:id/resolve', (req, res) => {
  const reportId = req.params.id;
  
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  
  // Check if the user is an admin
  const isAdmin = req.session.user.email === 'admin@urbansolve.com'; // Replace with your admin check
  
  let query = `
    UPDATE reports
    SET status = 'Resolved'
    WHERE id = ?
  `;
  
  let params = [reportId];
  
  // If not an admin, make sure they can only update their own reports
  if (!isAdmin) {
    query += ' AND (user_email = ? OR user_id = ?)';
    params.push(req.session.user.email, req.session.user.id);
  }
  
  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Error resolving report:', err);
      return res.status(500).json({ success: false, message: 'Error resolving report' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Report not found or you do not have permission' });
    }
    
    res.json({ success: true });
  });
});

// Updated serve login page
app.get('/login', (req, res) => {
  if (req.session.user) {
    res.redirect('/loggined_page.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.get('/signup', (req, res) => {
  if (req.session.user) {
    res.redirect('/loggined_page.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
  }
});

app.get('/report', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

app.get('/loggined_page.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'loggined_page.html'));
});

// Updated Admin page route
app.get('/admin', (req, res) => {
  // Check if user is logged in
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  // Admin functionality remains intact, but now we'll pass a parameter to distinguish regular users
  const isAdmin = req.session.user.email === 'admin@urbansolve.com'; // Replace with your admin email check
  
  // Set user_id as query parameter for filtering reports
  res.sendFile(path.join(__dirname, 'public', 'admin_page.html'));
});

// Serve homepage
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/loggined_page.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});