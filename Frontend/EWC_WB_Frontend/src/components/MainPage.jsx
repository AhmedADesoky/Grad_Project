// src/components/MainPage.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { BookOpen, Award, TrendingUp, Sparkles, BarChart3, ArrowRight, CheckCircle, Clock, Target, Calendar, ChevronLeft, ChevronRight, Heart, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

const recommendedCourses = [
	{
		id: 1,
		badge: 'ENGLISH',
		title: "Beginner's Guide To Becoming A Professional English Speaker",
		platform: 'Coursera',
		image: 'https://images.unsplash.com/photo-1546410531-bea5aaaa4cb6?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
	},
	{
		id: 2,
		badge: 'GRAMMAR',
		title: 'How To Master English Grammar: Step-by-Step Guide',
		platform: 'Udemy',
		image: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
	},
	{
		id: 3,
		badge: 'COMMUNICATION',
		title: 'Learn Effective Communication Skills With Us!',
		platform: 'edX',
		image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
	}
];

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


export function MainPage() {
	const { user } = useAuth();
	const { isCollapsed } = useSidebar();

	return (
		<div className="min-h-screen bg-background transition-colors">
			<Sidebar />

			<Navbar />
			<div className={`transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pt-24">
					{/* Hero Section */}
					<div className="mb-10 pt-4 pb-2 animate-fade-in px-4 md:px-6">
						<h1 className="text-foreground text-4xl font-bold mb-4">
							Welcome back, {user?.username}!{' '}
						</h1>
						<p className="text-muted-foreground text-lg">
							Continue your English writing journey with personalized AI coaching
						</p>
					</div>

					{/* Promotional Banner */}
					<div className="bg-[#3b82f6] rounded-3xl p-8 md:p-12 mb-12 relative overflow-hidden flex items-center justify-between">
						{/* Background decorative elements */}
						<div className="absolute top-0 right-0 w-full h-full pointer-events-none opacity-20">
							<div className="absolute right-32 top-10 w-32 h-32 bg-white rounded-full blur-[80px]"></div>
							<div className="absolute right-10 bottom-10 w-40 h-40 bg-white rounded-full blur-[100px]"></div>
							{/* Simple Star Shapes using SVG */}
							<svg className="absolute right-10 top-5 w-24 h-24 text-white" viewBox="0 0 100 100" fill="currentColor">
								<path d="M50 0 C50 40 60 50 100 50 C60 50 50 60 50 100 C50 60 40 50 0 50 C40 50 50 40 50 0 Z" />
							</svg>
							<svg className="absolute right-40 bottom-10 w-32 h-32 text-white" viewBox="0 0 100 100" fill="currentColor">
								<path d="M50 0 C50 40 60 50 100 50 C60 50 50 60 50 100 C50 60 40 50 0 50 C40 50 50 40 50 0 Z" />
							</svg>
							<svg className="absolute right-64 top-20 w-16 h-16 text-white" viewBox="0 0 100 100" fill="currentColor">
								<path d="M40 0 C40 30 50 40 80 40 C50 40 40 50 40 80 C40 50 30 40 0 40 C30 40 40 30 40 0 Z" />
							</svg>
						</div>

						{/* Content */}
						<div className="relative z-10 max-w-2xl text-left">
							<p className="text-white/80 text-sm font-semibold tracking-wider mb-3 uppercase">Online Course</p>
							<h2 className="text-white text-3xl md:text-3xl lg:text-4xl font-semibold mb-6 leading-snug">
								Sharpen Your Skills With<br />Professional Online Courses
							</h2>
							<button className="bg-[#1e1e1e] hover:bg-black transition-colors text-white text-sm font-medium py-3 px-6 rounded-full flex items-center gap-3 w-fit">
								Join Now
								<div className="bg-white rounded-full p-1 w-6 h-6 flex items-center justify-center">
									<Play className="w-3 h-3 text-black ml-0.5" fill="currentColor" />
								</div>
							</button>
						</div>
					</div>

					{/* Stats Cards - iOS Style */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-slide-up">
					<div className="ios-card p-5 flex items-center gap-4 rounded-3xl relative overflow-hidden">
						<div className="p-4 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
							<Award className="w-6 h-6 text-primary" />
							</div>
							<div className="flex flex-col">
								<p className="text-muted-foreground text-sm font-medium mb-0.5">
									Current Level
								</p>
								<p className="text-foreground text-xl font-bold">
									{user?.level}
								</p>
							</div>
						</div>

					<div className="ios-card p-5 flex items-center gap-4 rounded-3xl relative overflow-hidden">
						<div className="p-4 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
							<TrendingUp className="w-6 h-6 text-primary" />
							</div>
							<div className="flex flex-col">
								<p className="text-muted-foreground text-sm font-medium mb-0.5">
									Progress
								</p>
								<p className="text-foreground text-xl font-bold">
									{user?.progress.completed}/{user?.progress.total}
								</p>
							</div>
						</div>

					<div className="ios-card p-5 flex items-center gap-4 rounded-3xl relative overflow-hidden">
						<div className="p-4 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
							<BookOpen className="w-6 h-6 text-primary" />
							</div>
							<div className="flex flex-col">
								<p className="text-muted-foreground text-sm font-medium mb-0.5">
									Total Exams
								</p>
								<p className="text-foreground text-xl font-bold">
									{user?.examScores.length || 0}
								</p>
							</div>
						</div>
					</div>



					{/* Recommended Courses Section */}
					<div className="mb-12">
						<div className="flex items-center justify-between mb-6">
							<h2 className="text-2xl font-bold text-foreground">Recommended Courses</h2>
							<div className="flex items-center gap-3">
								<button className="p-2 rounded-full border border-muted-foreground/20 hover:bg-muted text-muted-foreground transition-colors">
									<ChevronLeft className="w-5 h-5" />
								</button>
								<button className="p-2 rounded-full border border-muted-foreground/20 hover:bg-muted text-muted-foreground transition-colors">
									<ChevronRight className="w-5 h-5" />
								</button>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							{recommendedCourses.map((course) => (
						<div key={course.id} className="ios-card rounded-3xl p-4 flex flex-col h-full">
									<div className="relative rounded-2xl overflow-hidden mb-4 aspect-[16/9]">
										<img src={course.image} alt={course.title} className="w-full h-full object-cover" />
									</div>

									<div className="flex flex-col flex-grow text-left">
										<span className="inline-flex font-bold items-center px-3 py-1 rounded-full text-primary text-[10px] tracking-wider text-center w-fit mb-3" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
											{course.badge}
										</span>
										<h3 className="font-semibold text-lg text-foreground mb-4 leading-snug line-clamp-2">
											{course.title}
										</h3>

										<div className="mt-auto pt-4 flex items-center gap-3">
											<div className="w-8 h-8 rounded-full mt-3 overflow-hidden border border-gray-200 object-cover flex-shrink-0">
												<img
													src={`https://ui-avatars.com/api/?name=${course.platform}&background=random&color=fff`}
													alt={course.platform}
												/>
											</div>
											<div className="mt-3">
												<p className="text-sm font-semibold text-foreground">{course.platform}</p>
												<p className="text-xs text-muted-foreground">Course Platform</p>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>

				{/* Personalized Learning Plan Section */}
				<div className="mb-12">
					<div className="flex items-center gap-3 mb-6">
						<div className="p-2 bg-primary/10 rounded-xl">
							<Target className="w-7 h-7 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-bold text-foreground">Your Personalized Learning Plan</h2>
							<p className="text-muted-foreground text-sm">Customized for {user?.level || 'A1'} level - Stay on track with your daily goals</p>
						</div>
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
												className={`border-2 rounded-xl p-6 transition-all ${allCompleted
													? 'border-success/30 bg-success/5'
													: 'border-border bg-card/50'
													}`}
												style={{ animationDelay: `${dayIndex * 50}ms` }}
											>
												<div className="flex items-center justify-between mb-5">
													<div className="flex items-center gap-3">
														<div className={`w-12 h-12 rounded-xl flex items-center justify-center font-semibold ${allCompleted
															? 'gradient-primary text-white'
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
																<div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${task.completed
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


						</div>
					</div>
				</div>
			</div>
		</div>
	);
}