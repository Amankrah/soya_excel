# Stale Predictions - Problem & Solution

## Problem Discovery

When running `python manage.py update_predictions`, we observed:
- **103 successful** predictions updated
- **70 failed** predictions
- **74 skipped** (insufficient data - less than 3 total orders)
- **Total in UI: 173 clients** with predictions

**The Math:** 103 + 70 = 173 ✓

## Root Cause

The 70 "failed" clients have **stale predictions** - old predictions that can no longer be updated because:

1. **Client ordering pattern changed**: They used to order small/medium quantities (≤10 tonnes) and got predictions during that time
2. **Now order in bulk**: Their recent orders are all >10 tonnes
3. **Model can't predict bulk**: The XGBoost model was trained only on small/medium order patterns
4. **Prediction remains in database**: The old prediction stays there but can't be refreshed

### Examples of Stale Predictions

- **5 MILE FARMS INC CAD**: 3 total orders, 0 small/medium orders → Last prediction: 2026-01-01
- **ACEITES DE SEMILLAS S.A.**: 10 total orders, 0 small/medium orders → Last prediction: 2026-01-01
- **AGRICOMAX**: 17 total orders, 0 small/medium orders → Last prediction: 2026-01-01

All stale predictions are from the same date (2026-01-01 17:11), showing they were valid at that time but are now outdated.

## Solution Implemented: AUTO-CLEAR ON UPDATE

### How It Works

When running prediction updates with the `--clear-stale` flag:

```bash
python manage.py update_predictions --clear-stale
```

The system will:
1. ✅ **Update** predictions for clients that still qualify (≥3 small/medium orders)
2. 🗑️ **Clear** predictions for clients that no longer qualify (shifted to bulk orders)
3. ⏭️ **Skip** clients with insufficient data (<3 total orders)

### Benefits

1. **Automatic maintenance**: No manual intervention needed
2. **Always accurate**: UI shows only clients who currently qualify for predictions
3. **Self-cleaning**: Database stays clean without accumulating outdated data
4. **Transparent**: Shows how many predictions were cleared in the output

### Code Changes

**File: `backend/clients/management/commands/update_predictions.py`**
- Added `--clear-stale` command argument
- Displays count of cleared stale predictions
- Shows appropriate messages based on whether auto-clear is enabled

**File: `backend/clients/services/prediction_service.py`**
- Added `clear_stale` parameter to `update_all_predictions()`
- When a prediction fails to update AND client had a previous prediction:
  - Clears all prediction fields: `predicted_next_order_days`, `predicted_next_order_date`, `prediction_confidence_lower`, `prediction_confidence_upper`, `last_prediction_update`
  - Increments `cleared_stale` counter
  - Logs the action

### Expected Results After Running with --clear-stale

**Before:**
- UI shows 173 clients (103 fresh + 70 stale)

**After:**
- UI shows 103 clients (only fresh predictions)
- 70 stale predictions cleared automatically
- Frontend will refresh to show accurate count

## Diagnostic Commands

### Test Individual Client
```bash
python manage.py test_client_prediction <client_id>
python manage.py test_client_prediction --name "Client Name"
```
Shows detailed breakdown of why a client can or cannot get predictions.

### Investigate Failed Predictions
```bash
python manage.py investigate_failed_predictions
python manage.py investigate_failed_predictions --show-all
```
Analyzes all clients with predictions and categorizes them as fresh vs stale.

### Update Predictions
```bash
# Normal update (keeps stale predictions)
python manage.py update_predictions

# Update with auto-clear (removes stale predictions)
python manage.py update_predictions --clear-stale

# Verbose mode (shows detailed failure info)
python manage.py update_predictions --verbose

# Combined flags
python manage.py update_predictions --clear-stale --verbose
```

## Alternative Approaches (Not Implemented)

### Option 1: Keep Stale Predictions
**Pros:** Shows "last known pattern", conservative approach
**Cons:** UI shows outdated data, confusing for users

### Option 2: Flag as Outdated
**Pros:** User sees prediction is outdated, preserves historical data
**Cons:** More complex UI, requires frontend changes, still shows questionable data

### Option 3: Auto-Clear (CHOSEN)
**Pros:** Clean, accurate, automatic, simple
**Cons:** Loses historical prediction data (but this is acceptable since it's no longer relevant)

## Frontend Impact

After running `python manage.py update_predictions --clear-stale`:

1. **Client count will decrease** from 173 to ~103
2. **Only clients with fresh predictions** will appear
3. **Backend filter** (already implemented) ensures only clients with `predicted_next_order_date != null` are shown
4. **UI info banner** already explains predictions are for small/medium order clients

No frontend code changes needed - the existing filtering handles this automatically.

## Recommendation for Production

Set up a scheduled task (cron job/Task Scheduler) to run:

```bash
python manage.py update_predictions --clear-stale
```

This ensures:
- Predictions stay fresh
- Stale predictions are automatically removed
- UI always shows accurate data
- No manual maintenance required

## Notes

### "Unknown error" Cases

Some clients show "Unknown error" as the failure reason despite having sufficient small/medium orders:
- **BOUCHARD 1761 INC**: 12 small/medium orders but still fails
- **BOURDON FEED & GRAIN INC**: 188 total orders, 3 small/medium orders but fails

These may have data quality issues or edge cases in the feature engineering. Investigation shows they likely have issues with:
- Date ranges (orders too far apart)
- Batch number conflicts
- Missing required fields for feature engineering

These are rare cases (~2 out of 70 failures) and will also be cleared with `--clear-stale`.
