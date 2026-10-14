const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const cors = require("cors");
const path = require("path");

const app = express();

// Basic configuration
app.use(cors());
app.use(express.json());

// Log every incoming request
app.use((req, res, next) => {
  console.log(
    `[REQUEST] ${new Date().toISOString()} ${req.method} ${req.url}`
  );

  next();
});

// Serve website files from the same folder
app.use(express.static(__dirname));

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "DroidNova server is running"
  });
});

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Check required Storj environment variables
const requiredVariables = [
  "STORJ_ENDPOINT",
  "STORJ_ACCESS_KEY",
  "STORJ_SECRET_KEY",
  "STORJ_BUCKET"
];

const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]
);

if (missingVariables.length > 0) {
  console.error(
    "[CONFIG ERROR] Missing environment variables:",
    missingVariables.join(", ")
  );
} else {
  console.log("[CONFIG] Storj environment variables are configured");
}

// Configure APK upload
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const isApk = path.extname(file.originalname).toLowerCase() === ".apk";

    if (!isApk) {
      return callback(new Error("Only APK files are allowed"));
    }

    callback(null, true);
  }
});

// Configure Storj S3 client
const s3 = new AWS.S3({
  endpoint: process.env.STORJ_ENDPOINT,
  accessKeyId: process.env.STORJ_ACCESS_KEY,
  secretAccessKey: process.env.STORJ_SECRET_KEY,
  s3ForcePathStyle: true,
  signatureVersion: "v4",
  region: "us-east-1"
});

// APK upload endpoint
app.post("/upload", (req, res) => {
  console.log("[UPLOAD] Upload request received");

  upload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      console.error("[UPLOAD] File processing error:", uploadError.message);

      return res.status(400).json({
        success: false,
        error: uploadError.message
      });
    }

    try {
      if (!req.file) {
        console.error("[UPLOAD] No file received");

        return res.status(400).json({
          success: false,
          error: "No APK file was received"
        });
      }

      if (missingVariables.length > 0) {
        console.error("[UPLOAD] Storj configuration is incomplete");

        return res.status(500).json({
          success: false,
          error: "Server storage configuration is incomplete"
        });
      }

      console.log("[UPLOAD] File received:", req.file.originalname);
      console.log(
        "[UPLOAD] File size:",
        (req.file.size / (1024 * 1024)).toFixed(2),
        "MB"
      );

      const safeFileName = path.basename(req.file.originalname);

      const result = await s3.upload({
        Bucket: process.env.STORJ_BUCKET,
        Key: `${Date.now()}-${safeFileName}`,
        Body: req.file.buffer,
        ContentType: "application/vnd.android.package-archive"
      }).promise();

      console.log("[UPLOAD] Storj upload successful");

      return res.status(200).json({
        success: true,
        message: "APK uploaded successfully",
        url: result.Location,
        fileName: safeFileName
      });

    } catch (error) {
      console.error("[STORJ ERROR]", error.message);

      return res.status(500).json({
        success: false,
        error: "APK upload to storage failed"
      });
    }
  });
});

// Handle unknown routes
app.use((req, res) => {
  console.log("[404] Route not found:", req.method, req.url);

  res.status(404).json({
    success: false,
    error: "Route not found"
  });
});

// Handle unexpected errors
app.use((error, req, res, next) => {
  console.error("[SERVER ERROR]", error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[SERVER] DroidNova running on port ${PORT}`);
});
