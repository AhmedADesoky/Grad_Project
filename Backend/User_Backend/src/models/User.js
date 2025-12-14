import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const UserSchema = new mongoose.Schema({
  User_Name: { type: String, required: true, unique: true },
  Email: { type: String, required: true, unique: true },
  Password: { type: String, required: true },
}, { timestamps: true });


UserSchema.pre('save', async function (next) {
  if (!this.isModified('Password')) {
    return next();
  }
  this.Password = await bcrypt.hash(this.Password, 10);
  next();
});


UserSchema.methods.comparePassword = async function (CandidatePassword) {
  return await bcrypt.compare(CandidatePassword, this.Password);
};

export default mongoose.model('User', UserSchema);