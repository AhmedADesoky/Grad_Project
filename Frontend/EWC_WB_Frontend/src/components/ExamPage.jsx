// src/components/ExamPage.jsx
import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { FileText, Clock, Award, Send, CheckCircle, AlertCircle } from 'lucide-react';

const examQuestions = [
  {
    id: 1,
    question: 'Write a short paragraph (50-100 words) describing your favorite hobby.',
    points: 10
  },
  {
    id: 2,
    question: 'Complete the sentence: "If I could travel anywhere in the world, I would..."',
    points: 10
  },
  {
    id: 3,
    question: 'Write a formal email requesting information about an English course.',
    points: 15
  },
  {
    id: 4,
    question: 'Describe a recent challenge you faced and how you overcame it. (100-150 words)',
    points: 15
  }
];

export function ExamPage() {
  const { user, updateProfile } = useAuth();
  const { isCollapsed } = useSidebar();
  const [examStarted, setExamStarted] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const handleStartExam = () => {
    setExamStarted(true);
    setSubmitted(false);
    setAnswers({});
    setScore(0);
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    // Calculate a mock score based on answer lengths
    let totalScore = 0;
    examQuestions.forEach(q => {
      const answer = answers[q.id] || '';
      const wordCount = answer.trim().split(/\s+/).length;
      if (wordCount > 0) {
        totalScore += Math.min(q.points, Math.floor(q.points * (wordCount / 50)));
      }
    });

    const percentage = Math.round((totalScore / 50) * 100);
    setScore(percentage);
    setSubmitted(true);

    // Save exam result to user profile
    if (user) {
      const newExamScore = {
        date: new Date().toLocaleDateString(),
        score: percentage,
        level: user.level
      };

      updateProfile({
        examScores: [...(user.examScores || []), newExamScore]
      });
    }
  };

  if (!examStarted) {
    return (
      <div className="min-h-screen bg-background transition-colors">
        <Sidebar />
        <Navbar />

        <div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pt-24">
            <div className="ios-card p-8 animate-fade-in">
              <div className="flex items-center gap-4 mb-8">
                <div className="gradient-primary p-5 rounded-xl">
                  <FileText className="w-12 h-12 text-white" />
                </div>
                <div>
                  <h1 className="text-foreground">English Writing Exam</h1>
                  <p className="text-muted-foreground text-lg">Test your writing skills and track your progress</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <div className="flex items-center gap-4 p-6 bg-info/5 border border-info/20 rounded-xl">
                  <div className="p-3 bg-info/10 rounded-xl">
                    <Clock className="w-6 h-6 text-info" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Duration</p>
                    <p className="text-muted-foreground text-sm">45 minutes</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-6 bg-success/5 border border-success/20 rounded-xl">
                  <div className="p-3 bg-success/10 rounded-xl">
                    <Award className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Total Points</p>
                    <p className="text-muted-foreground text-sm">50 points</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-6 bg-primary/5 border border-primary/20 rounded-xl">
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Questions</p>
                    <p className="text-muted-foreground text-sm">4 writing tasks</p>
                  </div>
                </div>
              </div>

              <div className="bg-warning/5 border-l-4 border-warning p-6 rounded-xl mb-8">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-foreground font-semibold mb-1">Important</p>
                    <p className="text-muted-foreground text-sm">
                      Make sure you have a quiet environment and enough time before starting the exam.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleStartExam}
                className="w-full gradient-primary text-white py-5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group font-semibold text-lg"
              >
                Start Exam
                <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    const passed = score >= 70;

    return (
      <div className="min-h-screen bg-background transition-colors">
        <Sidebar />
        <Navbar />

        <div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pt-24">
            <div className="ios-card p-10 text-center animate-fade-in">
              <div className={`${passed ? 'bg-success/20' : 'bg-warning/20'} w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6`}>
                {passed ? (
                  <CheckCircle className="w-14 h-14 text-success" />
                ) : (
                  <Award className="w-14 h-14 text-warning" />
                )}
              </div>

              <h1 className="text-foreground mb-6">Exam Completed!</h1>

              <div className="gradient-primary rounded-xl p-10 mb-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                <div className="relative">
                  <p className="text-white/90 mb-2 font-medium">Your Score</p>
                  <p className="text-white text-6xl font-bold">{score}%</p>
                </div>
              </div>

              <p className="text-muted-foreground text-lg mb-10">
                {passed
                  ? '🎉 Excellent work! You passed the exam with flying colors.'
                  : '💪 Keep practicing! Review your answers and try again to improve your score.'}
              </p>

              <div className="flex gap-4 justify-center flex-wrap">
                <button
                  onClick={() => {
                    setExamStarted(false);
                    setSubmitted(false);
                  }}
                  className="bg-card border-2 border-border text-foreground px-8 py-4 rounded-xl hover:bg-muted transition-all duration-300 font-semibold"
                >
                  Back to Exam Info
                </button>
                <a
                  href="/dashboard"
                  className="gradient-primary text-white px-8 py-4 rounded-xl transition-all duration-300 font-semibold"
                >
                  View Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-colors">
      <Sidebar />
      <Navbar />

      <div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pt-24">
          <div className="ios-card p-8 animate-fade-in">
            <div className="mb-8">
              <h1 className="text-foreground mb-2">Writing Exam</h1>
              <p className="text-muted-foreground text-lg">Answer all questions to the best of your ability</p>
            </div>

            <div className="space-y-8">
              {examQuestions.map((question, index) => (
                <div key={question.id} className="border-b border-border pb-8 last:border-b-0">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <h3 className="text-foreground">Question {question.id}</h3>
                    </div>
                    <span className="bg-accent/10 text-accent px-5 py-2 rounded-xl text-sm font-semibold">
                      {question.points} points
                    </span>
                  </div>

                  <p className="text-card-foreground mb-5 ml-13 text-lg">{question.question}</p>

                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    className="w-full h-40 p-5 bg-input-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition-all text-foreground placeholder:text-muted-foreground"
                    placeholder="Type your answer here..."
                  />

                  <p className="text-sm text-muted-foreground mt-3 ml-13">
                    Word count: {(answers[question.id] || '').trim().split(/\s+/).filter(w => w.length > 0).length}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 gradient-primary text-white px-10 py-4 rounded-xl transition-all duration-300 group font-semibold text-lg"
              >
                <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                Submit Exam
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}