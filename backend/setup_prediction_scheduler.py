"""
Automated Prediction Scheduler Setup
Supports Windows Task Scheduler and Linux Cron
"""

import os
import sys
import platform
from pathlib import Path

# Fix Windows console encoding
if platform.system() == "Windows":
    sys.stdout.reconfigure(encoding='utf-8')

# Get absolute paths
BACKEND_DIR = Path(__file__).resolve().parent
MANAGE_PY = BACKEND_DIR / "manage.py"
PYTHON_EXE = sys.executable


def setup_windows_task_scheduler():
    """
    Generate Windows Task Scheduler XML and PowerShell script
    """
    print("\n" + "="*80)
    print("WINDOWS TASK SCHEDULER SETUP")
    print("="*80)

    # Create batch file for running predictions
    batch_file = BACKEND_DIR / "run_predictions.bat"
    batch_content = f"""@echo off
REM Prediction Update Batch Script
REM Generated automatically

cd /d "{BACKEND_DIR}"
"{PYTHON_EXE}" manage.py update_predictions >> logs\\predictions.log 2>&1

REM Also sync ALIX data and update predictions
"{PYTHON_EXE}" manage.py sync_alix_data --update-predictions >> logs\\alix_sync.log 2>&1
"""

    with open(batch_file, 'w', encoding='utf-8') as f:
        f.write(batch_content)

    print(f"\n✅ Created batch script: {batch_file}")

    # Create logs directory if it doesn't exist
    logs_dir = BACKEND_DIR / "logs"
    logs_dir.mkdir(exist_ok=True)
    print(f"✅ Created logs directory: {logs_dir}")

    # Create PowerShell script for easy Task Scheduler setup
    ps_script = BACKEND_DIR / "setup_task_scheduler.ps1"
    ps_content = f"""# PowerShell script to create Windows Task Scheduler task
# Run this as Administrator

$taskName = "SoyaExcel_PredictionUpdate"
$description = "Daily update of client reorder predictions"
$batchFile = "{batch_file}"

# Create task action
$action = New-ScheduledTaskAction -Execute "$batchFile"

# Create trigger (daily at 6 AM)
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register task
try {{
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description $description -Force
    Write-Host "✅ Task '$taskName' created successfully!" -ForegroundColor Green
    Write-Host "   Schedule: Daily at 6:00 AM" -ForegroundColor Cyan
    Write-Host "   Action: Update predictions and sync ALIX data" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To verify: Open Task Scheduler and look for '$taskName'" -ForegroundColor Yellow
}} catch {{
    Write-Host "❌ Error creating task: $_" -ForegroundColor Red
    Write-Host "   Make sure you're running PowerShell as Administrator" -ForegroundColor Yellow
}}
"""

    with open(ps_script, 'w', encoding='utf-8') as f:
        f.write(ps_content)

    print(f"✅ Created PowerShell setup script: {ps_script}")

    print("\n" + "="*80)
    print("NEXT STEPS:")
    print("="*80)
    print("\n1. Open PowerShell as Administrator")
    print(f"2. Run: cd \"{BACKEND_DIR}\"")
    print("3. Run: .\\setup_task_scheduler.ps1")
    print("\n4. Alternatively, manually create task:")
    print("   - Open Task Scheduler")
    print("   - Create Basic Task")
    print("   - Name: SoyaExcel_PredictionUpdate")
    print("   - Trigger: Daily at 6:00 AM")
    print(f"   - Action: Start a Program -> {batch_file}")
    print("\n" + "="*80)


def setup_linux_cron():
    """
    Generate Linux cron job setup instructions
    """
    print("\n" + "="*80)
    print("LINUX CRON SETUP")
    print("="*80)

    cron_command = f"0 6 * * * cd {BACKEND_DIR} && {PYTHON_EXE} manage.py update_predictions >> {BACKEND_DIR}/logs/predictions.log 2>&1"

    # Create logs directory
    logs_dir = BACKEND_DIR / "logs"
    logs_dir.mkdir(exist_ok=True)

    # Create shell script
    shell_script = BACKEND_DIR / "run_predictions.sh"
    shell_content = f"""#!/bin/bash
# Prediction Update Shell Script
# Generated automatically

cd "{BACKEND_DIR}"
{PYTHON_EXE} manage.py update_predictions >> logs/predictions.log 2>&1

# Also sync ALIX data and update predictions
{PYTHON_EXE} manage.py sync_alix_data --update-predictions >> logs/alix_sync.log 2>&1
"""

    with open(shell_script, 'w', encoding='utf-8') as f:
        f.write(shell_content)

    # Make executable
    os.chmod(shell_script, 0o755)

    print(f"\n✅ Created shell script: {shell_script}")
    print(f"✅ Created logs directory: {logs_dir}")

    print("\n" + "="*80)
    print("NEXT STEPS:")
    print("="*80)
    print("\n1. Option A - Add to crontab:")
    print("   crontab -e")
    print(f"   Add line: {cron_command}")
    print("\n2. Option B - Use shell script:")
    print("   crontab -e")
    print(f"   Add line: 0 6 * * * {shell_script}")
    print("\n3. Verify cron job:")
    print("   crontab -l")
    print("\n" + "="*80)


