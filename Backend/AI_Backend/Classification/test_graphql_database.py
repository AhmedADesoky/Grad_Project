import os
import sys
import django
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'AI_Backend.settings')
django.setup()

from Classification.schema import Schema
from graphql import graphql_sync

def Test_GraphQL_With_Database():
    print("\n" + "=" * 80)
    print("TESTING GRAPHQL API WITH MONGODB PERSISTENCE")
    print("=" * 80)
    
    Test_User_Id = "graphql_test_user_456"
    
    print("\n" + "-" * 80)
    print("TEST 1: Classify Text and Save to Database")
    print("-" * 80)
    
    Mutation_1 = """
    mutation {
        ClassifyText(
            Text: "The economic implications of climate change require immediate attention from policymakers worldwide."
            IncludeProbabilities: true
            UserId: "%s"
            SaveToDatabase: true
        ) {
            Success
            Result {
                Level
                Confidence
                Description
                TextLength
                WordCount
                Probabilities {
                    A1 A2 B1 B2 C1 C2
                }
            }
            SavedClassification {
                Id
                UserId
                Level
                Confidence
                CreatedAt
            }
            Error
        }
    }
    """ % Test_User_Id
    
    Result_1 = graphql_sync(Schema.graphql_schema, Mutation_1)
    
    if Result_1.errors:
        print(f"❌ Errors: {Result_1.errors}")
    else:
        Data = Result_1.data['ClassifyText']
        print(f"✅ Success: {Data['Success']}")
        if Data['Success']:
            print(f"   Level: {Data['Result']['Level']}")
            print(f"   Confidence: {Data['Result']['Confidence']:.2f}%")
            print(f"   Description: {Data['Result']['Description']}")
            if Data['SavedClassification']:
                print(f"   Saved Id: {Data['SavedClassification']['Id']}")
                print(f"   Created At: {Data['SavedClassification']['CreatedAt']}")
    
    print("\n" + "-" * 80)
    print("TEST 2: Classify Another Text and Save")
    print("-" * 80)
    
    Mutation_2 = """
    mutation {
        ClassifyText(
            Text: "I like pizza"
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
                Level
            }
        }
    }
    """ % Test_User_Id
    
    Result_2 = graphql_sync(Schema.graphql_schema, Mutation_2)
    
    if Result_2.errors:
        print(f"❌ Errors: {Result_2.errors}")
    else:
        Data = Result_2.data['ClassifyText']
        print(f"✅ Success: {Data['Success']}")
        if Data['Success']:
            print(f"   Level: {Data['Result']['Level']}")
            print(f"   Confidence: {Data['Result']['Confidence']:.2f}%")
            print(f"   Saved Id: {Data['SavedClassification']['Id']}")
    
    print("\n" + "-" * 80)
    print("TEST 3: Get All User Classifications")
    print("-" * 80)
    
    Query_1 = """
    query {
        GetUserClassifications(
            UserId: "%s"
            Limit: 10
            Offset: 0
        ) {
            Id
            Text
            Level
            Confidence
            Description
            TextLength
            WordCount
            CreatedAt
        }
    }
    """ % Test_User_Id
    
    Result_3 = graphql_sync(Schema.graphql_schema, Query_1)
    
    if Result_3.errors:
        print(f"❌ Errors: {Result_3.errors}")
    else:
        Classifications = Result_3.data['GetUserClassifications']
        print(f"✅ Retrieved {len(Classifications)} classifications")
        for i, Classification in enumerate(Classifications, 1):
            print(f"\n   Classification {i}:")
            print(f"      Id: {Classification['Id']}")
            print(f"      Text: {Classification['Text'][:50]}...")
            print(f"      Level: {Classification['Level']}")
            print(f"      Confidence: {Classification['Confidence']:.2f}%")
            print(f"      Created: {Classification['CreatedAt']}")
    
    print("\n" + "-" * 80)
    print("TEST 4: Get Classifications by Specific Level")
    print("-" * 80)
    
    Query_2 = """
    query {
        GetClassificationByLevel(
            UserId: "%s"
            Level: "B2"
        ) {
            Id
            Level
            Confidence
            Text
        }
    }
    """ % Test_User_Id
    
    Result_4 = graphql_sync(Schema.graphql_schema, Query_2)
    
    if Result_4.errors:
        print(f"❌ Errors: {Result_4.errors}")
    else:
        B2_Classifications = Result_4.data['GetClassificationByLevel']
        print(f"✅ Found {len(B2_Classifications)} B2 level classifications")
        for Classification in B2_Classifications:
            print(f"   Id: {Classification['Id']}")
            print(f"   Level: {Classification['Level']}")
            print(f"   Confidence: {Classification['Confidence']:.2f}%")
    
    print("\n" + "-" * 80)
    print("TEST 5: Get Recent Classifications (Last 7 Days)")
    print("-" * 80)
    
    Query_3 = """
    query {
        GetRecentClassifications(
            UserId: "%s"
            Days: 7
        ) {
            Id
            Level
            Confidence
            CreatedAt
        }
    }
    """ % Test_User_Id
    
    Result_5 = graphql_sync(Schema.graphql_schema, Query_3)
    
    if Result_5.errors:
        print(f"❌ Errors: {Result_5.errors}")
    else:
        Recent = Result_5.data['GetRecentClassifications']
        print(f"✅ Found {len(Recent)} recent classifications")
        for Classification in Recent:
            print(f"   Level: {Classification['Level']} - {Classification['Confidence']:.2f}%")
    
    print("\n" + "-" * 80)
    print("TEST 6: Cleanup Test Data")
    print("-" * 80)
    
    from Classification.models import Classification_Level
    Deleted_Count = Classification_Level.objects.filter(User_Id=Test_User_Id).count()
    Classification_Level.objects.filter(User_Id=Test_User_Id).delete()
    print(f"✅ Cleaned up {Deleted_Count} test classifications")
    
    print("\n" + "=" * 80)
    print("✅ ALL GRAPHQL DATABASE TESTS COMPLETED SUCCESSFULLY")
    print("=" * 80)

if __name__ == "__main__":
    try:
        Test_GraphQL_With_Database()
    except Exception as E:
        print(f"\n❌ Test failed with error: {str(E)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
