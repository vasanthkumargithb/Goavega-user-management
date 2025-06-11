const express = require('express');
const { param, validationResult } = require('express-validator');
const pool = require('../config/database');

const router = express.Router();

// Get user details by DIN
router.get('/lookup/:din', [
  param('din').isLength({ min: 8, max: 8 }).isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid DIN format. DIN should be 8 digits.',
        errors: errors.array()
      });
    }

    const { din } = req.params;

    // Look up DIN in directory
    const result = await pool.query(
      'SELECT din_number, full_name, designation, nationality, age, gender FROM din_directory WHERE din_number = $1',
      [din]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'DIN not found in directory'
      });
    }

    const dinData = result.rows[0];

    res.json({
      success: true,
      message: 'DIN found successfully',
      data: {
        din_number: dinData.din_number,
        full_name: dinData.full_name,
        designation: dinData.designation,
        nationality: dinData.nationality,
        age: dinData.age,
        gender: dinData.gender
      }
    });

  } catch (error) {
    console.error('DIN lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;