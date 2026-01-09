@echo off
REM Prediction Update Batch Script
REM Generated automatically

cd /d "C:\Users\Windows\Desktop\Dev_Projects\soya_excel\backend"
"C:\Users\Windows\AppData\Local\Programs\Python\Python313\python.exe" manage.py update_predictions >> logs\predictions.log 2>&1

REM Also sync ALIX data and update predictions
"C:\Users\Windows\AppData\Local\Programs\Python\Python313\python.exe" manage.py sync_alix_data --update-predictions >> logs\alix_sync.log 2>&1
