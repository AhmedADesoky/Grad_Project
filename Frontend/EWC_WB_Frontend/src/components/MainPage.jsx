// src/components/MainPage.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { BookOpen, Award, TrendingUp, Sparkles, BarChart3, ArrowRight, CheckCircle, Clock, Target, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';

const cefrLevels = [
	{
		level: 'A1',
		name: 'Beginner',
		description:
			'Can understand and use familiar everyday expressions and very basic phrases.',
		gradient: 'from-white to-blue-100',
		bgColor: 'bg-blue-50/50 dark:bg-blue-950/30',
		borderColor: 'border-blue-200 dark:border-blue-700/50',
		textColor: 'text-gray-800 dark:text-gray-100',
	},
	{
		level: 'A2',
		name: 'Elementary',
		description:
			'Can communicate in simple tasks requiring direct exchange of information.',
		gradient: 'from-blue-50 to-blue-200',
		bgColor: 'bg-blue-100/50 dark:bg-blue-900/30',
		borderColor: 'border-blue-300 dark:border-blue-600/50',
		textColor: 'text-gray-800 dark:text-gray-100',
	},
	{
		level: 'B1',
		name: 'Intermediate',
		description:
			'Can deal with most situations while traveling and produce simple connected text.',
		gradient: 'from-blue-100 to-blue-300',
		bgColor: 'bg-blue-100/50 dark:bg-blue-900/30',
		borderColor: 'border-blue-300 dark:border-blue-600/50',
		textColor: 'text-gray-800 dark:text-gray-100',
	},
	{
		level: 'B2',
		name: 'Upper Intermediate',
		description:
			'Can interact with fluency and spontaneity and produce detailed text.',
		gradient: 'from-blue-200 to-blue-400',
		bgColor: 'bg-blue-50/50 dark:bg-blue-950/30',
		borderColor: 'border-blue-200 dark:border-blue-700/50',
		textColor: 'text-gray-800 dark:text-gray-100',
	},
	{
		level: 'C1',
		name: 'Advanced',
		description:
			'Can express ideas fluently and produce clear, well-structured, detailed text.',
		gradient: 'from-blue-300 to-blue-500',
		bgColor: 'bg-blue-50/50 dark:bg-blue-950/30',
		borderColor: 'border-blue-200 dark:border-blue-700/50',
		textColor: 'text-gray-800 dark:text-gray-100',
	},
	{
		level: 'C2',
		name: 'Proficient',
		description:
			'Can understand virtually everything and express themselves spontaneously.',
		gradient: 'from-blue-400 to-blue-600',
		bgColor: 'bg-blue-50/50 dark:bg-blue-950/30',
		borderColor: 'border-blue-200 dark:border-blue-700/50',
		textColor: 'text-gray-800 dark:text-gray-100',
	},
];

