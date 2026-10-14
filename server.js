const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const cors = require("cors");
const path = require("path");

const app = express();

// ===================================
// STORJ CONFIGURATION
// ===================================

// नीचे की चारों वैल्यू Render के Environment
// Variables से अपने आप ली जाएँगी।

const STORJ_ENDPOINT =
  process.env.STORJ_ENDPOINT || "https://gateway.storjshare.io";

const STORJ_ACCESS_KEY =
  process.env.STORJ_ACCESS_KEY || "jvl3xupb6lzwu6qxkdw3i3byjyxa";

const STORJ_SECRET_KEY =
  process.env.STORJ_SECRET_KEY || "j35hlx4diu4dsb5bpouf72myzsgbtyfrw4c5deqj7suewumuga4bq";

const STORJ_BUCKET =
  process.env.STORJ_BUCKET || "ghostninja73";


// ===================================
// MIDDLEWARE
// ===================================

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));


// ===================================
// FILE UPLOAD CONFIGURATION
// ===================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});


// ===================================
// STORJ S3 CONNECTION
// ===================================

let s3 = null;

function configureStorj() {
  if (
    !STORJ_ENDPOINT ||
    !STORJ_ACCESS_KEY ||
    !STORJ_SECRET_KEY ||
    !STORJ_BUCKET
  ) {
    console.error(
      "[CONFIG ERROR] Storj configuration is incomplete."
    );

    console.error(
      "Please configure STORJ_ENDPOINT, STORJ_ACCESS_KEY, STORJ_SECRET_KEY and STORJ_BUCKET in Render."
    );

    return false;
  }

  s3 = new AWS.S3({
    endpoint: STORJ_ENDPOINT,
    accessKeyId: STORJ_ACCESS_KEY,
    secretAccessKey: STORJ_SECRET_KEY,
    s3ForcePathStyle: true,
    signatureVersion: "v4"
  });

  console.log(
    "[CONFIG] Storj environment variables are configured."
  );

  return true;
}

configureStorj();


// ===================================
// REQUEST LOGS
// ===================================

app.use((req, res, next) => {
  console.log(
    `[REQUEST] ${new Date().toISOString()} ${req.method} ${req.url}`
  );

  next();
});


// ===================================
// HOME PAGE
// ===================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


// ===================================
// HEALTH CHECK
// ===================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running"
  });
});


// ===================================
// STORJ CONFIGURATION CHECK
// ===================================

app.get("/storj-test", (req, res) => {
  const configured = Boolean(
    STORJ_ENDPOINT &&
    STORJ_ACCESS_KEY &&
    STORJ_SECRET_KEY &&
    STORJ_BUCKET
  );

  if (!configured) {
    return res.status(500).json({
      success: false,
      message: "Storj configuration is missing."
    });
  }

  res.json({
    success: true,
    message: "Storj configuration is present."
  });
});


// ===================================
// APK UPLOAD API
// ===================================

app.post(
  "/upload",
  upload.single("file"),
  async (req, res) => {
    try {
      console.log("[UPLOAD] Upload request received.");

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file received. Select a file first."
        });
      }

      if (!s3) {
        return res.status(500).json({
          success: false,
          error: "Storj is not configured. Check Render Environment Variables."
        });
      }

      const originalName = path.basename(
        req.file.originalname
      );

      if (!originalName.toLowerCase().endsWith(".apk")) {
        return res.status(400).json({
          success: false,
          error: "Only APK files are allowed."
        });
      }

      const fileKey =
        Date.now() + "-" + originalName;

      console.log(
        "[UPLOAD] Uploading file to Storj:",
        originalName
      );

      const result = await s3.upload({
        Bucket: STORJ_BUCKET,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType:
          "application/vnd.android.package-archive"
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
        error.message
      );

      return res.status(500).json({
        success: false,
        error: "Upload failed. Check Render logs and Storj settings."
      });
    }
  }
);


// ===================================
// NOT FOUND
// ===================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    route: req.method + " " + req.path
  });
});


// ===================================
// SERVER START
// ===================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});
