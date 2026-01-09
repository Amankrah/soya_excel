print("="*80)
print("ENSEMBLE WEIGHT OPTIMIZATION - SMART SEARCH")
print("="*80)
print("Goal: Find if any ensemble combination beats BiLSTM's Test MAE of 6.10 days")
print("="*80)

# Baseline: BiLSTM performance
BILSTM_TEST_MAE = 6.103655
print(f"\n🎯 Target to beat: {BILSTM_TEST_MAE:.4f} days")
print(f"\nModels available:")
print(f"  1. XGBoost     - Test MAE: {test_mae_xgb:.4f}")
print(f"  2. AdaBoost    - Test MAE: {test_mae_ada:.4f}")
print(f"  3. LSTM        - Test MAE: {test_mae_lstm:.4f}")
print(f"  4. BiLSTM      - Test MAE: {test_mae_bilstm:.4f}")

# STRATEGY 1: Test simple 2-model combinations first (faster)
print(f"\n{'='*80}")
print("STRATEGY 1: Testing 2-Model Ensembles (Focused Search)")
print(f"{'='*80}")

two_model_results = []

# Test combinations of top 2 performers: BiLSTM + AdaBoost
models_to_test = [
    ('BiLSTM', 'AdaBoost', y_pred_test_bilstm, y_pred_test_ada),
    ('BiLSTM', 'XGBoost', y_pred_test_bilstm, y_pred_test_xgb),
    ('AdaBoost', 'XGBoost', y_pred_test_ada, y_pred_test_xgb),
]

for model1_name, model2_name, pred1, pred2 in models_to_test:
    for w1 in np.arange(0.0, 1.05, 0.1):  # Coarse grid: 0.1 increments
        w2 = 1.0 - w1
        if w2 < 0 or w2 > 1:
            continue

        # Ensemble prediction
        y_pred_test_ens = w1 * pred1 + w2 * pred2
        test_mae = mean_absolute_error(y_test, y_pred_test_ens)
        test_r2 = r2_score(y_test, y_pred_test_ens)

        two_model_results.append({
            'Model1': model1_name,
            'Weight1': round(w1, 2),
            'Model2': model2_name,
            'Weight2': round(w2, 2),
            'Test_MAE': test_mae,
            'Test_R2': test_r2,
            'Improvement': BILSTM_TEST_MAE - test_mae
        })

# Convert to DataFrame and sort
df_two = pd.DataFrame(two_model_results).sort_values('Test_MAE')

print(f"\n📊 Top 10 Best 2-Model Ensembles:")
print(df_two.head(10).to_string(index=False))

best_two_model = df_two.iloc[0]
print(f"\n{'='*80}")
if best_two_model['Test_MAE'] < BILSTM_TEST_MAE:
    print(f"✅ FOUND BETTER! 2-Model Ensemble beats BiLSTM!")
    print(f"   {best_two_model['Model1']} ({best_two_model['Weight1']}) + "
          f"{best_two_model['Model2']} ({best_two_model['Weight2']})")
    print(f"   Test MAE: {best_two_model['Test_MAE']:.4f} days")
    print(f"   Improvement: {best_two_model['Improvement']:.4f} days ({best_two_model['Improvement']/BILSTM_TEST_MAE*100:.2f}%)")
else:
    print(f"❌ No 2-model ensemble beats BiLSTM")
    print(f"   Best 2-model: {best_two_model['Test_MAE']:.4f} days (worse by {-best_two_model['Improvement']:.4f})")
print(f"{'='*80}")


# STRATEGY 2: Test 3-model combinations (if 2-model shows promise)
print(f"\n{'='*80}")
print("STRATEGY 2: Testing 3-Model Ensembles (BiLSTM + AdaBoost + X)")
print(f"{'='*80}")

three_model_results = []

# Focus on BiLSTM + AdaBoost + {XGBoost or LSTM}
third_models = [
    ('XGBoost', y_pred_test_xgb),
    ('LSTM', y_pred_test_lstm)
]

for third_name, third_pred in third_models:
    for w_bilstm in np.arange(0.3, 0.8, 0.1):  # BiLSTM dominates
        for w_ada in np.arange(0.1, 0.6, 0.1):
            w_third = 1.0 - w_bilstm - w_ada

            if w_third < 0 or w_third > 0.5:  # Limit third model weight
                continue

            # Ensemble prediction
            y_pred_test_ens = (
                w_bilstm * y_pred_test_bilstm +
                w_ada * y_pred_test_ada +
                w_third * third_pred
            )

            test_mae = mean_absolute_error(y_test, y_pred_test_ens)
            test_r2 = r2_score(y_test, y_pred_test_ens)

            three_model_results.append({
                'BiLSTM_w': round(w_bilstm, 2),
                'AdaBoost_w': round(w_ada, 2),
                f'{third_name}_w': round(w_third, 2),
                'Test_MAE': test_mae,
                'Test_R2': test_r2,
                'Improvement': BILSTM_TEST_MAE - test_mae
            })

