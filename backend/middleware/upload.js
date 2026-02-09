import multer from 'multer';

// Use memory storage (required for AWS SDK v3 upload)
const storage = multer.memoryStorage();

// File filter (strict validation)
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png'];
  const allowedPdf = ['application/pdf'];

  // Passport photo → only JPG/PNG
  if (file.fieldname === 'photo') {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(new Error('Photo must be JPG or PNG'), false);
    }
  }

  // FIR, Payment, Application PDF → JPG/PNG/PDF
  if (
    file.fieldname === 'fir' ||
    file.fieldname === 'payment' ||
    file.fieldname === 'applicationPdf'
  ) {
    if (
      !allowedImageTypes.includes(file.mimetype) &&
      !allowedPdf.includes(file.mimetype)
    ) {
      return cb(new Error('Only JPG, PNG or PDF allowed'), false);
    }
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:
      Number(process.env.MAX_FILE_SIZE_MB || 5) * 1024 * 1024
  }
});
