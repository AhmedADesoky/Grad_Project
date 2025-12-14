// src/components/MainPage.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Award, TrendingUp, Sparkles } from 'lucide-react';

const cefrLevels = [
	{
		level: 'A1',
		name: 'Beginner',
		description:
			'Can understand and use familiar everyday expressions and very basic phrases.',
		gradient: 'from-purple-400 to-purple-600',
		bgColor: 'bg-purple-50 dark:bg-purple-950/20',
		borderColor: 'border-purple-300 dark:border-purple-800/50',
		textColor: 'text-purple-700 dark:text-purple-300',
	},
	{
		level: 'A2',
		name: 'Elementary',
		description:
			'Can communicate in simple tasks requiring direct exchange of information.',
		gradient: 'from-violet-400 to-violet-600',
		bgColor: 'bg-violet-50 dark:bg-violet-950/20',
		borderColor: 'border-violet-300 dark:border-violet-800/50',
		textColor: 'text-violet-700 dark:text-violet-300',
	},
	{
		level: 'B1',
		name: 'Intermediate',
		description:
			'Can deal with most situations while traveling and produce simple connected text.',
		gradient: 'from-indigo-400 to-indigo-600',
		bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
		borderColor: 'border-indigo-300 dark:border-indigo-800/50',
		textColor: 'text-indigo-700 dark:text-indigo-300',
	},
	{
		level: 'B2',
		name: 'Upper Intermediate',
		description:
			'Can interact with fluency and spontaneity and produce detailed text.',
		gradient: 'from-blue-400 to-blue-600',
		bgColor: 'bg-blue-50 dark:bg-blue-950/20',
		borderColor: 'border-blue-300 dark:border-blue-800/50',
		textColor: 'text-blue-700 dark:text-blue-300',
	},
	{
		level: 'C1',
		name: 'Advanced',
		description:
			'Can express ideas fluently and produce clear, well-structured, detailed text.',
		gradient: 'from-cyan-400 to-cyan-600',
		bgColor: 'bg-cyan-50 dark:bg-cyan-950/20',
		borderColor: 'border-cyan-300 dark:border-cyan-800/50',
		textColor: 'text-cyan-700 dark:text-cyan-300',
	},
	{
		level: 'C2',
		name: 'Proficient',
		description:
			'Can understand virtually everything and express themselves spontaneously.',
		gradient: 'from-teal-400 to-teal-600',
		bgColor: 'bg-teal-50 dark:bg-teal-950/20',
		borderColor: 'border-teal-300 dark:border-teal-800/50',
		textColor: 'text-teal-700 dark:text-teal-300',
	},
];

export function MainPage() {
	const { user } = useAuth();

	return (
		<div className="min-h-screen bg-background transition-colors">
			<Sidebar />

			<div className="ml-64">
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
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
						<div className="ios-card p-6 group">
							<div className="flex items-center gap-4">
								<div className="gradient-primary p-4 rounded-2xl shadow-lg group-hover:shadow-glow dark:group-hover:shadow-glow-dark transition-all duration-300">
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
						</div>

						<div className="ios-card p-6 group">
							<div className="flex items-center gap-4">
								<div className="bg-gradient-to-br from-success to-emerald-600 p-4 rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300">
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
						</div>

						<div className="ios-card p-6 group">
							<div className="flex items-center gap-4">
								<div className="bg-gradient-to-br from-accent to-secondary p-4 rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300">
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
						</div>
					</div>

					{/* CEFR Levels Section */}
					<div className="ios-card p-8 mb-8">
						<div className="mb-8">
							<h2 className="text-foreground mb-3">
								CEFR Classification Levels
							</h2>
							<p className="text-muted-foreground text-lg">
								Common European Framework of Reference for Languages
							</p>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							{cefrLevels.map((level, index) => (
								<div
									key={level.level}
									className={`group ${level.bgColor} border-2 ${level.borderColor} rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer`}
									style={{ animationDelay: `${index * 100}ms` }}
								>
									<div className="flex items-center gap-4 mb-4">
										<div
											className={`bg-gradient-to-br ${level.gradient} text-white w-14 h-14 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow font-bold text-lg`}
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
										className={`${level.textColor} text-sm leading-relaxed`}
									>
										{level.description}
									</p>
								</div>
							))}
						</div>
					</div>

					{/* Call to Action */}
					<div className="gradient-primary rounded-3xl p-10 text-center shadow-2xl shadow-primary/30 relative overflow-hidden">
						<div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
						<div className="relative z-10">
							<h3 className="text-white mb-4 text-2xl">
								Ready to Level Up?
							</h3>
							<p className="text-white/90 mb-8 max-w-2xl mx-auto text-lg">
								Take an exam to assess your current level or continue with your
								personalized learning plan
							</p>
							<div className="flex gap-4 justify-center flex-wrap">
								<a
									href="/exam"
									className="bg-white text-primary px-8 py-4 rounded-2xl hover:bg-gray-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 font-semibold"
								>
									Take an Exam
								</a>
								<a
									href="/plan"
									className="bg-white/20 backdrop-blur-sm text-white border-2 border-white/30 px-8 py-4 rounded-2xl hover:bg-white/30 transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 font-semibold"
								>
									View My Plan
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}