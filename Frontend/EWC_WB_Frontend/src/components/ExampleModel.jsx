// components/ExampleModal.jsx

import React, { useState, useEffect } from 'react';
import { X, BookOpen, ExternalLink, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { fetchTaskExamples } from '../graphql/AIService';

function ExampleModal({ task, onClose }) {
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('corrections');

  useEffect(() => {
    loadExamples();
  }, [task]);

  const loadExamples = async () => {
    setLoading(true);
    try {
      const result = await fetchTaskExamples({
        Task_Type: task.type || 'writing_task',
        Skill: task.skills?.[0] || 'grammar',
        Level: 'B1',
        Limit: 3
      });
      if (result?.Success) {
        setExamples(result.Examples || []);
      }
    } catch (error) {
      console.error('Error loading examples:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to highlight differences between wrong and correct text
  const highlightDifferences = (wrong, correct) => {
    // Simple diff highlighting - can be enhanced with a proper diff library
    const wrongWords = wrong.split(/(\s+)/);
    const correctWords = correct.split(/(\s+)/);
    
    let result = [];
    let correctIndex = 0;
    
    for (let i = 0; i < wrongWords.length; i++) {
      const word = wrongWords[i];
      if (word.trim() && correctIndex < correctWords.length) {
        // Find matching word in correct text
        let found = false;
        for (let j = correctIndex; j < Math.min(correctIndex + 3, correctWords.length); j++) {
          if (correctWords[j].toLowerCase() === word.toLowerCase()) {
            found = true;
            correctIndex = j + 1;
            break;
          }
        }
        if (!found && word.trim()) {
          result.push(<span key={i} className="bg-red-500/30 text-red-700 dark:text-red-300 px-0.5 rounded">{word}</span>);
        } else {
          result.push(<span key={i}>{word}</span>);
        }
      } else {
        result.push(<span key={i}>{word}</span>);
      }
    }
    
    return result;
  };

  const highlightAddedWords = (correct, wrong) => {
    const wrongLower = wrong.toLowerCase();
    const words = correct.split(/(\s+)/);
    
    return words.map((word, i) => {
      if (word.trim() && !wrongLower.includes(word.toLowerCase())) {
        return <span key={i} className="bg-green-500/30 text-green-700 dark:text-green-300 px-0.5 rounded">{word}</span>;
      }
      return <span key={i}>{word}</span>;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-card border border-border shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">📚 How to Complete: {task.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Learn with examples before starting your task
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[calc(90vh-180px)]">
          
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-border pb-2">
            <button
              onClick={() => setActiveTab('corrections')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'corrections'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              ✏️ Error Corrections
            </button>
            <button
              onClick={() => setActiveTab('concepts')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'concepts'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              📖 Writing Concepts
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : activeTab === 'corrections' ? (
            // Error Corrections Tab
            <div className="space-y-6">
              {examples.filter(e => e.Type === 'error_correction').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No correction examples available for this task type.
                </div>
              ) : (
                examples.filter(e => e.Type === 'error_correction').map((ex, idx) => (
                  <div key={idx} className="space-y-4 border border-border rounded-xl p-5 bg-muted/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">Example {idx + 1}</span>
                      <span className="text-xs text-muted-foreground">from {ex.Source}</span>
                    </div>
                    
                    {/* Wrong Version - Highlighted in Red */}
                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="text-sm text-red-600 font-medium mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        ❌ Common Mistake:
                      </p>
                      <p className="text-foreground leading-relaxed">
                        {highlightDifferences(ex.Wrong, ex.Correct)}
                      </p>
                    </div>
                    
                    {/* Correct Version - Highlighted in Green */}
                    <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <p className="text-sm text-green-600 font-medium mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        ✅ Corrected Version:
                      </p>
                      <p className="text-foreground leading-relaxed">
                        {highlightAddedWords(ex.Correct, ex.Wrong)}
                      </p>
                    </div>
                    
                    {/* Explanation */}
                    <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                      <p className="text-sm text-blue-600 font-medium mb-2">💡 Why is this correct?</p>
                      <p className="text-foreground leading-relaxed">{ex.Explanation}</p>
                    </div>
                    
                    {/* Source Link */}
                    {ex.Url && (
                      <a href={ex.Url} target="_blank" rel="noopener noreferrer" 
                         className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Learn more from {ex.Source} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            // Concepts Tab
            <div className="space-y-4">
              {examples.filter(e => e.Type === 'concept').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No concept explanations available for this task.
                </div>
              ) : (
                examples.filter(e => e.Type === 'concept').map((ex, idx) => (
                  <div key={idx} className="p-5 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-primary">from {ex.Source}</span>
                    </div>
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {ex.Content}
                    </p>
                    {ex.Url && (
                      <a href={ex.Url} target="_blank" rel="noopener noreferrer" 
                         className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3">
                        Read full article <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          
          {/* Task Prompt Reminder */}
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <p className="text-sm font-medium text-amber-600 mb-2">📝 Your Task:</p>
            <p className="text-foreground">{task.prompt}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-border bg-muted/20">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium">
            Got it! Start Writing →
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExampleModal;