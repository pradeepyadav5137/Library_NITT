import mongoose from 'mongoose';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Application from '../models/Application.js';
import Admin from '../models/Admin.js';

// ===== S3 CLIENT (SDK v3) =====
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


// Generate a presigned URL valid for 1 hour (admin-only access)
async function generateSignedUrl(s3Key) {
  if (!s3Key) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,   
    });

    return await getSignedUrl(s3, command, { expiresIn: 3600 });

  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
}


// Delete a file from S3 by key
async function deleteFromS3(s3Key) {
  if (!s3Key) return;

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,   // ✅ direct key
      })
    );

    console.log('Deleted from S3:', s3Key);

  } catch (error) {
    console.warn('Failed to delete from S3:', error.message);
  }
}


// Attach signed URLs to an application object
async function attachSignedUrls(app) {
  if (app.photoPath)        app.photoUrl      = await generateSignedUrl(app.photoPath);
  if (app.firPath)          app.firUrl        = await generateSignedUrl(app.firPath);
  if (app.paymentPath)      app.paymentUrl    = await generateSignedUrl(app.paymentPath);
  if (app.applicationPdfUrl) app.pdfUrl       = await generateSignedUrl(app.applicationPdfUrl);
  return app;
}

// ===== GET ALL APPLICATIONS =====
export const getAllApplications = async (req, res) => {
  try {
    const { status, userType, search } = req.query;

    let query = { isDeleted: false };
    if (status && status !== 'all')   query.status   = status;
    if (userType && userType !== 'all') query.userType = userType;
    if (search) {
      query.$or = [
        { name:          { $regex: search, $options: 'i' } },
        { email:         { $regex: search, $options: 'i' } },
        { rollNo:        { $regex: search, $options: 'i' } },
        { applicationId: { $regex: search, $options: 'i' } },
      ];
    }

    const applications = await Application.find(query).sort({ createdAt: -1 }).lean();

    // Generate presigned URLs in parallel
    const applicationsWithUrls = await Promise.all(applications.map(attachSignedUrls));

    res.json({
      success: true,
      applications: applicationsWithUrls,
      count: applicationsWithUrls.length,
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ message: 'Failed to fetch applications' });
  }
};

// ===== GET DASHBOARD STATS =====
export const getDashboardStats = async (req, res) => {
  try {
    const [total, pending, approved, rejected, student, faculty] = await Promise.all([
      Application.countDocuments({ isDeleted: false }),
      Application.countDocuments({ status: 'pending',  isDeleted: false }),
      Application.countDocuments({ status: 'approved', isDeleted: false }),
      Application.countDocuments({ status: 'rejected', isDeleted: false }),
      Application.countDocuments({ userType: 'student', isDeleted: false }),
      Application.countDocuments({ userType: { $in: ['faculty', 'staff'] }, isDeleted: false }),
    ]);

    res.json({ success: true, stats: { total, pending, approved, rejected, student, faculty } });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

// ===== GET SINGLE APPLICATION =====
export const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await Application.findById(id).lean();

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const appData = await attachSignedUrls(application);
    res.json({ success: true, application: appData });
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ message: 'Failed to fetch application' });
  }
};

// ===== UPDATE APPLICATION STATUS =====
export const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updateData = { status, updatedAt: new Date() };
    if (status === 'rejected' && reason) updateData.rejectionReason = reason;

    const application = await Application.findOneAndUpdate(
      { $or: [{ _id: mongoose.Types.ObjectId.isValid(id) ? id : null }, { applicationId: id }] },
      updateData,
      { new: true }
    );

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json({ success: true, message: `Application ${status} successfully`, application });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Failed to update status' });
  }
};

// ===== SOFT DELETE APPLICATION =====
export const softDeleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await Application.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json({ success: true, message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Soft delete error:', error);
    res.status(500).json({ message: 'Failed to delete application' });
  }
};

// ===== HARD DELETE APPLICATION (removes files from S3 too) =====
export const hardDeleteApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { applicationId: id }] }
      : { applicationId: id };

    const application = await Application.findOne(query);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Delete all associated files from S3 in parallel
    await Promise.all([
      deleteFromS3(application.photoPath),
      deleteFromS3(application.firPath),
      deleteFromS3(application.paymentPath),
      deleteFromS3(application.applicationPdfUrl),
    ]);

    await Application.findByIdAndDelete(application._id);

    res.json({ success: true, message: 'Application and all associated files permanently deleted' });
  } catch (error) {
    console.error('Hard delete error:', error);
    res.status(500).json({ message: 'Failed to permanently delete application' });
  }
};

// ===== CREATE NEW ADMIN =====
export const createAdmin = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const existingAdmin = await Admin.findOne({ $or: [{ username }, { email }] });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this username or email already exists' });
    }

    const admin = new Admin({ username, email, password, role: role || 'admin' });
    await admin.save();

    res.json({
      success: true,
      message: 'Admin created successfully',
      admin: { id: admin._id, username: admin.username, email: admin.email, role: admin.role },
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ message: 'Failed to create admin' });
  }
};

// ===== GET ALL ADMINS =====
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json({ success: true, admins, count: admins.length });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ message: 'Failed to fetch admins' });
  }
};

// ===== DELETE ADMIN =====
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.admin.id === id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const admin = await Admin.findByIdAndDelete(id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ message: 'Failed to delete admin' });
  }
};

// ===== GET FRESH PRESIGNED URL FOR A FILE =====
export const getFileSignedUrl = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ message: 'File key is required' });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: decodeURIComponent(key),
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
    res.json({ success: true, url });
  } catch (error) {
    console.error('Get signed URL error:', error);
    res.status(500).json({ message: 'Failed to generate file URL' });
  }
};