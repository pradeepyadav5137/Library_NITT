import mongoose from 'mongoose';
import Application from '../models/Application.js';
import Admin from '../models/Admin.js';
import { sendMail } from './emailService.js';

export const STATUS_FLOW = [
  'Application Submitted',
  'Physical Copy Received',
  'Verification Completed',
  'ID Card Printed – Ready for Collection (Library)'
];

export const updateApplicationStatusService = async (id, status, reason = null) => {
  if (!STATUS_FLOW.includes(status) && !['pending', 'approved', 'rejected'].includes(status)) {
    throw new Error('Invalid status');
  }

  const application = await Application.findOne(
    { $or: [{ _id: mongoose.Types.ObjectId.isValid(id) ? id : null }, { applicationId: id }] }
  );

  if (!application) {
    throw new Error('Application not found');
  }

  // Enforce valid transitions (no skipping)
  const oldStatusIndex = STATUS_FLOW.indexOf(application.status);
  const newStatusIndex = STATUS_FLOW.indexOf(status);

  if (oldStatusIndex !== -1 && newStatusIndex !== -1) {
    if (newStatusIndex !== oldStatusIndex + 1 && newStatusIndex !== oldStatusIndex) {
      throw new Error(`Cannot skip from ${application.status} to ${status}`);
    }
  }

  application.status = status;
  application.updatedAt = new Date();
  if (status === 'rejected' && reason) application.rejectionReason = reason;

  await application.save();

  // Determine next step
  const currentIndex = STATUS_FLOW.indexOf(status);
  let nextStep = null;
  if (currentIndex !== -1 && currentIndex < STATUS_FLOW.length - 1) {
    nextStep = STATUS_FLOW[currentIndex + 1];
  }

  // Send status update email
  const subject = `NITT ID Card Application Status Update: ${status}`;
  let textTemplate = `Your application (${application.applicationId}) status has been updated to: ${status}.\n\n`;
  let htmlTemplate = `<p>Your application (<strong>${application.applicationId}</strong>) status has been updated to: <strong>${status}</strong>.</p>`;

  if (nextStep) {
    textTemplate += `Next Step: ${nextStep}\n`;
    htmlTemplate += `<p>Next Step: <strong>${nextStep}</strong></p>`;
  }

  if (status === 'rejected') {
    textTemplate += `Reason: ${reason}\n`;
    htmlTemplate += `<p>Reason: ${reason}</p>`;
  }

  // Fire and forget
  sendMail(application.email, subject, textTemplate, htmlTemplate).catch(err => console.error('Status email error:', err));

  return application;
};

export const getApplicationStatsService = async () => {
  const [total, pending, approved, rejected, student, faculty] = await Promise.all([
    Application.countDocuments({ isDeleted: false }),
    Application.countDocuments({ status: { $in: ['pending', 'Application Submitted', 'Physical Copy Received', 'Verification Completed'] }, isDeleted: false }),
    Application.countDocuments({ status: { $in: ['approved', 'ID Card Printed – Ready for Collection (Library)'] }, isDeleted: false }),
    Application.countDocuments({ status: 'rejected', isDeleted: false }),
    Application.countDocuments({ userType: 'student', isDeleted: false }),
    Application.countDocuments({ userType: { $in: ['faculty', 'staff'] }, isDeleted: false }),
  ]);
  return { total, pending, approved, rejected, student, faculty };
};

export const getAllApplicationsService = async (query) => {
  const { status, userType, search } = query;

  let dbQuery = { isDeleted: false };
  if (status && status !== 'all') dbQuery.status = status;
  if (userType && userType !== 'all') dbQuery.userType = userType;
  if (search) {
    dbQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { rollNo: { $regex: search, $options: 'i' } },
      { applicationId: { $regex: search, $options: 'i' } },
    ];
  }

  return await Application.find(dbQuery).sort({ createdAt: -1 }).lean();
};
