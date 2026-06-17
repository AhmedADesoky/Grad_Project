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

const UserSchema = new mongoose.Schema(
  {
    User_Name: { type: String, required: true, unique: true, trim: true },
    Email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    Password: { type: String, required: true },

    Profile_Image: { type: String, default: null },
    Level: { type: String, default: 'A1' },
    Progress: { type: ProgressSchema, default: () => ({ completed: 0, total: 10 }) },
    Exam_Scores: { type: [ExamScoreSchema], default: [] },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('Password')) return next();
  this.Password = await bcrypt.hash(this.Password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.Password);
};

export default mongoose.model('User', UserSchema);