export function MainPage() {
	const { user } = useAuth();
	const { isCollapsed } = useSidebar();

	return (
		<div className="min-h-screen bg-background transition-colors">
			<Sidebar />

			<div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
					{/* Hero Section */}
					<div className="mb-10 animate-fade-in">
						<div className="flex items-center gap-3 mb-4">
							<div className="p-2 bg-primary/10 rounded-xl">
								<Sparkles className="w-7 h-7 text-primary" />
							</div>
							<h1 className="text-foreground">
								Welcome back, {user?.username}!{' '}
							</h1>
						</div>
						<p className="text-muted-foreground text-lg">
							Continue your English writing journey with personalized AI coaching
						</p>
					</div>

					{/* Stats Cards - iOS Style */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-slide-up">
						<div className="ios-card ios-card-hover p-6 group relative overflow-hidden">
							<div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl transition-all duration-300 group-hover:scale-150"></div>
							<div className="flex items-center gap-4 relative z-10">
								<div className="gradient-primary p-4 rounded-xl shadow-lg group-hover:shadow-glow transition-all duration-300 group-hover:scale-110">
									<Award className="w-8 h-8 text-white" />
								</div>
								<div>
									<p className="text-muted-foreground text-sm mb-1 font-medium">
										Current Level
									</p>
									<p className="text-foreground text-3xl font-semibold">
										{user?.level}
									</p>
								</div>
							</div>
							<div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
								<TrendingUp className="w-4 h-4" />
								<span>Making progress</span>
							</div>
						</div>

						<div className="ios-card ios-card-hover p-6 group relative overflow-hidden">
				<div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl transition-all duration-300 group-hover:scale-150"></div>
				<div className="flex items-center gap-4 relative z-10">
					<div className="bg-gradient-to-br from-blue-500 to-blue-700 p-4 rounded-xl shadow-lg group-hover:shadow-glow transition-all duration-300 group-hover:scale-110">
						<TrendingUp className="w-8 h-8 text-white" />
					</div>
					<div>
						<p className="text-muted-foreground text-sm mb-1 font-medium">
							Progress
						</p>
						<p className="text-foreground text-3xl font-semibold">
							{user?.progress.completed}/{user?.progress.total}
						</p>
					</div>
				</div>
				<div className="mt-4 w-full bg-muted/50 rounded-full h-2">
					<div 
						className="bg-gradient-to-r from-blue-500 to-blue-700 h-2 rounded-full transition-all duration-500"
								></div>
							</div>
						</div>

						<div className="ios-card ios-card-hover p-6 group relative overflow-hidden">
						<div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl transition-all duration-300 group-hover:scale-150"></div>
						<div className="flex items-center gap-4 relative z-10">
							<div className="bg-gradient-to-br from-blue-400 to-blue-600 p-4 rounded-xl shadow-lg group-hover:shadow-glow transition-all duration-300 group-hover:scale-110">
									<BookOpen className="w-8 h-8 text-white" />
								</div>
								<div>
									<p className="text-muted-foreground text-sm mb-1 font-medium">
										Total Exams
									</p>
									<p className="text-foreground text-3xl font-semibold">
										{user?.examScores.length || 0}
									</p>
								</div>
							</div>
						<div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
								<Award className="w-4 h-4" />
								<span>{user?.examScores.length > 0 ? 'Keep it up!' : 'Start today'}</span>
							</div>
						</div>
					</div>

					{/* Dashboard Shortcut */}
				<div className="ios-card card-elevated p-5 mb-6 group hover:shadow-xl transition-all duration-300 relative overflow-hidden">
					<div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
					<div className="flex items-center justify-between mb-4 relative z-10">
						<div className="flex items-center gap-3">
							<div className="gradient-primary p-2 rounded-xl shadow-lg">
								<BarChart3 className="w-5 h-5 text-white" />
							</div>
							<div>
								<h2 className="text-foreground text-2xl font-semibold">Your Dashboard</h2>
								<p className="text-muted-foreground">Track your progress and performance</p>
							</div>
						</div>
						<Link 
							to="/dashboard"
							className="flex items-center justify-center gradient-primary text-white p-3 rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 group/btn hover:scale-105"
							title="View Full Dashboard"
						>
							<ArrowRight className="w-6 h-6 group-hover/btn:translate-x-1 transition-transform" />
					</Link>
				</div>

				{/* Dashboard Preview Grid */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							{/* Quick Stats */}
				<div className="bg-gradient-to-br from-blue-50/50 to-blue-100/30 border border-blue-200/50 dark:border-blue-800/50 rounded-xl p-4">
					<div className="flex items-center gap-2 mb-3">
						<div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2 rounded-lg">
							<Target className="w-4 h-4 text-white" />
								</div>
							<h3 className="text-foreground font-semibold text-sm">Tasks Progress</h3>
						</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-xs">Completed</span>
								<span className="text-foreground font-bold text-lg">{user?.progress.completed || 0}</span>
									</div>
								<div className="w-full bg-muted/50 rounded-full h-2">
									<div 
										className="bg-gradient-to-r from-blue-500 to-blue-700 h-2 rounded-full transition-all duration-500"
											style={{ width: `${user?.progress.completed && user?.progress.total ? (user.progress.completed / user.progress.total) * 100 : 0}%` }}
										></div>
									</div>
									<p className="text-xs text-muted-foreground">
										{user?.progress.total - (user?.progress.completed || 0)} tasks remaining
									</p>
								</div>
							</div>

							{/* Recent Activity */}
				<div className="bg-gradient-to-br from-blue-100/50 to-blue-200/30 border border-blue-300/50 dark:border-blue-700/50 rounded-xl p-4">
					<div className="flex items-center gap-2 mb-3">
						<div className="bg-gradient-to-br from-blue-600 to-blue-800 p-2 rounded-lg">
							<Clock className="w-4 h-4 text-white" />
								</div>
							<h3 className="text-foreground font-semibold text-sm">Recent Exams</h3>
						</div>
							<div className="space-y-2">
									{user?.examScores && user.examScores.length > 0 ? (
										<>
											<div className="flex items-center justify-between">
											<span className="text-muted-foreground text-xs">Latest Score</span>
										<span className="text-foreground font-bold text-lg">
													{user.examScores[user.examScores.length - 1]?.score || 0}%
												</span>
											</div>
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
												<span>{user.examScores.length} exams completed</span>
											</div>
										</>
									) : (
										<div className="text-center py-4">
											<p className="text-muted-foreground text-sm mb-2">No exams yet</p>
											<Link 
												to="/exam"
												className="text-primary hover:text-primary/80 text-sm font-medium"
											>
												Take your first exam →
											</Link>
										</div>
									)}
								</div>
							</div>

							{/* Performance Chart Preview */}
				<div className="bg-gradient-to-br from-blue-100/50 to-blue-200/30 border border-blue-300/50 dark:border-blue-700/50 rounded-xl p-4">
					<div className="flex items-center gap-2 mb-3">
						<div className="bg-gradient-to-br from-blue-600 to-blue-800 p-2 rounded-lg">
								<TrendingUp className="w-4 h-4 text-white" />
									</div>
							<h3 className="text-foreground font-semibold text-sm">Average Score</h3>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-xs">Overall</span>
								<span className="text-foreground font-bold text-lg">
											{user?.examScores?.length 
												? Math.round(user.examScores.reduce((acc, curr) => acc + curr.score, 0) / user.examScores.length)
												: 0}%
										</span>
									</div>
								<div className="relative">
								<div className="flex items-center justify-center h-10">
									<div className="relative">
										<svg className="w-12 h-12 transform -rotate-90">
													<circle
													cx="24"
													cy="24"
													r="18"
													stroke="currentColor"
													strokeWidth="4"
													fill="transparent"
													className="text-muted/30"
												/>
												<circle
													cx="24"
													cy="24"
													r="18"
													stroke="url(#gradient)"
													strokeWidth="4"
														fill="transparent"
														strokeDasharray={`${(user?.examScores?.length 
															? (user.examScores.reduce((acc, curr) => acc + curr.score, 0) / user.examScores.length) 
													: 0) * 1.13} 113.1`}
														className="transition-all duration-500"
													/>
													<defs>
														<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
														<stop offset="0%" stopColor="#4B5563" />
														<stop offset="100%" stopColor="#1F2937" />
														</linearGradient>
													</defs>
												</svg>
											</div>
										</div>
									</div>
									<p className="text-xs text-muted-foreground text-center">
										Based on {user?.examScores?.length || 0} exam{user?.examScores?.length !== 1 ? 's' : ''}
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* CEFR Levels Section */}
					<div className="ios-card card-elevated p-8 mb-8">
						<div className="mb-8">
							<h2 className="text-foreground mb-3">
								CEFR Classification Levels
							</h2>
							<p className="text-muted-foreground text-lg text-balance">
								Common European Framework of Reference for Languages
							</p>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							{cefrLevels.map((level, index) => (
								<div
									key={level.level}
									className={`group ${level.bgColor} border-2 ${level.borderColor} rounded-2xl p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-pointer relative overflow-hidden`}
									style={{ animationDelay: `${index * 100}ms` }}
								>
									<div className="absolute top-0 right-0 w-24 h-24 opacity-20 blur-2xl rounded-full transition-all duration-300 group-hover:scale-150"
										style={{ background: `linear-gradient(135deg, ${level.gradient.replace('from-', '').replace(' to-', ', ')})` }}
									></div>
									<div className="flex items-center gap-4 mb-4 relative z-10">
										<div
											className={`bg-gradient-to-br ${level.gradient} text-white w-14 h-14 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-2xl group-hover:scale-110 transition-all font-bold text-lg`}
										>
											{level.level}
										</div>
										<div>
											<span
												className={`${level.textColor} font-semibold text-lg`}
											>
												{level.name}
											</span>
										</div>
									</div>
									<p
										className={`${level.textColor} text-sm leading-relaxed relative z-10`}
									>
										{level.description}
									</p>
									<div className="mt-4 pt-4 border-t border-current/10">
										<button className={`text-xs ${level.textColor} font-medium hover:underline`}>
											Learn more →
										</button>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Call to Action */}
					<div className="gradient-primary rounded-3xl p-10 text-center shadow-2xl shadow-primary/30 relative overflow-hidden group">
						<div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
						<div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-3xl animate-float"></div>
						<div className="absolute bottom-10 right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
						<div className="relative z-10">
							<div className="inline-block p-4 bg-white/20 rounded-2xl mb-6 backdrop-blur-sm">
								<Sparkles className="w-12 h-12 text-white animate-pulse" />
							</div>
							<h3 className="text-white mb-4 text-2xl font-bold">
								Ready to Level Up?
							</h3>
							<p className="text-white/90 mb-8 max-w-2xl mx-auto text-lg">
								Take an exam to assess your current level or continue with your
								personalized learning plan
							</p>
							<div className="flex gap-4 justify-center flex-wrap">
								<a
									href="/exam"
									className="bg-white text-primary px-8 py-4 rounded-2xl hover:bg-gray-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 font-semibold inline-flex items-center gap-2 group/btn"
								>
									Take an Exam
									<ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
								</a>
								<a
									href="/plan"
									className="bg-white/20 backdrop-blur-sm text-white border-2 border-white/30 px-8 py-4 rounded-2xl hover:bg-white/30 transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 font-semibold inline-flex items-center gap-2"
								>
									View My Plan
									<Calendar className="w-5 h-5" />
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}