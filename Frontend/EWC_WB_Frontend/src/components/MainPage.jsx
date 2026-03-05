// src/components/MainPage.jsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { BookOpen, Award, TrendingUp, Sparkles, BarChart3, ArrowRight, CheckCircle, Clock, Target, Calendar, ChevronLeft, ChevronRight, Heart, Play } from 'lucide-react';

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
import { Link } from 'react-router-dom';


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
					<div className="ios-card p-5 flex items-center gap-4 rounded-3xl group relative overflow-hidden">
						<div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full">
							<Award className="w-6 h-6 text-blue-600 dark:text-blue-400" />
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

					<div className="ios-card p-5 flex items-center gap-4 rounded-3xl group relative overflow-hidden">
						<div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full">
							<TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
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

					<div className="ios-card p-5 flex items-center gap-4 rounded-3xl group relative overflow-hidden">
						<div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full">
							<BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
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
										<span className="inline-flex font-bold items-center px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] tracking-wider text-center w-fit mb-3">
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
				</div>
			</div>
		</div>
	);
}