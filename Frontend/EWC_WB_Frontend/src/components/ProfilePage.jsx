// src/components/ProfilePage.jsx
import React, { useState, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Camera, Trash2, Save, Edit2, Award, BookOpen, TrendingUp, Target } from 'lucide-react';

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || ''
  });
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateProfile({ profileImage: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteImage = () => {
    updateProfile({ profileImage: undefined });
  };

  const handleSave = () => {
    updateProfile(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      username: user?.username || '',
      email: user?.email || ''
    });
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-background transition-colors">
      <Sidebar />
     
      <div className="ml-64">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="ios-card overflow-hidden animate-fade-in">
          {/* Header Gradient */}
          <div className="gradient-primary h-48 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)'
            }}></div>
          </div>
         
          <div className="px-8 pb-8">
            {/* Profile Image Section */}
            <div className="relative -mt-24 mb-8">
              <div className="relative inline-block">
                <div className="w-48 h-48 rounded-3xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-2xl">
                  {user?.profileImage ? (
                    <img
                      src={user.profileImage}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-24 h-24 text-muted-foreground" />
                  )}
                </div>
               
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="gradient-primary text-white p-3 rounded-2xl hover:shadow-xl hover:shadow-primary/50 transition-all duration-300"
                    title="Upload image"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                 
                  {user?.profileImage && (
                    <button
                      onClick={handleDeleteImage}
                      className="bg-destructive text-white p-3 rounded-2xl hover:shadow-xl transition-all duration-300"
                      title="Delete image"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
               
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Profile Form Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-foreground mb-2">Profile Settings</h1>
                  <p className="text-muted-foreground">Manage your account information</p>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 gradient-primary text-white px-6 py-3 rounded-2xl hover:shadow-xl hover:shadow-primary/50 transition-all duration-300 font-semibold"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Profile
                  </button>
                )}
              </div>

              <div className="space-y-6">
                {/* Username Field */}
                <div>
                  <label className="block text-card-foreground mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 rounded-lg">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">Username</span>
                    </div>
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground font-medium"
                    />
                  ) : (
                    <div className="px-5 py-4 bg-muted/50 rounded-2xl text-foreground font-medium border-2 border-transparent">
                      {user?.username}
                    </div>
                  )}
                </div>

                {/* Email Field */}
                <div>
                  <label className="block text-card-foreground mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 rounded-lg">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">Email</span>
                    </div>
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-5 py-4 bg-input-background border-2 border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground font-medium"
                    />
                  ) : (
                    <div className="px-5 py-4 bg-muted/50 rounded-2xl text-foreground font-medium border-2 border-transparent">
                      {user?.email}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {isEditing && (
                  <div className="flex gap-4">
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 gradient-primary text-white px-8 py-4 rounded-2xl hover:shadow-xl hover:shadow-primary/50 transition-all duration-300 font-semibold"
                    >
                      <Save className="w-5 h-5" />
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-8 py-4 border-2 border-border rounded-2xl text-foreground hover:bg-muted transition-all duration-300 font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Account Information Stats */}
            <div className="border-t-2 border-border pt-8">
              <h2 className="text-foreground mb-6">Account Statistics</h2>
             
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="ios-card-hover p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-2 border-primary/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-primary/10 rounded-xl">
                        <Award className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">Current Level</p>
                    </div>
                    <p className="text-foreground text-3xl font-bold">{user?.level}</p>
                  </div>
                </div>
               
                <div className="ios-card-hover p-6 bg-gradient-to-br from-success/5 to-emerald-500/5 border-2 border-success/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-success/10 rounded-xl">
                        <BookOpen className="w-6 h-6 text-success" />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">Total Exams</p>
                    </div>
                    <p className="text-foreground text-3xl font-bold">{user?.examScores.length || 0}</p>
                  </div>
                </div>
               
                <div className="ios-card-hover p-6 bg-gradient-to-br from-info/5 to-blue-500/5 border-2 border-info/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-info/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-info/10 rounded-xl">
                        <Target className="w-6 h-6 text-info" />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">Lessons Completed</p>
                    </div>
                    <p className="text-foreground text-3xl font-bold">{user?.progress.completed}/{user?.progress.total}</p>
                  </div>
                </div>
               
                <div className="ios-card-hover p-6 bg-gradient-to-br from-warning/5 to-orange-500/5 border-2 border-warning/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-warning/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-warning/10 rounded-xl">
                        <TrendingUp className="w-6 h-6 text-warning" />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">Average Score</p>
                    </div>
                    <p className="text-foreground text-3xl font-bold">
                      {user?.examScores.length
                        ? Math.round(
                            user.examScores.reduce((acc, curr) => acc + curr.score, 0) /
                              user.examScores.length
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}