import Admin from '../models/Admin.js';
import {
  verifyAdminCredentials,
  sendAdminLoginOtp,
  verifyAdminLoginOtpAndIssueToken,
  logoutUser,
  issueJwtCookie
} from '../services/authService.js';
import { createAndSendOtp, verifyOtp, OTP_EXPIRY_MINUTES } from '../services/otpService.js';

export const sendOtp = async (req, res) => {
  try {
    const { rollNo, email, userType } = req.body;

    let targetEmail = null;
    let rollNoLock = null;

    if (userType === 'student') {
      if (!rollNo || typeof rollNo !== 'string') {
        return res.status(400).json({ message: 'Roll number is required' });
      }
      const cleanRoll = rollNo.trim().toLowerCase();
      if (!cleanRoll) {
        return res.status(400).json({ message: 'Valid roll number is required' });
      }
      if (cleanRoll.length < 9) {
        return res.status(400).json({ message: 'Roll number must be at least 9 digits' });
      }
      targetEmail = `${cleanRoll}@nitt.edu`;
      rollNoLock = cleanRoll;
    } else if (userType === 'faculty' || userType === 'staff') {
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Institute webmail is required' });
      }
      const e = email.trim().toLowerCase();
      if (!e.endsWith('@nitt.edu')) {
        return res.status(400).json({ message: 'Only @nitt.edu webmail is allowed' });
      }
      targetEmail = e;
    } else {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    const subject = 'NITT ID Card Re-issue – OTP Verification';
    const textTemplate = `Your OTP is: {{OTP}}. It is valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this with anyone.`;
    const htmlTemplate = `<p>Your OTP is: <strong>{{OTP}}</strong>.</p><p>Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share with anyone.</p>`;

    await createAndSendOtp(targetEmail, subject, textTemplate, htmlTemplate);

    res.json({
      success: true,
      message: 'OTP sent to your institute webmail',
      email: targetEmail,
      ...(rollNoLock != null ? { rollNo: rollNoLock } : {})
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(error.message.includes('wait') || error.message.includes('Maximum') ? 429 : 500)
       .json({ message: error.message || 'Failed to send OTP. Please try again.' });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp, userType } = req.body;

    if (!email || !otp || !userType) {
      return res.status(400).json({ message: 'Email, OTP and user type are required' });
    }

    const e = email.trim().toLowerCase();

    await verifyOtp(e, String(otp).trim());

    const payload = {
      email: e,
      userType,
      verified: true,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 2 // 2 hours
    };
    if (userType === 'student') {
      const rollNo = e.replace(/@nitt\.edu$/, '');
      payload.rollNo = rollNo;
    }

    const token = issueJwtCookie(res, payload, '2h', 2 * 60 * 60 * 1000);

    res.json({
      success: true,
      token,
      email: e,
      userType,
      ...(payload.rollNo ? { rollNo: payload.rollNo } : {})
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(400).json({ message: error.message || 'Verification failed' });
  }
};

export const adminLoginStep1 = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    const admin = await verifyAdminCredentials(username, password);
    await sendAdminLoginOtp(admin);

    res.json({ success: true, require2fa: true, message: 'OTP sent to admin email' });
  } catch (error) {
    res.status(401).json({ message: 'Invalid credentials' });
  }
};

export const adminLoginStep2 = async (req, res) => {
  try {
    const { username, otp } = req.body;
    if (!username || !otp) {
      return res.status(400).json({ message: 'Username and OTP required' });
    }

    const result = await verifyAdminLoginOtpAndIssueToken(res, username, otp);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(401).json({ message: error.message || 'Invalid credentials' });
  }
};

export const adminForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }
    const e = email.trim().toLowerCase();
    const admin = await Admin.findOne({ email: e });
    if (!admin) {
      return res.status(404).json({ message: 'No admin account found with this email' });
    }

    const subject = 'NITT Admin – Password Reset OTP';
    const textTemplate = `Your OTP is: {{OTP}}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`;
    const htmlTemplate = `<p>Your OTP is: <strong>{{OTP}}</strong>. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.</p>`;

    await createAndSendOtp(e, subject, textTemplate, htmlTemplate);

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(error.message.includes('wait') || error.message.includes('Maximum') ? 429 : 500)
       .json({ message: error.message || 'Failed to send OTP' });
  }
};

export const adminResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }
    const e = email.trim().toLowerCase();

    await verifyOtp(e, String(otp).trim());

    const admin = await Admin.findOne({ email: e });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(400).json({ message: error.message || 'Failed to update password' });
  }
};

export const logout = (req, res) => {
  logoutUser(res);
  res.json({ success: true, message: 'Logged out successfully' });
};
