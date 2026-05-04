import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { createAndSendOtp, verifyOtp, OTP_EXPIRY_MINUTES } from './otpService.js';

export const issueJwtCookie = (res, payload, expiresInStr, maxAgeMs) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: expiresInStr });
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: maxAgeMs
  });
  return token;
};

export const verifyAdminCredentials = async (username, password) => {
  const admin = await Admin.findOne({ username });
  if (!admin) {
    throw new Error('Invalid credentials');
  }

  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  return admin;
};

export const sendAdminLoginOtp = async (admin) => {
  const subject = 'NITT Admin – Login OTP';
  const textTemplate = `Your OTP for admin login is: {{OTP}}. It is valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this with anyone.`;
  const htmlTemplate = `<p>Your OTP for admin login is: <strong>{{OTP}}</strong>.</p><p>Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share with anyone.</p>`;

  await createAndSendOtp(admin.email, subject, textTemplate, htmlTemplate);
};

export const verifyAdminLoginOtpAndIssueToken = async (res, username, rawOtp) => {
  const admin = await Admin.findOne({ username });
  if (!admin) {
    throw new Error('Invalid credentials');
  }

  await verifyOtp(admin.email, rawOtp);

  const payload = { id: admin._id, username: admin.username, role: admin.role };
  const token = issueJwtCookie(res, payload, '24h', 24 * 60 * 60 * 1000);

  return { token, admin: { id: admin._id, username: admin.username, role: admin.role } };
};

export const logoutUser = (res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
};
