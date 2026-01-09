# XGBoost Optimization Guide for Reorder Prediction Model

## Current Setup Analysis

Your notebook has TWO XGBoost configurations:

### 1. **XGBoost V1** (First version - Cell ~30)
```python
param_grid_xgb = {
    'n_estimators': [100, 200, 300],
    'max_depth': [3, 5, 7, 10],
    'learning_rate': [0.01, 0.05, 0.1],
    'subsample': [0.8, 0.9, 1.0],
    'colsample_bytree': [0.8, 0.9, 1.0]
}
```

**Problems:**
- ❌ Grid size: 3×4×3×3×3 = **324 combinations** (with 5-fold CV = **1,620 models**)
- ❌ `max_depth=10` is TOO DEEP for 2,772 samples → overfitting risk
- ❌ `learning_rate=0.01` is too slow
- ❌ Missing regularization parameters
- ❌ Training time: **30-45 minutes**

---

### 2. **XGBoost V2** (Second version - Cell ~43)
```python
param_grid_xgb_v2 = {
    'n_estimators': [100, 200],
    'max_depth': [3, 4, 5],
    'learning_rate': [0.05, 0.1, 0.15],
    'subsample': [0.6, 0.7, 0.8],
    'colsample_bytree': [0.6, 0.7, 0.8],
    'min_child_weight': [3, 5, 7],
    'gamma': [0, 0.1, 0.5],
    'reg_alpha': [0, 0.01, 0.1],
    'reg_lambda': [1.0, 5.0, 10.0]
}
```

**Problems:**
- ❌ Grid size: 2×3×3×3×3×3×3×3×3 = **13,122 combinations!!!**
- ❌ Training time: **HOURS** (possibly 2-4 hours)
- ❌ Way too many hyperparameters to tune at once

---

## RECOMMENDED OPTIMIZED SETUP

### **Option A: Quick & Effective (Recommended)**

Replace XGBoost V1 with this:

```python
print("\n" + "="*60)
print("Training XGBoost - Optimized for Your Dataset...")
print("="*60)

# OPTIMIZED grid for 2,772 samples
param_grid_xgb = {
    'n_estimators': [200, 300],           # Good range
    'max_depth': [3, 4, 5],               # Prevent overfitting
    'learning_rate': [0.05, 0.1],         # Removed slow 0.01
    'min_child_weight': [3, 5],           # Regularization
    'subsample': [0.7, 0.8],              # Sample rows
    'colsample_bytree': [0.7, 0.8],       # Sample features
    'gamma': [0, 0.1],                    # Split threshold
    'reg_lambda': [1.0, 2.0]              # L2 regularization
}

# Grid size: 2×3×2×2×2×2×2×2 = 384 combinations (manageable!)
print(f"Grid search: {2*3*2*2*2*2*2*2} combinations × 3-fold CV = {2*3*2*2*2*2*2*2*3} models")
print("Estimated time: ~15-20 minutes\n")

# Initialize with optimizations
xgb_model = xgb.XGBRegressor(
    random_state=42,
    n_jobs=-1,
    objective='reg:squarederror',
    tree_method='hist',  # Faster for medium datasets
    early_stopping_rounds=10
)

# Use 3-fold CV instead of 5-fold (faster, still robust with 2,772 samples)
grid_search_xgb = GridSearchCV(
    xgb_model,
    param_grid_xgb,
    cv=3,  # Changed from 5
    scoring='neg_mean_absolute_error',
    n_jobs=-1,
    verbose=2,
    return_train_score=True  # Monitor overfitting
)

# Train with early stopping
grid_search_xgb.fit(
    X_train, 
    y_train,
    eval_set=[(X_train, y_train)],
    verbose=False
)

best_xgb = grid_search_xgb.best_estimator_
print(f"\n{'='*60}")
print("Best Parameters:")
print(f"{'='*60}")
for param, value in grid_search_xgb.best_params_.items():
    print(f"  {param:<20}: {value}")
print(f"\nBest CV Score (MAE): {-grid_search_xgb.best_score_:.2f} days")
print(f"{'='*60}")
```

**Benefits:**
- ✅ Grid size: **384 combinations** (down from 324 or 13,122)
- ✅ Training time: **~15-20 minutes** (down from 30-45 min or hours)
- ✅ Better regularization (prevents overfitting)
- ✅ 3-fold CV (faster, still robust with 2,772 samples)
- ✅ Early stopping (saves time)
- ✅ `tree_method='hist'` (faster for your data size)

---

### **Option B: Two-Stage Tuning (If you have time)**

**Stage 1: Coarse Search** (5-10 minutes)
```python
param_grid_coarse = {
    'n_estimators': [200, 300],
    'max_depth': [3, 4, 5],
    'learning_rate': [0.05, 0.1],
    'subsample': [0.7, 0.8],
}
# 2×3×2×2 = 24 combinations
```

**Stage 2: Fine-tune around best from Stage 1** (10-15 minutes)
```python
# Use best params from stage 1, vary regularization
param_grid_fine = {
    'n_estimators': [best_n_estimators - 50, best_n_estimators, best_n_estimators + 50],
    'max_depth': [best_depth],
    'learning_rate': [best_lr],
    'min_child_weight': [1, 3, 5],
    'gamma': [0, 0.05, 0.1],
    'reg_lambda': [1.0, 2.0, 3.0]
}
```

---

## FOR YOUR XGBoost V2 (Cell ~43)

**Current V2 has 13,122 combinations - WAY TOO MANY!**

Replace with this **drastically reduced** grid:

