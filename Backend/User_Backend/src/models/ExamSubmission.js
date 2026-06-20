import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema(
  {
    Question_Id: { type: String, required: true },
    Answer_Text:  { type: String, default: '' },
    Points:       { type: Number, default: 0 },
  },
  { _id: false }
);

const ExamSubmissionSchema = new mongoose.Schema(
  {
    User_Id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    Attempt_Id: { type: String, default: null },
    Answers:    { type: [AnswerSchema], default: [] },
    Status:     { type: String, enum: ['pending', 'processing', 'done', 'failed', 'cancelled'], default: 'pending' },
    Job_Id:     { type: String, default: null },
    Error:      { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('ExamSubmission', ExamSubmissionSchema);
