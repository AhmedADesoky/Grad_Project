📝 English Writing Coach

AI-Powered Web Platform for Writing Improvement

Graduation Project – Data Science & Artificial Intelligence (DSAI)
Zewail City University of Science and Technology

📌 Project Overview

English Writing Coach is an AI-powered web platform designed to help users improve their English writing skills through automatic proficiency assessment, personalized feedback, and progress tracking.

The system classifies user-written text into CEFR levels (A1–C2) and provides intelligent feedback and learning recommendations using state-of-the-art NLP models.

🎯 Objectives

Automatically classify English writing proficiency (A1–C2)

Provide meaningful AI-generated feedback beyond grammar correction

Track user progress visually over time

Build a scalable, real-world AI-powered web application

🚀 Current Progress (Phase 1)
✅ Completed Work

Dataset merging and preprocessing using UniversalCEFR

Feature engineering and readability analysis using TextStat

Initial experimentation with nature-inspired optimization techniques:

Ant Colony Optimization (feature extraction)

Hill Climbing

Simulated Annealing

Tabu Search

Particle Swarm Optimization (PSO)

Fine-tuning and evaluation of BERT and DistilBERT

Achieved ~59% accuracy on merged dataset

Improved generalization without overfitting

Training & validation performance visualized using:

Accuracy/Loss curves

Interactive visualizations

🧠 Models Used

BERT – CEFR text classification

DistilBERT – Lightweight and faster alternative

TextStat – Readability and linguistic feature extraction

📊 Results Summary
Model	Dataset	Accuracy	Overfitting
BERT	Merged CEFR	~59%	❌ No
DistilBERT	Merged CEFR	~59%	❌ No

✔ Stable validation curves
✔ Improved generalization
✔ No significant overfitting observed

🗂 Dataset

UniversalCEFR Dataset
Annotated English texts labeled with CEFR levels (A1–C2)

Preprocessing Steps

Text cleaning & normalization

Class balancing

Train / validation / test split

Dataset merging for robustness

🧱 System Architecture (Planned)

Frontend: React

Backend: Node.js (Authentication & Logic)

AI Backend: Django + Python

Database: MongoDB

Models: BERT / DistilBERT / GPT-based feedback

Deployment: Docker & Kubernetes

👥 Team Members
Name	Role
Fares Wael Atef	Data Scientist & Frontend Developer
Ahmed Abdelsamad	AI Backend Developer
Abdelrhman Hisham	Frontend Developer
Ahmed Sameh	Backend & DevOps Engineer

Supervisors

Dr. Mohamed samy

Eng. Rana Abdelfattah

📈 Future Work

Improve classification accuracy (target ≥ 90%)

Integrate GPT-based personalized feedback

Full-stack system integration

User dashboard and progress analytics

Deployment and performance optimization

🛠 How to Run (Phase 1 – Models)
# Clone repository
git clone https://github.com/AhmedADesoky/Grad_Project.git
cd Grad_Project

# Install requirements
pip install -r requirements.txt

# Run notebooks / scripts
jupyter notebook

📎 Repository Structure (Example)
├── data/
│   ├── raw/
│   ├── processed/
├── notebooks/
│   ├── EDA.ipynb
│   ├── BERT_training.ipynb
├── models/
├── visualizations/
├── backend/
├── frontend/
├── README.md

📚 References

UniversalCEFR Dataset – Hugging Face

Devlin et al., BERT: Pre-training of Deep Bidirectional Transformers, 2019

Sanh et al., DistilBERT, 2019

📌 License

This project is developed as part of a Graduation Project at
Zewail City University of Science and Technology.
