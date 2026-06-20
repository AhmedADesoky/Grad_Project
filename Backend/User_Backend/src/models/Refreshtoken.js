import mongoose from 'mongoose';

const RefreshTokenSchema = new mongoose.Schema(
  {
    User_Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    Jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    Token_Hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    Expires_At: {
      type: Date,
      required: true,
    },
    Revoked_At: {
      type: Date,
      default: null,
      index: true,
    },
    User_Agent: {
      type: String,
      default: null,
    },
    IP_Address: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

RefreshTokenSchema.index({ Expires_At: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Refresh_Token', RefreshTokenSchema);