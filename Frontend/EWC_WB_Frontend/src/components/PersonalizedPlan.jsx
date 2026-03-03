// src/components/PersonalizedPlan.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { Calendar, CheckCircle, Clock, BookOpen, Target, Flame, Lightbulb } from 'lucide-react';

const weeklyPlan = [
  {
    day: 'Monday',
    tasks: [
      { title: 'Grammar Practice: Present Perfect', duration: '30 min', completed: true },
      { title: 'Vocabulary Building: Business English', duration: '20 min', completed: true }
    ]
  },
  {
    day: 'Tuesday',
    tasks: [
      { title: 'Writing Exercise: Descriptive Essay', duration: '45 min', completed: true },
      { title: 'Reading Comprehension', duration: '25 min', completed: false }
    ]
  },
  {
    day: 'Wednesday',
    tasks: [
      { title: 'Grammar Practice: Conditional Sentences', duration: '30 min', completed: false },
      { title: 'Writing Practice: Email Writing', duration: '35 min', completed: false }
    ]
  },
  {
    day: 'Thursday',
    tasks: [
      { title: 'Vocabulary Quiz', duration: '20 min', completed: false },
      { title: 'Creative Writing Exercise', duration: '40 min', completed: false }
    ]
  },
  {
    day: 'Friday',
    tasks: [
      { title: 'Essay Writing: Argumentative', duration: '60 min', completed: false },
      { title: 'Grammar Review', duration: '20 min', completed: false }
    ]
  },
  {
    day: 'Saturday',
    tasks: [
      { title: 'Reading Practice: News Articles', duration: '30 min', completed: false },
      { title: 'Vocabulary Expansion', duration: '25 min', completed: false }
    ]
  },
  {
    day: 'Sunday',
    tasks: [
      { title: 'Weekly Review and Practice Test', duration: '90 min', completed: false }
    ]
  }
];

const goals = [
  { id: 1, title: 'Complete 10 writing exercises', progress: 6, total: 10 },
  { id: 2, title: 'Master advanced grammar topics', progress: 3, total: 5 },
  { id: 3, title: 'Expand vocabulary by 100 words', progress: 67, total: 100 },
  { id: 4, title: 'Write 5 essays', progress: 2, total: 5 }
];

