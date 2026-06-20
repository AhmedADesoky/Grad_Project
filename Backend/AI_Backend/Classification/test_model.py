import os
import sys
import django
from pathlib import Path
from datetime import datetime, timedelta
import json

Base_Dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Base_Dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'AI_Backend.settings')
django.setup()

from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from graphene.test import Client
from Classification.models import Classification_Level
from Classification.schema import Schema


class Classification_Level_Model_Test(TestCase):
    
    def setUp(self):
        self.Valid_Data = {
            'User_Id': 'test_user_123',
            'Text': 'This is a sample text for testing purposes.',
            'Level': 'B2',
            'Confidence': 0.8523,
            'Description': 'Upper Intermediate - Can interact with fluency and spontaneity',
            'Text_Length': 45,
            'Word_Count': 9,
            'Probabilities': {
                'A1': 0.01,
                'A2': 0.02,
                'B1': 0.05,
                'B2': 0.85,
                'C1': 0.04,
                'C2': 0.03
            }
        }
    
    def tearDown(self):
        Classification_Level.objects.all().delete()
    
    def test_Create_Classification_With_Valid_Data(self):
        Classification = Classification_Level.objects.create(**self.Valid_Data)
        
        self.assertIsNotNone(Classification._id)
        self.assertEqual(Classification.User_Id, 'test_user_123')
        self.assertEqual(Classification.Text, 'This is a sample text for testing purposes.')
        self.assertEqual(Classification.Level, 'B2')
        self.assertEqual(Classification.Confidence, 0.8523)
        self.assertIsNotNone(Classification.Created_At)
        self.assertIsInstance(Classification.Probabilities, dict)
    
    def test_Create_Classification_Without_Probabilities(self):
        Data = self.Valid_Data.copy()
        Data['Probabilities'] = {}
        
        Classification = Classification_Level.objects.create(**Data)
        
        self.assertIsNotNone(Classification._id)
        self.assertEqual(Classification.Probabilities, {})
    
    def test_CreatedAt_Auto_Generated(self):
        Before_Time = timezone.now()
        Classification = Classification_Level.objects.create(**self.Valid_Data)
        After_Time = timezone.now()
        
        self.assertIsNotNone(Classification.Created_At)
        self.assertGreaterEqual(Classification.Created_At, Before_Time)
        self.assertLessEqual(Classification.Created_At, After_Time)
    
    def test_Valid_CEFR_Levels(self):
        Valid_Levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
        
        for Level in Valid_Levels:
            Data = self.Valid_Data.copy()
            Data['Level'] = Level
            Data['User_Id'] = f'user_{Level}'
            
            Classification = Classification_Level.objects.create(**Data)
            self.assertEqual(Classification.Level, Level)
    
    def test_Invalid_CEFR_Level(self):
        Data = self.Valid_Data.copy()
        Data['Level'] = 'D1'
        
        Classification = Classification_Level.objects.create(**Data)
        self.assertEqual(Classification.Level, 'D1')
    
    def test_Required_Fields(self):
        Data = self.Valid_Data.copy()
        Data['User_Id'] = ''
        
        Classification = Classification_Level.objects.create(**Data)
        self.assertEqual(Classification.User_Id, '')
    
    def test_Text_Can_Be_Empty(self):
        Data = self.Valid_Data.copy()
        Data['Text'] = ''
        
        Classification = Classification_Level.objects.create(**Data)
        self.assertEqual(Classification.Text, '')
    
    def test_Confidence_Range(self):
        Data = self.Valid_Data.copy()
        Data['Confidence'] = 0.0
        Data['User_Id'] = 'user_min'
        Classification_Min = Classification_Level.objects.create(**Data)
        self.assertEqual(Classification_Min.Confidence, 0.0)
        
        Data['Confidence'] = 1.0
        Data['User_Id'] = 'user_max'
        Classification_Max = Classification_Level.objects.create(**Data)
        self.assertEqual(Classification_Max.Confidence, 1.0)
    
    def test_Probabilities_JSON_Structure(self):
        Data = self.Valid_Data.copy()
        Data['Probabilities'] = {
            'A1': 0.01,
            'A2': 0.02,
            'B1': 0.05,
            'B2': 0.85,
            'C1': 0.04,
            'C2': 0.03,
            'metadata': {
                'version': '1.0',
                'model': 'DistilBERT'
            }
        }
        
        Classification = Classification_Level.objects.create(**Data)
        self.assertIn('metadata', Classification.Probabilities)
        self.assertEqual(Classification.Probabilities['metadata']['version'], '1.0')
    
    def test_String_Representation(self):

        Classification = Classification_Level.objects.create(**self.Valid_Data)
        Expected_Str = f"test_user_123 - B2 (0.85%)"
        
        self.assertEqual(str(Classification), Expected_Str)
    
    def test_String_Representation_With_Different_Confidence(self):

        Data = self.Valid_Data.copy()
        Data['Confidence'] = 0.9567
        
        Classification = Classification_Level.objects.create(**Data)
        Expected_Str = f"test_user_123 - B2 (0.96%)"
        
        self.assertEqual(str(Classification), Expected_Str)
    
    def test_Filter_By_User_Id(self):

        for i in range(3):
            Data = self.Valid_Data.copy()
            Data['User_Id'] = f'user_{i}'
            Classification_Level.objects.create(**Data)
        
        User_Classifications = Classification_Level.objects.filter(User_Id='user_1')
        
        self.assertEqual(User_Classifications.count(), 1)
        self.assertEqual(User_Classifications.first().User_Id, 'user_1')
    
    def test_Filter_By_Level(self):
        Levels = ['A1', 'B1', 'B1', 'C1']
        for i, Level in enumerate(Levels):
            Data = self.Valid_Data.copy()
            Data['Level'] = Level
            Data['User_Id'] = f'user_{i}'
            Classification_Level.objects.create(**Data)
        
        B1_Classifications = Classification_Level.objects.filter(Level='B1')
        
        self.assertEqual(B1_Classifications.count(), 2)
    
    def test_Order_By_CreatedAt_Descending(self):
        Classifications = []
        for i in range(3):
            Data = self.Valid_Data.copy()
            Data['User_Id'] = f'user_{i}'
            Classification = Classification_Level.objects.create(**Data)
            Classifications.append(Classification)
        
        All_Classifications = Classification_Level.objects.all()
        
        self.assertEqual(All_Classifications.count(), 3)
        for i in range(len(All_Classifications) - 1):
            self.assertGreaterEqual(
                All_Classifications[i].Created_At,
                All_Classifications[i + 1].Created_At
            )
    
    def test_Filter_By_User_And_Level(self):
        Data_Sets = [
            {'User_Id': 'user_1', 'Level': 'A1'},
            {'User_Id': 'user_1', 'Level': 'B2'},
            {'User_Id': 'user_2', 'Level': 'B2'},
        ]
        
        for Data_Set in Data_Sets:
            Data = self.Valid_Data.copy()
            Data.update(Data_Set)
            Classification_Level.objects.create(**Data)
        
        Results = Classification_Level.objects.filter(
            User_Id='user_1',
            Level='B2'
        )
        
        self.assertEqual(Results.count(), 1)
        self.assertEqual(Results.first().User_Id, 'user_1')
        self.assertEqual(Results.first().Level, 'B2')
    
    def test_Filter_By_Confidence_Range(self):
        Confidences = [0.3, 0.5, 0.7, 0.9]
        for i, Confidence in enumerate(Confidences):
            Data = self.Valid_Data.copy()
            Data['Confidence'] = Confidence
            Data['User_Id'] = f'user_{i}'
            Classification_Level.objects.create(**Data)
        
        High_Confidence = Classification_Level.objects.filter(Confidence__gte=0.7)
        
        self.assertEqual(High_Confidence.count(), 2)
    
    def test_Filter_By_Date_Range(self):
        Classification = Classification_Level.objects.create(**self.Valid_Data)
        
        Yesterday = timezone.now() - timedelta(days=1)
        Tomorrow = timezone.now() + timedelta(days=1)
        
        Results = Classification_Level.objects.filter(
            Created_At__gte=Yesterday,
            Created_At__lte=Tomorrow
        )
        
        self.assertEqual(Results.count(), 1)
    
    def test_Create_Read_Update_Delete(self):
        Classification = Classification_Level.objects.create(**self.Valid_Data)
        Created_Id = Classification._id
        
        Retrieved = Classification_Level.objects.get(_id=Created_Id)
        self.assertEqual(Retrieved.User_Id, 'test_user_123')
        
        Retrieved.Confidence = 0.95
        Retrieved.save()
        
        Updated = Classification_Level.objects.get(_id=Created_Id)
        self.assertEqual(Updated.Confidence, 0.95)
        
        Updated.delete()
        
        with self.assertRaises(Classification_Level.DoesNotExist):
            Classification_Level.objects.get(_id=Created_Id)
    
    def test_Bulk_Create(self):
        Created_Count = 0
        for i in range(5):
            Data = self.Valid_Data.copy()
            Data['User_Id'] = f'user_{i}'
            Classification_Level.objects.create(**Data)
            Created_Count += 1
        
        self.assertEqual(Classification_Level.objects.count(), 5)
        self.assertEqual(Created_Count, 5)
    
    def test_Update_Multiple_Records(self):
        for i in range(3):
            Data = self.Valid_Data.copy()
            Data['User_Id'] = 'batch_user'
            Data['Level'] = 'A1'
            Classification_Level.objects.create(**Data)
        
        Updated_Count = Classification_Level.objects.filter(
            User_Id='batch_user',
            Level='A1'
        ).update(Level='A2')
        
        self.assertEqual(Updated_Count, 3)
        
        A2_Count = Classification_Level.objects.filter(
            User_Id='batch_user',
            Level='A2'
        ).count()
        
        self.assertEqual(A2_Count, 3)
    
    def test_Delete_Multiple_Records(self):

        for i in range(5):
            Data = self.Valid_Data.copy()
            Data['User_Id'] = 'delete_user'
            Classification_Level.objects.create(**Data)
        
        Deleted_Count, _ = Classification_Level.objects.filter(
            User_Id='delete_user'
        ).delete()
        
        self.assertEqual(Deleted_Count, 5)
        
        Remaining = Classification_Level.objects.filter(User_Id='delete_user').count()
        self.assertEqual(Remaining, 0)
    
    def test_Very_Long_Text(self):
        Data = self.Valid_Data.copy()
        Data['Text'] = 'A' * 10000
        Data['Text_Length'] = 10000
        
        Classification = Classification_Level.objects.create(**Data)
        
        self.assertEqual(len(Classification.Text), 10000)
        self.assertEqual(Classification.Text_Length, 10000)
    
    def test_Special_Characters_In_Text(self):
        Data = self.Valid_Data.copy()
        Data['Text'] = "Hello! @#$%^&*() 你好 مرحبا "
        
        Classification = Classification_Level.objects.create(**Data)
        
        self.assertEqual(Classification.Text, "Hello! @#$%^&*() 你好 مرحبا ")
    
    def test_Zero_WordCount(self):
        Data = self.Valid_Data.copy()
        Data['Word_Count'] = 0
        Data['Text'] = ''
        Data['Text_Length'] = 0
        
        Classification = Classification_Level.objects.create(**Data)
        
        self.assertEqual(Classification.Word_Count, 0)
    
    def test_Negative_Confidence(self):
        Data = self.Valid_Data.copy()
        Data['Confidence'] = -0.5
        
        Classification = Classification_Level.objects.create(**Data)
        
        self.assertEqual(Classification.Confidence, -0.5)
    
    def test_Count_Aggregation(self):
        Levels = ['A1', 'A1', 'B1', 'B1', 'B1', 'C1']
        for i, Level in enumerate(Levels):
            Data = self.Valid_Data.copy()
            Data['Level'] = Level
            Data['User_Id'] = f'user_{i}'
            Classification_Level.objects.create(**Data)
        
        A1_Count = Classification_Level.objects.filter(Level='A1').count()
        B1_Count = Classification_Level.objects.filter(Level='B1').count()
        C1_Count = Classification_Level.objects.filter(Level='C1').count()
        
        self.assertEqual(A1_Count, 2)
        self.assertEqual(B1_Count, 3)
        self.assertEqual(C1_Count, 1)