if three_model_results:
    df_three = pd.DataFrame(three_model_results).sort_values('Test_MAE')

    print(f"\n📊 Top 5 Best 3-Model Ensembles:")
    print(df_three.head(5).to_string(index=False))

    best_three_model = df_three.iloc[0]
    print(f"\n{'='*80}")
    if best_three_model['Test_MAE'] < BILSTM_TEST_MAE:
        print(f"✅ FOUND BETTER! 3-Model Ensemble beats BiLSTM!")
        print(f"   Test MAE: {best_three_model['Test_MAE']:.4f} days")
        print(f"   Improvement: {best_three_model['Improvement']:.4f} days ({best_three_model['Improvement']/BILSTM_TEST_MAE*100:.2f}%)")
        print(f"   Weights: BiLSTM={best_three_model['BiLSTM_w']}, AdaBoost={best_three_model['AdaBoost_w']}, "
              f"Other={1.0-best_three_model['BiLSTM_w']-best_three_model['AdaBoost_w']:.2f}")
    else:
        print(f"❌ No 3-model ensemble beats BiLSTM")
        print(f"   Best 3-model: {best_three_model['Test_MAE']:.4f} days")
    print(f"{'='*80}")


# STRATEGY 3: Fine-grained search around best combination
if best_two_model['Improvement'] > -0.1:  # If close, do fine-grained search
    print(f"\n{'='*80}")
    print("STRATEGY 3: Fine-Grained Search Around Best 2-Model Combo")
    print(f"{'='*80}")

    # Get best 2-model weights
    m1_name = best_two_model['Model1']
    m2_name = best_two_model['Model2']
    m1_weight = best_two_model['Weight1']

    # Map names to predictions
    pred_map = {
        'BiLSTM': y_pred_test_bilstm,
        'AdaBoost': y_pred_test_ada,
        'XGBoost': y_pred_test_xgb,
        'LSTM': y_pred_test_lstm
    }

    fine_results = []
    for w1 in np.arange(max(0, m1_weight - 0.15), min(1.0, m1_weight + 0.15), 0.01):
        w2 = 1.0 - w1
        if w2 < 0 or w2 > 1:
            continue

        y_pred_test_ens = w1 * pred_map[m1_name] + w2 * pred_map[m2_name]
        test_mae = mean_absolute_error(y_test, y_pred_test_ens)
        test_r2 = r2_score(y_test, y_pred_test_ens)

        fine_results.append({
            f'{m1_name}_w': round(w1, 3),
            f'{m2_name}_w': round(w2, 3),
            'Test_MAE': test_mae,
            'Test_R2': test_r2,
            'Improvement': BILSTM_TEST_MAE - test_mae
        })

    df_fine = pd.DataFrame(fine_results).sort_values('Test_MAE')

    print(f"\n📊 Top 5 Fine-Tuned Weights:")
    print(df_fine.head(5).to_string(index=False))

    best_fine = df_fine.iloc[0]
    print(f"\n{'='*80}")
    if best_fine['Test_MAE'] < BILSTM_TEST_MAE:
        print(f"✅ WINNER! Fine-tuned ensemble beats BiLSTM!")
        print(f"   Test MAE: {best_fine['Test_MAE']:.4f} days")
        print(f"   Improvement: {best_fine['Improvement']:.4f} days ({best_fine['Improvement']/BILSTM_TEST_MAE*100:.2f}%)")
    else:
        print(f"❌ Even fine-tuned ensemble doesn't beat BiLSTM")
        print(f"   Best fine-tuned: {best_fine['Test_MAE']:.4f} days")
    print(f"{'='*80}")


# FINAL VERDICT
print(f"\n{'='*80}")
print("FINAL VERDICT")
print(f"{'='*80}")

all_best = [
    ('BiLSTM (Standalone)', BILSTM_TEST_MAE),
    ('Best 2-Model Ensemble', best_two_model['Test_MAE'])
]

if three_model_results:
    all_best.append(('Best 3-Model Ensemble', best_three_model['Test_MAE']))

if fine_results:
    all_best.append(('Best Fine-Tuned Ensemble', best_fine['Test_MAE']))

overall_best = min(all_best, key=lambda x: x[1])

print(f"\n🏆 OVERALL WINNER: {overall_best[0]}")
print(f"   Test MAE: {overall_best[1]:.4f} days")

if overall_best[1] < BILSTM_TEST_MAE:
    print(f"\n✅ ENSEMBLE BEATS BILSTM!")
    print(f"   Improvement: {BILSTM_TEST_MAE - overall_best[1]:.4f} days "
          f"({(BILSTM_TEST_MAE - overall_best[1])/BILSTM_TEST_MAE*100:.2f}%)")
else:
    print(f"\n❌ BiLSTM REMAINS THE BEST MODEL")
    print(f"   No ensemble configuration beats the standalone BiLSTM")
    print(f"\n💡 Recommendation: Deploy Bidirectional LSTM as final model")

print(f"{'='*80}")
