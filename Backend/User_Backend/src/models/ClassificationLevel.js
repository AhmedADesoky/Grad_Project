import mongoose from 'mongoose';

const Classification_Level_Schema = new mongoose.Schema({
  User_Id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  Text: {
    type: String,
    required: true
  },
  Level: {
    type: String,
    required: true,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    index: true
  },
  Confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  Description: {
    type: String,
    required: true
  },
  Text_Length: {
    type: Number,
    required: true
  },
  Word_Count: {
    type: Number,
    required: true
  },
  Probabilities: {
    type: Map,
    of: Number,
    required: false
  }
}, {
  timestamps: true
});

Classification_Level_Schema.index({ User_Id: 1, createdAt: -1 });

const Classification_Level = mongoose.model('Classification_Level', Classification_Level_Schema);

export default Classification_Level;
