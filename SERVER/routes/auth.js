const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your E2EE Chat OTP',
        text: `Your OTP is: ${otp}`
      });
      console.log('Email sent successfully');
      res.json({ message: 'OTP sent' });
    } catch (err) {
      console.error('Nodemailer Error:', err.message);
      // Even if email fails, we don't want to crash the whole process
      // But we tell the user it failed
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
