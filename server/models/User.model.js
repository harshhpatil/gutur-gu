import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// defining the user schema
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerificationTokenExpiry: Date,
    passwordResetToken: String,
    passwordResetTokenExpiry: Date,
    displayName: {
      type: String,
      required: true,
      trim: true,
    },

    // 6-digit pairing code
    pairingCode: {
      type: String,
      default: null,
    },
    pairingCodeExpiry: {
      type: Date,
      default: null,
    },

    // Connected couple document
    coupleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Couple",
      default: null,
    },
  },
  { timestamps: true },
);

// creating the pre-hook for normalizing email and hashing password
userSchema.pre("save", async function () {
  if (this.isModified("email")) {
    this.email = this.email.toLowerCase().trim();
  }

  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 13);
});

// creating the method to compare the password
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// creating the model from the schema
const User = mongoose.model("User", userSchema);

export default User;
