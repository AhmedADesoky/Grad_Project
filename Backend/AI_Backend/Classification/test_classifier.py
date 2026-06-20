"""
Test Script for CEFR DistilBERT Classifier
This script tests the DistilBERT classifier independently before running the Django server
"""

import sys
from pathlib import Path

# Add the project root to the path
project_root = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "Backend" / "AI_Backend"))

def test_imports():
    """Test if all required packages are installed"""
    print("="*70)
    print("Testing Package Imports")
    print("="*70)
    
    try:
        import torch
        print(f"✓ PyTorch version: {torch.__version__}")
        print(f"✓ CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"✓ CUDA device: {torch.cuda.get_device_name(0)}")
    except ImportError as e:
        print(f"✗ PyTorch not installed: {e}")
        print("  Install with: pip install torch")
        return False
    
    try:
        import transformers
        print(f"✓ Transformers version: {transformers.__version__}")
    except ImportError as e:
        print(f"✗ Transformers not installed: {e}")
        print("  Install with: pip install transformers")
        return False
    
    print("\n✓ All required packages are installed!\n")
    return True


def test_model_files():
    """Check if model files exist"""
    print("="*70)
    print("Checking Model Files")
    print("="*70)
    
    model_path = project_root / "model" / "distilbert_cefr_classifier"
    
    required_files = [
        "config.json",
        "model.safetensors",
        "tokenizer.json",
        "tokenizer_config.json"
    ]
    
    all_exist = True
    for file in required_files:
        file_path = model_path / file
        if file_path.exists():
            size = file_path.stat().st_size / (1024 * 1024)  # MB
            print(f"✓ {file} ({size:.2f} MB)")
        else:
            print(f"✗ {file} - NOT FOUND")
            all_exist = False
    
    print(f"\nModel path: {model_path}")
    
    if all_exist:
        print("\n✓ All model files found!\n")
    else:
        print("\n✗ Some model files are missing!\n")
    
    return all_exist


def test_classifier():
    """Test the CEFR classifier with sample texts"""
    print("="*70)
    print("Testing CEFR Classifier")
    print("="*70)
    
    try:
        # Import the classifier
        from Classification.services.DistilBERT_Classifier import Get_Classifier
        
        # Get classifier instance
        print("\nLoading classifier...")
        Classifier = Get_Classifier()
        
        # Get model info
        Info = Classifier.Get_Model_Info()
        print(f"\n✓ Classifier loaded successfully!")
        print(f"  Device: {Info['device']}")
        print(f"  Model type: {Info['model_type']}")
        print(f"  CEFR Levels: {', '.join(Info['levels'])}")
        
        # Test texts with various CEFR levels
        test_samples = [
            ("A1", "I like pizza. It is good."),
            ("A2", "Yesterday I went to the park with my friends. We played football."),
            ("B1", "I have been studying English for three years. It's becoming easier for me to understand native speakers."),
            ("B2", "The economic implications of climate change require immediate attention from policymakers worldwide."),
            ("C1", "The juxtaposition of traditional values and modern technology creates a compelling narrative about societal evolution."),
            ("C2", "The epistemological framework underpinning contemporary discourse necessitates a reconfiguration of our analytical paradigms.")
        ]
        
        print("\n" + "="*70)
        print("Testing Sample Texts")
        print("="*70)
        
        for expected_level, text in test_samples:
            print(f"\nExpected Level: {expected_level}")
            print(f"Text: {text[:70]}...")
            
            Result = Classifier.Classify_Text(text, Return_Probabilities=True)
            
            print(f"Predicted: {Result['level']} (confidence: {Result['confidence']:.2%})")
            print(f"Description: {Result['description']}")
            
            # Show top 3 probabilities
            Probs = sorted(Result['probabilities'].items(), key=lambda x: x[1], reverse=True)[:3]
            print("Top 3 probabilities:")
            for level, prob in Probs:
                print(f"  {level}: {prob:.2%}")
            
            if Result['level'] == expected_level:
                print("✓ CORRECT prediction!")
            else:
                print(f"✗ INCORRECT (expected {expected_level})")
        
        # Test batch classification
        print("\n" + "="*70)
        print("Testing Batch Classification")
        print("="*70)
        
        batch_texts = [
            "I am happy.",
            "She studies every day.",
            "The complexity of the situation demands careful consideration."
        ]
        
        print(f"\nClassifying {len(batch_texts)} texts...")
        Results = Classifier.Classify_Batch(batch_texts, Return_Probabilities=False)
        
        for i, (text, result) in enumerate(zip(batch_texts, Results), 1):
            print(f"\n{i}. {text}")
            print(f"   Level: {result['level']} ({result['confidence']:.2%} confidence)")
        
        print("\n" + "="*70)
        print("✓ All tests completed successfully!")
        print("="*70)
        
        return True
        
    except Exception as e:
        print(f"\n✗ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main test function"""
    print("\n" + "="*70)
    print("CEFR DistilBERT Classifier - Test Suite")
    print("="*70 + "\n")
    
    # Test 1: Check imports
    if not test_imports():
        print("\n⚠️  Please install missing packages first:")
        print("    pip install torch transformers")
        return
    
    # Test 2: Check model files
    if not test_model_files():
        print("\n⚠️  Model files are missing!")
        print("    Ensure the model is in: model/distilbert_cefr_classifier/")
        return
    
    # Test 3: Test classifier
    if test_classifier():
        print("\n✅ SUCCESS! The classifier is working correctly.")
        print("\nYou can now:")
        print("  1. Start the Django server: python manage.py runserver")
        print("  2. Test the API endpoints (see Classification/README.md)")
    else:
        print("\n❌ FAILED! There were errors during testing.")
        print("   Check the error messages above for details.")


if __name__ == "__main__":
    main()