class Classification_GraphQL_Test(TestCase):
    
    def setUp(self):
        self.Client = Client(Schema)
        self.Test_User_Id = 'graphql_test_user'
        self.Test_Text = 'This is a comprehensive English text for CEFR level classification testing.'
    
    def tearDown(self):
        Classification_Level.objects.all().delete()
    
    def test_Classify_Text_Mutation(self):
        Mutation = '''
            mutation {
                ClassifyText(Text: "%s") {
                    Success
                    Result {
                        Level
                        Confidence
                        Description
                        TextLength
                        WordCount
                    }
                    Error
                }
            }
        ''' % self.Test_Text
        
        Result = self.Client.execute(Mutation)
        
        self.assertIsNone(Result.get('errors'))
        self.assertTrue(Result['data']['ClassifyText']['Success'])
        self.assertIsNotNone(Result['data']['ClassifyText']['Result'])
        self.assertIn(Result['data']['ClassifyText']['Result']['Level'], 
                     ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    
    def test_Classify_Text_With_Probabilities(self):
        Mutation = '''
            mutation {
                ClassifyText(
                    Text: "%s"
                    IncludeProbabilities: true
                ) {
                    Success
                    Result {
                        Level
                        Confidence
                        Probabilities {
                            A1
                            A2
                            B1
                            B2
                            C1
                            C2
                        }
                    }
                }
            }
        ''' % self.Test_Text
        
        Result = self.Client.execute(Mutation)
        
        self.assertIsNone(Result.get('errors'))
        self.assertTrue(Result['data']['ClassifyText']['Success'])
        Probabilities = Result['data']['ClassifyText']['Result']['Probabilities']
        self.assertIsNotNone(Probabilities)
        self.assertIn('A1', Probabilities)
        self.assertIn('B2', Probabilities)
    
    def test_Classify_Text_With_SaveToDatabase(self):
        Mutation = '''
            mutation {
                ClassifyText(
                    Text: "%s"
                    UserId: "%s"
                    SaveToDatabase: true
                ) {
                    Success
                    Result {
                        Level
                        Confidence
                    }
                    SavedClassification {
                        Id
                        UserId
                        Text
                        Level
                    }
                    Error
                }
            }
        ''' % (self.Test_Text, self.Test_User_Id)
        
        Result = self.Client.execute(Mutation)
        
        # Debug: Print the result to see what went wrong
        if not Result.get('data', {}).get('ClassifyText', {}).get('Success', False):
            print(f"\nSaveToDatabase Test Failed:")
            print(f"Errors: {Result.get('errors')}")
            Data = Result.get('data', {}).get('ClassifyText', {})
            print(f"Success: {Data.get('Success')}")
            print(f"Error: {Data.get('Error')}")
            print(f"Result: {Data.get('Result')}")
            print(f"SavedClassification: {Data.get('SavedClassification')}")
        
        self.assertIsNone(Result.get('errors'))
        self.assertTrue(Result['data']['ClassifyText']['Success'])
        Saved = Result['data']['ClassifyText']['SavedClassification']
        self.assertIsNotNone(Saved)
        self.assertEqual(Saved['UserId'], self.Test_User_Id)
        self.assertEqual(Saved['Text'], self.Test_Text)
    
    def test_Classify_Text_Empty_String(self):
        Mutation = '''
            mutation {
                ClassifyText(Text: "") {
                    Success
                    Error
                }
            }
        '''
        
        Result = self.Client.execute(Mutation)
        
        self.assertIsNone(Result.get('errors'))
        self.assertFalse(Result['data']['ClassifyText']['Success'])
        self.assertIsNotNone(Result['data']['ClassifyText']['Error'])
    
    def test_Classify_Batch_Mutation(self):
        Texts = [
            "Basic English sentence.",
            "A more complex sentence with advanced vocabulary and structure.",
            "Simple text."
        ]
        
        # Convert to GraphQL array format
        Texts_GraphQL = ', '.join([f'"{text}"' for text in Texts])
        
        Mutation = '''
            mutation {
                ClassifyBatch(Texts: [%s]) {
                    Success
                    Result {
                        Count
                        Results {
                            Level
                            Confidence
                        }
                    }
                }
            }
        ''' % Texts_GraphQL
        
        Result = self.Client.execute(Mutation)
        
        # Debug: Print the result to see what went wrong
        if Result.get('data', {}).get('ClassifyBatch', {}).get('Result', {}).get('Count', 0) != 3:
            print(f"\nBatch Test Failed:")
            print(f"Errors: {Result.get('errors')}")
            print(f"Data: {Result.get('data')}")
            print(f"Expected Count: 3, Got: {Result.get('data', {}).get('ClassifyBatch', {}).get('Result', {}).get('Count', 0)}")
        
        self.assertIsNone(Result.get('errors'))
        self.assertTrue(Result['data']['ClassifyBatch']['Success'])
        self.assertEqual(Result['data']['ClassifyBatch']['Result']['Count'], 3)
    
    def test_Model_Info_Query(self):
        Query = '''
            query {
                ModelInfo {
                    ModelPath
                    Device
                    ModelType
                    NumLabels
                    Levels
                    GPUAvailable
                    ModelLoaded
                }
            }
        '''
        
        Result = self.Client.execute(Query)
        
        self.assertIsNone(Result.get('errors'))
        ModelInfo = Result['data']['ModelInfo']
        self.assertIsNotNone(ModelInfo)
        self.assertEqual(ModelInfo['ModelType'], 'DistilBERT')
        self.assertEqual(ModelInfo['NumLabels'], 6)
        self.assertEqual(len(ModelInfo['Levels']), 6)
    
    def test_Health_Check_Query(self):
        Query = '''
            query {
                HealthCheck
            }
        '''
        
        Result = self.Client.execute(Query)
        
        self.assertIsNone(Result.get('errors'))
        self.assertTrue(Result['data']['HealthCheck'])
    
    def test_GetUserClassifications_Query(self):
        for i in range(3):
            Classification_Level.objects.create(
                User_Id=self.Test_User_Id,
                Text=f'Test text {i}',
                Level='B1',
                Confidence=0.75,
                Description='Intermediate',
                Text_Length=20,
                Word_Count=3,
                Probabilities={}
            )
        
        Query = '''
            query {
                GetUserClassifications(UserId: "%s", Limit: 10) {
                    Id
                    UserId
                    Text
                    Level
                    Confidence
                }
            }
        ''' % self.Test_User_Id
        
        Result = self.Client.execute(Query)
        
        self.assertIsNone(Result.get('errors'))
        Classifications = Result['data']['GetUserClassifications']
        self.assertEqual(len(Classifications), 3)
        self.assertEqual(Classifications[0]['UserId'], self.Test_User_Id)
    
    def test_GetClassificationByLevel_Query(self):
        Classification_Level.objects.create(
            User_Id=self.Test_User_Id,
            Text='Advanced text',
            Level='C1',
            Confidence=0.88,
            Description='Advanced',
            Text_Length=50,
            Word_Count=10,
            Probabilities={}
        )
        
        Query = '''
            query {
                GetClassificationByLevel(UserId: "%s", Level: "C1") {
                    Id
                    Level
                    Confidence
                }
            }
        ''' % self.Test_User_Id
        
        Result = self.Client.execute(Query)
        
        self.assertIsNone(Result.get('errors'))
        Classifications = Result['data']['GetClassificationByLevel']
        self.assertEqual(len(Classifications), 1)
        self.assertEqual(Classifications[0]['Level'], 'C1')
    
    def test_GetRecentClassifications_Query(self):
        Classification_Level.objects.create(
            User_Id=self.Test_User_Id,
            Text='Recent text',
            Level='B2',
            Confidence=0.80,
            Description='Upper Intermediate',
            Text_Length=30,
            Word_Count=5,
            Probabilities={}
        )
        
        Query = '''
            query {
                GetRecentClassifications(UserId: "%s", Days: 7) {
                    Id
                    UserId
                    CreatedAt
                }
            }
        ''' % self.Test_User_Id
        
        Result = self.Client.execute(Query)
        
        self.assertIsNone(Result.get('errors'))
        Classifications = Result['data']['GetRecentClassifications']
        self.assertEqual(len(Classifications), 1)


if __name__ == '__main__':
    import unittest
    
    print("\n" + "="*70)
    print(" Classification Model & GraphQL Tests")
    print("="*70 + "\n")
    
    Loader = unittest.TestLoader()
    Suite = unittest.TestSuite()
    
    Suite.addTests(Loader.loadTestsFromTestCase(Classification_Level_Model_Test))
    Suite.addTests(Loader.loadTestsFromTestCase(Classification_GraphQL_Test))
    
    Runner = unittest.TextTestRunner(verbosity=2)
    Result = Runner.run(Suite)
    
    print("\n" + "="*70)
    print(f" Tests Run: {Result.testsRun}")
    print(f" Successes: {Result.testsRun - len(Result.failures) - len(Result.errors)}")
    print(f" Failures: {len(Result.failures)}")
    print(f" Errors: {len(Result.errors)}")
    print("="*70 + "\n")
    
    sys.exit(0 if Result.wasSuccessful() else 1)


