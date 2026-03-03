// src/components/Dashboard.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { Calendar as CalendarComponent } from './Calendar';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { TrendingUp, Award, Target, Calendar, Activity, Zap, CheckCircle, Clock, BookOpen, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';

export function Dashboard() {
  const { user } = useAuth();
  const { isCollapsed } = useSidebar();

  // Safe defaults for user data
  const progress = user?.progress || { completed: 0, total: 10 };
  const examScores = user?.examScores || [];

  // Mock schedule data for calendar and agenda
  const schedules = [
    { 
      id: 1, 
      date: '2026-02-19', 
      time: '08:00 am', 
      title: 'Homeroom & Announcement', 
      grade: 'All Grade',
      color: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
    },
    { 
      id: 2, 
      date: '2026-02-19', 
      time: '10:00 am', 
      title: 'Math Review & Practice', 
      grade: 'Grade 1-5',
      color: 'bg-blue-100 dark:bg-blue-800/30 border-blue-300 dark:border-blue-600'
    },
    { 
      id: 3, 
      date: '2026-02-19', 
      time: '10:30 am', 
      title: 'Science Experiment & Discussion', 
      grade: 'Grade 6-8',
      color: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
    },
    { 
      id: 4, 
      date: '2026-02-22', 
      time: '09:00 am', 
      title: 'Grammar Workshop', 
      grade: 'Grade 3-6',
      color: 'bg-white dark:bg-blue-950/30 border-blue-100 dark:border-blue-800'
    },
    { 
      id: 5, 
      date: '2026-02-23', 
      time: '02:00 pm', 
      title: 'Writing Practice', 
      grade: 'Grade 7-9',
      color: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
    },
    { 
      id: 6, 
      date: '2026-02-25', 
      time: '11:00 am', 
      title: 'Vocabulary Building', 
      grade: 'All Grade',
      color: 'bg-blue-100 dark:bg-blue-800/30 border-blue-300 dark:border-blue-600'
    }
  ];

  // Get today's agenda
  const today = new Date('2026-02-19');
  const todaySchedules = schedules.filter(schedule => {
    const scheduleDate = new Date(schedule.date);
    return scheduleDate.toDateString() === today.toDateString();
  });

  // Mock data for charts
  const progressData = [
    { week: 'Week 1', score: 45, target: 40 },
    { week: 'Week 2', score: 52, target: 50 },
    { week: 'Week 3', score: 58, target: 55 },
    { week: 'Week 4', score: 65, target: 60 },
    { week: 'Week 5', score: 72, target: 68 },
    { week: 'Week 6', score: 78, target: 75 },
  ];

  const skillsData = [
    { skill: 'Grammar', score: 75 },
    { skill: 'Vocabulary', score: 68 },
    { skill: 'Structure', score: 82 },
    { skill: 'Coherence', score: 70 },
    { skill: 'Creativity', score: 65 },
  ];

  const completionPercentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const averageScore = examScores.length > 0
    ? Math.round(
        examScores.reduce((acc, curr) => acc + curr.score, 0) /
          examScores.length
      )
    : 0;

  return (
    <div className="min-h-screen bg-background transition-colors">
      <Sidebar />
     
      <div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-foreground mb-2">Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {user?.username || 'Student'}! Track your progress and stay on schedule.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">February 2026</p>
                <p className="text-xs text-muted-foreground">Current Semester</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview Cards - Professional Glassy Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-slide-up">
          {/* Completion Rate - Light Blue */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group bg-gradient-to-br from-white to-blue-50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-100 dark:border-blue-800/50">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-400 to-blue-600 dark:from-blue-500 dark:to-blue-700 p-3 rounded-xl shadow-lg group-hover:shadow-blue-500/50 dark:group-hover:shadow-blue-600/50 transition-all duration-300">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <span className="text-blue-700 dark:text-blue-400 text-xs font-bold bg-blue-100/50 dark:bg-blue-900/50 px-3 py-1.5 rounded-full">+12%</span>
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-sm mb-1 font-semibold">Completion Rate</p>
              <div className="flex items-baseline gap-2">
                <p className="text-blue-900 dark:text-blue-100 text-4xl font-bold">{completionPercentage}</p>
                <span className="text-blue-600 dark:text-blue-400 text-lg">%</span>
              </div>
              <div className="mt-3 w-full bg-blue-100/50 dark:bg-blue-900/30 rounded-full h-1.5">
                <div 
                  className="bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-500 dark:to-blue-700 h-1.5 rounded-full transition-all duration-500 shadow-lg shadow-blue-500/50 dark:shadow-blue-600/50"
                  style={{ width: `${completionPercentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Exams Completed - Medium Blue */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700/50">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-800 p-3 rounded-xl shadow-lg group-hover:shadow-blue-600/50 dark:group-hover:shadow-blue-700/50 transition-all duration-300">
                  <Award className="w-6 h-6 text-white" />
                </div>
                <span className="text-blue-700 dark:text-blue-400 text-xs font-bold bg-blue-200/50 dark:bg-blue-900/50 px-3 py-1.5 rounded-full">+{examScores.length}</span>
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-sm mb-1 font-semibold">Exams Completed</p>
              <div className="flex items-baseline gap-2">
                <p className="text-blue-900 dark:text-blue-100 text-4xl font-bold">{examScores.length}</p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 font-semibold">
                <CheckCircle className="w-4 h-4" />
                <span>Great progress!</span>
              </div>
            </div>
          </div>

          {/* Average Score - Sky Blue */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700/50">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-800 p-3 rounded-xl shadow-lg group-hover:shadow-blue-600/50 dark:group-hover:shadow-blue-700/50 transition-all duration-300">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <span className="text-blue-700 dark:text-blue-400 text-xs font-bold bg-blue-200/50 dark:bg-blue-900/50 px-3 py-1.5 rounded-full">+8pts</span>
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-sm mb-1 font-semibold">Average Score</p>
              <div className="flex items-baseline gap-2">
                <p className="text-blue-900 dark:text-blue-100 text-4xl font-bold">{averageScore}</p>
                <span className="text-blue-600 dark:text-blue-400 text-lg">%</span>
              </div>
              <div className="mt-3 w-full bg-blue-100/50 dark:bg-blue-900/30 rounded-full h-1.5">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-800 h-1.5 rounded-full transition-all duration-500 shadow-lg shadow-blue-600/50 dark:shadow-blue-700/50"
                  style={{ width: `${averageScore}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Study Streak - Deep Blue */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-300 dark:border-blue-700/50">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-700 dark:to-blue-900 p-3 rounded-xl shadow-lg group-hover:shadow-blue-700/50 dark:group-hover:shadow-blue-800/50 transition-all duration-300">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <span className="text-blue-700 dark:text-blue-400 text-xs font-bold bg-blue-200/50 dark:bg-blue-900/50 px-3 py-1.5 rounded-full">🔥</span>
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-sm mb-1 font-semibold">Study Streak</p>
              <div className="flex items-baseline gap-2">
                <p className="text-blue-900 dark:text-blue-100 text-4xl font-bold">42</p>
                <span className="text-blue-600 dark:text-blue-400 text-lg">days</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 font-semibold">
                <Zap className="w-4 h-4" />
                <span>Keep it up!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Column - Charts (Takes 2 columns) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Weekly Progress Chart */}
            <div className="ios-card card-elevated p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-foreground mb-1">Weekly Progress</h2>
                  <p className="text-muted-foreground text-sm">Your performance over time</p>
                </div>
                <div className="p-2 bg-primary/10 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={progressData}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="week"
                    stroke="var(--muted-foreground)"
                    style={{ fontSize: '12px' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    style={{ fontSize: '12px' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      color: 'var(--foreground)',
                      boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.2)'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    fill="url(#colorScore)"
                    dot={{ fill: 'var(--primary)', r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
                    activeDot={{ r: 7 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="var(--muted-foreground)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Skills Breakdown Chart */}
            <div className="ios-card card-elevated p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-foreground mb-1">Skills Breakdown</h2>
                  <p className="text-muted-foreground text-sm">Your strengths across areas</p>
                </div>
                <div className="p-2 bg-accent/10 rounded-xl">
                  <Award className="w-5 h-5 text-accent" />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={skillsData}>
                  <defs>
                    <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="var(--accent)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="skill"
                    stroke="var(--muted-foreground)"
                    style={{ fontSize: '12px' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    style={{ fontSize: '12px' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      color: 'var(--foreground)',
                      boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
                      fontWeight: '500'
                    }}
                    labelStyle={{
                      color: 'var(--foreground)',
                      fontWeight: '600',
                      marginBottom: '4px'
                    }}
                    itemStyle={{
                      color: 'var(--primary)',
                      fontWeight: '600'
                    }}
                  />
                  <Bar
                    dataKey="score"
                    fill="url(#colorBar)"
                    radius={[12, 12, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right Column - Calendar & Agenda */}
          <div className="space-y-6">
            {/* Calendar Widget */}
            <div className="ios-card card-elevated p-6">
              <CalendarComponent schedules={schedules} />
            </div>

            {/* Agenda Section */}
            <div className="ios-card card-elevated p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Agenda</h3>
                <a href="/plan" className="text-xs text-primary hover:text-accent transition-colors font-medium">
                  View All
                </a>
              </div>
              
              <div className="space-y-3">
                {todaySchedules.length > 0 ? (
                  todaySchedules.map((schedule) => (
                    <div 
                      key={schedule.id}
                      className={`p-4 rounded-xl border-l-4 ${schedule.color} transition-all hover:shadow-md cursor-pointer`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-lg bg-white/50 dark:bg-black/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground font-medium mb-1">{schedule.time}</p>
                          <h4 className="text-sm font-semibold text-foreground mb-1 truncate">{schedule.title}</h4>
                          <p className="text-xs text-muted-foreground">{schedule.grade}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Calendar className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No scheduled events today</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Exam Results Table */}
        <div className="ios-card card-elevated p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-foreground mb-1">Recent Exam Results</h2>
              <p className="text-muted-foreground text-sm">Your latest test performances</p>
            </div>
            <div className="p-2 bg-success/10 rounded-xl">
              <Award className="w-5 h-5 text-success" />
            </div>
          </div>
         
          {examScores.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-4 px-4 text-muted-foreground font-semibold text-sm uppercase tracking-wide">Date</th>
                    <th className="text-left py-4 px-4 text-muted-foreground font-semibold text-sm uppercase tracking-wide">Level</th>
                    <th className="text-left py-4 px-4 text-muted-foreground font-semibold text-sm uppercase tracking-wide">Score</th>
                    <th className="text-left py-4 px-4 text-muted-foreground font-semibold text-sm uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {examScores.map((exam, index) => (
                    <tr
                      key={index}
                      className="border-b border-border/50 hover:bg-muted/30 transition-all duration-200 group cursor-pointer"
                    >
                      <td className="py-4 px-4 text-foreground font-medium group-hover:text-primary transition-colors">{exam.date}</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center bg-primary/10 text-primary px-4 py-2 rounded-xl font-semibold shadow-sm">
                          {exam.level}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <span className="text-foreground font-bold text-xl">{exam.score}%</span>
                          <div className="w-16 bg-muted/50 rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full transition-all duration-500 ${
                                exam.score >= 70 ? 'bg-gradient-to-r from-gray-700 to-gray-900' : 'bg-gradient-to-r from-gray-500 to-gray-700'
                              }`}
                              style={{ width: `${exam.score}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold shadow-sm ${
                          exam.score >= 70
                            ? 'badge-success'
                            : 'badge-warning'
                        }`}>
                          {exam.score >= 70 ? '✓ Passed' : '○ In Progress'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-muted to-muted/50 rounded-3xl mb-6 shadow-lg">
                <Award className="w-12 h-12 text-muted-foreground" />
              </div>
              <p className="text-foreground text-xl font-semibold mb-2">No exam results yet</p>
              <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">Take your first exam to see your progress and track your learning journey!</p>
              <a
                href="/exam"
                className="inline-flex items-center gap-2 gradient-primary text-white px-8 py-4 rounded-2xl hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 font-semibold group"
              >
                Take Your First Exam
                <TrendingUp className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}