const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { generateOTP } = require('../utils/otpService');

const router = express.Router();

// Sign up endpoint
router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('full_name').notEmpty().trim()
], async (req, res) => {
  try {
    console.log('📝 Signup request received:', { email: req.body.email, full_name: req.body.full_name });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, full_name } = req.body;

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email, password, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name',
      [email, hashedPassword, full_name]
    );

    const user = result.rows[0];
    console.log('✅ User created successfully:', user.email);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Login with email and password
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    console.log('🔑 Login request received:', { email: req.body.email });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful:', email);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          is_board_member: user.is_board_member,
          is_key_member: user.is_key_member
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Send OTP for phone login
router.post('/send-otp', [
  body('mobile_no').notEmpty()
], async (req, res) => {
  try {
    console.log('📱 OTP request received:', { mobile_no: req.body.mobile_no });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number',
        errors: errors.array()
      });
    }

    const { mobile_no } = req.body;

    // Check if user exists with this mobile number
    const userResult = await pool.query('SELECT id FROM users WHERE mobile_no = $1', [mobile_no]);
    if (userResult.rows.length === 0) {
      console.log('❌ User not found with mobile:', mobile_no);
      return res.status(404).json({
        success: false,
        message: 'No user found with this mobile number'
      });
    }

    // Generate and store OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await pool.query(
      'INSERT INTO otp_verification (mobile_no, otp, expires_at) VALUES ($1, $2, $3)',
      [mobile_no, otp, expiresAt]
    );

    console.log(`OTP generated for ${mobile_no}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        mobile_no,
        expires_in_minutes: 5,
        demo_otp: otp // For demo purposes only
      }
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify OTP and login
router.post('/verify-otp', [
  body('mobile_no').notEmpty(),
  body('otp').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    console.log('🔍 OTP verification request:', { mobile_no: req.body.mobile_no, otp: req.body.otp });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { mobile_no, otp } = req.body;

    // Verify OTP
    const otpResult = await pool.query(
      'SELECT * FROM otp_verification WHERE mobile_no = $1 AND otp = $2 AND expires_at > NOW() AND is_used = false ORDER BY created_at DESC LIMIT 1',
      [mobile_no, otp]
    );

    if (otpResult.rows.length === 0) {
      console.log('❌ Invalid or expired OTP for:', mobile_no);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Mark OTP as used
    await pool.query(
      'UPDATE otp_verification SET is_used = true WHERE id = $1',
      [otpResult.rows[0].id]
    );

    // Get user details
    const userResult = await pool.query('SELECT * FROM users WHERE mobile_no = $1', [mobile_no]);
    const user = userResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ OTP verification successful:', mobile_no);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          mobile_no: user.mobile_no,
          is_board_member: user.is_board_member,
          is_key_member: user.is_key_member
        },
        token
      }
    });

  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;