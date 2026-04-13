const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const auth = require("../middleware/auth");
const Document = require("../models/Document");

// Helper function to validate a shareable link token
const validateShareableLink = async (token) => {
  if (!token) return null;
  return await Document.findOne({ shareableLink: token });
};

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ msg: "No file uploaded" });
    }

    const doc = await Document.create({
      title: req.body.title || file.originalname,
      description: req.body.description || "",
      fileType: file.mimetype,
      fileSize: file.size,
      filePath: file.path,
      fileName: file.filename,
      tags: req.body.tags
        ? req.body.tags.split(",").map((tag) => tag.trim())
        : [],
      uploadedBy: req.userId,
    });

    res.json(doc);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const docs = await Document.find({ uploadedBy: req.userId }).sort({
      createdAt: -1,
    });
    res.json(docs);
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

router.get("/search", auth, async (req, res) => {
  try {
    const { q } = req.query;
    const docs = await Document.find({
      uploadedBy: req.userId,
      $or: [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { tags: { $in: [new RegExp(q, "i")] } },
      ],
    });
    res.json(docs);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// View a document file (authenticated users only)
router.get("/:id/view", auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ msg: "Document not found" });
    }

    if (doc.uploadedBy.toString() !== req.userId) {
      return res.status(403).json({ msg: "Unauthorized" });
    }

    // Check if file exists
    if (!doc.filePath || !fs.existsSync(doc.filePath)) {
      return res.status(404).json({ msg: "File not found" });
    }

    // Set appropriate content type based on file type
    if (doc.fileType) {
      res.setHeader("Content-Type", doc.fileType);
    }

    // Set content disposition to inline to display in browser
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);

    // Allow cross-origin requests
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Serve the file
    res.sendFile(path.resolve(doc.filePath));
  } catch (error) {
    console.error("View error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ msg: "Document not found" });
    }

    if (doc.uploadedBy.toString() !== req.userId) {
      return res.status(403).json({ msg: "Unauthorized" });
    }

    // Delete the file from the filesystem
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    await doc.deleteOne();
    res.json({ msg: "Document deleted" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// Generate a shareable link for a document
router.post("/:id/share", auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ msg: "Document not found" });
    }

    if (doc.uploadedBy.toString() !== req.userId) {
      return res.status(403).json({ msg: "Unauthorized" });
    }

    // Generate a shareable link if one doesn't exist
    if (!doc.shareableLink) {
      await doc.generateShareableLink();
    }

    // Return the shareable link
    // Create a frontend URL for the shared document page
    const shareUrl = `${req.protocol}://${req
      .get("host")
      .replace(":5000", ":3000")}/shared/${doc.shareableLink}`;

    res.json({
      shareableLink: shareUrl,
      isShared: doc.isShared,
    });
  } catch (error) {
    console.error("Share error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// Revoke a shareable link
router.delete("/:id/share", auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ msg: "Document not found" });
    }

    if (doc.uploadedBy.toString() !== req.userId) {
      return res.status(403).json({ msg: "Unauthorized" });
    }

    // Revoke the shareable link
    await doc.revokeShareableLink();

    res.json({ msg: "Shareable link revoked" });
  } catch (error) {
    console.error("Revoke share error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// Access a document via shareable link (no auth required)
router.get("/shared/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const doc = await validateShareableLink(token);

    if (!doc) {
      return res.status(404).json({ msg: "Invalid or expired link" });
    }

    // Return document details without sensitive information
    const sharedDoc = {
      _id: doc._id,
      title: doc.title,
      description: doc.description,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      fileName: doc.fileName,
      tags: doc.tags,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };

    res.json(sharedDoc);
  } catch (error) {
    console.error("Shared access error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

// View a shared document file (no auth required)
router.get("/shared/:token/view", async (req, res) => {
  try {
    const token = req.params.token;
    const doc = await validateShareableLink(token);

    if (!doc) {
      return res.status(404).json({ msg: "Invalid or expired link" });
    }

    // Check if file exists
    if (!doc.filePath || !fs.existsSync(doc.filePath)) {
      return res.status(404).json({ msg: "File not found" });
    }

    // Set appropriate content type based on file type
    if (doc.fileType) {
      res.setHeader("Content-Type", doc.fileType);
    }

    // Set content disposition to inline to display in browser
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);

    // Allow cross-origin requests
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Serve the file
    res.sendFile(path.resolve(doc.filePath));
  } catch (error) {
    console.error("Shared view error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
});

module.exports = router;
