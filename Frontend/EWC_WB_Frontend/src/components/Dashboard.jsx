// src/components/Dashboard.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Award, Target, Calendar, Activity, Zap } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';

export function Dashboard() {
  const { user } = useAuth();

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

  const completionPercentage = user?.progress.completed && user?.progress.total
    ? Math.round((user.progress.completed / user.progress.total) * 100)
    : 0;

  const averageScore = user?.examScores.length
    ? Math.round(
        user.examScores.reduce((acc, curr) => acc + curr.score, 0) /
          user.examScores.length
      )
    : 0;

  return (
    <div className="min-h-screen bg-background transition-colors">
      <Sidebar />
     
      <div className="ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Activity className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-foreground">Your Progress Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-lg">Track your learning journey and achievements</p>
        </div>

        {/* Stats Overview Cards - iOS Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Completion Rate */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-info/20 to-transparent rounded-full blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-info to-blue-600 p-3 rounded-2xl shadow-lg">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <span className="text-info text-xs font-bold bg-info/10 px-3 py-1.5 rounded-full">+12%</span>
              </div>
              <p className="text-muted-foreground text-sm mb-1 font-medium">Completion Rate</p>
              <div className="flex items-baseline gap-2">
                <p className="text-foreground text-4xl font-bold">{completionPercentage}</p>
                <span className="text-muted-foreground text-lg">%</span>
              </div>
            </div>
          </div>

          {/* Exams Completed */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-success/20 to-transparent rounded-full blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-success to-emerald-600 p-3 rounded-2xl shadow-lg">
                  <Award className="w-6 h-6 text-white" />
                </div>
                <span className="text-success text-xs font-bold bg-success/10 px-3 py-1.5 rounded-full">+5</span>
              </div>
              <p className="text-muted-foreground text-sm mb-1 font-medium">Exams Completed</p>
              <div className="flex items-baseline gap-2">
                <p className="text-foreground text-4xl font-bold">{user?.examScores.length || 0}</p>
              </div>
            </div>
          </div>

          {/* Average Score */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="gradient-primary p-3 rounded-2xl shadow-lg">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <span className="text-primary text-xs font-bold bg-primary/10 px-3 py-1.5 rounded-full">+8pts</span>
              </div>
              <p className="text-muted-foreground text-sm mb-1 font-medium">Average Score</p>
              <div className="flex items-baseline gap-2">
                <p className="text-foreground text-4xl font-bold">{averageScore}</p>
                <span className="text-muted-foreground text-lg">%</span>
              </div>
            </div>
          </div>

          {/* Study Streak */}
          <div className="ios-card ios-card-hover p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-warning/20 to-transparent rounded-full blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-warning to-orange-600 p-3 rounded-2xl shadow-lg">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <span className="text-warning text-xs font-bold bg-warning/10 px-3 py-1.5 rounded-full">🔥</span>
              </div>
              <p className="text-muted-foreground text-sm mb-1 font-medium">Study Streak</p>
              <div className="flex items-baseline gap-2">
                <p className="text-foreground text-4xl font-bold">42</p>
                <span className="text-muted-foreground text-lg">days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Weekly Progress Chart */}
          <div className="ios-card p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-foreground mb-1">Weekly Progress</h2>
                <p className="text-muted-foreground text-sm">Your performance over time</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-xl">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
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
                    backgroundColor: 'var(--card)',
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
          <div className="ios-card p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-foreground mb-1">Skills Breakdown</h2>
                <p className="text-muted-foreground text-sm">Your strengths across areas</p>
              </div>
              <div className="p-2 bg-accent/10 rounded-xl">
                <Award className="w-5 h-5 text-accent" />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
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
                    borderRadius: '16px',
                    color: 'var(--foreground)',
                    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.2)'
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

        {/* Recent Exam Results Table */}
        <div className="ios-card p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-foreground mb-1">Recent Exam Results</h2>
              <p className="text-muted-foreground text-sm">Your latest test performances</p>
            </div>
            <div className="p-2 bg-success/10 rounded-xl">
              <Award className="w-5 h-5 text-success" />
            </div>
          </div>
         
          {user?.examScores && user.examScores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 text-muted-foreground font-medium text-sm">Date</th>
                    <th className="text-left py-4 px-4 text-muted-foreground font-medium text-sm">Level</th>
                    <th className="text-left py-4 px-4 text-muted-foreground font-medium text-sm">Score</th>
                    <th className="text-left py-4 px-4 text-muted-foreground font-medium text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {user.examScores.map((exam, index) => (
                    <tr
                      key={index}
                      className="border-b border-border hover:bg-muted/30 transition-colors group"
                    >
                      <td className="py-4 px-4 text-muted-foreground">{exam.date}</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center bg-primary/10 text-primary px-4 py-1.5 rounded-xl font-medium">
                          {exam.level}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-foreground font-semibold text-lg">{exam.score}%</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-4 py-1.5 rounded-xl text-sm font-medium ${
                          exam.score >= 70
                            ? 'bg-success/10 text-success'
                            : 'bg-warning/10 text-warning'
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
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-muted/50 rounded-3xl mb-4">
                <Award className="w-10 h-10 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg mb-2">No exam results yet</p>
              <p className="text-muted-foreground/70 text-sm mb-6">Take your first exam to see your progress here!</p>
              <a
                href="/exam"
                className="inline-flex gradient-primary text-white px-6 py-3 rounded-2xl hover:shadow-lg transition-all duration-300"
              >
                Take Your First Exam
              </a>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}