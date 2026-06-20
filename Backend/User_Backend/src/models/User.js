import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ProgressSchema = new mongoose.Schema(
  {
    completed: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 10, min: 1 },
  },
  { _id: false }
);

const ExamScoreSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    score: { type: Number, required: true, min: 0, max: 100 },
    level: { type: String, required: true, default: 'A1' },
  },
  { _id: false }
);

const UsageLimits = {
  free:     { plans: 4,  pdfs: 8,  chat: 20,  adjustments: 10, mode_changes: 2  },
  pro:      { plans: 10, pdfs: 15, chat: 80,  adjustments: 40, mode_changes: 4  },
  ultimate: { plans: 20, pdfs: 30, chat: 200, adjustments: 100, mode_changes: 8 },
};

const UserSchema = new mongoose.Schema(
  {
    User_Name: { type: String, required: true, unique: true, trim: true },
    Email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    Password: { type: String, required: false, default: null },

    Google_Id:     { type: String, default: null, sparse: true },
    Auth_Provider: { type: String, enum: ['local', 'google'], default: 'local' },

    Profile_Image: { type: String, default: null },
    Level: { type: String, default: 'A1' },
    Preferred_Plan_Mode: { type: String, enum: ['weekly', 'monthly'], default: 'weekly' },
    Progress: { type: ProgressSchema, default: () => ({ completed: 0, total: 10 }) },
    Exam_Scores: { type: [ExamScoreSchema], default: [] },

    Is_Verified:  { type: Boolean, default: false },
    OTP:          { type: String, default: null },
    OTP_Expiry:   { type: Date,   default: null },
    OTP_Attempts: { type: Number, default: 0 },
    OTP_Locked_Until: { type: Date, default: null },

    // Subscription
    Subscription_Tier:       { type: String, enum: ['free', 'pro', 'ultimate'], default: 'free' },
    Subscription_Expires_At: { type: Date, default: null },
    Stripe_Customer_Id:      { type: String, default: null },
    Stripe_Subscription_Id:  { type: String, default: null },

    // Daily exam counters
    Exam_Attempts_Today:  { type: Number, default: 0 },
    Last_Exam_Date:       { type: Date,   default: null },

    // Password reset
    Password_Reset_Token:   { type: String, default: null },
    Password_Reset_Expires: { type: Date,   default: null },

    // Monthly usage counters
    Usage_Reset_At:       { type: Date, default: null },
    Plans_Used:           { type: Number, default: 0 },
    PDFs_Used:            { type: Number, default: 0 },
    Chat_Messages_Used:   { type: Number, default: 0 },
    Adjustments_Used:     { type: Number, default: 0 },
    Mode_Changes_Used:    { type: Number, default: 0 },
  },
  { timestamps: true }
);

UserSchema.statics.LIMITS = UsageLimits;

UserSchema.pre('save', async function (next) {
  if (!this.isModified('Password') || !this.Password) return next();
  this.Password = await bcrypt.hash(this.Password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.Password) return false;
  return bcrypt.compare(candidatePassword, this.Password);
};

export default mongoose.model('User', UserSchema);