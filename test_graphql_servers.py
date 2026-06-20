"""
Quick GraphQL Test Script
Tests both AI_Backend and User_Backend GraphQL endpoints
"""
import requests
import json

def test_ai_backend():
    print("\n" + "="*60)
    print("TESTING AI_BACKEND (Django) - Port 8000")
    print("="*60)
    
    url = "http://localhost:8000/graphql/"
    
    # Test 1: Model Info
    query = """
    query {
        ModelInfo {
            ModelPath
            Device
            Levels
            ModelLoaded
        }
    }
    """
    
    try:
        response = requests.post(url, json={'query': query})
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and data['data']['ModelInfo']:
                print("✅ Model Info Retrieved:")
                print(f"   Device: {data['data']['ModelInfo']['Device']}")
                print(f"   Levels: {', '.join(data['data']['ModelInfo']['Levels'])}")
                print(f"   Model Loaded: {data['data']['ModelInfo']['ModelLoaded']}")
            else:
                print("❌ Model Info Query Failed:")
                print(json.dumps(data, indent=2))
        else:
            print(f"❌ Request Failed: HTTP {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Error: {str(e)}")
    
    # Test 2: Classification
    mutation = """
    mutation {
        ClassifyText(
            Text: "The intricate mechanisms underlying quantum physics are fascinating"
            IncludeProbabilities: false
        ) {
            Success
            Result {
                Level
                Confidence
                Description
            }
            Error
        }
    }
    """
    
    try:
        response = requests.post(url, json={'query': mutation})
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and data['data']['ClassifyText']['Success']:
                result = data['data']['ClassifyText']['Result']
                print("\n✅ Text Classification:")
                print(f"   Level: {result['Level']}")
                print(f"   Confidence: {result['Confidence']:.2f}%")
                print(f"   Description: {result['Description']}")
            else:
                print("❌ Classification Failed:")
                print(json.dumps(data, indent=2))
        else:
            print(f"❌ Request Failed: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def test_user_backend():
    print("\n" + "="*60)
    print("TESTING USER_BACKEND (Node.js) - Port 4000")
    print("="*60)
    
    url = "http://localhost:4000/graphql"
    
    # Test: Sign Up
    mutation = """
    mutation {
        signUp(
            User_Name: "testuser_%s"
            Email: "test_%s@example.com"
            Password: "password123"
        ) {
            id
            User_Name
            Email
        }
    }
    """ % (123, 123)  # Using simple numbers for test
    
    try:
        response = requests.post(url, json={'query': mutation})
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and 'signUp' in data['data']:
                user = data['data']['signUp']
                print("✅ User Created:")
                print(f"   ID: {user['id']}")
                print(f"   Username: {user['User_Name']}")
                print(f"   Email: {user['Email']}")
            else:
                print("❌ Sign Up Failed:")
                if 'errors' in data:
                    for error in data['errors']:
                        print(f"   Error: {error['message']}")
        else:
            print(f"❌ Request Failed: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("GraphQL SERVERS TEST")
    print("="*60)
    
    test_ai_backend()
    test_user_backend()
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)
    print("\nTo test in browser:")
    print("  AI_Backend:   http://localhost:8000/graphql/")
    print("  User_Backend: http://localhost:4000/graphql")
    print("\n")
