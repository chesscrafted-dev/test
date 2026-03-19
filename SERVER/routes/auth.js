const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');

router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    console.log(`OTP Request for: ${email}`);

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expiry = new Date(Date.now() + 10 * 60000); // 10 mins

    let user = await User.findOne({ email });
    if (!user) {
      console.log('Creating new user...');
      const user_id = crypto.randomBytes(8).toString('hex');
      user = new User({ email, user_id });
    }
    
    user.otp = otp;
    user.otp_expiry = otp_expiry;
    await user.save();
    console.log('OTP saved to DB');

    try {
      const scriptUrl = process.env.G_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbykBSYPbWa200OaeXmcbC-UztHwlk7RZKEJkCAaQ87yPnxKwZnsWdGENJdaAxYKqMxt/exec';
      
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'text/plain;charset=utf-8', 
        },
        body: JSON.stringify({ to: email, otp: otp }),
        redirect: 'follow' // Crucial for Google Apps Script
      });

      if (!response.ok) {
          throw new Error(`Google Script Error: ${response.statusText}`);
      }

      console.log('OTP sent successfully via Google Apps Script');
      res.json({ message: 'OTP sent' });
    } catch (err) {
      console.error('Email Proxy Error:', err.message);
      res.status(500).json({ error: 'Email sending failed', details: err.message });
    }
  } catch (err) {
    console.error('Request OTP Route Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log(`OTP Verification for: ${email}`);

    const user = await User.findOne({ email, otp, otp_expiry: { $gt: new Date() } });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    user.otp = undefined;
    user.otp_expiry = undefined;
    await user.save();

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user_id: user.user_id, 
      isProfileComplete: user.isProfileComplete || false 
    });
  } catch (err) {
    console.error('Verify OTP Route Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
