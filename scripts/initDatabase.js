const pool = require('../config/database');

const createTables = async () => {
  try {
    console.log('🔨 Creating database tables...');

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        age INTEGER,
        gender VARCHAR(20),
        designation VARCHAR(255),
        nationality VARCHAR(100),
        mobile_no VARCHAR(20),
        din_number VARCHAR(50),
        is_board_member BOOLEAN DEFAULT false,
        is_key_member BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create DIN directory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS din_directory (
        id SERIAL PRIMARY KEY,
        din_number VARCHAR(50) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        designation VARCHAR(255),
        nationality VARCHAR(100),
        age INTEGER,
        gender VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create OTP table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_verification (
        id SERIAL PRIMARY KEY,
        mobile_no VARCHAR(20) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample DIN data
    await pool.query(`
      INSERT INTO din_directory (din_number, full_name, designation, nationality, age, gender)
      VALUES 
        ('12345678', 'John Smith', 'Chief Executive Officer', 'Indian', 45, 'Male'),
        ('87654321', 'Sarah Johnson', 'Chief Financial Officer', 'Indian', 38, 'Female'),
        ('11223344', 'Raj Patel', 'Managing Director', 'Indian', 52, 'Male'),
        ('44332211', 'Priya Sharma', 'Executive Director', 'Indian', 41, 'Female'),
        ('55667788', 'Michael Brown', 'Independent Director', 'Indian', 48, 'Male')
      ON CONFLICT (din_number) DO NOTHING
    `);

    console.log('✅ Database tables created successfully!');
    console.log('✅ Sample DIN data inserted!');
    console.log('📋 Sample DIN numbers you can use:');
    console.log('   12345678 - John Smith');
    console.log('   87654321 - Sarah Johnson');
    console.log('   11223344 - Raj Patel');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
};

createTables();