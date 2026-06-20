import os
import sys
import django
from pathlib import Path

sys.path.append(str(Path(__file__).parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'AI_Backend.settings')
django.setup()

from Classification.models import Classification_Level
from Classification.services.DistilBERT_Classifier import Get_Classifier
from datetime import datetime

def Test_MongoDB_Connection():
    print("=" * 60)
    print("Testing MongoDB Connection for AI_Backend")
    print("=" * 60)
    
    try:
        from django.db import connection
        connection.ensure_connection()
        print("✓ MongoDB connection successful!")
        print(f"  Database: {connection.settings_dict['NAME']}")
        print(f"  Host: {connection.settings_dict['CLIENT']['host']}")
    except Exception as E:
        print(f"✗ MongoDB connection failed: {str(E)}")
        return False
    
    print("\n" + "=" * 60)
    print("Testing Classification_Level Model")
    print("=" * 60)
    
    try:
        Test_User_Id = "test_user_123"
        Test_Text = "The economic implications of climate change require immediate attention from policymakers worldwide."
        
        print(f"\nClassifying test text...")
        Classifier = Get_Classifier()
        Result = Classifier.Classify_Text(Text=Test_Text, Return_Probabilities=True)
        
        print(f"✓ Classification Result:")
        print(f"  Level: {Result['level']}")
        print(f"  Confidence: {Result['confidence']:.2f}%")
        print(f"  Description: {Result['description']}")
        
        print(f"\nSaving to MongoDB...")
        Classification = Classification_Level.objects.create(
            User_Id=Test_User_Id,
            Text=Test_Text,
            Level=Result['level'],
            Confidence=Result['confidence'],
            Description=Result['description'],
            Text_Length=Result['text_length'],
            Word_Count=Result['word_count'],
            Probabilities=Result.get('probabilities')
        )
        
        print(f"✓ Classification saved with ID: {Classification._id}")
        
        print(f"\nRetrieving from MongoDB...")
        Retrieved = Classification_Level.objects.filter(User_Id=Test_User_Id).first()
        
        if Retrieved:
            print(f"✓ Retrieved Classification:")
            print(f"  ID: {Retrieved._id}")
            print(f"  User_Id: {Retrieved.User_Id}")
            print(f"  Level: {Retrieved.Level}")
            print(f"  Confidence: {Retrieved.Confidence:.2f}%")
            print(f"  Created_At: {Retrieved.Created_At}")
        else:
            print("✗ Failed to retrieve classification")
            return False
        
        print(f"\nCounting total classifications for user...")
        Count = Classification_Level.objects.filter(User_Id=Test_User_Id).count()
        print(f"✓ Total classifications: {Count}")
        
        print(f"\nCleaning up test data...")
        Classification_Level.objects.filter(User_Id=Test_User_Id).delete()
        print(f"✓ Test data cleaned up")
        
        print("\n" + "=" * 60)
        print("✓ All MongoDB integration tests passed!")
        print("=" * 60)
        return True
        
    except Exception as E:
        print(f"\n✗ Test failed: {str(E)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    Success = Test_MongoDB_Connection()
    sys.exit(0 if Success else 1)
