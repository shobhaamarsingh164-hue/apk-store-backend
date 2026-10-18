
const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const cors = require("cors");
const path = require("path");

const app = express();

// =====================================
// STORJ CONFIGURATION
// Set these in Render Environment Variables
// =====================================

const STORJ_ENDPOINT =
  process.env.STORJ_ENDPOINT || "https://gateway.storjshare.io";

const STORJ_ACCESS_KEY = jviig6q7s4fou4hadvy77ubvih7a;
const STORJ_SECRET_KEY = jzv3lqn3nreq4vondysfptk5fv4mjxwpwo2colbshfuuwcmgfu2ka;
const STORJ_BUCKET = ghostninja73;

// =====================================
// MIDDLEWARE
// =====================================

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.static(__dirname));

// Log requests before routes
app.use((req, res, next) => {
  console.log(
    `[REQUEST] ${new Date().toISOString()} ${req.method} ${req.url}`
  );
  next();
});

// =====================================
// MULTER CONFIGURATION
// =====================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
    files: 1
  }
});

// =====================================
// STORJ S3 CLIENT
// =====================================

let s3 = null;

if (STORJ_ACCESS_KEY && STORJ_SECRET_KEY && STORJ_BUCKET) {
  s3 = new AWS.S3({
    endpoint: STORJ_ENDPOINT,
    accessKeyId: STORJ_ACCESS_KEY,
    secretAccessKey: STORJ_SECRET_KEY,
    s3ForcePathStyle: true,
    signatureVersion: "v4"
  });

  console.log("[CONFIG] Storj client initialized.");
} else {
  console.error(
    "[CONFIG ERROR] Missing Storj environment variables."
  );
}

// =====================================
// HEALTH CHECK
// =====================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running"
  });
});

// =====================================
// STORJ CONFIGURATION CHECK
// =====================================

app.get("/storj-test", (req, res) => {
  if (!s3) {
    return res.status(500).json({
      success: false,
      message: "Storj environment variables are missing."
    });
  }

  res.json({
    success: true,
    message: "Storj configuration is present."
  });
});

// =====================================
// HOME PAGE
// =====================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================
// APK UPLOAD
// =====================================

app.post("/upload", (req, res) => {
  console.log("[UPLOAD] Request received.");

  upload.single("file")(req, res, async (err) => {
    if (err) {
      console.error("[UPLOAD PARSE ERROR]", err.message);

      return res.status(
        err.code === "LIMIT_FILE_SIZE" ? 413 : 400
      ).json({
        success: false,
        error: err.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the 500 MB limit."
          : err.message
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file received."
        });
      }

      if (!s3) {
        return res.status(500).json({
          success: false,
          error: "Storj is not configured. Check Render environment variables."
        });
      }

      const originalName = path.basename(req.file.originalname);

      if (!originalName.toLowerCase().endsWith(".apk")) {
        return res.status(400).json({
          success: false,
          error: "Only APK files are allowed."
        });
      }

      const fileKey = `${Date.now()}-${originalName}`;

      console.log(
        "[UPLOAD] Uploading to Storj:",
        originalName,
        `(${req.file.size} bytes)`
      );

      const result = await s3.upload({
        Bucket: STORJ_BUCKET,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: "application/vnd.android.package-archive"
      }).promise();

      console.log("[UPLOAD] Storj upload successful.");

      return res.status(200).json({
        success: true,
        message: "APK uploaded successfully.",
        name: originalName,
        key: fileKey,
        url: result.Location
      });

    } catch (error) {
      console.error(
        "[UPLOAD ERROR]",
        error.code || "UNKNOWN",
        error.message
      );

      return res.status(500).json({
        success: false,
        error: "Storj upload failed. Check Render logs and bucket permissions."
      });
    }
  });
});

// =====================================
// NOT FOUND
// =====================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    route: `${req.method} ${req.path}`
  });
});

// =====================================
// SERVER ERROR HANDLER
// =====================================

app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
