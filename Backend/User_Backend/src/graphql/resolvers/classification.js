import Classification_Level from '../../models/ClassificationLevel.js';

export default {
  Query: {
    Get_User_Classifications: async (_, { User_Id, Limit = 10, Offset = 0 }) => {
      try {
        const Classifications = await Classification_Level
          .find({ User_Id })
          .sort({ createdAt: -1 })
          .skip(Offset)
          .limit(Limit);
        
        return Classifications.map(c => ({
          Id: c._id,
          User_Id: c.User_Id,
          Text: c.Text,
          Level: c.Level,
          Confidence: c.Confidence,
          Description: c.Description,
          Text_Length: c.Text_Length,
          Word_Count: c.Word_Count,
          Probabilities: c.Probabilities ? Object.fromEntries(c.Probabilities) : null,
          Created_At: c.createdAt,
          Updated_At: c.updatedAt
        }));
      } catch (error) {
        console.error('Error fetching user classifications:', error);
        throw new Error('Failed to fetch classifications');
      }
    },

    Get_Classification_By_Level: async (_, { User_Id, Level }) => {
      try {
        const Classifications = await Classification_Level
          .find({ User_Id, Level })
          .sort({ createdAt: -1 });
        
        return Classifications.map(c => ({
          Id: c._id,
          User_Id: c.User_Id,
          Text: c.Text,
          Level: c.Level,
          Confidence: c.Confidence,
          Description: c.Description,
          Text_Length: c.Text_Length,
          Word_Count: c.Word_Count,
          Probabilities: c.Probabilities ? Object.fromEntries(c.Probabilities) : null,
          Created_At: c.createdAt,
          Updated_At: c.updatedAt
        }));
      } catch (error) {
        console.error('Error fetching classifications by level:', error);
        throw new Error('Failed to fetch classifications');
      }
    },

    Get_Recent_Classifications: async (_, { User_Id, Days = 7 }) => {
      try {
        const Since_Date = new Date();
        Since_Date.setDate(Since_Date.getDate() - Days);
        
        const Classifications = await Classification_Level
          .find({ 
            User_Id,
            createdAt: { $gte: Since_Date }
          })
          .sort({ createdAt: -1 });
        
        return Classifications.map(c => ({
          Id: c._id,
          User_Id: c.User_Id,
          Text: c.Text,
          Level: c.Level,
          Confidence: c.Confidence,
          Description: c.Description,
          Text_Length: c.Text_Length,
          Word_Count: c.Word_Count,
          Probabilities: c.Probabilities ? Object.fromEntries(c.Probabilities) : null,
          Created_At: c.createdAt,
          Updated_At: c.updatedAt
        }));
      } catch (error) {
        console.error('Error fetching recent classifications:', error);
        throw new Error('Failed to fetch classifications');
      }
    }
  },

  Mutation: {
    Save_Classification: async (_, args) => {
      try {
        const New_Classification = new Classification_Level({
          User_Id: args.User_Id,
          Text: args.Text,
          Level: args.Level,
          Confidence: args.Confidence,
          Description: args.Description,
          Text_Length: args.Text_Length,
          Word_Count: args.Word_Count,
          Probabilities: args.Probabilities ? new Map(Object.entries(args.Probabilities)) : null
        });
        
        await New_Classification.save();
        
        return {
          Id: New_Classification._id,
          User_Id: New_Classification.User_Id,
          Text: New_Classification.Text,
          Level: New_Classification.Level,
          Confidence: New_Classification.Confidence,
          Description: New_Classification.Description,
          Text_Length: New_Classification.Text_Length,
          Word_Count: New_Classification.Word_Count,
          Probabilities: New_Classification.Probabilities ? Object.fromEntries(New_Classification.Probabilities) : null,
          Created_At: New_Classification.createdAt,
          Updated_At: New_Classification.updatedAt
        };
      } catch (error) {
        console.error('Error saving classification:', error);
        throw new Error('Failed to save classification');
      }
    }
  },

  User: {
    Classifications: async (parent) => {
      try {
        const userId = parent._id ? parent._id.toString() : parent.Id;
        const Classifications = await Classification_Level
          .find({ User_Id: userId })
          .sort({ createdAt: -1 })
          .limit(10);
        
        return Classifications.map(c => ({
          Id: c._id,
          User_Id: c.User_Id,
          Text: c.Text,
          Level: c.Level,
          Confidence: c.Confidence,
          Description: c.Description,
          Text_Length: c.Text_Length,
          Word_Count: c.Word_Count,
          Probabilities: c.Probabilities ? Object.fromEntries(c.Probabilities) : null,
          Created_At: c.createdAt,
          Updated_At: c.updatedAt
        }));
      } catch (error) {
        console.error('Error fetching user classifications:', error);
        return [];
      }
    }
  }
};
