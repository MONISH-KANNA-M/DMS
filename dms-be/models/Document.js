const mongoose = require("mongoose");
const crypto = require("crypto");

const docSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    fileType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shareableLink: {
      type: String,
      default: null,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Method to generate a secure shareable link
docSchema.methods.generateShareableLink = function () {
  // Generate a secure random token
  const token = crypto.randomBytes(32).toString("hex");
  this.shareableLink = token;
  this.isShared = true;
  return this.save();
};

// Method to revoke a shareable link
docSchema.methods.revokeShareableLink = function () {
  this.shareableLink = null;
  this.isShared = false;
  return this.save();
};

module.exports = mongoose.model("Document", docSchema);