def setup_django_crontab():
    """
    Setup instructions for django-crontab
    """
    print("\n" + "="*80)
    print("DJANGO-CRONTAB SETUP (Recommended)")
    print("="*80)

    settings_addition = """
# Add to settings.py:

INSTALLED_APPS = [
    ...
    'django_crontab',
]

CRONJOBS = [
    # Update predictions daily at 6 AM
    ('0 6 * * *', 'django.core.management.call_command', ['update_predictions']),

    # Sync ALIX data and update predictions daily at 5:30 AM
    ('30 5 * * *', 'django.core.management.call_command', ['sync_alix_data', '--update-predictions']),
]
"""

    readme_file = BACKEND_DIR / "SCHEDULER_SETUP.md"
    readme_content = f"""# Prediction Scheduler Setup

## Option 1: Django-Crontab (Recommended for Linux)

1. Install django-crontab:
   ```bash
   pip install django-crontab
   ```

2. Add to `settings.py`:
   ```python{settings_addition}   ```

3. Activate cron jobs:
   ```bash
   python manage.py crontab add
   ```

4. Verify:
   ```bash
   python manage.py crontab show
   ```

## Option 2: Windows Task Scheduler

1. Run PowerShell as Administrator
2. Navigate to backend directory:
   ```powershell
   cd {BACKEND_DIR}
   ```
3. Run setup script:
   ```powershell
   .\\setup_task_scheduler.ps1
   ```

## Option 3: Linux Cron (Manual)

1. Edit crontab:
   ```bash
   crontab -e
   ```

2. Add this line:
   ```
   0 6 * * * cd {BACKEND_DIR} && {PYTHON_EXE} manage.py update_predictions >> {BACKEND_DIR}/logs/predictions.log 2>&1
   ```

3. Save and exit

## Monitoring

Check logs:
- Windows: `{BACKEND_DIR}\\logs\\predictions.log`
- Linux: `{BACKEND_DIR}/logs/predictions.log`

Manual test:
```bash
python manage.py update_predictions --show-upcoming 7
```

Validation:
```bash
python manage.py validate_predictions
```

## Troubleshooting

If predictions aren't running:
1. Check cron is enabled: `sudo systemctl status cron` (Linux)
2. Check Task Scheduler service (Windows)
3. Verify Python path is correct
4. Check log files for errors
5. Test manually first: `python manage.py update_predictions`
"""

    with open(readme_file, 'w', encoding='utf-8') as f:
        f.write(readme_content)

    print(f"\n✅ Created setup documentation: {readme_file}")
    print(settings_addition)
    print("\nCommands:")
    print("   pip install django-crontab")
    print("   python manage.py crontab add")
    print("   python manage.py crontab show")
    print("\n" + "="*80)


def main():
    print("\n" + "="*80)
    print("SOYA EXCEL - PREDICTION SCHEDULER SETUP")
    print("="*80)

    system = platform.system()
    print(f"\nDetected OS: {system}")

    if system == "Windows":
        setup_windows_task_scheduler()
        print("\n💡 TIP: For cross-platform solution, consider django-crontab")
        setup_django_crontab()
    else:
        setup_linux_cron()
        setup_django_crontab()

    print("\n" + "="*80)
    print("✅ SETUP COMPLETE")
    print("="*80)
    print("\n📖 Full instructions saved to: SCHEDULER_SETUP.md")
    print("\n🧪 Test the pipeline:")
    print("   python manage.py validate_predictions")
    print("\n🚀 Manual run:")
    print("   python manage.py update_predictions")
    print("\n" + "="*80 + "\n")


if __name__ == "__main__":
    main()