export function PersonalizedPlan() {
  const { user } = useAuth();
  const { isCollapsed } = useSidebar();
  const userLevel = user?.level || 'A1';

  return (
    <div className="min-h-screen bg-background transition-colors">
      <Sidebar />
     
      <div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Target className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-foreground">Your Personalized Learning Plan</h1>
          </div>
          <p className="text-muted-foreground text-lg">Customized for {userLevel} level - Stay on track with your daily goals</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Weekly Schedule */}
          <div className="lg:col-span-2 space-y-6">
            <div className="ios-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-foreground">Weekly Schedule</h2>
                  <p className="text-muted-foreground text-sm">Your personalized learning roadmap</p>
                </div>
              </div>
             
              <div className="space-y-4">
                {weeklyPlan.map((dayPlan, dayIndex) => {
                  const allCompleted = dayPlan.tasks.every(t => t.completed);
                  const someCompleted = dayPlan.tasks.some(t => t.completed);
                 
                  return (
                    <div
                      key={dayPlan.day}
                      className={`border-2 rounded-xl p-6 transition-all hover:shadow-lg ${
                        allCompleted
                          ? 'border-success/30 bg-success/5'
                          : 'border-border bg-card/50'
                      }`}
                      style={{ animationDelay: `${dayIndex * 50}ms` }}
                    >
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-semibold ${
                            allCompleted
                              ? 'gradient-primary text-white shadow-lg'
                              : someCompleted
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {dayPlan.day.substring(0, 3)}
                          </div>
                          <div>
                            <h3 className="text-foreground font-semibold">{dayPlan.day}</h3>
                            <p className="text-muted-foreground text-sm">{dayPlan.tasks.length} tasks</p>
                          </div>
                        </div>
                        {allCompleted && (
                          <span className="text-success text-sm font-semibold bg-success/10 px-4 py-2 rounded-full flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Completed
                          </span>
                        )}
                      </div>
                     
                      <div className="space-y-3">
                        {dayPlan.tasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-4 bg-input-background rounded-xl hover:bg-muted/50 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                                task.completed
                                  ? 'bg-success text-white'
                                  : 'border-2 border-muted-foreground group-hover:border-primary'
                              }`}>
                                {task.completed && <CheckCircle className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className={`text-foreground font-medium ${task.completed ? 'line-through opacity-60' : ''}`}>
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>{task.duration}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recommended Resources */}
            <div className="ios-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-accent/10 rounded-xl">
                  <BookOpen className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-foreground">Recommended Resources</h2>
                  <p className="text-muted-foreground text-sm">Curated learning materials</p>
                </div>
              </div>
             
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="group flex items-center gap-4 p-5 border-2 border-border rounded-xl hover:border-primary hover:shadow-lg transition-all cursor-pointer">
                  <div className="gradient-primary p-3 rounded-xl group-hover:shadow-primary/30 transition-all flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Grammar Guide</p>
                    <p className="text-sm text-muted-foreground">PDF - 45 pages</p>
                  </div>
                </div>
               
                <div className="group flex items-center gap-4 p-5 border-2 border-border rounded-xl hover:border-primary hover:shadow-lg transition-all cursor-pointer">
                  <div className="bg-gradient-to-br from-accent to-primary p-3 rounded-xl group-hover:shadow-primary/30 transition-all flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Templates</p>
                    <p className="text-sm text-muted-foreground">20 documents</p>
                  </div>
                </div>
               
                <div className="group flex items-center gap-4 p-5 border-2 border-border rounded-xl hover:border-primary hover:shadow-lg transition-all cursor-pointer">
                  <div className="bg-gradient-to-br from-secondary to-accent p-3 rounded-xl group-hover:shadow-primary/30 transition-all flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Flashcards</p>
                    <p className="text-sm text-muted-foreground">500 words</p>
                  </div>
                </div>
               
                <div className="group flex items-center gap-4 p-5 border-2 border-border rounded-xl hover:border-primary hover:shadow-lg transition-all cursor-pointer">
                  <div className="bg-gradient-to-br from-info to-primary p-3 rounded-xl group-hover:shadow-primary/30 transition-all flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Exercises</p>
                    <p className="text-sm text-muted-foreground">100+ interactive</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Monthly Goals */}
            <div className="ios-card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold">Monthly Goals</h3>
                  <p className="text-muted-foreground text-xs">Track your progress</p>
                </div>
              </div>
             
              <div className="space-y-5">
                {goals.map((goal) => {
                  const percentage = Math.round((goal.progress / goal.total) * 100);
                  return (
                    <div key={goal.id}>
                      <div className="flex justify-between mb-2">
                        <p className="text-card-foreground text-sm font-medium">{goal.title}</p>
                        <span className="text-muted-foreground text-sm font-bold">
                          {goal.progress}/{goal.total}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="gradient-primary h-3 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Study Streak */}
            <div className="gradient-primary rounded-xl p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Flame className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold">Study Streak</h3>
                </div>
                <div className="text-center py-4">
                  <p className="text-7xl font-bold mb-2">42</p>
                  <p className="text-white/90 font-medium">Days in a row!</p>
                </div>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-sm text-white/90 text-center">
                    Keep going! You're on fire! 🔥
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="ios-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-warning/10 rounded-xl">
                  <Lightbulb className="w-5 h-5 text-warning" />
                </div>
                <h3 className="text-foreground font-semibold">Quick Tips</h3>
              </div>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex gap-3 items-start p-3 bg-muted/30 rounded-xl">
                  <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                  <span>Practice writing for at least 30 minutes daily</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-muted/30 rounded-xl">
                  <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                  <span>Read English articles to improve vocabulary</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-muted/30 rounded-xl">
                  <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                  <span>Review grammar rules regularly</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-muted/30 rounded-xl">
                  <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                  <span>Get feedback on your writing</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}