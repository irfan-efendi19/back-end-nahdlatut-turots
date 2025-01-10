const multer = require("multer");

// Konfigurasi penyimpanan di memori
const storage = multer.memoryStorage();

// Validasi jenis file
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files (JPEG/PNG) are allowed!"), false);
  }
};

// Middleware untuk upload file
const upload = multer({ storage, fileFilter });

module.exports = upload;
