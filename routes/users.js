const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { generatePassword } = require('../utils/passwordGenerator');
const { sendEmail } = require('../utils/emailService');

const router = express.Router();

// Simple auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ Invalid token:', err.message);
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    req.user = user;
    next();
  });
};

// Create new user with DIN lookup
router.post('/create', [
  body('email').isEmail().normalizeEmail(),
  body('mobile_no').notEmpty(),
  body('full_name').notEmpty().trim(),
  body('din_number').optional(),
  body('age').optional().isInt({ min: 18, max: 100 }),
  body('gender').optional(),
  body('designation').optional().trim(),
  body('nationality').optional().trim(),
  body('is_board_member').optional().isBoolean(),
  body('is_key_member').optional().isBoolean()
], authenticateToken, async (req, res) => {
  try {
    console.log('👤 Create user request received:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      email,
      mobile_no,
      full_name,
      din_number,
      age,
      gender,
      designation,
      nationality,
      is_board_member = false,
      is_key_member = false
    } = req.body;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR mobile_no = $2',
      [email, mobile_no]
    );

    if (existingUser.rows.length > 0) {
      console.log('❌ User already exists:', email, mobile_no);
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or mobile number'
      });
    }

    // Generate 8-character password
    const generatedPassword = generatePassword();
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(generatedPassword, saltRounds);

    // Insert user
    const result = await pool.query(`
      INSERT INTO users (
        email, password, full_name, age, gender, designation, 
        nationality, mobile_no, din_number, is_board_member, is_key_member
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING id, email, full_name, mobile_no, din_number, is_board_member, is_key_member
    `, [
      email, hashedPassword, full_name, age, gender, designation,
      nationality, mobile_no, din_number, is_board_member, is_key_member
    ]);

    const user = result.rows[0];
    console.log('✅ User created successfully:', user.email);

    // If DIN number is provided, add/update it in the DIN directory
    if (din_number && din_number.trim() !== '') {
      try {
        console.log('🔄 Processing DIN for directory:', din_number);
        console.log('📋 DIN data to save:', { din_number, full_name, designation, nationality, age, gender });
        
        // Check if DIN already exists in directory
        const existingDIN = await pool.query(
          'SELECT id FROM din_directory WHERE din_number = $1',
          [din_number]
        );

        console.log('🔍 Existing DIN check result:', existingDIN.rows.length > 0 ? 'Found' : 'Not found');

        if (existingDIN.rows.length > 0) {
          // Update existing DIN record with latest information
          const updateResult = await pool.query(`
            UPDATE din_directory 
            SET full_name = $1, designation = $2, nationality = $3, age = $4, gender = $5
            WHERE din_number = $6
            RETURNING din_number, full_name
          `, [full_name, designation, nationality, age, gender, din_number]);
          
          console.log('✅ DIN directory updated for:', din_number, '-', updateResult.rows[0]?.full_name);
        } else {
          // Insert new DIN record into directory
          const insertResult = await pool.query(`
            INSERT INTO din_directory (din_number, full_name, designation, nationality, age, gender)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING din_number, full_name
          `, [din_number, full_name, designation, nationality, age, gender]);
          
          console.log('✅ New DIN added to directory:', din_number, '-', insertResult.rows[0]?.full_name);
        }
      } catch (dinError) {
        console.error('❌ Error updating DIN directory:', dinError);
        console.error('❌ DIN Error Details:', dinError.message);
        // Don't fail user creation if DIN update fails
      }
    } else {
      console.log('ℹ No DIN number provided, skipping DIN directory update');
    }

    // Send detailed email with all form information
    try {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to GOAVEGA</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(90deg, #ff6600 0%, #ff8533 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #ffffff; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
                .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
                .subtitle { font-size: 16px; opacity: 0.9; }
                .welcome-text { font-size: 18px; color: #333; margin-bottom: 20px; }
                .credentials-box { background: #f8f9fa; border: 2px solid #ff6600; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .credentials-title { color: #ff6600; font-size: 18px; font-weight: bold; margin-bottom: 15px; }
                .credential-item { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px; background: white; border-radius: 4px; }
                .credential-label { font-weight: 600; color: #555; }
                .credential-value { color: #333; font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 3px; }
                .details-section { margin: 25px 0; }
                .section-title { color: #ff6600; font-size: 16px; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #ff6600; padding-bottom: 5px; }
                .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
                .detail-item { background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #ff6600; }
                .detail-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
                .detail-value { font-size: 14px; color: #333; font-weight: 500; }
                .login-instructions { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .login-title { color: #856404; font-weight: bold; margin-bottom: 10px; }
                .login-methods { color: #856404; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }
                .status-badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                .status-yes { background: #d4edda; color: #155724; }
                .status-no { background: #f8d7da; color: #721c24; }
                @media (max-width: 600px) {
                    .detail-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">GOAVEGA</div>
                    <div class="subtitle">Software Pvt. Ltd</div>
                </div>
                
                <div class="content">
                    <div class="welcome-text">
                        Dear <strong>${full_name}</strong>,
                    </div>
                    
                    <p>Welcome to GOAVEGA! Your account has been successfully created in our User Management System. Below are your complete account details and login credentials.</p>
                    
                    <div class="credentials-box">
                        <div class="credentials-title">🔐 Login Credentials</div>
                        <div class="credential-item">
                            <span class="credential-label">Email Address:</span>
                            <span class="credential-value">${email}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Password:</span>
                            <span class="credential-value">${generatedPassword}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Mobile Number:</span>
                            <span class="credential-value">${mobile_no}</span>
                        </div>
                    </div>
                    
                    <div class="details-section">
                        <div class="section-title">👤 Personal Information</div>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Full Name</div>
                                <div class="detail-value">${full_name}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Age</div>
                                <div class="detail-value">${age || 'Not specified'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Gender</div>
                                <div class="detail-value">${gender || 'Not specified'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Nationality</div>
                                <div class="detail-value">${nationality || 'Not specified'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="details-section">
                        <div class="section-title">💼 Professional Information</div>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Designation</div>
                                <div class="detail-value">${designation || 'Not specified'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">DIN Number</div>
                                <div class="detail-value">${din_number || 'Not specified'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="details-section">
                        <div class="section-title">🏢 Membership Status</div>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Board of Directors</div>
                                <div class="detail-value">
                                    <span class="status-badge ${is_board_member ? 'status-yes' : 'status-no'}">
                                        ${is_board_member ? 'YES' : 'NO'}
                                    </span>
                                </div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Key Member Personnel</div>
                                <div class="detail-value">
                                    <span class="status-badge ${is_key_member ? 'status-yes' : 'status-no'}">
                                        ${is_key_member ? 'YES' : 'NO'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="login-instructions">
                        <div class="login-title">📱 How to Login</div>
                        <div class="login-methods">
                            You can access the system using either of these methods:<br>
                            <strong>1. Email & Password:</strong> Use your email and the password provided above<br>
                            <strong>2. Phone OTP:</strong> Use your mobile number to receive a one-time password
                        </div>
                    </div>
                    
                    <p><strong>⚠ Security Notice:</strong> Please change your password after your first login for enhanced security. Keep your login credentials confidential and do not share them with anyone.</p>
                    
                    <p>If you have any questions or need assistance, please contact our support team.</p>
                    
                    <div class="footer">
                        <p><strong>GOAVEGA Software Pvt. Ltd</strong><br>
                        User Management System<br>
                        <em>This is an automated email. Please do not reply to this message.</em></p>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `;

      await sendEmail({
        to: email,
        subject: '🎉 Welcome to GOAVEGA - Your Account Details & Login Credentials',
        html: emailHtml
      });

      console.log('✅ Welcome email sent successfully to:', email);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      // Continue with user creation even if email fails
    }

    // For demo purposes, return the password in response
    res.status(201).json({
      success: true,
      message: 'User created successfully! Complete account details sent to email.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          mobile_no: user.mobile_no,
          din_number: user.din_number,
          is_board_member: user.is_board_member,
          is_key_member: user.is_key_member
        },
        demo_password: generatedPassword // For demo purposes - remove in production
      }
    });

  } catch (error) {
    console.error('❌ User creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT id, email, full_name, age, gender, designation, nationality, 
             mobile_no, din_number, is_board_member, is_key_member, created_at
      FROM users WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user: result.rows[0] }
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all users (optional - for admin viewing)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, full_name, age, gender, designation, nationality, 
             mobile_no, din_number, is_board_member, is_key_member, created_at
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: { 
        users: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;