@echo off
echo ============================================================
echo Starting AI_Backend Django Server
echo ============================================================
cd Backend\AI_Backend
call .venv\Scripts\activate.bat
python manage.py runserver 8000
