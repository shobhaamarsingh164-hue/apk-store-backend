const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const s3 = new AWS.S3({
  endpoint: process.env.STORJ_ENDPOINT,
  accessKeyId: process.env.STORJ_ACCESS_KEY,
  secretAccessKey: process.env.STORJ_SECRET_KEY,
  s3ForcePathStyle: true,
  signatureVersion: "v4"
});

app.get("/", (req, res) => {
  res.send("APK Store Backend is running!");
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const result = await s3.upload({
      Bucket: process.env.STORJ_BUCKET,
      Key: req.file.originalname,
      Body: req.file.buffer,
      ContentType: "application/vnd.android.package-archive"
    }).promise();

    res.json({ success: true, url: result.Location });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
