import multer from 'multer';
import aws from 'aws-sdk';
import multerS3 from 'multer-s3';
import path from 'path';

// Configure AWS S3
const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files (JPEG, PNG) and PDFs are allowed'));
};

export const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'private',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      const uniqueName = Date.now().toString() + '-' + file.originalname;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (increased from 5MB)
  fileFilter
});
