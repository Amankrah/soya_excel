# PowerShell script to create Windows Task Scheduler task
# Run this as Administrator

$taskName = "SoyaExcel_PredictionUpdate"
$description = "Daily update of client reorder predictions"
$batchFile = "C:\Users\Windows\Desktop\Dev_Projects\soya_excel\backend\run_predictions.bat"

# Create task action
$action = New-ScheduledTaskAction -Execute "$batchFile"

# Create trigger (daily at 6 AM)
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register task
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description $description -Force
    Write-Host "✅ Task '$taskName' created successfully!" -ForegroundColor Green
    Write-Host "   Schedule: Daily at 6:00 AM" -ForegroundColor Cyan
    Write-Host "   Action: Update predictions and sync ALIX data" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To verify: Open Task Scheduler and look for '$taskName'" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Error creating task: $_" -ForegroundColor Red
    Write-Host "   Make sure you're running PowerShell as Administrator" -ForegroundColor Yellow
}