```python
print("\n" + "="*80)
print("XGBOOST V2 - SMARTLY REGULARIZED")
print("="*80)

# MUCH smaller, focused grid
param_grid_xgb_v2 = {
    'n_estimators': [250, 300],              # Narrowed
    'max_depth': [3, 4],                     # Reduced from [3, 4, 5]
    'learning_rate': [0.08, 0.1],            # Narrowed around optimal
    'subsample': [0.7, 0.8],                 # Reduced from 3 values
    'colsample_bytree': [0.7, 0.8],          # Reduced from 3 values
    'min_child_weight': [3, 5],              # Reduced from [3, 5, 7]
    'gamma': [0.05, 0.1],                    # Reduced from [0, 0.1, 0.5]
    'reg_alpha': [0, 0.05],                  # Reduced from [0, 0.01, 0.1]
    'reg_lambda': [1.5, 2.0]                 # Reduced from [1.0, 5.0, 10.0]
}

# Grid size: 2×2×2×2×2×2×2×2×2 = 512 combinations (manageable!)
print(f"Grid search: 512 combinations × 3-fold CV = 1,536 models")
print("Estimated time: ~20-25 minutes\n")

xgb_model_v2 = xgb.XGBRegressor(
    random_state=42,
    n_jobs=-1,
    objective='reg:squarederror',
    tree_method='hist',
    early_stopping_rounds=10
)

grid_search_xgb_v2 = GridSearchCV(
    xgb_model_v2,
    param_grid_xgb_v2,
    cv=3,  # Changed from 5
    scoring='neg_mean_absolute_error',
    n_jobs=-1,
    verbose=2
)

print("Starting smart grid search...")
grid_search_xgb_v2.fit(
    X_train, 
    y_train,
    eval_set=[(X_train, y_train)],
    verbose=False
)
```

**Benefits:**
- ✅ Grid size: **512 combinations** (down from 13,122!)
- ✅ Training time: **~20-25 minutes** (down from 2-4 hours!)
- ✅ Still explores all important regularization parameters
- ✅ Values focused around typical optimal ranges

---

## COMPARISON TABLE

| Version | Grid Size | CV Folds | Total Models | Est. Time | Status |
|---------|-----------|----------|--------------|-----------|---------|
| **Current V1** | 324 | 5 | 1,620 | 30-45 min | ⚠️ Too deep trees |
| **Current V2** | 13,122 | 5 | 65,610 | 2-4 hours | ❌ WAY TOO MANY |
| **Optimized V1** | 384 | 3 | 1,152 | 15-20 min | ✅ RECOMMENDED |
| **Optimized V2** | 512 | 3 | 1,536 | 20-25 min | ✅ BEST OVERALL |

---

## KEY INSIGHTS FOR YOUR DATA

**Dataset size: 2,772 training samples, 17 features**

### Optimal Ranges:
- ✅ `max_depth`: 3-5 (not 7 or 10 - too deep!)
- ✅ `n_estimators`: 200-300 (diminishing returns after 300)
- ✅ `learning_rate`: 0.05-0.1 (0.01 is too slow for grid search)
- ✅ `min_child_weight`: 3-5 (at least 3 samples per leaf)
- ✅ `subsample`: 0.7-0.8 (regularization through row sampling)
- ✅ `colsample_bytree`: 0.7-0.8 (regularization through feature sampling)

### What to Avoid:
- ❌ `max_depth` > 5 (overfitting with 2,772 samples)
- ❌ More than 500 grid combinations (diminishing returns vs time)
- ❌ 5-fold CV when 3-fold is sufficient (your dataset is large enough)
- ❌ Tuning 9+ hyperparameters simultaneously (combinatorial explosion)

---

## IMPLEMENTATION STEPS

1. **Replace XGBoost V1** (Cell ~30) with "Optim ized V1" code above
2. **Replace XGBoost V2** (Cell ~43) with "Optimized V2" code above
3. **Run and compare** - V2 should give you the best results
4. **Expected outcome**:
   - Test MAE: ~7-9 days
   - MAE Gap (Train-Test): <3 days (good generalization)
   - Training time: Total ~35-45 minutes for both

---

## QUICK WINS

If you want results **NOW** (fastest option):

```python
# Use this single, hand-tuned configuration (no grid search!)
best_xgb = xgb.XGBRegressor(
    n_estimators=250,
    max_depth=4,
    learning_rate=0.1,
    min_child_weight=3,
    subsample=0.8,
    colsample_bytree=0.8,
    gamma=0.1,
    reg_lambda=2.0,
    random_state=42,
    n_jobs=-1,
    objective='reg:squarederror',
    tree_method='hist'
)

best_xgb.fit(X_train, y_train)
# Training time: ~2-3 minutes (no grid search!)
```

This uses empirically good values for a dataset of your size and should give you competitive results in **minutes** instead of 30+ minutes.

---

## SUMMARY RECOMMENDATION

**For best balance of performance vs time:**

1. ✅ **Use Optimized V2** (512 combinations, ~20-25 min)
   - Best regularization
   - Prevents overfitting
   - Production-ready

2. ⚡ **OR use Quick Win** (no grid search, ~3 min)
   - If you're iterating quickly
   - Good baseline results
   - Can always fine-tune later

3. ❌ **Avoid Current V2** (13,122 combinations)
   - Not worth the 2-4 hour wait
   - Marginal improvement over Optimized V2

---

**Questions? Check your results:**
- If MAE Gap > 3 days → Increase regularization (gamma, reg_lambda)
- If Test MAE > 10 days → Try deeper trees (max_depth=5) or more features
- If Training is too slow → Reduce grid size further or use Quick Win

**Good luck! 🚀**

